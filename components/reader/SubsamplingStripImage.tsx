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
 * The page URI comes from the shared reader cache (a local file for a normal
 * open), so this component never maintains a second URL-keyed page cache. If
 * the native module is not present (Expo Go, non-rebuilt client, web/iOS) or
 * the file cannot be decoded, it silently falls back to the regular RN <Image>
 * so the reader keeps working everywhere.
 * ---------------------------------------------------------------------------
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  requireNativeComponent,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

import { ensureDecodablePageUri } from "@/services/ocr/pageOcr";
import { fetchExtensionPageImage } from "@/services/extensions/native";
import { isAvifUri } from "@/services/images/avif";
import { extensionPageUrlFor } from "@/utils/reader/imageHeaders";
import {
  detectBorderCrop,
  shouldAnalyzeBorderCrop,
  type BorderCrop,
} from "@/utils/reader/borderCrop";

const TILED_EXTENSIONS = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;

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
  /** RN 0.81 color-matrix filters (brightness / grayscale / invert). */
  imageFilter?: ViewStyle["filter"];
  /** `#rrggbb` tint composited over the page with overlay blending. */
  colorTint?: string | null;
  /** Reports the natural image size once the file is available. */
  onLoadDims?: (width: number, height: number) => void;
  /** Receives crop insets in natural-image fractions (null = no crop). */
  onBorderCrop?: (crop: BorderCrop | null) => void;
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
  imageFilter,
  colorTint,
  onLoadDims,
  onBorderCrop,
  onFallbackLoad,
}: SubsamplingStripImageProps) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [localFailed, setLocalFailed] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const tiledSupported =
    Platform.OS === "android" &&
    NativeTiledImage !== null &&
    TILED_EXTENSIONS.test(uri);
  const tintSupported =
    Platform.OS !== "android" || Number(Platform.Version) >= 29;
  const onLoadDimsRef = useRef(onLoadDims);
  onLoadDimsRef.current = onLoadDims;
  const onBorderCropRef = useRef(onBorderCrop);
  onBorderCropRef.current = onBorderCrop;

  const frameStyle = [
    { width, height, backgroundColor, overflow: "hidden" as const },
    imageFilter ? { filter: imageFilter } : null,
  ];
  const tintOverlay =
    colorTint && tintSupported ? (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colorTint, mixBlendMode: "overlay" },
        ]}
      />
    ) : null;

  useEffect(() => {
    if (uri.startsWith("file://")) {
      // Downloaded pages are already on disk. AVIF still needs a PNG
      // transcode before either the tiled view or RN's <Image> can open it.
      if (isAvifUri(uri)) {
        let cancelled = false;
        setLocalUri(null);
        setLocalFailed(false);
        setLoadingLocal(true);
        ensureDecodablePageUri(uri)
          .then((fileUri) => {
            if (!cancelled) {
              setLocalUri(fileUri);
              setLoadingLocal(false);
            }
          })
          .catch((error) => {
            console.warn("AVIF page transcode failed:", error);
            if (!cancelled) {
              setLocalFailed(true);
              setLoadingLocal(false);
            }
          });
        return () => {
          cancelled = true;
        };
      }
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
      : ensureDecodablePageUri(uri, { headers, force: true });
    load
      .then((fileUri) => ensureDecodablePageUri(fileUri))
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

  // The tiled native view never fires the RN Image onLoad event. Measuring
  // the cached file gives the screen the real aspect ratio, so the strip row
  // does not start with a placeholder height and then jump after decode.
  // The same file is the input for optional border-crop detection.
  useEffect(() => {
    if (!localUri) {
      onBorderCropRef.current?.(null);
      return;
    }
    let cancelled = false;
    Image.getSize(
      localUri,
      (width, height) => {
        if (cancelled || width <= 0 || height <= 0) return;
        onLoadDimsRef.current?.(width, height);
        if (!shouldAnalyzeBorderCrop(width, height)) {
          onBorderCropRef.current?.(null);
          return;
        }
        // Always analyse while the page is rendered. The result is cached and
        // tiny (160px thumbnail), and having it ready means the crop toggle
        // applies on the first frame instead of waiting and flashing the
        // uncropped page.
        detectBorderCrop(localUri)
          .then((crop) => {
            if (!cancelled) onBorderCropRef.current?.(crop);
          })
          .catch(() => {
            if (!cancelled) onBorderCropRef.current?.(null);
          });
      },
      () => {
        if (!cancelled) onBorderCropRef.current?.(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [localUri]);

  if (tiledSupported && localUri && !localFailed && NativeTiledImage) {
    const TiledView = NativeTiledImage;
    return (
      <View
        pointerEvents="none"
        style={frameStyle}
      >
        <TiledView src={localUri} style={StyleSheet.absoluteFill} />
        {tintOverlay}
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
      <View pointerEvents="none" style={frameStyle}>
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
        {tintOverlay}
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={frameStyle}>
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
      {tintOverlay}
    </View>
  );
}
