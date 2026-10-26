import { Blocks, Download, Trash2 } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import type {
  ExtensionCatalogEntry,
  InstalledExtensionRecord,
} from "@platform/extensions/types";
import { colors } from "@shared/theme";
import { imageSourceForUrl } from "@/utils/reader/imageHeaders";

import { browseStyles as styles } from "./BrowseStyles";

function sourceLanguages(extension: ExtensionCatalogEntry): string[] {
  return Array.from(new Set(extension.sources.map((source) => source.language)));
}

interface ExtensionCatalogRowProps {
  item: ExtensionCatalogEntry;
  record?: InstalledExtensionRecord;
  label: string;
  busy: boolean;
  percent: number;
  onInstall: (extension: ExtensionCatalogEntry) => void;
  onRequestUninstall: (packageName: string, extensionName: string) => void;
}

/** Repository catalog card with install, update and uninstall actions. */
export const ExtensionCatalogRow = React.memo(function ExtensionCatalogRow({
  item,
  record,
  label,
  busy,
  percent,
  onInstall,
  onRequestUninstall,
}: ExtensionCatalogRowProps) {
  const installedNow = label === "Installed";
  const hasInstalledRecord = record != null;
  const nsfw =
    record?.nsfw || item.contentWarning?.toUpperCase().includes("NSFW");

  return (
    <View style={styles.extensionCard}>
      {item.resources.iconUrl ? (
        <Image
          source={imageSourceForUrl(item.resources.iconUrl)}
          style={styles.extensionIcon}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.extensionIcon, styles.extensionIconEmpty]}>
          <Blocks color={colors.accent} size={22} />
        </View>
      )}
      <View style={styles.extensionBody}>
        <View style={styles.extensionTitleRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {nsfw ? (
            <View style={styles.matureChip}>
              <Text style={styles.matureText}>18+</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          v{item.versionName || item.versionCode} {"\u00b7"} {item.sources.length} source
          {item.sources.length === 1 ? "" : "s"} {"\u00b7"}{" "}
          {sourceLanguages(item)
            .map((value) => value.toUpperCase())
            .join(", ")}
        </Text>
        <View style={styles.extensionFooter}>
          <View style={styles.extensionStatus}>
            {record?.error ? (
              <Text style={styles.errorText} numberOfLines={2}>
                {record.error}
              </Text>
            ) : (
              <Text style={styles.sourcePreview} numberOfLines={1}>
                {item.sources.map((source) => source.name).join(" \u00b7 ")}
              </Text>
            )}
          </View>
          <Pressable
            disabled={busy}
            onPress={() =>
              installedNow
                ? onRequestUninstall(item.packageName, item.name)
                : onInstall(item)
            }
            style={({ pressed }) => [
              styles.installButton,
              installedNow && styles.uninstallButton,
              busy && styles.busyButton,
              pressed && !busy && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : installedNow ? (
              <Trash2 color={colors.danger} size={16} />
            ) : (
              <Download color={colors.onAccent} size={16} />
            )}
            <Text
              style={[
                styles.installLabel,
                installedNow && styles.uninstallLabel,
              ]}
            >
              {busy ? `${percent}%` : installedNow ? "Uninstall" : label}
            </Text>
          </Pressable>
          {hasInstalledRecord && !installedNow ? (
            <Pressable
              accessibilityLabel={`Uninstall ${item.name}`}
              disabled={busy}
              onPress={() => onRequestUninstall(item.packageName, item.name)}
              style={({ pressed }) => [
                styles.installButton,
                styles.uninstallButton,
                busy && styles.busyButton,
                pressed && !busy && styles.pressed,
              ]}
            >
              <Trash2 color={colors.danger} size={16} />
              <Text style={[styles.installLabel, styles.uninstallLabel]}>
                Uninstall
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
});