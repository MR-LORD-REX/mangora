/**
 * Notification operations used by the translation queue. Implementations own
 * permission and category details; the queue only reports state.
 */
export interface TranslationNotificationPort {
  show(input: {
    jobId: string;
    chapterTitle: string;
    mangaTitle: string;
    status: "running" | "paused" | "cancelling";
    pagesFailed: number;
    current: number;
    total: number;
  }): Promise<void>;
  finish(input: {
    jobId: string;
    chapterTitle: string;
    mangaTitle: string;
    status: "completed" | "failed";
    pagesDone: number;
    pagesFailed: number;
    total: number;
  }): Promise<void>;
  clear(): Promise<void>;
}

/** Notification actions that the translation queue can register handlers for. */
export type TranslationNotificationCommand = "pause" | "resume" | "cancel";
export type TranslationNotificationHandler = (jobId: string) => void;

export interface TranslationNotificationCommandPort {
  registerHandler(
    command: TranslationNotificationCommand,
    handler: TranslationNotificationHandler,
  ): () => void;
}
