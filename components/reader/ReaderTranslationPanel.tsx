/**
 * ReaderTranslationPanel.tsx
 * ---------------------------------------------------------------------------
 * Translation options sheet opened from the reader header's sliders icon.
 * Four tabs ("AI settings" is only listed while AI translation mode is on):
 *
 *   Language          - source (OCR) + target language pickers
 *   Translation mode  - off / free / AI descriptions, Gemini API key entry,
 *                       model picker and live RPM / TPM / RPD meters
 *   AI settings       - pages per request, request frequency + max context sliders
 *   Overlay settings  - paste text size + overlay behaviour notes
 *
 * The general reader config (reading / general / filter) stays behind the
 * bottom bar's settings button in ReaderConfigPanel.
 * ---------------------------------------------------------------------------
 */

import {
  Check,
  ChevronDown,
  ChevronUp,
  KeyRound,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";

import type { ReaderTranslateMode } from "@/services/settings/settingsStore";
import {
  GEMINI_MODELS,
  geminiModelInfo,
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
  | "mode"
  | "aiSettings"
  | "overlay";

/** Full tab list; "AI settings" is dropped unless AI mode is selected. */
export const READER_TRANSLATION_TABS: {
  key: ReaderTranslationTab;
  label: string;
}[] = [
  { key: "language", label: "Language" },
  { key: "mode", label: "Translation mode" },
  { key: "aiSettings", label: "AI settings" },
  { key: "overlay", label: "Overlay" },
];

/** Tabs shown for the current translation mode. */
function tabsForMode(
  translateMode: ReaderTranslateMode,
): { key: ReaderTranslationTab; label: string }[] {
  if (translateMode === "ai") return READER_TRANSLATION_TABS;
  return READER_TRANSLATION_TABS.filter((tab) => tab.key !== "aiSettings");
}

const TRANSLATION_MODE_OPTIONS: {
  value: ReaderTranslateMode;
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
    value: "free",
    label: "Free translation",
    description:
      "No API key needed. Each page is scanned and OCRed once, then every speech bubble is translated by the free Google endpoint as it finishes and pasted over the original text.",
  },
  {
    value: "ai",
    label: "AI translation",
    description:
      "Context-aware Gemini translation.  Revisiting an already translated page restores it from the saved cache. Requires a Gemini API key.",
  },
];

function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "\u2022\u2022\u2022\u2022";
  return `\u2022\u2022\u2022\u2022${trimmed.slice(-4)}`;
}

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

  // Translation mode tab.
  translateMode: ReaderTranslateMode;
  onSelectTranslateMode: (mode: ReaderTranslateMode) => void;
  geminiApiKey: string;
  geminiModelId: GeminiModelId;
  onSelectGeminiModel: (id: GeminiModelId) => void;
  /** Validates the key with one Gemini request, then persists it. Throws on failure. */
  onValidateAndSaveKey: (apiKey: string) => Promise<void>;

  // AI settings tab (only reachable while translateMode === "ai").
  /** Number of pages in the current chapter (drives request estimates). */
  pageCount: number;
  /** Fresh pages of OCR to wait for before one Gemini request (1-10). */
  aiRequestPageInterval: number;
  /** Maximum Gemini requests allowed in flight at once (1-5). */
  aiRequestFrequency: number;
  /** Past pages of OCR history attached to each request (0-50). */
  aiMaxContextPages: number;
  onChangeRequestInterval: (pages: number) => void;
  onChangeRequestFrequency: (frequency: number) => void;
  onChangeMaxContextPages: (pages: number) => void;

  // Overlay tab.
  overlayFont: ReaderOverlayFont;
  onChangeOverlayFont: (font: ReaderOverlayFont) => void;
  overlayFontWeight: number;
  onChangeOverlayFontWeight: (weight: number) => void;
  overlayFontScale: number;
  onChangeOverlayFontScale: (scale: number) => void;
  overlayTextColor: string;
  onChangeOverlayTextColor: (color: string) => void;
  targetLanguageLabel: string;
}

