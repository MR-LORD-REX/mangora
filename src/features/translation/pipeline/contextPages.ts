/**
 * Shared source-text context selection for AI translation batches.
 *
 * Reader and pretranslate collect OCR at different times and in different
 * orders. This module is deliberately pure so context is always chosen by
 * page position, never by OCR completion order or queue insertion order.
 */

export interface ContextPage<T> {
  pageIndex: number;
  value: T;
}

/**
 * Deduplicates candidates by page index before applying the window. A reader
 * may discover the same page through its in-memory OCR store and the persisted
 * cache; counting that page twice would both distort the window and duplicate
 * context tokens.
 */
export function selectPreviousContextPagesUnique<T>(
  pages: readonly ContextPage<T>[],
  currentPageIndex: number,
  maxPages: number,
  preferred?: (left: T, right: T) => boolean,
): T[] {
  const byIndex = new Map<number, T>();
  for (const page of pages) {
    if (
      !Number.isFinite(page.pageIndex) ||
      page.pageIndex < 0 ||
      page.pageIndex >= currentPageIndex
    ) {
      continue;
    }
    const existing = byIndex.get(page.pageIndex);
    if (existing === undefined) {
      byIndex.set(page.pageIndex, page.value);
      continue;
    }
    if (preferred?.(page.value, existing)) {
      byIndex.set(page.pageIndex, page.value);
    }
  }
  return selectPreviousContextPages(
    [...byIndex].map(([pageIndex, value]) => ({ pageIndex, value })),
    currentPageIndex,
    maxPages,
  ).map((entry) => entry.value);
}

/**
 * Returns up to `maxPages` pages immediately before `currentPageIndex`,
 * sorted by page position. The current page is excluded even if a caller
 * accidentally includes it.
 */
export function selectPreviousContextPages<T>(
  pages: readonly ContextPage<T>[],
  currentPageIndex: number,
  maxPages: number,
): ContextPage<T>[] {
  const limit = Math.max(0, Math.floor(maxPages));
  if (limit === 0) return [];
  return pages
    .filter(
      (page) =>
        Number.isFinite(page.pageIndex) &&
        page.pageIndex >= 0 &&
        page.pageIndex < currentPageIndex,
    )
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .slice(-limit);
}
