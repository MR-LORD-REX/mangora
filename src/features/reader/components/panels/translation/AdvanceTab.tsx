/* Look-ahead, Gemini model and TR-cache controls. */

import { ChevronDown, Trash2 } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";

import MenuSheet from "@shared/ui/overlays/MenuSheet";
import { GEMINI_MODELS } from "@features/translation";
import DotSlider from "../DotSlider";
import { HelperText, SectionLabel } from "../ReaderPanelPrimitives";
import { styles } from "./styles";
import type { ReaderTranslationPanelProps } from "./types";

export default function AdvanceTab(props: ReaderTranslationPanelProps) {
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
