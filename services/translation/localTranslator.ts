/**
 * localTranslator.ts
 * ---------------------------------------------------------------------------
 * Adapter between the current local engine (free Google translate JSON
 * endpoint, no API key) and the engine-agnostic TranslateTextFn used by the
 * reader pipeline. Swapping in the future TR_API cloud translator only means
 * replacing this module with a fetch-based TR_API implementation.
 *
 * Kept as `useLocalTranslator()` so reader call sites do not change when the
 * engine is swapped.
 * ---------------------------------------------------------------------------
 */

import { localTranslate } from "./freeGoogleTranslator";
import type { TranslateTextFn } from "./translation.types";

export function useLocalTranslator(): { translate: TranslateTextFn } {
  return { translate: localTranslate };
}
