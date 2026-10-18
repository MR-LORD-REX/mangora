/**
 * ReaderPage.tsx
 * ---------------------------------------------------------------------------
 * Renders one reader page for the shared reader: placeholder, zoomable
 * scroll-mode strip, viewport-sized paged page, image + translation overlay.
 *
 * Layout is driven entirely by the PageGeometry computed by the screen, so the
 * screen stays responsible for mode/zoom decisions while this file owns the
 * page's JSX.
 * ---------------------------------------------------------------------------
 */

import { memo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  type GestureResponderEvent,
} from "react-native";

import PageTranslationOverlay from "@/components/reader/PageTranslationOverlay";
import type {
  ReaderChromeSettings,
  ReaderOverlayFont,
} from "@/components/reader/readerChrome";
import SubsamplingStripImage from "@/components/reader/SubsamplingStripImage";
import ZoomablePage from "@/components/reader/ZoomablePage";
import type { PageGeometry } from "@/utils/reader/pageGeometry";
import type { PageTranslationState } from "@/services/translation/translation.types";

export interface ReaderPageProps {
  url: string;
  /** False while the page is outside the prefetch window. */
  loadImage: boolean;
  /** Set for `ext:*` pages so the native extension client fetches images. */
  extensionSourceId?: string;
  geometry: PageGeometry;
  pageBackground: string;
  imageHeaders?: Record<string, string>;
  chrome: ReaderChromeSettings;
  defaultZoomScale: number;
  pagedMode: boolean;
  translation: PageTranslationState | undefined;
  overlayFont: ReaderOverlayFont;
  overlayFontWeight: number;
  overlayFontScale: number;
  overlayTextColor: string;
  onLoadDims: (url: string, width: number, height: number) => void;
  onToggleChrome: () => void;
  onTapAt: (x: number, y: number) => void;
}

