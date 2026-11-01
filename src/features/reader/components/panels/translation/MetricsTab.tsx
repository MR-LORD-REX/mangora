/* Pipeline and provider-aware API usage metrics for the reader sheet. */

import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ReaderPipelineMetrics } from "../../../translation/types";
import {
  getTranslationsUsageSnapshot,
  isGeminiBaseUrl,
  subscribeTranslationUsage,
  type TranslationProviderConfig,
  type TranslationUsageSnapshot,
} from "@features/translation";
import type { ReaderTranslationEngine } from "@core/settings";
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
  limit?: number;
}) {
  const boundedLimit = limit ?? 0;
  const ratio = boundedLimit > 0 ? Math.min(1, used / boundedLimit) : 0;
  return (
    <View style={styles.meterRow}>
      <View style={styles.meterHeader}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterValue}>
          {limit == null ? formatCount(used) + " used" : formatCount(used) + " / " + formatCount(limit)}
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

/** Live provider usage. Only Gemini's hosted endpoint includes reference caps. */
function ApiUsageSection({
  translationModelId,
  includeFallbackModel,
  provider,
}: {
  translationModelId: string;
  includeFallbackModel: boolean;
  provider: TranslationProviderConfig | null;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TranslationUsageSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const models = useMemo(
    () =>
      provider
        ? includeFallbackModel
          ? provider.models
          : [translationModelId || provider.model]
        : [],
    [includeFallbackModel, provider, translationModelId],
  );

  useEffect(() => {
    if (!provider || models.length === 0) {
      setRows([]);
      setError(null);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const next = await Promise.all(
          models.map((model) => getTranslationsUsageSnapshot(provider, model)),
        );
        if (active) {
          setRows(next);
          setError(null);
        }
      } catch (nextError) {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Could not read usage data.",
          );
        }
      }
    };
    void refresh();
    const unsubscribe = subscribeTranslationUsage(() => void refresh());
    const timer = setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [models, provider]);

  if (!provider) {
    return (
      <View style={styles.usageModel}>
        <Text style={styles.usageModelLabel}>API usage</Text>
        <Text style={styles.usageNote}>
          Free translation does not use a provider quota.
        </Text>
      </View>
    );
  }

  const primary = rows[0];
  const isGemini = isGeminiBaseUrl(provider.baseUrl);
  const summary = primary
    ? isGemini && primary.limits
      ? primary.rpmUsed +
        "/" +
        primary.limits.rpm +
        " RPM · " +
        primary.rpdUsed +
        "/" +
        primary.limits.rpd +
        " RPD"
      : primary.rpmUsed + " RPM · " + primary.rpdUsed + " RPD used"
    : isGemini
      ? "Live Gemini usage"
      : "Live endpoint usage";

  return (
    <View style={styles.meterWrap}>
      <Pressable
        style={styles.usageModel}
        onPress={() => setOpen((value) => !value)}
      >
        <View style={styles.meterHeader}>
          <Text style={styles.usageModelLabel}>
            {isGemini ? "Gemini usage" : "API usage"}
          </Text>
          <Text style={styles.meterValue}>{summary}</Text>
        </View>
        <Text style={styles.usageNote}>
          {isGemini
            ? "Usage counts requests sent by this app; limits are Gemini free-tier references."
            : provider.endpointKey +
              " · usage counts requests sent by this app. No provider limit is assumed."}
        </Text>
      </Pressable>
      {open
        ? rows.map((row) => (
            <View key={row.model + row.endpointKey} style={styles.usageModel}>
              <Text style={styles.usageModelLabel}>{row.label}</Text>
              <UsageMeter
                label="RPM"
                used={row.rpmUsed}
                limit={row.limits?.rpm}
              />
              <UsageMeter
                label="TPM"
                used={row.tpmUsed}
                limit={row.limits?.tpm}
              />
              <UsageMeter
                label="RPD"
                used={row.rpdUsed}
                limit={row.limits?.rpd}
              />
            </View>
          ))
        : null}
      {error ? <Text style={styles.usageNote}>{error}</Text> : null}
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
    translationModelId,
    autoModelSwitch,
    metrics,
    aiProvider,
  } = props;

  return (
    <View>
      <PipelineMetrics metrics={metrics} mode={translationEngine} />
      <ApiUsageSection
        translationModelId={translationModelId}
        includeFallbackModel={autoModelSwitch}
        provider={aiProvider}
      />
    </View>
  );
}
