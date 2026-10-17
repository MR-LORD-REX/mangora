package eu.kanade.tachiyomi

import com.mangora.app.BuildConfig

object AppInfo {
    val versionCode: Int get() = BuildConfig.VERSION_CODE
    val versionName: String get() = BuildConfig.VERSION_NAME
}