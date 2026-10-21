/**
 * ReaderTranslationPanel.tsx
 * ---------------------------------------------------------------------------
 * Translation options sheet opened from the reader header's sliders icon.
 * Tabs are always visible and follow TR mode:
 *
 *   Language       - source (OCR) + target language pickers
 *   Translation engine - free / AI picker
 *   Translation mode   - off / single page / auto
 *   Advance        - look ahead, translation model, auto model switch, cache
 *   Metrics        - pipeline metrics and AI quota usage
 *   Overlay        - paste text size, font and color
 *
 * The general reader config (reading / general / filter) stays behind the
 * bottom bar's settings button in ReaderConfigPanel.
 * ---------------------------------------------------------------------------
 */

import {
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  ReaderTranslationEngine,
  ReaderTranslationMode,
} from "@/services/settings/settingsStore";
import MenuSheet from "@/components/common/MenuSheet";
import type { ReaderPipelineMetrics } from "@/utils/reader/useReaderTranslation";
import {
  GEMINI_MODELS,
  type GeminiModelId,
} from "@/services/translation/geminiModels";
import {
  getGeminiUsageSnapshot,
  subscribeGeminiUsage,
  type GeminiUsageSnapshot,
} from "@/services/translation/geminiUsage";
import { READER_TARGET_OPTIONS } from "@/services/translation/translationLang";
import DotSlider from "./DotSlider";
import {
  OVERLAY_FONT_OPTIONS,
  overlayFontFamily,
  overlayFontSupportsLanguage,
  useOverlayFonts,
} from "./overlayFonts";
import type { ReaderOverlayFont } from "./readerChrome";
import { READER_LANGUAGE_OPTIONS } from "./readerLanguages";
import { HelperText, SectionLabel, TabBar } from "./ReaderPanelPrimitives";
import { READER_PANEL_BG, READER_PILL_BORDER } from "./readerTheme";

export type ReaderTranslationTab =
  | "language"
  | "trMode"
  | "advance"
  | "metrics"
  | "overlay";

/** Full tab list; every tab stays visible regardless of TR mode. */
export const READER_TRANSLATION_TABS: {
  key: ReaderTranslationTab;
  label: string;
}[] = [
  { key: "language", label: "Language" },
  { key: "trMode", label: "Modes" },
  { key: "advance", label: "Advance" },
  { key: "metrics", label: "Metrics" },
  { key: "overlay", label: "Overlay" },
];

const ENGINE_OPTIONS: {
  value: ReaderTranslationEngine;
  label: string;
  description: string;
}[] = [
  {
    value: "free",
    label: "Free translation",
    description:
      "No API key needed. Each page is scanned and OCRed once, then every speech bubble is translated by the free Google endpoint as it finishes and pasted over the original text.",
  },
  {
    value: "ai",
    label: "AI translation",
    description:
      "Context-aware Gemini translation. Revisiting an already translated page restores it from the saved cache. Requires a Gemini API key.",
  },
];

const MODE_OPTIONS: {
  value: ReaderTranslationMode;
  label: string;
  description: string;
}[] = [
  {
    value: "off",
    label: "Off",
    description:
      "Translation is disabled - pages are shown in their original language.",
  },
  {
    value: "single",
    label: "Single page",
    description:
      "A floating TR button translates only the current page. One page is processed at a time.",
  },
  {
    value: "auto",
    label: "Auto",
    description:
      "The current page and look-ahead pages are translated automatically as you read. A page waits for its full OCR pass before translation starts.",
  },
];

export interface ReaderTranslationPanelProps {
  tab: ReaderTranslationTab;
  onTabChange: (tab: ReaderTranslationTab) => void;
  onClose: () => void;

  // Language tab.
  readerLanguage: string;
  ocrLanguage: string;
  autoLanguage: string;
  targetLanguage: string;
  onSelectReaderLanguage: (code: string) => void;
  onSelectTargetLanguage: (code: string) => void;

  // TR mode tab.
  translationEngine: ReaderTranslationEngine;
  onSelectTranslationEngine: (engine: ReaderTranslationEngine) => void;
  translationMode: ReaderTranslationMode;
  onSelectTranslationMode: (mode: ReaderTranslationMode) => void;

