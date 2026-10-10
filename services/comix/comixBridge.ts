/**
 * comixBridge.ts
 *
 * Native-side client for the hidden Comix WebView (see ComixBridgeHost.tsx).
 *
 * The WebView runs the real comix.to site. Instead of reimplementing the
 * site's encrypted `/api/v1` protocol (which its obfuscated bundle rebuilds on
 * every deploy), this client navigates the hidden WebView to whichever page
 * renders the data a native screen needs, then reads that data straight out of
 * the site's own React Query cache - by then the site has already fetched and
 * decrypted it. See comixBridgeScript.ts for the page-side details.
 *
 * Screens never touch the WebView directly - they import helpers from
 * comix.api.ts, which route through here.
 */

import { BASE_URL } from "./comix.constants";

export interface ComixBridgeInvoker {
  inject(payloadText: string): void;
  reload(): void;
  navigate(url: string): void;
  /**
   * Reads a cache entry matching `spec`. `spec.key` is compared element-wise
   * against the React Query key; `spec.objKeys` matches fields of the key
   * segment right after `spec.key`.
   */
}

export interface ComixQuerySpec {
  key?: unknown[];
  objKeys?: Record<string, unknown>;
}

const REQUEST_TIMEOUT_MS = 90_000;
const NAV_LOAD_TIMEOUT_MS = 30_000;
const MAX_RELOAD_RETRIES = 1;

let invoker: ComixBridgeInvoker | null = null;
let nextId = 1;
let state: "idle" | "booting" | "ready" | "failed" = "idle";
let fatalError: string | null = null;
let reloadCount = 0;
let pageUrl = BASE_URL;
let pageLoadedOnce = false;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<number, PendingRequest>();
type BridgeStateListener = (state: string) => void;
const stateListeners = new Set<BridgeStateListener>();

let invokerWaiters: (() => void)[] = [];
let pageLoadWaiters: (() => void)[] = [];

function setState(next: string): void {
  state = next as typeof state;
  stateListeners.forEach((listener) => listener(state));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Registered by the hidden host when it mounts. */
export function setComixBridgeInvoker(next: ComixBridgeInvoker | null): void {
  invoker = next;
  if (next) {
    setState("booting");
    const waiters = invokerWaiters;
    invokerWaiters = [];
    waiters.forEach((resolve) => resolve());
  } else {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Comix bridge host unmounted."));
    }
    pending.clear();
    setState("idle");
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

/** Called by the host with the WebView's current URL on every navigation. */
export function handleComixNavigation(url: string): void {
  if (url) pageUrl = url;
}

/** Called by the host on every WebView load end (challenge pages included). */
export function handleComixPageLoaded(): void {
  pageLoadedOnce = true;
  if (state !== "ready") setState("ready");
  const waiters = pageLoadWaiters;
  pageLoadWaiters = [];
  waiters.forEach((resolve) => resolve());
}

/** Called by the host on every bridge message from the WebView. */
export function handleComixBridgeMessage(raw: string): void {
  let message: {
    type?: string;
    id?: number | null;
    ok?: boolean;
    data?: unknown;
    error?: string;
    challenge?: boolean;
    url?: string;
    title?: string;
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

  if (message.type === "installed") {
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
      entry.reject(new Error(message.error || "Comix bridge request failed."));
    }
  }
}

/** Subscribe to bridge state changes ("idle" | "booting" | "ready" | "failed"). */
export function subscribeComixBridge(listener: BridgeStateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function ensureInvoker(): Promise<void> {
  if (invoker) return Promise.resolve();
  return new Promise<void>((resolve) => invokerWaiters.push(resolve));
}

/** Waits until the hidden WebView bridge reports ready. */
export async function ensureComixBridgeReady(): Promise<void> {
  await ensureInvoker();
  if (pageLoadedOnce) return;
  await new Promise<void>((resolve) => pageLoadWaiters.push(resolve));
}

function awaitPageLoad(timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = pageLoadWaiters.indexOf(waiter);
      if (index >= 0) pageLoadWaiters.splice(index, 1);
      reject(new Error("Comix page did not finish loading."));
    }, timeoutMs);
    const waiter = () => {
      clearTimeout(timer);
      resolve();
    };
    pageLoadWaiters.push(waiter);
  });
}

