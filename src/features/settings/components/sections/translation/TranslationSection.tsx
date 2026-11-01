/**
 * Settings -> Translation: one OpenAI-compatible provider configuration,
 * context/batch limits, auto model fallback and the translated-page cache.
 */

import {
  BookOpen,
  Languages,
  Layers,
  Repeat,
  Trash2,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { ConfirmDialog } from "@shared/ui/overlays";
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
  SettingsRow,
  SettingsSection,
  SettingsValue,
  SliderRow,
  ToggleRow,
} from "../../primitives/SettingsPrimitives";
import CustomProviderSection from "./CustomProviderSection";

export default function TranslationSection({
  settings,
  onChange,
  standalone,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  standalone?: boolean;
}) {
  const [cachePages, setCachePages] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      subtitle="Endpoint, models, batch limits and the stored page cache."
      icon={Languages}
      standalone={standalone}
    >
      <CustomProviderSection settings={settings} onChange={onChange} />
      <ToggleRow
        icon={Repeat}
        title="Auto model switch"
        subtitle="On a rate limit, retry with the next configured model. Two failed switches turn this off until you enable it again."
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
