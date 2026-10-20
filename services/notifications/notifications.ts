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
const TRANSLATION_CATEGORY = "translation-queue";
let translationNotificationId: string | null = null;
let responseListenerInstalled = false;
let pendingTranslationProgress: {
  job: TranslationNotificationJob;
  current: number;
  total: number;
} | null = null;
let translationProgressPump: Promise<void> | null = null;

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
    await Notifications.setNotificationCategoryAsync(TRANSLATION_CATEGORY, [
      {
        identifier: "translation-pause",
        buttonTitle: "Pause",
      },
      {
        identifier: "translation-resume",
        buttonTitle: "Resume",
      },
      {
        identifier: "translation-cancel",
        buttonTitle: "Cancel",
        options: { isDestructive: true },
      },
    ]);
    if (!responseListenerInstalled) {
      responseListenerInstalled = true;
      Notifications.addNotificationResponseReceivedListener((response) => {
        const action = response.actionIdentifier;
        if (
          action !== "translation-pause" &&
          action !== "translation-resume" &&
          action !== "translation-cancel"
        ) {
          return;
        }
        void import("@/services/translation/pretranslateQueue").then((queue) => {
          if (action === "translation-pause") queue.pauseTranslationQueue();
          else if (action === "translation-resume") queue.resumeTranslationQueue();
          else queue.cancelTranslationQueue();
        });
      });
    }
  } catch {
    // Channel / category setup is best effort.
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

interface TranslationNotificationJob {
  chapterTitle: string;
  mangaTitle: string;
  status: string;
  pagesFailed: number;
}

function pumpTranslationProgress(): Promise<void> {
  if (translationProgressPump) return translationProgressPump;
  translationProgressPump = (async () => {
    while (pendingTranslationProgress) {
      const next = pendingTranslationProgress;
      pendingTranslationProgress = null;
      if (!permissionGranted) continue;
      try {
        if (translationNotificationId) {
          await Notifications.dismissNotificationAsync(
            translationNotificationId,
          );
          translationNotificationId = null;
        }
        translationNotificationId = await Notifications.scheduleNotificationAsync(
          {
            content: {
              title: `Pre-translating ${next.job.chapterTitle}`,
              body: `${next.current}/${next.total} pages \u00b7 ${next.job.mangaTitle}${
                next.job.pagesFailed > 0
                  ? ` \u00b7 ${next.job.pagesFailed} failed`
                  : ""
              }`,
              data: { kind: "translation-queue" },
              categoryIdentifier: TRANSLATION_CATEGORY,
              autoDismiss: next.job.status === "completed",
              sound: false,
            },
            trigger: null,
          },
        );
      } catch {
        // Progress notifications never affect the job.
      }
    }
  })().finally(() => {
    translationProgressPump = null;
    if (pendingTranslationProgress) void pumpTranslationProgress();
  });
  return translationProgressPump;
}

/**
 * Live pre-translate progress notification (one at a time). Bursts collapse
 * to the newest value, so resuming a long job cannot stack notifications.
 */
export function notifyTranslationProgress(
  job: TranslationNotificationJob,
  current: number,
  total: number,
): Promise<void> {
  if (!permissionGranted) return Promise.resolve();
  pendingTranslationProgress = {
    job: {
      chapterTitle: job.chapterTitle,
      mangaTitle: job.mangaTitle,
      status: job.status,
      pagesFailed: job.pagesFailed,
    },
    current,
    total,
  };
  return pumpTranslationProgress();
}

/** Reminder when the JS queue pauses because the app left the foreground. */
export async function notifyTranslationBackground(): Promise<void> {
  if (!permissionGranted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Translation paused",
        body: "Return to Mangora to continue pre-translating the chapter.",
        data: { kind: "translation-background" },
        sound: false,
      },
      trigger: null,
    });
  } catch {
    // Best effort.
  }
}
