import { I18nManager } from "react-native";

/**
 * Mangora draws manga pages and translation overlays in source-image
 * coordinates. Android would otherwise mirror the entire React tree on an
 * Arabic (or other RTL) device, moving absolute overlays and reader chrome
 * while leaving the source image untouched. Reading direction is an explicit
 * reader setting, not a device-layout decision.
 *
 * `allowRTL` is persisted by React Native and needs a process restart to take
 * effect, so the Android manifest plugin is the primary fix. This call makes
 * the intended policy explicit for every platform and future native rebuild.
 */
export function enforceLtrLayout(): void {
  I18nManager.allowRTL(false);
  I18nManager.swapLeftAndRightInRTL(false);
}