  // Advance tab.
  geminiModelId: GeminiModelId;
  onSelectGeminiModel: (model: GeminiModelId) => void;
  autoModelSwitch: boolean;
  onChangeAutoModelSwitch: (value: boolean) => void;
  ocrLookahead: number;
  onChangeLookahead: (value: number) => void;
  onClearTrCache: () => Promise<number>;

  // Metrics tab.
  metrics: ReaderPipelineMetrics;

  // Overlay tab.
  overlayFont: ReaderOverlayFont;
  onChangeOverlayFont: (font: ReaderOverlayFont) => void;
  overlayFontWeight: number;
  onChangeOverlayFontWeight: (weight: number) => void;
  overlayFontScale: number;
  onChangeOverlayFontScale: (scale: number) => void;
  overlayTextColor: string;
  onChangeOverlayTextColor: (color: string) => void;
  showPageStatus: boolean;
  onChangeShowPageStatus: (value: boolean) => void;
  hideTranslated: boolean;
  onChangeHideTranslated: (value: boolean) => void;
}

export default function ReaderTranslationPanel(
  props: ReaderTranslationPanelProps,
) {
  const { tab, onTabChange, onClose } = props;
  return (
    <View style={styles.panel}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <TabBar
          tabs={READER_TRANSLATION_TABS}
          active={tab}
          onChange={onTabChange}
        />
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <X color="#fff" size={20} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === "language" && <LanguageTab {...props} />}
        {tab === "trMode" && <ModeTab {...props} />}
        {tab === "advance" && <AdvanceTab {...props} />}
        {tab === "metrics" && <MetricsTab {...props} />}
        {tab === "overlay" && <OverlayTab {...props} />}
      </ScrollView>
    </View>
  );
}

