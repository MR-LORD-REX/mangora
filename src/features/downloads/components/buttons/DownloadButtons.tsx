/**
 * DownloadButtons.tsx
 * ---------------------------------------------------------------------------
 * The three download entry points:
 *
 *   <SeriesDownloadButton />  - viewer header: chapter picker with select all
 *   <ChapterDownloadButton /> - right side of a chapter row: one chapter
 *   <ReaderDownloadButton />  - reader header: the open chapter
 *
 * Every variant reflects the live job state (idle / queued / running /
 * downloaded / failed) and routes through the shared flows in actions.ts.
 * ---------------------------------------------------------------------------
 */

import {
  Check,
  CircleCheckBig,
  Download,
  RotateCcw,
} from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, radius } from "@shared/theme";
import { retryDownload } from "../../queue/scheduler";
import type { DownloadCandidate } from "../../catalog/identity";
import type { DownloadStatus } from "../../queue/types";

import {
  deleteChapterWithConfirm,
  requestChapterDownload,
  requestSeriesDownload,
} from "../actions";
import { isDownloadBusy, useDownloadJob, useDownloadStatuses } from "../../hooks/useDownloads";

export interface DownloadContext {
  mangaTitle: string;
  thumbnailUrl: string | null;
}

/** Viewer header button: opens the chapter picker. */
export function SeriesDownloadButton({
  candidates,
  context,
  accent,
  style,
}: {
  candidates: DownloadCandidate[];
  context: DownloadContext;
  accent: string;
  style?: StyleProp<ViewStyle>;
}) {
  const chapterIds = useMemo(
    () => candidates.map((candidate) => candidate.target.chapterId),
    [candidates],
  );
  const statuses = useDownloadStatuses(chapterIds);
  const downloadedIds = useMemo(
    () =>
      new Set(
        chapterIds.filter((id) => statuses[id] === "completed"),
      ),
    [chapterIds, statuses],
  );
  const busy = chapterIds.some((id) => isDownloadBusy(statuses[id]));

  const onPress = useCallback(async () => {
    if (busy) return;
    await requestSeriesDownload({ candidates, context, downloadedIds });
  }, [busy, candidates, context, downloadedIds]);

  return (
    <Pressable
      onPress={() => void onPress()}
      hitSlop={8}
      style={[styles.headerBtn, style]}
      accessibilityLabel="Download chapters"
    >
      {busy ? (
        <ActivityIndicator color={accent} size="small" />
      ) : (
        <Download color={accent} size={20} />
      )}
    </Pressable>
  );
}

/** Chapter-row button: downloads (or reports) a single chapter. */
export function ChapterDownloadButton({
  candidate,
  context,
  status,
  accent,
}: {
  candidate: DownloadCandidate;
  context: DownloadContext;
  status: DownloadStatus | undefined;
  accent: string;
}) {
  const onPress = useCallback(async () => {
    if (status === "completed") {
      await deleteChapterWithConfirm({
        chapterId: candidate.target.chapterId,
        chapterTitle: candidate.chapterTitle,
        mangaTitle: context.mangaTitle,
      });
      return;
    }
    if (status === "failed") {
      await retryDownload(candidate.target.chapterId);
      return;
    }
    if (isDownloadBusy(status)) return;
    await requestChapterDownload(candidate, context);
  }, [candidate, context, status]);

  return (
    <Pressable
      onPress={() => void onPress()}
      hitSlop={8}
      style={styles.rowBtn}
      accessibilityLabel={
        status === "completed" ? "Downloaded" : "Download chapter"
      }
    >
      <StatusIcon status={status} accent={accent} size={18} />
    </Pressable>
  );
}

/** Reader bottom-bar button for the chapter that is currently open. */
export function ReaderDownloadButton({
  candidate,
  context,
  variant = "toolbar",
}: {
  candidate: DownloadCandidate | null;
  context: DownloadContext;
  variant?: "header" | "toolbar" | "card";
}) {
  const job = useDownloadJob(candidate?.target.chapterId ?? null);
  const status = job?.status;

  const onPress = useCallback(async () => {
    if (!candidate) return;
    if (status === "completed") {
      await deleteChapterWithConfirm({
        chapterId: candidate.target.chapterId,
        chapterTitle: candidate.chapterTitle,
        mangaTitle: context.mangaTitle,
      });
      return;
    }
    if (status === "failed") {
      await retryDownload(candidate.target.chapterId);
      return;
    }
    if (isDownloadBusy(status)) return;
    await requestChapterDownload(candidate, context);
  }, [candidate, context, status]);

  const downloaded = status === "completed";

  return (
    <Pressable
      onPress={() => void onPress()}
      style={
        variant === "card"
          ? styles.cardBtn
          : variant === "header"
            ? styles.headerBtn
            : styles.toolbarBtn
      }
      accessibilityLabel={downloaded ? "Downloaded" : "Download chapter"}
    >
      {status === "running" ? (
        <View style={styles.progressBadge}>
          <ActivityIndicator color={colors.accent} size="small" />
        </View>
      ) : (
        <StatusIcon
          status={status}
          accent={colors.accent}
          size={variant === "card" ? 20 : variant === "header" ? 20 : 22}
        />
      )}
      {downloaded && job && job.pageCount ? (
        <Text style={styles.progressText}>
          {Math.round(((job.pagesDone || job.pageCount) / job.pageCount) * 100)}%
        </Text>
      ) : null}
    </Pressable>
  );
}

function StatusIcon({
  status,
  accent,
  size,
}: {
  status: DownloadStatus | undefined;
  accent: string;
  size: number;
}) {
  if (status === "completed") {
    return <CircleCheckBig color={colors.success} size={size} />;
  }
  if (status === "failed") {
    return <RotateCcw color={colors.danger} size={size} />;
  }
  if (isDownloadBusy(status)) {
    return <Download color={accent} size={size} opacity={0.55} />;
  }
  return <Download color={accent} size={size} />;
}

/** Action-row variant used by the one-shot / gallery screen. */
export function GalleryDownloadButton({
  candidate,
  context,
}: {
  candidate: DownloadCandidate | null;
  context: DownloadContext;
}) {
  if (!candidate) return null;
  return (
    <ReaderDownloadButton
      candidate={candidate}
      context={context}
      variant="card"
    />
  );
}

/** Small "downloaded" tick shown next to a chapter title. */
export function DownloadedTick({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <Check color={colors.success} size={13} strokeWidth={3} />;
}

const styles = StyleSheet.create({
  headerBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarBtn: {
    width: 48,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  cardBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  progressBadge: { transform: [{ scale: 0.85 }] },
  progressText: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: "700",
    marginTop: -2,
  },
});
