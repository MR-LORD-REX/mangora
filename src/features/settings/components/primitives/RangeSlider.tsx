/**
 * RangeSlider.tsx
 * ---------------------------------------------------------------------------
 * Integer slider used by the download concurrency settings. Visual equivalent
 * of the reader's DotSlider but themed for the app-wide Settings screen.
 * ---------------------------------------------------------------------------
 */

import React, { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@shared/theme";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function RangeSlider({
  value,
  min = 1,
  max = 5,
  step = 1,
  disabled = false,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const trackRef = useRef<View>(null);
  const trackX = useRef(0);
  const trackWidth = useRef(0);
  const [width, setWidth] = useState(0);
  const thumbSize = 18;

  const percent = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  const stops = Math.round((max - min) / step) + 1;

  const updateFromAbsoluteX = (absoluteX: number) => {
    if (!trackWidth.current) return;
    const relative = clamp((absoluteX - trackX.current) / trackWidth.current, 0, 1);
    const raw = min + relative * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(clamp(stepped, min, max));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (event) =>
        updateFromAbsoluteX(event.nativeEvent.pageX),
      onPanResponderMove: (event) =>
        updateFromAbsoluteX(event.nativeEvent.pageX),
    }),
  ).current;

  const measure = () => {
    trackRef.current?.measure((_x, _y, measuredWidth, _h, pageX) => {
      trackWidth.current = measuredWidth;
      trackX.current = pageX;
      setWidth(measuredWidth);
    });
  };

  const travel = Math.max(0, width - thumbSize);

  return (
    <View style={styles.wrap}>
      <View
        ref={trackRef}
        onLayout={measure}
        style={[styles.track, disabled && styles.disabled]}
        {...(disabled ? {} : responder.panHandlers)}
      >
        <View style={styles.trackLine} pointerEvents="none" />
        <View
          pointerEvents="none"
          style={[styles.fill, { width: percent * travel + thumbSize / 2 }]}
        />
        {Array.from({ length: stops }).map((_, index) => (
          <View
            key={index}
            pointerEvents="none"
            style={[
              styles.tick,
              {
                left: `${(index / Math.max(1, stops - 1)) * 100}%`,
              },
            ]}
          />
        ))}
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: percent * travel },
            disabled && styles.disabled,
          ]}
        />
      </View>
      <View style={styles.labelsRow}>
        <Text style={styles.bound}>{min}</Text>
        <Text style={styles.bound}>{Math.round((min + max) / 2)}</Text>
        <Text style={styles.bound}>{max}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingBottom: 14 },
  track: {
    height: 34,
    justifyContent: "center",
    position: "relative",
  },
  trackLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHigh,
  },
  fill: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  tick: {
    position: "absolute",
    width: 2,
    height: 8,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  thumb: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.onAccent,
  },
  disabled: { opacity: 0.4 },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  bound: { color: colors.textFaint, fontSize: 11, fontWeight: "600" },
});