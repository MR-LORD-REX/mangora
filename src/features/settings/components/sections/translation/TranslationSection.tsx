/**
 * TranslationSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> Translation: engine-agnostic batch/context limits, Gemini model
 * selection and credentials, and the cached page translations.
 * ---------------------------------------------------------------------------
 */

import {
  BookOpen,
  Cpu,
  KeyRound,
  Languages,
  Layers,
  Repeat,
  Trash2,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import MenuSheet from "@shared/ui/overlays/MenuSheet";
import { ConfirmDialog, PromptDialog } from "@shared/ui/overlays";
import { colors } from "@shared/theme";
import {
  clearTranslationCache,
  countTranslationCachePages,
} from "@core/db/repositories/translationRepository";
import {
  maxOcrBubbleWorkers,
  modelIdForLanguage,
} from "@features/vision";
import type { AppSettings } from "@core/settings";
import {
  GEMINI_MODELS,
  type GeminiModelId,
} from "@features/translation";
import { validateGeminiApiKey } from "@features/translation";

import {
  SettingsRow,
  SettingsSection,
  SettingsValue,
  SliderRow,
  ToggleRow,
} from "../../primitives/SettingsPrimitives";

function maskKey(key: string): string {
  if (!key) return "Not set";
  if (key.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return key.slice(0, 4) + "\u2022\u2022\u2022\u2022" + key.slice(-4);
}

export default function TranslationSection({
  settings,
  onChange,
  standalone,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  standalone?: boolean;
}) {
  const [keyOpen, setKeyOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [cachePages, setCachePages] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedModel =
    GEMINI_MODELS.find((model) => model.id === settings.geminiModelId) ??
    GEMINI_MODELS[0];
  const ocrModelId = modelIdForLanguage(settings.readerLanguage || "ja");
  const maxBatch = maxOcrBubbleWorkers(ocrModelId);
  const batchValue = Math.min(maxBatch, Math.max(1, settings.ocrBubbleWorkers));

  const refreshCache = useCallback(() => {
    void countTranslationCachePages()
      .then(setCachePages)
      .catch(() => setCachePages(null));
  }, []);

  useEffect(() => {
    refreshCache();
  }, [refreshCache]);

  const onSaveKey = async (value: string) => {
    setKeyBusy(true);
    try {
      if (value) await validateGeminiApiKey(value, settings.geminiModelId);
      onChange({ geminiApiKey: value });
      setNotice(
        value
          ? "Gemini key validated and saved."
          : "Gemini key cleared. AI translation will stay off until a key is saved.",
      );
      setKeyOpen(false);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? "Key rejected: " + error.message
          : "The key could not be validated.",
      );
    } finally {
      setKeyBusy(false);
    }
  };

  const onClearCache = async () => {
    setConfirmClear(false);
    setClearing(true);
    try {
      const removed = await clearTranslationCache();
      setNotice(
        removed === 0
          ? "The translation cache was already empty."
          : "Removed " + removed + " cached page" + (removed === 1 ? "" : "s") + ".",
      );
      refreshCache();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not clear the cache.",
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <SettingsSection
      title="Translation"
      subtitle="Models, batch limits and the stored page cache."
      icon={Languages}
      standalone={standalone}
    >
      <SettingsRow
        icon={KeyRound}
        title="Gemini API key"
        subtitle="Used by AI translation. Free translation needs no key."
        right={<SettingsValue text={maskKey(settings.geminiApiKey)} accent />}
        onPress={() => setKeyOpen(true)}
      />
      <SettingsRow
        icon={Cpu}
        title="Translation model"
        subtitle="Primary Gemini model for AI translation."
        right={<SettingsValue text={selectedModel.label} accent />}
        onPress={() => setModelOpen(true)}
      />
      <ToggleRow
        icon={Repeat}
        title="Auto model switch"
        subtitle="On a rate limit, retry with the other model. Two failed switches turn this off until you enable it again."
        value={settings.readerAutoModelSwitch}
        onChange={(value) => onChange({ readerAutoModelSwitch: value })}
      />
      <SliderRow
        icon={BookOpen}
        title="Max context pages"
        subtitle="Already-translated pages sent as context to keep tone and names consistent."
        value={settings.aiMaxContextPages}
        min={1}
        max={50}
        onChange={(value) => onChange({ aiMaxContextPages: value })}
      />
      <SliderRow
        icon={Layers}
        title="Batch size"
        subtitle={
          "Detected text lines grouped into one OCR forward pass. " +
          maxBatch +
          " is the maximum for the selected language model."
        }
        value={batchValue}
        min={1}
        max={maxBatch}
        onChange={(value) => onChange({ ocrBubbleWorkers: value })}
      />
      <SettingsRow
        icon={Trash2}
        title="Clear translation cache"
        subtitle={
          cachePages == null
            ? "Removes every cached translated page from the database."
            : cachePages +
              " cached page" +
              (cachePages === 1 ? "" : "s") +
              " stored right now."
        }
        right={
          <SettingsValue text={clearing ? "Working..." : "Clear"} accent />
        }
        destructive
        last
        onPress={clearing ? undefined : () => setConfirmClear(true)}
      />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <MenuSheet
        visible={modelOpen}
        title="Translation model"
        onClose={() => setModelOpen(false)}
        options={GEMINI_MODELS.map((model) => ({
          key: model.id,
          label: model.label,
          selected: model.id === settings.geminiModelId,
          onPress: () => onChange({ geminiModelId: model.id as GeminiModelId }),
        }))}
      />
      <PromptDialog
        visible={keyOpen}
        title="Gemini API key"
        message="Stored on this device only. Leave empty to disable AI translation."
        placeholder="AIza..."
        initialValue={settings.geminiApiKey}
        confirmLabel="Save"
        secure
        busy={keyBusy}
        onCancel={() => setKeyOpen(false)}
        onSubmit={(value) => void onSaveKey(value)}
      />
      <ConfirmDialog
        visible={confirmClear}
        title="Clear translation cache?"
        message="Translated pages are removed from the database. Reading a page again will re-translate it."
        confirmLabel="Clear cache"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void onClearCache()}
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  notice: {
    color: colors.textFaint,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    lineHeight: 17,
  },
});
