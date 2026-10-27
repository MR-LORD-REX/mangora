/**
 * src/features/updates/data/github.ts
 * ---------------------------------------------------------------------------
 * Reads published GitHub releases for the updater. Drafts are always ignored;
 * prereleases are ignored unless the caller opts into betas (plan S14.4).
 * ---------------------------------------------------------------------------
 */

import Constants from "expo-constants";

const OWNER = "MR-LORD-REX";
const REPO = "mangora";
const RELEASES_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases`;

export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
  /** GitHub's "sha256:..." asset digest, when present. */
  digest: string | null;
}

export interface AvailableUpdate {
  tag: string;
  /** Tag without a leading "v", e.g. "0.0.2". */
  version: string;
  name: string;
  notes: string;
  publishedAt: string;
  prerelease: boolean;
  /** First `.apk` asset, or null when the release ships no APK. */
  apk: UpdateAsset | null;
}

/** The running app version from app.json (`expo.version`). */
export function currentVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/** Strips a leading "v" and surrounding whitespace from a release tag. */
export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

function numericParts(version: string): number[] {
  return normalizeVersion(version)
    .split(/[.+-]/)
    .map((part) => {
      const value = parseInt(part, 10);
      return Number.isFinite(value) ? value : 0;
    });
}

/** Returns -1 / 0 / 1 for a < b / a == b / a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = numericParts(a);
  const pb = numericParts(b);
  const length = Math.max(pa.length, pb.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

function toUpdate(release: any): AvailableUpdate | null {
  const tag = typeof release?.tag_name === "string" ? release.tag_name : "";
  if (!tag) return null;
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const apkAsset = assets.find(
    (asset: any) => typeof asset?.name === "string" && /\.apk$/i.test(asset.name),
  );
  return {
    tag,
    version: normalizeVersion(tag),
    name: typeof release?.name === "string" && release.name ? release.name : tag,
    notes: typeof release?.body === "string" ? release.body : "",
    publishedAt:
      typeof release?.published_at === "string" ? release.published_at : "",
    prerelease: Boolean(release?.prerelease),
    apk: apkAsset
      ? {
          name: apkAsset.name as string,
          url:
            typeof apkAsset.browser_download_url === "string"
              ? apkAsset.browser_download_url
              : "",
          size: typeof apkAsset.size === "number" ? apkAsset.size : 0,
          digest:
            typeof apkAsset.digest === "string" ? apkAsset.digest : null,
        }
      : null,
  };
}

/**
 * Newest published release first. Throws a friendly error on rate limits or
 * network failures so the UI can show the message verbatim.
 */
export async function fetchReleases(options?: {
  includePrereleases?: boolean;
}): Promise<AvailableUpdate[]> {
  let response: Response;
  try {
    response = await fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Mangora-Android",
      },
    });
  } catch {
    throw new Error("Could not reach GitHub. Check your connection.");
  }

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("GitHub rate limit reached. Try again in a little while.");
    }
    if (response.status === 404) {
      throw new Error("The release feed could not be found.");
    }
    throw new Error(`GitHub responded with ${response.status}.`);
  }

  const data = await response.json().catch(() => null);
  if (!Array.isArray(data)) return [];

  return data
    .filter((release: any) => !release?.draft)
    .filter(
      (release: any) =>
        options?.includePrereleases || !release?.prerelease,
    )
    .map(toUpdate)
    .filter((update): update is AvailableUpdate => update != null)
    .sort((a, b) => compareVersions(b.version, a.version));
}