/**
 * PageTrStatusBadge.tsx
 * ---------------------------------------------------------------------------
 * Small top-right status overlay for one reader page while TR is running.
 * Scanning / OCR pulses ScanText, AI translation pulses Languages, finished
 * pages show Languages + CircleCheck, and failures expose a retry button.
 * ---------------------------------------------------------------------------
 */

import {
  CircleAlert,
  CircleCheck,
  Languages,
  RefreshCw,
  ScanText,
} from "lucide-react-native";
import { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";

import type { PageTranslationState } from "@/services/translation/translation.types";

interface PageTrStatusBadgeProps {
  stage: PageTranslationState["stage"] | undefined;
  active: boolean;
  onRetry: () => void;
}

export default function PageTrStatusBadge({
  stage,
  active,
  onRetry,
}: PageTrStatusBadgeProps) {
  const running = stage === "queued" || stage === "detect" || stage === "ocr" || stage === "translate";
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!running) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, running]);

  if (!active || !stage || stage === "skipped") return null;

  const error = stage === "error";
  const done = stage === "done";
  const translating = stage === "translate";
  const label = error
    ? "Failed"
    : done
      ? "Translated"
      : translating
        ? "Translating"
        : "Reading";
  const Icon = translating || done ? Languages : ScanText;

  const retry = (event: GestureResponderEvent) => {
    event.stopPropagation();
    console.log("[reader][page status] retry pressed", { stage });
    onRetry();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[
          styles.badge,
          error && styles.badgeError,
          done && styles.badgeDone,
        ]}
        pointerEvents={error ? "auto" : "none"}
      >
        {error ? (
          <CircleAlert color="#f87171" size={13} />
        ) : (
          <Animated.View style={{ opacity: pulse }}>
            <Icon color={done ? "#34d399" : "#38bdf8"} size={13} />
          </Animated.View>
        )}
        <Text
          style={[styles.label, error && styles.labelError, done && styles.labelDone]}
        >
          {label}
        </Text>
        {done ? <CircleCheck color="#34d399" size={13} /> : null}
        {error ? (
          <Pressable onPress={retry} hitSlop={8} style={styles.retryButton}>
            <RefreshCw color="#fca5a5" size={12} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 45,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(56,189,248,0.45)",
    backgroundColor: "rgba(8,12,20,0.78)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDone: {
    borderColor: "rgba(52,211,153,0.5)",
  },
  badgeError: {
    borderColor: "rgba(248,113,113,0.55)",
    backgroundColor: "rgba(40,8,12,0.84)",
  },
  label: {
    color: "#7dd3fc",
    fontSize: 10,
    fontWeight: "800",
  },
  labelDone: { color: "#6ee7b7" },
  labelError: { color: "#fca5a5" },
  retryButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(248,113,113,0.18)",
    marginLeft: 1,
  },
});
