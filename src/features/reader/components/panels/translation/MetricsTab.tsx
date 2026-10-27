/* Pipeline and Gemini quota metrics for the reader translation sheet. */

import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ReaderPipelineMetrics } from "@/utils/reader/useReaderTranslation";
import {
  GEMINI_MODELS,
  getGeminiUsageSnapshot,
  subscribeGeminiUsage,
  type GeminiModelId,
  type GeminiUsageSnapshot,
} from "@features/translation";
import type { ReaderTranslationEngine } from "@core/settings";
import { HelperText } from "../ReaderPanelPrimitives";
import { styles } from "./styles";
import type { ReaderTranslationPanelProps } from "./types";

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return (
    <View style={styles.meterRow}>
      <View style={styles.meterHeader}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterValue}>
          {formatCount(used)} / {formatCount(limit)}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${ratio * 100}%` },
            ratio >= 0.85 && styles.barFillHot,
          ]}
        />
      </View>
    </View>
  );
}

/** Live Gemini quota meters (rolling 60s RPM/TPM, Pacific-day RPD). */
function ApiUsageSection({
  geminiModelId,
  includeFallbackModel,
}: {
  geminiModelId: GeminiModelId;
  includeFallbackModel: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<GeminiUsageSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const modelIds = useMemo(
    () =>
      includeFallbackModel
        ? GEMINI_MODELS.map((model) => model.id)
        : [geminiModelId],
    [includeFallbackModel, geminiModelId],
  );

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await Promise.all(modelIds.map(getGeminiUsageSnapshot));
        if (!active) return;
        setRows(next);
        setError(null);
      } catch (err) {
        if (active) setError("Usage meters unavailable.");
        console.warn("[reader][metrics] usage refresh failed", err);
      }
    };
    void refresh();
    const unsubscribe = subscribeGeminiUsage(() => {
      void refresh();
    });
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [modelIds]);

  const primary = rows[0];
  return (
    <View style={styles.dropdown}>
      <Pressable
        style={styles.dropdownHeader}
        onPress={() => setOpen((value) => !value)}
      >
        <View style={styles.dropdownTitleWrap}>
          <Text style={styles.dropdownTitle}>API usage</Text>
          <Text style={styles.dropdownSubtitle}>
            {primary
              ? `${primary.rpmUsed}/${primary.rpmLimit} RPM · ${primary.rpdUsed}/${primary.rpdLimit} RPD`
              : "Live Gemini quota"}
          </Text>
        </View>
        {open ? (
          <ChevronUp size={18} color="#94a3b8" />
        ) : (
          <ChevronDown size={18} color="#94a3b8" />
        )}
      </Pressable>
      {open ? (
        <View style={styles.dropdownBody}>
          {error ? <Text style={styles.modalError}>{error}</Text> : null}
          {rows.map((row) => (
            <View key={row.model} style={styles.usageModel}>
              <Text style={styles.usageModelLabel}>{row.label}</Text>
              <UsageMeter
                label="RPM"
                used={row.rpmUsed}
                limit={row.rpmLimit}
              />
              <UsageMeter
                label="TPM"
                used={row.tpmUsed}
                limit={row.tpmLimit}
              />
              <UsageMeter
                label="RPD"
                used={row.rpdUsed}
                limit={row.rpdLimit}
              />
            </View>
          ))}
          <Text style={styles.usageNote}>
            RPM/TPM use a rolling 60s window. RPD resets at midnight Pacific.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MetricsTable({
  header,
  rows,
}: {
  header: string[];
  rows: (string | number)[][];
}) {
  return (
    <View style={styles.metricsTable}>
      <View style={[styles.metricsRow, styles.metricsHeaderRow]}>
        {header.map((label, index) => (
          <Text
            key={label}
            style={[
              index === 0 ? styles.metricsLabelCell : styles.metricsNumCell,
              styles.metricsHeaderText,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={String(row[0])} style={styles.metricsRow}>
          {row.map((cell, index) => (
            <Text
              key={`${row[0]}-${header[index]}`}
              style={[
                index === 0 ? styles.metricsLabelCell : styles.metricsNumCell,
                index === 0 ? styles.metricsLabelText : styles.metricsNumText,
              ]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function PipelineMetrics({
  metrics,
  mode,
}: {
  metrics: ReaderPipelineMetrics;
  mode: ReaderTranslationEngine;
}) {
  const [open, setOpen] = useState(false);
  const queueRows: (string | number)[][] = [
    ["Page scan", metrics.scanPending, metrics.scanActive],
    ["Bubble OCR", metrics.ocrPending, metrics.ocrActive],
    ["Translation", metrics.trPending, metrics.trActive],
  ];
  const resultRows: (string | number)[][] = [
    [
      "Bubbles",
      metrics.bubblesTotal,
      metrics.bubblesTranslated,
      metrics.bubblesFailed,
    ],
    ["Pages", metrics.pagesTotal, metrics.pagesDone, metrics.pagesError],
  ];
  return (
    <View style={styles.dropdown}>
      <Pressable
        style={styles.dropdownHeader}
        onPress={() => setOpen((value) => !value)}
      >
        <View style={styles.dropdownTitleWrap}>
          <Text style={styles.dropdownTitle}>Pipeline metrics</Text>
          <Text style={styles.dropdownSubtitle}>
            {mode} · {metrics.activeJobs} active job
            {metrics.activeJobs === 1 ? "" : "s"}
          </Text>
        </View>
        {open ? (
          <ChevronUp size={18} color="#94a3b8" />
        ) : (
          <ChevronDown size={18} color="#94a3b8" />
        )}
      </Pressable>
      {open ? (
        <View style={styles.dropdownBody}>
          <MetricsTable
            header={["Stage", "Pending", "Active"]}
            rows={queueRows}
          />
          <MetricsTable
            header={["Result", "Total", "Done", "Failed"]}
            rows={resultRows}
          />
          <Text style={styles.usageNote}>
            Pages counters reflect the current translation run. Bubbles are
            counted from the in-memory OCR store.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function MetricsTab(props: ReaderTranslationPanelProps) {
  const {
    translationEngine,
    geminiModelId,
    autoModelSwitch,
    metrics,
  } = props;

  return (
    <View>
      <PipelineMetrics metrics={metrics} mode={translationEngine} />
      {translationEngine === "ai" ? (
        <ApiUsageSection
          geminiModelId={geminiModelId}
          includeFallbackModel={autoModelSwitch}
        />
      ) : (
        <HelperText>
          API usage is available when the AI translation engine is selected.
        </HelperText>
      )}
    </View>
  );
}
