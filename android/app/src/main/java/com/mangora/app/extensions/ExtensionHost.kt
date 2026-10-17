package com.mangora.app.extensions

import android.app.Application
import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import com.android.apksig.ApkVerifier
import eu.kanade.tachiyomi.network.JavaScriptEngine
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.SourceFactory
import kotlinx.serialization.json.Json
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.FullTypeReference
import uy.kohesive.injekt.api.InjektScope
import java.io.File
import java.security.MessageDigest

data class ExtensionSourceInfo(
    val id: String,
    val name: String,
    val lang: String,
    val packageName: String,
    val nsfw: Boolean,
)

data class InstalledExtensionInfo(
    val packageName: String,
    val name: String,
    val versionName: String,
    val versionCode: Long,
    val sourceDir: String,
    val extensionLib: String,
    val nsfw: Boolean,
    val signatureSha256: String?,
    val sources: List<ExtensionSourceInfo>,
    val error: String?,
)

data class ExtensionPackageInfo(
    val packageName: String,
    val name: String,
    val versionName: String,
    val versionCode: Long,
    val extensionLib: String,
    val nsfw: Boolean,
    val sourceClass: String?,
    val signatureSha256: String?,
)

class LoadedSource(
    val source: Source,
    val loader: ClassLoader,
    val packageName: String,
)

/**
 * Owns every interaction with extension APKs. The rest of the app only sees
 * source ids and normalized data, so this can later move into an isolated
 * process without changing the React Native surface.
 */
object ExtensionHost {
    private const val META_FEATURE = "tachiyomi.extension"
    private const val META_CLASS = "tachiyomi.extension.class"
    private const val META_NAME = "tachiyomix.name"
    private const val META_NAME_LEGACY = "tachiyomi.extension.name"
    private const val META_NSFW = "tachiyomi.extension.nsfw"
    private const val META_WARNING = "tachiyomix.contentWarning"
    private const val META_LIB = "tachiyomix.extensionLib"
    private const val META_LIB_LEGACY = "tachiyomi.extension.lib"

    private var appContext: Context? = null
    private val loaders = mutableMapOf<String, ClassLoader>()
    private val sources = mutableMapOf<String, LoadedSource>()
    private val packageCache = mutableMapOf<String, InstalledExtensionInfo>()

    @Synchronized
    fun initialize(context: Context) {
        val app = context.applicationContext as Application
        appContext = app

        val scope = InjektScope()
        scope.addSingleton(object : FullTypeReference<Application>() {}, app)
        scope.addSingleton(object : FullTypeReference<Context>() {}, app)
        scope.addSingleton(
            object : FullTypeReference<NetworkHelper>() {},
            NetworkHelper(app),
        )
        scope.addSingleton(
            object : FullTypeReference<JavaScriptEngine>() {},
            JavaScriptEngine(app),
        )
        scope.addSingleton(
            object : FullTypeReference<Json>() {},
            Json {
                ignoreUnknownKeys = true
                coerceInputValues = true
                explicitNulls = false
            },
        )
        Injekt = scope
    }

    private fun context(): Context =
        appContext ?: throw IllegalStateException("ExtensionHost is not initialized")

    fun installedExtensions(force: Boolean = false): List<InstalledExtensionInfo> {
        val pm = context().packageManager
        if (!force && packageCache.isNotEmpty()) return packageCache.values.toList()

        val result = mutableListOf<InstalledExtensionInfo>()
        for (info in extensionPackages(pm)) {
            val packageName = info.packageName
            val versionCode = versionCodeOf(info)
            val key = "$packageName:$versionCode"
            val existing = packageCache[packageName]
            if (existing != null && existing.versionCode == versionCode) {
                result.add(existing)
                continue
            }
            val loaded = loadPackage(info, pm)
            packageCache[packageName] = loaded
            result.add(loaded)
        }

        val installedNames = result.map { it.packageName }.toSet()
        packageCache.keys.filterNot { it in installedNames }.forEach { key ->
            packageCache.remove(key)
            sources.keys.filter { sources[it]?.packageName == key }.forEach { sources.remove(it) }
        }
        return result.sortedBy { it.name.lowercase() }
    }

    fun sourceById(id: String): LoadedSource? {
        sources[id]?.let { return it }
        installedExtensions()
        return sources[id]
    }

    fun sourceInfo(id: String): ExtensionSourceInfo? {
        installedExtensions().forEach { extension ->
            extension.sources.firstOrNull { it.id == id }?.let { return it }
        }
        return null
    }

