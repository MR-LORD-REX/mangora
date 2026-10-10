/**
 * DownloadSheetHost.tsx
 * ---------------------------------------------------------------------------
 * Renders the downloader dialogs requested through components/downloader/
 * sheets.ts. Mounted once in the root layout so any screen (viewer header,
 * chapter row, reader bottom bar) can ask for them imperatively.
 * ---------------------------------------------------------------------------
 */

import { Check, Download, FolderOpen } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, radius } from "@/constants/theme";
import { pickDownloadFolder } from "@/services/downloader";

import {
  getActiveSheet,
  resolveSheet,
  subscribeSheet,
  type ChapterOption,
  type SheetRequest,
} from "./sheets";

export default function DownloadSheetHost() {
  const [request, setRequest] = useState<SheetRequest | null>(() =>
    getActiveSheet(),
  );
  const [suppress, setSuppress] = useState(false);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => subscribeSheet(setRequest), []);

  useEffect(() => {
    if (!request) return;
    setSuppress(false);
    setPicking(false);
    if (request.kind === "select") {
      setSelected(
        new Set(
          request.options
            .filter((option) => !option.downloaded)
            .map((option) => option.id),
        ),
      );
    }
  }, [request]);

  const close = (value: unknown) => resolveSheet(value);

  const chooseFolder = async () => {
    setPicking(true);
    try {
      const state = await pickDownloadFolder();
      close(state != null);
    } catch {
      close(false);
    } finally {
      setPicking(false);
    }
  };

  const toggleOption = (option: ChapterOption) => {
    if (option.downloaded) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(option.id)) next.delete(option.id);
      else next.add(option.id);
      return next;
    });
  };

  const selectable = useMemo(
    () =>
      request?.kind === "select"
        ? request.options.filter((option) => !option.downloaded)
        : [],
    [request],
  );
  const allSelected =
    selectable.length > 0 && selected.size === selectable.length;

  if (!request) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => close(undefined)}
    >
      <Pressable style={styles.backdrop} onPress={() => close(undefined)}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          {request.kind === "folder" ? (
            <>
              <Text style={styles.title}>{request.title}</Text>
              <Text style={styles.message}>{request.message}</Text>
              <View style={styles.rowButtons}>
                <Pressable
                  style={[styles.button, styles.ghostButton]}
                  onPress={() => close(false)}
                >
                  <Text style={styles.ghostButtonText}>Not now</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.primaryButton]}
                  onPress={() => void chooseFolder()}
                  disabled={picking}
                >
                  {picking ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <>
                      <FolderOpen color={colors.onAccent} size={17} />
                      <Text style={styles.primaryButtonText}>Choose folder</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}

          {request.kind === "confirm" ? (
            <>
              <Text style={styles.title}>{request.title}</Text>
              <Text style={styles.message}>{request.message}</Text>
              {request.allowSuppress ? (
                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setSuppress((value) => !value)}
                >
                  <View style={[styles.checkbox, suppress && styles.checkboxOn]}>
                    {suppress ? (
                      <Check color={colors.onAccent} size={13} strokeWidth={3} />
                    ) : null}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    Hide this pop up for today
                  </Text>
                </Pressable>
              ) : null}
              <View style={styles.rowButtons}>
                <Pressable
                  style={[styles.button, styles.ghostButton]}
                  onPress={() =>
                    close(
                      request.resolveAs === "suppress"
                        ? { confirmed: false, suppress: false }
                        : false,
                    )
                  }
                >
                  <Text style={styles.ghostButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.button,
                    request.destructive
                      ? styles.dangerButton
                      : styles.primaryButton,
                  ]}
                  onPress={() =>
                    close(
                      request.resolveAs === "suppress"
                        ? { confirmed: true, suppress }
                        : true,
                    )
                  }
                >
                  <Download color={colors.onAccent} size={17} />
                  <Text style={styles.primaryButtonText}>
                    {request.confirmLabel}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {request.kind === "select" ? (
            <>
              <Text style={styles.title}>{request.title}</Text>
              <Text style={styles.message}>{request.message}</Text>
              {selectable.length > 0 ? (
                <Pressable
                  style={styles.selectAllRow}
                  onPress={() =>
                    setSelected(
                      allSelected
                        ? new Set()
                        : new Set(selectable.map((option) => option.id)),
                    )
                  }
                >
                  <View
                    style={[styles.checkbox, allSelected && styles.checkboxOn]}
                  >
                    {allSelected ? (
                      <Check color={colors.onAccent} size={13} strokeWidth={3} />
                    ) : null}
                  </View>
                  <Text style={styles.selectAllLabel}>Select all</Text>
                  <Text style={styles.selectAllCount}>
                    {selected.size}/{selectable.length}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.message}>
                  Every chapter of this series is already downloaded.
                </Text>
              )}
              <ScrollView style={styles.optionList} bounces={false}>
                {request.options.map((option) => {
                  const checked = selected.has(option.id);
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => toggleOption(option)}
                      style={({ pressed }) => [
                        styles.optionRow,
                        pressed && styles.optionPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          option.downloaded && styles.checkboxDone,
                          checked && styles.checkboxOn,
                        ]}
                      >
                        {option.downloaded || checked ? (
                          <Check
                            color={colors.onAccent}
                            size={13}
                            strokeWidth={3}
                          />
                        ) : null}
                      </View>
                      <View style={styles.optionTextWrap}>
                        <Text numberOfLines={1} style={styles.optionLabel}>
                          {option.label}
                        </Text>
                        {option.subtitle ? (
                          <Text numberOfLines={1} style={styles.optionSubtitle}>
                            {option.downloaded
                              ? `${option.subtitle} · downloaded`
                              : option.subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.rowButtons}>
                <Pressable
                  style={[styles.button, styles.ghostButton]}
                  onPress={() => close(null)}
                >
                  <Text style={styles.ghostButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.button,
                    styles.primaryButton,
                    selected.size === 0 && styles.buttonDisabled,
                  ]}
                  disabled={selected.size === 0}
                  onPress={() => close(Array.from(selected))}
                >
                  <Download color={colors.onAccent} size={17} />
                  <Text style={styles.primaryButtonText}>
                    Download {selected.size > 0 ? selected.size : ""}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {request.kind === "library" ? (
            <>
              <Text style={styles.title}>{request.title}</Text>
              <Text style={styles.message}>{request.message}</Text>
              <ScrollView style={styles.optionList} bounces={false}>
                {request.options.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => close(option.id)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View style={styles.optionTextWrap}>
                      <Text numberOfLines={1} style={styles.optionLabel}>
                        {option.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.rowButtons}>
                <Pressable
                  style={[styles.button, styles.ghostButton]}
                  onPress={() => close(null)}
                >
                  <Text style={styles.ghostButtonText}>Not now</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 16,
    paddingBottom: 26,
    maxHeight: "84%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 12,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
  message: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  rowButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.full,
    minWidth: 110,
  },
  primaryButton: { backgroundColor: colors.accent },
  dangerButton: { backgroundColor: colors.danger },
  primaryButtonText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  ghostButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ghostButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  buttonDisabled: { opacity: 0.5 },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  checkboxLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  selectAllLabel: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  selectAllCount: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  optionList: { marginTop: 4, maxHeight: 360 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  optionPressed: { opacity: 0.7 },
  optionTextWrap: { flex: 1 },
  optionLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  optionSubtitle: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
});
