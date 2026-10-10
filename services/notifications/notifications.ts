/**
 * notifications.ts
 * ---------------------------------------------------------------------------
 * Notification permission + presentation policy for the app.
 *
 * The live download progress notification (with Pause / Resume / Cancel) is
 * owned by the Android foreground service - see services/downloader/native.ts
 * and DownloadService.kt - because a foreground service is what keeps the JS
 * queue alive while the app is backgrounded. expo-notifications owns the
 * runtime permission request and the app-level handler/channel used for
 * event notifications (for example the "downloads finished" summary).
 * ---------------------------------------------------------------------------
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const EVENT_CHANNEL_ID = "mangora-events";

let permissionGranted = false;

/** True once the user granted notification permission this session. */
export function notificationsAllowed(): boolean {
  return permissionGranted;
}

/**
 * Installs the foreground handler, prepares the Android channel and asks for
 * the notification permission when it has not been granted yet. Safe to call
 * more than once. Never throws.
 */
export async function initializeNotifications(): Promise<boolean> {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // The handler is a nicety; permission is what the downloader needs.
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(EVENT_CHANNEL_ID, {
        name: "Downloads",
        importance: Notifications.AndroidImportance.LOW,
        showBadge: false,
      });
    }
  } catch {
    // Channel setup is best effort.
  }

  try {
    let status = await Notifications.getPermissionsAsync();
    if (!status.granted && status.canAskAgain) {
      status = await Notifications.requestPermissionsAsync();
    }
    permissionGranted = Boolean(status.granted);
  } catch {
    permissionGranted = false;
  }
  return permissionGranted;
}

/**
 * One summary notification when the queue drains after downloading. Silent
 * and auto-dismissing; skipped entirely when permission was refused.
 */
export async function notifyDownloadsFinished(chapterCount: number): Promise<void> {
  if (!permissionGranted || chapterCount <= 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Downloads finished",
        body:
          chapterCount === 1
            ? "1 chapter is ready to read offline."
            : `${chapterCount} chapters are ready to read offline.`,
        data: { kind: "downloads-finished" },
        autoDismiss: true,
        sound: false,
      },
      trigger: null,
    });
  } catch {
    // A missed summary notification never affects the download queue.
  }
}