export default function ReaderTranslationPanel(
  props: ReaderTranslationPanelProps,
) {
  const { tab, onTabChange, onClose, translateMode } = props;

  // "AI settings" only exists while AI translation mode is selected. When the
  // mode is switched away while that tab is open, fall back to the mode tab.
  const activeTab =
    translateMode !== "ai" && tab === "aiSettings" ? "mode" : tab;
  useEffect(() => {
    if (translateMode !== "ai" && tab === "aiSettings") {
      onTabChange("mode");
    }
  }, [translateMode, tab, onTabChange]);
  const tabs = tabsForMode(translateMode);
  return (
    <View style={styles.panel}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <TabBar tabs={tabs} active={activeTab} onChange={onTabChange} />
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <X color="#fff" size={20} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "language" && <LanguageTab {...props} />}
        {activeTab === "mode" && <ModeTab {...props} />}
        {activeTab === "aiSettings" && <AiSettingsTab {...props} />}
        {activeTab === "overlay" && <OverlayTab {...props} />}
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
    translateMode,
    onSelectTranslateMode,
    geminiApiKey,
    geminiModelId,
    onSelectGeminiModel,
    onValidateAndSaveKey,
  } = props;
  const [keyModalOpen, setKeyModalOpen] = useState(false);

  return (
    <View>
      <SectionLabel>Translation mode</SectionLabel>
      {TRANSLATION_MODE_OPTIONS.map((option) => {
        const active = translateMode === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelectTranslateMode(option.value)}
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

      {translateMode === "ai" && (
        <>
          <SectionLabel>Gemini API key</SectionLabel>
          {geminiApiKey.trim() ? (
            <View style={styles.keySavedRow}>
              <KeyRound color="#34d399" size={18} />
              <Text style={styles.keySavedText}>
                API key saved ({maskKey(geminiApiKey)})
              </Text>
              <Pressable
                onPress={() => setKeyModalOpen(true)}
                style={styles.smallButton}
              >
                <Text style={styles.smallButtonText}>Replace</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.keyNeededRow}>
              <Text style={styles.rowDetail}>
                AI translation needs a Gemini API key (free at Google AI
                Studio). The key is validated with one request before it is
                saved.
              </Text>
              <Pressable
                onPress={() => setKeyModalOpen(true)}
                style={styles.primaryButton}
              >
                <KeyRound color="#0b1120" size={16} />
                <Text style={styles.primaryButtonText}>Set API key</Text>
              </Pressable>
            </View>
          )}

          <SectionLabel>AI model</SectionLabel>
          <View style={styles.modelGroup}>
            {GEMINI_MODELS.map((model) => {
              const active = geminiModelId === model.id;
              return (
                <Pressable
                  key={model.id}
                  onPress={() => onSelectGeminiModel(model.id)}
                  style={[styles.modelCard, active && styles.modelCardActive]}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.modelCardLabel}>{model.label}</Text>
                    <Text style={styles.rowDetail}>
                      {model.rpm} RPM · {model.tpm.toLocaleString()} TPM ·{" "}
                      {model.rpd} RPD
                    </Text>
                  </View>
                  {active && <Check size={18} color="#34d399" />}
                </Pressable>
              );
            })}
          </View>

          <UsageMeters model={geminiModelId} />
        </>
      )}

      <ApiKeyModal
        visible={keyModalOpen}
        currentKey={geminiApiKey}
        onCancel={() => setKeyModalOpen(false)}
        onSave={async (key) => {
          await onValidateAndSaveKey(key);
          setKeyModalOpen(false);
        }}
      />
    </View>
  );
}

