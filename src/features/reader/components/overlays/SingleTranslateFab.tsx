/**
 * SingleTranslateFab.tsx
 * ---------------------------------------------------------------------------
 * Floating single-page translate button. While a page is processing it
 * alternates between the TR icon and the current stage icon, then settles on
 * the result icon (check / alert). Tapping again retries or translates the new
 * current page.
 * ---------------------------------------------------------------------------
 */

import {
  CircleAlert,
  CircleCheck,
  Languages,
  ScanText,
} from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";

import type { PageTranslationState } from "@features/translation";

export default function SingleTranslateFab({
  stage,
  busy,
  onPress,
}: {
  stage: PageTranslationState["stage"] | undefined;
  busy: boolean;
  onPress: () => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!busy) {
      fade.setValue(stage && stage !== "queued" ? 1 : 0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, fade, stage]);

  const statusIcon =
    stage === "detect" || stage === "ocr" || stage === "queued" ? (
      <ScanText color="#fff" size={22} />
    ) : stage === "translate" ? (
      <Languages color="#fff" size={22} />
    ) : stage === "done" ? (
      <CircleCheck color="#34d399" size={22} />
    ) : stage === "error" ? (
      <CircleAlert color="#f87171" size={22} />
    ) : null;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.fab, busy && styles.busy]}
      accessibilityLabel="Translate this page"
    >
      <Languages color="#fff" size={22} />
      {statusIcon ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.statusLayer, { opacity: fade }]}
        >
          {statusIcon}
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 18,
    bottom: 118,
    zIndex: 30,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(14,165,233,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  busy: { backgroundColor: "rgba(14,116,144,0.95)" },
  statusLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
