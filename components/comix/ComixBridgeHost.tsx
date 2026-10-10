import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

import {
  BASE_URL,
  COMIX_WEBVIEW_USER_AGENT,
} from "@/services/comix/comix.constants";
import { COMIX_BRIDGE_SCRIPT } from "@/services/comix/comixBridgeScript";
import { COMIX_HTML_BRIDGE_SCRIPT } from "@/services/comix/comixBridgeHtmlScript";
import {
  handleComixBridgeMessage,
  handleComixPageLoaded,
  handleComixNavigation,
  setComixBridgeInvoker,
} from "@/services/comix/comixBridge";

/**
 * Both halves of the injected bootstrap: the React-Query cache bridge plus the
 * same-origin HTML fetcher used for server-rendered pages.
 */
const COMIX_BOOTSTRAP_SCRIPT = `${COMIX_BRIDGE_SCRIPT}\n${COMIX_HTML_BRIDGE_SCRIPT}`;

/**
 * Hidden, persistent WebView that keeps a warm Comix session. It loads the real
 * site once at app start so Cloudflare is cleared and cookies are stored; later
 * it is navigated on demand to whatever page holds the data a native screen
 * needs (search results, chapter lists, chapter readers), which the injected
 * script then reads out of the site's own React Query cache.
 *
 * The host stays mounted for the whole session (root layout) - unmounting it
 * would drop the warm session and force a new Cloudflare challenge.
 */
export default function ComixBridgeHost() {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    setComixBridgeInvoker({
      inject(payloadText: string) {
        webViewRef.current?.injectJavaScript(payloadText);
      },
      reload() {
        webViewRef.current?.reload();
      },
      navigate(url: string) {
        webViewRef.current?.injectJavaScript(
          "window.location.href=" + JSON.stringify(url) + "; true;",
        );
      },
    });
    return () => setComixBridgeInvoker(null);
  }, []);

  const onMessage = (event: WebViewMessageEvent) => {
    handleComixBridgeMessage(event.nativeEvent.data);
  };

  const kick = () => {
    try {
      // Re-runs the injected script's boot path on every finished load
      // (also harmless while the first document is still loading).
      webViewRef.current?.injectJavaScript("true;");
    } catch {
      // WebView not ready yet - the injected script boots on its own.
    }
  };

  const onLoadEnd = () => {
    // Lets the HTML bridge proceed without waiting for any API module.
    handleComixPageLoaded();
    kick();
  };

  const onNavigationStateChange = (nav: WebViewNavigation) => {
    handleComixNavigation(nav.url);
  };

  return (
    <View pointerEvents="none" style={styles.host}>
      <WebView
        ref={webViewRef}
        source={{ uri: BASE_URL }}
        userAgent={COMIX_WEBVIEW_USER_AGENT}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        originWhitelist={["*"]}
        cacheEnabled
        injectedJavaScriptBeforeContentLoaded={COMIX_BOOTSTRAP_SCRIPT}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        onNavigationStateChange={onNavigationStateChange}
        onError={() => {
          // The site may still recover on a later load; the bridge client
          // surfaces a readable error if the timeout is reached.
        }}
        onHttpError={() => {
          // Same as onError - keep silent and let the bridge retry/time out.
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    top: 0,
    // A realistic viewport matters: Cloudflare's challenge inspects window
    // dimensions, and a 1x1 WebView both looks unnatural and lays out poorly.
    width: 360,
    height: 640,
    opacity: 0.01,
    zIndex: -1,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});