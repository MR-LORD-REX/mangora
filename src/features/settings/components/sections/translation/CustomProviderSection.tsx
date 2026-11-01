/**
 * Settings -> Translation -> OpenAI-compatible endpoint.
 *
 * Gemini is the zero-config default endpoint, not a second transport. This
 * block owns the base URL, API key, model catalogue, selected model, endpoint
 * test and reset action for every OpenAI-compatible provider.
 */

import {
  CheckCircle2,
  Cpu,
  KeyRound,
  Plus,
  Server,
  Trash2,
  Wifi,
} from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ConfirmDialog,
  MenuSheet,
  PromptDialog,
} from "@shared/ui/overlays";
import { colors } from "@shared/theme";
import type { AppSettings } from "@core/settings";
import {
  DEFAULT_TRANSLATION_BASE_URL,
  DEFAULT_TRANSLATION_MODELS,
  normalizeTranslationBaseUrl,
  validateOpenAiCompatibleEndpoint,
} from "@features/translation";

import {
  ActionPill,
  SettingsRow,
  SettingsValue,
} from "../../primitives/SettingsPrimitives";

function maskKey(key: string): string {
  if (!key) return "Not set";
  if (key.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return key.slice(0, 4) + "\u2022\u2022\u2022\u2022" + key.slice(-4);
}

function uniqueModels(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const model = value.trim();
    if (!model || seen.has(model)) return false;
    seen.add(model);
    return true;
  });
}

