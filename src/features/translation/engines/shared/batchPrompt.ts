/**
 * Provider-neutral prompt and response validation shared by every AI
 * translation transport.
 */

export interface TranslationBatchRegion {
  regionId: number;
  text: string;
}

export interface TranslationPagePayload {
  label: string;
  pageIndex: number;
  regions: TranslationBatchRegion[];
}

export interface TranslationBatchResult {
  label: string;
  regionId: number;
  text: string;
}

function humanLanguage(sourceCode: string, targetCode: string): {
  from: string;
  to: string;
} {
  const names: Record<string, string> = {
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
  const pretty = (code: string) =>
    !code ? "auto-detected" : (names[code] ?? code.toUpperCase());
  return { from: pretty(sourceCode), to: pretty(targetCode) };
}

export function buildTranslationSystemPrompt(
  sourceCode: string,
  targetCode: string,
): string {
  const { from, to } = humanLanguage(sourceCode, targetCode);
  return [
    "You are a professional manga localization translator.",
    "Translate manga dialogue from " + from + " into " + to + ".",
    "Rules:",
    '- Translate ONLY the items under "currentBatch".',
    '- "history" contains earlier pages in reading order and is context only. Never translate, repeat or return history items.',
    "- Preserve names, honorifics where meaningful, sound effects and intentional line breaks.",
    "- Keep dialogue natural, concise and faithful to the source.",
    "- Return exactly one result for every currentBatch region. Never merge, split, drop or duplicate region ids.",
    '- Return valid JSON only, in this exact shape: {"results":[{"label":"<page label>","regionId":<number>,"text":"<translation>"}]}',
  ].join("\n");
}

export function buildTranslationUserPrompt(opts: {
  sourceCode: string;
  targetCode: string;
  history: TranslationPagePayload[];
  batch: TranslationPagePayload[];
}): string {
  const { from, to } = humanLanguage(opts.sourceCode, opts.targetCode);
  return JSON.stringify({
    task: "Translate currentBatch. history is context only.",
    sourceLanguage: from,
    targetLanguage: to,
    history: opts.history,
    currentBatch: opts.batch,
  });
}

/** Parses JSON with optional markdown fences and ignores unrelated prose. */
export function parseBatchJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1));
      } catch {
        // Fall through to the typed error below.
      }
    }
    throw new Error("The translation response was not valid JSON.");
  }
}

/**
 * Validates the model reply against the exact batch. Missing, extra and
 * duplicate region ids are rejected so a partial reply cannot silently mark
 * unrelated overlays as translated.
 */
export function validateBatchResults(
  raw: unknown,
  batch: TranslationPagePayload[],
): TranslationBatchResult[] {
  const parsed = raw as {
    results?: { label?: unknown; regionId?: unknown; text?: unknown }[];
  };
  if (!Array.isArray(parsed?.results)) {
    throw new Error("The translation response did not contain a results array.");
  }
  const expected = new Map<string, TranslationBatchRegion>();
  for (const page of batch) {
    for (const region of page.regions) {
      expected.set(page.label + ":" + region.regionId, region);
    }
  }
  const seen = new Set<string>();
  const results: TranslationBatchResult[] = [];
  for (const item of parsed.results) {
    if (
      typeof item?.label !== "string" ||
      typeof item.regionId !== "number" ||
      !Number.isInteger(item.regionId) ||
      typeof item.text !== "string"
    ) {
      throw new Error("The translation response contained a malformed result.");
    }
    const key = item.label + ":" + item.regionId;
    if (!expected.has(key)) {
      throw new Error(
        "The translation response referenced an unknown region: " + key + ".",
      );
    }
    if (seen.has(key)) {
      throw new Error("The translation response duplicated region: " + key + ".");
    }
    seen.add(key);
    results.push({
      label: item.label,
      regionId: item.regionId,
      text: item.text,
    });
  }
  const missing = [...expected.keys()].filter((key) => !seen.has(key));
  if (missing.length > 0) {
    throw new Error(
      "The translation response omitted " + missing.length + " requested region(s).",
    );
  }
  return results;
}
