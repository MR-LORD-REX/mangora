/**
 * Translation workers: the free per-page endpoint and the Gemini fallback
 * chain. Both receive a fully OCRed page and mutate its bubble records, then
 * ask the runtime to publish the overlay state.
 */

import {
  GEMINI_DEFAULT_MODEL,
  GeminiApiError,
  fallbackModelChain,
  nextAutoSwitchFailureState,
  recordGeminiUsage,
  requestWithModelFallback,
  translateFreeBatch,
  translateGeminiBatch,
  waitForRpmCapacity,
  type GeminiModelId,
} from "@features/translation";

import type {
  OcrBubbleRecord,
  OcrPageRecord,
  PageTranslationTask,
  ReaderTranslationRuntime,
} from "./types";

function pendingBubbles(page: OcrPageRecord): OcrBubbleRecord[] {
  return [...page.bubbles.values()].filter(
    (bubble) => bubble.status === "ready" || bubble.status === "error",
  );
}

function markBubblesTranslating(
  page: OcrPageRecord,
  bubbles: OcrBubbleRecord[],
): void {
  for (const bubble of bubbles) bubble.status = "translating";
  page.status = "translate";
}

function markBubblesFailed(bubbles: OcrBubbleRecord[]): void {
  for (const bubble of bubbles) {
    if (bubble.status === "translating") bubble.status = "error";
  }
}

function applyTranslationResults(
  bubbles: OcrBubbleRecord[],
  results: { label: string; regionId: number; text: string }[],
): number {
  const resultByRegion = new Map<number, string>();
  for (const result of results) {
    if (result.label === "page_0") {
      resultByRegion.set(result.regionId, result.text);
    }
  }
  let translated = 0;
  for (const bubble of bubbles) {
    const text = resultByRegion.get(bubble.id);
    if (text && text.trim()) {
      bubble.translatedText = text;
      bubble.status = "translated";
      translated += 1;
    } else {
      bubble.status = "error";
    }
  }
  return translated;
}

function pageBatch(pageIndex: number, bubbles: OcrBubbleRecord[]) {
  return [
    {
      label: "page_0",
      pageIndex,
      regions: bubbles.map((bubble) => ({
        regionId: bubble.id,
        text: bubble.text,
      })),
    },
  ];
}

export async function translateFreePage(
  runtime: ReaderTranslationRuntime,
  task: PageTranslationTask,
): Promise<void> {
  const { url, pageIndex, generation } = task;
  if (!runtime.isCurrentRun(generation)) return;
  const page = runtime.ocrStore.get(url);
  if (!page) return;
  const bubbles = pendingBubbles(page);
  if (bubbles.length === 0) return;
  markBubblesTranslating(page, bubbles);
  runtime.refreshPageState(page);

  try {
    const response = await translateFreeBatch({
      sourceCode: runtime.config.sourceLanguage,
      targetCode: runtime.config.targetLanguage,
      history: [],
      batch: pageBatch(pageIndex, bubbles),
    });
    if (!runtime.isCurrentRun(generation)) return;
    if (response.results.length === 0) {
      throw new Error("Free translation returned no usable results.");
    }
    const translated = applyTranslationResults(bubbles, response.results);
    page.modelId = "free-google";
    console.log("[reader][tr][free] page response", {
      pageIndex,
      bubbles: bubbles.length,
      translated,
    });
    runtime.refreshPageState(page);
  } catch (error) {
    if (!runtime.isCurrentRun(generation)) return;
    markBubblesFailed(bubbles);
    console.warn("[reader][tr][free] page failed", { pageIndex, error });
    runtime.refreshPageState(page);
    runtime.showTranslationError(
      error instanceof Error
        ? "Page " + (pageIndex + 1) + ": " + error.message
        : "Free translation failed for page " + (pageIndex + 1) + ".",
    );
  }
}

