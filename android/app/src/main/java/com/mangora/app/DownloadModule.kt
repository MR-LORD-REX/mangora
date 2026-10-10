package com.mangora.app

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.zip.Deflater
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Native helpers for the chapter downloader.
 *
 * The downloader itself (queue, retries, metadata) lives in JavaScript; this
 * module covers the three things JavaScript cannot do:
 *
 *  1. build the .cbz archive by streaming page files (no large JS buffers),
 *  2. write that archive into the user-picked SAF folder (content:// URIs
 *     cannot be streamed through expo-file-system),
 *  3. keep the process alive with a foreground service and report Wi-Fi state.
 */
class DownloadModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val io = Executors.newSingleThreadExecutor()

  init {
    // Notification actions (Pause/Resume/Cancel) are re-emitted to JS so the
    // download scheduler can act on them.
    DownloadService.actionListener = { action, jobId ->
      try {
        val payload = Arguments.createMap()
        payload.putString("action", DownloadService.actionToken(action))
        payload.putString("jobId", jobId)
        reactContext.emitDeviceEvent(EVENT_DOWNLOAD_ACTION, payload)
      } catch (error: Exception) {
        // The JS runtime may be gone; notification actions are then a no-op.
      }
    }
  }

  override fun getName(): String = "MangoraDownloader"

  private fun context(): Context = reactContext.applicationContext

  /**
   * JavaScript hands over `expo-file-system` uris (`file:///data/...`), which
   * `java.io.File` cannot open: it would treat the scheme as a relative path.
   * Plain paths are passed through unchanged.
   */
  private fun localFile(path: String): File {
    val uri = Uri.parse(path)
    val scheme = uri.scheme
    if (scheme.equals("file", ignoreCase = true)) {
      val decoded = uri.path
      if (!decoded.isNullOrEmpty()) return File(decoded)
    }
    return File(path)
  }

  private fun runAsync(promise: Promise, block: () -> Any?) {
    io.execute {
      try {
        promise.resolve(block())
      } catch (error: Exception) {
        promise.reject("mangora_downloader", error.message ?: "Downloader error", error)
      }
    }
  }

  /** Resolves `{ connected, wifi }` for the currently active network. */
  @ReactMethod
  fun isWifiConnected(promise: Promise) {
    try {
      val manager = context().getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val capabilities = manager.activeNetwork?.let { manager.getNetworkCapabilities(it) }
      val result = Arguments.createMap()
      val connected = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
      val wifi = connected && (
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        )
      result.putBoolean("connected", connected)
      result.putBoolean("wifi", wifi)
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("mangora_downloader", error.message ?: "Could not read network state", error)
    }
  }

  /**
   * Walks `segments` below `parentUri`, creating missing directories, and
   * resolves the final child uri. Existing directories are reused instead of
   * letting the provider create "name (1)" duplicates.
   */
  @ReactMethod
  fun ensureDirectories(parentUri: String, segments: ReadableArray, promise: Promise) {
    runAsync(promise) {
      var current = DocumentFile.fromTreeUri(context(), Uri.parse(parentUri))
        ?: throw IllegalStateException("Folder access was revoked: $parentUri")
      if (!current.canWrite()) {
        throw IllegalStateException("The selected folder is not writable")
      }
      for (index in 0 until segments.size()) {
        val name = segments.getString(index) ?: continue
        if (name.isEmpty()) continue
        val existing = current.findFile(name)
        current = when {
          existing != null && existing.isDirectory -> existing
          existing != null -> throw IllegalStateException("'$name' already exists as a file")
          else -> current.createDirectory(name)
            ?: throw IllegalStateException("Could not create folder '$name'")
        }
      }
      current.uri.toString()
    }
  }

  /**
   * Streams `sourcePath` into `parentUri/fileName`, replacing a previous file
   * with the same name. Resolves the created document uri.
   */
  @ReactMethod
  fun writeSafFile(
    parentUri: String,
    fileName: String,
    mimeType: String,
    sourcePath: String,
    promise: Promise
  ) {
    runAsync(promise) {
      val source = localFile(sourcePath)
      if (!source.exists()) throw IllegalStateException("Missing file: $sourcePath")
      val parent = DocumentFile.fromTreeUri(context(), Uri.parse(parentUri))
        ?: throw IllegalStateException("Folder access was revoked: $parentUri")
      parent.findFile(fileName)?.delete()
      val document = parent.createFile(mimeType, fileName)
        ?: throw IllegalStateException("Could not create '$fileName'")
      context().contentResolver.openOutputStream(document.uri, "w").use { output ->
        if (output == null) throw IllegalStateException("Could not open '$fileName' for writing")
        FileInputStream(source).use { input -> input.copyTo(output) }
      }
      document.uri.toString()
    }
  }

  /** Deletes a document created by [writeSafFile] (used when re-downloading). */
  @ReactMethod
  fun deleteSafDocument(uri: String, promise: Promise) {
    runAsync(promise) {
      val document = DocumentFile.fromSingleUri(context(), Uri.parse(uri))
      document?.delete() ?: false
    }
  }

  /**
   * Copies a document the user picked (a content:// uri, unreadable through
   * the JavaScript filesystem) into `destPath` and resolves the local path.
   */
  @ReactMethod
  fun readSafDocument(uri: String, destPath: String, promise: Promise) {
    runAsync(promise) {
      val destination = localFile(destPath)
      destination.parentFile?.mkdirs()
      context().contentResolver.openInputStream(Uri.parse(uri)).use { input ->
        if (input == null) throw IllegalStateException("Could not read: $uri")
        FileOutputStream(destination).use { output -> input.copyTo(output) }
      }
      destination.absolutePath
    }
  }

  /** Extracts numbered page images from a downloaded CBZ into the app cache. */
  @ReactMethod
  fun extractSafArchivePages(uri: String, destDirPath: String, promise: Promise) {
    runAsync(promise) {
      val destination = localFile(destDirPath)
      if (!destination.exists() && !destination.mkdirs()) {
        throw IllegalStateException("Could not create the downloaded pages cache")
      }
      val pageName = Regex("""^\d{4,}\.(jpe?g|png|webp|gif|avif|bmp)$""", RegexOption.IGNORE_CASE)

      val pages = Arguments.createArray()
      var clearedExistingPages = false
      context().contentResolver.openInputStream(Uri.parse(uri)).use { input ->
        if (input == null) throw IllegalStateException("Downloaded archive is unavailable")
        ZipInputStream(BufferedInputStream(input)).use { zip ->
          while (true) {
            val entry = zip.nextEntry ?: break
            val name = entry.name
            if (
              !entry.isDirectory &&
              !name.contains("/") &&
              !name.contains("\\") &&
              pageName.matches(name)
            ) {
              if (!clearedExistingPages) {
                destination.listFiles()
                  ?.filter { it.isFile && pageName.matches(it.name) }
                  ?.forEach { it.delete() }
                clearedExistingPages = true
              }
              val outputFile = File(destination, name)
              FileOutputStream(outputFile).use { output ->
                val buffer = ByteArray(8192)
                while (true) {
                  val count = zip.read(buffer)
                  if (count < 0) break
                  output.write(buffer, 0, count)
                }
              }
              pages.pushString(Uri.fromFile(outputFile).toString())
            }
            zip.closeEntry()
          }
        }
      }
      pages
    }
  }

  /**
   * Deletes `<parentUri>/<segments...>` when that chain already exists, without
   * creating anything. Resolves true when a directory was removed.
   */
  @ReactMethod
  fun deleteSafPath(parentUri: String, segments: ReadableArray, promise: Promise) {
    runAsync(promise) {
      var current = DocumentFile.fromTreeUri(context(), Uri.parse(parentUri))
        ?: return@runAsync false
      for (index in 0 until segments.size()) {
        val name = segments.getString(index) ?: return@runAsync false
        if (name.isEmpty()) continue
        current = current.findFile(name) ?: return@runAsync false
      }
      if (current.isDirectory) current.delete() else false
    }
  }

  /** Human readable path of a picked tree, e.g. "Internal storage/Download". */
  @ReactMethod
  fun describeSafTree(uri: String, promise: Promise) {
    runAsync(promise) {
      val documentId = try {
        DocumentsContract.getTreeDocumentId(Uri.parse(uri))
      } catch (error: Exception) {
        null
      } ?: return@runAsync ""
      val parts = documentId.split(":", limit = 2)
      val volume = parts.getOrNull(0).orEmpty()
      val path = parts.getOrNull(1).orEmpty()
      val label = when (volume) {
        "primary" -> "Internal storage"
        else -> volume
      }
      if (path.isEmpty()) label else "$label/$path"
    }
  }

  /**
   * Builds a stored-entry zip from `entries` (`[{ path, name }]`) at
   * `destPath`. Page images are already compressed, so entries are written
   * with deflate level 0 to keep the archive fast and memory flat.
   */
  @ReactMethod
  fun zipPages(entries: ReadableArray, destPath: String, promise: Promise) {
    runAsync(promise) {
      val destination = localFile(destPath)
      destination.parentFile?.mkdirs()
      if (destination.exists()) destination.delete()
      var written = 0
      ZipOutputStream(BufferedOutputStream(FileOutputStream(destination))).use { zip ->
        zip.setLevel(Deflater.NO_COMPRESSION)
        for (index in 0 until entries.size()) {
          val entry = entries.getMap(index) ?: continue
          val path = entry.getString("path") ?: continue
          val name = entry.getString("name") ?: continue
          val source = localFile(path)
          if (!source.exists()) continue
          zip.putNextEntry(ZipEntry(name))
          FileInputStream(source).use { input -> input.copyTo(zip) }
          zip.closeEntry()
          written += 1
        }
      }
      val result = Arguments.createMap()
      result.putInt("entries", written)
      result.putDouble("size", destination.length().toDouble())
      result.putString("path", destination.absolutePath)
      result
    }
  }

  @ReactMethod
  fun startDownloadService(
    title: String,
    text: String,
    progress: Double,
    max: Double,
    jobId: String?,
    paused: Boolean
  ) {
    DownloadService.start(
      context(),
      title,
      text,
      progress.toInt(),
      max.toInt(),
      jobId,
      paused
    )
  }

  @ReactMethod
  fun updateDownloadService(
    text: String,
    progress: Double,
    max: Double,
    jobId: String?,
    paused: Boolean
  ) {
    DownloadService.update(
      context(),
      "Mangora downloads",
      text,
      progress.toInt(),
      max.toInt(),
      jobId,
      paused
    )
  }

  @ReactMethod
  fun stopDownloadService() {
    DownloadService.stop(context())
  }

  // -------------------------------------------------------------------------
  // In-app updater (plan S14.4). The APK itself is fetched in JavaScript; the
  // module only owns the parts that need a real Android context: the install
  // permission gate and handing the file to the system package installer.
  // -------------------------------------------------------------------------

  /** True when the app is allowed to install packages (always true below API 26). */
  @ReactMethod
  fun canRequestPackageInstalls(promise: Promise) {
    try {
      val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context().packageManager.canRequestPackageInstalls()
      } else {
        true
      }
      promise.resolve(allowed)
    } catch (error: Exception) {
      promise.reject(
        "mangora_downloader",
        error.message ?: "Could not read the install permission",
        error
      )
    }
  }

  /** Opens the "install unknown apps" screen scoped to this package. */
  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${context().packageName}")
        )
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context().startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject(
        "mangora_downloader",
        error.message ?: "Could not open the install settings",
        error
      )
    }
  }

  /**
   * Hands a downloaded APK to the system installer through a FileProvider uri
   * (ACTION_VIEW + the package-archive mime type + a read grant). Android then
   * runs the normal "update this app" flow, which installs over the previous
   * version without an uninstall.
   */
  @ReactMethod
  fun installApk(path: String, promise: Promise) {
    runAsync(promise) {
      val apk = localFile(path)
      if (!apk.exists()) throw IllegalStateException("APK not found: $path")
      val authority = "${context().packageName}.mangora.updates"
      val uri = FileProvider.getUriForFile(context(), authority, apk)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context().startActivity(intent)
      true
    }
  }

  /** Streaming SHA-256 of a file, hex encoded. Used to verify an update APK. */
  @ReactMethod
  fun sha256OfFile(path: String, promise: Promise) {
    runAsync(promise) {
      val file = localFile(path)
      if (!file.exists()) throw IllegalStateException("File not found: $path")
      val digest = MessageDigest.getInstance("SHA-256")
      FileInputStream(file).use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          digest.update(buffer, 0, read)
        }
      }
      digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }
  }

  companion object {
    const val EVENT_DOWNLOAD_ACTION = "MangoraDownloader:action"
  }
}
