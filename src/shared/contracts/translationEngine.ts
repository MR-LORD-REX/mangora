/** Translation backend selected by persisted core settings. */
export type TranslationEngine = "free" | "openai";

/** Backends that send a generated page batch to an AI provider. */
export function isAiTranslationEngine(engine: TranslationEngine): boolean {
  return engine === "openai";
}
