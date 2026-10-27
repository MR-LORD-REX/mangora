import type { ReactElement, RefObject } from "react";
import type {
  Animated,
  FlatList,
  ViewabilityConfig,
  ViewToken,
} from "react-native";

import type { ReaderChromeSettings } from "../../components/panels/readerChrome";
import type { ReaderDisplayItem } from "../../domain/layout/readerItems";
import type {
  StripReaderHandle,
  StripTapEvent,
  StripViewportState,
} from "../strip/StripReader";

export interface ReaderViewportProps {
  displayItems: ReaderDisplayItem[];
  pageOffsets: readonly number[];
  bodySize: { width: number; height: number };
  chrome: ReaderChromeSettings;
  pagedMode: boolean;
  pageBackground: string;
  pagedListRef: RefObject<FlatList<ReaderDisplayItem> | null>;
  stripListRef: RefObject<StripReaderHandle | null>;
  currentDisplayIndex: number;
  horizontalList: boolean;
  rtl: boolean;
  resetKey: string;
  pageFlashOpacity: Animated.Value;
  renderPage: (item: ReaderDisplayItem, index: number) => ReactElement;
  onViewableItemsChanged: (info: {
    viewableItems: ViewToken<ReaderDisplayItem>[];
    changed: ViewToken<ReaderDisplayItem>[];
  }) => void;
  viewabilityConfig: ViewabilityConfig;
  getItemLayout: (
    data: ArrayLike<ReaderDisplayItem> | null | undefined,
    index: number,
  ) => { length: number; offset: number; index: number };
  onScrollBeginDrag: () => void;
  onMomentumScrollEnd: () => void;
  onScrollToIndexFailed: (info: {
    index: number;
    averageItemLength: number;
  }) => void;
  onStripScroll: (offset: number) => void;
  onStripViewportChange: (state: StripViewportState) => void;
  onStripTap: (event: StripTapEvent) => void;
  onStripLongPress: (index: number) => void;
}

