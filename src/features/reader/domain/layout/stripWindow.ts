export interface StripWindow {
  start: number;
  end: number;
}

export function stripWindowForOffset(
  offsets: readonly number[],
  itemCount: number,
  offset: number,
  viewportSize: number,
  overscan = 1,
): StripWindow {
  if (itemCount <= 0) return { start: 0, end: -1 };

  const safeOffset = Math.max(0, offset);
  let active = 0;
  while (
    active + 1 < itemCount &&
    (offsets[active + 1] ?? Number.POSITIVE_INFINITY) <= safeOffset
  ) {
    active += 1;
  }

  const upperBound = safeOffset + Math.max(0, viewportSize);
  let end = active;
  while (
    end + 1 < itemCount &&
    (offsets[end + 1] ?? Number.POSITIVE_INFINITY) < upperBound
  ) {
    end += 1;
  }

  return {
    start: Math.max(0, active - Math.max(0, overscan)),
    end: Math.min(itemCount - 1, end + Math.max(0, overscan)),
  };
}
