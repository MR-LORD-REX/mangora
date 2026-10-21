/**
 * DownloadsSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> Downloads: connectivity, queue concurrency, recovery from
 * downloads/metadata/metadata.json and bulk deletion.
 * ---------------------------------------------------------------------------
 */

import { router } from "expo-router";
import {
  Download,
  Images,
  Layers,
  RefreshCw,
  Trash2,
  Wifi,
} from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/common/Dialogs";
import { colors, radius } from "@/constants/theme";
import {
  deleteAllDownloads,
  getDownloadFolderState,
  MISSING_METADATA_MESSAGE,
  readDownloadMetadata,
  recoverDownloads,
  type DownloadIssue,
  type DownloadProgress,
} from "@/services/downloader";
import type { AppSettings } from "@/services/settings/settingsStore";

import {
  SettingsRow,
  SettingsSection,
  SettingsValue,
  SliderRow,
  ToggleRow,
} from "./SettingsPrimitives";

type Feedback = { title: string; message: string } | null;

export default function DownloadsSection({
  settings,
  onChange,
  standalone,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  standalone?: boolean;
}) {
  const sources = settings.downloadSourceConcurrency;
  const pages = settings.downloadPageConcurrency;

  const [busy, setBusy] = useState<"recover" | "delete" | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [issues, setIssues] = useState<DownloadIssue[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [recoverConfirm, setRecoverConfirm] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [missingMetadataPrompt, setMissingMetadataPrompt] = useState(false);

  const prepareRecovery = async () => {
    setBusy("recover");
    setFeedback(null);
    setSummary(null);
    setIssues([]);
    try {
      const state = await getDownloadFolderState();
      if (!state) {
        throw new Error(
          "No download folder is selected. Choose a storage location first.",
        );
      }
      const metadata = await readDownloadMetadata(state.downloadsDirUri);
      if (metadata.state === "missing") {
        setMissingMetadataPrompt(true);
        return;
      }
      if (metadata.state === "invalid") {
        setFeedback({
          title: "metadata.json is invalid",
          message:
            metadata.reason +
            " Nothing was imported. Repair or restore metadata.json first.",
        });
        return;
      }
      setRecoverConfirm(metadata.data.chapters.length);
    } catch (error) {
      setFeedback({
        title: "Could not inspect downloads",
        message:
          error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  const runRecovery = async () => {
    setRecoverConfirm(null);
    setBusy("recover");
    setProgress({
      checked: 0,
      total: 0,
      recovered: 0,
      skipped: 0,
      failed: 0,
      current: "",
    });
    try {
      const result = await recoverDownloads(setProgress);
      setSummary(
        "Recovered " +
          result.recovered +
          ", skipped " +
          result.skipped +
          ", failed " +
          result.failed +
          " of " +
          result.total +
          " chapters.",
      );
      setIssues(result.issues);
    } catch (error) {
      setFeedback({
        title: "Recovery failed",
        message:
          error instanceof Error ? error.message : "Could not recover downloads.",
      });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const runDelete = async () => {
    setDeleteConfirm(false);
    setBusy("delete");
    setProgress({
      checked: 0,
      total: 0,
      recovered: 0,
      skipped: 0,
      failed: 0,
      current: "",
    });
    try {
      const result = await deleteAllDownloads(setProgress);
      setSummary(
        result.message +
          " Deleted " +
          result.deleted +
          ", skipped " +
          result.skipped +
          ", failed " +
          result.failed +
          ".",
      );
      setIssues(result.issues);
    } catch (error) {
      setFeedback({
        title: "Delete failed",
        message:
          error instanceof Error ? error.message : "Could not delete downloads.",
      });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.checked / progress.total) * 100))
      : 0;

  return (
    <SettingsSection
      title="Downloads"
      subtitle="How chapters are fetched, recovered and stored."
      icon={Download}
      standalone={standalone}
    >
      <ToggleRow
        icon={Wifi}
        title="Wi-Fi only"
        subtitle="Mobile data is never used for chapter downloads."
        value={settings.downloadWifiOnly}
        onChange={(value) => onChange({ downloadWifiOnly: value })}
      />
      <SliderRow
        icon={Layers}
        title="Chapters per source"
        subtitle={
          "Download " +
          sources +
          " chapter" +
          (sources === 1 ? "" : "s") +
          " of the same source at once."
        }
        value={sources}
        min={1}
        max={5}
        onChange={(value) => onChange({ downloadSourceConcurrency: value })}
      />
      <SliderRow
        icon={Images}
        title="Pages per chapter"
        subtitle={
          "Fetch " +
          pages +
          " page" +
          (pages === 1 ? "" : "s") +
          " of a chapter in parallel."
        }
        value={pages}
        min={1}
        max={10}
        onChange={(value) => onChange({ downloadPageConcurrency: value })}
      />
      <SettingsRow
        icon={RefreshCw}
        title="Recover downloads"
        subtitle="Rebuild the download index from downloads/metadata/metadata.json and validate every archive."
        right={
          <SettingsValue
            text={busy === "recover" ? "Working..." : "Recover"}
            accent
          />
        }
        disabled={busy != null}
        onPress={() => void prepareRecovery()}
      />
      <SettingsRow
        icon={Trash2}
        title="Delete downloads"
        subtitle="Remove chapter archives and metadata entries. Files the catalog cannot identify are left in place."
        right={
          <SettingsValue
            text={busy === "delete" ? "Working..." : "Delete"}
            accent
          />
        }
        destructive
        disabled={busy != null}
        onPress={() => setDeleteConfirm(true)}
      />
      <SettingsRow
        icon={Trash2}
        title="Manage downloaded chapters"
        subtitle="Browse downloads by source and remove chapters or whole manga."
        last
        onPress={() => router.push("/downloads")}
      />

      {progress ? (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>
            {(busy === "delete" ? "Deleting " : "Checking ") +
              progress.checked +
              " of " +
              progress.total +
              " chapters"}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          {progress.current ? (
            <Text style={styles.progressCurrent} numberOfLines={1}>
              {progress.current}
            </Text>
          ) : null}
          <Text style={styles.progressCounts}>
            {busy === "delete" ? "Deleted " : "Recovered "}
            {progress.recovered}
            {" \u00b7 Skipped "}
            {progress.skipped}
            {" \u00b7 Failed "}
            {progress.failed}
          </Text>
        </View>
      ) : null}

      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      {feedback ? (
        <View style={styles.feedback}>
          <Text style={styles.feedbackTitle}>{feedback.title}</Text>
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </View>
      ) : null}
      {issues.length > 0 ? (
        <View style={styles.issues}>
          <Text style={styles.issuesTitle}>
            {"Issues (" + issues.length + ")"}
          </Text>
          {issues.slice(0, 20).map((issue) => (
            <Text key={issue.id + issue.reason} style={styles.issueText}>
              {"\u2022 " + issue.title + ": " + issue.reason}
            </Text>
          ))}
          {issues.length > 20 ? (
            <Text style={styles.issueText}>
              {"\u2026and " + (issues.length - 20) + " more."}
            </Text>
          ) : null}
        </View>
      ) : null}

      <ConfirmDialog
        visible={recoverConfirm != null}
        title="Recover downloads?"
        message={
          "metadata.json lists " +
          (recoverConfirm ?? 0) +
          " chapters. Each archive will be checked for a valid page count before it is imported."
        }
        confirmLabel="Start recovery"
        busy={busy === "recover"}
        onCancel={() => setRecoverConfirm(null)}
        onConfirm={() => void runRecovery()}
      />
      <ConfirmDialog
        visible={missingMetadataPrompt}
        title="Recovery unavailable"
        message={MISSING_METADATA_MESSAGE}
        cancelLabel="Cancel"
        confirmLabel="Delete downloads"
        destructive
        onCancel={() => setMissingMetadataPrompt(false)}
        onConfirm={() => {
          setMissingMetadataPrompt(false);
          setDeleteConfirm(true);
        }}
      />
      <ConfirmDialog
        visible={deleteConfirm}
        title="Delete downloads?"
        message="Chapter archives listed in metadata.json and the app database will be removed. If metadata.json is missing, only archives recorded in the database can be identified and deleted. This cannot be undone."
        confirmLabel="Delete downloads"
        destructive
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={() => void runDelete()}
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
    gap: 8,
  },
  progressTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.accent },
  progressCurrent: { color: colors.textMuted, fontSize: 11.5 },
  progressCounts: { color: colors.textFaint, fontSize: 11 },
  summary: {
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  feedback: {
    marginHorizontal: 14,
    marginTop: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    backgroundColor: colors.surfaceHigh,
    gap: 4,
  },
  feedbackTitle: { color: colors.danger, fontSize: 13, fontWeight: "800" },
  feedbackText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  issues: {
    marginHorizontal: 14,
    marginTop: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
    gap: 4,
  },
  issuesTitle: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
  issueText: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16 },
});
