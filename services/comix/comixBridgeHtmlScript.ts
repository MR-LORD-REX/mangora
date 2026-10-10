/**
 * comixBridgeHtmlScript.ts
 *
 * Second half of the script injected into the hidden Comix WebView. It adds a
 * same-origin HTML fetcher on top of the API bridge in comixBridgeScript.ts.
 *
 * Why: comix.to sits behind Cloudflare, which now answers plain HTTP requests
 * (including `/`) with a managed challenge - `403` + `Cf-Mitigated: challenge`
 * and a "Just a moment..." page. Only a real browser engine can clear it, so
 * the server-rendered pages (home feed, title page, browse vocabulary, reader
 * metadata) are fetched from inside the WebView that already cleared it, with
 * credentials, instead of from a plain fetch.
 *
 * Kept separate from the env-module script so it works independently: the API
 * bridge needs the site's `env-*.js` chunk, whereas this only needs `fetch`.
 */
export const COMIX_HTML_BRIDGE_SCRIPT = `
(function () {
  try {
    if (window.__comixBridgeHtmlInstalled) return;
    window.__comixBridgeHtmlInstalled = true;

    function post(msg) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        }
      } catch (err) {}
    }

    window.__comixBridgeHtmlRequest = function (payload) {
      var id = payload && payload.id;
      var target = payload && payload.path;
      Promise.resolve()
        .then(function () {
          return fetch(String(target), {
            credentials: 'include',
            headers: {
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });
        })
        .then(function (res) {
          if (!res.ok) {
            var err = new Error('HTTP ' + res.status);
            err.status = res.status;
            throw err;
          }
          return res.text();
        })
        .then(
          function (text) {
            post({ type: 'result', id: id, ok: true, data: text });
          },
          function (err) {
            post({
              type: 'result',
              id: id,
              ok: false,
              error: String((err && err.message) || err),
              status: (err && err.status) || 0
            });
          }
        );
    };

    // Reports what the WebView actually landed on. On a Cloudflare challenge
    // this is the only signal that the session is not yet cleared; the JS
    // side logs it so a device run can tell "challenge" from "real page".
    function reportPage() {
      try {
        var title = document.title || '';
        var head = '';
        try {
          head = ((document.body && document.body.innerHTML) || '').slice(0, 3000);
        } catch (inner) {}
        var hay = (title + ' ' + head).toLowerCase();
        post({
          type: 'page',
          url: String(location.href || ''),
          title: title,
          challenge:
            hay.indexOf('just a moment') >= 0 ||
            hay.indexOf('checking your browser') >= 0 ||
            hay.indexOf('cf-chl') >= 0 ||
            hay.indexOf('challenge-platform') >= 0,
          htmlBridge: true,
          readyState: document.readyState
        });
      } catch (err) {}
    }

    if (document.readyState === 'complete') {
      setTimeout(reportPage, 1500);
    } else {
      window.addEventListener('load', function () { setTimeout(reportPage, 1500); });
    }
  } catch (err) {}
})();
`;
