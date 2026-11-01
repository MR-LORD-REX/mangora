/* Look-ahead, region model, translation model and TR-cache controls. */

import { Check, ChevronDown, Download, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";

import MenuSheet from "@shared/ui/overlays/MenuSheet";
import type { RegionDetectorId } from "@features/translation";
import {
  getRegionDetector,
  isRegionModelDownloaded,
  REGION_DETECTORS,
} from "@features/vision";
import DotSlider from "../DotSlider";
import { HelperText, SectionLabel } from "../ReaderPanelPrimitives";
import { styles } from "./styles";
import type { ReaderTranslationPanelProps } from "./types";

export default function AdvanceTab(props: ReaderTranslationPanelProps) {
  const {
    translationEngine,
    translationMode,
    translationModelId,
    onSelectTranslationModel,
    aiProvider,
    onOpenTranslationSettings,
    regionDetectorId,
    onSelectRegionDetector,
    autoModelSwitch,
    onChangeAutoModelSwitch,
    ocrLookahead,
    onChangeLookahead,
    onOpenModelsSettings,
    onClearTrCache,
  } = props;
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [detectorMenuOpen, setDetectorMenuOpen] = useState(false);
  const [detectorReady, setDetectorReady] = useState<
    Partial<Record<RegionDetectorId, boolean>>
  >({});
  const [detectorNotice, setDetectorNotice] = useState<string | null>(null);
  const [clearState, setClearState] = useState<
    "idle" | "confirm" | "clearing" | "done"
  >("idle");
  const [clearedPages, setClearedPages] = useState(0);
  const [clearError, setClearError] = useState<string | null>(null);

  const selectedDetector = getRegionDetector(regionDetectorId);
  const availableModels = aiProvider?.models ?? [];
  const selectedModel = translationModelId || aiProvider?.model || "";

  useEffect(() => {
    let active = true;
    void Promise.all(
      REGION_DETECTORS.map(async (detector) => {
        const downloaded = await isRegionModelDownloaded(detector.id).catch(
          () => false,
        );
        return [detector.id, downloaded] as const;
      }),
    ).then((entries) => {
      if (active) setDetectorReady(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [detectorMenuOpen]);

  const chooseDetector = async (id: RegionDetectorId) => {
    setDetectorNotice(null);
    const downloaded = await isRegionModelDownloaded(id).catch(() => false);
    setDetectorReady((current) => ({ ...current, [id]: downloaded }));
    if (!downloaded) {
      setDetectorNotice(
        getRegionDetector(id).label +
          " is not downloaded yet. Open Settings > Models to download it, then select it here.",
      );
      return;
    }
    onSelectRegionDetector(id);
  };

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

          <SectionLabel>Region detection model</SectionLabel>
          <Pressable
            style={styles.dropdown}
            onPress={() => setDetectorMenuOpen(true)}
          >
            <View style={styles.dropdownHeader}>
              <View style={styles.dropdownTitleWrap}>
                <Text style={styles.dropdownTitle}>{selectedDetector.label}</Text>
                <Text style={styles.dropdownSubtitle}>
                  {selectedDetector.speedProfile === "fast"
                    ? "Fast"
                    : selectedDetector.speedProfile === "quality"
                      ? "Quality boxes"
                      : "Bubble masks"}
                  {" · "}
                  {selectedDetector.detail}
                </Text>
              </View>
              <ChevronDown size={18} color="#94a3b8" />
            </View>
          </Pressable>
          <MenuSheet
            visible={detectorMenuOpen}
            title="Region detection model"
            onClose={() => setDetectorMenuOpen(false)}
            options={REGION_DETECTORS.map((detector) => {
              const ready = detectorReady[detector.id];
              return {
                key: detector.id,
                label:
                  detector.label +
                  (ready === false ? " - download needed" : ""),
                icon: ready === false ? Download : ready ? Check : undefined,
                selected: detector.id === regionDetectorId,
                onPress: () => void chooseDetector(detector.id),
              };
            })}
          />
          {detectorNotice ? (
            <View style={styles.detectorNotice}>
              <Text style={styles.modalError}>{detectorNotice}</Text>
              <Pressable
                onPress={onOpenModelsSettings}
                style={styles.detectorSettingsButton}
              >
                <Text style={styles.detectorSettingsText}>{"Go to Settings > Models"}</Text>
              </Pressable>
            </View>
          ) : null}
          <HelperText>
            One detector scans each page. Bubble masks are available only with a
            segmentation detector.
          </HelperText>
        </>
      ) : (
        <HelperText>
          Turn translation on in the Modes tab to configure look ahead.
        </HelperText>
      )}

      {translationEngine === "openai" ? (
        <>
          <SectionLabel>Translation model</SectionLabel>
          {availableModels.length > 0 ? (
            <Pressable
              style={styles.dropdown}
              onPress={() => setModelMenuOpen(true)}
            >
              <View style={styles.dropdownHeader}>
                <View style={styles.dropdownTitleWrap}>
                  <Text style={styles.dropdownTitle}>
                    {selectedModel || "Choose a model"}
                  </Text>
                  <Text style={styles.dropdownSubtitle}>
                    Available from {aiProvider?.endpointKey}
                  </Text>
                </View>
                <ChevronDown size={18} color="#94a3b8" />
              </View>
            </Pressable>
          ) : (
            <View style={styles.dropdown}>
              <View style={styles.dropdownHeader}>
                <View style={styles.dropdownTitleWrap}>
                  <Text style={styles.dropdownTitle}>
                    {aiProvider?.model || "Endpoint not configured"}
                  </Text>
                  <Text style={styles.dropdownSubtitle}>
                    Add a model in Settings &gt; Translation
                  </Text>
                </View>
              </View>
            </View>
          )}
          <MenuSheet
            visible={modelMenuOpen}
            title="Translation model"
            onClose={() => setModelMenuOpen(false)}
            options={availableModels.map((model) => ({
              key: model,
              label: model,
              selected: model === selectedModel,
              onPress: () => onSelectTranslationModel(model),
            }))}
          />
          <Pressable
            onPress={onOpenTranslationSettings}
            style={styles.detectorSettingsButton}
          >
            <Text style={styles.detectorSettingsText}>
              Go to Settings &gt; Translation
            </Text>
          </Pressable>

          <SectionLabel>Auto model switch</SectionLabel>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>Switch on rate limits</Text>
              <Text style={styles.toggleDetail}>
                When the endpoint reports a rate limit, retry with the next
                configured model. Two failed switches turn this off until you
                enable it again.
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
