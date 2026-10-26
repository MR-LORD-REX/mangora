import React, { useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { ArrowLeft, MoreVertical, Search, X } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import { colors } from "@shared/theme";
import MenuSheet, { type MenuOption } from "@shared/ui/overlays/MenuSheet";
import { headerStyles as styles } from "./headerStyles";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface HeaderIconAction {
  key: string;
  label?: string;
  badge?: number;
  icon: LucideIcon;
  active?: boolean;
  onPress: () => void;
}

export interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  searchPlaceholder?: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** Receives the current field text so callers never read stale state. */
  onSearchSubmit?: (query: string) => void;
  /** Icons shown between the search toggle and the overflow menu. */
  actions?: HeaderIconAction[];
  /** Options shown in the three-dot overflow menu. */
  menuActions?: MenuOption[];
  menuTitle?: string;
  accent?: string;
  showMenu?: boolean;
}

/**
 * Expandable app bar: shows the screen title by default; tapping the search
 * icon slides a search input in while the title fades/collapses away.
 */
export default function AppHeader({
  title,
  onBack,
  searchPlaceholder = "Search",
  query,
  onQueryChange,
  onSearchSubmit,
  actions = [],
  menuActions = [],
  menuTitle,
  accent = colors.accent,
  showMenu = true,
}: AppHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  const animateLayout = () => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
  };

  const openSearch = () => {
    animateLayout();
    setSearchOpen(true);
    translateX.setValue(28);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    setTimeout(() => inputRef.current?.focus(), 160);
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    animateLayout();
    setSearchOpen(false);
    if (query) onQueryChange("");
  };

  const onBackPress = () => {
    if (searchOpen) {
      closeSearch();
      return;
    }
    onBack?.();
  };

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBackPress}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <ArrowLeft color={colors.text} size={24} />
          </Pressable>
        ) : null}

        {searchOpen ? (
          <Animated.View style={[styles.searchArea, { transform: [{ translateX }] }]}>
            <Search size={18} color={colors.textFaint} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={onQueryChange}
              onSubmitEditing={() => {
                Keyboard.dismiss();
                onSearchSubmit?.(query.trim());
              }}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textFaint}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </Animated.View>
        ) : (
          <Animated.View style={styles.titleWrap}>
            <Text style={[styles.title, { color: accent }]} numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
        )}

        {!searchOpen ? (
          <Pressable
            onPress={openSearch}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Search color={colors.textMuted} size={22} />
          </Pressable>
        ) : null}

        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.label ?? action.key}
              accessibilityState={{ selected: Boolean(action.active) }}
              onPress={action.onPress}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconBtn,
                action.active && styles.iconBtnActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon color={action.active ? accent : colors.textMuted} size={22} />
              {action.badge && action.badge > 0 ? (
                <View
                  pointerEvents="none"
                  style={[styles.actionBadge, { backgroundColor: accent }]}
                >
                  <Text style={styles.actionBadgeText}>
                    {action.badge > 99 ? "99+" : action.badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        {searchOpen ? (
          <Pressable
            onPress={closeSearch}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <X color={colors.textMuted} size={22} />
          </Pressable>
        ) : null}

        {showMenu && menuActions.length > 0 ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <MoreVertical color={colors.textMuted} size={22} />
          </Pressable>
        ) : null}
      </View>

      <MenuSheet
        visible={menuOpen}
        title={menuTitle}
        options={menuActions}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

