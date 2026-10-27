/**
 * Current-page status for the chrome header and single-page translation button.
 */
import { useMemo } from "react";

import type { PageTranslationState } from "@features/translation";

import { overlayFontSupportsLanguage } from "../components/panels/overlayFonts";
import type { ReaderOverlayFont } from "../components/panels/readerChrome";

export interface ReaderPageStatusOptions {
  pages: string[];
  currentPageIndex: number;
  translationPages: Record<string, PageTranslationState | undefined>;
  targetLanguage: string;
  overlayFont: ReaderOverlayFont;
}

export function useReaderPageStatus({
  pages,
  currentPageIndex,
  translationPages,
  targetLanguage,
  overlayFont,
}: ReaderPageStatusOptions) {
  const singlePageUrl = pages[currentPageIndex] ?? "";
  const singleStage = translationPages[singlePageUrl]?.stage;
  const overlayFontForTarget = useMemo(
    () =>
      overlayFontSupportsLanguage(targetLanguage) ? overlayFont : "default",
    [overlayFont, targetLanguage],
  );
  return { singlePageUrl, singleStage, overlayFontForTarget };
}