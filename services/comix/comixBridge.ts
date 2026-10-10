/**
 * comixBridge.ts
 *
 * Native-side client for the hidden Comix WebView bridge (see
 * ComixBridgeHost.tsx). The WebView runs comix.to's own env module, which
 * signs every request and decrypts response envelopes internally; this module
 * forwards typed operations over `window.__comixBridgeRequest` and resolves
 * promises when the WebView posts results back.
 *
 * Screens never touch the WebView directly - they import helpers from
 * comix.api.ts, which route through here.
 */

export type ComixBridgeOp =
  | "list"
  | "get"
  | "chapters"
  | "pages"
  | "raw";

export interface ComixBridgeRequest {
  id: number;
  op: ComixBridgeOp;
  /** list/chapters params object. */
  params?: Record<string, unknown>;
  /** manga hid for get/chapters. */
  hid?: string;
  /** numeric chapter id for pages. */
  chapterId?: number;
  /** relative /api/v1 path for raw. */
  path?: string;
}

export interface ComixBridgeInvoker {
  inject(payloadText: string): void;
  reload(): void;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const REQUEST_TIMEOUT_MS = 40_000;
const READY_TIMEOUT_MS = 45_000;
const MAX_RELOAD_RETRIES = 2;

let invoker: ComixBridgeInvoker | null = null;
let nextId = 1;
let state: "idle" | "booting" | "ready" | "failed" = "idle";
let readyWaiters: {
  resolve: () => void;
  reject: (reason: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}[] = [];
let fatalError: string | null = null;
let reloadCount = 0;
const pending = new Map<number, PendingRequest>();
type BridgeStateListener = (state: string) => void;
const stateListeners = new Set<BridgeStateListener>();

function setState(next: string): void {
  state = next as typeof state;
  stateListeners.forEach((listener) => listener(state));
}

/** Registered by the hidden host when it mounts. */
export function setComixBridgeInvoker(next: ComixBridgeInvoker | null): void {
  invoker = next;
  if (!next) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Comix bridge host unmounted."));
    }
    pending.clear();
  }
}

export function comixBridgeState(): string {
  return state;
}

export function isComixBridgeReady(): boolean {
  return state === "ready" && !!invoker;
}

export function bridgeFatalError(): string | null {
  return fatalError;
}

/** Called by the host on every bridge message from the WebView. */
export function handleComixBridgeMessage(raw: string): void {
  let message: {
    type?: string;
    id?: number | null;
    ok?: boolean;
    data?: unknown;
    error?: string;
    attempts?: number;
    url?: string;
    title?: string;
    challenge?: boolean;
  };
  try {
    message = JSON.parse(raw) as typeof message;
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;

  if (message.type === "page") {
    // Diagnostics for a device run: reveals whether the hidden WebView landed
    // on the real site or is still stuck on Cloudflare's challenge.
    console.warn(
      "[comix-bridge] page",
      message.challenge ? "CHALLENGE" : "ok",
      message.title ?? "",
      message.url ?? "",
    );
    return;
  }

  if (message.type === "ready") {
    setState("ready");
    fatalError = null;
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((waiter) => waiter.resolve());
    return;
  }

  if (message.type === "fatal") {
    setState("failed");
    fatalError = message.error ?? "Comix bridge failed to start.";
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((waiter) =>
      waiter.reject(new Error(fatalError as string)),
    );
    return;
  }

  if (message.type === "result" && typeof message.id === "number") {
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.ok) {
      entry.resolve(message.data);
    } else {
      const error = new Error(message.error || "Comix API request failed.");
      (error as Error & { status?: number }).status = 0;
      entry.reject(error);
    }
  }
}

