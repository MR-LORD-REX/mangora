/**
 * ZoomablePage.tsx
 * ---------------------------------------------------------------------------
 * Per-page pinch-zoom + pan + double-tap container for the reader's
 * "original" fit mode (paged layouts). Built on react-native-gesture-handler
 * and reanimated (both already installed - no new dependency).
 *
 * Single-finger drags are left to the parent FlatList (two-finger pan only),
 * so page swipes keep working while zoomed content can still be moved.
 * ---------------------------------------------------------------------------
 */

import React, { useEffect, useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const MIN_ZOOM_OUT = 0.4;

export interface ZoomablePageProps {
  width: number;
  height: number;
  /** Natural (scale-1) content size in device px. */
  contentWidth: number;
  contentHeight: number;
  doubleTapToZoom: boolean;
  disableZoomOut: boolean;
  onSingleTap?: () => void;
  /** Tap callback that also receives the tap point inside the page box. */
  onTapAt?: (x: number, y: number) => void;
  children: React.ReactNode;
  defScale?: number;
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

export default function ZoomablePage({
  width,
  height,
  contentWidth,
  contentHeight,
  doubleTapToZoom,
  disableZoomOut,
  onSingleTap,
  onTapAt,
  children,
  defScale,
}: ZoomablePageProps) {
  const fitScale = useMemo(
    () =>
      contentWidth > 0 && contentHeight > 0
        ? Math.min(width / contentWidth, height / contentHeight)
        : 1,
    [contentHeight, contentWidth, height, width],
  );
  // Start zoomed to the viewport instead of rendering natural-size content
  // larger than the screen on the first frame.
  const defaultScale = Math.min(1.5, Math.max(0.5, defScale ?? 1));
  const scale = useSharedValue(defaultScale);
  const savedScale = useSharedValue(defaultScale);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const pinchStart = useSharedValue(defaultScale);

  useEffect(() => {
    scale.value = defaultScale;
    savedScale.value = defaultScale;
    pinchStart.value = defaultScale;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
  }, [defaultScale, pinchStart, savedScale, savedTx, savedTy, scale, tx, ty]);

  const minScale = disableZoomOut
    ? Math.max(fitScale, MIN_ZOOM_OUT)
    : Math.min(fitScale, MIN_ZOOM_OUT);

  const useGestures = Platform.OS !== "web" && width > 0 && height > 0;

  const clampTranslation = (
    nextX: number,
    nextY: number,
    currentScale: number,
  ) => {
    "worklet";
    const contentW = contentWidth * currentScale;
    const contentH = contentHeight * currentScale;
    const maxX = Math.max(0, (contentW - width) / 2);
    const maxY = Math.max(0, (contentH - height) / 2);
    return {
      x: clamp(nextX, -maxX, maxX),
      y: clamp(nextY, -maxY, maxY),
    };
  };

  const applyScaleAboutCenter = (
    nextScale: number,
    focalX: number,
    focalY: number,
  ) => {
    "worklet";
    const prev = scale.value;
    const ratio = nextScale / prev;
    tx.value = focalX - (focalX - tx.value) * ratio;
    ty.value = focalY - (focalY - ty.value) * ratio;
    scale.value = nextScale;
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      pinchStart.value = scale.value;
    })
    .onUpdate((event) => {
      const next = clamp(pinchStart.value * event.scale, minScale, MAX_SCALE);
      applyScaleAboutCenter(next, event.focalX, event.focalY);
    })
    .onEnd(() => {
      const clamped = clampTranslation(tx.value, ty.value, scale.value);
      tx.value = clamped.x;
      ty.value = clamped.y;
      savedScale.value = scale.value;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((event) => {
      const next = clampTranslation(
        savedTx.value + event.translationX,
        savedTy.value + event.translationY,
        scale.value,
      );
      tx.value = next.x;
      ty.value = next.y;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const zoomTo = (target: number) => {
    "worklet";
    const clamped = clamp(target, minScale, MAX_SCALE);
    applyScaleAboutCenter(clamped, width / 2, height / 2);
    const bounded = clampTranslation(tx.value, ty.value, clamped);
    tx.value = withSpring(bounded.x, { damping: 18, stiffness: 180 });
    ty.value = withSpring(bounded.y, { damping: 18, stiffness: 180 });
    scale.value = withTiming(clamped, { duration: 200 });
    savedScale.value = clamped;
    savedTx.value = bounded.x;
    savedTy.value = bounded.y;
  };

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .enabled(doubleTapToZoom)
    .onEnd(() => {
      if (scale.value > 1.05) {
        zoomTo(minScale);
      } else {
        zoomTo(DOUBLE_TAP_SCALE);
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDelay(260)
    .onEnd((event) => {
      if (onTapAt) {
        runOnJS(onTapAt)(event.x, event.y);
        return;
      }
      if (onSingleTap) {
        runOnJS(onSingleTap)();
      }
    });

  const composed = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const content = (
    <View style={styles.centerWrap}>
      <Animated.View
        style={[
          styles.content,
          { width: contentWidth, height: contentHeight },
          animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );

  if (!useGestures) {
    return <View style={[styles.container, { width, height }]}>{content}</View>;
  }

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.container, { width, height }]}>{content}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden" },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { backgroundColor: "#000" },
});
