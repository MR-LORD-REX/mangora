/**
 * RegionModelsSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> Models -> Region detection. Lists the downloadable box and
 * segmentation detectors, their speed/quality tradeoff, and download state.
 * Exactly one detector is active for page scanning at a time.
 * ---------------------------------------------------------------------------
 */

import {
  CheckCircle2,
  Download,
  ScanSearch,
  Trash2,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "@shared/ui/overlays";
import { colors, radius } from "@shared/theme";
import { useAppSettings } from "../../../hooks/useAppSettings";
import {
  ALL_REGION_DETECTOR_IDS,
  cancelRegionModelDownload,
  deleteRegionModel,
  downloadRegionModel,
  formatModelBytes,
  getRegionDetector,
  getRegionModelDownloadState,
  isRegionModelDownloaded,
  REGION_DETECTORS,
  subscribeRegionModelDownloads,
  type RegionDetectorDef,
  type RegionDetectorId,
  type RegionModelDownloadState,
} from "@features/vision";

import { ActionPill, SettingsSection } from "../../primitives/SettingsPrimitives";

function initialStates(): Record<RegionDetectorId, RegionModelDownloadState> {
  return Object.fromEntries(
    ALL_REGION_DETECTOR_IDS.map((id) => [id, getRegionModelDownloadState(id)]),
  ) as Record<RegionDetectorId, RegionModelDownloadState>;
}

function initialDownloaded(): Record<RegionDetectorId, boolean | null> {
  return Object.fromEntries(
    ALL_REGION_DETECTOR_IDS.map((id) => [id, null]),
  ) as Record<RegionDetectorId, boolean | null>;
}

const PROFILE_LABEL: Record<RegionDetectorDef["speedProfile"], string> = {
  fast: "Fast",
  quality: "Quality",
  masking: "Bubble masking",
};

export default function RegionModelsSection({
  standalone,
}: {
  standalone?: boolean;
}) {
  const { settings, update } = useAppSettings();
  const [downloaded, setDownloaded] = useState(initialDownloaded);
  const [states, setStates] = useState(initialStates);
  const [busy, setBusy] = useState<Set<RegionDetectorId>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState<RegionDetectorId | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      ALL_REGION_DETECTOR_IDS.map(
        async (id) => [id, await isRegionModelDownloaded(id)] as const,
      ),
    );
    setDownloaded(
      Object.fromEntries(entries) as Record<RegionDetectorId, boolean>,
    );
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeRegionModelDownloads(() => setStates(initialStates()));
  }, [refresh]);

  const setBusyFor = (id: RegionDetectorId, value: boolean) => {
    setBusy((previous) => {
      const next = new Set(previous);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const startDownload = async (detector: RegionDetectorDef) => {
    setNotice(null);
    setBusyFor(detector.id, true);
    try {
      await downloadRegionModel(detector.id);
      await refresh();
      if (await isRegionModelDownloaded(detector.id)) {
        setNotice(detector.label + " is ready for page detection.");
      }
    } catch (error) {
      console.warn("[settings][region models] download failed", detector.id, error);
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not download " + detector.label + ".",
      );
    } finally {
      setBusyFor(detector.id, false);
    }
  };

  const cancelDownload = async (id: RegionDetectorId) => {
    await cancelRegionModelDownload(id);
    setStates(initialStates());
  };

  const removeModel = async (detector: RegionDetectorDef) => {
    setConfirmDelete(null);
    setBusyFor(detector.id, true);
    try {
      await deleteRegionModel(detector.id);
      await refresh();
      setNotice(detector.label + " was removed from this device.");
    } catch (error) {
      console.warn("[settings][region models] delete failed", detector.id, error);
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not remove " + detector.label + ".",
      );
    } finally {
      setBusyFor(detector.id, false);
    }
  };

  const pendingDelete = confirmDelete
    ? getRegionDetector(confirmDelete)
    : null;

  return (
    <>
      <SettingsSection
        title="Region detection"
        subtitle="Choose one model to find speech bubbles, bubble text and free text on each page."
        icon={ScanSearch}
        standalone={standalone}
      >
        {REGION_DETECTORS.map((detector, index) => (
          <DetectorRow
            key={detector.id}
            detector={detector}
            last={index === REGION_DETECTORS.length - 1}
            downloaded={downloaded[detector.id]}
            selected={settings.regionDetectorId === detector.id}
            state={states[detector.id]}
            busy={busy.has(detector.id)}
            onSelect={() => update({ regionDetectorId: detector.id })}
            onDownload={() => void startDownload(detector)}
            onCancel={() => void cancelDownload(detector.id)}
            onDelete={() => setConfirmDelete(detector.id)}
          />
        ))}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </SettingsSection>

      <ConfirmDialog
        visible={confirmDelete != null}
        title="Remove region model?"
        message={
          pendingDelete
            ? pendingDelete.label +
              " will be removed from this device. You can download it again later."
            : ""
        }
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void removeModel(pendingDelete);
        }}
      />
    </>
  );
}

