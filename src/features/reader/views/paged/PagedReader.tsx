import type { RefObject } from "react";
import { FlatList, type FlatListProps } from "react-native";

import type { ReaderDisplayItem } from "../../domain/layout/readerItems";

export type PagedReaderProps = Omit<
  FlatListProps<ReaderDisplayItem>,
  "ref"
> & {
  listRef: RefObject<FlatList<ReaderDisplayItem> | null>;
};

export default function PagedReader({
  listRef,
  ...props
}: PagedReaderProps) {
  return <FlatList ref={listRef} {...props} />;
}
