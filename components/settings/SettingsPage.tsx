/**
 * SettingsPage.tsx
 * ---------------------------------------------------------------------------
 * Full-screen shell for one Settings section: back arrow, title, optional
 * subtitle and a scrollable body. Keeps every sub-page identical in layout.
 * ---------------------------------------------------------------------------
 */

import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";

export default function SettingsPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  pressed: { opacity: 0.6 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 },
  content: { paddingTop: 2 },
});