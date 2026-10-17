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
import { fetchExtensionPageImage } from "@/services/extensions/native";
import { extensionPageUrlFor } from "@/utils/reader/imageHeaders";

const TILED_EXTENSIONS = /\.(jpe?g|png|webp)(\?|#|$)/i;

let NativeTiledImage: React.ElementType | null = null;
if (Platform.OS === "android") {
  NativeTiledImage = requireNativeComponent("SubsamplingScaleImageView");
}

export interface SubsamplingStripImageProps {
  uri: string;
  headers?: Record<string, string>;
  /** Extension source id: route through the extension image client. */
  extensionSourceId?: string;
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
  extensionSourceId,
  width,
  height,
  backgroundColor,
  onFallbackLoad,
}: SubsamplingStripImageProps) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [localFailed, setLocalFailed] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const tiledSupported =
    Platform.OS === "android" &&
    NativeTiledImage !== null &&
    TILED_EXTENSIONS.test(uri);

  useEffect(() => {
    if (uri.startsWith("file://")) {
      // Downloaded pages are already on disk; reuse them as-is.
      setLocalUri(uri);
      setLocalFailed(false);
      setLoadingLocal(false);
      return;
    }
    // Extension images must go through the source's OkHttp client. That is
    // what runs its image interceptor: Cloudflare cookies, per-page headers,
    // and Philia-style decryption/descrambling.
    const needsLocal = tiledSupported || Boolean(extensionSourceId);
    if (!needsLocal) {
      setLocalUri(null);
      setLocalFailed(false);
      setLoadingLocal(false);
      return;
    }
    let cancelled = false;
    setLocalUri(null);
    setLocalFailed(false);
    setLoadingLocal(true);
    const load = extensionSourceId
      ? fetchExtensionPageImage(
          extensionSourceId,
          uri,
          extensionPageUrlFor(uri) ?? "",
        ).then((image) => image.path)
      : downloadPageToCache(uri, headers);
    load
      .then((fileUri) => {
        if (!cancelled) {
          setLocalUri(fileUri);
          setLoadingLocal(false);
        }
      })
      .catch((error) => {
        console.warn("Tiled page download failed, using regular image:", error);
        if (!cancelled) {
          setLocalFailed(true);
          setLoadingLocal(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uri, headers, tiledSupported, extensionSourceId]);

  if (tiledSupported && localUri && !localFailed && NativeTiledImage) {
    const TiledView = NativeTiledImage;
    return (
      <View style={{ width, height, backgroundColor, overflow: "hidden" }}>
        <TiledView src={localUri} style={StyleSheet.absoluteFill} />
      </View>
    );
  }

  if (loadingLocal && !localFailed) {
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

  if (localUri && !localFailed) {
    return (
      <Image
        source={{ uri: localUri }}
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
