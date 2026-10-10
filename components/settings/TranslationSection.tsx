/**
 * TranslationSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> Translation: the Gemini key used by AI translation and the
 * cached page translations stored in the database.
 * ---------------------------------------------------------------------------
 */

import { KeyRound, Languages, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { ConfirmDialog, PromptDialog } from "@/components/common/Dialogs";
import { colors } from "@/constants/theme";
import {
  clearTranslationCache,
  countTranslationCachePages,
} from "@/services/db/repositories/translationRepository";
import type { AppSettings } from "@/services/settings/settingsStore";
import { validateGeminiApiKey } from "@/services/translation/geminiTranslator";

import {
  SettingsRow,
  SettingsSection,
  SettingsValue,
} from "./SettingsPrimitives";

function maskKey(key: string): string {
  if (!key) return "Not set";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
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
  const [keyBusy, setKeyBusy] = useState(false);
  const [cachePages, setCachePages] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
          ? `Key rejected: ${error.message}`
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
          : `Removed ${removed} cached page${removed === 1 ? "" : "s"}.`,
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
      subtitle="AI translation credentials and the stored page cache."
      icon={Languages}
      standalone={standalone}
    >
      <SettingsRow
        icon={KeyRound}
        title="Gemini API key"
        subtitle="Used by AI translation for both OCR cleanup and bubbles."
        right={<SettingsValue text={maskKey(settings.geminiApiKey)} accent />}
        onPress={() => setKeyOpen(true)}
      />
      <SettingsRow
        icon={Trash2}
        title="Clear translation cache"
        subtitle={
          cachePages == null
            ? "Removes every cached translated page from the database."
            : `${cachePages} cached page${cachePages === 1 ? "" : "s"} stored right now.`
        }
        right={
          <SettingsValue
            text={clearing ? "Working..." : "Clear"}
            accent
          />
        }
        destructive
        last
        onPress={clearing ? undefined : () => setConfirmClear(true)}
      />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

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
