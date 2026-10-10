/**
 * AboutSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> About: branding, version, the in-app updater (plan S14.4) and
 * the outbound links to the public site and community.
 * ---------------------------------------------------------------------------
 */

import { FontAwesome5 } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import {
  FlaskConical,
  Globe,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  SettingsRow,
  SettingsSection,
  ToggleRow,
} from "@/components/settings/SettingsPrimitives";
import { useAppSettings } from "@/components/settings/useAppSettings";
import { colors, radius } from "@/constants/theme";
import { SITE_ORIGIN } from "@/services/deeplink";
import {
  checkForUpdate,
  currentVersion,
  downloadUpdate,
  installPermissionState,
  installUpdate,
  openDownloadPage,
  openInstallSettings,
  type AvailableUpdate,
  type DownloadProgress,
} from "@/services/updates";

const LINKS = {
  whatsNew: `${SITE_ORIGIN}/whats-new`,
  privacy: `${SITE_ORIGIN}/privacy`,
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

type UpdatePhase =
  | "idle"
  | "checking"
  | "uptodate"
  | "available"
  | "permission"
  | "downloading"
  | "error";

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const mb = value / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export default function AboutSection({ standalone }: { standalone?: boolean }) {
  const { settings, update } = useAppSettings();
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [updateInfo, setUpdateInfo] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>({
    written: 0,
    total: 0,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const pendingInstall = useRef(false);

  const version = Constants.expoConfig?.version ?? "1.0.0";
  const includePrereleases = settings?.updateIncludePrereleases ?? false;

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setNotice("That link could not be opened.");
    }
  };

  const startDownload = useCallback(async () => {
    if (!updateInfo) return;
    setNotice(null);
    setPhase("downloading");
    setProgress({ written: 0, total: updateInfo.apk?.size ?? 0 });
    try {
      const outcome = await downloadUpdate(updateInfo, setProgress);
      if (!outcome.verified) {
        setPhase("error");
        setNotice("The update failed its integrity check and was not installed.");
        return;
      }
      setPhase("idle");
      setNotice(`Installing ${updateInfo.version}…`);
      await installUpdate(outcome.file);
    } catch (error) {
      setPhase("error");
      setNotice(
        error instanceof Error ? error.message : "The update could not be downloaded.",
      );
    }
  }, [updateInfo]);

  const check = useCallback(async () => {
    setNotice(null);
    setPhase("checking");
    try {
      const result = await checkForUpdate({ includePrereleases });
      if (result.update) {
        setUpdateInfo(result.update);
        setPhase("available");
      } else {
        setUpdateInfo(null);
        setPhase("uptodate");
        setNotice(`You are on the latest version (${currentVersion()}).`);
      }
    } catch (error) {
      setPhase("error");
      setNotice(error instanceof Error ? error.message : "Update check failed.");
    }
  }, [includePrereleases]);

  const install = useCallback(async () => {
    const state = await installPermissionState();
    if (state === "unsupported") {
      await openDownloadPage();
      return;
    }
    if (state === "denied") {
      pendingInstall.current = true;
      setPhase("permission");
      setNotice("Allow Mangora to install updates, then return to the app.");
      await openInstallSettings();
      return;
    }
    await startDownload();
  }, [startDownload]);

  // Re-check the install permission when the user returns from system settings.
  useEffect(() => {
    if (phase !== "permission") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !pendingInstall.current) return;
      pendingInstall.current = false;
      void (async () => {
        const next = await installPermissionState();
        if (next === "granted") {
          await startDownload();
        } else {
          setPhase("error");
          setNotice(
            "Install permission was not granted. Opening the download page instead.",
          );
          await openDownloadPage();
        }
      })();
    });
    return () => subscription.remove();
  }, [phase, startDownload]);

  const busy = phase === "checking" || phase === "downloading";
  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.written / progress.total) * 100))
      : 0;

  const subtitle = (() => {
    switch (phase) {
      case "checking":
        return "Checking GitHub for a newer build…";
      case "available":
        return updateInfo
          ? `Version ${updateInfo.version} is available.`
          : "An update is available.";
      case "permission":
        return "Waiting for the install permission…";
      case "downloading":
        return `Downloading ${formatBytes(progress.written)}${
          progress.total ? ` of ${formatBytes(progress.total)}` : ""
        }…`;
      case "uptodate":
        return "You are running the newest build.";
      case "error":
        return "The last update attempt did not finish.";
      default:
        return "Compare with the latest GitHub release.";
    }
  })();

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
        subtitle={subtitle}
        right={
          busy ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={styles.link}>
              {phase === "available" ? "Update" : "Check"}
            </Text>
          )
        }
        onPress={busy ? undefined : phase === "available" ? install : check}
      />

      {phase === "available" && updateInfo ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {updateInfo.name || `Version ${updateInfo.version}`}
            {updateInfo.prerelease ? "  (beta)" : ""}
          </Text>
          {updateInfo.notes ? (
            <Text style={styles.panelNotes} numberOfLines={5}>
              {updateInfo.notes.trim()}
            </Text>
          ) : null}
          <View style={styles.panelActions}>
            <Pressable
              onPress={() => void install()}
              style={({ pressed }) => [styles.bigBtn, pressed && styles.pressed]}
            >
              <Text style={styles.bigBtnText}>
                Install {formatBytes(updateInfo.apk?.size ?? 0)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void open(`${SITE_ORIGIN}/whats-new/${updateInfo.version}`)}
              style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
            >
              <Text style={styles.ghostBtnText}>Release notes</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {phase === "downloading" ? (
        <View style={styles.panel}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {percent}%  ·  {formatBytes(progress.written)}
          </Text>
        </View>
      ) : null}

      <ToggleRow
        icon={FlaskConical}
        title="Include beta releases"
        subtitle="Offer prerelease builds while checking for updates."
        value={includePrereleases}
        onChange={(value) => {
          update({ updateIncludePrereleases: value });
          setPhase("idle");
        }}
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
  panel: {
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: -2,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  panelTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  panelNotes: {
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 6,
  },
  panelActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  bigBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  bigBtnText: { color: colors.onAccent, fontSize: 13.5, fontWeight: "800" },
  ghostBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  ghostBtnText: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  progressTrack: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  progressFill: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
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