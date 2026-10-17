package com.mangora.app.extensions

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.model.Filter
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import kotlinx.coroutines.runBlocking
import okhttp3.Headers
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

class ExtensionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val io = Executors.newCachedThreadPool()

    init {
        ExtensionHost.initialize(reactContext.applicationContext)
    }

    override fun getName(): String = "MangoraExtensions"

    private fun context(): Context = reactContext.applicationContext

    private fun run(promise: Promise, block: () -> String) {
        io.execute {
            try {
                promise.resolve(block())
            } catch (error: Throwable) {
                promise.reject(
                    "mangora_extensions",
                    error.message ?: error.javaClass.simpleName,
                    error,
                )
            }
        }
    }

    @ReactMethod
    fun listInstalled(promise: Promise) = run(promise) {
        val array = JSONArray()
        ExtensionHost.installedExtensions(force = true).forEach { extension ->
            array.put(extension.toJson())
        }
        array.toString()
    }

    @ReactMethod
    fun listSources(promise: Promise) = run(promise) {
        val array = JSONArray()
        ExtensionHost.installedExtensions().forEach { extension ->
            extension.sources.forEach { source -> array.put(source.toJson()) }
        }
        array.toString()
    }

    @ReactMethod
    fun inspectApk(path: String, promise: Promise) = run(promise) {
        val info = ExtensionHost.inspectApk(path)
        JSONObject().apply {
            put("packageName", info.packageName)
            put("name", info.name)
            put("versionName", info.versionName)
            put("versionCode", info.versionCode)
            put("extensionLib", info.extensionLib)
            put("nsfw", info.nsfw)
            put("sourceClass", info.sourceClass ?: JSONObject.NULL)
            put("signatureSha256", info.signatureSha256 ?: JSONObject.NULL)
        }.toString()
    }

    @ReactMethod
    fun getPopular(sourceId: String, page: Int, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            runBlocking { source.getPopularManga(page) }.toJson(headersOf(source))
        }
    }

    @ReactMethod
    fun getLatest(sourceId: String, page: Int, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            runBlocking { source.getLatestUpdates(page) }.toJson(headersOf(source))
        }
    }

    @ReactMethod
    fun search(
        sourceId: String,
        page: Int,
        query: String,
        filtersJson: String,
        promise: Promise,
    ) = run(promise) {
        withSource(sourceId) { source ->
            val filters = applyFilters(source, filtersJson)
            runBlocking { source.getSearchManga(page, query, filters) }
                .toJson(headersOf(source))
        }
    }

    @ReactMethod
    fun getManga(sourceId: String, url: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            val manga = SManga.create().apply { this.url = normalizePath(url) }
            val update = runBlocking {
                source.getMangaUpdate(manga, emptyList(), true, true)
            }
            val resolvedManga = update.manga.also { result ->
                val current = runCatching { result.url }.getOrNull()
                if (current.isNullOrBlank()) result.url = manga.url
            }
            JSONObject().apply {
                put("manga", resolvedManga.toJson())
                put("chapters", update.chapters.toJsonArray())
                put("headers", headersOf(source).toJson())
                put("mangaUrl", sourceUrl(source, resolvedManga))
            }.toString()
        }
    }

    @ReactMethod
    fun getChapters(sourceId: String, url: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            val manga = SManga.create().apply { this.url = normalizePath(url) }
            val update = runBlocking {
                source.getMangaUpdate(manga, emptyList(), false, true)
            }
            JSONObject().apply {
                put("chapters", update.chapters.toJsonArray())
            }.toString()
        }
    }

    @ReactMethod
    fun getPages(sourceId: String, url: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            val chapter = SChapter.create().apply { this.url = normalizePath(url) }
            val pages = runBlocking { source.getPageList(chapter) }
            val resolved = pages.map { page ->
                var image = page.imageUrl
                if (image.isNullOrBlank()) {
                    val http = source as? eu.kanade.tachiyomi.source.online.HttpSource
                    image = runCatching {
                        if (http != null) runBlocking { http.getImageUrl(page) } else page.imageUrl
                    }.getOrNull()
                }
                page to (image ?: page.url)
            }
            val headers = headersOf(source)
            JSONObject().apply {
                put("headers", headers.toJson())
                put("pages", JSONArray().apply {
                    resolved.forEachIndexed { index, (page, image) ->
                        put(JSONObject().apply {
                            put("index", index)
                            put("url", page.url)
                            put("imageUrl", image)
                        })
                    }
                })
            }.toString()
        }
    }

    @ReactMethod
    fun getMangaUrl(sourceId: String, url: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            val manga = SManga.create().apply { this.url = normalizePath(url) }
            JSONObject().put("url", sourceUrl(source, manga)).toString()
        }
    }

    @ReactMethod
    fun getChapterUrl(sourceId: String, url: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            val chapter = SChapter.create().apply { this.url = normalizePath(url) }
            JSONObject().put("url", sourceChapterUrl(source, chapter)).toString()
        }
    }

    @ReactMethod
    fun getHeaders(sourceId: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            JSONObject().put("headers", headersOf(source).toJson()).toString()
        }
    }

    @ReactMethod
    fun getFilters(sourceId: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            JSONObject().put("filters", filtersToJson(source.getFilterList())).toString()
        }
    }

    private fun withSource(sourceId: String, block: (Source) -> String): String {
        val loaded = ExtensionHost.sourceById(sourceId)
            ?: throw IllegalStateException("Extension source $sourceId is not installed")
        val thread = Thread.currentThread()
        val previous = thread.contextClassLoader
        thread.contextClassLoader = loaded.loader
        return try {
            block(loaded.source)
        } finally {
            thread.contextClassLoader = previous
        }
    }

    private fun normalizePath(url: String): String {
        val trimmed = url.trim()
        if (trimmed.isEmpty() || trimmed.startsWith("/") ||
            trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ) return trimmed
        return "/$trimmed"
    }

    private fun sourceUrl(source: Source, manga: SManga): String {
        val http = source as? eu.kanade.tachiyomi.source.online.HttpSource
        if (http != null) return http.getMangaUrl(manga)
        return manga.url
    }

    private fun sourceChapterUrl(source: Source, chapter: SChapter): String {
        val http = source as? eu.kanade.tachiyomi.source.online.HttpSource
        if (http != null) return http.getChapterUrl(chapter)
        return chapter.url
    }

    private fun headersOf(source: Source): Headers {
        val http = source as? eu.kanade.tachiyomi.source.online.HttpSource
        return http?.headers ?: Headers.Builder().build()
    }

    private fun applyFilters(source: Source, filtersJson: String): FilterList {
        val original = source.getFilterList()
        if (filtersJson.isBlank()) return original
        val patch = runCatching { JSONArray(filtersJson) }.getOrNull() ?: return original
        for (i in 0 until patch.length()) {
            val entry = patch.optJSONObject(i) ?: continue
            val path = entry.optString("path", "")
            val filter = if (path.isNotBlank()) {
                filterAtPath(original, path)
            } else {
                original.getOrNull(entry.optInt("index", -1))
            }
            if (filter != null) applyFilterState(filter, entry.opt("state"))
        }
        return original
    }

    private fun filterAtPath(root: FilterList, path: String): Filter<*>? {
        val segments = path.split('.').mapNotNull { it.toIntOrNull() }
        if (segments.isEmpty()) return null
        var current: Filter<*> = root.getOrNull(segments.first()) ?: return null
        for (segment in segments.drop(1)) {
            val group = current as? Filter.Group<*> ?: return null
            current = group.state.getOrNull(segment) as? Filter<*> ?: return null
        }
        return current
    }

    @Suppress("UNCHECKED_CAST")
    private fun applyFilterState(filter: Filter<*>, value: Any?) {
        when (filter) {
            is Filter.Sort -> {
                if (value is JSONObject) {
                    filter.state = Filter.Sort.Selection(
                        value.optInt("index", 0),
                        value.optBoolean("ascending", true),
                    )
                }
            }
            is Filter.Group<*> -> {
                if (value is JSONArray) {
                    val children = filter.state as? List<Filter<*>> ?: return
                    for (i in 0 until minOf(children.size, value.length())) {
                        applyFilterState(children[i], value.opt(i))
                    }
                }
            }
            is Filter.Select<*> -> {
                if (value is Number) (filter as Filter<Any?>).state = value.toInt()
            }
            is Filter.TriState -> {
                if (value is Number) filter.state = value.toInt()
            }
            is Filter.CheckBox -> {
                if (value is Boolean) filter.state = value
            }
            is Filter.Text -> {
                if (value is String) filter.state = value
            }
            else -> Unit
        }
    }

    private fun filtersToJson(filters: FilterList): JSONArray = JSONArray().apply {
        filters.forEachIndexed { index, filter ->
            put(filterToJson(filter, index.toString()))
        }
    }

    private fun filterToJson(filter: Filter<*>, path: String): JSONObject = JSONObject().apply {
        put("path", path)
        put("name", filter.name)
        when (filter) {
            is Filter.Header -> put("type", "header")
            is Filter.Separator -> put("type", "separator")
            is Filter.Sort -> {
                put("type", "sort")
                put("values", JSONArray(filter.values.toList()))
                put("state", filter.state?.let {
                    JSONObject().put("index", it.index).put("ascending", it.ascending)
                } ?: JSONObject.NULL)
            }
            is Filter.Select<*> -> {
                put("type", "select")
                put("values", JSONArray(filter.values.toList()))
                put("state", filter.state)
            }
            is Filter.TriState -> {
                put("type", "tristate")
                put("state", filter.state)
            }
            is Filter.CheckBox -> {
                put("type", "checkbox")
                put("state", filter.state)
            }
            is Filter.Text -> {
                put("type", "text")
                put("state", filter.state)
            }
            is Filter.Group<*> -> {
                put("type", "group")
                put("children", JSONArray().apply {
                    filter.state.forEachIndexed { index, child ->
                        if (child is Filter<*>) {
                            put(filterToJson(child, "$path.$index"))
                        }
                    }
                })
            }
            else -> put("type", "unknown")
        }
    }
    private fun MangasPage.toJson(headers: Headers): String = JSONObject().apply {
        put("hasNextPage", hasNextPage)
        put("headers", headers.toJson())
        put("mangas", JSONArray().apply {
            mangas.forEach { put(it.toJson()) }
        })
    }.toString()

    private fun SManga.toJson(): JSONObject = JSONObject().apply {
        put("url", url)
        put("title", title)
        put("thumbnailUrl", thumbnail_url ?: JSONObject.NULL)
        put("artist", artist ?: JSONObject.NULL)
        put("author", author ?: JSONObject.NULL)
        put("status", status)
        put("description", description ?: JSONObject.NULL)
        put("genre", genre ?: JSONObject.NULL)
        put("genres", JSONArray(getGenres() ?: emptyList<String>()))
    }

    private fun SChapter.toJson(): JSONObject = JSONObject().apply {
        put("url", url)
        put("name", name)
        put("chapterNumber", if (chapter_number.isFinite()) chapter_number else JSONObject.NULL)
        put("scanlator", scanlator ?: JSONObject.NULL)
        put("dateUpload", date_upload)
    }

    private fun List<SChapter>.toJsonArray(): JSONArray = JSONArray().apply {
        this@toJsonArray.forEach { put(it.toJson()) }
    }

    private fun Headers.toJson(): JSONObject = JSONObject().apply {
        for (i in 0 until size) {
            put(name(i), value(i))
        }
    }

    private fun ExtensionSourceInfo.toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("name", name)
        put("lang", lang)
        put("packageName", packageName)
        put("nsfw", nsfw)
    }

    private fun InstalledExtensionInfo.toJson(): JSONObject = JSONObject().apply {
        put("packageName", packageName)
        put("name", name)
        put("versionName", versionName)
        put("versionCode", versionCode)
        put("sourceDir", sourceDir)
        put("extensionLib", extensionLib)
        put("nsfw", nsfw)
        put("signatureSha256", signatureSha256 ?: JSONObject.NULL)
        put("error", error ?: JSONObject.NULL)
        put("sources", JSONArray().apply {
            this@toJson.sources.forEach { put(it.toJson()) }
        })
    }
}