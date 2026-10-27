/**
 * Chrome sheet state and reader navigation.
 *
 * The chrome stack owns presentation; this hook owns which sheet is open,
 * staged reading-mode/rotation choices, and the navigation callbacks shared by
 * the header and bottom bar.
 */
import { useState } from "react";

import type {
  ReaderChromeSettings,
  ReaderOrientation,
  ReaderPagedDirection,
  ReaderReadingMode,
} from "../components/panels/readerChrome";
import type { ReaderConfigTab } from "../components/panels/ReaderConfigPanel";
import type { ReaderTranslationTab } from "../components/panels/ReaderTranslationPanel";
import { chapterNumberLabel } from "@/utils/reader/chapterLabel";
import {
  chapterNavigationFlipped,
  openAdjacentChapter,
} from "../screens/readerChapterNavigation";

export interface ReaderChromeSheetState {
  readingModeSheetOpen: boolean;
  rotationSheetOpen: boolean;
  pendingReadingMode: ReaderReadingMode;
  pendingDirection: ReaderPagedDirection;
  pendingOrientation: ReaderOrientation;
  translationOpen: boolean;
  translationTab: ReaderTranslationTab;
  configOpen: boolean;
  configTab: ReaderConfigTab;
  pageActionsUrl: string | null;
}

export interface ReaderChromeControllerOptions {
  source: string;
  chapterId: string;
  mangaId: string;
  title: string;
  mangaTitle: string;
  thumbnailUrl: string;
  language: string;
  chapterTitle?: string;
  chrome: ReaderChromeSettings;
  prevChapterId: string | null;
  nextChapterId: string | null;
  onOpenMangaInfo: (target: { provider: string; id: string }) => void;
  onBack: () => void;
  onReplaceReader: (params: {
    id: string;
    [key: string]: string | number | undefined;
  }) => void;
  setShowHeader: (show: boolean) => void;
}

export function useReaderChromeController({
  source,
  chapterId,
  mangaId,
  title,
  mangaTitle,
  thumbnailUrl,
  language,
  chapterTitle,
  chrome,
  prevChapterId,
  nextChapterId,
  onOpenMangaInfo,
  onBack,
  onReplaceReader,
  setShowHeader,
}: ReaderChromeControllerOptions) {
  const [readingModeOpen, setReadingModeOpen] = useState(false);
  const [rotationOpen, setRotationOpen] = useState(false);
  const [pendingReadingMode, setPendingReadingMode] =
    useState<ReaderReadingMode>("webtoon");
  const [pendingDirection, setPendingDirection] =
    useState<ReaderPagedDirection>("ltr");
  const [pendingOrientation, setPendingOrientation] =
    useState<ReaderOrientation>("default");
  const [translationOpen, setTranslationOpen] = useState(false);
  const [translationTab, setTranslationTab] =
    useState<ReaderTranslationTab>("trMode");
  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ReaderConfigTab>("reading");
  const [pageActionsUrl, setPageActionsUrl] = useState<string | null>(null);

  const sheet: ReaderChromeSheetState = {
    readingModeSheetOpen: readingModeOpen,
    rotationSheetOpen: rotationOpen,
    pendingReadingMode,
    pendingDirection,
    pendingOrientation,
    translationOpen,
    translationTab,
    configOpen,
    configTab,
    pageActionsUrl,
  };

  const goBack = () => {
    if (mangaId) {
      onOpenMangaInfo({ provider: source, id: mangaId });
    } else {
      onBack();
    }
  };

  const openSettings = () => {
    setReadingModeOpen(false);
    setRotationOpen(false);
    setTranslationOpen(false);
    setConfigOpen(true);
  };

  const openTranslationOptions = () => {
    setReadingModeOpen(false);
    setRotationOpen(false);
    setConfigOpen(false);
    setTranslationOpen(true);
  };

  const openTranslationSetup = () => {
    setConfigOpen(false);
    setTranslationOpen(true);
    setTranslationTab("trMode");
  };

  const openReadingModeSheet = () => {
    setPendingReadingMode(chrome.readingMode);
    setPendingDirection(chrome.pagedDirection);
    setReadingModeOpen(true);
  };

  const openRotationSheet = () => {
    setPendingOrientation(chrome.orientation);
    setRotationOpen(true);
  };

  const closeChrome = () => {
    setConfigOpen(false);
    setTranslationOpen(false);
    setReadingModeOpen(false);
    setRotationOpen(false);
    setPageActionsUrl(null);
    setShowHeader(false);
  };

  const chapterLabel =
    (chapterTitle ?? "") || chapterNumberLabel(title, chapterId);

  const goPrevChapter = () => {
    if (!prevChapterId) return;
    void openAdjacentChapter(prevChapterId, {
      source,
      mangaId,
      title,
      mangaTitle,
      thumbnailUrl,
      language,
      onReplaceReader,
    });
  };

  const goNextChapter = () => {
    if (!nextChapterId) return;
    void openAdjacentChapter(nextChapterId, {
      source,
      mangaId,
      title,
      mangaTitle,
      thumbnailUrl,
      language,
      onReplaceReader,
    });
  };

  const navFlipped = chapterNavigationFlipped(
    chrome.readingMode,
    chrome.pagedDirection,
  );

  return {
    sheet,
    setConfigOpen,
    setConfigTab,
    setTranslationOpen,
    setTranslationTab,
    setPageActionsUrl,
    setReadingModeOpen,
    setRotationOpen,
    setPendingReadingMode,
    setPendingDirection,
    setPendingOrientation,
    goBack,
    openSettings,
    openTranslationOptions,
    openTranslationSetup,
    openReadingModeSheet,
    openRotationSheet,
    closeChrome,
    chapterLabel,
    canPrevChapter: navFlipped ? !!nextChapterId : !!prevChapterId,
    canNextChapter: navFlipped ? !!prevChapterId : !!nextChapterId,
    onPrevChapter: navFlipped ? goNextChapter : goPrevChapter,
    onNextChapter: navFlipped ? goPrevChapter : goNextChapter,
  };
}