/** Live RPM / TPM / RPD meters for the selected model (used / limit). */
function UsageMeters({ model }: { model: GeminiModelId }) {
  const [usage, setUsage] = useState<GeminiUsageSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      getGeminiUsageSnapshot(model)
        .then((snapshot) => {
          if (active) setUsage(snapshot);
        })
        .catch(() => {});
    };
    refresh();
    const unsubscribe = subscribeGeminiUsage(refresh);
    const timer = setInterval(refresh, 1500);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [model]);

  if (!usage) {
    return (
      <View style={styles.meterWrap}>
        <ActivityIndicator color="#fbbf24" size="small" />
      </View>
    );
  }

  const meters: {
    label: string;
    used: number;
    limit: number;
    suffix: string;
  }[] = [
    {
      label: "RPM",
      used: usage.rpmUsed,
      limit: usage.rpmLimit,
      suffix: "requests / min",
    },
    {
      label: "TPM",
      used: usage.tpmUsed,
      limit: usage.tpmLimit,
      suffix: "input tokens / min",
    },
    {
      label: "RPD",
      used: usage.rpdUsed,
      limit: usage.rpdLimit,
      suffix: "requests / day (resets midnight Pacific)",
    },
  ];

  return (
    <View style={styles.meterWrap}>
      <SectionLabel>Your usage - {usage.label}</SectionLabel>
      {meters.map((meter) => {
        const pct = Math.min(
          100,
          (meter.used / Math.max(meter.limit, 1)) * 100,
        );
        const over = meter.used >= meter.limit;
        return (
          <View key={meter.label} style={styles.meterRow}>
            <View style={styles.meterHeader}>
              <Text style={styles.meterLabel}>{meter.label}</Text>
              <Text style={[styles.meterValue, over && { color: "#fda4af" }]}>
                {meter.used.toLocaleString()} / {meter.limit.toLocaleString()}{" "}
                {meter.suffix}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${pct}%` },
                  over && { backgroundColor: "#f87171" },
                ]}
              />
            </View>
          </View>
        );
      })}
      <HelperText>
        Usage reflects Gemini requests made from this app; the Google AI Studio
        dashboard may show different numbers.
      </HelperText>
    </View>
  );
}


function ApiKeyModal(props: {
  visible: boolean;
  currentKey: string;
  onCancel: () => void;
  onSave: (key: string) => Promise<void>;
}) {
  const { visible, currentKey, onCancel, onSave } = props;
  const [key, setKey] = useState(currentKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setKey(currentKey);
      setError(null);
      setSaving(false);
    }
  }, [visible, currentKey]);

  const confirm = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Enter your Gemini API key.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the key.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Gemini API key</Text>
          <Text style={styles.rowDetail}>
            Paste your key from Google AI Studio. We send one test request to
            check that it works before saving.
          </Text>
          <TextInput
            style={styles.keyInput}
            value={key}
            onChangeText={setKey}
            placeholder="AIza..."
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
          />
          {error ? <Text style={styles.modalError}>{error}</Text> : null}
          <View style={styles.modalActions}>
            <Pressable
              onPress={onCancel}
              disabled={saving}
              style={[styles.modalButton, styles.cancelButton]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              disabled={saving}
              style={[
                styles.modalButton,
                styles.confirmButton,
                saving && { opacity: 0.6 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#0b1120" size="small" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}


function AiSettingsTab(props: ReaderTranslationPanelProps) {
  const {
    pageCount,
    aiRequestPageInterval,
    aiRequestFrequency,
    aiMaxContextPages,
    onChangeRequestInterval,
    onChangeRequestFrequency,
    onChangeMaxContextPages,
    geminiModelId,
  } = props;
  const info = geminiModelInfo(geminiModelId);
  const pagesPerRequest = Math.min(
    10,
    Math.max(1, Math.round(aiRequestPageInterval)),
  );
  const requestFrequency = Math.min(
    5,
    Math.max(1, Math.round(aiRequestFrequency)),
  );
  const maxContext = Math.min(50, Math.max(0, Math.round(aiMaxContextPages)));
  const requests =
    pageCount > 0 ? Math.max(1, Math.ceil(pageCount / pagesPerRequest)) : null;

  return (
    <View>
      <SectionLabel>Pages per request</SectionLabel>
      <DotSlider
        value={pagesPerRequest}
        min={1}
        max={10}
        step={1}
        dotCount={10}
        leftLabel="1 page per request"
        rightLabel="10 pages per request"
        onChange={onChangeRequestInterval}
      />
      {/* <HelperText>
        Send this many freshly OCRed pages in each Gemini request - higher means
        fewer, bigger requests.{" "}
        {requests !== null
          ? "\u2248 " +
            requests +
            " requests for this " +
            pageCount +
            "-page chapter; a trailing partial batch still flushes once the scanned area is done."
          : "Request estimates appear once the chapter loads."}
      </HelperText> */}

      <SectionLabel>Request frequency</SectionLabel>
      <DotSlider
        value={requestFrequency}
        min={1}
        max={5}
        step={1}
        dotCount={5}
        leftLabel="1 request at a time"
        rightLabel="5 requests at a time"
        onChange={onChangeRequestFrequency}
      />
      <HelperText>
        Maximum number of Gemini requests that can process batches concurrently.
      </HelperText>

      <SectionLabel>Max context</SectionLabel>
      <DotSlider
        value={maxContext}
        min={0}
        max={50}
        step={1}
        dotCount={50}
        leftLabel="No history"
        rightLabel="50 pages"
        onChange={onChangeMaxContextPages}
      />
      {/* <HelperText>
        {maxContext === 0
          ? "No history is attached - each request only sees its own batch."
          : "Sends the last " +
            maxContext +
            " OCRed page" +
            (maxContext === 1 ? "" : "s") +
            " of the manga, with their page numbers, so the model follows the story. History is RAM-only and never translated."}
      </HelperText> */}

      <SectionLabel>Model limits - {info.label}</SectionLabel>
      <View style={styles.limitsRow}>
        <View style={styles.limitChip}>
          <Text style={styles.limitChipValue}>{info.rpm}</Text>
          <Text style={styles.limitChipLabel}>RPM</Text>
        </View>
        <View style={styles.limitChip}>
          <Text style={styles.limitChipValue}>
            {(info.tpm / 1000).toFixed(0)}K
          </Text>
          <Text style={styles.limitChipLabel}>TPM</Text>
        </View>
        <View style={styles.limitChip}>
          <Text style={styles.limitChipValue}>{info.rpd}</Text>
          <Text style={styles.limitChipLabel}>RPD</Text>
        </View>
      </View>
      <HelperText>
        Free-tier caps as shown in Google AI Studio. RPD resets at midnight
        Pacific; RPM is also enforced in-app before every request.
      </HelperText>
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
    targetLanguage,
    targetLanguageLabel,
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
        <View style={[styles.tintPreview, { backgroundColor: overlayTextColor }]} />
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
