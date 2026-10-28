import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useAppMotion } from "@shared/motion";

const SLIDE_DURATION_MS = 240;
const EXIT_DURATION_MS = 190;

interface ReaderConfigSheetMotionProps {
  visible: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onClosed?: () => void;
}

/**
 * Keeps a bottom sheet mounted through its exit animation and slides it up
 * from below the viewport on entry. The measured height is used so taller
 * sheets do not trail into view.
 */
export default function ReaderConfigSheetMotion({
  visible,
  children,
  style,
  onClosed,
}: ReaderConfigSheetMotionProps) {
  const { reduceMotion } = useAppMotion();
  const { height: viewportHeight } = useWindowDimensions();
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const visibleRef = useRef(visible);
  const wasVisibleRef = useRef(visible);

  visibleRef.current = visible;

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (wasVisible === visible) return;

    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      mountedRef.current = true;
      if (reduceMotion) {
        progress.setValue(1);
        return;
      }
      progress.setValue(0);
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: SLIDE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }

    if (!mountedRef.current) return;
    if (reduceMotion) {
      progress.setValue(0);
      mountedRef.current = false;
      setMounted(false);
      onClosed?.();
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: EXIT_DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visibleRef.current) {
        mountedRef.current = false;
        setMounted(false);
        onClosed?.();
      }
    });
    return () => animation.stop();
  }, [onClosed, progress, reduceMotion, visible]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        style,
        {
          opacity: progress.interpolate({
            inputRange: [0, 0.55, 1],
            outputRange: [0, 1, 1],
          }),
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [viewportHeight, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 60,
  },
});
