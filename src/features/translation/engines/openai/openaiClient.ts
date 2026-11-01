/**
 * OpenAI-compatible chat-completions transport.
 *
 * Mangora owns this small fetch-based adapter instead of depending on the
 * official SDK. It runs in Hermes, supports user-hosted LAN endpoints and
 * shares one strict JSON contract with every configured provider.
 */

import {
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
  parseBatchJson,
  validateBatchResults,
  type TranslationBatchResult,
  type TranslationPagePayload,
} from "../shared/batchPrompt";
import {
  allowsKeylessTranslation,
  DEFAULT_TRANSLATION_MODELS,
  normalizeTranslationBaseUrl,
} from "@shared/contracts";

/** Endpoints that reject JSON mode commonly return one of these statuses. */
function rejectsJsonMode(error: unknown): boolean {
  return (
    error instanceof OpenAiCompatibleError &&
    (error.status === 400 || error.status === 422)
  );
}

const REQUEST_TIMEOUT_MS = 60_000;

export class OpenAiCompatibleError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "OpenAiCompatibleError";
    this.status = status;
    this.code = code;
  }
}

export interface OpenAiUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface OpenAiBatchResponse {
  results: TranslationBatchResult[];
  usage: OpenAiUsageInfo;
}

export interface OpenAiBatchRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  sourceCode: string;
  targetCode: string;
  history: TranslationPagePayload[];
  batch: TranslationPagePayload[];
  /** Include JSON mode only when the endpoint supports it. */
  jsonMode?: boolean;
}

interface ChatCompletionData {
  choices?: { message?: { content?: unknown } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface RequestOptions {
  url: string;
  apiKey: string;
  body: unknown;
  /** Translation requests need text; a connection probe may only need a valid reply. */
  requireText?: boolean;
}

function errorFrom(
  status: number,
  data: unknown,
  rawBody: string,
  url: string,
): OpenAiCompatibleError {
  const root = data as {
    error?: { message?: string; code?: string | number };
    message?: string;
  } | null;
  const detail =
    root?.error?.message ||
    root?.message ||
    rawBody.trim().slice(0, 240) ||
    "No error body was returned.";
  const message =
    "HTTP " + status + " from " + url + ": " + detail;
  const code = root?.error?.code == null ? undefined : String(root.error.code);
  if (status === 429) {
    return new OpenAiCompatibleError(message, status, code || "RATE_LIMIT");
  }
  return new OpenAiCompatibleError(message, status, code);
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        const item = part as { text?: unknown };
        return typeof item.text === "string" ? item.text : "";
      })
      .join("");
  }
  return "";
}

async function requestCompletion(
  opts: RequestOptions,
): Promise<{ text: string; data: ChatCompletionData }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (opts.apiKey) headers.Authorization = "Bearer " + opts.apiKey;
    const response = await fetch(opts.url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(opts.body),
    });
    const rawBody = await response.text().catch(() => "");
    let data: ChatCompletionData | null = null;
    try {
      data = rawBody ? (JSON.parse(rawBody) as ChatCompletionData) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      throw errorFrom(response.status, data, rawBody, opts.url);
    }
    if (!data) {
      throw new OpenAiCompatibleError(
        "The endpoint returned a non-JSON response from " + opts.url + ".",
      );
    }
    const text = extractText(data.choices?.[0]?.message?.content).trim();
    if (opts.requireText !== false && !text) {
      throw new OpenAiCompatibleError("The endpoint returned an empty response.");
    }
    if (opts.requireText === false && !Array.isArray(data.choices)) {
      throw new OpenAiCompatibleError(
        "The endpoint returned an invalid chat-completions response from " +
          opts.url +
          ".",
      );
    }
    return { text, data };
  } catch (error) {
    if (error instanceof OpenAiCompatibleError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenAiCompatibleError(
        "The translation request to " + opts.url + " timed out.",
        undefined,
        "TIMEOUT",
      );
    }
    throw new OpenAiCompatibleError(
      "Could not reach " +
        opts.url +
        (error instanceof Error ? ": " + error.message : "."),
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Joins a base URL and an API path without duplicating a full endpoint. */
export function translationEndpoint(baseUrl: string, path: string): string {
  const base = normalizeTranslationBaseUrl(baseUrl);
  if (!base) throw new OpenAiCompatibleError("Set the API base URL first.");
  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  if (base.toLowerCase().endsWith(normalizedPath.toLowerCase())) {
    return base;
  }
  return base + normalizedPath;
}

/** Sends one strict-JSON translation batch to a chat-completions endpoint. */
export async function translateOpenAiCompatibleBatch(
  opts: OpenAiBatchRequest,
): Promise<OpenAiBatchResponse> {
  const system = buildTranslationSystemPrompt(
    opts.sourceCode,
    opts.targetCode,
  );
  const user = buildTranslationUserPrompt({
    sourceCode: opts.sourceCode,
    targetCode: opts.targetCode,
    history: opts.history,
    batch: opts.batch,
  });
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  const url = translationEndpoint(opts.baseUrl, "/chat/completions");
  if (opts.jsonMode !== false) {
    body.response_format = { type: "json_object" };
  }
  let result: { text: string; data: ChatCompletionData };
  try {
    result = await requestCompletion({ url, apiKey: opts.apiKey, body });
  } catch (error) {
    if (opts.jsonMode === false || !rejectsJsonMode(error)) throw error;
    const fallbackBody = { ...body };
    delete fallbackBody.response_format;
    result = await requestCompletion({
      url,
      apiKey: opts.apiKey,
      body: fallbackBody,
    });
  }
  const parsed = parseBatchJson(result.text);
  const results = validateBatchResults(parsed, opts.batch);
  return {
    results,
    usage: {
      inputTokens: result.data.usage?.prompt_tokens ?? 0,
      outputTokens: result.data.usage?.completion_tokens ?? 0,
      totalTokens: result.data.usage?.total_tokens ?? 0,
    },
  };
}

/** Checks URL, auth and model availability without changing cached content. */
export async function validateOpenAiCompatibleEndpoint(opts: {
  baseUrl: string;
  apiKey: string;
  model?: string;
}): Promise<void> {
  const model = (opts.model || DEFAULT_TRANSLATION_MODELS[0]).trim();
  if (!opts.apiKey.trim() && !allowsKeylessTranslation(opts.baseUrl)) {
    throw new OpenAiCompatibleError(
      "Enter an API key for this endpoint. Keyless access is limited to localhost and private-LAN servers.",
    );
  }
  if (!model) {
    throw new OpenAiCompatibleError("Enter a model name for this endpoint.");
  }
  const url = translationEndpoint(opts.baseUrl, "/chat/completions");
  await requestCompletion({
    url,
    apiKey: opts.apiKey.trim(),
    body: {
      model,
      temperature: 0,
      messages: [{ role: "user", content: "Reply with OK." }],
    },
    requireText: false,
  });
}

/** Returns true for errors that are safe to retry with another model. */
export function isOpenAiRateLimitError(error: unknown): boolean {
  return (
    error instanceof OpenAiCompatibleError &&
    (error.status === 429 || error.code === "RATE_LIMIT")
  );
}