function ReaderPage({
  url,
  loadImage,
  extensionSourceId,
  geometry,
  pageBackground,
  imageHeaders,
  chrome,
  defaultZoomScale,
  pagedMode,
  translation,
  overlayFont,
  overlayFontWeight,
  overlayFontScale,
  overlayTextColor,
  onLoadDims,
  onToggleChrome,
  onTapAt,
}: ReaderPageProps) {
  const filters: ({ brightness: number } | { grayscale: number } | { invert: number })[] = [];
  if (chrome.customBrightnessEnabled) {
    filters.push({
      brightness: Math.min(2, Math.max(0, chrome.customBrightness / 100)),
    });
  }
  if (chrome.grayscale) {
    filters.push({
      grayscale: Math.min(1, Math.max(0, chrome.grayscaleAmount / 100)),
    });
  }
  if (chrome.inverted) {
    filters.push({ invert: 1 });
  }
  const imageFilter = filters.length > 0 ? filters : undefined;
  const colorTint = chrome.customColorFilterEnabled
    ? chrome.customColorFilter
    : null;

  const translationOverlay = () => {
    if (
      !translation ||
      !translation.visible ||
      translation.imageWidth <= 0 ||
      translation.regions.length === 0
    ) {
      return null;
    }
    return (
      <PageTranslationOverlay
        translation={translation}
        displayWidth={geometry.overlayW}
        displayHeight={geometry.overlayH}
        overlayFont={overlayFont}
        overlayFontWeight={overlayFontWeight}
        overlayFontScale={overlayFontScale}
        overlayTextColor={overlayTextColor}
      />
    );
  };

  if (!loadImage) {
    return (
      <View
        style={{
          width: geometry.itemW,
          height: geometry.itemH,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pageBackground,
        }}
      >
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  if (geometry.zoom) {
    return (
      <View
        style={{
          width: geometry.itemW,
          height: geometry.itemH,
          backgroundColor: pageBackground,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ZoomablePage
          width={geometry.itemW}
          height={geometry.itemH}
          contentWidth={geometry.imgW}
          contentHeight={geometry.imgH}
          doubleTapToZoom={chrome.doubleTapToZoom}
          disableZoomOut={chrome.disableZoomOut}
          onSingleTap={pagedMode ? undefined : onToggleChrome}
          onTapAt={pagedMode ? onTapAt : undefined}
          defScale={defaultZoomScale}
        >
          <SubsamplingStripImage
            uri={url}
            headers={imageHeaders}
            extensionSourceId={extensionSourceId}
            width={geometry.imgW}
            height={geometry.imgH}
            backgroundColor={pageBackground}
            imageFilter={imageFilter}
            colorTint={colorTint}
          />
          {translationOverlay()}
        </ZoomablePage>
      </View>
    );
  }

  // Tapped area is the whole page slot (viewport-sized in paged modes) so
  // the tap-zone bands work even when the image is centred with padding.
  const pageTap = (event: GestureResponderEvent) => {
    onTapAt(event.nativeEvent.locationX, event.nativeEvent.locationY);
  };
  const verticallyScrollable =
    (pagedMode || chrome.readingMode === "scrollHorizontal") &&
    geometry.imgH > geometry.itemH;

  const onLoad = (event: {
    nativeEvent: { source: { width?: number; height?: number } };
  }) => {
    const src = event.nativeEvent.source;
    if (src && src.width && src.height) {
      onLoadDims(url, src.width, src.height);
    }
  };

  const renderPageImage = () => {
    if (verticallyScrollable) {
      return (
        <ScrollView
          style={{ width: geometry.imgW, height: geometry.itemH }}
          contentContainerStyle={{
            width: geometry.imgW,
            minHeight: geometry.imgH,
          }}
          nestedScrollEnabled
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          <SubsamplingStripImage
            uri={url}
            headers={imageHeaders}
            extensionSourceId={extensionSourceId}
            width={geometry.imgW}
            height={geometry.imgH}
            backgroundColor={pageBackground}
            imageFilter={imageFilter}
            colorTint={colorTint}
            onFallbackLoad={onLoad}
          />
          {translationOverlay()}
        </ScrollView>
      );
    }
    return (
      <View style={{ width: geometry.imgW, height: geometry.itemH }}>
        <SubsamplingStripImage
          uri={url}
          headers={imageHeaders}
          extensionSourceId={extensionSourceId}
          width={geometry.imgW}
          height={geometry.itemH > geometry.imgH ? geometry.itemH : geometry.imgH}
          backgroundColor={pageBackground}
          imageFilter={imageFilter}
          colorTint={colorTint}
          onFallbackLoad={onLoad}
        />
        {translationOverlay()}
      </View>
    );
  };

  if (verticallyScrollable) {
    return (
      <View
        style={{
          width: geometry.itemW,
          height: geometry.itemH,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pageBackground,
        }}
      >
        {renderPageImage()}
      </View>
    );
  }
  return (
    <Pressable
      onPress={pageTap}
      style={{
        width: geometry.itemW,
        height: geometry.itemH,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pageBackground,
      }}
    >
      <View style={{ width: geometry.imgW, height: geometry.itemH }}>
        {renderPageImage()}
      </View>
    </Pressable>
  );
}

function geometryEqual(a: PageGeometry, b: PageGeometry): boolean {
  return (
    a.itemW === b.itemW &&
    a.itemH === b.itemH &&
    a.imgW === b.imgW &&
    a.imgH === b.imgH &&
    a.overlayW === b.overlayW &&
    a.overlayH === b.overlayH &&
    a.zoom === b.zoom
  );
}

export default memo(
  ReaderPage,
  (prev, next) =>
    prev.url === next.url &&
    prev.loadImage === next.loadImage &&
    prev.extensionSourceId === next.extensionSourceId &&
    geometryEqual(prev.geometry, next.geometry) &&
    prev.pageBackground === next.pageBackground &&
    prev.imageHeaders === next.imageHeaders &&
    prev.chrome === next.chrome &&
    prev.defaultZoomScale === next.defaultZoomScale &&
    prev.pagedMode === next.pagedMode &&
    prev.translation === next.translation &&
    prev.overlayFont === next.overlayFont &&
    prev.overlayFontWeight === next.overlayFontWeight &&
    prev.overlayFontScale === next.overlayFontScale &&
    prev.overlayTextColor === next.overlayTextColor &&
    prev.onLoadDims === next.onLoadDims &&
    prev.onToggleChrome === next.onToggleChrome &&
    prev.onTapAt === next.onTapAt,
);