function DetectorRow({
  detector,
  last,
  downloaded,
  selected,
  state,
  busy,
  onSelect,
  onDownload,
  onCancel,
  onDelete,
}: {
  detector: RegionDetectorDef;
  last: boolean;
  downloaded: boolean | null;
  selected: boolean;
  state: RegionModelDownloadState;
  busy: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);
  return (
    <View style={[styles.model, !last && styles.divider]}>
      <View style={styles.modelHead}>
        <View style={[styles.modelIcon, selected && styles.modelIconActive]}>
          <ScanSearch
            color={selected ? colors.success : colors.accent}
            size={18}
          />
        </View>
        <View style={styles.modelCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.modelTitle}>{detector.label}</Text>
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {PROFILE_LABEL[detector.speedProfile]}
              </Text>
            </View>
            {selected ? (
              <View style={[styles.tag, styles.tagSelected]}>
                <Text style={[styles.tagText, styles.tagTextSelected]}>
                  Selected
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.modelDetail}>{detector.detail}</Text>
        </View>
        <Text style={styles.modelSize}>{formatModelBytes(detector.bytes)}</Text>
      </View>

      {state.status === "downloading" ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Downloading</Text>
            <Text style={styles.progressValue}>{percent}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` as `${number}%` }]} />
          </View>
          <Text style={styles.progressBytes}>
            {formatModelBytes(state.downloadedBytes)} of{" "}
            {formatModelBytes(state.totalBytes)}
          </Text>
        </View>
      ) : null}

      {state.status === "error" && state.error ? (
        <Text style={styles.error}>{state.error}</Text>
      ) : null}

      <View style={styles.footer}>
        {downloaded === null ? (
          <ActivityIndicator color={colors.textFaint} size="small" />
        ) : downloaded ? (
          <View style={styles.status}>
            <CheckCircle2 color={colors.success} size={15} />
            <Text style={styles.statusReady}>Downloaded</Text>
          </View>
        ) : (
          <Text style={styles.statusMuted}>Not downloaded</Text>
        )}

        <View style={styles.footerActions}>
          {downloaded && !selected ? (
            <ActionPill label="Use" onPress={onSelect} />
          ) : null}
          {state.status === "downloading" ? (
            <ActionPill label="Cancel" onPress={onCancel} />
          ) : downloaded ? (
            <ActionPill
              label="Delete"
              icon={Trash2}
              destructive
              busy={busy}
              onPress={onDelete}
            />
          ) : (
            <ActionPill
              label={state.status === "error" ? "Retry" : "Download"}
              icon={Download}
              busy={busy}
              onPress={onDownload}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  model: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 9,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modelHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  modelIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  modelIconActive: { backgroundColor: colors.success + "22" },
  modelCopy: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  modelTitle: { color: colors.text, fontSize: 14.5, fontWeight: "800" },
  tag: {
    borderRadius: radius.full,
    backgroundColor: colors.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagSelected: { backgroundColor: colors.success + "22" },
  tagText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  tagTextSelected: { color: colors.success },
  modelDetail: { color: colors.textFaint, fontSize: 12, lineHeight: 17 },
  modelSize: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
  progressBlock: { gap: 5, marginTop: 2 },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  progressValue: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  progressBytes: { color: colors.textFaint, fontSize: 11 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
  },
  footerActions: { flexDirection: "row", gap: 8 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusReady: { color: colors.success, fontSize: 12, fontWeight: "700" },
  statusMuted: { color: colors.textFaint, fontSize: 12 },
  notice: {
    color: colors.textFaint,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    lineHeight: 17,
  },
});