export async function translateAiPage(
  runtime: ReaderTranslationRuntime,
  task: PageTranslationTask,
): Promise<void> {
  const { url, pageIndex, generation } = task;
  if (!runtime.isCurrentRun(generation)) return;
  const page = runtime.ocrStore.get(url);
  if (!page) return;
  const apiKey = runtime.config.geminiApiKey.trim();
  if (!apiKey) {
    runtime.markPageError(
      url,
      "AI translation needs a Gemini API key - set it in Settings > Translation.",
    );
    return;
  }

  const bubbles = pendingBubbles(page);
  if (bubbles.length === 0) return;
  markBubblesTranslating(page, bubbles);
  runtime.refreshPageState(page);

  const maxContext = Math.min(
    50,
    Math.max(1, Math.round(runtime.config.aiMaxContextPages)),
  );
  const history = [...runtime.ocrStore.values()]
    .filter(
      (candidate) =>
        candidate.url !== url &&
        candidate.seq < page.seq &&
        candidate.bubbles.size > 0,
    )
    .sort((a, b) => a.seq - b.seq)
    .slice(-maxContext)
    .map((candidate, index) => ({
      label: "history_" + index,
      pageIndex: candidate.pageIndex,
      regions: [...candidate.bubbles.values()]
        .filter((bubble) => bubble.text.trim())
        .map((bubble) => ({ regionId: bubble.id, text: bubble.text })),
    }));
  const batch = pageBatch(pageIndex, bubbles);

  const primary = runtime.config.geminiModelId || GEMINI_DEFAULT_MODEL;
  const models: GeminiModelId[] = fallbackModelChain(
    primary,
    runtime.config.autoModelSwitch,
  );
  console.log("[reader][tr][ai] worker start", {
    pageIndex,
    models,
    autoSwitch: runtime.config.autoModelSwitch,
  });

  const outcome = await requestWithModelFallback({
    models,
    request: async (model) => {
      await waitForRpmCapacity(model);
      return translateGeminiBatch({
        apiKey,
        model,
        sourceCode: runtime.config.sourceLanguage,
        targetCode: runtime.config.targetLanguage,
        history,
        batch,
      });
    },
    onSwitch: (from, to) => {
      console.warn("[reader][tr][ai] rate limited; trying fallback model", {
        pageIndex,
        from,
        to,
      });
    },
  });
  const response = outcome.value;
  const usedModel = outcome.usedModel;
  const lastError = outcome.lastError;
  const failureState = nextAutoSwitchFailureState(
    runtime.getAutoSwitchFailures(),
    outcome,
  );
  runtime.setAutoSwitchFailures(failureState.failures);
  if (failureState.disable) runtime.disableAutoModelSwitch();

  if (!response) {
    if (!runtime.isCurrentRun(generation)) return;
    void recordGeminiUsage({
      model: usedModel,
      success: false,
      errorCode:
        lastError instanceof GeminiApiError
          ? String(lastError.code ?? lastError.status ?? "error")
          : "network",
    });
    markBubblesFailed(bubbles);
    console.warn("[reader][tr][ai] page failed", {
      pageIndex,
      model: usedModel,
      error: lastError,
    });
    runtime.refreshPageState(page);
    runtime.showTranslationError(
      lastError instanceof Error
        ? "Page " + (pageIndex + 1) + ": " + lastError.message
        : "AI translation failed for page " + (pageIndex + 1) + ".",
    );
    return;
  }

  if (!runtime.isCurrentRun(generation)) return;
  void recordGeminiUsage({
    model: usedModel,
    success: true,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  });
  if (response.results.length === 0) {
    markBubblesFailed(bubbles);
    runtime.refreshPageState(page);
    runtime.showTranslationError(
      "Page " + (pageIndex + 1) + ": Gemini returned no usable results.",
    );
    return;
  }
  const translated = applyTranslationResults(bubbles, response.results);
  page.modelId = usedModel;
  console.log("[reader][tr][ai] page response", {
    pageIndex,
    model: usedModel,
    bubbles: bubbles.length,
    translated,
    contextPages: history.length,
  });
  runtime.refreshPageState(page);
}
