/**
 * geminiTranslator.ts
 * ---------------------------------------------------------------------------
 * Gemini-powered, context-aware manga translation.
 *
 * Request model
 * -------------
 * The reader scans pages, OCRs each one once (RAM cache per manga) and pushes
 * every ready page into an AI worker queue. One worker is pinned to one model;
 * two workers use both catalogue models. Each generateContent call carries the
 * last N OCRed pages of ORIGINAL text (RAM only, tagged with page indexes) as
 * background context. The prompt translates only the current page batch and
 * replies with strict JSON so results map back onto overlays.
 *
 * Quotas
 * ------
 * Every attempt is persisted through services/translation/geminiUsage.ts.
 * ---------------------------------------------------------------------------
 */

import {
  GEMINI_DEFAULT_MODEL,
  geminiModelInfo,
  type GeminiModelId,
} from "./geminiModels";

/** One bubble inside a batch (source side). */
export interface GeminiBatchRegion {
  regionId: number;
  text: string;
}

/** One page inside a batch / history block. */
export interface GeminiPagePayload {
  /** Short label echoed back by the model ("page_0", "page_1", ...). */
  label: string;
  /** Reading-order position of this page inside its chapter. */
  pageIndex: number;
  regions: GeminiBatchRegion[];
}

export interface GeminiBatchResult {
  label: string;
  regionId: number;
  text: string;
}

export interface GeminiUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GeminiBatchResponse {
  results: GeminiBatchResult[];
  usage: GeminiUsageInfo;
}

export const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

const REQUEST_TIMEOUT_MS = 60_000;

export class GeminiApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.code = code;
  }
}

function humanLanguage(sourceCode: string, targetCode: string): {
  from: string;
  to: string;
} {
  // Reader codes are close enough to human language names for the prompt.
  const pretty = (code: string): string => {
    if (!code) return "auto-detected";
    const map: Record<string, string> = {
      en: "English",
      ja: "Japanese",
      ko: "Korean",
      zh: "Simplified Chinese",
      "zh-CN": "Simplified Chinese",
      "zh-TW": "Traditional Chinese",
      fr: "French",
      de: "German",
      es: "Spanish",
      it: "Italian",
      pt: "Portuguese",
      ru: "Russian",
      id: "Indonesian",
      th: "Thai",
      vi: "Vietnamese",
      hi: "Hindi",
      ar: "Arabic",
      nl: "Dutch",
      tr: "Turkish",
      ms: "Malay",
      tl: "Filipino",
    };
    return map[code] ?? code.toUpperCase();
  };
  return { from: pretty(sourceCode), to: pretty(targetCode) };
}

function buildSystemPrompt(sourceCode: string, targetCode: string): string {
  const { from, to } = humanLanguage(sourceCode, targetCode);
  return [
    "You are a professional manga localization translator.",
    `Translate manga speech-bubble dialogue from ${from} into ${to}.`,
    "Rules:",
    '- Translate ONLY the items listed under "currentBatch".',
    '- "history" contains previously read pages in reading order, each tagged with its pageIndex (page number within its chapter). It is provided strictly as context for tone, terminology, character voice and story flow. Never translate, repeat or return history items.',
    "- Keep speech natural, concise and faithful. Preserve names, honorifics where they matter, and meaningful sound effects.",
    "- Return exactly one entry per currentBatch item - never merge, split or drop items.",
    "- Preserve intentional line breaks inside an item as \n.",
    '- Reply with valid JSON only, in this exact shape: {"results":[{"label":"<page label>","regionId":<number>,"text":"<translation>"}]}',
  ].join("\n");
}

function buildPromptPayload(opts: {
  sourceCode: string;
  targetCode: string;
  history: GeminiPagePayload[];
  batch: GeminiPagePayload[];
}): string {
  const { sourceCode, targetCode, history, batch } = opts;
  const { from, to } = humanLanguage(sourceCode, targetCode);
  return JSON.stringify({
    task: "Translate the manga dialogue in currentBatch. history is context only.",
    sourceLanguage: from,
    targetLanguage: to,
    history,
    currentBatch: batch,
  });
}

interface GenerateContentOk {
  text: string;
  usage: GeminiUsageInfo;
}

