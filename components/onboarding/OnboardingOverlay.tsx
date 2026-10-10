/**
 * OnboardingOverlay.tsx
 * ---------------------------------------------------------------------------
 * First-launch guide carousel shown over the Library.
 *
 * Content comes from `constants/onboardingGuides.ts`; completion is tracked per
 * guide id in settings, so adding a new guide automatically brings the overlay
 * back for users who have not seen it. Dismissing early opens a second dialog
 * with "Remind me later" / "Close forever".
 * ---------------------------------------------------------------------------
 */

import * as WebBrowser from "expo-web-browser";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import OnboardingExitConfirm from "@/components/onboarding/OnboardingExitConfirm";
import {
  ONBOARDING_GUIDES,
  type OnboardingGuide,
} from "@/constants/onboardingGuides";
import { colors, radius } from "@/constants/theme";
import {
  firstUnseenGuideIndex,
  shouldShowOnboarding,
  snoozeOnboardingForSession,
} from "@/services/onboarding/onboardingState";
import { getSettings, updateSettings } from "@/services/settings/settingsStore";

const CARD_PADDING = 20;
const PAGE_HEIGHT = 360;

export default function OnboardingOverlay() {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 32, 400);
  const pageWidth = cardWidth - CARD_PADDING * 2;

  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [exitOpen, setExitOpen] = useState(false);
  const listRef = useRef<FlatList<OnboardingGuide>>(null);

  // Gate on the persisted onboarding state once per mount.
  useEffect(() => {
    let active = true;
    getSettings()
      .then((settings) => {
        if (!active || !shouldShowOnboarding(settings)) return;
        setSeen(new Set(settings.onboardingSeenGuideIds));
        setIndex(firstUnseenGuideIndex(settings));
        setVisible(true);
      })
      .catch((error) =>
        console.warn("Failed to read onboarding state:", error),
      );
    return () => {
      active = false;
    };
  }, []);

  // A guide counts as seen as soon as it is shown, so "Remind me later"
  // resumes at the next unseen guide next launch.
  useEffect(() => {
    if (!visible) return;
    const guide = ONBOARDING_GUIDES[index];
    if (!guide) return;
    setSeen((prev) => {
      if (prev.has(guide.id)) return prev;
      const next = new Set(prev);
      void updateSettings({ onboardingSeenGuideIds: [...next] }).catch(
        console.error,
      );
      return next;
    });
  }, [index, visible]);

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), ONBOARDING_GUIDES.length - 1);
    setIndex(clamped);
    listRef.current?.scrollToOffset({
      offset: clamped * pageWidth,
      animated: true,
    });
  };

  const openGuide = async (guide: OnboardingGuide) => {
    try {
      await WebBrowser.openBrowserAsync(guide.link);
    } catch (error) {
      console.warn("Failed to open onboarding link:", error);
    }
    if (index < ONBOARDING_GUIDES.length - 1) {
      goTo(index + 1);
    }
  };

  const allSeen = ONBOARDING_GUIDES.every((guide) => seen.has(guide.id));

  const requestClose = () => {
    if (allSeen) {
      setVisible(false);
      return;
    }
    setExitOpen(true);
  };

  const remindLater = () => {
    snoozeOnboardingForSession();
    setExitOpen(false);
    setVisible(false);
  };

  const closeForever = () => {
    void updateSettings({ onboardingDismissedForever: true }).catch(
      console.error,
    );
    setExitOpen(false);
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  const isLast = index === ONBOARDING_GUIDES.length - 1;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <View style={styles.scrim}>
        <View style={[styles.card, { width: cardWidth }]}>
          <View style={styles.topBar}>
            <Text style={styles.counter}>
              Guide {index + 1} of {ONBOARDING_GUIDES.length}
            </Text>
            <Pressable
              onPress={requestClose}
              hitSlop={12}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close guides"
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <FlatList
            ref={listRef}
            data={ONBOARDING_GUIDES}
            keyExtractor={(guide) => guide.id}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, itemIndex) => ({
              length: pageWidth,
              offset: pageWidth * itemIndex,
              index: itemIndex,
            })}
            style={{ width: pageWidth, height: PAGE_HEIGHT }}
            onMomentumScrollEnd={(event) => {
              const next = Math.round(
                event.nativeEvent.contentOffset.x / pageWidth,
              );
              setIndex(
                Math.min(Math.max(next, 0), ONBOARDING_GUIDES.length - 1),
              );
            }}
            renderItem={({ item }) => (
              <GuidePage
                guide={item}
                width={pageWidth}
                onOpenGuide={openGuide}
              />
            )}
          />

          <View style={styles.dots}>
            {ONBOARDING_GUIDES.map((guide, dotIndex) => (
              <Pressable
                key={guide.id}
                onPress={() => goTo(dotIndex)}
                hitSlop={8}
                style={[styles.dot, dotIndex === index && styles.dotActive]}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${guide.title}`}
              />
            ))}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={() => goTo(index - 1)}
              disabled={index === 0}
              style={({ pressed }) => [
                styles.navGhost,
                index === 0 && styles.navDisabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <ChevronLeft size={16} color={colors.textMuted} />
              <Text style={styles.navGhostText}>Previous</Text>
            </Pressable>

            <Pressable
              onPress={() => (isLast ? setVisible(false) : goTo(index + 1))}
              style={({ pressed }) => [
                styles.navPrimary,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.navPrimaryText}>
                {isLast ? "Done" : "Next"}
              </Text>
              {isLast ? null : (
                <ChevronRight size={16} color={colors.onAccent} />
              )}
            </Pressable>
          </View>
        </View>

        <OnboardingExitConfirm
          visible={exitOpen}
          onRemindLater={remindLater}
          onCloseForever={closeForever}
        />
      </View>
    </Modal>
  );
}

interface GuidePageProps {
  guide: OnboardingGuide;
  width: number;
  onOpenGuide: (guide: OnboardingGuide) => void;
}

function GuidePage({ guide, width, onOpenGuide }: GuidePageProps) {
  const Icon = guide.icon;

  return (
    <View style={[styles.page, { width }]}>
      <View style={[styles.iconBadge, { backgroundColor: guide.accentSoft }]}>
        <Icon size={26} color={guide.accent} />
      </View>

      <Text style={styles.title}>{guide.title}</Text>
      <Text style={styles.body}>{guide.body}</Text>

      <View style={styles.bullets}>
        {guide.highlights?.map((highlight) => (
          <View key={highlight} style={styles.bulletRow}>
            <Check size={14} color={guide.accent} />
            <Text style={styles.bulletText}>{highlight}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => onOpenGuide(guide)}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: guide.accent },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{guide.ctaLabel}</Text>
        <ExternalLink size={15} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(4,6,10,0.86)",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: CARD_PADDING,
    paddingTop: 14,
    paddingBottom: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counter: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceHigh,
  },
  page: { height: PAGE_HEIGHT, paddingTop: 8 },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 14,
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  bullets: { marginTop: 14, gap: 8, flex: 1 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bulletText: { color: colors.text, fontSize: 13.5, flex: 1 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  ctaText: { color: colors.onAccent, fontWeight: "800", fontSize: 14.5 },
  linkHint: {
    color: colors.textFaint,
    fontSize: 10.5,
    textAlign: "center",
    marginTop: 8,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { width: 20, backgroundColor: colors.accent },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  navGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  navGhostText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  navDisabled: { opacity: 0.35 },
  navPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  navPrimaryText: { color: colors.onAccent, fontWeight: "800", fontSize: 14.5 },
  pressed: { opacity: 0.75 },
});