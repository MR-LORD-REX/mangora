/**
 * DotSlider.tsx
 * ---------------------------------------------------------------------------
 * Dotted-track slider extracted from demo.tsx. Visual: a row of evenly spaced
 * dots for the "remaining" portion, a solid filled bar for the "elapsed"
 * portion and a vertical-bar thumb. Reused for the bottom page scrubber, the
 * auto-scroll speed slider and the side-padding slider.
 * ---------------------------------------------------------------------------
 */

import React, { useRef } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

import {
  READER_SLIDER_FILL,
  READER_SLIDER_TRACK,
  READER_TEXT_MUTED,
} from "./readerTheme";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface DotSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  dotCount?: number;
  disabled?: boolean;
  leftLabel?: string;
  rightLabel?: string;
  onChange: (next: number) => void;
}

export default function DotSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  dotCount = 24,
  disabled = false,
  leftLabel,
  rightLabel,
  onChange,
}: DotSliderProps) {
  const trackRef = useRef<View>(null);
  const trackX = useRef(0);
  const trackWidth = useRef(0);

  const percent = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;

  const updateFromAbsoluteX = (absoluteX: number) => {
    if (!trackWidth.current) return;
    const relative = clamp(
      (absoluteX - trackX.current) / trackWidth.current,
      0,
      1,
    );
    const raw = min + relative * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(clamp(stepped, min, max));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt) => updateFromAbsoluteX(evt.nativeEvent.pageX),
      onPanResponderMove: (evt) => updateFromAbsoluteX(evt.nativeEvent.pageX),
    }),
  ).current;

  const measureTrack = () => {
    trackRef.current?.measure((_x, _y, width, _height, pageX) => {
      trackWidth.current = width;
      trackX.current = pageX;
    });
  };

  return (
    <View style={styles.sliderWrap}>
      {(leftLabel !== undefined || rightLabel !== undefined) && (
        <View style={styles.sliderLabelsRow}>
          <Text style={styles.sliderLabel}>{leftLabel}</Text>
          <Text style={styles.sliderLabel}>{rightLabel}</Text>
        </View>
      )}
      <View
        ref={trackRef}
        onLayout={measureTrack}
        style={[styles.sliderTrack, disabled && styles.sliderTrackDisabled]}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        <View style={styles.sliderDotsRow} pointerEvents="none">
          {Array.from({ length: dotCount }).map((_, index) => (
            <View key={index} style={styles.sliderDot} />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={[styles.sliderFilled, { width: `${percent * 100}%` }]}
        />
        <View
          pointerEvents="none"
          style={[styles.sliderThumb, { left: `${percent * 100}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sliderWrap: { width: "100%" },
  sliderLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sliderLabel: { color: READER_TEXT_MUTED, fontSize: 11, fontWeight: "600" },
  sliderTrack: {
    height: 20,
    justifyContent: "center",
    position: "relative",
  },
  sliderTrackDisabled: { opacity: 0.35 },
  sliderDotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 4,
  },
  sliderDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: READER_SLIDER_TRACK,
  },
  sliderFilled: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: READER_SLIDER_FILL,
  },
  sliderThumb: {
    position: "absolute",
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: "#fff",
    transform: [{ translateX: -1.5 }],
  },
});