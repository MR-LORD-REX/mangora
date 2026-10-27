/**
 * archive.ts
 * ---------------------------------------------------------------------------
 * Validation for the `.cbz` files the downloader produces.
 *
 * The ZIP central directory is parsed directly (no decompression needed): a
 * valid archive must open, contain exactly the expected number of numbered
 * image entries, and contain no unexpected paths. This runs before the DB row
 * is marked completed and again when recovery imports an archive.
 */

import { Directory, File } from "expo-file-system";

import { assertDecodableImageUri } from "@core/images/decode";
import { hasNativeDownloader } from "../adapters/nativeDownloader";
import { extractSafArchivePages, readSafDocumentToFile } from "@core/storage/saf";

const PAGE_NAME_PATTERN = /^\d{4,}\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export interface ArchiveEntry {
  name: string;
  size: number;
  compressedSize: number;
  compressionMethod: number;
}

export interface ArchiveValidation {
  pageCount: number;
  byteSize: number;
  entries: ArchiveEntry[];
}

export class ArchiveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveValidationError";
  }
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

/** Validates a local `.cbz` file and returns its numbered image entries. */
export async function validateArchiveFile(
  uri: string,
  expectedPageCount: number,
): Promise<ArchiveValidation> {
  const file = new File(uri);
  if (!file.exists || file.size <= 0) {
    throw new ArchiveValidationError("The archive is missing or empty.");
  }
  const bytes = await file.bytes();
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) {
    throw new ArchiveValidationError("The archive is not a valid ZIP file.");
  }
  const entryCount = readUint16(bytes, eocd + 10);
  const centralSize = readUint32(bytes, eocd + 12);
  const centralOffset = readUint32(bytes, eocd + 16);
  if (
    entryCount <= 0 ||
    centralOffset + centralSize > bytes.length ||
    centralOffset >= bytes.length
  ) {
    throw new ArchiveValidationError("The archive central directory is corrupt.");
  }

  const entries: ArchiveEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset;
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > bytes.length ||
      readUint32(bytes, offset) !== CENTRAL_SIGNATURE
    ) {
      throw new ArchiveValidationError("The archive central directory is corrupt.");
    }
    const compressionMethod = readUint16(bytes, offset + 10);
    const compressedSize = readUint32(bytes, offset + 20);
    const size = readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localOffset = readUint32(bytes, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) {
      throw new ArchiveValidationError("The archive entry name is truncated.");
    }
    const name = decoder.decode(bytes.slice(nameStart, nameEnd));
    if (
      !name ||
      name.includes("/") ||
      name.includes("\\") ||
      !PAGE_NAME_PATTERN.test(name)
    ) {
      throw new ArchiveValidationError(
        `The archive contains an unexpected entry: ${name || "(empty)"}.`,
      );
    }
    if (names.has(name)) {
      throw new ArchiveValidationError(`The archive contains a duplicate entry: ${name}.`);
    }
    names.add(name);
    if (size <= 0 || compressedSize <= 0) {
      throw new ArchiveValidationError(`The archive entry ${name} is empty.`);
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new ArchiveValidationError(
        `The archive entry ${name} uses an unsupported compression method.`,
      );
    }
    if (
      localOffset + 30 > bytes.length ||
      readUint32(bytes, localOffset) !== LOCAL_SIGNATURE
    ) {
      throw new ArchiveValidationError(
        `The archive entry ${name} has no valid local header.`,
      );
    }
    const localNameLength = readUint16(bytes, localOffset + 26);
    const localExtraLength = readUint16(bytes, localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    if (localNameEnd > bytes.length) {
      throw new ArchiveValidationError(
        `The archive entry ${name} has a truncated local name.`,
      );
    }
    const localName = decoder.decode(bytes.slice(localNameStart, localNameEnd));
    if (localName !== name) {
      throw new ArchiveValidationError(
        `The archive entry ${name} does not match its local header.`,
      );
    }
    if (dataStart + compressedSize > bytes.length) {
      throw new ArchiveValidationError(
        `The archive entry ${name} extends past the end of the file.`,
      );
    }
    if (compressionMethod === 0 && compressedSize !== size) {
      throw new ArchiveValidationError(
        `The stored archive entry ${name} has inconsistent sizes.`,
      );
    }
    entries.push({ name, size, compressedSize, compressionMethod });
    offset = nameEnd + extraLength + commentLength;
  }

  if (entries.length !== expectedPageCount) {
    throw new ArchiveValidationError(
      `The archive has ${entries.length} pages, expected ${expectedPageCount}.`,
    );
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { pageCount: entries.length, byteSize: file.size, entries };
}

/**
 * Copies a SAF archive into app cache, validates it, and removes the temporary
 * copy. Returns the validation plus the temporary path (already deleted).
 */
export async function validateSafArchive(
  uri: string,
  expectedPageCount: number,
  tempPath: string,
  options: { verifyImages?: boolean } = {},
): Promise<ArchiveValidation> {
  const file = new File(uri);
  if (file.exists && file.size <= 0) {
    throw new ArchiveValidationError("The saved archive is empty.");
  }
  let localPath: string;
  try {
    localPath = await readSafDocumentToFile(uri, tempPath);
  } catch (error) {
    try {
      const partial = new File(tempPath);
      if (partial.exists) partial.delete();
    } catch {
      // Cache cleanup is best effort.
    }
    throw new ArchiveValidationError(
      error instanceof Error
        ? `Could not read the saved archive: ${error.message}`
        : "Could not read the saved archive.",
    );
  }
  try {
    const validation = await validateArchiveFile(localPath, expectedPageCount);
    if (options.verifyImages !== false && hasNativeDownloader()) {
      await verifyArchiveImages(uri, validation, tempPath);
    }
    return validation;
  } finally {
    try {
      const local = new File(localPath);
      if (local.exists) local.delete();
    } catch {
      // Cache cleanup is best effort.
    }
  }
}

/**
 * Extracts the final archive into a temporary directory and asks the platform
 * decoder to open every page. This proves the bytes copied into the user's
 * folder are the same decodable pages that were validated before zipping.
 */
async function verifyArchiveImages(
  uri: string,
  validation: ArchiveValidation,
  tempPath: string,
): Promise<void> {
  const parent = new File(tempPath).parentDirectory;
  const extractDir = new Directory(
    parent,
    `archive-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  try {
    extractDir.create({ intermediates: true, idempotent: true });
    const extracted = await extractSafArchivePages(uri, extractDir.uri);
    if (extracted.length !== validation.pageCount) {
      throw new ArchiveValidationError(
        `The archive extracted ${extracted.length} pages, expected ${validation.pageCount}.`,
      );
    }
    const ordered = [...extracted].sort((a, b) =>
      new File(a).name.localeCompare(new File(b).name),
    );
    for (let index = 0; index < ordered.length; index += 1) {
      await assertDecodableImageUri(
        ordered[index],
        `Archive page ${index + 1}`,
      );
    }
  } catch (error) {
    if (error instanceof ArchiveValidationError) throw error;
    throw new ArchiveValidationError(
      error instanceof Error
        ? `The saved archive could not be verified: ${error.message}`
        : "The saved archive could not be verified.",
    );
  } finally {
    try {
      if (extractDir.exists) extractDir.delete();
    } catch {
      // Cache cleanup is best effort.
    }
  }
}
