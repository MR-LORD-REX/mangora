/**
 * OcrModelsSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> OCR models. Lists the two on-device providers, their languages
 * and download size, and exposes download / cancel / delete for each pack.
 * ---------------------------------------------------------------------------
 */

import {
  CheckCircle2,
  Download,
  ScanText,
  Trash2,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/common/Dialogs";
import { colors, radius } from "@/constants/theme";
import {
  ALL_MODEL_IDS,
  cancelModelDownload,
  deleteModel,
  downloadModel,
  getModelDownloadState,
  isModelDownloaded,
  subscribeModelDownloads,
  type ModelDownloadState,
} from "@/services/ocr/modelStore";
import {
  LOCAL_OCR_MODELS,
  formatModelBytes,
  type LocalOcrModelDef,
  type LocalOcrModelId,
} from "@/services/ocr/ocrModels";

import { ActionPill, SettingsSection } from "./SettingsPrimitives";

function initialStates(): Record<LocalOcrModelId, ModelDownloadState> {
  return Object.fromEntries(
    ALL_MODEL_IDS.map((id) => [id, getModelDownloadState(id)]),
  ) as Record<LocalOcrModelId, ModelDownloadState>;
}

function initialDownloaded(): Record<LocalOcrModelId, boolean | null> {
  return Object.fromEntries(ALL_MODEL_IDS.map((id) => [id, null])) as Record<
    LocalOcrModelId,
    boolean | null
  >;
}

export default function OcrModelsSection({
  standalone,
}: {
  standalone?: boolean;
}) {
  const [downloaded, setDownloaded] = useState(initialDownloaded);
  const [states, setStates] = useState(initialStates);
  const [busy, setBusy] = useState<Set<LocalOcrModelId>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState<LocalOcrModelId | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      ALL_MODEL_IDS.map(async (id) => [id, await isModelDownloaded(id)] as const),
    );
    setDownloaded(Object.fromEntries(entries) as Record<LocalOcrModelId, boolean>);
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeModelDownloads(() => {
      setStates(initialStates());
    });
    return unsubscribe;
  }, [refresh]);

  const setBusyFor = (id: LocalOcrModelId, value: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const startDownload = async (model: LocalOcrModelDef) => {
    setNotice(null);
    setBusyFor(model.id, true);
    console.log("[settings][ocr models] download start", {
      model: model.id,
      bytes: model.bytes,
    });
    try {
      await downloadModel(model.id);
      await refresh();
      console.log("[settings][ocr models] download complete", model.id);
      setNotice(`${model.label} is ready for on-device OCR.`);
    } catch (error) {
      console.warn("[settings][ocr models] download failed", model.id, error);
      setNotice(
        error instanceof Error ? error.message : `Could not download ${model.label}.`,
      );
    } finally {
      setBusyFor(model.id, false);
    }
  };

  const cancelDownload = async (model: LocalOcrModelDef) => {
    console.log("[settings][ocr models] download cancel", model.id);
    await cancelModelDownload(model.id);
    setStates(initialStates());
  };

  const removeModel = async (model: LocalOcrModelDef) => {
    setConfirmDelete(null);
    setBusyFor(model.id, true);
    console.log("[settings][ocr models] delete start", model.id);
    try {
      await deleteModel(model.id);
      await refresh();
      console.log("[settings][ocr models] delete complete", model.id);
      setNotice(`${model.label} was removed from this device.`);
    } catch (error) {
      console.warn("[settings][ocr models] delete failed", model.id, error);
      setNotice(
        error instanceof Error ? error.message : `Could not remove ${model.label}.`,
      );
    } finally {
      setBusyFor(model.id, false);
    }
  };

  const pendingDelete = confirmDelete
    ? LOCAL_OCR_MODELS.find((model) => model.id === confirmDelete) ?? null
    : null;

  return (
    <>
      <SettingsSection
        title="On-device OCR"
        subtitle="Download only the model your reading languages need."
        icon={ScanText}
        standalone={standalone}
      >
        {LOCAL_OCR_MODELS.map((model, index) => (
          <ModelRow
            key={model.id}
            model={model}
            last={index === LOCAL_OCR_MODELS.length - 1}
            downloaded={downloaded[model.id]}
            state={states[model.id]}
            busy={busy.has(model.id)}
            onDownload={() => void startDownload(model)}
            onCancel={() => void cancelDownload(model)}
            onDelete={() => setConfirmDelete(model.id)}
          />
        ))}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </SettingsSection>

      <ConfirmDialog
        visible={confirmDelete != null}
        title="Remove OCR model?"
        message={
          pendingDelete
            ? `${pendingDelete.label} will be deleted from this device. You can download it again later.`
            : undefined
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

function ModelRow({
  model,
  last,
  downloaded,
  state,
  busy,
  onDownload,
  onCancel,
  onDelete,
}: {
  model: LocalOcrModelDef;
  last: boolean;
  downloaded: boolean | null;
  state: ModelDownloadState;
  busy: boolean;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);

  return (
    <View style={[styles.model, !last && styles.divider]}>
      <View style={styles.modelHead}>
        <View style={styles.modelIcon}>
          <ScanText color={colors.accent} size={18} />
        </View>
        <View style={styles.modelCopy}>
          <Text style={styles.modelTitle}>{model.label}</Text>
          <Text style={styles.modelLanguages}>{model.languageLabel}</Text>
        </View>
        <Text style={styles.modelSize}>{formatModelBytes(model.bytes)}</Text>
      </View>

      <Text style={styles.modelDetail}>{model.detail}</Text>

      {state.status === "downloading" ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Downloading</Text>
            <Text style={styles.progressValue}>{percent}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
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
    gap: 8,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modelHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modelIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  modelCopy: { flex: 1, minWidth: 0 },
  modelTitle: { color: colors.text, fontSize: 14.5, fontWeight: "800" },
  modelLanguages: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  modelSize: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: "700",
  },
  modelDetail: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 17,
  },
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
