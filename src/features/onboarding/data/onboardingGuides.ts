/**
 * onboardingGuides.ts
 * ---------------------------------------------------------------------------
 * Data-driven onboarding guides shown over the Library on first launch.
 *
 * Adding a guide is a one-file change: append an entry here and every user who
 * has not seen its `id` gets the overlay again (see
 * `domain/onboardingState.ts`). Never rename an `id` once shipped
 * - it is the key persisted in settings.
 * ---------------------------------------------------------------------------
 */

import {
  BookOpen,
  KeyRound,
  Share2,
  Send,
  type LucideIcon,
} from "lucide-react-native";

import { colors } from "@shared/theme";

export interface OnboardingGuide {
  /** Stable persisted id. Renaming it re-shows the guide to everyone. */
  id: string;
  title: string;
  body: string;
  /** Up to three short supporting points. */
  highlights?: string[];
  icon: LucideIcon;
  /** Accent used for the badge, bullets and CTA of this guide. */
  accent: string;
  /** Soft accent used for the icon badge background. */
  accentSoft: string;
  ctaLabel: string;
  /** Destination opened by the CTA button. */
  link: string;
}

/**
 * Placeholder destinations - swap in the real links when they are ready.
 * Kept here so the overlay UI never changes when links move.
 */
export const ONBOARDING_PLACEHOLDER_LINKS = {
  telegram: "https://t.me/MangoraApp",
  readerGuide: "https://t.me/c/4408464732/8",
  geminiSetup: "https://t.me/c/4408464732/11",
  deeplinkSetup: "https://t.me/MangoraApp/34",
} as const;

export const ONBOARDING_GUIDES: OnboardingGuide[] = [
  {
    id: "telegram",
    title: "Join the Telegram channel",
    body: "Release notes, beta builds and quick support live in the channel - it is the fastest way to reach us.",
    highlights: ["Beta APK drops", "Release announcements", "Direct support"],
    icon: Send,
    accent: "#4dabf7",
    accentSoft: "#16283b",
    ctaLabel: "Join channel",
    link: ONBOARDING_PLACEHOLDER_LINKS.telegram,
  },
  {
    id: "reader-navigation",
    title: "Master the reader",
    body: "Learn tap zones, paged vs. scroll reading modes, rotation lock and fit/original sizing in a couple of minutes.",
    highlights: [
      "Tap-zone page turns",
      "Paged, scroll and fit modes",
      "Chapter navigation and progress",
    ],
    icon: BookOpen,
    accent: colors.accent,
    accentSoft: colors.accentSoft,
    ctaLabel: "Watch the guide",
    link: ONBOARDING_PLACEHOLDER_LINKS.readerGuide,
  },
  {
    id: "gemini-setup",
    title: "Set up AI translation",
    body: "Add a free Gemini API key to translate pages with AI, using batched requests and story context.",
    highlights: [
      "Free key from Google AI Studio",
      "Bubble-accurate overlays",
      "Batch and context controls",
    ],
    icon: KeyRound,
    accent: colors.gold,
    accentSoft: colors.goldSoft,
    ctaLabel: "Open setup guide",
    link: ONBOARDING_PLACEHOLDER_LINKS.geminiSetup,
  },
  {
    id: "deeplink-setup",
    title: "Enable deeplinks",
    body: "Share manga links to other users , which opens the exact manga if mangora is installed.",
    highlights: ["Deeplink sharing", "Manga sharing"],
    icon: Share2,
    accent: colors.gold,
    accentSoft: colors.goldSoft,
    ctaLabel: "Open setup guide",
    link: ONBOARDING_PLACEHOLDER_LINKS.deeplinkSetup,
  }
];
