/**
 * ReaderBottomBar.tsx
 * ---------------------------------------------------------------------------
 * Bottom chrome of the reader: two stacked rows -
 *   Row 1: prev-chapter / dotted page slider / next-chapter
 *   Row 2: reading mode, rotation, auto-scroll, fit mode, settings
 * Rewritten to match demo.tsx; chapter wiring stays the parent's job.
 * ---------------------------------------------------------------------------
 */

import {
  ArrowLeftRight,
  ArrowUpDown,
  Crop,
  Expand,
  GalleryHorizontal,
  GalleryVertical,
  PauseCircle,
  PlayCircle,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
} from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import type {
  ReaderFitMode,
  ReaderReadingMode,
} from "./readerChrome";
import { READER_ACCENT, READER_BORDER } from "./readerTheme";
import DotSlider from "./DotSlider";

function AutoScrollButton({
  active,
  disabled,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.35,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.toolbarBtn, disabled && styles.toolbarBtnDisabled]}
    >
      <Animated.View style={{ transform: [{ scale: active ? pulse : 1 }] }}>
        {active ? (
          <PauseCircle color={READER_ACCENT} size={22} />
        ) : (
          <PlayCircle color={disabled ? "#4b4d5c" : "#fff"} size={22} />
        )}
      </Animated.View>
    </Pressable>
  );
}

export interface ReaderBottomBarProps {
  currentIndex: number;
  totalPages: number;
  onScrub: (index: number) => void;
  canPrevChapter: boolean;
  canNextChapter: boolean;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  readingMode: ReaderReadingMode;
  onOpenReadingModeSheet: () => void;
  onOpenRotationSheet: () => void;
  autoScrollActive: boolean;
  autoScrollDisabled: boolean;
  onToggleAutoScroll: () => void;
  fitMode: ReaderFitMode;
  onToggleFit: () => void;
  onOpenSettings: () => void;
}

export default function ReaderBottomBar({
  currentIndex,
  totalPages,
  onScrub,
  canPrevChapter,
  canNextChapter,
  onPrevChapter,
  onNextChapter,
  readingMode,
  onOpenReadingModeSheet,
  onOpenRotationSheet,
  autoScrollActive,
  autoScrollDisabled,
  onToggleAutoScroll,
  fitMode,
  onToggleFit,
  onOpenSettings,
}: ReaderBottomBarProps) {
  const ReadingModeIcon =
    readingMode === "scrollVertical"
      ? GalleryVertical
      : readingMode === "scrollHorizontal"
        ? GalleryHorizontal
        : readingMode === "pagedVertical"
          ? ArrowUpDown
          : ArrowLeftRight;

  return (
    <View style={styles.bottomBar}>
      <View style={styles.sliderRow}>
        <Pressable
          disabled={!canPrevChapter}
          onPress={onPrevChapter}
          style={[
            styles.chapterNavBtn,
            !canPrevChapter && styles.chapterNavBtnDisabled,
          ]}
        >
          <SkipBack
            color={canPrevChapter ? "#fff" : "#4b4d5c"}
            size={20}
          />
        </Pressable>

        <View style={styles.sliderFlex}>
          <DotSlider
            value={currentIndex}
            min={0}
            max={Math.max(totalPages - 1, 0)}
            dotCount={Math.min(50, totalPages)}
            leftLabel={`${currentIndex + 1}`}
            rightLabel={`${totalPages}`}
            onChange={onScrub}
          />
        </View>

        <Pressable
          disabled={!canNextChapter}
          onPress={onNextChapter}
          style={[
            styles.chapterNavBtn,
            !canNextChapter && styles.chapterNavBtnDisabled,
          ]}
        >
          <SkipForward
            color={canNextChapter ? "#fff" : "#4b4d5c"}
            size={20}
          />
        </Pressable>
      </View>

      <View style={styles.toolbarRow}>
        <Pressable style={styles.toolbarBtn} onPress={onOpenReadingModeSheet}>
          <ReadingModeIcon color="#fff" size={22} />
        </Pressable>

        <Pressable style={styles.toolbarBtn} onPress={onOpenRotationSheet}>
          <RotateCw color="#fff" size={22} />
        </Pressable>

        <AutoScrollButton
          active={autoScrollActive}
          disabled={autoScrollDisabled}
          onPress={onToggleAutoScroll}
        />

        <Pressable style={styles.toolbarBtn} onPress={onToggleFit}>
          {fitMode === "fit" ? (
            <Crop color="#fff" size={22} />
          ) : (
            <Expand color={READER_ACCENT} size={22} />
          )}
        </Pressable>

        <Pressable style={styles.toolbarBtn} onPress={onOpenSettings}>
          <Settings color="#fff" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: "rgba(10,10,14,0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: READER_BORDER,
    paddingTop: 8,
    paddingBottom: 10,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  sliderFlex: { flex: 1, marginHorizontal: 6 },
  chapterNavBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  chapterNavBtnDisabled: { opacity: 0.35 },
  toolbarRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 8,
  },
  toolbarBtn: {
    width: 48,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  toolbarBtnDisabled: { opacity: 0.3 },
});
