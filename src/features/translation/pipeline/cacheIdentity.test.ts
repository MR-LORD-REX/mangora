import assert from "node:assert/strict";
import test from "node:test";

import type { TranslationProviderConfig } from "@shared/contracts";
import { pageCacheIdentity, translationCacheKey } from "./cacheIdentity";

const provider: TranslationProviderConfig = {
  engine: "openai",
  provider: "openai-compatible",
  baseUrl: "http://192.168.1.20:8080/v1",
  apiKey: "secret",
  model: "qwen-local",
  models: ["qwen-local"],
  fallbackModels: ["qwen-local"],
  endpointKey: "http://192.168.1.20:8080/v1",
};

test("cache keys separate endpoint, model and detector", () => {
  const base = pageCacheIdentity({
    engine: "openai",
    provider,
    model: "qwen-local",
    detectorId: "rtdetr-comic-v4",
  });
  assert.notEqual(
    translationCacheKey(base),
    translationCacheKey({ ...base, model: "another-model" }),
  );
  assert.notEqual(
    translationCacheKey(base),
    translationCacheKey({ ...base, detectorId: "manga109-bubble-seg" }),
  );
  assert.notEqual(
    translationCacheKey(base),
    translationCacheKey({
      ...base,
      endpointKey: "http://192.168.1.21:8080/v1",
    }),
  );
  assert.notEqual(
    translationCacheKey(base),
    translationCacheKey(
      pageCacheIdentity({
        engine: "free",
        provider: null,
        model: null,
        detectorId: "rtdetr-comic-v4",
      }),
    ),
  );
});

test("cache keys never include secrets and are stable for one identity", () => {
  const identity = pageCacheIdentity({
    engine: "openai",
    provider,
    model: "qwen-local",
    detectorId: "manga109-bubble-seg",
  });
  const key = translationCacheKey(identity);
  assert.equal(key, translationCacheKey(identity));
  assert.equal(key.includes("secret"), false);
  assert.match(key, /^v4\|openai\|openai-compatible\|/);
});
