import assert from "node:assert/strict";
import test from "node:test";

import { TranslationComputeCoordinator } from "./translationComputeCoordinator";

test("reader work takes the next permit before queued background work", async () => {
  const coordinator = new TranslationComputeCoordinator();
  const order: string[] = [];
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const started = new Promise<void>((resolve) => { firstStarted = resolve; });
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const first = coordinator.run("background", async () => {
    order.push("background first");
    firstStarted();
    await firstGate;
  });
  await started;
  const second = coordinator.run("background", async () => { order.push("background second"); });
  const maintenance = coordinator.run("maintenance", async () => { order.push("maintenance"); });
  const reader = coordinator.run("reader", async () => { order.push("reader"); });
  releaseFirst();
  await Promise.all([first, second, maintenance, reader]);
  assert.deepEqual(order, ["background first", "reader", "maintenance", "background second"]);
});

test("a rejected vision task releases its permit", async () => {
  const coordinator = new TranslationComputeCoordinator();
  await assert.rejects(coordinator.run("reader", async () => { throw new Error("failed"); }), /failed/);
  const result = await coordinator.run("background", async () => "next task ran");
  assert.equal(result, "next task ran");
});
