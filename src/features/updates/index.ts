/** Public API for the in-app updater and release feed. */

export {
  compareVersions,
  currentVersion,
  type AvailableUpdate,
} from "./data/github";
export {
  checkForUpdate,
  downloadUpdate,
  installPermissionState,
  installUpdate,
  openDownloadPage,
  openInstallSettings,
  type DownloadOutcome,
  type DownloadProgress,
  type InstallPermissionState,
  type UpdateCheck,
} from "./services/updater";