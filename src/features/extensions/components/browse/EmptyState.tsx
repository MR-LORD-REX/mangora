import { Languages } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@shared/theme";

import { browseStyles as styles } from "./BrowseStyles";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}

/** Shared empty state for the browse tabs. */
export default function EmptyState({
  title,
  body,
  action,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Languages color={colors.textFaint} size={22} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}