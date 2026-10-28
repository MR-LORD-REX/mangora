import React, { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useAppMotion } from "@shared/motion";
import { motion } from "@shared/motion/tokens";

export interface FadeInViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Change this key to replay the fade, for example on a selected tab. */
  transitionKey?: string | number | null;
  offset?: number;
  duration?: number;
}

/** Fade and slightly rise content without remounting its children. */
export default function FadeInView({
  children,
  style,
  transitionKey,
  offset = 4,
  duration = motion.durations.fade,
}: FadeInViewProps) {
  const { reduceMotion } = useAppMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [duration, progress, reduceMotion, transitionKey]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [offset, 0],
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
