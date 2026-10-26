/**
 * Notification operations used by the translation queue. Implementations own
 * permission and category details; the queue only reports state.
 */
export interface TranslationNotificationPort {
  progress(input: {
    chapterTitle: string;
    mangaTitle: string;
    status: string;
    pagesFailed: number;
    current: number;
    total: number;
  }): Promise<void>;
  background(): Promise<void>;
}

/** Notification actions that the translation queue can register handlers for. */
export type TranslationNotificationCommand = "pause" | "resume" | "cancel";
export type TranslationNotificationHandler = () => void;

export interface TranslationNotificationCommandPort {
  registerHandler(
    command: TranslationNotificationCommand,
    handler: TranslationNotificationHandler,
  ): () => void;
}
