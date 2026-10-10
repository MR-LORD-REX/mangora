/**
 * brainrot.constants.ts
 *
 * WebView/bridge configuration for the BrainRot (brainrotcomics.com) source.
 */

export { BASE_URL, DEFAULT_HEADERS } from "./brainrot.types";

export const SOURCE_META = {
  id: "brainrot",
  name: "BrainRot",
  lang: "en",
} as const;

/**
 * Every BrainRot WebView (hidden bridge host and in-app browser) must send the
 * SAME user agent: Cloudflare binds `cf_clearance` to the UA that solved the
 * challenge, and Android WebView's default UA carries a "; wv" marker the
 * managed challenge refuses.
 */
export const BRAINROT_WEBVIEW_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";