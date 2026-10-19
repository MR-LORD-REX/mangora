/**
 * TranslationQueueSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> Translation queue. Shows the pre-translate jobs, per-page
 * progress, pause/resume and a destructive cancel-all action.
 * ---------------------------------------------------------------------------
 */

import { Pause, Play, Trash2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/common/Dialogs";
import { colors, radius } from "@/constants/theme";
import {
  cancelTranslationQueue,
  pauseTranslationQueue,
  removePretranslateJob,
  resumeTranslationQueue,
  subscribePretranslate,
  type PretranslateJob,
  type PretranslateSnapshot,
} from "@/services/translation/pretranslateQueue";

import {
  ActionPill,
  InlineActions,
  SettingsSection,
} from "./SettingsPrimitives";

const EMPTY: PretranslateSnapshot = {
  jobs: [],
  runningCount: 0,
  pendingCount: 0,
  paused: false,
};

export default function TranslationQueueSection({
  standalone,
}: {
  standalone?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<PretranslateSnapshot>(EMPTY);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => subscribePretranslate(setSnapshot), []);

  const active = snapshot.jobs.filter(
    (job) => job.status !== "completed" && job.status !== "failed",
  );
  const failed = snapshot.jobs.filter((job) => job.status === "failed").length;

  const onCancel = () => {
    setConfirmCancel(false);
    const count = cancelTranslationQueue();
    setNotice(
      count === 0
        ? "The translation queue was already empty."
        : `Cancelled ${count} translation job${count === 1 ? "" : "s"}.`,
    );
  };

  return (
    <SettingsSection
      title="Translation queue"
      subtitle="Downloaded chapters translated ahead of time. Only one job runs at once."
      icon={Play}
      standalone={standalone}
    >
      <View style={styles.body}>
        {active.length === 0 ? (
          <Text style={styles.empty}>
            Nothing is waiting to translate. Use the language icon beside a
            downloaded chapter to queue it.
          </Text>
        ) : (
          <>
            {snapshot.paused ? (
              <Text style={styles.paused}>Queue paused</Text>
            ) : null}
            <Text style={styles.summary}>
              {snapshot.runningCount} running · {snapshot.pendingCount} waiting
              {failed ? ` · ${failed} failed` : ""}
            </Text>
            {active.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </>
        )}
      </View>
      <InlineActions>
        <ActionPill
          label={snapshot.paused ? "Resume queue" : "Pause queue"}
          icon={snapshot.paused ? Play : Pause}
          onPress={() => {
            if (snapshot.paused) resumeTranslationQueue();
            else pauseTranslationQueue();
            console.log("[settings][translation queue] toggle pause", {
              paused: !snapshot.paused,
            });
          }}
          disabled={active.length === 0}
        />
        <ActionPill
          label={`Cancel pending${active.length ? ` (${active.length})` : ""}`}
          icon={Trash2}
          destructive
          onPress={() => setConfirmCancel(true)}
          disabled={active.length === 0}
        />
      </InlineActions>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ConfirmDialog
        visible={confirmCancel}
        title="Cancel translation jobs?"
        message="Queued and running pre-translate jobs are stopped. Pages already translated stay in the cache."
        confirmLabel="Cancel jobs"
        cancelLabel="Keep"
        destructive
        onCancel={() => setConfirmCancel(false)}
        onConfirm={onCancel}
      />
    </SettingsSection>
  );
}

function JobRow({ job }: { job: PretranslateJob }) {
  const total = job.pageUris.length;
  const progress = total > 0 ? Math.min(1, job.pagesDone / total) : 0;
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
        <Pressable
          hitSlop={8}
          onPress={() => removePretranslateJob(job.id)}
          style={styles.iconBtn}
        >
          <Trash2 color={colors.textFaint} size={16} />
        </Pressable>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <View style={styles.rowFooter}>
        <Text style={styles.statusText}>
          {job.status === "running"
            ? `Page ${job.currentPage ?? job.pagesDone + 1} of ${total}`
            : job.status === "paused"
              ? "Paused"
              : "Queued"}
        </Text>
        <Text style={styles.metaText}>
          {job.pagesDone}/{total} pages
          {job.pagesFailed ? ` · ${job.pagesFailed} failed` : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 12, paddingHorizontal: 14, gap: 10 },
  empty: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  paused: { color: colors.gold, fontSize: 12, fontWeight: "700" },
  summary: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
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
  iconBtn: { padding: 4 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  rowFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  statusText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  metaText: { color: colors.textFaint, fontSize: 11 },
  notice: {
    color: colors.textFaint,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
