import { Pin, Trash2 } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import type { InstalledExtensionRecord } from "@platform/extensions/types";
import { colors } from "@shared/theme";

import { browseStyles as styles } from "./BrowseStyles";

type InstalledSource = InstalledExtensionRecord["sources"][number];

export function sourceLanguageLabel(lang: string): string {
  if (lang === "en") return "English";
  if (lang === "all" || lang === "multi") return "Multi";
  return lang.toUpperCase();
}

interface SourceListRowProps {
  source: InstalledSource;
  extensionName: string;
  packageName: string;
  nsfw: boolean;
  pinned: boolean;
  recentlyUsed: boolean;
  onOpen: (sourceId: string) => void;
  onTogglePin: (sourceId: string) => void;
  onRemoveFromRecent: (sourceId: string) => void;
  onRequestUninstall: (packageName: string, extensionName: string) => void;
}

/** Installed source row with pin and uninstall/remove swipe actions. */
export const SourceListRow = React.memo(function SourceListRow({
  source,
  extensionName,
  packageName,
  nsfw,
  pinned,
  onOpen,
  onTogglePin,
  onRemoveFromRecent,
  onRequestUninstall,
  recentlyUsed,
}: SourceListRowProps) {
  const row = (
    <Pressable
      onPress={() => onOpen(source.id)}
      style={({ pressed }) => [styles.sourceRow, pressed && styles.pressed]}
    >
      <View style={styles.sourceIcon}>
        <Text style={styles.sourceInitial}>
          {source.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{source.name}</Text>
        <Text style={styles.rowMeta}>
          {sourceLanguageLabel(source.lang)} {"\u00b7"} {extensionName}
        </Text>
      </View>
      {nsfw ? (
        <View style={styles.matureChip}>
          <Text style={styles.matureText}>18+</Text>
        </View>
      ) : null}
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onTogglePin(source.id);
        }}
        hitSlop={10}
        accessibilityLabel={pinned ? "Unpin source" : "Pin source"}
        style={({ pressed }) => [styles.pinButton, pressed && styles.pressed]}
      >
        <Pin
          color={pinned ? colors.accent : colors.textFaint}
          fill={pinned ? colors.accent : "transparent"}
          size={18}
        />
      </Pressable>
    </Pressable>
  );

  return (
    <Swipeable
      overshootRight={false}
      rightThreshold={50}
      renderRightActions={() => (
        <View style={styles.sourceSwipeActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Uninstall ${extensionName}`}
            onPress={() => onRequestUninstall(packageName, extensionName)}
            style={({ pressed }) => [
              styles.sourceUninstallAction,
              pressed && styles.pressed,
            ]}
          >
            <Trash2 color={colors.onAccent} size={18} />
            <Text style={styles.recentDeleteText}>Uninstall</Text>
          </Pressable>
          {recentlyUsed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${source.name} from last used sources`}
              onPress={() => onRemoveFromRecent(source.id)}
              style={({ pressed }) => [
                styles.recentDeleteAction,
                pressed && styles.pressed,
              ]}
            >
              <Trash2 color={colors.onAccent} size={18} />
              <Text style={styles.recentDeleteText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    >
      {row}
    </Swipeable>
  );
});