export default function CustomProviderSection({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  const [urlOpen, setUrlOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const models = uniqueModels(settings.translationModels);
  const selectedModel = models.includes(settings.translationModelId)
    ? settings.translationModelId
    : models[0] ?? "";
  const endpointIsDefault =
    normalizeTranslationBaseUrl(settings.translationBaseUrl) ===
    DEFAULT_TRANSLATION_BASE_URL;
  const httpWarning = settings.translationBaseUrl
    .trim()
    .toLowerCase()
    .startsWith("http://");

  const openActiveModelMenu = () => {
    if (models.length === 0) {
      setModelOpen(true);
      return;
    }
    setModelMenuOpen(true);
  };

  const clearModels = () => {
    onChange({
      translationModels: [...DEFAULT_TRANSLATION_MODELS],
      translationModelId: DEFAULT_TRANSLATION_MODELS[0],
    });
    setNotice("Model names cleared. Gemini defaults are available again.");
  };

  const applyUrl = (value: string) => {
    const normalized = normalizeTranslationBaseUrl(value);
    if (!normalized) {
      setNotice("Enter a base URL, for example http://192.168.1.20:8080/v1.");
      return;
    }
    const changed =
      normalizeTranslationBaseUrl(normalized) !==
      normalizeTranslationBaseUrl(settings.translationBaseUrl);
    setUrlOpen(false);
    if (changed && models.length > 0) {
      setPendingUrl(normalized);
      return;
    }
    onChange({ translationBaseUrl: normalized });
    setNotice("Endpoint saved. Run the connection test before translating.");
  };

  const addModel = (value: string) => {
    const model = value.trim();
    if (!model) return;
    if (models.includes(model)) {
      setNotice("That model name is already in the list.");
      return;
    }
    onChange({
      translationModels: [...models, model],
      translationModelId: model,
    });
    setModelOpen(false);
    setNotice("Model added. Test the endpoint to verify it is available.");
  };

  const removeModel = (model: string) => {
    const next = models.filter((item) => item !== model);
    onChange({
      translationModels: next,
      translationModelId:
        settings.translationModelId === model
          ? next[0] ?? ""
          : settings.translationModelId,
    });
    setNotice("Model removed from this endpoint.");
  };

  const testConnection = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await validateOpenAiCompatibleEndpoint({
        baseUrl: settings.translationBaseUrl,
        apiKey: settings.translationApiKey,
        model: selectedModel,
      });
      setNotice("Connection successful. The endpoint answered with the selected model.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? "Connection test failed: " + error.message
          : "Connection test failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Server color={colors.accent} size={16} />
        <Text style={styles.headingText}>OpenAI-compatible endpoint</Text>
      </View>
      <Text style={styles.intro}>
        Used by AI Translation
      </Text>
      {httpWarning ? (
        <Text style={styles.warning}>
          This endpoint uses HTTP. Keep it on a trusted local network because the
          API key and page text are not encrypted in transit.
        </Text>
      ) : null}

      <SettingsRow
        icon={Server}
        title="Base URL"
        subtitle="Include the API prefix, for example http://192.168.1.20:8080/v1."
        right={
          <SettingsValue
            text={endpointIsDefault ? "Gemini default" : settings.translationBaseUrl}
            accent
          />
        }
        onPress={() => setUrlOpen(true)}
      />
      <SettingsRow
        icon={KeyRound}
        title="API key"
        subtitle="Sent as a Bearer token. Localhost and private-LAN endpoints may leave it empty."
        right={<SettingsValue text={maskKey(settings.translationApiKey)} accent />}
        onPress={() => setKeyOpen(true)}
      />
      <SettingsRow
        icon={Cpu}
        title="Active model"
        subtitle="Currently active model"
        right={<SettingsValue text={selectedModel || "Not set"} accent />}
        onPress={openActiveModelMenu}
      />

      <View style={styles.modelHeader}>
        <Text style={styles.modelHeaderText}>Models</Text>
        <ActionPill label="Add model" icon={Plus} onPress={() => setModelOpen(true)} />
      </View>
      {models.length === 0 ? (
        <Text style={styles.notice}>No models configured. Add at least one model name.</Text>
      ) : null}
      {models.map((model) => (
        <View key={model} style={styles.modelRow}>
          <Pressable
            style={styles.modelInfo}
            onPress={() => onChange({ translationModelId: model })}
          >
            {model === selectedModel ? (
              <CheckCircle2 color={colors.success} size={18} />
            ) : (
              <View style={styles.modelDot} />
            )}
            <View style={styles.modelCopy}>
              <Text style={styles.modelName}>{model}</Text>
              <Text style={styles.modelHint}>
                {model === selectedModel ? "Active model" : "Tap to make active"}
              </Text>
            </View>
          </Pressable>
          <View style={styles.modelActions}>
            {model === selectedModel ? null : (
              <ActionPill
                label="Use"
                onPress={() => onChange({ translationModelId: model })}
              />
            )}
            <ActionPill
              label="Remove"
              icon={Trash2}
              destructive
              onPress={() => removeModel(model)}
            />
          </View>
        </View>
      ))}
      <View style={styles.actions}>
        <ActionPill
          label={busy ? "Testing..." : "Test connection"}
          icon={Wifi}
          busy={busy}
          disabled={!models.length}
          onPress={() => void testConnection()}
        />
        <ActionPill
          label="Reset Gemini defaults"
          onPress={() => {
            onChange({
              translationBaseUrl: DEFAULT_TRANSLATION_BASE_URL,
              translationModels: [...DEFAULT_TRANSLATION_MODELS],
              translationModelId: DEFAULT_TRANSLATION_MODELS[0],
            });
            setNotice(
              "Gemini base URL and default model names restored. The API key is unchanged.",
            );
          }}
        />
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <MenuSheet
        visible={modelMenuOpen}
        title="Active translation model"
        onClose={() => setModelMenuOpen(false)}
        options={models.map((model) => ({
          key: model,
          label: model,
          selected: model === selectedModel,
          onPress: () => onChange({ translationModelId: model }),
        }))}
      />
      <PromptDialog
        visible={urlOpen}
        title="Endpoint base URL"
        message="Use the prefix before /chat/completions. Gemini's default is already filled in."
        placeholder="http://192.168.1.20:8080/v1"
        initialValue={settings.translationBaseUrl}
        keyboardType="url"
        confirmLabel="Save"
        onCancel={() => setUrlOpen(false)}
        onSubmit={applyUrl}
      />
      <PromptDialog
        visible={keyOpen}
        title="API key"
        message="Stored in the app settings JSON for this release. Use a key scoped to this endpoint."
        placeholder="sk-..."
        initialValue={settings.translationApiKey}
        secure
        confirmLabel="Save"
        onCancel={() => setKeyOpen(false)}
        onSubmit={(value) => {
          onChange({ translationApiKey: value });
          setKeyOpen(false);
          setNotice(value ? "API key saved." : "API key cleared.");
        }}
      />
      <PromptDialog
        visible={modelOpen}
        title="Add model name"
        message="Use the exact model id advertised by the endpoint."
        placeholder="qwen2.5-7b-instruct"
        onCancel={() => setModelOpen(false)}
        onSubmit={addModel}
      />
      <ConfirmDialog
        visible={pendingUrl != null}
        title="Keep model names?"
        message="The base URL changed. Keep the current model names for the new endpoint, or clear them and return to the Gemini defaults."
        confirmLabel="Keep names"
        cancelLabel="Clear names"
        onCancel={() => {
          if (pendingUrl) onChange({ translationBaseUrl: pendingUrl });
          clearModels();
          setPendingUrl(null);
        }}
        onConfirm={() => {
          if (pendingUrl) onChange({ translationBaseUrl: pendingUrl });
          setPendingUrl(null);
          setNotice("Endpoint changed. Existing model names were kept.");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 4 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  headingText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  intro: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6,
  },
  warning: {
    color: colors.gold,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  modelHeaderText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  modelInfo: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  modelDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelCopy: { flex: 1, minWidth: 0 },
  modelName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  modelHint: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  modelActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  notice: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
