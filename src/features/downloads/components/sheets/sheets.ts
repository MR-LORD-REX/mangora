/**
 * sheets.ts
 * ---------------------------------------------------------------------------
 * Imperative controller for the downloader dialogs. Screens call
 * `askDownloadFolder`, `confirmDownload`, `confirmAction`, `selectChapters` or
 * `selectLibrary` and await the user's answer; the matching UI is registered
 * once by <DownloadSheetHost /> with the shared root overlay host.
 * ---------------------------------------------------------------------------
 */

export interface FolderRequest {
  kind: "folder";
  title: string;
  message: string;
}

export interface ConfirmRequest {
  kind: "confirm";
  title: string;
  message: string;
  confirmLabel: string;
  /** Renders the confirm button as a destructive action. */
  destructive: boolean;
  /** Show the "don't ask again today" checkbox. */
  allowSuppress: boolean;
  /** Shape the awaiting promise resolves with. */
  resolveAs: "suppress" | "boolean";
}

export interface ChapterOption {
  id: string;
  label: string;
  subtitle?: string;
  /** Already on disk: shown with a check and excluded from the selection. */
  downloaded?: boolean;
}

export interface SelectRequest {
  kind: "select";
  title: string;
  message: string;
  options: ChapterOption[];
}

export interface LibraryPickRequest {
  kind: "library";
  title: string;
  message: string;
  options: { id: string; name: string }[];
}

export type SheetRequest =
  | FolderRequest
  | ConfirmRequest
  | SelectRequest
  | LibraryPickRequest;

let activeRequest: SheetRequest | null = null;
let activeResolver: ((value: unknown) => void) | null = null;
const listeners = new Set<(request: SheetRequest | null) => void>();

function open<T>(request: SheetRequest): Promise<T> {
  // Dialogs are single-slot: an older pending request resolves as cancelled so
  // a stranded promise can never block the UI.
  if (activeRequest) resolveSheet(undefined);
  return new Promise<T>((resolve) => {
    activeRequest = request;
    activeResolver = (value: unknown) => resolve(value as T);
    listeners.forEach((listener) => listener(request));
  });
}

export function subscribeSheet(
  listener: (request: SheetRequest | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveSheet(): SheetRequest | null {
  return activeRequest;
}

/** Closes the open dialog, resolving the awaiting promise with `value`. */
export function resolveSheet(value: unknown): void {
  const resolver = activeResolver;
  activeRequest = null;
  activeResolver = null;
  listeners.forEach((listener) => listener(null));
  resolver?.(value);
}

/** Explains why a folder is needed; resolves true once one has been picked. */
export function askDownloadFolder(): Promise<boolean> {
  return open<boolean>({
    kind: "folder",
    title: "Choose a download folder",
    message:
      "Mangora stores chapters as .cbz files in a folder you pick, for example Internal storage/mangora. Downloads go into a downloads subfolder and stay readable in your file manager.",
  });
}

/** Confirmation before creating a single job. */
export function confirmDownload(input: {
  title: string;
  message: string;
  confirmLabel?: string;
  allowSuppress?: boolean;
}): Promise<{ confirmed: boolean; suppress: boolean }> {
  return open<{ confirmed: boolean; suppress: boolean }>({
    kind: "confirm",
    title: input.title,
    message: input.message,
    confirmLabel: input.confirmLabel ?? "Download",
    destructive: false,
    allowSuppress: input.allowSuppress ?? false,
    resolveAs: "suppress",
  });
}

/** Yes/no confirmation for a destructive action (for example deleting). */
export function confirmAction(input: {
  title: string;
  message: string;
  confirmLabel: string;
}): Promise<boolean> {
  return open<boolean>({
    kind: "confirm",
    title: input.title,
    message: input.message,
    confirmLabel: input.confirmLabel,
    destructive: true,
    allowSuppress: false,
    resolveAs: "boolean",
  });
}

/** Chapter picker with select-all; resolves the selected ids or null. */
export function selectChapters(input: {
  title: string;
  message: string;
  options: ChapterOption[];
}): Promise<string[] | null> {
  return open<string[] | null>({
    kind: "select",
    title: input.title,
    message: input.message,
    options: input.options,
  });
}

/** Library picker; resolves the chosen library id or null when skipped. */
export function selectLibrary(input: {
  title: string;
  message: string;
  options: { id: string; name: string }[];
}): Promise<string | null> {
  return open<string | null>({
    kind: "library",
    title: input.title,
    message: input.message,
    options: input.options,
  });
}