async function requestGenerateContent(opts: {
  apiKey: string;
  model: GeminiModelId;
  systemInstruction: string;
  userText: string;
  temperature?: number;
}): Promise<GenerateContentOk> {
  const { apiKey, model } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: opts.systemInstruction }],
          },
          contents: [{ role: "user", parts: [{ text: opts.userText }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.3,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw geminiErrorFrom(response.status, data);
    }
    const text = extractResponseText(data);
    if (!text) {
      throw new GeminiApiError("Gemini returned an empty response.");
    }
    const metadata = data?.usageMetadata as
      | {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        }
      | undefined;
    return {
      text,
      usage: {
        inputTokens: metadata?.promptTokenCount ?? 0,
        outputTokens: metadata?.candidatesTokenCount ?? 0,
        totalTokens: metadata?.totalTokenCount ?? 0,
      },
    };
  } catch (error) {
    if (error instanceof GeminiApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiApiError("Gemini request timed out.", undefined, "TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractResponseText(data: unknown): string {
  const root = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = root.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

/** Parses a Gemini JSON reply, tolerating markdown fences and stray text. */
export function parseGeminiJson<T>(raw: string): T {
  const trimmed = raw.trim();
  let candidate = trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidate = fenced[1].trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1)) as T;
      } catch {
        // Fall through.
      }
    }
    throw new GeminiApiError(
      "Gemini reply was not valid JSON.",
      undefined,
      "BAD_JSON",
    );
  }
}

function geminiErrorFrom(status: number, data: unknown): GeminiApiError {
  const root = data as {
    error?: { code?: number; message?: string; status?: string };
  };
  const apiError = root?.error;
  const code = apiError?.status ?? String(status);
  const message = apiError?.message ?? `Gemini request failed (HTTP ${status}).`;
  if (status === 429) {
    return new GeminiApiError(
      "Gemini rate limit reached (RPM/TPM/RPD). Wait a moment and try again - the meters reset at midnight Pacific for daily quota.",
      status,
      code,
    );
  }
  if (status === 400 || status === 403) {
    const lower = message.toLowerCase();
    if (lower.includes("api key")) {
      return new GeminiApiError(
        "This API key is not valid. Check the key and try again.",
        status,
        code,
      );
    }
    return new GeminiApiError(message, status, code);
  }
  return new GeminiApiError(message, status, code);
}

/**
 * Translates one batch of whole pages (the reader chooses how many pages per
 * request) with the manga's OCR history attached as context. Resolves to
 * per-bubble results aligned by (label, regionId).
 */
export async function translateGeminiBatch(opts: {
  apiKey: string;
  model: GeminiModelId;
  sourceCode: string;
  targetCode: string;
  history: GeminiPagePayload[];
  batch: GeminiPagePayload[];
}): Promise<GeminiBatchResponse> {
  const { apiKey, model, sourceCode, targetCode, history, batch } = opts;
  const systemInstruction = buildSystemPrompt(sourceCode, targetCode);
  const userText = buildPromptPayload({
    sourceCode,
    targetCode,
    history,
    batch,
  });
  const response = await requestGenerateContent({
    apiKey,
    model,
    systemInstruction,
    userText,
  });

  const parsed = parseGeminiJson<{
    results?: { label?: string; regionId?: number; text?: string }[];
  }>(response.text);
  const rawResults = Array.isArray(parsed.results) ? parsed.results : [];
  const labelSet = new Set(batch.map((page) => page.label));
  const regionIds = new Set(
    batch.flatMap((page) => page.regions.map((region) => region.regionId)),
  );
  const results: GeminiBatchResult[] = [];
  const seen = new Set<string>();
  for (const item of rawResults) {
    if (
      typeof item?.label !== "string" ||
      !labelSet.has(item.label) ||
      typeof item.regionId !== "number" ||
      !regionIds.has(item.regionId) ||
      typeof item.text !== "string"
    ) {
      continue;
    }
    const key = `${item.label}:${item.regionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ label: item.label, regionId: item.regionId, text: item.text });
  }
  return { results, usage: response.usage };
}

/**
 * Sends one tiny request to confirm the API key (and selected model) work
 * before persisting the key. Throws GeminiApiError with a friendly message
 * when the key/model is rejected.
 */
export async function validateGeminiApiKey(
  apiKey: string,
  model: GeminiModelId = GEMINI_DEFAULT_MODEL,
): Promise<void> {
  const info = geminiModelInfo(model);
  const response = await requestGenerateContent({
    apiKey,
    model,
    systemInstruction: "Reply with a single word.",
    userText: "Reply with the single word OK.",
    temperature: 0,
  });
  if (!response.text.trim()) {
    throw new GeminiApiError(
      `"${info.label}" did not answer the validation request.`,
    );
  }
}
