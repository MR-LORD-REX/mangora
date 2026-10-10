/**
 * SubsamplingStripImage.tsx
 * ---------------------------------------------------------------------------
 * Crisp Android renderer for long strip pages (webtoon style) in Fit mode.
 *
 * Native <Image> upscales/downscales the whole decoded frame, which makes
 * very tall strips look soft and can spike memory. On Android this component
 * renders the page through davemorrissey/subsampling-scale-image-view (the
 * tiled decoder used by manga/comic reader apps): it decodes only the region
 * that is actually on screen at full resolution, so fit rows stay sharp and
 * giant pages never need to be decoded in one piece.
 *
 * The page is first downloaded once into the app cache (reusing the OCR page
 * cache, keyed by URL), then handed to the native tiled view. If the native
 * module is not present (Expo Go, non-rebuilt client, web/iOS) or the file
 * cannot be fetched, the component silently falls back to the regular RN
 * <Image> so the reader keeps working everywhere.
 * ---------------------------------------------------------------------------
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  requireNativeComponent,
  StyleSheet,
  View,
} from "react-native";

import { downloadPageToCache } from "@/services/ocr/pageOcr";

const TILED_EXTENSIONS = /\.(jpe?g|png|webp)(\?|#|$)/i;

let NativeTiledImage: React.ElementType | null = null;
if (Platform.OS === "android") {
  NativeTiledImage = requireNativeComponent("SubsamplingScaleImageView");
}

export interface SubsamplingStripImageProps {
  uri: string;
  headers?: Record<string, string>;
  width: number;
  height: number;
  backgroundColor: string;
  onFallbackLoad?: (event: {
    nativeEvent: { source: { width?: number; height?: number } };
  }) => void;
}

export default function SubsamplingStripImage({
  uri,
  headers,
  width,
  height,
  backgroundColor,
  onFallbackLoad,
}: SubsamplingStripImageProps) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const tiledSupported =
    Platform.OS === "android" &&
    NativeTiledImage !== null &&
    TILED_EXTENSIONS.test(uri);

  useEffect(() => {
    if (!tiledSupported) return;
    if (uri.startsWith("file://")) {
      // Downloaded pages are already on disk; reuse them as-is.
      setLocalUri(uri);
      return;
    }
    let cancelled = false;
    downloadPageToCache(uri, headers)
      .then((fileUri) => {
        if (!cancelled) setLocalUri(fileUri);
      })
      .catch((error) => {
        console.warn("Tiled page download failed, using regular image:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri, headers, tiledSupported]);

  if (tiledSupported && localUri && !failed && NativeTiledImage) {
    const TiledView = NativeTiledImage;
    return (
      <View style={{ width, height, backgroundColor, overflow: "hidden" }}>
        <TiledView src={localUri} style={StyleSheet.absoluteFill} />
      </View>
    );
  }

  if (tiledSupported && !localUri && !failed) {
    return (
      <View
        style={{
          width,
          height,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor,
        }}
      >
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  return (
    <Image
      source={headers ? { uri, headers } : { uri }}
      onLoad={onFallbackLoad}
      onError={(event) =>
        console.warn("[reader] page image failed", event.nativeEvent, uri)
      }
      style={{
        width,
        height,
        resizeMode: "contain",
        backgroundColor,
      }}
    />
  );
}
