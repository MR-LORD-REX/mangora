package com.mangora.app

import android.graphics.Bitmap
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.aomedia.avif.android.AvifDecoder
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.Executors

/**
 * Decodes AVIF pages with libavif/AOM and re-encodes the first frame as PNG.
 *
 * Android's platform decoders and Fresco cannot open the AVIF files served by
 * some extension CDNs (Atsumaru, for example). The reader, YOLO and OCR all
 * receive a normal PNG after this transcode, so the rest of the pipeline does
 * not need AVIF-aware image handling.
 */
class AvifModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val io = Executors.newSingleThreadExecutor()

  override fun getName(): String = "MangoraAvif"

  /** Accepts both expo-file-system `file://` uris and plain absolute paths. */
  private fun localFile(path: String): File {
    val uri = Uri.parse(path)
    if (uri.scheme.equals("file", ignoreCase = true)) {
      val decoded = uri.path
      if (!decoded.isNullOrEmpty()) return File(decoded)
    }
    return File(path)
  }

  @ReactMethod
  fun transcodeToPng(sourcePath: String, destPath: String, promise: Promise) {
    io.execute {
      var decoder: AvifDecoder? = null
      try {
        val source = localFile(sourcePath)
        val dest = localFile(destPath)
        val temp = File(dest.absolutePath + ".tmp")
        if (!source.exists()) {
          throw IllegalStateException("AVIF source does not exist: ${source.absolutePath}")
        }
        dest.parentFile?.mkdirs()

        val bytes = source.readBytes()
        val buffer = ByteBuffer.allocateDirect(bytes.size)
        buffer.put(bytes)
        buffer.rewind()

        decoder = AvifDecoder.create(buffer)
          ?: throw IllegalStateException("AVIF decoder could not open ${source.name}")
        val width = decoder.width
        val height = decoder.height
        if (width <= 0 || height <= 0) {
          throw IllegalStateException("AVIF image has invalid dimensions: ${width}x$height")
        }

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        try {
          val result = decoder.nextFrame(bitmap)
          if (result != 0) {
            throw IllegalStateException(
              "AVIF frame decode failed: ${AvifDecoder.resultToString(result)}"
            )
          }

          var encoded = false
          temp.outputStream().use { output ->
            encoded = bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
          }
          if (!encoded) {
            throw IllegalStateException("Could not encode the AVIF frame as PNG")
          }
        } finally {
          bitmap.recycle()
        }

        if (dest.exists()) dest.delete()
        if (!temp.renameTo(dest)) {
          temp.copyTo(dest, overwrite = true)
          temp.delete()
        }

        promise.resolve(Uri.fromFile(dest).toString())
      } catch (error: Throwable) {
        promise.reject("mangora_avif", error.message ?: "AVIF transcode failed", error)
      } finally {
        decoder?.release()
      }
    }
  }
}
