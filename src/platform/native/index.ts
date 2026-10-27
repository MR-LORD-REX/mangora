/** Typed bridges to the Android updater/installer helpers. */

export {
  canRequestPackageInstalls,
  hasNativeInstaller,
  installApk,
  openInstallPermissionSettings,
  sha256OfFile,
} from "./updater";