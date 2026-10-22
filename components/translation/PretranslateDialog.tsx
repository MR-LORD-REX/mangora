/**
 * PretranslateDialog.tsx
 * ---------------------------------------------------------------------------
 * Chapter-row pre-translate flow:
 *   not downloaded -> offer to download first
 *   downloaded     -> explain the feature, expose translation settings, and
 *                     enqueue a snapshot of those settings.
 * ---------------------------------------------------------------------------
 */

import { Languages, Settings, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { READER_LANGUAGE_OPTIONS } from "@/components/reader/readerLanguages";
import { colors, radius } from "@/constants/theme";
import {
  openDownloadedPageSessionForChapter,
  type DownloadedPageSession,
  type DownloadCandidate,
} from "@/services/downloader";
import {
  getSettings,
  updateSettings,
  type ReaderTranslationEngine,
} from "@/services/settings/settingsStore";
import {
  READER_TARGET_OPTIONS,
  isSameEngineLanguage,
} from "@/services/translation/translationLang";
import { enqueuePretranslateJob } from "@/services/translation/pretranslateQueue";

export interface PretranslateDialogProps {
  visible: boolean;
  candidate: DownloadCandidate | null;
  mangaTitle: string;
  chapterLanguage: string | null;
  onClose: () => void;
  onDownload: (candidate: DownloadCandidate) => void;
}

export default function PretranslateDialog({
  visible,
  candidate,
  mangaTitle,
  chapterLanguage,
  onClose,
  onDownload,
}: PretranslateDialogProps) {
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [engine, setEngine] = useState<ReaderTranslationEngine>("free");
  const [source, setSource] = useState("ja");
  const [target, setTarget] = useState("en");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pageSessionRef = useRef<DownloadedPageSession | null>(null);
  const sessionTransferredRef = useRef(false);

  useEffect(() => {
    if (!visible || !candidate) return;
    let cancelled = false;
    sessionTransferredRef.current = false;
    setLoading(true);
    setPages([]);
    setNotice(null);
    setShowSettings(false);
    const pageSessionPromise = openDownloadedPageSessionForChapter(
      candidate.target.chapterId,
    ).then((session) => {
      if (cancelled) {
        void session.cleanup();
      } else {
        pageSessionRef.current = session;
      }
      return session;
    });
    Promise.all([pageSessionPromise, getSettings()])
      .then(([session, settings]) => {
        if (cancelled) {
          void session.cleanup();
          return;
        }
        setPages(session.pages);
        setEngine(settings.readerTranslationEngine);
        setSource(settings.readerLanguage || chapterLanguage || "ja");
        setTarget(settings.readerTargetLanguage || "en");
        console.log("[pretranslate] dialog opened", {
          chapterId: candidate.target.chapterId,
          pages: session.pages.length,
        });
      })
      .catch((error) => {
        const session = pageSessionRef.current;
        pageSessionRef.current = null;
        if (session && !sessionTransferredRef.current) {
          void session.cleanup();
        }
        if (!cancelled) setNotice(String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      const session = pageSessionRef.current;
      pageSessionRef.current = null;
      if (session && !sessionTransferredRef.current) {
        void session.cleanup();
      }
    };
  }, [visible, candidate, chapterLanguage]);

  if (!candidate) return null;

  const downloaded = pages.length > 0;

  const confirm = async () => {
    if (!downloaded) return;
    if (isSameEngineLanguage(source, target)) {
      setNotice("Source and target languages are the same.");
      return;
    }
    setBusy(true);
    try {
      const settings = await getSettings();
      const next = await updateSettings({
        readerTranslationEngine: engine,
        readerLanguage:
          source === chapterLanguage ? settings.readerLanguage : source,
        readerTargetLanguage: target,
      });
      if (engine === "ai" && !next.geminiApiKey.trim()) {
        setNotice(
          "AI translation needs a Gemini API key in Settings > Translation.",
        );
        setBusy(false);
        return;
      }
      const result = await enqueuePretranslateJob({
        mangaId: candidate.target.mangaId,
        chapterId: candidate.target.chapterId,
        mangaTitle,
        chapterTitle: candidate.chapterTitle,
        pageUris: pages,
        sourceLanguage: source,
        targetLanguage: target,
        engine,
        settings: next,
      });
      if (!result.ok) {
        setNotice(result.reason ?? "Could not queue the chapter.");
        setBusy(false);
        return;
      }
      sessionTransferredRef.current = true;
      console.log("[pretranslate] queued", {
        chapterId: candidate.target.chapterId,
        engine,
        pages: pages.length,
      });
      setNotice("Added to the translation queue.");
      setBusy(false);
      setTimeout(onClose, 500);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not queue the job.",
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Languages color={colors.accent} size={20} />
              <Text style={styles.title}>Pre-translate</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X color={colors.textMuted} size={20} />
            </Pressable>
          </View>

          <Text style={styles.chapter} numberOfLines={2}>
            {candidate.chapterTitle} · {mangaTitle}
          </Text>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : !downloaded ? (
            <>
              <Text style={styles.message}>
                This chapter is not downloaded yet. Download it first so
                pre-translation can work offline and in the background.
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.button, styles.cancel]}
                  onPress={onClose}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.primary]}
                  onPress={() => {
                    onDownload(candidate);
                    onClose();
                  }}
                >
                  <Text style={styles.primaryText}>Download chapter</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ScrollView
                style={styles.cardScroll}
                contentContainerStyle={styles.cardScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
              <Text style={styles.message}>
                It is a pretranslate feature, for translating downloaded
                chapters in advance for seamless reading. Adjust the settings,
                like languages and engine, and tap confirm when ready.
              </Text>

              {showSettings ? (
                <>
                  <Text style={styles.sectionLabel}>Engine</Text>
                  {(["free", "ai"] as ReaderTranslationEngine[]).map((value) => (
                    <Pressable
                      key={value}
                      style={styles.radioRow}
                      onPress={() => setEngine(value)}
                    >
                      <View
                        style={[
                          styles.radio,
                          engine === value && styles.radioActive,
                        ]}
                      >
                        {engine === value ? (
                          <View style={styles.radioDot} />
                        ) : null}
                      </View>
                      <Text style={styles.radioLabel}>
                        {value === "free" ? "Free Google" : "Gemini AI"}
                      </Text>
                    </Pressable>
                  ))}

                  <Text style={styles.sectionLabel}>Source language</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {READER_LANGUAGE_OPTIONS.filter((item) => item.code).map(
                      (item) => (
                        <Pressable
                          key={item.code}
                          onPress={() => setSource(item.code)}
                          style={[
                            styles.chip,
                            source === item.code && styles.chipActive,
                          ]}
                        >
                          <Text style={styles.chipText}>{item.label}</Text>
                        </Pressable>
                      ),
                    )}
                  </ScrollView>

                  <Text style={styles.sectionLabel}>Target language</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {READER_TARGET_OPTIONS.map((item) => (
                      <Pressable
                        key={item.code}
                        onPress={() => setTarget(item.code)}
                        style={[
                          styles.chip,
                          target === item.code && styles.chipActive,
                        ]}
                      >
                        <Text style={styles.chipText}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              </ScrollView>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.button, styles.settingsButton]}
                  onPress={() => setShowSettings((value) => !value)}
                >
                  <Settings color={colors.text} size={16} />
                  <Text style={styles.settingsText}>
                    {showSettings ? "Hide settings" : "Settings"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.primary]}
                  onPress={() => void confirm()}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <Text style={styles.primaryText}>Confirm</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "90%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  chapter: { color: colors.textMuted, fontSize: 13 },
  loading: { paddingVertical: 24, alignItems: "center" },
  message: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 6,
  },
  cardScroll: { flexShrink: 1 },
  cardScrollContent: { paddingBottom: 6 },
  settingsHint: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.accent },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  radioLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}22`,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  notice: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  button: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  cancel: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  primary: { backgroundColor: colors.accent, minWidth: 110 },
  primaryText: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  settingsButton: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsText: { color: colors.text, fontSize: 13, fontWeight: "700" },
});
