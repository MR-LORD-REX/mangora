/**
 * brainrotBridge.ts
 *
 * Native-side client for the hidden BrainRot WebView bridge (see
 * components/brainrot/BrainRotBridgeHost.tsx).
 *
 * BrainRotComics is Cloudflare-gated: plain HTTP clients get a "Just a moment"
 * challenge. The hidden WebView clears it once and keeps the session warm;
 * this module forwards credentialed fetch calls into that session and resolves
 * promises when the WebView posts the response back.
 *
 * The BrainRotComicsClient is constructed with `fetchImpl: brainrotBridgeFetch`
 * so every list/search/chapter/page request runs through the warm session.
 */

import { FetchLike } from "./brainrot.types";

export interface BrainRotBridgeInvoker {
  inject(payloadText: string): void;
  reload(): void;
}

export interface BrainRotBridgeResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

interface BridgeInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

type Pending = {
  resolve: (value: BrainRotBridgeResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const REQUEST_TIMEOUT_MS = 40_000;
const READY_TIMEOUT_MS = 45_000;
const MAX_RELOAD_RETRIES = 2;

let invoker: BrainRotBridgeInvoker | null = null;
let nextId = 1;
let state: "idle" | "booting" | "ready" | "failed" = "idle";
let fatalError: string | null = null;
let reloadCount = 0;
const pending = new Map<number, Pending>();
let readyWaiters: {
  resolve: () => void;
  reject: (reason: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}[] = [];
type StateListener = (state: string) => void;
const stateListeners = new Set<StateListener>();

function setState(next: string): void {
  state = next as typeof state;
  stateListeners.forEach((listener) => listener(state));
}

export function setBrainrotBridgeInvoker(next: BrainRotBridgeInvoker | null): void {
  invoker = next;
  if (!next) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("BrainRot bridge host unmounted."));
    }
    pending.clear();
  }
}

export function brainrotBridgeState(): string {
  return state;
}

export function isBrainrotBridgeReady(): boolean {
  return state === "ready" && !!invoker;
}

export function brainrotBridgeFatalError(): string | null {
  return fatalError;
}

type BridgeMessage = {
  type?: string;
  id?: number | null;
  ok?: boolean;
  status?: number;
  text?: string;
  error?: string;
  url?: string;
  title?: string;
  challenge?: boolean;
};

/** Called by the host on every bridge message from the WebView. */
export function handleBrainrotBridgeMessage(raw: string): void {
  let message: BridgeMessage;
  try {
    message = JSON.parse(raw) as BridgeMessage;
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;

  if (message.type === "page") {
    console.warn(
      "[brainrot-bridge] page",
      message.challenge ? "CHALLENGE" : "ok",
      message.title ?? "",
      message.url ?? "",
    );
    return;
  }

  if (message.type === "ready") {
    if (state !== "ready") setState("ready");
    fatalError = null;
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((waiter) => waiter.resolve());
    return;
  }

  if (message.type === "fatal") {
    setState("failed");
    fatalError = message.error ?? "BrainRot bridge failed to start.";
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((waiter) => waiter.reject(new Error(fatalError as string)));
    return;
  }

  if (message.type === "result" && typeof message.id === "number") {
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    const text = message.text ?? "";
    entry.resolve({
      ok: !!message.ok,
      status: message.status ?? 0,
      text: () => Promise.resolve(text),
    });
  }
}

export function subscribeBrainrotBridge(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** Waits until the hidden WebView bridge reports ready. */
export function ensureBrainrotBridgeReady(): Promise<void> {
  if (state === "ready" && invoker) return Promise.resolve();
  if (state === "failed") {
    invoker?.reload();
    setState("idle");
    fatalError = null;
  }
  return new Promise<void>((resolve, reject) => {
    const waiter = { resolve, reject };
    readyWaiters.push(waiter);
    try {
      invoker?.inject("true;");
    } catch {
      // The injected script boots on its own once the page loads.
    }
    const timer = setTimeout(() => {
      const index = readyWaiters.indexOf(waiter);
      if (index >= 0) readyWaiters.splice(index, 1);
      reject(new Error("BrainRot bridge did not become ready."));
    }, READY_TIMEOUT_MS);
    waiter.resolve = () => {
      clearTimeout(timer);
      resolve();
    };
    waiter.reject = (reason: Error) => {
      clearTimeout(timer);
      reject(reason);
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs one credentialed fetch inside the warm WebView session. */
export async function brainrotBridgeRequest(
  url: string,
  init: BridgeInit = {},
  retry = true,
): Promise<BrainRotBridgeResponse> {
  if (!invoker) throw new Error("BrainRot bridge is not mounted yet.");
  await ensureBrainrotBridgeReady();

  const id = nextId;
  nextId += 1;
  const payload = {
    id,
    url,
    method: init.method ?? "GET",
    headers: init.headers ?? {},
    body: init.body,
  };

  const response = await new Promise<BrainRotBridgeResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("BrainRot request timed out."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    try {
      invoker?.inject(
        "window.__brainrotRequest && window.__brainrotRequest(" +
          JSON.stringify(JSON.stringify(payload)) +
          "); true;",
      );
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }).catch(async (error: Error) => {
    const retryable =
      error.message.includes("timed out") ||
      error.message.includes("not ready") ||
      error.message.includes("did not become ready");
    if (retry && retryable && reloadCount < MAX_RELOAD_RETRIES) {
      reloadCount += 1;
      setState("idle");
      try {
        invoker?.reload();
      } catch {
        // ignore
      }
      await sleep(1200);
      return brainrotBridgeRequest(url, init, false);
    }
    reloadCount = 0;
    throw error;
  });

  reloadCount = 0;
  return response;
}

/** FetchLike implementation backed by the hidden WebView session. */
export const brainrotBridgeFetch: FetchLike = (url, init) =>
  brainrotBridgeRequest(url, init ?? {});