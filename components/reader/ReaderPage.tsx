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

import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  type GestureResponderEvent,
} from "react-native";

import PageTranslationOverlay from "@/components/reader/PageTranslationOverlay";
import PageTrStatusBadge from "@/components/reader/PageTrStatusBadge";
import type {
  ReaderChromeSettings,
  ReaderOverlayFont,
} from "@/components/reader/readerChrome";
import SubsamplingStripImage from "@/components/reader/SubsamplingStripImage";
import ZoomablePage from "@/components/reader/ZoomablePage";
import type {
  PageGeometry,
  ReaderPageSplitHalf,
} from "@/utils/reader/pageGeometry";
import type { PageTranslationState } from "@features/translation";
import type { BorderCrop } from "@/utils/reader/borderCrop";

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
  /** Render one half of a split wide page (the source URL is unchanged). */
  splitHalf?: ReaderPageSplitHalf | null;
  translation: PageTranslationState | undefined;
  translationActive: boolean;
  showPageStatus: boolean;
  hideTranslated: boolean;
  overlayFont: ReaderOverlayFont;
  overlayFontWeight: number;
  overlayFontScale: number;
  overlayTextColor: string;
  onLoadDims: (url: string, width: number, height: number) => void;
  /** Paged pages own their tap/zoom gestures; strip rows are inert. */
  interactive?: boolean;
  onTapAt?: (x: number, y: number) => void;
  onLongPress?: () => void;
  /** Vertical space after this page in webtoon mode. */
  pageGap?: number;
  onRetryTranslation: (url: string) => void;
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
  splitHalf = null,
  translation,
  translationActive,
  showPageStatus,
  hideTranslated,
  overlayFont,
  overlayFontWeight,
  overlayFontScale,
  overlayTextColor,
  onLoadDims,
  interactive = true,
  onTapAt,
  onLongPress,
  pageGap = 0,
  onRetryTranslation,
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

  const onLoad = useCallback((event: {
    nativeEvent: { source: { width?: number; height?: number } };
  }) => {
    const src = event.nativeEvent.source;
    if (src && src.width && src.height) {
      onLoadDims(url, src.width, src.height);
    }
  }, [onLoadDims, url]);

  const onMeasured = useCallback(
    (width: number, height: number) => {
      if (width > 0 && height > 0) onLoadDims(url, width, height);
    },
    [onLoadDims, url],
  );

  const [borderCrop, setBorderCrop] = useState<BorderCrop | null>(null);

  useEffect(() => {
    setBorderCrop(null);
  }, [url]);

  const statusBadge = showPageStatus ? (
    <PageTrStatusBadge
      stage={translation?.stage}
      active={translationActive}
      onRetry={() => {
        console.log("[reader][page status] retry requested", { url });
        onRetryTranslation(url);
      }}
    />
  ) : null;

  const translationOverlay = (displayWidth: number, displayHeight: number) => {
    if (
      !translation ||
      !translation.visible ||
      (hideTranslated && translation.stage === "done") ||
      translation.imageWidth <= 0 ||
      translation.regions.length === 0
    ) {
      return null;
    }
    return (
      <PageTranslationOverlay
        translation={translation}
        displayWidth={displayWidth}
        displayHeight={displayHeight}
        overlayFont={overlayFont}
        overlayFontWeight={overlayFontWeight}
        overlayFontScale={overlayFontScale}
        overlayTextColor={overlayTextColor}
      />
    );
  };

  const crop = chrome.cropBorders ? borderCrop : null;
  const cropSpanX = crop ? Math.max(0.5, 1 - crop.left - crop.right) : 1;
  const cropSpanY = crop ? Math.max(0.5, 1 - crop.top - crop.bottom) : 1;
  // One uniform scale preserves the page aspect ratio. Scaling X and Y by
  // different amounts would remove the margins but distort the artwork.
  const cropScale = 1 / Math.max(cropSpanX, cropSpanY);
  const preRotateW = geometry.rotate ? geometry.imgH : geometry.imgW;
  const preRotateH = geometry.rotate ? geometry.imgW : geometry.imgH;
  // For a split page the image layer is the full spread (2x the visible half);
  // the outer clip below decides which half is on screen.
  const sourceW = geometry.rotate ? preRotateW : geometry.overlayW;
  const sourceH = geometry.rotate ? preRotateH : geometry.overlayH;
  const drawW = Math.max(1, sourceW * cropScale);
  const drawH = Math.max(1, sourceH * cropScale);
  const visibleW = drawW * cropSpanX;
  const visibleH = drawH * cropSpanY;
  const cropOffsetX = crop
    ? (sourceW - visibleW) / 2 - crop.left * drawW
    : 0;
  const cropOffsetY = crop
    ? (sourceH - visibleH) / 2 - crop.top * drawH
    : 0;

  const renderFramedPage = () => {
    const imageLayer = (
      <View style={{ width: drawW, height: drawH }}>
        <SubsamplingStripImage
          key={url}
          uri={url}
          headers={imageHeaders}
          extensionSourceId={extensionSourceId}
          width={drawW}
          height={drawH}
          backgroundColor={pageBackground}
          imageFilter={imageFilter}
          colorTint={colorTint}
          onBorderCrop={setBorderCrop}
          onLoadDims={onMeasured}
          onFallbackLoad={onLoad}
        />
        {translationOverlay(drawW, drawH)}
      </View>
    );
    // Always keep the same view nesting and the same SubsamplingStripImage
    // instance. Toggling crop used to swap between one and two wrapper views,
    // which remounted the native tiled image and re-fetched the page.
    const framed = (
      <View
        style={{
          width: sourceW,
          height: sourceH,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: cropOffsetX,
            top: cropOffsetY,
            width: drawW,
            height: drawH,
          }}
        >
          {imageLayer}
        </View>
      </View>
    );
    if (splitHalf && !geometry.rotate) {
      return (
        <View
          style={{
            width: geometry.imgW,
            height: geometry.imgH,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              left: splitHalf === "right" ? -geometry.imgW : 0,
              top: 0,
            }}
          >
            {framed}
          </View>
        </View>
      );
    }
    if (!geometry.rotate) return framed;
    return (
      <View
        style={{
          width: geometry.imgW,
          height: geometry.imgH,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: preRotateW,
            height: preRotateH,
            transform: [{ rotate: "90deg" }],
          }}
        >
          {framed}
        </View>
      </View>
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
        {statusBadge}
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
        {statusBadge}
        <ZoomablePage
          width={geometry.itemW}
          height={geometry.itemH}
          contentWidth={geometry.imgW}
          contentHeight={geometry.imgH}
          doubleTapToZoom={chrome.doubleTapToZoom}
          disableZoomOut={chrome.disableZoomOut}
          onTapAt={interactive ? onTapAt : undefined}
          onLongPress={interactive ? onLongPress : undefined}
          defScale={defaultZoomScale}
        >
          {renderFramedPage()}
        </ZoomablePage>
      </View>
    );
  }

  // The tapped area is the whole page slot so tap-zone bands work even when
  // the image is centred with padding. Strip rows leave it to the viewport.
  const pageTap = (event: GestureResponderEvent) => {
    onTapAt?.(event.nativeEvent.locationX, event.nativeEvent.locationY);
  };
  const verticallyScrollable =
    (pagedMode || chrome.readingMode === "scrollHorizontal") &&
    geometry.imgH > geometry.itemH;

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
          {renderFramedPage()}
        </ScrollView>
      );
    }
    return (
      <View style={{ width: geometry.imgW, height: geometry.imgH }}>
        {renderFramedPage()}
      </View>
    );
  };

  if (verticallyScrollable) {
    return (
      <View
        style={{
          width: geometry.itemW,
          height: geometry.itemH,
          marginBottom: pageGap,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pageBackground,
        }}
      >
        {statusBadge}
        {renderPageImage()}
      </View>
    );
  }
  const pageContent = (
    <>
      {statusBadge}
      <View style={{ width: geometry.imgW, height: geometry.imgH }}>
        {renderPageImage()}
      </View>
    </>
  );
  const slotStyle = {
    width: geometry.itemW,
    height: geometry.itemH,
    marginBottom: pageGap,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: pageBackground,
  };

  if (!interactive) {
    return <View style={slotStyle}>{pageContent}</View>;
  }
  return (
    <Pressable
      onPress={pageTap}
      onLongPress={onLongPress}
      delayLongPress={420}
      style={slotStyle}
    >
      {pageContent}
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
    a.zoom === b.zoom &&
    a.rotate === b.rotate
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
    prev.splitHalf === next.splitHalf &&
    prev.translation === next.translation &&
    prev.translationActive === next.translationActive &&
    prev.showPageStatus === next.showPageStatus &&
    prev.hideTranslated === next.hideTranslated &&
    prev.overlayFont === next.overlayFont &&
    prev.overlayFontWeight === next.overlayFontWeight &&
    prev.overlayFontScale === next.overlayFontScale &&
    prev.overlayTextColor === next.overlayTextColor &&
    prev.onLoadDims === next.onLoadDims &&
    prev.interactive === next.interactive &&
    prev.onTapAt === next.onTapAt &&
    prev.onLongPress === next.onLongPress &&
    prev.pageGap === next.pageGap &&
    prev.onRetryTranslation === next.onRetryTranslation,
);
