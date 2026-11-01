import assert from "node:assert/strict";
import test from "node:test";

import { rtDetrTensorData } from "./rtdetrTensor";

test("RT-DETR accepts float and int64 tensor data", () => {
  const boxes = new Float32Array([1, 2, 3, 4]);
  const labels = new BigInt64Array([0n, 1n, 2n]);
  const masks = new Uint32Array([1, 0, 1]);

  assert.equal(rtDetrTensorData({ data: boxes }), boxes);
  assert.equal(rtDetrTensorData({ data: labels }), labels);
  assert.equal(rtDetrTensorData({ data: masks }), masks);
  assert.equal(Number(rtDetrTensorData({ data: labels })[2]), 2);
});

test("RT-DETR rejects a non-typed output with a named error", () => {
  assert.throws(
    () => rtDetrTensorData({ data: new DataView(new ArrayBuffer(8)) }, "labels"),
    /invalid labels tensor \(DataView\)/,
  );
  assert.throws(
    () => rtDetrTensorData({}, "scores"),
    /invalid scores tensor \(missing\)/,
  );
});
