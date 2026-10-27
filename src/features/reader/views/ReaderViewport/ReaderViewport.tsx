import { Animated, StyleSheet, View } from "react-native";

import ReaderTapZonePreview from "../../components/overlays/ReaderTapZonePreview";
import PagedReader from "../paged/PagedReader";
import StripReader from "../strip/StripReader";
import type { ReaderViewportProps } from "./ReaderViewport.types";

/**
 * Presentation host for the two reader views.
 *
 * The screen keeps page loading, scroll refs and gesture callbacks. This
 * component owns only the paged/strip branch and the viewport-level overlays.
 */
export default function ReaderViewport({
  displayItems,
  pageOffsets,
  bodySize,
  chrome,
  pagedMode,
  pageBackground,
  pagedListRef,
  stripListRef,
  currentDisplayIndex,
  horizontalList,
  rtl,
  resetKey,
  pageFlashOpacity,
  renderPage,
  onViewableItemsChanged,
  viewabilityConfig,
  getItemLayout,
  onScrollBeginDrag,
  onMomentumScrollEnd,
  onScrollToIndexFailed,
  onStripScroll,
  onStripViewportChange,
  onStripTap,
  onStripLongPress,
}: ReaderViewportProps) {
  return (
    <View style={[styles.container, { backgroundColor: pageBackground }]}>
      {pagedMode ? (
        <PagedReader
          listRef={pagedListRef}
          data={displayItems}
          horizontal={horizontalList}
          inverted={rtl}
          pagingEnabled
          keyExtractor={(item) => item.key}
          initialNumToRender={1}
          maxToRenderPerBatch={4}
          windowSize={5}
          updateCellsBatchingPeriod={60}
          scrollEnabled
          nestedScrollEnabled
          directionalLockEnabled
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          scrollEventThrottle={32}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollToIndexFailed={onScrollToIndexFailed}
          contentContainerStyle={
            horizontalList ? styles.horizontalContent : styles.verticalContent
          }
          renderItem={({ item, index }) => renderPage(item, index)}
        />
      ) : (
        <StripReader
          ref={stripListRef}
          items={displayItems}
          offsets={pageOffsets}
          viewport={bodySize}
          resetKey={resetKey}
          initialOffset={pageOffsets[currentDisplayIndex] ?? 0}
          onScroll={onStripScroll}
          onViewportChange={onStripViewportChange}
          onScrollBeginDrag={onScrollBeginDrag}
          onTap={onStripTap}
          onLongPress={onStripLongPress}
          renderPage={renderPage}
        />
      )}

      <ReaderTapZonePreview
        layout={chrome.tapZoneLayout}
        invert={chrome.invertTapZones}
        rtl={rtl}
        width={bodySize.width}
        height={bodySize.height}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.pageFlash, { opacity: pageFlashOpacity }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  verticalContent: { paddingBottom: 24 },
  horizontalContent: { paddingHorizontal: 0 },
  pageFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 15,
  },
});
