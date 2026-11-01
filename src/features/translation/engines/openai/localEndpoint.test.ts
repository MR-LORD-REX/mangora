import assert from "node:assert/strict";
import test from "node:test";

import {
  allowsKeylessTranslation,
  isLocalTranslationEndpoint,
} from "@shared/contracts/translationProvider";

test("loopback and private LAN endpoints may be keyless", () => {
  for (const url of [
    "http://localhost:11434/v1",
    "http://127.0.0.1:8080/v1",
    "http://192.168.1.20:8080/v1",
    "http://10.0.0.5:8000/v1",
    "http://172.20.1.2:8000/v1",
    "https://192.168.1.20/v1",
  ]) {
    assert.equal(isLocalTranslationEndpoint(url), true, url);
    assert.equal(allowsKeylessTranslation(url), true, url);
  }
});

test("public endpoints still require API keys", () => {
  for (const url of [
    "https://api.openai.com/v1",
    "https://172.32.1.2/v1",
    "https://example.com/v1",
  ]) {
    assert.equal(isLocalTranslationEndpoint(url), false, url);
    assert.equal(allowsKeylessTranslation(url), false, url);
  }
});
