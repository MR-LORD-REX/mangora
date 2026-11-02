/**
 * notifications.ts
 * ---------------------------------------------------------------------------
 * Notification permission + presentation policy for the app.
 *
 * The live download progress notification (with Pause / Resume / Cancel) is
 * owned by the Android foreground service - see features/downloads/adapters/nativeDownloader.ts
 * and DownloadService.kt - because a foreground service is what keeps the JS
 * queue alive while the app is backgrounded. expo-notifications owns the
 * runtime permission request and the app-level handler/channel used for
 * event notifications (for example the "downloads finished" summary).
 * ---------------------------------------------------------------------------
 */

import * as Notifications from "expo-notifications";
import type {
  TranslationNotificationCommand,
  TranslationNotificationCommandPort,
  TranslationNotificationHandler,
  TranslationNotificationPort,
} from "@shared/contracts";
import { Platform } from "react-native";

const EVENT_CHANNEL_ID = "mangora-events";
const TRANSLATION_RUNNING_CATEGORY = "translation-queue-running";
const TRANSLATION_PAUSED_CATEGORY = "translation-queue-paused";
let translationNotificationId: string | null = null;
let responseListenerInstalled = false;
let notificationReconciled = false;
let desiredTranslationNotification: TranslationNotificationJob | TranslationTerminalJob | null = null;
let desiredTranslationVersion = 0;
let translationNotificationPump: Promise<void> | null = null;
const pendingTranslationCommands: {
  command: TranslationNotificationCommand;
  jobId: string;
}[] = [];
const handledTranslationResponses = new Set<string>();

const translationCommandHandlers = new Map<
  TranslationNotificationCommand,
  TranslationNotificationHandler
>();
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
    await Notifications.setNotificationCategoryAsync(TRANSLATION_RUNNING_CATEGORY, [
      {
        identifier: "translation-pause",
        buttonTitle: "Pause",
      },
      {
        identifier: "translation-cancel",
        buttonTitle: "Cancel",
        options: { isDestructive: true },
      },
    ]);
    await Notifications.setNotificationCategoryAsync(TRANSLATION_PAUSED_CATEGORY, [
      { identifier: "translation-resume", buttonTitle: "Resume" },
      {
        identifier: "translation-cancel",
        buttonTitle: "Cancel",
        options: { isDestructive: true },
      },
    ]);
    if (!responseListenerInstalled) {
      responseListenerInstalled = true;
      Notifications.addNotificationResponseReceivedListener(routeTranslationResponse);
    }
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) routeTranslationResponse(lastResponse);
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
  void pumpTranslationNotification();
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

type TranslationNotificationJob = Parameters<TranslationNotificationPort["show"]>[0];
type TranslationTerminalJob = Parameters<TranslationNotificationPort["finish"]>[0];

function routeTranslationResponse(response: Notifications.NotificationResponse): void {
  const action = response.actionIdentifier;
  const command: TranslationNotificationCommand | null =
    action === "translation-pause" ? "pause" :
    action === "translation-resume" ? "resume" :
    action === "translation-cancel" ? "cancel" : null;
  const jobId = response.notification.request.content.data?.jobId;
  if (!command || typeof jobId !== "string") return;
  const responseKey = `${response.notification.request.identifier}:${action}`;
  if (handledTranslationResponses.has(responseKey)) return;
  handledTranslationResponses.add(responseKey);
  Notifications.clearLastNotificationResponse();
  const handler = translationCommandHandlers.get(command);
  if (handler) handler(jobId);
  else pendingTranslationCommands.push({ command, jobId });
}

async function dismissTranslationNotification(): Promise<void> {
  try {
    if (!notificationReconciled) {
      const presented = await Notifications.getPresentedNotificationsAsync();
      await Promise.all(presented
        .filter((notification) =>
          notification.request.content.data?.kind === "translation-queue" ||
          notification.request.content.data?.kind === "translation-background",
        )
        .map((notification) =>
          Notifications.dismissNotificationAsync(notification.request.identifier),
        ));
      translationNotificationId = null;
      notificationReconciled = true;
    } else if (translationNotificationId) {
      await Notifications.dismissNotificationAsync(translationNotificationId);
      translationNotificationId = null;
    }
  } catch (error) {
    console.warn("[translation][notification] dismiss failed", error);
  }
}

function pumpTranslationNotification(): Promise<void> {
  if (translationNotificationPump) return translationNotificationPump;
  let appliedVersion = -1;
  translationNotificationPump = (async () => {
    while (appliedVersion !== desiredTranslationVersion) {
      appliedVersion = desiredTranslationVersion;
      const job = desiredTranslationNotification;
      await dismissTranslationNotification();
      if (!permissionGranted || !job) continue;
      try {
        const terminal = "pagesDone" in job;
        const progress = terminal ? job.pagesDone : job.current;
        translationNotificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: job.status === "running"
              ? `Pre-translating ${job.chapterTitle}`
              : job.status === "paused"
                ? `Translation paused: ${job.chapterTitle}`
                : job.status === "cancelling"
                  ? `Stopping translation: ${job.chapterTitle}`
                  : job.status === "completed"
                    ? `Pre-translation complete: ${job.chapterTitle}`
                    : `Pre-translation failed: ${job.chapterTitle}`,
            body: `${progress}/${job.total} pages \u00b7 ${job.mangaTitle}${
              job.pagesFailed > 0 ? ` \u00b7 ${job.pagesFailed} failed` : ""
            }${job.status === "paused" ? " \u00b7 Open Mangora to resume" : ""}`,
            data: { kind: "translation-queue", jobId: job.jobId },
            categoryIdentifier: job.status === "running"
              ? TRANSLATION_RUNNING_CATEGORY
              : job.status === "paused"
                ? TRANSLATION_PAUSED_CATEGORY
                : undefined,
            autoDismiss: terminal,
            sound: false,
          },
          trigger: null,
        });
      } catch (error) {
        console.warn("[translation][notification] update failed", error);
      }
    }
  })().finally(() => {
    translationNotificationPump = null;
    if (desiredTranslationVersion !== appliedVersion) {
      void pumpTranslationNotification();
    }
  });
  return translationNotificationPump;
}

function setTranslationNotification(
  job: TranslationNotificationJob | TranslationTerminalJob | null,
): Promise<void> {
  if (JSON.stringify(desiredTranslationNotification) === JSON.stringify(job) &&
      notificationReconciled) return translationNotificationPump ?? Promise.resolve();
  desiredTranslationNotification = job;
  desiredTranslationVersion += 1;
  return pumpTranslationNotification();
}

/** Routes notification button actions to the translation queue after it initializes. */
export const translationNotificationCommands: TranslationNotificationCommandPort = {
  registerHandler(command, handler) {
    translationCommandHandlers.set(command, handler);
    for (let index = pendingTranslationCommands.length - 1; index >= 0; index -= 1) {
      const pending = pendingTranslationCommands[index];
      if (pending.command !== command) continue;
      pendingTranslationCommands.splice(index, 1);
      handler(pending.jobId);
    }
    return () => {
      if (translationCommandHandlers.get(command) === handler) {
        translationCommandHandlers.delete(command);
      }
    };
  },
};

export const translationNotifications: TranslationNotificationPort = {
  show: (input) => setTranslationNotification(input),
  finish: (input) => setTranslationNotification(input),
  clear: () => setTranslationNotification(null),
};
