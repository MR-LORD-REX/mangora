/**
 * Reader chrome stack.
 *
 * The header, configuration/translation panels, bottom bar, sheets and
 * transient feedback sit above the page surface. ReaderScreen owns all
 * navigation and gesture callbacks; this module owns only their layout.
 */
import { Menu } from "lucide-react-native";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";

import type { ReaderChromeStackProps } from "./ReaderChromeStack.types";
import ReaderConfigPanel from "../panels/ReaderConfigPanel";
import ReaderPanelSheetMotion from "../panels/ReaderPanelSheetMotion";
import ReaderPageActionsSheet from "../panels/ReaderPageActionsSheet";
import ReaderReadingModeSheet from "../panels/ReaderReadingModeSheet";
import ReaderRotationSheet from "../panels/ReaderRotationSheet";
import ReaderTranslationPanel from "../panels/ReaderTranslationPanel";
import SingleTranslateFab from "../overlays/SingleTranslateFab";
import ReaderBottomBar from "./ReaderBottomBar";
import ReaderHeader from "./ReaderHeader";

export default function ReaderChromeStack({
  showHeader,
  setShowHeader,
  chrome,
  mangaTitle,
  chapterLabel,
  autoTranslation,
  activeTranslationJobs,
  translationMode,
  toggleAutoTranslation,
  openTranslationOptions,
  goBack,
  closeChrome,
  bookmarkSlot,
  downloadSlot,
  configOpen,
  configTab,
  setConfigTab,
  closeConfig,
  handleChromeChange,
  defaultZoomScale,
  handleSelectDefaultZoomScale,
  scrollSpeed,
  handleSelectScrollSpeed,
  translationOpen,
  translationTab,
  setTranslationTab,
  closeTranslation,
  readerLanguage,
  ocrLanguage,
  autoLanguage,
  targetLanguage,
  handleSelectReaderLanguage,
  handleSelectTargetLanguage,
  translationEngine,
  handleSelectTranslationEngine,
  handleSelectTranslationMode,
  geminiModelId,
  handleSelectGeminiModel,
  autoModelSwitch,
  handleChangeAutoModelSwitch,
  ocrLookahead,
  handleChangeLookahead,
  metrics,
  handleClearTrCache,
  overlayFont,
  handleSelectOverlayFont,
  overlayFontWeight,
  handleSelectOverlayFontWeight,
  overlayFontScale,
  handleSelectOverlayFontScale,
  overlayTextColor,
  handleSelectOverlayTextColor,
  showPageStatus,
  handleChangeShowPageStatus,
  hideTranslated,
  handleChangeHideTranslated,
  currentPageIndex,
  pagesLength,
  scrollToPage,
  canPrevChapter,
  canNextChapter,
  onPrevChapter,
  onNextChapter,
  readingMode,
  openReadingModeSheet,
  openRotationSheet,
  autoScroll,
  setAutoScroll,
  pagedMode,
  openSettings,
  readingModeSheetOpen,
  pendingReadingMode,
  pendingDirection,
  setPendingReadingMode,
  setPendingDirection,
  setReadingModeSheetOpen,
  rotationSheetOpen,
  pendingOrientation,
  setPendingOrientation,
  setRotationSheetOpen,
  pageActionsUrl,
  setPageActionsUrl,
  retryPage,
  pipelineError,
  singlePageUrl,
  singleStage,
  singlePageBusy,
  translateSinglePage,
}: ReaderChromeStackProps) {
  return (
    <>
      {showHeader && (
        <ReaderHeader
          mangaTitle={mangaTitle}
          chapterLabel={chapterLabel}
          translateActive={autoTranslation}
          translationBusy={activeTranslationJobs > 0}
          showTranslateToggle={translationMode !== "single"}
          onToggleTranslate={toggleAutoTranslation}
          onOpenTranslation={openTranslationOptions}
          onBack={goBack}
          onClose={closeChrome}
          bookmarkSlot={bookmarkSlot}
          downloadSlot={downloadSlot}
        />
      )}

      {showHeader && (
        <ReaderPanelSheetMotion visible={configOpen}>
          <ReaderConfigPanel
            tab={configTab}
            onTabChange={setConfigTab}
            onClose={closeConfig}
            chrome={chrome}
            onChangeChrome={handleChromeChange}
            defaultZoomScale={defaultZoomScale}
            onChangeDefaultZoomScale={handleSelectDefaultZoomScale}
            scrollSpeed={scrollSpeed}
            onSelectScrollSpeed={handleSelectScrollSpeed}
          />
        </ReaderPanelSheetMotion>
      )}

      {showHeader && !configOpen && (
        <ReaderPanelSheetMotion visible={translationOpen}>
          <ReaderTranslationPanel
            tab={translationTab}
            onTabChange={setTranslationTab}
            onClose={closeTranslation}
            readerLanguage={readerLanguage}
            ocrLanguage={ocrLanguage}
            autoLanguage={autoLanguage}
            targetLanguage={targetLanguage}
            onSelectReaderLanguage={handleSelectReaderLanguage}
            onSelectTargetLanguage={handleSelectTargetLanguage}
            translationEngine={translationEngine}
            onSelectTranslationEngine={handleSelectTranslationEngine}
            translationMode={translationMode}
            onSelectTranslationMode={handleSelectTranslationMode}
            geminiModelId={geminiModelId}
            onSelectGeminiModel={handleSelectGeminiModel}
            autoModelSwitch={autoModelSwitch}
            onChangeAutoModelSwitch={handleChangeAutoModelSwitch}
            ocrLookahead={ocrLookahead}
            onChangeLookahead={handleChangeLookahead}
            metrics={metrics}
            onClearTrCache={handleClearTrCache}
            overlayFont={overlayFont}
            onChangeOverlayFont={handleSelectOverlayFont}
            overlayFontWeight={overlayFontWeight}
            onChangeOverlayFontWeight={handleSelectOverlayFontWeight}
            overlayFontScale={overlayFontScale}
            onChangeOverlayFontScale={handleSelectOverlayFontScale}
            overlayTextColor={overlayTextColor}
            onChangeOverlayTextColor={handleSelectOverlayTextColor}
            showPageStatus={showPageStatus}
            onChangeShowPageStatus={handleChangeShowPageStatus}
            hideTranslated={hideTranslated}
            onChangeHideTranslated={handleChangeHideTranslated}
          />
        </ReaderPanelSheetMotion>
      )}

      {showHeader && !configOpen && !translationOpen && (
        <ReaderBottomBar
          currentIndex={currentPageIndex}
          totalPages={pagesLength}
          onScrub={scrollToPage}
          canPrevChapter={canPrevChapter}
          canNextChapter={canNextChapter}
          onPrevChapter={onPrevChapter}
          onNextChapter={onNextChapter}
          readingMode={readingMode}
          onOpenReadingModeSheet={openReadingModeSheet}
          onOpenRotationSheet={openRotationSheet}
          autoScrollActive={autoScroll}
          autoScrollDisabled={pagedMode}
          onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
          pagedDirection={chrome.pagedDirection}
          orientation={chrome.orientation}
          cropEnabled={chrome.cropBorders}
          onToggleCrop={() =>
            handleChromeChange({ cropBorders: !chrome.cropBorders })
          }
          onOpenSettings={openSettings}
        />
      )}

      {readingModeSheetOpen && (
        <ReaderReadingModeSheet
          value={pendingReadingMode}
          pagedDirection={pendingDirection}
          onSelect={setPendingReadingMode}
          onSelectDirection={setPendingDirection}
          onRevert={() => {
            setPendingReadingMode("webtoon");
            setPendingDirection("ltr");
          }}
          onApply={() => {
            handleChromeChange({
              readingMode: pendingReadingMode,
              pagedDirection: pendingDirection,
            });
            setReadingModeSheetOpen(false);
          }}
        />
      )}

      {rotationSheetOpen && (
        <ReaderRotationSheet
          value={pendingOrientation}
          onSelect={setPendingOrientation}
          onApply={() => {
            handleChromeChange({ orientation: pendingOrientation });
            setRotationSheetOpen(false);
          }}
        />
      )}

      {pageActionsUrl && (
        <ReaderPageActionsSheet
          pageUrl={pageActionsUrl}
          hideTranslated={hideTranslated}
          onClose={() => setPageActionsUrl(null)}
          onToggleHideTranslated={() =>
            handleChangeHideTranslated(!hideTranslated)
          }
          onRetryTranslation={retryPage}
        />
      )}

      {chrome.showPageNumber && !showHeader && (
        <View style={styles.pageChip} pointerEvents="none">
          <Text style={styles.pageChipText}>
            {currentPageIndex + 1} / {pagesLength}
          </Text>
        </View>
      )}

      {!showHeader && (
        <Pressable
          onPress={() => setShowHeader(true)}
          style={styles.floatingMenuBtn}
          hitSlop={8}
          accessibilityLabel="Show reader controls"
        >
          <Menu color="#fff" size={22} />
        </Pressable>
      )}

      {pipelineError && (
        <View style={styles.errorToast}>
          <Text style={styles.errorToastText}>{pipelineError}</Text>
        </View>
      )}

      {translationMode === "single" && singlePageUrl ? (
        <SingleTranslateFab
          stage={singleStage}
          busy={singlePageBusy}
          onPress={() => translateSinglePage(singlePageUrl)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pageChip: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    backgroundColor: "rgba(10,10,14,0.7)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 20,
  },
  pageChipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  floatingMenuBtn: {
    position: "absolute",
    bottom: 26,
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,14,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
    zIndex: 35,
  },
  errorToast: {
    position: "absolute",
    bottom: 150,
    alignSelf: "center",
    backgroundColor: "#7f1d1d",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 30,
    maxWidth: Dimensions.get("window").width * 0.9,
  },
  errorToastText: { color: "#fff", fontSize: 12 },
});
