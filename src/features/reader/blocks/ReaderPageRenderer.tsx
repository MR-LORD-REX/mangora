/**
 * Page-row renderer for ReaderScreen.
 *
 * The screen owns page data, prefetch windows and gesture callbacks. This
 * component turns one display row into a ReaderPage without knowing how pages
 * were loaded or how navigation works.
 */
import type { PageTranslationState } from "@features/translation";

import ReaderPage from "../components/page/ReaderPage";
import type {
  ReaderChromeSettings,
  ReaderOverlayFont,
} from "../components/panels/readerChrome";
import { layoutForDisplayItem } from "../domain/layout/pageOffsets";
import type { PageDims } from "../domain/layout/pageGeometry";
import type { ReaderDisplayItem } from "../domain/layout/readerItems";

export interface ReaderPageRendererProps {
  item: ReaderDisplayItem;
  loadImage: boolean;
  extensionSourceId?: string;
  chrome: ReaderChromeSettings;
  bodySize: PageDims;
  pageDims: Record<string, PageDims>;
  pageBackground: string;
  pageGap: number;
  imageHeaders?: Record<string, string>;
  defaultZoomScale: number;
  pagedMode: boolean;
  translation: PageTranslationState | undefined;
  translationActive: boolean;
  showPageStatus: boolean;
  hideTranslated: boolean;
  overlayFont: ReaderOverlayFont;
  overlayFontWeight: number;
  overlayFontScale: number;
  overlayTextColor: string;
  onLoadDims: (url: string, width: number, height: number) => void;
  onTapAt?: (x: number, y: number) => void;
  onLongPress?: () => void;
  onRetryTranslation: (url: string) => void;
}

export default function ReaderPageRenderer({
  item,
  loadImage,
  extensionSourceId,
  chrome,
  bodySize,
  pageDims,
  pageBackground,
  pageGap,
  imageHeaders,
  defaultZoomScale,
  pagedMode,
  translation,
  translationActive,
  showPageStatus,
  hideTranslated,
  overlayFont,
  overlayFontWeight,
  overlayFontScale,
  overlayTextColor,
  onLoadDims,
  onTapAt,
  onLongPress,
  onRetryTranslation,
}: ReaderPageRendererProps) {
  const geometry = layoutForDisplayItem(
    item,
    chrome.readingMode,
    chrome.sidePadding,
    bodySize,
    pageDims,
    chrome.imageScaleType,
    chrome.rotateWidePagesToFit,
  );
  return (
    <ReaderPage
      url={item.url}
      loadImage={loadImage}
      extensionSourceId={extensionSourceId}
      geometry={geometry}
      sourceWidth={pageDims[item.url]?.width}
      sourceHeight={pageDims[item.url]?.height}
      pageBackground={pageBackground}
      imageHeaders={imageHeaders}
      chrome={chrome}
      defaultZoomScale={defaultZoomScale}
      pagedMode={pagedMode}
      splitHalf={item.half}
      translation={translation}
      translationActive={translationActive}
      showPageStatus={showPageStatus}
      hideTranslated={hideTranslated}
      overlayFont={overlayFont}
      overlayFontWeight={overlayFontWeight}
      overlayFontScale={overlayFontScale}
      overlayTextColor={overlayTextColor}
      onLoadDims={onLoadDims}
      interactive={pagedMode}
      onTapAt={pagedMode ? onTapAt : undefined}
      onLongPress={pagedMode ? onLongPress : undefined}
      pageGap={pageGap}
      onRetryTranslation={onRetryTranslation}
    />
  );
}