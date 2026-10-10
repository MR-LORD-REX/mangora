/**
 * DownloadProgressPanel.tsx
 * ---------------------------------------------------------------------------
 * Live queue view: overall counts plus one row per chapter with its page
 * progress, transferred size, speed and ETA. Rows expose cancel/retry.
 * ---------------------------------------------------------------------------
 */

import { RotateCcw, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";
import {
  removeDownload,
  retryDownload,
  subscribeDownloads,
} from "@/services/downloader";
import type { DownloadJob, DownloadSnapshot } from "@/services/downloader";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function statusLabel(job: DownloadJob): string {
  if (job.status === "completed") return "Downloaded";
  if (job.status === "failed") return "Failed";
  if (job.status === "running") {
    const pages = job.pageCount
      ? `${job.pagesDone}/${job.pageCount} pages`
      : `${job.pagesDone} pages`;
    return pages;
  }
  return job.reason ?? "Queued";
}

const EMPTY_SNAPSHOT: DownloadSnapshot = {
  jobs: [],
  runningCount: 0,
  pendingCount: 0,
  paused: false,
};

export default function DownloadProgressPanel() {
  const [snapshot, setSnapshot] = useState<DownloadSnapshot>(EMPTY_SNAPSHOT);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeDownloads(setSnapshot), []);

  const hasRunning = snapshot.jobs.some((job) => job.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  const visibleJobs = snapshot.jobs.filter(
    (job) => job.status !== "completed",
  );

  if (visibleJobs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Nothing is downloading right now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {snapshot.paused ? (
        <Text style={styles.pausedText}>Queue paused</Text>
      ) : null}
      <Text style={styles.summary}>
        {snapshot.runningCount} downloading · {snapshot.pendingCount} waiting
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
      >
        {visibleJobs.map((job) => (
          <JobRow key={job.id} job={job} now={now} />
        ))}
      </ScrollView>
    </View>
  );
}

function JobRow({ job, now }: { job: DownloadJob; now: number }) {
  const total = job.pageCount ?? 0;
  const progress = total > 0 ? Math.min(1, job.pagesDone / total) : 0;
  const elapsedMs =
    job.status === "running" && job.startedAt ? now - job.startedAt : 0;
  const pagesPerSecond =
    elapsedMs > 1200 ? job.pagesDone / (elapsedMs / 1000) : 0;
  const remaining = total > 0 ? total - job.pagesDone : 0;
  const etaSeconds =
    pagesPerSecond > 0 && remaining > 0
      ? Math.round(remaining / pagesPerSecond)
      : null;

  const accent =
    job.status === "completed"
      ? colors.success
      : job.status === "failed"
        ? colors.danger
        : colors.accent;

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={styles.rowTitleWrap}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {job.chapterTitle}
          </Text>
          <Text numberOfLines={1} style={styles.rowSubtitle}>
            {job.mangaTitle}
          </Text>
        </View>
        <View style={styles.rowActions}>
          {job.status === "failed" ? (
            <Pressable
              hitSlop={8}
              onPress={() => void retryDownload(job.id)}
              style={styles.iconBtn}
            >
              <RotateCcw color={colors.accent} size={17} />
            </Pressable>
          ) : null}
          <Pressable
            hitSlop={8}
            onPress={() => void removeDownload(job.id)}
            style={styles.iconBtn}
          >
            <X color={colors.textFaint} size={17} />
          </Pressable>
        </View>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: accent,
            },
          ]}
        />
      </View>

      <View style={styles.rowFooter}>
        <Text style={[styles.statusText, { color: accent }]}>
          {statusLabel(job)}
        </Text>
        <Text style={styles.metaText}>
          {formatBytes(job.byteSize)}
          {pagesPerSecond > 0 ? ` · ${pagesPerSecond.toFixed(1)} p/s` : ""}
          {etaSeconds != null ? ` · ~${formatEta(etaSeconds)} left` : ""}
        </Text>
      </View>
    </View>
  );
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 4, paddingBottom: 8 },
  pausedText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  summary: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  scroll: { maxHeight: 340 },
  scrollContent: { gap: 10, paddingBottom: 8 },
  empty: { padding: 24, alignItems: "center" },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  rowHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rowTitleWrap: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowSubtitle: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 4 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: 2 },
  rowFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  metaText: { color: colors.textFaint, fontSize: 11 },
});
