/**
 * onboardingState.ts
 * ---------------------------------------------------------------------------
 * Visibility rules for the onboarding overlay.
 *
 * The persisted state is intentionally per-guide (`onboardingSeenGuideIds`)
 * rather than a single boolean, so new guides added to ONBOARDING_GUIDES
 * automatically resurface the overlay for users who have not seen them, while
 * "Close forever" remains a hard opt-out.
 * ---------------------------------------------------------------------------
 */

import { ONBOARDING_GUIDES } from "@/constants/onboardingGuides";
import type { AppSettings } from "@/services/settings/settingsStore";

let snoozedThisSession = false;

/** Remembers that the user chose "Remind me later" for this app session. */
export function snoozeOnboardingForSession(): void {
  snoozedThisSession = true;
}

/** True while the current app session should not show the onboarding overlay. */
export function isOnboardingSnoozedForSession(): boolean {
  return snoozedThisSession;
}

/** Guides this user has not seen yet, in presentation order. */
export function unseenOnboardingGuides(settings: AppSettings) {
  const seen = new Set(settings.onboardingSeenGuideIds);
  return ONBOARDING_GUIDES.filter((guide) => !seen.has(guide.id));
}

/** Index of the first unseen guide, used to resume where the user left off. */
export function firstUnseenGuideIndex(settings: AppSettings): number {
  const seen = new Set(settings.onboardingSeenGuideIds);
  const index = ONBOARDING_GUIDES.findIndex((guide) => !seen.has(guide.id));
  return index < 0 ? 0 : index;
}

/**
 * The overlay shows when the user has not opted out forever, has not snoozed
 * this session, and at least one guide is still unseen.
 */
export function shouldShowOnboarding(settings: AppSettings): boolean {
  if (settings.onboardingDismissedForever) return false;
  if (isOnboardingSnoozedForSession()) return false;
  return unseenOnboardingGuides(settings).length > 0;
}
