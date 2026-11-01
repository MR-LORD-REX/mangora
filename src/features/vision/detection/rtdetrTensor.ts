/** RT-DETR output helpers kept free of native runtime imports for tests. */

export class RtDetrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RtDetrError";
  }
}

export type RtDetrTensorValue = number | bigint;

/**
 * ONNX Runtime returns Tensor.data as a typed array. The class depends on the
 * graph dtype: labels are commonly int64 (BigInt64Array), while boxes and
 * scores are float32. Accept every numeric ArrayBuffer view rather than making
 * assumptions about one export.
 */
export function rtDetrTensorData(
  value: unknown,
  outputName = "output",
): ArrayLike<RtDetrTensorValue> {
  const data = (value as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) {
    return data as RtDetrTensorValue[];
  }
  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    return data as unknown as ArrayLike<RtDetrTensorValue>;
  }
  const actualType =
    data == null
      ? "missing"
      : (data as { constructor?: { name?: string } }).constructor?.name ??
        typeof data;
  throw new RtDetrError(
    "RT-DETR returned an invalid " +
      outputName +
      " tensor (" +
      actualType +
      ").",
  );
}
