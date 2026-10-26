/**
 * QueueSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> Download queue: the live queue plus the actions that make sense
 * on it (retry failures, cancel everything that is still pending).
 * ---------------------------------------------------------------------------
 */

import { ListChecks, RotateCcw, Trash2 } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "@shared/ui/overlays";
import {
  cancelPendingDownloads,
  DownloadProgressPanel,
  retryFailedDownloads,
  useDownloadSnapshot,
} from "@features/downloads";
import { colors } from "@shared/theme";


import {
  ActionPill,
  InlineActions,
  SettingsSection,
} from "../../primitives/SettingsPrimitives";

export default function QueueSection({ standalone }: { standalone?: boolean }) {
  const snapshot = useDownloadSnapshot();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const failedCount = snapshot.jobs.filter((job) => job.status === "failed").length;
  const activeCount = snapshot.jobs.filter((job) => job.status !== "completed").length;

  const onRetry = useCallback(async () => {
    const count = await retryFailedDownloads();
    setNotice(
      count === 0
        ? "Nothing failed, so there was nothing to retry."
        : `Re-queued ${count} chapter${count === 1 ? "" : "s"}.`,
    );
  }, []);

  const onCancel = useCallback(async () => {
    setConfirmCancel(false);
    const count = await cancelPendingDownloads();
    setNotice(
      count === 0
        ? "The queue was already empty."
        : `Cancelled ${count} chapter${count === 1 ? "" : "s"}.`,
    );
  }, []);

  return (
    <SettingsSection
      title="Download queue"
      subtitle="Live progress. Finished chapters stay in the library and are not listed here."
      icon={ListChecks}
      standalone={standalone}
    >
      <View style={styles.body}>
        <DownloadProgressPanel />
      </View>
      <InlineActions>
        <ActionPill
          label={`Retry failed${failedCount ? ` (${failedCount})` : ""}`}
          icon={RotateCcw}
          onPress={() => void onRetry()}
          disabled={failedCount === 0}
        />
        <ActionPill
          label={`Cancel pending${activeCount ? ` (${activeCount})` : ""}`}
          icon={Trash2}
          destructive
          onPress={() => setConfirmCancel(true)}
          disabled={activeCount === 0}
        />
      </InlineActions>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ConfirmDialog
        visible={confirmCancel}
        title="Cancel pending downloads?"
        message="Every queued or running chapter is stopped and deleted. Chapters that already finished are kept."
        confirmLabel="Cancel downloads"
        cancelLabel="Keep"
        destructive
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void onCancel()}
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 12 },
  notice: {
    color: colors.textFaint,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
