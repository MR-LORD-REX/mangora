/**
 * ZoomablePage.tsx
 * ---------------------------------------------------------------------------
 * Per-page pinch-zoom + pan + double-tap container for paged layouts. Built
 * on react-native-gesture-handler and reanimated.
 *
 * One-finger vertical drags pan tall pages; horizontal drags are left to the
 * parent pager so page swipes keep working. Two-finger pans are always local.
 * ---------------------------------------------------------------------------
 */

import React, { useEffect } from "react";
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
  /** Tap callback with coordinates in the page frame. */
  onTapAt?: (x: number, y: number) => void;
  onLongPress?: () => void;
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
  onLongPress,
  children,
  defScale,
}: ZoomablePageProps) {
  // Paged mode computes `contentWidth/Height` at the selected fit. At base
  // scale the page therefore fits the slot, and the user can still pinch out
  // below it when zoom-out is enabled.
  const defaultScale = clamp(defScale ?? 1, MIN_ZOOM_OUT, 1.5);
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

  const minScale = disableZoomOut ? 1 : MIN_ZOOM_OUT;
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
    .minPointers(1)
    .activeOffsetY([-10, 10])
    .failOffsetX([-12, 12])
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
    .maxDuration(250)
    .onEnd((event) => {
      if (onTapAt) {
        runOnJS(onTapAt)(event.x, event.y);
        return;
      }
      if (onSingleTap) {
        runOnJS(onSingleTap)();
      }
    });

  const longPress = Gesture.LongPress()
    .minDuration(450)
    .maxDistance(14)
    .enabled(Boolean(onLongPress))
    .onStart(() => {
      if (onLongPress) runOnJS(onLongPress)();
    });

  const composed = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, longPress, singleTap),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const content = (
    <Animated.View
      style={[
        styles.content,
        { width: contentWidth, height: contentHeight },
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
  const surface = (
    <View style={[styles.container, { width, height }]}>
      <View style={[styles.center, { flex: 1 }]}>{content}</View>
    </View>
  );

  if (!useGestures) {
    return surface;
  }

  return (
    <GestureDetector gesture={composed}>{surface}</GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden" },
  center: { alignItems: "center", justifyContent: "center" },
  content: { backgroundColor: "#000" },
});
