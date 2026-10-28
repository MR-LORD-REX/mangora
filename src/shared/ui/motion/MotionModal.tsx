import React, { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useAppMotion } from "@shared/motion";
import { motion } from "@shared/motion/tokens";
import { colors } from "@shared/theme";

export interface MotionModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  /** Sheet slides up; dialog scales and fades in place. */
  variant?: "sheet" | "dialog";
  /** Styles for the flex container that positions the content. */
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  onBackdropPress?: () => void;
  statusBarTranslucent?: boolean;
}

/**
 * Shared modal shell with an animated scrim and one native-driven content
 * transition. Content stays mounted while the exit animation runs.
 */
export default function MotionModal({
  visible,
  onRequestClose,
  children,
  variant = "dialog",
  containerStyle,
  style,
  onBackdropPress,
  statusBarTranslucent = false,
}: MotionModalProps) {
  const { reduceMotion } = useAppMotion();
  const [mounted, setMounted] = React.useState(visible);
  const progress = useRef(
    new Animated.Value(visible || reduceMotion ? 1 : 0),
  ).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.stopAnimation();
      if (reduceMotion) {
        progress.setValue(1);
        return;
      }
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.durations.sheet,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!mounted) return;
    if (reduceMotion) {
      setMounted(false);
      progress.setValue(0);
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: motion.durations.fade,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [mounted, progress, reduceMotion, visible]);

  if (!mounted) return null;

  const isSheet = variant === "sheet";
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent={statusBarTranslucent}
      onRequestClose={onRequestClose}
    >
      <Animated.View style={[styles.scrim, { opacity: backdropOpacity }]}>
        <Animated.View
          style={[
            styles.backdrop,
            isSheet && styles.backdropSheet,
            containerStyle,
          ]}
        >
          <Animated.View
            style={[
              isSheet ? styles.sheetMotion : styles.dialogMotion,
              style,
              {
                opacity: isSheet
                  ? 1
                  : progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 1],
                    }),
                transform: [
                  {
                    translateY: isSheet
                      ? progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [motion.sheetOffset, 0],
                        })
                      : 0,
                  },
                  {
                    scale: isSheet
                      ? 1
                      : progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.97, 1],
                        }),
                  },
                ],
              },
            ]}
          >
            {children}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  backdropSheet: {
    justifyContent: "flex-end",
    padding: 0,
  },
  dialogMotion: {
    width: "100%",
    alignItems: "center",
  },
  sheetMotion: {
    width: "100%",
    maxHeight: "92%",
  },
});