interface NavState {
  url: string;
  promise: Promise<void>;
}
let navState: NavState | null = null;

/** Navigates the hidden WebView to `url` and waits for the load to settle. */
function ensurePage(url: string): Promise<void> {
  if (pageUrl === url) return Promise.resolve();
  if (navState && navState.url === url) return navState.promise;
  const previous = navState ? navState.promise.catch(() => undefined) : Promise.resolve();
  const promise = previous.then(() => navigateAndWait(url));
  navState = { url, promise };
  return promise;
}

async function navigateAndWait(url: string): Promise<void> {
  await ensureInvoker();
  const load = awaitPageLoad(NAV_LOAD_TIMEOUT_MS);
  try {
    invoker?.navigate(url);
  } catch (error) {
    pageLoadWaiters = [];
    throw error instanceof Error ? error : new Error(String(error));
  }
  await load;
  pageUrl = url;
  // Let the SPA fire its data fetches after the document itself has loaded.
  await sleep(900);
}

/** Injects one bridge op and resolves with the WebView's reply. */
async function send(op: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  await ensureInvoker();
  const id = nextId;
  nextId += 1;
  const payload = { id, op, ...extra };

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Comix bridge request timed out."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    try {
      invoker?.inject(
        "window.__comixBridgeRequest && window.__comixBridgeRequest(" +
          JSON.stringify(payload) +
          "); true;",
      );
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Navigates to `url` (if needed) and returns the React Query cache entry
 * matching `spec`, polling until it appears or the timeout elapses.
 */
export async function comixBridgeOpenAndQuery(options: {
  url: string;
  spec: ComixQuerySpec;
  timeoutMs?: number;
}): Promise<unknown> {
  await ensurePage(options.url);
  const timeoutMs = options.timeoutMs ?? 15_000;
  try {
    const result = await send("wait", { spec: options.spec, timeoutMs });
    reloadCount = 0;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (reloadCount < MAX_RELOAD_RETRIES && /not cached|timed out/i.test(message)) {
      reloadCount += 1;
      // Force a fresh navigation: a bare reload would drop back to the home
      // page, so clear the cached URL first.
      navState = null;
      pageUrl = "";
      try {
        invoker?.reload();
      } catch {
        // ignore
      }
      await ensurePage(options.url);
      const retried = await send("wait", { spec: options.spec, timeoutMs });
      reloadCount = 0;
      return retried;
    }
    reloadCount = 0;
    throw new Error(
      "Comix could not be reached. Check your connection and try again.",
    );
  }
}

/**
 * Navigates to a manga title page and walks its paginated chapter list,
 * returning every chapter row (freshest first).
 */
export async function comixBridgeChaptersAll(options: {
  url: string;
  hid: string;
  maxPages?: number;
  timeoutMs?: number;
}): Promise<{ items: unknown[]; meta: unknown; reason: string }> {
  await ensurePage(options.url);
  const data = (await send("chaptersAll", {
    hid: options.hid,
    maxPages: options.maxPages ?? 40,
    timeoutMs: options.timeoutMs ?? 60_000,
  })) as { items?: unknown[]; meta?: unknown; reason?: string };
  return {
    items: Array.isArray(data?.items) ? (data.items as unknown[]) : [],
    meta: data?.meta ?? null,
    reason: data?.reason ?? "unknown",
  };
}

// ---------------------------------------------------------------------------
// Same-origin HTML fetch (server-rendered pages)
// ---------------------------------------------------------------------------

const PAGE_WAIT_TIMEOUT_MS = 25_000;
const MAX_HTML_CHALLENGE_RETRIES = 6;

function waitForAnyPageLoaded(timeoutMs: number): Promise<void> {
  if (pageLoadedOnce) return Promise.resolve();
  return awaitPageLoad(timeoutMs);
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
 * Cloudflare session (cookies + same-origin). It works from any comix.to page,
 * so the server-rendered home feed / title pages parse without navigating. While
 * Cloudflare is still serving its managed challenge it retries for a while as
 * the challenge solves itself, then reports a clear message.
 */
export async function comixBridgeFetchHtml(url: string): Promise<string> {
  await waitForAnyPageLoaded(PAGE_WAIT_TIMEOUT_MS);
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