    fun inspectApk(path: String): ExtensionPackageInfo {
        val file = File(path.removePrefix("file://"))
        if (!file.exists()) throw IllegalStateException("APK not found: ${file.absolutePath}")
        val pm = context().packageManager
        @Suppress("DEPRECATION")
        val info = pm.getPackageArchiveInfo(
            file.absolutePath,
            PackageManager.GET_META_DATA or signingFlag(),
        ) ?: throw IllegalStateException("Could not read APK package metadata")
        val meta = info.applicationInfo?.metaData ?: Bundle.EMPTY
        return ExtensionPackageInfo(
            packageName = info.packageName,
            name = metaString(meta, META_NAME, metaString(meta, META_NAME_LEGACY, info.packageName)) ?: info.packageName,
            versionName = info.versionName ?: "",
            versionCode = versionCodeOf(info),
            extensionLib = metaString(meta, META_LIB, metaString(meta, META_LIB_LEGACY, "")) ?: "",
            nsfw = metaNsfw(meta),
            sourceClass = metaString(meta, META_CLASS, null),
            signatureSha256 = apkSignatureSha256(file),
        )
    }

    private fun extensionPackages(pm: PackageManager): List<PackageInfo> {
        @Suppress("DEPRECATION")
        val packages = pm.getInstalledPackages(PackageManager.GET_META_DATA or signingFlag())
        return packages.filter { info ->
            val meta = info.applicationInfo?.metaData ?: return@filter false
            metaBool(meta, META_FEATURE) ||
                metaString(meta, META_CLASS, null) != null
        }
    }

    private fun loadPackage(info: PackageInfo, pm: PackageManager): InstalledExtensionInfo {
        val meta = info.applicationInfo?.metaData ?: Bundle.EMPTY
        val packageName = info.packageName
        val sourceDir = info.applicationInfo?.sourceDir ?: ""
        val className = metaString(meta, META_CLASS, null)
        val extension = InstalledExtensionInfo(
            packageName = packageName,
            name = metaString(meta, META_NAME, metaString(meta, META_NAME_LEGACY, packageName)) ?: packageName,
            versionName = info.versionName ?: "",
            versionCode = versionCodeOf(info),
            sourceDir = sourceDir,
            extensionLib = metaString(meta, META_LIB, metaString(meta, META_LIB_LEGACY, "")) ?: "",
            nsfw = metaNsfw(meta),
            signatureSha256 = installedSignatureSha256(info),
            sources = emptyList(),
            error = null,
        )
        if (className == null || sourceDir.isEmpty()) {
            return extension.copy(error = "Extension metadata is missing its source class")
        }

        return try {
            val actualLoader = loaders.getOrPut("$packageName:${extension.versionCode}") {
                @Suppress("DEPRECATION")
                PathClassLoaderCompat.create(sourceDir, context().classLoader)
            }
            val clazz = Class.forName(className, true, actualLoader)
            val instance = clazz.getDeclaredConstructor().newInstance()
            val created: List<Source> = when (instance) {
                is SourceFactory -> instance.createSources()
                is Source -> listOf(instance)
                else -> throw IllegalStateException(
                    "$className is neither a Source nor a SourceFactory",
                )
            }
            val infoList = created.mapNotNull { source ->
                val catalogue = source as? CatalogueSource ?: return@mapNotNull null
                val sourceId = source.id.toString()
                sources[sourceId] = LoadedSource(source, actualLoader, packageName)
                ExtensionSourceInfo(
                    id = sourceId,
                    name = source.name,
                    lang = catalogue.lang,
                    packageName = packageName,
                    nsfw = extension.nsfw,
                )
            }
            extension.copy(sources = infoList)
        } catch (error: Throwable) {
            extension.copy(
                error = error.message ?: error.javaClass.simpleName,
            )
        }
    }

    private fun metaString(meta: Bundle, key: String, fallback: String?): String? =
        (meta.get(key) as? String)?.takeIf { it.isNotBlank() } ?: fallback

    private fun metaBool(meta: Bundle, key: String): Boolean {
        val value = meta.get(key) ?: return false
        return when (value) {
            is Boolean -> value
            is Number -> value.toInt() != 0
            is String -> value.equals("true", ignoreCase = true) || value == "1"
            else -> false
        }
    }

    private fun metaNsfw(meta: Bundle): Boolean =
        metaBool(meta, META_NSFW) || metaBool(meta, META_WARNING)

    private fun signingFlag(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }

    private fun versionCodeOf(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }

    private fun installedSignatureSha256(info: PackageInfo): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val signer = info.signingInfo?.apkContentsSigners?.firstOrNull() ?: return null
                sha256Hex(signer.toByteArray())
            } else {
                @Suppress("DEPRECATION")
                val signer = info.signatures?.firstOrNull() ?: return null
                sha256Hex(signer.toByteArray())
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun apkSignatureSha256(file: File): String? {
        return try {
            val result = ApkVerifier.Builder(file).build().verify()
            if (!result.isVerified) return null
            result.signerCertificates.firstOrNull()?.let { sha256Hex(it.encoded) }
        } catch (_: Throwable) {
            null
        }
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { byte -> "%02x".format(byte) }
}

private object PathClassLoaderCompat {
    @Suppress("DEPRECATION")
    fun create(dexPath: String, parent: ClassLoader?): ClassLoader =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            dalvik.system.PathClassLoader(dexPath, null, parent)
        } else {
            dalvik.system.PathClassLoader(dexPath, parent)
        }
}