function LanguageTab(props: ReaderTranslationPanelProps) {
  const {
    readerLanguage,
    ocrLanguage,
    autoLanguage,
    targetLanguage,
    onSelectReaderLanguage,
    onSelectTargetLanguage,
  } = props;
  const [sourceOpen, setSourceOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const selectedSource =
    READER_LANGUAGE_OPTIONS.find(
      (option) => (readerLanguage || "") === option.code,
    ) ?? READER_LANGUAGE_OPTIONS[0];
  const selectedTarget =
    READER_TARGET_OPTIONS.find((option) => targetLanguage === option.code) ??
    READER_TARGET_OPTIONS[0];

  return (
    <View>
      <SectionLabel>Source language</SectionLabel>
      <Text style={styles.columnCaption}>OCR language for detected text</Text>
      <Pressable
        onPress={() => setSourceOpen((open) => !open)}
        style={styles.languagePicker}
      >
        <View style={styles.rowText}>
          <Text
            style={[styles.rowLabel, { color: "#fbbf24" }]}
            numberOfLines={1}
          >
            {selectedSource?.label ?? "Select source language"}
          </Text>
          <Text style={styles.rowDetail} numberOfLines={1}>
            {selectedSource?.detail}
          </Text>
        </View>
        {sourceOpen ? (
          <ChevronUp size={18} color="#fbbf24" />
        ) : (
          <ChevronDown size={18} color="#fbbf24" />
        )}
      </Pressable>
      {sourceOpen && (
        <ScrollView
          style={styles.languageList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {READER_LANGUAGE_OPTIONS.map((option) => {
            const active = (readerLanguage || "") === option.code;
            return (
              <Pressable
                key={option.code || "auto"}
                onPress={() => {
                  onSelectReaderLanguage(option.code);
                  setSourceOpen(false);
                }}
                style={[styles.optionRow, active && styles.optionRowActive]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowLabel, active && { color: "#fbbf24" }]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.rowDetail} numberOfLines={1}>
                    {option.detail}
                  </Text>
                </View>
                {active && <Check size={18} color="#34d399" />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <HelperText>
        Sent to OCR as {ocrLanguage} (auto: {autoLanguage}).
      </HelperText>

      <SectionLabel>Target language</SectionLabel>
      <Text style={styles.columnCaption}>Translate into</Text>
      <Pressable
        onPress={() => setTargetOpen((open) => !open)}
        style={styles.languagePicker}
      >
        <View style={styles.rowText}>
          <Text
            style={[styles.rowLabel, { color: "#38bdf8" }]}
            numberOfLines={1}
          >
            {selectedTarget?.label ?? "Select target language"}
          </Text>
          <Text style={styles.rowDetail} numberOfLines={1}>
            {selectedTarget?.detail || "Translate into"}
          </Text>
        </View>
        {targetOpen ? (
          <ChevronUp size={18} color="#38bdf8" />
        ) : (
          <ChevronDown size={18} color="#38bdf8" />
        )}
      </Pressable>
      {targetOpen && (
        <ScrollView
          style={styles.languageList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {READER_TARGET_OPTIONS.map((option) => {
            const active = targetLanguage === option.code;
            return (
              <Pressable
                key={option.code}
                onPress={() => {
                  onSelectTargetLanguage(option.code);
                  setTargetOpen(false);
                }}
                style={[styles.optionRow, active && styles.optionRowActive]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowLabel, active && { color: "#38bdf8" }]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.rowDetail} numberOfLines={1}>
                    {option.detail || "Translate into"}
                  </Text>
                </View>
                {active && <Check size={18} color="#34d399" />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <HelperText>
        Translation is skipped when the target matches the source language.
      </HelperText>
    </View>
  );
}

function ModeTab(props: ReaderTranslationPanelProps) {
  const {
    translationEngine,
    onSelectTranslationEngine,
    translationMode,
    onSelectTranslationMode,
  } = props;

  return (
    <View>
      <SectionLabel>Translation engine</SectionLabel>
      {ENGINE_OPTIONS.map((option) => {
        const active = translationEngine === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelectTranslationEngine(option.value)}
            style={[styles.modeCard, active && styles.modeCardActive]}
          >
            <View style={styles.modeCardHeader}>
              <Text
                style={[styles.modeCardTitle, active && { color: "#0ea5e9" }]}
              >
                {option.label}
              </Text>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioDot} />}
              </View>
            </View>
            {active && (
              <Text style={styles.modeCardDescription}>
                {option.description}
              </Text>
            )}
          </Pressable>
        );
      })}

      <View style={{ height: 16 }} />
      <SectionLabel>Translation mode</SectionLabel>
      {MODE_OPTIONS.map((option) => {
        const active = translationMode === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelectTranslationMode(option.value)}
            style={[styles.modeCard, active && styles.modeCardActive]}
          >
            <View style={styles.modeCardHeader}>
              <Text
                style={[styles.modeCardTitle, active && { color: "#0ea5e9" }]}
              >
                {option.label}
              </Text>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioDot} />}
              </View>
            </View>
            {active && (
              <Text style={styles.modeCardDescription}>
                {option.description}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
function AdvanceTab(props: ReaderTranslationPanelProps) {
  const {
    translationEngine,
    translationMode,
    geminiModelId,
    onSelectGeminiModel,
    autoModelSwitch,
    onChangeAutoModelSwitch,
    ocrLookahead,
    onChangeLookahead,
    onClearTrCache,
  } = props;
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [clearState, setClearState] = useState<
    "idle" | "confirm" | "clearing" | "done"
  >("idle");
  const [clearedPages, setClearedPages] = useState(0);
  const [clearError, setClearError] = useState<string | null>(null);

  const selectedModel =
    GEMINI_MODELS.find((model) => model.id === geminiModelId) ??
    GEMINI_MODELS[0];

  const clearCache = async () => {
    setClearState("clearing");
    setClearError(null);
    try {
      const removed = await onClearTrCache();
      setClearedPages(removed);
      setClearState("done");
      console.log("[reader][advance] cache cleared", { removed });
    } catch (error) {
      setClearState("idle");
      setClearError(
        error instanceof Error ? error.message : "Could not clear TR cache.",
      );
      console.warn("[reader][advance] cache clear failed", error);
    }
  };

  return (
    <View>
      {translationMode !== "off" ? (
        <>
          <SectionLabel>Look ahead</SectionLabel>
          <View style={styles.sliderValueRow}>
            <Text style={styles.sliderValueLabel}>
              Pages kept ready in the scan window
            </Text>
            <Text style={styles.sliderValue}>{ocrLookahead}</Text>
          </View>
          <DotSlider
            value={ocrLookahead}
            min={1}
            max={5}
            step={1}
            dotCount={5}
            leftLabel="Visible page"
            rightLabel="Visible + 4"
            onChange={onChangeLookahead}
          />
          <HelperText>
            Upcoming pages are queued for OCR and translation as you read. Two
            is the default.
          </HelperText>
        </>
      ) : (
        <HelperText>
          Turn translation on in the Modes tab to configure look ahead.
        </HelperText>
      )}

      {translationEngine === "ai" ? (
        <>
          <SectionLabel>Translation model</SectionLabel>
          <Pressable
            style={styles.dropdown}
            onPress={() => setModelMenuOpen(true)}
          >
            <View style={styles.dropdownHeader}>
              <View style={styles.dropdownTitleWrap}>
                <Text style={styles.dropdownTitle}>{selectedModel.label}</Text>
                <Text style={styles.dropdownSubtitle}>
                  Used for new AI translation requests
                </Text>
              </View>
              <ChevronDown size={18} color="#94a3b8" />
            </View>
          </Pressable>
          <MenuSheet
            visible={modelMenuOpen}
            title="Translation model"
            onClose={() => setModelMenuOpen(false)}
            options={GEMINI_MODELS.map((model) => ({
              key: model.id,
              label: model.label,
              selected: model.id === geminiModelId,
              onPress: () => onSelectGeminiModel(model.id),
            }))}
          />

          <SectionLabel>Auto model switch</SectionLabel>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>Switch on rate limits</Text>
              <Text style={styles.toggleDetail}>
                When Gemini reports a rate limit, retry the page with the other
                model. Two failed switches turn this off until you enable it
                again.
              </Text>
            </View>
            <Switch
              value={autoModelSwitch}
              onValueChange={onChangeAutoModelSwitch}
              trackColor={{ false: "#334155", true: "#0ea5e9" }}
              thumbColor="#f8fafc"
            />
          </View>
        </>
      ) : null}

      <SectionLabel>TR cache</SectionLabel>
      <HelperText>
        Cached translations for this manga are stored in the database.
      </HelperText>
      {clearState === "confirm" ? (
        <View style={styles.confirmRow}>
          <Text style={styles.confirmText}>
            {"Delete this manga's TR cache?"}
          </Text>
          <View style={styles.confirmActions}>
            <Pressable
              onPress={() => setClearState("idle")}
              style={styles.smallButton}
            >
              <Text style={styles.smallButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={clearCache}
              style={[styles.smallButton, styles.dangerButton]}
            >
              <Text style={styles.dangerButtonText}>Clear</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setClearState("confirm")}
          disabled={clearState === "clearing"}
          style={[
            styles.clearCacheButton,
            clearState === "clearing" && { opacity: 0.6 },
          ]}
        >
          {clearState === "clearing" ? (
            <ActivityIndicator color="#fda4af" size="small" />
          ) : (
            <Trash2 color="#fda4af" size={16} />
          )}
          <Text style={styles.clearCacheText}>
            {clearState === "clearing" ? "Clearing\u2026" : "Clear TR cache"}
          </Text>
        </Pressable>
      )}
      {clearState === "done" ? (
        <Text style={styles.clearCacheSuccess}>
          Cleared {clearedPages} cached page{clearedPages === 1 ? "" : "s"}.
        </Text>
      ) : null}
      {clearError ? <Text style={styles.modalError}>{clearError}</Text> : null}
    </View>
  );
}

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

function MetricsTab(props: ReaderTranslationPanelProps) {
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

function OverlayTab(props: ReaderTranslationPanelProps) {
  const {
    overlayFont,
    onChangeOverlayFont,
    overlayFontWeight,
    onChangeOverlayFontWeight,
    overlayFontScale,
    onChangeOverlayFontScale,
    overlayTextColor,
    onChangeOverlayTextColor,
    showPageStatus,
    onChangeShowPageStatus,
    hideTranslated,
    onChangeHideTranslated,
    targetLanguage,
  } = props;
  const fontsLoaded = useOverlayFonts();
  const supported = overlayFontSupportsLanguage(targetLanguage);
  const effectiveFont = supported ? overlayFont : "default";
  const rgb = hexToRgb(overlayTextColor);
  const setChannel = (channel: "r" | "g" | "b", value: number) => {
    onChangeOverlayTextColor(
      rgbToHex({ ...rgb, [channel]: Math.round(value) }),
    );
  };

  return (
    <View>
      <SectionLabel>Visibility</SectionLabel>
      <View style={styles.toggleRow}>
        <View style={styles.toggleTextWrap}>
          <Text style={styles.toggleLabel}>Show page status</Text>
          <Text style={styles.toggleDetail}>
            Animated OCR / translation status on each page.
          </Text>
        </View>
        <Switch
          value={showPageStatus}
          onValueChange={onChangeShowPageStatus}
          trackColor={{ false: "#33354a", true: "#0ea5e9" }}
          thumbColor="#f8fafc"
        />
      </View>
      <View style={styles.toggleRow}>
        <View style={styles.toggleTextWrap}>
          <Text style={styles.toggleLabel}>Hide translated</Text>
          <Text style={styles.toggleDetail}>
            Hide overlays on pages that already finished translating.
          </Text>
        </View>
        <Switch
          value={hideTranslated}
          onValueChange={onChangeHideTranslated}
          trackColor={{ false: "#33354a", true: "#0ea5e9" }}
          thumbColor="#f8fafc"
        />
      </View>

      <SectionLabel>Preview</SectionLabel>
      <View style={styles.overlayPreviewCard}>
        <Text
          allowFontScaling={false}
          style={{
            color: overlayTextColor,
            fontFamily: overlayFontFamily(
              effectiveFont,
              fontsLoaded,
              overlayFontWeight,
            ),
            fontWeight: String(overlayFontWeight) as TextStyle["fontWeight"],
            fontSize: 20 * Math.min(1.5, Math.max(0.5, overlayFontScale || 1)),
            textAlign: "center",
          }}
        >
          The quick brown fox jumps over the lazy dog.
        </Text>
      </View>

      <SectionLabel>Font style</SectionLabel>
      <View style={styles.fontRadioGroup}>
        {OVERLAY_FONT_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => onChangeOverlayFont(option.key)}
            style={styles.fontRadioRow}
          >
            <View
              style={[
                styles.radio,
                overlayFont === option.key && styles.radioActive,
              ]}
            >
              {overlayFont === option.key && <View style={styles.radioDot} />}
            </View>
            <Text
              style={[
                styles.fontRadioLabel,
                {
                  fontFamily: overlayFontFamily(option.key, fontsLoaded),
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionLabel>Font weight</SectionLabel>
      <View style={styles.overlaySlider}>
        <View style={styles.overlaySliderHeader}>
          <Text style={styles.overlaySliderLabel}>Weight</Text>
          <Text style={styles.overlaySliderValue}>{overlayFontWeight}</Text>
        </View>
        <DotSlider
          value={overlayFontWeight}
          min={400}
          max={900}
          step={100}
          leftLabel="400"
          rightLabel="900"
          onChange={onChangeOverlayFontWeight}
        />
      </View>

      <SectionLabel>Font size</SectionLabel>
      <View style={styles.overlaySlider}>
        <View style={styles.overlaySliderHeader}>
          <Text style={styles.overlaySliderLabel}>Scale</Text>
          <Text style={styles.overlaySliderValue}>
            {Math.round((overlayFontScale || 1) * 100)}%
          </Text>
        </View>
        <DotSlider
          value={overlayFontScale || 1}
          min={0.5}
          max={1.5}
          step={0.05}
          leftLabel="50%"
          rightLabel="150%"
          onChange={onChangeOverlayFontScale}
        />
      </View>

      <SectionLabel>Text color</SectionLabel>
      <RGBSlider
        channel="R"
        value={rgb.r}
        onChange={(value) => setChannel("r", value)}
      />
      <RGBSlider
        channel="G"
        value={rgb.g}
        onChange={(value) => setChannel("g", value)}
      />
      <RGBSlider
        channel="B"
        value={rgb.b}
        onChange={(value) => setChannel("b", value)}
      />
      <View style={styles.tintPreviewRow}>
        <View
          style={[styles.tintPreview, { backgroundColor: overlayTextColor }]}
        />
        <Text style={styles.overlaySliderValue}>{overlayTextColor}</Text>
      </View>

      {/* <HelperText>
        Bubble text uses 85% of the detected bubble area (centred, with a
        readable minimum) and auto-fits the font size. Target language:{" "}
        {targetLanguageLabel}.
        {supported
          ? ""
          : " This target script is not supported by the display fonts, so the system font is used."}
      </HelperText> */}

      {/* <SectionLabel>Translation behaviour</SectionLabel>
      <HelperText>
        Translated pages are cached on-device (source + coordinates + result).
        Re-opening a page that was already translated into the current target
        language restores it instantly without OCR or an API call.
      </HelperText> */}
    </View>
  );
}

function RGBSlider({
  channel,
  value,
  onChange,
}: {
  channel: "R" | "G" | "B";
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.overlaySlider}>
      <View style={styles.overlaySliderHeader}>
        <Text style={styles.overlaySliderLabel}>{channel}</Text>
        <Text style={styles.overlaySliderValue}>{Math.round(value)}</Text>
      </View>
      <DotSlider
        value={value}
        min={0}
        max={255}
        step={5}
        leftLabel="0"
        rightLabel="255"
        onChange={onChange}
      />
    </View>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "72%",
    backgroundColor: READER_PANEL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 60,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3a3c4d",
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: READER_PILL_BORDER,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  bodyContent: { paddingBottom: 40 },

  columnCaption: { color: "#94a3b8", fontSize: 11, marginBottom: 6 },
  languagePicker: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#33354a",
    backgroundColor: "#262838",
    gap: 8,
    marginBottom: 6,
  },
  languageList: { maxHeight: 250 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 10,
  },
  optionRowActive: { backgroundColor: "#262838", borderColor: "#fbbf24" },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { color: "#f1f5f9", fontSize: 13, fontWeight: "600" },
  rowDetail: { color: "#94a3b8", fontSize: 11, marginTop: 1 },

  modeCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#33354a",
    backgroundColor: "#1c1e2b",
    padding: 12,
    marginBottom: 10,
  },
  modeCardActive: { borderColor: "#0ea5e9", backgroundColor: "#16222e" },
  modeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeCardTitle: { color: "#e2e8f0", fontSize: 14, fontWeight: "700" },
  modeCardDescription: {
    color: "#cbd5e1",
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#565b6e",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: "#0ea5e9" },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0ea5e9",
  },

  keyNeededRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#7c3aed",
    backgroundColor: "#211a33",
    padding: 12,
    gap: 10,
  },
  keySavedRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#065f46",
    backgroundColor: "#0d1f19",
    padding: 12,
    gap: 8,
  },
  keySavedText: {
    color: "#6ee7b7",
    fontSize: 12.5,
    fontWeight: "600",
    flex: 1,
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#33354a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#262838",
  },
  smallButtonText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#a78bfa",
    borderRadius: 10,
    paddingVertical: 11,
  },
  primaryButtonText: { color: "#0b1120", fontSize: 14, fontWeight: "800" },
  primaryButtonDisabled: { opacity: 0.45 },

  clearCacheButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#2a1518",
    paddingVertical: 11,
    marginBottom: 10,
  },
  clearCacheText: { color: "#fda4af", fontSize: 13.5, fontWeight: "800" },
  clearCacheSuccess: {
    color: "#6ee7b7",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  confirmRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#2a1518",
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  confirmText: { color: "#fecdd3", fontSize: 13, fontWeight: "600" },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  dangerButton: { borderColor: "#7f1d1d", backgroundColor: "#7f1d1d" },
  dangerButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  sliderValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sliderValueLabel: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },
  sliderValue: { color: "#fbbf24", fontSize: 13, fontWeight: "800" },

  dropdown: {
    marginTop: 14,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#33354a",
    backgroundColor: "#1c1e2b",
    overflow: "hidden",
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownTitleWrap: { flex: 1, minWidth: 0 },
  dropdownTitle: { color: "#e2e8f0", fontSize: 13, fontWeight: "700" },
  dropdownSubtitle: { color: "#94a3b8", fontSize: 11, marginTop: 2 },
  dropdownBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#33354a",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  metricsTable: { marginBottom: 10 },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2a2c3b",
  },
  metricsHeaderRow: { borderTopWidth: 0, paddingTop: 2 },
  metricsLabelCell: { flex: 1, minWidth: 0 },
  metricsNumCell: { width: 62, textAlign: "right" },
  metricsHeaderText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  metricsLabelText: { color: "#cbd5e1", fontSize: 12, fontWeight: "600" },
  metricsNumText: { color: "#38bdf8", fontSize: 12, fontWeight: "800" },

  usageModel: { marginBottom: 6 },
  usageModelLabel: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  usageNote: { color: "#64748b", fontSize: 10.5, lineHeight: 14, marginTop: 4 },

  modelGroup: { gap: 8, marginBottom: 14 },
  modelCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#33354a",
    backgroundColor: "#1c1e2b",
    padding: 12,
    gap: 10,
  },
  modelCardActive: { borderColor: "#34d399", backgroundColor: "#12231c" },
  modelCardLabel: { color: "#f1f5f9", fontSize: 13.5, fontWeight: "700" },

  meterWrap: { marginTop: 4, marginBottom: 8 },
  limitsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  limitChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#33354a",
    backgroundColor: "#1c1e2b",
    paddingVertical: 10,
    alignItems: "center",
    gap: 2,
  },
  limitChipValue: { color: "#38bdf8", fontSize: 15, fontWeight: "800" },
  limitChipLabel: { color: "#94a3b8", fontSize: 10, fontWeight: "700" },
  meterRow: { marginBottom: 12 },
  meterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  meterLabel: { color: "#e2e8f0", fontSize: 12, fontWeight: "700", width: 44 },
  meterValue: { color: "#94a3b8", fontSize: 11 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#262838",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#38bdf8",
  },
  barFillHot: { backgroundColor: "#f87171" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#181a26",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#33354a",
    padding: 18,
    gap: 12,
  },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  keyInput: {
    color: "#e2e8f0",
    backgroundColor: "#10121c",
    borderWidth: 1,
    borderColor: "#33354a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  modalError: { color: "#fda4af", fontSize: 12.5 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 12,
  },
  cancelButton: {
    backgroundColor: "#262838",
    borderWidth: 1,
    borderColor: "#33354a",
  },
  cancelButtonText: { color: "#cbd5e1", fontSize: 14, fontWeight: "700" },
  confirmButton: { backgroundColor: "#38bdf8" },
  confirmButtonText: { color: "#0b1120", fontSize: 14, fontWeight: "800" },

  scaleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 4,
  },
  scaleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#262838",
    borderWidth: 1,
    borderColor: "#33354a",
    alignItems: "center",
    justifyContent: "center",
  },
  scaleValue: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    minWidth: 52,
    textAlign: "center",
  },
  overlayPreviewCard: {
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#33354a",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  toggleTextWrap: { flex: 1, gap: 2 },
  toggleLabel: { color: "#e2e8f0", fontSize: 14, fontWeight: "700" },
  toggleDetail: { color: "#94a3b8", fontSize: 11.5, lineHeight: 16 },
  fontRadioGroup: { gap: 2, marginBottom: 4 },
  fontRadioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
  },
  fontRadioLabel: { color: "#e2e8f0", fontSize: 15 },
  overlaySlider: { marginBottom: 12 },
  overlaySliderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  overlaySliderLabel: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
  },
  overlaySliderValue: { color: "#94a3b8", fontSize: 12 },
  tintPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  tintPreview: {
    width: 30,
    height: 20,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#565b6e",
  },
});
