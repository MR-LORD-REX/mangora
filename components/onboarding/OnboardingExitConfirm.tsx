/**
 * OnboardingExitConfirm.tsx
 * ---------------------------------------------------------------------------
 * Second-step dialog shown when the onboarding overlay is dismissed before the
 * user has seen every guide. Rendered inside the overlay's own Modal so the two
 * layers never fight over presentation.
 * ---------------------------------------------------------------------------
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";

interface OnboardingExitConfirmProps {
  visible: boolean;
  /** Hide the overlay until the next app launch. */
  onRemindLater: () => void;
  /** Never show onboarding guides again. */
  onCloseForever: () => void;
}

export default function OnboardingExitConfirm({
  visible,
  onRemindLater,
  onCloseForever,
}: OnboardingExitConfirmProps) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        <Text style={styles.title}>Skip the guides?</Text>
        <Text style={styles.body}>
          You have not seen every guide yet. Catch up later, or turn these tips
          off for good.
        </Text>

        <Pressable
          onPress={onRemindLater}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Remind me later</Text>
        </Pressable>

        <Pressable
          onPress={onCloseForever}
          style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Close forever</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { color: colors.onAccent, fontWeight: "800", fontSize: 14.5 },
  ghost: {
    marginTop: 6,
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  pressed: { opacity: 0.75 },
});