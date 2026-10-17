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
import type { ReaderChromeSettings } from "@/components/reader/readerChrome";
import SubsamplingStripImage from "@/components/reader/SubsamplingStripImage";
import ZoomablePage from "@/components/reader/ZoomablePage";
import type { PageGeometry } from "@/utils/reader/pageGeometry";
import type { PageTranslationState } from "@/services/translation/translation.types";

export interface ReaderPageProps {
  url: string;
  /** False while the page is outside the prefetch window. */
  loadImage: boolean;
  geometry: PageGeometry;
  pageBackground: string;
  imageHeaders?: Record<string, string>;
  chrome: ReaderChromeSettings;
  defaultZoomScale: number;
  pagedMode: boolean;
  translation: PageTranslationState | undefined;
  textScale: number;
  onLoadDims: (url: string, width: number, height: number) => void;
  onToggleChrome: () => void;
  onTapAt: (x: number, y: number) => void;
}

function ReaderPage({
  url,
  loadImage,
  geometry,
  pageBackground,
  imageHeaders,
  chrome,
  defaultZoomScale,
  pagedMode,
  translation,
  textScale,
  onLoadDims,
  onToggleChrome,
  onTapAt,
}: ReaderPageProps) {
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
        textScale={textScale}
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
            width={geometry.imgW}
            height={geometry.imgH}
            backgroundColor={pageBackground}
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
            width={geometry.imgW}
            height={geometry.imgH}
            backgroundColor={pageBackground}
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
          width={geometry.imgW}
          height={geometry.itemH > geometry.imgH ? geometry.itemH : geometry.imgH}
          backgroundColor={pageBackground}
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
    geometryEqual(prev.geometry, next.geometry) &&
    prev.pageBackground === next.pageBackground &&
    prev.imageHeaders === next.imageHeaders &&
    prev.chrome === next.chrome &&
    prev.defaultZoomScale === next.defaultZoomScale &&
    prev.pagedMode === next.pagedMode &&
    prev.translation === next.translation &&
    prev.textScale === next.textScale &&
    prev.onLoadDims === next.onLoadDims &&
    prev.onToggleChrome === next.onToggleChrome &&
    prev.onTapAt === next.onTapAt,
);