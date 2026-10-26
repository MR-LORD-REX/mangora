/**
 * External-store binding for the download queue.
 *
 * `useSyncExternalStore` requires a stable snapshot object until the queue
 * actually changes. The scheduler already caches one snapshot per emit, so the
 * wrapper does not clone it or rebuild derived arrays during render.
 */

import { useSyncExternalStore } from "react";

import {
  getDownloadSnapshot,
  subscribeDownloads,
} from "../queue/scheduler";
import type { DownloadSnapshot } from "../queue/types";

export function useDownloadSnapshot(): DownloadSnapshot {
  return useSyncExternalStore(
    subscribeDownloads,
    getDownloadSnapshot,
    getDownloadSnapshot,
  );
}