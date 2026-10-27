import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

import type {
  ReaderInvertTapZones,
  ReaderTapZoneLayout,
} from "@core/settings";

import { tapZoneRectsFor } from "../../domain/navigation/tapZones";

const PREVIEW_DURATION_MS = 2000;

export interface ReaderTapZonePreviewProps {
  layout: ReaderTapZoneLayout;
  invert: ReaderInvertTapZones;
  rtl: boolean;
  width: number;
  height: number;
}

/** Flashes the active tap zones after the user changes the preset. */
export default function ReaderTapZonePreview({
  layout,
  invert,
  rtl,
  width,
  height,
}: ReaderTapZonePreviewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const previousLayoutRef = useRef<ReaderTapZoneLayout | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (previousLayoutRef.current === null) {
      previousLayoutRef.current = layout;
      return;
    }
    if (previousLayoutRef.current === layout) return;
    previousLayoutRef.current = layout;
    setVisible(true);
  }, [layout]);

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0.7);
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: PREVIEW_DURATION_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => animation.stop();
  }, [opacity, visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { opacity }]}
    >
      {tapZoneRectsFor(layout, width, height, rtl, invert).map((rect) => (
        <View
          key={rect.edge}
          style={[
            styles.band,
            {
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: rect.color,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 70,
  },
  band: {
    position: "absolute",
    backgroundColor: "rgba(251,191,36,0.35)",
  },
});
