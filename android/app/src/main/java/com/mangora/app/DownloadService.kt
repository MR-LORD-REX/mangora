package com.mangora.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Foreground service that keeps the React Native process (and therefore the
 * JavaScript download queue) alive while chapters download in the background.
 *
 * The service owns a single progress notification. JavaScript updates it
 * through [DownloadModule] -> [update], which reposts the notification under
 * the same id the service is currently foregrounded with.
 *
 * The notification carries three actions, all delivered back to JavaScript
 * through [actionListener] (set by DownloadModule):
 *   - Pause  - pause the whole queue,
 *   - Resume - resume the whole queue (shown instead of Pause while paused),
 *   - Cancel - cancel only the chapter the notification is currently showing.
 */
class DownloadService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        finish()
        return START_NOT_STICKY
      }
      ACTION_PAUSE, ACTION_RESUME, ACTION_CANCEL -> {
        // Notification actions are forwarded to JavaScript; the service and its
        // notification stay alive so the queue can act on them.
        actionListener?.invoke(intent.action!!, intent.getStringExtra(EXTRA_JOB_ID))
        return START_STICKY
      }
      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE
        val text = intent?.getStringExtra(EXTRA_TEXT).orEmpty()
        val progress = intent?.getIntExtra(EXTRA_PROGRESS, 0) ?: 0
        val max = intent?.getIntExtra(EXTRA_MAX, 0) ?: 0
        val jobId = intent?.getStringExtra(EXTRA_JOB_ID)
        val paused = intent?.getBooleanExtra(EXTRA_PAUSED, false) ?: false
        startForegroundCompat(buildNotification(title, text, progress, max, jobId, paused))
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun finish() {
    running = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID)
    stopSelf()
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    running = true
  }

  private fun actionIntent(action: String, requestCode: Int, jobId: String?): PendingIntent {
    val intent = Intent(this, DownloadService::class.java).apply {
      this.action = action
      if (jobId != null) putExtra(EXTRA_JOB_ID, jobId)
    }
    return PendingIntent.getService(
      this,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun buildNotification(
    title: String,
    text: String,
    progress: Int,
    max: Int,
    jobId: String?,
    paused: Boolean
  ): Notification {
    ensureChannel()
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
    if (contentIntent != null) builder.setContentIntent(contentIntent)

    if (paused) {
      builder.addAction(
        0,
        "Resume",
        actionIntent(ACTION_RESUME, REQUEST_RESUME, null)
      )
    } else {
      builder.addAction(
        0,
        "Pause",
        actionIntent(ACTION_PAUSE, REQUEST_PAUSE, null)
      )
    }
    if (jobId != null) {
      builder.addAction(
        0,
        "Cancel",
        actionIntent(ACTION_CANCEL, REQUEST_CANCEL, jobId)
      )
    }

    if (max > 0) {
      builder.setProgress(max, progress.coerceIn(0, max), false)
    } else {
      builder.setProgress(0, 0, true)
    }
    return builder.build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Downloads",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Chapter download progress"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val ACTION_START = "com.mangora.app.download.START"
    private const val ACTION_STOP = "com.mangora.app.download.STOP"
    private const val ACTION_PAUSE = "com.mangora.app.download.PAUSE"
    private const val ACTION_RESUME = "com.mangora.app.download.RESUME"
    private const val ACTION_CANCEL = "com.mangora.app.download.CANCEL"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_PROGRESS = "progress"
    private const val EXTRA_MAX = "max"
    private const val EXTRA_JOB_ID = "jobId"
    private const val EXTRA_PAUSED = "paused"
    private const val CHANNEL_ID = "mangora-downloads"
    private const val NOTIFICATION_ID = 4201
    private const val DEFAULT_TITLE = "Mangora downloads"
    private const val REQUEST_PAUSE = 11
    private const val REQUEST_RESUME = 12
    private const val REQUEST_CANCEL = 13

    /** True while the service is foregrounded and accepting updates. */
    @Volatile
    var running: Boolean = false
      private set

    /**
     * Callback invoked on the main thread when the user taps a notification
     * action. DownloadModule wires this to a DeviceEventEmitter event.
     */
    @Volatile
    var actionListener: ((action: String, jobId: String?) -> Unit)? = null

    /** Maps a service action to the token JavaScript understands. */
    fun actionToken(action: String): String = when (action) {
      ACTION_PAUSE -> "pause"
      ACTION_RESUME -> "resume"
      ACTION_CANCEL -> "cancel"
      else -> "unknown"
    }

    /** Starts (or refreshes) the foreground service. */
    fun start(
      context: Context,
      title: String,
      text: String,
      progress: Int,
      max: Int,
      jobId: String?,
      paused: Boolean
    ) {
      val intent = Intent(context, DownloadService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_TEXT, text)
        putExtra(EXTRA_PROGRESS, progress)
        putExtra(EXTRA_MAX, max)
        if (jobId != null) putExtra(EXTRA_JOB_ID, jobId)
        putExtra(EXTRA_PAUSED, paused)
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (error: Exception) {
        // Android 12+ can refuse a background foreground-service start; the
        // queue keeps running while the process is alive either way.
        running = false
      }
    }

    /** Refreshes the notification attached to the running service. */
    fun update(
      context: Context,
      title: String,
      text: String,
      progress: Int,
      max: Int,
      jobId: String?,
      paused: Boolean
    ) {
      if (!running) return
      val intent = Intent(context, DownloadService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_TEXT, text)
        putExtra(EXTRA_PROGRESS, progress)
        putExtra(EXTRA_MAX, max)
        if (jobId != null) putExtra(EXTRA_JOB_ID, jobId)
        putExtra(EXTRA_PAUSED, paused)
      }
      try {
        context.startService(intent)
      } catch (error: Exception) {
        // Ignored: the queue is not affected by a failed notification update.
      }
    }

    /** Stops the service and removes its notification. */
    fun stop(context: Context) {
      if (!running) return
      val intent = Intent(context, DownloadService::class.java).apply { action = ACTION_STOP }
      try {
        context.startService(intent)
      } catch (error: Exception) {
        running = false
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
      }
    }
  }
}
