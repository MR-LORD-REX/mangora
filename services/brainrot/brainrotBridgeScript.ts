/**
 * brainrotBridgeScript.ts
 *
 * Injected into the hidden BrainRot WebView (see BrainRotBridgeHost.tsx).
 *
 * brainrotcomics.com sits behind Cloudflare, which answers every plain HTTP
 * request with a managed challenge ("Just a moment...", 403). Only a real
 * browser engine clears it. This script runs inside the WebView that already
 * cleared the challenge and exposes a credentialed fetch proxy so the native
 * BrainRotComicsClient can read the WordPress/Madara HTML it needs.
 *
 * Exposes: window.__brainrotRequest(payloadJson) with payload
 *   { id, url, method?, headers?, body? }
 * and posts back { type:"result", id, ok, status, text }.
 */

export const BRAINROT_BRIDGE_SCRIPT = `
(function () {
  try {
    if (window.__brainrotBridgeInstalled) return;
    window.__brainrotBridgeInstalled = true;

    function post(msg) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        }
      } catch (err) {}
    }

    window.__brainrotRequest = function (payloadText) {
      var payload;
      try {
        payload = (typeof payloadText === 'string') ? JSON.parse(payloadText) : payloadText;
      } catch (err) {
        post({ type: 'result', id: null, ok: false, status: 0, error: 'Bad bridge payload' });
        return;
      }
      var id = payload && payload.id;
      var url = payload && payload.url;
      var method = (payload && payload.method) || 'GET';
      var headers = (payload && payload.headers) || {};
      var body = payload && payload.body;

      Promise.resolve()
        .then(function () {
          var init = {
            method: method,
            headers: headers,
            credentials: 'include',
            redirect: 'follow',
            cache: 'no-store'
          };
          if (body != null && method !== 'GET' && method !== 'HEAD') init.body = body;
          return fetch(String(url), init);
        })
        .then(function (res) {
          return res.text().then(function (text) {
            post({ type: 'result', id: id, ok: res.ok, status: res.status, text: text });
          });
        })
        .catch(function (err) {
          post({
            type: 'result',
            id: id,
            ok: false,
            status: 0,
            error: String((err && err.message) || err)
          });
        });
    };

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
            hay.indexOf('challenge-platform') >= 0
        });
      } catch (err) {}
    }

    function ready() { post({ type: 'ready' }); }

    function boot() {
      ready();
      setTimeout(reportPage, 1200);
    }

    // The bridge may be injected before ReactNativeWebView is wired; post
    // "ready" on every lifecycle edge so the native side never waits on a
    // message that was lost before the host was listening.
    ready();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(boot, 300);
    } else {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 250); });
      window.addEventListener('load', function () { setTimeout(boot, 200); });
    }
    setTimeout(boot, 2500);
    setInterval(ready, 6000);
  } catch (err) {}
})();
`;