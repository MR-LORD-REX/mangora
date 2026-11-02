import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS } from "@core/settings/settingsSchema";

import { cacheVersionForJob, settingsForJob } from "./jobCacheIdentity";

test("queued provider identity survives later settings changes and fallback", () => {
  const original = {
    ...DEFAULT_SETTINGS,
    translationBaseUrl: "http://192.168.1.20:8080/v1",
    translationModels: ["model-a", "model-b"],
    translationModelId: "model-a",
  };
  const job = {
    engine: "openai" as const,
    regionDetectorId: "rtdetr-comic-v4" as const,
    translationBaseUrl: original.translationBaseUrl,
    translationModels: original.translationModels,
    translationModelId: original.translationModelId,
    autoModelSwitch: true,
  };
  const changed = {
    ...original,
    translationBaseUrl: "http://192.168.1.21:8080/v1",
    translationModels: ["model-c"],
    translationModelId: "model-c",
    translationApiKey: "rotated-key",
  };
  assert.equal(cacheVersionForJob(job, original), cacheVersionForJob(job, changed));
  assert.equal(settingsForJob(job, changed).translationApiKey, "rotated-key");
  assert.equal(settingsForJob(job, changed).translationModelId, "model-a");
  assert.match(cacheVersionForJob(job, changed), /model-a/);
  assert.equal(cacheVersionForJob(job, changed).includes("rotated-key"), false);
});
