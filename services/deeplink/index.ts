/**
 * services/deeplink/index.ts
 * ---------------------------------------------------------------------------
 * Share + deep-link helpers for the public Mangora site (plan S14.1).
 *
 * A shared link points at `https://mangora-web.web.app/manga/<id>`,
 * which is exactly the URL shape expo-router produces for the app's own
 * `/manga/[slug]` route. A shared link therefore resolves straight back into
 * the identical screen with no dispatcher code, and the website landing page
 * only has to cover the not-installed case (S14.3).
 *
 * The path segment carries the provider identity in the viewer's route
 * encoding (the `[slug]` / `[id]` param), so it round-trips through
 * `encodeURIComponent` -> router path decode -> `decodeIdentity`.
 * ---------------------------------------------------------------------------
 */

import { setStringAsync } from "expo-clipboard";
import { Share } from "react-native";

import { isMatureProvider } from "@/constants/providers";

/** Public site origin. Keep in sync with SITE.url in mangora-website. */
export const SITE_ORIGIN = "https://mangora-web.web.app";

export interface MangaShareTarget {
  /** Extension provider key (`ext:<sourceId>`). Sent as the `provider` query param. */
  provider: string;
  /** Provider identity in the viewer's route encoding (the `[slug]`/`[id]`). */
  param: string;
  title?: string | null;

}

/** Builds the public share URL for one series. */
export function buildMangaShareUrl(target: MangaShareTarget): string {
  const query = [`provider=${encodeURIComponent(target.provider)}`];
  if (target.title) query.push(`title=${encodeURIComponent(target.title)}`);
  return `${SITE_ORIGIN}/manga/${encodeURIComponent(
    target.param,
  )}?${query.join("&")}`;
}

/**
 * Whether a provider's link may be shared. Adult sources are gated behind the
 * `ageRestrictedSources` setting (off by default) so a shared link never lands
 * an unsuspecting user on an adult source (plan S9).
 */
export function canShareProvider(
  provider: string,
  ageRestrictedSources: boolean,
): boolean {
  return ageRestrictedSources || !isMatureProvider(provider);
}

export type ShareMangaResult = "shared" | "dismissed" | "copied";

/**
 * Opens the platform share sheet for a series link. Falls back to copying the
 * link to the clipboard when no share target is available.
 */
export async function shareMangaLink(
  target: MangaShareTarget,
): Promise<ShareMangaResult> {
  const url = buildMangaShareUrl(target);
  const message = target.title ? `${target.title}\n${url}` : url;
  try {
    const result = await Share.share({
      message,
      url,
      title: target.title ?? "Share this series",
    });
    if (result.action === Share.dismissedAction) return "dismissed";
    return "shared";
  } catch {
    await setStringAsync(url).catch(() => {});
    return "copied";
  }
}

/** Copies a series link to the clipboard (secondary share action). */
export async function copyMangaLink(target: MangaShareTarget): Promise<void> {
  await setStringAsync(buildMangaShareUrl(target)).catch(() => {});
}