/** Subscribe to bridge state changes ("idle" | "booting" | "ready" | "failed"). */
export function subscribeComixBridge(listener: BridgeStateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** Waits until the hidden WebView bridge reports ready. */
export function ensureComixBridgeReady(): Promise<void> {
  if (state === "ready" && invoker) return Promise.resolve();
  if (state === "failed") {
    // Give the host a chance to recover by reloading the page.
    invoker?.reload();
    setState("idle");
    fatalError = null;
  }
  return new Promise<void>((resolve, reject) => {
    const waiter = { resolve, reject };
    readyWaiters.push(waiter);
    // Kick the page bootstrap in case it never ran (e.g. first load).
    try {
      invoker?.inject("true;");
    } catch {
      // WebView may still be loading; the injected script boots on its own.
    }
    const timer = setTimeout(() => {
      const index = readyWaiters.indexOf(waiter);
      if (index >= 0) readyWaiters.splice(index, 1);
      reject(
        new Error(
          fatalError ??
            "Comix could not be reached. Check your connection and try again.",
        ),
      );
    }, READY_TIMEOUT_MS);
    // Keep a ref for cleanup if we become ready in the same tick.
    (waiter as { timer?: ReturnType<typeof setTimeout> }).timer = timer;
    const originalResolve = waiter.resolve;
    waiter.resolve = () => {
      clearTimeout(timer);
      originalResolve();
    };
    const originalReject = waiter.reject;
    waiter.reject = (reason: Error) => {
      clearTimeout(timer);
      originalReject(reason);
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sends one op to the WebView and resolves with the decrypted payload. */
export async function comixBridgeRequest(
  op: ComixBridgeOp,
  extra: Omit<ComixBridgeRequest, "id" | "op"> = {},
  retry = true,
): Promise<unknown> {
  if (!invoker) {
    throw new Error("Comix bridge is not mounted yet.");
  }
  await ensureComixBridgeReady();

  const id = nextId;
  nextId += 1;
  const payload: ComixBridgeRequest = { id, op, ...extra };

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Comix request timed out."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });

    let injected = false;
    try {
      invoker?.inject(
        "window.__comixBridgeRequest && window.__comixBridgeRequest(" +
          JSON.stringify(payload) +
          "); true;",
      );
      injected = true;
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    if (!injected) {
      clearTimeout(timer);
      pending.delete(id);
    }
  }).catch(async (error: Error) => {
    const status = (error as Error & { status?: number }).status;
    const message = error.message || "";
    const retryable =
      status === 403 ||
      status === 401 ||
      /missing token|waf|challenge|timed out|not ready/i.test(message);
    if (retry && retryable && reloadCount < MAX_RELOAD_RETRIES) {
      reloadCount += 1;
      setState("idle");
      fatalError = null;
      try {
        invoker?.reload();
      } catch {
        // ignore
      }
      await sleep(900);
      return comixBridgeRequest(op, extra, false);
    }
    reloadCount = 0;
    throw error;
  });
}

const PAGE_WAIT_TIMEOUT_MS = 25_000;
const MAX_HTML_CHALLENGE_RETRIES = 6;

let pageLoaded = false;
let pageWaiters: (() => void)[] = [];

/** Called by the host on every WebView load end (challenge pages included). */
export function handleComixPageLoaded(): void {
  pageLoaded = true;
  const waiters = pageWaiters;
  pageWaiters = [];
  waiters.forEach((resolve) => resolve());
}

function waitForPageLoaded(timeoutMs: number): Promise<void> {
  if (pageLoaded) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const waiter = () => {
      clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      const index = pageWaiters.indexOf(waiter);
      if (index >= 0) pageWaiters.splice(index, 1);
      reject(new Error("Comix page did not finish loading."));
    }, timeoutMs);
    pageWaiters.push(waiter);
  });
}

function looksLikeCloudflareChallenge(html: string): boolean {
  const head = html.slice(0, 6000).toLowerCase();
  return (
    head.includes("just a moment") ||
    head.includes("checking your browser") ||
    head.includes("cf-chl") ||
    head.includes("challenge-platform") ||
    head.includes("cf-mitigated")
  );
}

/** Runs one HTML request; fails fast when the handler is not installed yet. */
function requestComixHtml(url: string): Promise<string> {
  if (!invoker) {
    throw new Error("Comix bridge is not mounted yet.");
  }
  const id = nextId;
  nextId += 1;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Comix page request timed out."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {
      resolve: (value) =>
        resolve(typeof value === "string" ? value : String(value)),
      reject,
      timer,
    });
    try {
      invoker?.inject(
        "(function(){var p=" +
          JSON.stringify({ id, path: url }) +
          ";if(window.__comixBridgeHtmlRequest){window.__comixBridgeHtmlRequest(p);}" +
          "else if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(" +
          "JSON.stringify({type:'result',id:" +
          id +
          ",ok:false,error:'Comix page not ready'}));}})();true;",
      );
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Fetches a page's raw HTML from inside the WebView, reusing the cleared
 * Cloudflare session (cookies + same-origin). It waits only for the page to
 * finish loading, never for the signed API module, so the server-rendered
 * screens work even when the `env-*.js` bridge is slow or missing. While
 * Cloudflare is still serving its managed challenge it retries for a while as
 * the challenge solves itself, then reports a clear message.
 */
export async function comixBridgeFetchHtml(url: string): Promise<string> {
  await waitForPageLoaded(PAGE_WAIT_TIMEOUT_MS);
  for (let attempt = 0; ; attempt += 1) {
    const html = await requestComixHtml(url);
    if (!looksLikeCloudflareChallenge(html)) return html;
    if (attempt >= MAX_HTML_CHALLENGE_RETRIES) {
      throw new Error(
        "Comix is still showing a Cloudflare check. Open the Comix browser tab once to clear it, then retry.",
      );
    }
    await sleep(1500 * (attempt + 1));
  }
}
