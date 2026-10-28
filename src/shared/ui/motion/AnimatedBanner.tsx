import React, { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useAppMotion } from "@shared/motion";
import { motion } from "@shared/motion/tokens";
import { colors, radius } from "@shared/theme";

export interface AnimatedBannerProps {
  message: string;
  tone?: "info" | "error";
  icon?: ReactNode;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityRole?: "alert" | "none";
}

/** Small status banner that slides in, and slides out before unmounting. */
export default function AnimatedBanner({
  message,
  tone = "info",
  icon,
  onDismiss,
  style,
  textStyle,
  accessibilityRole = "alert",
}: AnimatedBannerProps) {
  const { reduceMotion } = useAppMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const exiting = useRef(false);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.stopAnimation();
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.durations.banner,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [message, progress, reduceMotion]);

  const dismiss = () => {
    if (!onDismiss || exiting.current) return;
    exiting.current = true;
    if (reduceMotion) {
      onDismiss();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: motion.durations.banner,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  };

  const error = tone === "error";

  return (
    <Animated.View
      accessibilityRole={accessibilityRole === "none" ? undefined : "alert"}
      style={[
        styles.banner,
        error && styles.bannerError,
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-motion.bannerOffset, 0],
              }),
            },
          ],
        },
      ]}
    >
      {icon}
      <Text
        numberOfLines={3}
        style={[
          styles.text,
          error && styles.textError,
          textStyle,
        ]}
      >
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={[styles.closeText, error && styles.textError]}>×</Text>
        </Pressable>
      ) : null}
      <View style={styles.spacer} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
  },
  bannerError: { backgroundColor: colors.dangerSoft },
  text: { color: colors.gold, fontSize: 12, flex: 1, lineHeight: 17 },
  textError: { color: colors.danger },
  close: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  closeText: { color: colors.textMuted, fontSize: 18, lineHeight: 20 },
  pressed: { opacity: 0.6 },
  spacer: { width: 0 },
});
