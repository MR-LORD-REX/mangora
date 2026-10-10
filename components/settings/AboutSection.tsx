/**
 * AboutSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> About: branding, version and the outbound links. Every URL in
 * LINKS is a placeholder; replace them when the public pages exist.
 * ---------------------------------------------------------------------------
 */

import Constants from "expo-constants";
import * as Linking from "expo-linking";
import {
  Globe,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";

import { colors, radius } from "@/constants/theme";

import { SettingsRow, SettingsSection } from "./SettingsPrimitives";

/** Placeholder destinations - swap for the real ones later. */
const LINKS = {
  whatsNew: "https://example.com/mangora/whats-new",
  privacy: "https://example.com/mangora/privacy",
  telegram: "https://t.me/MangoraApp",
  reddit: "https://www.reddit.com/r/mangora",
  github: "https://github.com/MR-LORD-REX/mangora",
  discord: "https://discord.gg/ZWfMtkRTFR",
};

const SOCIALS: {
  key: string;
  label: string;
  icon: "telegram" | "reddit-alien" | "github" | "discord";
  url: string;
}[] = [
  { key: "telegram", label: "Telegram", icon: "telegram", url: LINKS.telegram },
  { key: "reddit", label: "Reddit", icon: "reddit-alien", url: LINKS.reddit },
  { key: "github", label: "GitHub", icon: "github", url: LINKS.github },
  { key: "discord", label: "Discord", icon: "discord", url: LINKS.discord },
];

export default function AboutSection({ standalone }: { standalone?: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const version = Constants.expoConfig?.version ?? "1.0.0";

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setNotice("That link could not be opened.");
    }
  };

  return (
    <SettingsSection title="About" icon={Info} standalone={standalone}>
      <View style={styles.brand}>
        <Image
          source={require("@/assets/icons/appLogo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>Mangora</Text>
        <Text style={styles.version}>Version {version}</Text>
      </View>

      <SettingsRow
        icon={RefreshCw}
        title="Check for updates"
        subtitle="GitHub release checks land in a later build."
        right={<Text style={styles.link}>Check</Text>}
        onPress={() =>
          setNotice("Update checks are not wired to GitHub releases yet.")
        }
      />
      <SettingsRow
        icon={Sparkles}
        title="What's new"
        subtitle="Release notes and the latest additions."
        right={<Globe color={colors.textFaint} size={16} />}
        onPress={() => void open(LINKS.whatsNew)}
      />
      <SettingsRow
        icon={ShieldCheck}
        title="Privacy policy"
        subtitle="How the app handles your data."
        right={<Globe color={colors.textFaint} size={16} />}
        onPress={() => void open(LINKS.privacy)}
        last
      />

      <View style={styles.socials}>
        {SOCIALS.map(({ key, label, icon, url }) => (
          <Pressable
            key={key}
            accessibilityLabel={label}
            onPress={() => void open(url)}
            style={({ pressed }) => [styles.social, pressed && styles.pressed]}
          >
            <FontAwesome5 brand name={icon} color={colors.textMuted} size={20} />
          </Pressable>
        ))}
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", paddingTop: 20, paddingBottom: 14 },
  logo: { width: 88, height: 88 },
  appName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },
  version: { color: colors.textFaint, fontSize: 12, marginTop: 3 },
  link: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  socials: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 16,
  },
  social: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  notice: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
