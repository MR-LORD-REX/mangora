/**
 * Public recovery API: rebuild rows from metadata.json and bulk-delete the
 * archives the catalog can identify.
 */

import type { DownloadMetadataReadResult } from "./catalogMetadata";
import { readDownloadMetadata } from "./catalogMetadata";

export {
  deleteAllDownloads,
  MISSING_METADATA_MESSAGE,
  MissingDownloadMetadataError,
  recoverDownloads,
} from "./recovery";
export type {
  DownloadDeletionResult,
  DownloadIssue,
  DownloadProgress,
  DownloadRecoveryResult,
} from "./recovery";

/** Read and validate metadata.json before showing the recovery confirmation. */
export function inspectDownloadMetadata(
  downloadsDirUri: string,
): Promise<DownloadMetadataReadResult> {
  return readDownloadMetadata(downloadsDirUri);
}