/**
 * ReaderHeader.tsx
 * ---------------------------------------------------------------------------
 * Top chrome of the reader: back arrow, manga title + chapter subtitle,
 * translate toggle, settings and a close (X) button. X only dismisses the
 * header/footer overlays (a floating menu button reopens them); back/exit is
 * the separate arrow.
 * ---------------------------------------------------------------------------
 */

import { ArrowLeft, Languages, SlidersHorizontal, X } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  READER_ACCENT,
  READER_BORDER,
  READER_TEXT_MUTED,
} from "../panels/readerTheme";

export interface ReaderHeaderProps {
  mangaTitle: string;
  chapterLabel: string;
  translateActive: boolean;
  translationBusy?: boolean;
  /** Hidden in single-page mode, where the floating TR button owns the action. */
  showTranslateToggle?: boolean;
  onToggleTranslate: () => void;
  onOpenTranslation: () => void;
  onBack: () => void;
  /** Dismisses the header + footer overlays (shows the floating menu icon). */
  onClose: () => void;
  /** Extra header control (the chapter downloader button). */
  downloadSlot?: React.ReactNode;
  /** Library/bookmark control, styled like Mihon's reader app bar. */
  bookmarkSlot?: React.ReactNode;
}

export default function ReaderHeader({
  mangaTitle,
  chapterLabel,
  translateActive,
  translationBusy = false,
  showTranslateToggle = true,
  onToggleTranslate,
  onOpenTranslation,
  onBack,
  onClose,
  downloadSlot,
  bookmarkSlot,
}: ReaderHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable hitSlop={12} onPress={onBack} style={styles.headerIconBtn}>
        <ArrowLeft color="#fff" size={24} />
      </Pressable>

      <View style={styles.headerTitleWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          nestedScrollEnabled
          style={styles.headerTitleScroll}
          contentContainerStyle={styles.headerTitleScrollContent}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            {mangaTitle}
          </Text>
        </ScrollView>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {chapterLabel}
        </Text>
      </View>

      {bookmarkSlot}
      {downloadSlot}

      {showTranslateToggle ? (
        <Pressable
          hitSlop={12}
          onPress={onToggleTranslate}
          style={styles.headerIconBtn}
        >
          <Languages color={translateActive ? READER_ACCENT : "#fff"} size={22} />
          {translationBusy ? <View style={styles.headerBusyDot} /> : null}
        </Pressable>
      ) : null}

      <Pressable
        hitSlop={12}
        onPress={onOpenTranslation}
        style={styles.headerIconBtn}
        accessibilityLabel="Translation options"
      >
        <SlidersHorizontal color="#fff" size={22} />
      </Pressable>

      <Pressable
        hitSlop={12}
        onPress={onClose}
        style={styles.closeBtn}
        accessibilityLabel="Close reader controls"
      >
        <X color="#fff" size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(10,10,14,0.92)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: READER_BORDER,
  },
  headerIconBtn: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  closeBtn: {
    width: 26,
    height: 26,
    marginLeft: 2,
    marginRight: 6,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  headerTitleWrap: { flex: 1, minWidth: 0, marginHorizontal: 4 },
  headerTitleScroll: { width: "100%", flexGrow: 0, maxHeight: 22 },
  headerTitleScrollContent: { alignItems: "center", paddingRight: 8 },
  headerTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  headerSubtitle: {
    color: READER_TEXT_MUTED,
    fontSize: 12,
    marginTop: 1,
  },
  headerBusyDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: READER_ACCENT,
  },
});
