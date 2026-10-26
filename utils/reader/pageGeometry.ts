import { Dimensions } from "react-native";

import { pageGeometry as resolvePageGeometry } from "@features/reader";
import type {
  PageDims,
  PageGeometry,
  ReaderPageSplitHalf,
} from "@features/reader";
import type {
  ReaderImageScaleType,
  ReaderReadingMode,
} from "@core/settings/settingsSchema";

const windowDimensions = Dimensions.get("window");
const fallbackBody: PageDims = {
  width: windowDimensions.width,
  height: windowDimensions.height,
};

export type { PageDims, PageGeometry, ReaderPageSplitHalf };

export function pageGeometry(
  url: string,
  mode: ReaderReadingMode,
  sidePadding: number,
  body: PageDims,
  dims: Record<string, PageDims>,
  imageScaleType: ReaderImageScaleType = "fitScreen",
  rotateWidePagesToFit = false,
  splitHalf: ReaderPageSplitHalf | null = null,
): PageGeometry {
  return resolvePageGeometry(
    url,
    mode,
    sidePadding,
    body,
    dims,
    imageScaleType,
    rotateWidePagesToFit,
    splitHalf,
    fallbackBody,
  );
}
