import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
} from "@core/settings/settingsSchema";

test("settings schema keeps defaults stable", () => {
  const sanitized = sanitizeSettings({});
  assert.equal(sanitized.readerReadingMode, DEFAULT_SETTINGS.readerReadingMode);
  assert.equal(sanitized.downloadWifiOnly, DEFAULT_SETTINGS.downloadWifiOnly);
});

test("settings schema migrates the legacy combined translation mode", () => {
  const sanitized = sanitizeSettings({
    readerTranslateMode: "ai",
    readerTranslationEngine: "free",
  });
  assert.equal(sanitized.readerTranslationMode, "auto");
  assert.equal(sanitized.readerTranslationEngine, "ai");
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
