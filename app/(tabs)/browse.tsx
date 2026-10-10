import { Link, type Href } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { colors, providerAccent, radius, shadows } from "@/constants/theme";
import {
  getSettings,
  subscribeSettings,
  updateSettings,
} from "@/services/settings/settingsStore";

const MATURE_PROVIDERS: Record<string, boolean> = {
  nh: true,
  manhwa18: true,
};

const PROVIDER_ICONS: Record<string, ImageSourcePropType> = {
  mangadex: require("@/assets/icons/providers/mangadex.png"),
  mangakatana: require("@/assets/icons/providers/mangakatana.png"),
  manhwa18: require("@/assets/icons/providers/manhwa18.png"),
  mgeko: require("@/assets/icons/providers/mgeko.png"),
  comix: require("@/assets/icons/providers/comix.png"),
  nh: require("@/assets/icons/providers/nh.png"),
};

const SOURCES: {
  name: string;
  provider: string;
  tagline: string;
  href: string;
}[] = [
  {
    name: "MangaDex",
    provider: "mangadex",
    tagline: "The largest manga library",
    href: "/(mangadex)/main",
  },
  {
    name: "MangaKatana",
    provider: "mangakatana",
    tagline: "Official scanlation aggregator",
    href: "/(mangakatana)/main",
  },
  {
    name: "Manhwa18",
    provider: "manhwa18",
    tagline: "Manhwa & webtoons",
    href: "/(manhwa18)/main",
  },
  {
    name: "MangaGeko",
    provider: "mgeko",
    tagline: "Manga, manhwa & webtoons",
    href: "/(mgeko)/main",
  },
  {
    name: "Comix",
    provider: "comix",
    tagline: "Webtoons & scanlation hub",
    href: "/(comix)/main",
  },
  {
    name: "BrainRot",
    provider: "brainrot",
    tagline: "Comics & webtoons",
    href: "/(brainrot)/main",
  },
  {
    name: "Philia Scans",
    provider: "philia",
    tagline: "Manga, manhwa & webtoons",
    href: "/(philia)/main",
  },

  {
    name: "NHentai",
    provider: "nh",
    tagline: "Doujinshi gallery",
    href: "/(nh)/main",
  },
];

export default function BrowseScreen() {
  const [safeMode, setSafeMode] = useState(true);

  useEffect(() => {
    let active = true;
    getSettings().then((settings) => {
      if (active) setSafeMode(settings.safeMode);
    });
    const unsubscribe = subscribeSettings((settings) => {
      setSafeMode(settings.safeMode);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const visibleSources = useMemo(
    () =>
      safeMode
        ? SOURCES.filter((source) => !MATURE_PROVIDERS[source.provider])
        : SOURCES,
    [safeMode],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Browse</Text>
          <Text style={styles.subtitle}>Pick a source to explore</Text>
        </View>
        <View style={styles.safeModeControl}>
          <Text style={styles.safeModeLabel}>Safe mode</Text>
          <Switch
            value={safeMode}
            onValueChange={(value) => {
              setSafeMode(value);
              updateSettings({ safeMode: value }).catch(console.error);
            }}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={colors.text}
            accessibilityLabel="Safe mode"
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {visibleSources.map((source) => {
          const accent = providerAccent[source.provider];
          return (
            <Link key={source.name} href={source.href as Href} asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                ]}
              >
                <View className="flex-row items-center gap-2">
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: `${accent}22` },
                    ]}
                  >
                    {PROVIDER_ICONS[source.provider] ? (
                      <Image
                        source={PROVIDER_ICONS[source.provider]}
                        style={styles.providerIcon}
                      />
                    ) : (
                      <Text style={[styles.providerInitial, { color: accent }]}>
                        {source.name.charAt(0)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{source.name}</Text>
                    <Text style={styles.cardTagline}>{source.tagline}</Text>
                  </View>
                  <View style={[styles.chevron, { backgroundColor: accent }]}>
                    <ArrowRight color={colors.onAccent} size={18} />
                  </View>
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
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  safeModeControl: {
    marginLeft: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  safeModeLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  title: { color: colors.text, fontSize: 30, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  list: { padding: 16, paddingTop: 30, gap: 12, paddingBottom: 130 },
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
  providerIcon: { width: 34, height: 34, resizeMode: "contain" },
  providerInitial: { fontSize: 24, fontWeight: "800" },
  cardInfo: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  cardTagline: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
