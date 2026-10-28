import React, { useCallback, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useAppMotion } from "@shared/motion";
import { motion } from "@shared/motion/tokens";

type PressableStyle = PressableProps["style"];
type PressableStyleCallback = (
  state: PressableStateCallbackType,
) => StyleProp<ViewStyle>;

export interface ScalePressableProps extends Omit<PressableProps, "style"> {
  style?: PressableStyle;
  /** Override the pressed scale for compact controls such as icon buttons. */
  pressedScale?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with a small native-driven scale response. The existing pressed
 * style callback remains available so callers keep their own feedback.
 */
export default function ScalePressable({
  style,
  pressedScale = motion.pressScale,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: ScalePressableProps) {
  const { reduceMotion } = useAppMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (value: number) => {
      if (reduceMotion) {
        scale.setValue(1);
        return;
      }
      Animated.timing(scale, {
        toValue: value,
        duration: motion.durations.press,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [reduceMotion, scale],
  );

  const handlePressIn = useCallback<NonNullable<PressableProps["onPressIn"]>>(
    (event) => {
      animateTo(pressedScale);
      onPressIn?.(event);
    },
    [animateTo, onPressIn, pressedScale],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps["onPressOut"]>>(
    (event) => {
      animateTo(1);
      onPressOut?.(event);
    },
    [animateTo, onPressOut],
  );

  const resolveStyle = useCallback<PressableStyleCallback>(
    (state) => {
      const resolved = typeof style === "function" ? style(state) : style;
      return [resolved, { transform: [{ scale }] }];
    },
    [scale, style],
  );

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={resolveStyle}
    />
  );
}
