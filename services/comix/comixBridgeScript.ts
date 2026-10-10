/**
 * comixBridgeScript.ts
 *
 * JS injected into the hidden Comix WebView (via
 * injectedJavaScriptBeforeContentLoaded, so it re-installs on every page
 * load).
 *
 * WHY THIS SHAPE
 * --------------
 * Comix rebuilt its frontend and dropped the old `env-*.js` chunk the previous
 * bridge imported. There is no longer any exported API object to call, and the
 * site's `/api/v1` responses are encrypted with a per-session `_=` signature
 * minted by an obfuscated bundle. Reimplementing that crypto is a per-build
 * roulette and would break on every deploy.
 *
 * So this bridge never talks to `/api/v1` itself. Instead it reads the data the
 * site ALREADY fetched and decrypted: React Query's in-memory cache. The site
 * renders every screen (search, chapter lists, chapter readers) from that cache,
 * so once a screen has loaded, the exact structured payload is sitting there.
 *
 * Flow from React Native:
 *   1. navigate the hidden WebView to the page that renders the data,
 *   2. `wait` for the cache entry to reach success (polling here),
 *   3. read a structured clone of it.
 *
 * The QueryClient is located by walking React's fiber tree from #app-root and
 * looking for a value exposing `getQueryCache()`.
 */

