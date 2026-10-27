import React, { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useAppMotion } from "@shared/motion";
import { colors, radius } from "@shared/theme";

const PULSE_DURATION_MS = 780;

/** One shared opacity pulse for a group of skeleton blocks. */
export function SkeletonPulse({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceMotion } = useAppMotion();
  const opacity = useRef(new Animated.Value(0.48)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.stopAnimation();
      opacity.setValue(0.62);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.48,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[style, { opacity }]}
    >
      {children}
    </Animated.View>
  );
}

/** Static rounded placeholder. Place inside one SkeletonPulse per screen. */
export function SkeletonBlock({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.block, style]} />;
}

const styles = StyleSheet.create({
  block: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
  },
});