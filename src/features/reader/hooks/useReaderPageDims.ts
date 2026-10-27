/**
 * Natural page dimensions for reader geometry.
 *
 * Only pages near the visible page are measured. Measuring a whole 300-page
 * chapter before first paint floods the extension host with image requests and
 * leaves placeholder heights in the strip. The prefetch window stays bounded
 * and is reset when the source page list changes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "react-native";

import type { PageDims } from "../domain/layout/pageGeometry";
import { isLongStripMode } from "../domain/legacyReadingModes";
import { imageHeadersForPage } from "@/utils/reader/imageHeaders";

export interface ReaderPageDimsOptions {
  pages: string[];
  source: string;
  readingMode: Parameters<typeof isLongStripMode>[0];
  currentPageIndex: number;
  imageWindow: ReadonlySet<number>;
}

export interface ReaderPageDimsState {
  pageDims: Record<string, PageDims>;
  rememberPageDims: (url: string, width: number, height: number) => void;
}

export function useReaderPageDims({
  pages,
  source,
  readingMode,
  currentPageIndex,
  imageWindow,
}: ReaderPageDimsOptions): ReaderPageDimsState {
  const [pageDims, setPageDims] = useState<Record<string, PageDims>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  const rememberPageDims = useCallback(
    (url: string, width: number, height: number) => {
      if (!width || !height) return;
      setPageDims((previous) => {
        const current = previous[url];
        if (current && current.width === width && current.height === height) {
          return previous;
        }
        return { ...previous, [url]: { width, height } };
      });
    },
    [],
  );

  useEffect(() => {
    requestedRef.current = new Set();
  }, [pages]);

  useEffect(() => {
    if (!pages.length) return;
    const requested = requestedRef.current;
    const prefetchRadius = isLongStripMode(readingMode) ? 8 : 2;
    const wanted = new Set<number>(imageWindow);
    for (
      let index = Math.max(0, currentPageIndex);
      index <= Math.min(pages.length - 1, currentPageIndex + prefetchRadius);
      index += 1
    ) {
      wanted.add(index);
    }
    for (const index of wanted) {
      const url = pages[index];
      if (!url || requested.has(url) || pageDims[url]) continue;
      requested.add(url);
      const onSize = (width: number, height: number) =>
        rememberPageDims(url, width, height);
      const onError = () => undefined;
      if (url.startsWith("file://")) {
        Image.getSize(url, onSize, onError);
        continue;
      }
      const headers = imageHeadersForPage(source, url);
      if (headers && typeof (Image as any).getSizeWithHeaders === "function") {
        (Image as any).getSizeWithHeaders(url, headers, onSize, onError);
      } else {
        Image.getSize(url, onSize, onError);
      }
    }
  }, [
    currentPageIndex,
    imageWindow,
    pageDims,
    pages,
    readingMode,
    rememberPageDims,
    source,
  ]);

  return { pageDims, rememberPageDims };
}
