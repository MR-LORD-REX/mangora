/**
 * settings.tsx
 * ---------------------------------------------------------------------------
 * Settings tab: a landing list of sections. Each row opens its own page under
 * `app/settings/`, mirroring how the Browse tab lists sources.
 * ---------------------------------------------------------------------------
 */

import { Link, type Href } from "expo-router";
import {
  Download,
  HardDrive,
  Info,
  Languages,
  ListChecks,
  ScanText,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, shadows } from "@/constants/theme";
import { getDownloadSnapshot, subscribeDownloads } from "@/services/downloader";

interface SettingsEntry {
  key: string;
  title: string;
  tagline: string;
  icon: LucideIcon;
  accent: string;
  href: string;
}

const ENTRIES: SettingsEntry[] = [
  {
    key: "downloads",
    title: "Downloads",
    tagline: "Wi-Fi only, queue limits and stored chapters",
    icon: Download,
    accent: "#8faeff",
    href: "/settings/downloads",
  },
  {
    key: "storage",
    title: "Data and storage",
    tagline: "Storage folder, backups and space usage",
    icon: HardDrive,
    accent: "#63d2a4",
    href: "/settings/storage",
  },
  {
    key: "queue",
    title: "Download queue",
    tagline: "Live progress and queue controls",
    icon: ListChecks,
    accent: "#ffb86b",
    href: "/settings/queue",
  },
  {
    key: "translation",
    title: "Translation",
    tagline: "Gemini key and the translated-page cache",
    icon: Languages,
    accent: "#c084fc",
    href: "/settings/translation",
  },
  {
    key: "ocr-models",
    title: "OCR models",
    tagline: "Download on-device recognition for your languages",
    icon: ScanText,
    accent: "#7dd3fc",
    href: "/settings/ocr-models",
  },
  {
    key: "about",
    title: "About",
    tagline: "Version, links and community",
    icon: Info,
    accent: "#ff8ac2",
    href: "/settings/about",
  },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const snapshot = getDownloadSnapshot();
      setQueueCount(snapshot.runningCount + snapshot.pendingCount);
    };
    update();
    return subscribeDownloads(update);
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Configure how Mangora works</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {ENTRIES.map((entry) => {
          const Icon = entry.icon;
          const badge =
            entry.key === "queue" && queueCount > 0
              ? `${queueCount} active`
              : null;
          return (
            <Link key={entry.key} href={entry.href as Href} asChild>
              <Pressable
                accessibilityLabel={entry.title}
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                ]}
              >
                <View
                  style={[
                    styles.iconRow,
                  ]}
                > 
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: `${entry.accent}22` },
                    ]}
                  >
                    <Icon color={entry.accent} size={24} />
                  </View>
                  <Text style={styles.cardTitle}>{entry.title}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.cardTitleRow}>
                    
                    {badge ? (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: `${entry.accent}26` },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: entry.accent }]}>
                          {badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardTagline}>{entry.tagline}</Text>
                </View>
              </Pressable>
            </Link>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 10 },
  title: { color: colors.text, fontSize: 30, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  list: { padding: 16, paddingTop: 20, gap: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    ...shadows.card,
  },
  cardPressed: { opacity: 0.75 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  cardTagline: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
