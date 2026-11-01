import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
} from "@core/settings/settingsSchema";
import {
  DEFAULT_TRANSLATION_BASE_URL,
  DEFAULT_TRANSLATION_MODELS,
} from "@shared/contracts/translationProvider";

test("settings schema keeps defaults stable", () => {
  const sanitized = sanitizeSettings({});
  assert.equal(sanitized.readerReadingMode, DEFAULT_SETTINGS.readerReadingMode);
  assert.equal(sanitized.downloadWifiOnly, DEFAULT_SETTINGS.downloadWifiOnly);
  assert.equal(sanitized.translationBaseUrl, DEFAULT_TRANSLATION_BASE_URL);
  assert.deepEqual(sanitized.translationModels, DEFAULT_TRANSLATION_MODELS);
  assert.equal(sanitized.translationModelId, DEFAULT_TRANSLATION_MODELS[0]);
});

test("settings schema migrates the legacy combined translation mode", () => {
  const sanitized = sanitizeSettings({
    readerTranslateMode: "ai",
    readerTranslationEngine: "free",
  });
  assert.equal(sanitized.readerTranslationMode, "auto");
  assert.equal(sanitized.readerTranslationEngine, "openai");
});

test("legacy Gemini settings migrate to the generic OpenAI-compatible fields", () => {
  const sanitized = sanitizeSettings({
    readerTranslationEngine: "ai",
    geminiApiKey: "gemini-key",
    geminiModelId: "gemini-2.5-flash",
    translationBaseUrl:
      "https://generativelanguage.googleapis.com/v1beta/",
  });
  assert.equal(sanitized.readerTranslationEngine, "openai");
  assert.equal(sanitized.translationApiKey, "gemini-key");
  assert.equal(
    sanitized.translationBaseUrl,
    "https://generativelanguage.googleapis.com/v1beta/openai",
  );
  assert.deepEqual(sanitized.translationModels, DEFAULT_TRANSLATION_MODELS);
  assert.equal(sanitized.translationModelId, DEFAULT_TRANSLATION_MODELS[0]);
});

test("legacy custom endpoint settings become the same OpenAI engine", () => {
  const sanitized = sanitizeSettings({
    readerTranslationEngine: "custom",
    translationBaseUrl: "http://127.0.0.1:8080/v1/",
    customApiKey: "secret",
    customApiModels: ["qwen", "qwen", "", "llama"],
    customApiModelId: "llama",
    customApiUseGeminiKey: false,
  });
  assert.equal(sanitized.translationBaseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(sanitized.translationApiKey, "secret");
  assert.deepEqual(sanitized.translationModels, ["qwen", "llama"]);
  assert.equal(sanitized.translationModelId, "llama");
  assert.equal(sanitized.readerTranslationEngine, "openai");
});

test("global Gemini defaults are retained when the endpoint is already custom", () => {
  const sanitized = sanitizeSettings({
    readerTranslationEngine: "custom",
    translationBaseUrl: "http://127.0.0.1:8080/v1",
    customApiModels: [],
    customApiModelId: "",
  });
  assert.deepEqual(sanitized.translationModels, DEFAULT_TRANSLATION_MODELS);
  assert.equal(sanitized.translationModelId, DEFAULT_TRANSLATION_MODELS[0]);
});

test("settings schema defaults and sanitizes the source card layout", () => {
  assert.equal(sanitizeSettings({}).sourceCardLayout, "grid2");
  assert.equal(
    sanitizeSettings({ sourceCardLayout: "grid4" }).sourceCardLayout,
    "grid4",
  );
  assert.equal(
    sanitizeSettings({ sourceCardLayout: "three-columns" }).sourceCardLayout,
    "grid2",
  );
});

test("settings schema clamps numeric and enum values", () => {
  const sanitized = sanitizeSettings({
    downloadSourceConcurrency: 99,
    downloadPageConcurrency: -4,
    readerReadingMode: "not-a-mode",
    readerDefaultZoomScale: 12,
  });
  assert.equal(sanitized.downloadSourceConcurrency, 5);
  assert.equal(sanitized.downloadPageConcurrency, 1);
  assert.equal(sanitized.readerReadingMode, DEFAULT_SETTINGS.readerReadingMode);
  assert.equal(sanitized.readerDefaultZoomScale, 1.5);
});

test("settings schema keeps model names unique and repairs a stale selection", () => {
  const sanitized = sanitizeSettings({
    translationModels: ["one", "one", "", "two"],
    translationModelId: "missing",
  });
  assert.deepEqual(sanitized.translationModels, ["one", "two"]);
  assert.equal(sanitized.translationModelId, "one");
});

test("settings schema rejects unknown detectors and falls back to RT-DETR", () => {
  const sanitized = sanitizeSettings({ regionDetectorId: "unknown-detector" });
  assert.equal(sanitized.regionDetectorId, "rtdetr-comic-v4");
});

test("settings schema migrates the removed Legacy YOLO detector", () => {
  const sanitized = sanitizeSettings({ regionDetectorId: "legacy-yolo" });
  assert.equal(sanitized.regionDetectorId, "rtdetr-comic-v4");
});
