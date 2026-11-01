import assert from "node:assert/strict";
import test from "node:test";

import {
  translationEndpoint,
  translateOpenAiCompatibleBatch,
  validateOpenAiCompatibleEndpoint,
} from "./openaiClient";

const batch = [
  {
    label: "page_0",
    pageIndex: 0,
    regions: [{ regionId: 1, text: "こんにちは" }],
  },
];

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("retries once without JSON mode when a local server rejects response_format", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    if (bodies.length === 1) {
      assert.deepEqual(body.response_format, { type: "json_object" });
      return response({ error: { message: "unsupported response_format" } }, 400);
    }
    assert.equal("response_format" in body, false);
    return response({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [{ label: "page_0", regionId: 1, text: "Hello" }],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    });
  }) as typeof fetch;

  try {
    const result = await translateOpenAiCompatibleBatch({
      baseUrl: "http://127.0.0.1:8080/v1/",
      apiKey: "",
      model: "local-model",
      sourceCode: "ja",
      targetCode: "en",
      history: [],
      batch,
    });
    assert.equal(bodies.length, 2);
    assert.deepEqual(result.results, [
      { label: "page_0", regionId: 1, text: "Hello" },
    ]);
    assert.deepEqual(result.usage, {
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry a non-JSON-mode error", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return response({ error: { message: "unauthorized" } }, 401);
  }) as typeof fetch;
  try {
    await assert.rejects(
      translateOpenAiCompatibleBatch({
        baseUrl: "http://127.0.0.1:8080/v1",
        apiKey: "bad",
        model: "local-model",
        sourceCode: "ja",
        targetCode: "en",
        history: [],
        batch,
      }),
      /unauthorized/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("endpoint URL joins once and migrates the old Gemini root", () => {
  assert.equal(
    translationEndpoint("http://127.0.0.1:8080/v1/", "/chat/completions"),
    "http://127.0.0.1:8080/v1/chat/completions",
  );
  assert.equal(
    translationEndpoint(
      "http://127.0.0.1:8080/v1/chat/completions",
      "/chat/completions",
    ),
    "http://127.0.0.1:8080/v1/chat/completions",
  );
  assert.equal(
    translationEndpoint(
      "https://generativelanguage.googleapis.com/v1beta/",
      "/chat/completions",
    ),
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  );
});

test("connection test accepts a valid empty completion and omits max_tokens", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let authorization = "";
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    authorization = String((init?.headers as Record<string, string>).Authorization);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response({ choices: [{ message: { content: null } }] });
  }) as typeof fetch;

  try {
    await validateOpenAiCompatibleEndpoint({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "gemini-key",
      model: "gemini-3.5-flash-lite",
    });
    assert.equal(
      requestedUrl,
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
    assert.equal(authorization, "Bearer gemini-key");
    assert.equal(body.model, "gemini-3.5-flash-lite");
    assert.equal("max_tokens" in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("connection errors include status, URL and a plain-text body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("upstream unavailable", { status: 502 })) as typeof fetch;
  try {
    await assert.rejects(
      validateOpenAiCompatibleEndpoint({
        baseUrl: "http://127.0.0.1:8080/v1",
        apiKey: "",
        model: "local-model",
      }),
      /HTTP 502 from http:\/\/127\.0\.0\.1:8080\/v1\/chat\/completions: upstream unavailable/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
