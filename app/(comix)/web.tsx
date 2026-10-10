import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { colors, providerAccent, radius } from "@/constants/theme";
import {
  BASE_URL,
  COMIX_WEBVIEW_USER_AGENT,
} from "@/services/comix/comix.constants";

const accent = providerAccent.comix;

function paramString(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

/**
 * In-app browser for Comix. Comix gates its search, filtering, chapter
 * lists and page images behind a WAF-signed API that plain HTTP cannot
 * call; the site's own web UI, however, generates that token inside any
 * real browser engine. This screen embeds the real site so search /
 * filtering / reading still work inside the app.
 */
export default function ComixWebScreen() {
  const params = useLocalSearchParams<{
    url?: string | string[];
    title?: string | string[];
  }>();
  const encodedUrl = paramString(params.url);
  const [url] = useState(() => {
    if (!encodedUrl) return "";
    try {
      return decodeURIComponent(encodedUrl);
    } catch {
      return encodedUrl;
    }
  });
  const [title, setTitle] = useState(paramString(params.title) || "Comix");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const fullUrl = useCallback((value: string) => {
    if (/^https?:\/\//i.test(value)) return value;
    const base = BASE_URL.replace(/\/+$/, "");
    const clean = value.replace(/^\/+/, "");
    return clean ? `${base}/${clean}` : base;
  }, []);

  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const targetUrl = fullUrl(url);

  const reload = () => {
    setFailed(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  const openExternal = () => {
    if (targetUrl) {
      void WebBrowser.openBrowserAsync(targetUrl);
    }
  };

  const onNavigationStateChange = (nav: { url?: string; title?: string }) => {
    if (nav.url && nav.url !== currentUrl) {
      setCurrentUrl(nav.url);
      const match = nav.url.match(/\/title\/([^/]+?)(?:\/\d+-chapter-\d+)?\/?$/);
      if (match) {
        const slug = decodeURIComponent(match[1]);
        setTitle(
          slug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
        );
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          onPress={reload}
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <RefreshCw color={colors.textMuted} size={21} />
        </Pressable>
        <Pressable
          onPress={openExternal}
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <ExternalLink color={colors.textMuted} size={21} />
        </Pressable>
      </View>

      {!targetUrl ? (
        <View style={styles.centerWrap}>
          <Text style={styles.errorText}>No Comix URL was provided.</Text>
        </View>
      ) : failed ? (
        <View style={styles.centerWrap}>
          <ShieldAlert color={colors.danger} size={44} />
          <Text style={styles.errorText}>
            Comix could not be reached. Check your connection and try again.
          </Text>
          <Pressable onPress={reload} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Pressable onPress={openExternal} style={styles.externalBtn}>
            <ExternalLink color={accent} size={16} />
            <Text style={styles.externalText}>Open in browser</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.webWrap}>
          <WebView
            ref={webViewRef}
            source={{ uri: targetUrl }}
            userAgent={COMIX_WEBVIEW_USER_AGENT}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={(event) => {
              setLoading(false);
              // A 403 is usually Cloudflare's challenge page; the engine then
              // solves it and reloads. Treating it as fatal would unmount the
              // WebView before the challenge can finish.
              if (event.nativeEvent.statusCode !== 403) {
                setFailed(true);
              }
            }}
            onNavigationStateChange={onNavigationStateChange}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            setSupportMultipleWindows={false}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.centerWrap}>
                <ActivityIndicator color={accent} size="large" />
              </View>
            )}
            style={styles.web}
          />
          {loading ? (
            <View style={styles.loadingPill} pointerEvents="none">
              <ActivityIndicator color={accent} size="small" />
              <Text style={styles.loadingText}>Loading Comix…</Text>
            </View>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 10,
    gap: 4,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    paddingHorizontal: 6,
  },
  pressed: { opacity: 0.6 },
  webWrap: { flex: 1, backgroundColor: "#000" },
  web: { flex: 1, backgroundColor: "#0b0e12" },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 14,
    backgroundColor: colors.bg,
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: accent,
    borderRadius: radius.full,
    paddingHorizontal: 26,
    paddingVertical: 11,
  },
  retryText: { color: colors.onAccent, fontWeight: "800", fontSize: 15 },
  externalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  externalText: { color: accent, fontWeight: "700", fontSize: 14 },
  loadingPill: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(13,16,20,0.85)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  loadingText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});
