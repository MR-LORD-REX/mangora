/**
 * Maps a strip scroll offset to the display row containing the reading line.
 * Offsets are prefix sums over variable-height rows (including webtoon gaps).
 */
export function displayIndexForOffset(offsets: readonly number[], offset: number) {
  if (offsets.length < 2) return 0;
  const rowCount = offsets.length - 1;
  let low = 0;
  let high = rowCount - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (offsets[mid + 1] > offset) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}
