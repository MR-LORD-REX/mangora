/**
 * jobs/translationRuntimeLock.ts
 * ---------------------------------------------------------------------------
 * One process-wide translation slot.
 *
 * OCR + ONNX inference is memory heavy on mobile, so the reader pipelines and
 * the background pre-translate queue must never run at the same time. The
 * first caller to acquire becomes the owner; everybody else gets the owner
 * label back so the UI can explain what is running.
 * ---------------------------------------------------------------------------
 */

export interface TranslationLockOwner {
  key: string;
  label: string;
  acquiredAt: number;
}

let owner: TranslationLockOwner | null = null;
const listeners = new Set<(owner: TranslationLockOwner | null) => void>();

function publish(): void {
  listeners.forEach((listener) => listener(owner));
}

export function subscribeTranslationLock(
  listener: (owner: TranslationLockOwner | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTranslationLockOwner(): TranslationLockOwner | null {
  return owner;
}

export function tryAcquireTranslationLock(key: string, label: string): boolean {
  if (owner) {
    console.log("[translation][lock] acquire rejected", {
      requestedBy: key,
      ownedBy: owner.key,
    });
    return false;
  }
  owner = { key, label, acquiredAt: Date.now() };
  console.log("[translation][lock] acquired", { key, label });
  publish();
  return true;
}

export function releaseTranslationLock(key: string): void {
  if (!owner || owner.key !== key) return;
  console.log("[translation][lock] released", { key });
  owner = null;
  publish();
}