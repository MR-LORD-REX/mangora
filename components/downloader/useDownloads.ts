/**
 * useDownloads.ts
 * ---------------------------------------------------------------------------
 * React bindings for the download queue: live job progress and per-chapter
 * status maps (used by the viewer rows and the reader bottom bar).
 * ---------------------------------------------------------------------------
 */

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getDownloadStatusMap,
  getDownloadedChapter,
  subscribeDownloads,
} from "@/services/downloader";
import { downloadJobFromRow, getDownloadJob } from "@/services/downloader/scheduler";
import type { DownloadJob, DownloadStatus } from "@/services/downloader";

const RUNNING_STATUSES: DownloadStatus[] = ["queued", "running", "paused"];

/** True while a job is queued or transferring. */
export function isDownloadBusy(status: DownloadStatus | undefined): boolean {
  return status != null && RUNNING_STATUSES.includes(status);
}

/** Live job for one chapter (memory first, database as the cold fallback). */
export function useDownloadJob(id: string | null): DownloadJob | null {
  const [job, setJob] = useState<DownloadJob | null>(() =>
    id ? getDownloadJob(id) : null,
  );

  useEffect(() => {
    if (!id) {
      setJob(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      const live = getDownloadJob(id);
      if (live) {
        setJob(live);
        return;
      }
      // Finished jobs leave the queue; fall back to the stored download row.
      getDownloadedChapter(id)
        .then((row) => {
          if (!cancelled) setJob(row ? downloadJobFromRow(row) : null);
        })
        .catch(() => {});
    };
    refresh();
    const unsubscribe = subscribeDownloads(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);

  return job;
}

/**
 * Status map for a list of canonical chapter ids. Re-queries the database when
 * the queue changes (debounced) and whenever the screen regains focus.
 */
export function useDownloadStatuses(
  chapterIds: string[],
): Record<string, DownloadStatus> {
  const [map, setMap] = useState<Record<string, DownloadStatus>>({});
  const key = chapterIds.join("|");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (!key) {
      setMap({});
      return;
    }
    void getDownloadStatusMap(key.split("|"))
      .then(setMap)
      .catch(() => {});
  }, [key]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const unsubscribe = subscribeDownloads(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, 400);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [refresh]);

  return map;
}
