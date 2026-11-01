/**
 * Translation workers: the free per-page endpoint and the provider-neutral AI
 * batch runner shared with pretranslate. Both mutate page records and ask the
 * runtime to publish overlay state.
 */

import {
  runAiTranslationBatch,
  selectPreviousContextPagesUnique,
  translateFreeBatch,
} from "@features/translation";
import type { AppSettings } from "@core/settings";

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

  const bubbles = pendingBubbles(page);
  if (bubbles.length === 0) return;
  markBubblesTranslating(page, bubbles);
  runtime.refreshPageState(page);

  const maxContext = Math.min(
    50,
    Math.max(1, Math.round(runtime.config.aiMaxContextPages)),
  );
  // Prior pages can come from RAM or the persisted page cache. Load only the
  // immediate context window, then deduplicate by page position so restarting
  // mid-chapter does not silently drop the AI's context.
  const firstContext = Math.max(0, pageIndex - maxContext);
  await Promise.all(
    Array.from({ length: pageIndex - firstContext }, (_, offset) =>
      runtime.hydrateContextPage(
        runtime.pages[firstContext + offset],
        firstContext + offset,
      ),
    ),
  );
  const history = selectPreviousContextPagesUnique(
    [...runtime.ocrStore.values(), ...runtime.cachedContext.values()]
      .filter(
        (candidate) => candidate.url !== url && candidate.bubbles.size > 0,
      )
      .map((candidate) => ({ pageIndex: candidate.pageIndex, value: candidate })),
    pageIndex,
    maxContext,
    (candidate, existing) => candidate.bubbles.size > existing.bubbles.size,
  ).map((candidate, index) => ({
    label: "history_" + index,
    pageIndex: candidate.pageIndex,
    regions: [...candidate.bubbles.values()]
      .filter((bubble) => bubble.text.trim())
      .map((bubble) => ({ regionId: bubble.id, text: bubble.text })),
  }));
  const batch = pageBatch(pageIndex, bubbles);

  try {
    const baseSettings = runtime.config.settings;
    if (!baseSettings) {
      throw new Error("Translation settings are still loading.");
    }
    const settings: AppSettings = {
      ...baseSettings,
      translationModelId:
        runtime.config.translationModelId ||
        baseSettings.translationModelId,
    };
    const outcome = await runAiTranslationBatch({
      settings,
      engine: runtime.config.engine,
      sourceCode: runtime.config.sourceLanguage,
      targetCode: runtime.config.targetLanguage,
      history,
      batch,
      autoSwitch: runtime.config.autoModelSwitch,
      previousFailures: runtime.getAutoSwitchFailures(),
      onSwitch: (from, to) => {
        console.warn("[reader][tr][ai] rate limited; trying fallback model", {
          pageIndex,
          from,
          to,
        });
      },
    });
    runtime.setAutoSwitchFailures(outcome.failures);
    if (outcome.disableAutoSwitch) runtime.disableAutoModelSwitch();
    if (!outcome.response) {
      if (!runtime.isCurrentRun(generation)) return;
      markBubblesFailed(bubbles);
      console.warn("[reader][tr][ai] page failed", {
        pageIndex,
        provider: outcome.providerLabel,
        model: outcome.usedModel,
        error: outcome.lastError,
      });
      runtime.refreshPageState(page);
      runtime.showTranslationError(
        outcome.lastError instanceof Error
          ? "Page " + (pageIndex + 1) + ": " + outcome.lastError.message
          : outcome.providerLabel +
              " translation failed for page " +
              (pageIndex + 1) +
              ".",
      );
      return;
    }
    if (!runtime.isCurrentRun(generation)) return;
    if (outcome.response.results.length === 0) {
      markBubblesFailed(bubbles);
      runtime.refreshPageState(page);
      runtime.showTranslationError(
        "Page " +
          (pageIndex + 1) +
          ": " +
          outcome.providerLabel +
          " returned no usable results.",
      );
      return;
    }
    const translated = applyTranslationResults(
      bubbles,
      outcome.response.results,
    );
    page.modelId = outcome.usedModel;
    console.log("[reader][tr][ai] page response", {
      pageIndex,
      provider: outcome.providerLabel,
      model: outcome.usedModel,
      bubbles: bubbles.length,
      translated,
      contextPages: history.length,
    });
    runtime.refreshPageState(page);
  } catch (error) {
    if (!runtime.isCurrentRun(generation)) return;
    markBubblesFailed(bubbles);
    runtime.refreshPageState(page);
    runtime.showTranslationError(
      error instanceof Error
        ? "Page " + (pageIndex + 1) + ": " + error.message
        : "AI translation failed for page " + (pageIndex + 1) + ".",
    );
  }
}
