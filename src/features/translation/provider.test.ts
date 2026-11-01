import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRANSLATION_BASE_URL,
  DEFAULT_TRANSLATION_MODELS,
  isGeminiBaseUrl,
  normalizeTranslationBaseUrl,
} from "@shared/contracts/translationProvider";
import { DEFAULT_SETTINGS } from "@core/settings/settingsSchema";
import {
  resolveTranslationProvider,
  translationProviderReadinessError,
} from "./provider";

test("Gemini is only the default OpenAI-compatible endpoint", () => {
  const provider = resolveTranslationProvider(DEFAULT_SETTINGS, "openai");
  assert.equal(provider.engine, "openai");
  assert.equal(provider.provider, "openai-compatible");
  assert.equal(provider.baseUrl, DEFAULT_TRANSLATION_BASE_URL);
  assert.equal(provider.model, DEFAULT_TRANSLATION_MODELS[0]);
  assert.deepEqual(provider.models, DEFAULT_TRANSLATION_MODELS);
});

test("auto model switch exposes all configured fallback models", () => {
  const provider = resolveTranslationProvider(
    {
      ...DEFAULT_SETTINGS,
      readerAutoModelSwitch: true,
    },
    "openai",
  );
  assert.deepEqual(provider.fallbackModels, DEFAULT_TRANSLATION_MODELS);
});

test("custom endpoint keeps its own keyless model catalogue", () => {
  const provider = resolveTranslationProvider(
    {
      ...DEFAULT_SETTINGS,
      translationBaseUrl: "http://127.0.0.1:8080/v1",
      translationApiKey: "",
      translationModels: ["local-model"],
      translationModelId: "local-model",
    },
    "openai",
  );
  assert.equal(provider.provider, "openai-compatible");
  assert.equal(provider.model, "local-model");
  assert.equal(provider.endpointKey, "http://127.0.0.1:8080/v1");
  assert.equal(translationProviderReadinessError(provider), null);
});

test("a stale selected model falls back to the first configured model", () => {
  const provider = resolveTranslationProvider(
    {
      ...DEFAULT_SETTINGS,
      translationModels: ["first", "second"],
      translationModelId: "removed-model",
    },
    "openai",
  );
  assert.equal(provider.model, "first");
});

test("hosted endpoints require a key while private LAN does not", () => {
  const hosted = resolveTranslationProvider(DEFAULT_SETTINGS, "openai");
  assert.match(
    translationProviderReadinessError(hosted) ?? "",
    /needs an API key/,
  );

  const lan = resolveTranslationProvider(
    {
      ...DEFAULT_SETTINGS,
      translationBaseUrl: "http://192.168.1.20:8080/v1",
      translationModels: ["local-model"],
      translationModelId: "local-model",
    },
    "openai",
  );
  assert.equal(translationProviderReadinessError(lan), null);
});

test("a missing model is rejected before translation starts", () => {
  const provider = resolveTranslationProvider(
    {
      ...DEFAULT_SETTINGS,
      translationBaseUrl: "http://localhost:11434/v1",
      translationModels: [],
      translationModelId: "",
    },
    "openai",
  );
  assert.match(
    translationProviderReadinessError(provider) ?? "",
    /needs a model/,
  );
});

test("the old native Gemini URL migrates to its OpenAI-compatible root", () => {
  assert.equal(
    normalizeTranslationBaseUrl(
      "https://generativelanguage.googleapis.com/v1beta/",
    ),
    "https://generativelanguage.googleapis.com/v1beta/openai",
  );
});

test("Gemini detection matches the hostname, not a URL substring", () => {
  assert.equal(isGeminiBaseUrl(DEFAULT_TRANSLATION_BASE_URL), true);
  assert.equal(isGeminiBaseUrl("https://api.openai.com/v1"), false);
  assert.equal(
    isGeminiBaseUrl("https://generativelanguage.googleapis.com.evil.test/v1"),
    false,
  );
  assert.equal(
    isGeminiBaseUrl("https://example.test/generativelanguage.googleapis.com"),
    false,
  );
});
