/**
 * StorageSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> Data and storage: storage location, database backup / restore
 * and a usage bar that shows how much of the device is used by downloads.
 * ---------------------------------------------------------------------------
 */

import {
  CloudUpload,
  DatabaseBackup,
  FolderOpen,
  HardDrive,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/common/Dialogs";
import { colors, radius } from "@/constants/theme";
import {
  getDownloadFolderState,
  pickDownloadFolder,
} from "@/services/downloader";
import { createBackup, restoreBackup } from "@/services/settings/backup";
import { formatBytes, getStorageUsage } from "@/services/settings/storageUsage";
import type { AppSettings } from "@/services/settings/settingsStore";

import {
  ActionPill,
  InlineActions,
  SettingsRow,
  SettingsSection,
  SettingsValue,
} from "./SettingsPrimitives";

type Feedback = { title: string; message: string } | null;

export default function StorageSection({
  settings,
  onChange,
  standalone,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  standalone?: boolean;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const [usage, setUsage] = useState<Awaited<
    ReturnType<typeof getStorageUsage>
  > | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [restartPrompt, setRestartPrompt] = useState(false);

  const refresh = useCallback(() => {
    void getStorageUsage()
      .then(setUsage)
      .catch(() => {});
    void getDownloadFolderState()
      .then((state) => setLabel(state?.label ?? state?.treeUri ?? null))
      .catch(() => setLabel(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, settings.lastBackupAt]);

  const onPickFolder = async () => {
    setPickingFolder(true);
    try {
      const state = await pickDownloadFolder();
      if (state) {
        setLabel(state.label ?? state.treeUri);
        setFeedback({
          title: "Storage location saved",
          message: state.label ?? state.treeUri,
        });
      }
    } catch (error) {
      setFeedback({
        title: "Could not use that folder",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setPickingFolder(false);
    }
  };

  const onBackup = async () => {
    setBackingUp(true);
    try {
      const info = await createBackup();
      onChange({ lastBackupAt: info.createdAt });
      setFeedback({
        title: "Backup created",
        message: `${info.fileName} (${formatBytes(info.bytes)}) was written to the backup folder.`,
      });
    } catch (error) {
      setFeedback({
        title: "Backup failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not write the backup file.",
      });
    } finally {
      setBackingUp(false);
    }
  };

  const onRestore = async () => {
    setRestoring(true);
    try {
      const result = await restoreBackup();
      if (!result) return;
      setFeedback({
        title: "Backup restored",
        message: `${result.rows} rows across ${result.tables} tables were restored. Restart the app so every screen reloads the restored data.`,
      });
      setRestartPrompt(true);
      refresh();
    } catch (error) {
      setFeedback({
        title: "Restore failed",
        message:
          error instanceof Error
            ? error.message
            : "That file is not a valid backup.",
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SettingsSection
      title="Data and storage"
      subtitle="Where downloads live and how to keep the app's data safe."
      icon={HardDrive}
      standalone={standalone}
    >
      <SettingsRow
        icon={FolderOpen}
        title="Storage location"
        subtitle="Folder that holds the downloads/ and backup/ folders."
        onPress={() => void onPickFolder()}
        disabled={pickingFolder}
        right={
          <SettingsValue
            text={pickingFolder ? "Choosing..." : (label ?? "Not set")}
          />
        }
      />
      <SettingsRow
        icon={DatabaseBackup}
        title="Create backup"
        subtitle={
          settings.lastBackupAt
            ? `Last backup ${new Date(settings.lastBackupAt).toLocaleString()}`
            : "Saves the whole database into <storage>/backup."
        }
        right={
          <SettingsValue
            text={
              backingUp
                ? "Working..."
                : settings.lastBackupAt
                  ? "Back up again"
                  : "Back up"
            }
            accent
          />
        }
        onPress={backingUp ? undefined : () => void onBackup()}
      />
      <SettingsRow
        icon={CloudUpload}
        title="Restore backup"
        subtitle="Pick a .db backup file and replace the current app data."
        right={
          <SettingsValue
            text={restoring ? "Working..." : "Choose file"}
            accent
          />
        }
        onPress={restoring ? undefined : () => void onRestore()}
        last
      />
      <View style={styles.usageWrap}>
        <Text style={styles.usageTitle}>Storage usage</Text>
        {usage ? (
          <>
            <UsageBar
              total={usage.totalBytes}
              deviceUsed={usage.deviceUsedBytes}
              downloads={usage.downloadBytes}
            />
            <View style={styles.legend}>
              <Legend
                color={colors.accent}
                label="Downloads"
                value={formatBytes(usage.downloadBytes)}
              />
              <Legend
                color={colors.surfaceHigh}
                label="Device used"
                value={formatBytes(usage.deviceUsedBytes)}
              />
              <Legend
                color={colors.textFaint}
                label="Free"
                value={formatBytes(usage.freeBytes)}
              />
            </View>
            <Text style={styles.totalText}>
              {formatBytes(usage.totalBytes)} total device storage
            </Text>
          </>
        ) : (
          <Text style={styles.totalText}>Reading device storage...</Text>
        )}
        <InlineActions>
          <ActionPill label="Refresh" onPress={refresh} />
        </InlineActions>
      </View>

      <FeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />
      <ConfirmDialog
        visible={restartPrompt}
        title="Restart the app?"
        message="Close Mangora now so every screen picks up the restored data."
        confirmLabel="Restart"
        cancelLabel="Later"
        onCancel={() => setRestartPrompt(false)}
        onConfirm={() => {
          setRestartPrompt(false);
          BackHandler.exitApp();
        }}
      />
    </SettingsSection>
  );
}

function UsageBar({
  total,
  deviceUsed,
  downloads,
}: {
  total: number;
  deviceUsed: number;
  downloads: number;
}) {
  const safeTotal = total > 0 ? total : 1;
  const downloadPercent = Math.min(100, (downloads / safeTotal) * 100);
  const otherPercent = Math.max(
    0,
    Math.min(100 - downloadPercent, (deviceUsed / safeTotal) * 100),
  );
  return (
    <View style={styles.bar}>
      <View style={[styles.segment, { width: `${downloadPercent}%`, backgroundColor: colors.accent }]} />
      <View style={[styles.segment, { width: `${otherPercent}%`, backgroundColor: colors.surfaceHigh }]} />
      <View style={[styles.segment, styles.free]} />
    </View>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function FeedbackDialog({
  feedback,
  onClose,
}: {
  feedback: Feedback;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      visible={feedback !== null}
      title={feedback?.title ?? ""}
      message={feedback?.message}
      confirmLabel="OK"
      cancelLabel="Close"
      onCancel={onClose}
      onConfirm={onClose}
    />
  );
}

const styles = StyleSheet.create({
  usageWrap: { paddingHorizontal: 14, paddingTop: 14 },
  usageTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  bar: {
    flexDirection: "row",
    height: 12,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: colors.bg,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: { height: 12 },
  free: { flex: 1, backgroundColor: colors.bg },
  legend: { marginTop: 12, gap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { color: colors.textMuted, fontSize: 12, flex: 1 },
  legendValue: { color: colors.text, fontSize: 12, fontWeight: "700" },
  totalText: { color: colors.textFaint, fontSize: 12, marginTop: 10 },
});