export const COMIX_BRIDGE_SCRIPT = `
(function () {
  try {
    if (window.__comixBridgeInstalled) return;
    window.__comixBridgeInstalled = true;

    var client = null;

    function post(msg) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        }
      } catch (err) {}
    }

    function rootFiber() {
      var node = document.getElementById('app-root');
      if (!node) return null;
      var ks = Object.keys(node);
      var key = null;
      for (var i = 0; i < ks.length; i++) {
        if (ks[i].indexOf('__reactContainer') === 0 || ks[i].indexOf('__reactFiber') === 0) { key = ks[i]; break; }
      }
      if (!key) return null;
      var f = node[key];
      if (f && f.current) f = f.current;
      return f;
    }

    function findClient() {
      if (client) return client;
      var start = rootFiber();
      if (!start) return null;
      var seen = new Set();
      var stack = [start];
      var guard = 0;
      while (stack.length && guard < 80000) {
        var f = stack.pop();
        if (!f || seen.has(f)) continue;
        seen.add(f); guard++;
        var mp = f.memoizedProps;
        if (mp && typeof mp === 'object') {
          var keys = Object.keys(mp);
          for (var i = 0; i < keys.length; i++) {
            var v = mp[keys[i]];
            if (v && typeof v === 'object' && typeof v.getQueryCache === 'function' && typeof v.getQueryData === 'function') {
              client = v;
              return client;
            }
          }
        }
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
      }
      return null;
    }

    function eq(a, b) {
      if (a === b) return true;
      try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }

    function matches(entry, spec) {
      var K = entry && entry.queryKey;
      if (!K || !Array.isArray(K) || !K.length) return false;
      if (spec.key) {
        if (K.length < spec.key.length) return false;
        for (var i = 0; i < spec.key.length; i++) { if (!eq(K[i], spec.key[i])) return false; }
      }
      if (spec.objKeys) {
        var idx = spec.key ? spec.key.length : 0;
        var o = K[idx];
        if (!o || typeof o !== 'object') return false;
        var ks = Object.keys(spec.objKeys);
        for (var j = 0; j < ks.length; j++) { if (!eq(o[ks[j]], spec.objKeys[ks[j]])) return false; }
      }
      return true;
    }

    function findEntries(spec, wantSuccess) {
      var c = findClient();
      if (!c) return [];
      var all = c.getQueryCache().getAll();
      var out = [];
      for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (!matches(e, spec)) continue;
        if (wantSuccess && (!e.state || e.state.status !== 'success' || e.state.data == null)) continue;
        out.push(e);
      }
      return out;
    }

    function pageOf(entry) {
      try {
        var K = entry.queryKey;
        var p = K[K.length - 1];
        return (p && typeof p === 'object' && typeof p.page === 'number') ? p.page : null;
      } catch (e) { return null; }
    }

    function readSpec(spec) {
      var entries = findEntries(spec, true);
      if (!entries.length) return null;
      var best = entries[0];
      for (var i = 1; i < entries.length; i++) {
        var a = pageOf(entries[i]);
        var b = pageOf(best);
        if (a != null && (b == null || a > b)) best = entries[i];
      }
      return best.state.data;
    }

    function clone(value) {
      if (value == null) return null;
      try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
    }

    function chaptersAll(hid, maxPages, timeoutMs) {
      return new Promise(function (resolve) {
        var start = Date.now();
        var items = [];
        var seen = {};
        var lastMeta = null;
        var stalls = 0;
        var rounds = 0;

        function harvest() {
          var entries = findEntries({ key: ['manga', 'chapters', hid] }, false);
          for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e.state || e.state.status !== 'success') continue;
            var d = e.state.data;
            if (!d || !d.items) continue;
            for (var j = 0; j < d.items.length; j++) {
              var it = d.items[j];
              if (!seen[it.id]) { seen[it.id] = 1; items.push(it); }
            }
            var pg = pageOf(e);
            if (d.meta && (lastMeta == null || (pg != null && pg >= (lastMeta.page || 0)))) lastMeta = d.meta;
          }
        }

        function nextBtn() {
          var p = document.querySelector('nav.npager');
          return p ? p.querySelector('button.npager__nav[aria-label="Next page"]') : null;
        }

        function done(reason) { resolve({ items: items, meta: lastMeta, reason: reason }); }

        function tick() {
          if (Date.now() - start > timeoutMs) return done('timeout');
          harvest();
          if (lastMeta && lastMeta.page && lastMeta.lastPage && lastMeta.page >= lastMeta.lastPage) return done('lastpage');
          var b = nextBtn();
          if (!b) return done('end');
          if (b.disabled || b.getAttribute('aria-disabled') === 'true' || /(^|\\s)disabled/.test(b.className || '')) return done('end');
          if (rounds >= maxPages) return done('maxpages');
          rounds++;
          var before = items.length;
          try { b.click(); } catch (e) { return done('clickfail'); }
          setTimeout(function () {
            harvest();
            if (items.length === before) { stalls++; } else { stalls = 0; }
            if (stalls >= 4) return done('stall');
            tick();
          }, 900);
        }

        var waited = 0;
        (function waitFirst() {
          harvest();
          var ok = findEntries({ key: ['manga', 'chapters', hid] }, true).length > 0;
          if (ok) return tick();
          waited += 400;
          if (waited > 15000) return done('nodata');
          setTimeout(waitFirst, 400);
        })();
      });
    }

    function handle(payload) {
      var id = payload && payload.id;
      var op = payload && payload.op;

      if (op === 'read') {
        var d = clone(readSpec(payload.spec || {}));
        post({ type: 'result', id: id, ok: d != null, data: d, error: d != null ? null : 'query not cached' });
        return;
      }

      if (op === 'wait') {
        var started = Date.now();
        var timeoutMs = payload.timeoutMs || 15000;
        (function poll() {
          var value = clone(readSpec(payload.spec || {}));
          if (value != null) { post({ type: 'result', id: id, ok: true, data: value }); return; }
          if (Date.now() - started > timeoutMs) { post({ type: 'result', id: id, ok: false, error: 'query not cached' }); return; }
          setTimeout(poll, 350);
        })();
        return;
      }

      if (op === 'chaptersAll') {
        chaptersAll(String(payload.hid), payload.maxPages || 40, payload.timeoutMs || 60000).then(function (res) {
          post({ type: 'result', id: id, ok: true, data: { items: res.items, meta: res.meta, reason: res.reason } });
        }, function (err) {
          post({ type: 'result', id: id, ok: false, error: String((err && err.message) || err) });
        });
        return;
      }

      post({ type: 'result', id: id, ok: false, error: 'Unknown Comix bridge op: ' + op });
    }

    window.__comixBridgeRequest = handle;

    function announce() { post({ type: 'installed', queryClient: !!findClient() }); }
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(announce, 500);
    else window.addEventListener('load', function () { setTimeout(announce, 500); });
  } catch (err) {}
})();
`;