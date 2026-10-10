import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { BRAINROT_WEBVIEW_USER_AGENT, BASE_URL } from "@/services/brainrot/brainrot.constants";
import { BRAINROT_BRIDGE_SCRIPT } from "@/services/brainrot/brainrotBridgeScript";
import {
  handleBrainrotBridgeMessage,
  setBrainrotBridgeInvoker,
} from "@/services/brainrot/brainrotBridge";

/**
 * Hidden, persistent WebView that keeps a warm BrainRot session. It loads the
 * real site once at app start so Cloudflare is cleared and cookies are stored;
 * inside the page our injected script exposes a credentialed fetch proxy.
 * Native BrainRot screens call the bridge through services/brainrot/brainrotBridge.ts.
 *
 * The host stays mounted for the whole session (root layout) - unmounting it
 * would drop the warm session and force a new Cloudflare challenge.
 */
export default function BrainRotBridgeHost() {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    setBrainrotBridgeInvoker({
      inject(payloadText: string) {
        webViewRef.current?.injectJavaScript(payloadText);
      },
      reload() {
        webViewRef.current?.reload();
      },
    });
    return () => setBrainrotBridgeInvoker(null);
  }, []);

  const onMessage = (event: WebViewMessageEvent) => {
    handleBrainrotBridgeMessage(event.nativeEvent.data);
  };

  return (
    <View pointerEvents="none" style={styles.host}>
      <WebView
        ref={webViewRef}
        source={{ uri: BASE_URL }}
        userAgent={BRAINROT_WEBVIEW_USER_AGENT}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        originWhitelist={["*"]}
        cacheEnabled
        injectedJavaScriptBeforeContentLoaded={BRAINROT_BRIDGE_SCRIPT}
        onMessage={onMessage}
        onLoadEnd={() => {
          try {
            webViewRef.current?.injectJavaScript("true;");
          } catch {
            // The injected script boots on its own.
          }
        }}
        onError={() => {
          // Let the bridge retry/time out; a later load may recover.
        }}
        onHttpError={() => {
          // Cloudflare 403s are expected until the challenge clears.
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