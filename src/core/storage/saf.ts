/**
 * Feature-neutral Storage Access Framework primitives.
 *
 * Downloads and database backups both write into the user-picked folder. This
 * module owns only the typed Kotlin bridge and safe JavaScript fallbacks; it
 * must never import a feature.
 */
import { Directory, File } from "expo-file-system";
import { NativeModules, Platform } from "react-native";

interface MangoraStorageModule {
  ensureDirectories(parentUri: string, segments: string[]): Promise<string>;
  writeSafFile(
    parentUri: string,
    fileName: string,
    mimeType: string,
    sourcePath: string,
  ): Promise<string>;
  readSafDocument(uri: string, destPath: string): Promise<string>;
  extractSafArchivePages(uri: string, destDirPath: string): Promise<string[]>;
  deleteSafPath(parentUri: string, segments: string[]): Promise<boolean>;
  deleteSafDocument(uri: string): Promise<boolean>;
  findSafChild(parentUri: string, name: string): Promise<string | null>;
  listSafChildren(parentUri: string): Promise<SafChild[]>;
  renameSafDocument(uri: string, newName: string): Promise<string>;
  describeSafTree(uri: string): Promise<string>;
}

const nativeModule = NativeModules.MangoraDownloader as
  | MangoraStorageModule
  | undefined;

/** True when the Android storage bridge is linked into this build. */
export function hasNativeStorage(): boolean {
  return Platform.OS === "android" && nativeModule != null;
}

/**
 * Creates (or reuses) the `segments` chain below a picked SAF folder and
 * returns the deepest uri.
 */
export async function ensureSafDirectories(
  parentUri: string,
  segments: string[],
): Promise<string> {
  if (hasNativeStorage()) {
    return nativeModule!.ensureDirectories(parentUri, segments);
  }
  let current = new Directory(parentUri);
  for (const segment of segments) {
    if (!segment) continue;
    const next = new Directory(current, segment);
    if (!next.exists) next.create({ intermediates: true, idempotent: true });
    current = next;
  }
  return current.uri;
}

/** Human readable label for a picked tree uri ("Internal storage/mangora"). */
export async function describeSafTree(uri: string): Promise<string | null> {
  if (!hasNativeStorage()) return null;
  try {
    const label = await nativeModule!.describeSafTree(uri);
    return label || null;
  } catch {
    return null;
  }
}

/** One entry inside a SAF folder. */
export interface SafChild {
  name: string;
  uri: string;
  size: number;
  isDirectory: boolean;
}

/** Resolves a direct child document/folder of a SAF tree, or null. */
export async function findSafChild(
  parentUri: string,
  name: string,
): Promise<string | null> {
  if (hasNativeStorage()) {
    try {
      return await nativeModule!.findSafChild(parentUri, name);
    } catch {
      return null;
    }
  }
  try {
    const parent = new Directory(parentUri);
    if (!parent.exists) return null;
    const child = parent.list().find((entry) => entry.name === name);
    return child?.uri ?? null;
  } catch {
    return null;
  }
}

/** Lists the direct children of a SAF folder. */
export async function listSafChildren(parentUri: string): Promise<SafChild[]> {
  if (hasNativeStorage()) {
    try {
      return await nativeModule!.listSafChildren(parentUri);
    } catch {
      return [];
    }
  }
  try {
    const parent = new Directory(parentUri);
    if (!parent.exists) return [];
    return parent.list().map((entry) => ({
      name: entry.name,
      uri: entry.uri,
      size: entry instanceof File ? entry.size : 0,
      isDirectory: entry instanceof Directory,
    }));
  } catch {
    return [];
  }
}

/** Renames a SAF document; returns its new uri. */
export async function renameSafDocument(
  uri: string,
  newName: string,
): Promise<string> {
  if (hasNativeStorage()) {
    return nativeModule!.renameSafDocument(uri, newName);
  }
  const file = new File(uri);
  file.rename(newName);
  return file.uri;
}

/**
 * Streams a local file into a SAF folder, replacing a previous document with
 * the same name. Without the native module the bytes are read into memory
 * first (fine for small files only).
 */
export async function writeFileToFolder(
  folderUri: string,
  fileName: string,
  mimeType: string,
  sourcePath: string,
): Promise<string> {
  if (hasNativeStorage()) {
    return nativeModule!.writeSafFile(folderUri, fileName, mimeType, sourcePath);
  }
  const folder = new Directory(folderUri);
  const existing = folder
    .list()
    .find(
      (entry) => entry instanceof File && entry.name === fileName,
    ) as File | undefined;
  if (existing?.exists) existing.delete();
  const target = folder.createFile(fileName, mimeType);
  const bytes = await new File(sourcePath).bytes();
  target.write(bytes);
  return target.uri;
}

/**
 * Copies a document the user picked (a `content://` uri, which the JS
 * filesystem cannot read) into `destPath` and resolves the local path.
 */
export async function readSafDocumentToFile(
  uri: string,
  destPath: string,
): Promise<string> {
  if (hasNativeStorage()) {
    return nativeModule!.readSafDocument(uri, destPath);
  }
  const bytes = await new File(uri).bytes();
  const destination = new File(destPath);
  destination.create({ intermediates: true, overwrite: true });
  destination.write(bytes);
  return destination.uri;
}

/**
 * Deletes `<parentUri>/<segments...>` when it exists. Best effort and reports
 * whether the native provider removed it.
 */
export async function deleteSafPath(
  parentUri: string,
  segments: string[],
): Promise<boolean> {
  if (!hasNativeStorage()) return false;
  try {
    return await nativeModule!.deleteSafPath(parentUri, segments);
  } catch {
    return false;
  }
}

/**
 * Deletes a SAF document and reports the provider's result. Unlike a best-
 * effort cleanup this throws so bulk deletion can report failures.
 */
/**
 * Extracts the numbered page images of a downloaded CBZ into `destDirPath`
 * and returns their file uris in archive order.
 */
export async function extractSafArchivePages(
  uri: string,
  destDirPath: string,
): Promise<string[]> {
  if (!nativeModule || typeof nativeModule.extractSafArchivePages !== "function") {
    throw new Error(
      "Extracting downloaded chapters needs the native download module. Rebuild the app and try again.",
    );
  }
  return nativeModule.extractSafArchivePages(uri, destDirPath);
}
export async function deleteSafDocumentStrict(uri: string): Promise<void> {
  if (hasNativeStorage()) {
    const deleted = await nativeModule!.deleteSafDocument(uri);
    if (!deleted) {
      throw new Error("The storage provider did not delete the file.");
    }
    return;
  }
  const file = new File(uri);
  if (file.exists) file.delete();
}

/** Deletes a SAF document, swallowing provider errors. */
export async function deleteSafArchive(uri: string): Promise<void> {
  if (hasNativeStorage()) {
    try {
      await nativeModule!.deleteSafDocument(uri);
      return;
    } catch {
      // Fall through to the expo-file-system delete below.
    }
  }
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Deleting is best effort: the archive may already be gone.
  }
}