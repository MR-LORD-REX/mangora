package com.mangora.app.extensions

import android.content.Context
import android.net.Uri
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
import eu.kanade.tachiyomi.source.online.HttpSource
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.Headers
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class ExtensionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val io = Executors.newCachedThreadPool()
    private val chapterMemos = ConcurrentHashMap<String, JsonObject>()

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
            withMangaFallback(url) { identity ->
                withPathFallback(identity) { path ->
                    val manga = SManga.create().apply { this.url = path; this.title = "" }
                    val update = runBlocking {
                        source.getMangaUpdate(manga, emptyList(), true, true)
                    }
                    val resolvedManga = update.manga.also { result ->
                        val current = runCatching { result.url }.getOrNull()
                        if (current.isNullOrBlank()) result.url = manga.url
                        // Some extensions return a fresh SManga with fields left
                        // unset; getMangaUrl may dereference title immediately.
                        val resolvedTitle = runCatching { result.title }.getOrNull()
                        if (resolvedTitle.isNullOrBlank()) result.title = manga.title
                    }
                    rememberChapterMemos(sourceId, update.chapters)
                    JSONObject().apply {
                        put("manga", resolvedManga.toJson())
                        put("chapters", update.chapters.toJsonArray())
                        put("headers", headersOf(source).toJson())
                        put("mangaUrl", sourceUrl(source, resolvedManga))
                    }.toString()
                }
            }
        }
    }

    @ReactMethod
    fun getChapters(sourceId: String, url: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            withMangaFallback(url) { identity ->
                withPathFallback(identity) { path ->
                    val manga = SManga.create().apply { this.url = path; this.title = "" }
                    val update = runBlocking {
                        source.getMangaUpdate(manga, emptyList(), false, true)
                    }
                    rememberChapterMemos(sourceId, update.chapters)
                    JSONObject().apply {
                        put("chapters", update.chapters.toJsonArray())
                    }.toString()
                }
            }
        }
    }

    @ReactMethod
    fun getPages(
        sourceId: String,
        url: String,
        memoJson: String,
        mangaId: String,
        promise: Promise,
    ) = run(promise) {
        withSource(sourceId) { source ->
            fun loadPages(path: String, memo: JsonObject): String {
                val chapter = SChapter.create().apply {
                    this.url = path
                    this.name = ""
                    this.memo = memo
                }
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
                return JSONObject().apply {
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

            // Path variants repair older rows: Madara/Philia sometimes stored a
            // leading slash, and legacy Philia rows used "chapter-2" instead of
            // "2". The original path is always tried first.
            val paths = chapterPathCandidates(url)
            val primaryMemo = parseMemo(memoJson, sourceId, url)
            val memos = linkedSetOf(primaryMemo)
            if (primaryMemo.isEmpty() && mangaId.isNotBlank()) {
                // AryaScans/BrainRotComics read SChapter.memo["mangaPath"].
                // Old history rows predate memo persistence; the provider
                // manga id is the same value the extension puts there.
                memos.add(JsonObject(mapOf("mangaPath" to JsonPrimitive(mangaId.trim()))))
            }

            var failure: Throwable? = null
            for (path in paths) {
                for (memo in memos) {
                    try {
                        return@withSource loadPages(path, memo)
                    } catch (error: Throwable) {
                        failure?.addSuppressed(error)
                        failure = error
                    }
                }
            }
            throw failure ?: IllegalStateException("Extension returned no pages")
        }
    }

    @ReactMethod
    fun fetchPageImage(
        sourceId: String,
        imageUrl: String,
        pageUrl: String,
        promise: Promise,
    ) = run(promise) {
        withSource(sourceId) { source ->
            val http = source as? HttpSource
                ?: throw IllegalStateException("Source $sourceId cannot fetch images")
            val page = Page(0, pageUrl.ifBlank { imageUrl.substringBefore('#') }, imageUrl)
            val response = http.client.newCall(http.imageRequestFor(page)).execute()
            response.use {
                if (!it.isSuccessful) {
                    throw eu.kanade.tachiyomi.network.HttpException(it.code)
                }
                val body = it.body ?: throw IllegalStateException("Empty image response")
                val mime = body.contentType()?.toString()?.substringBefore(';') ?: "image/jpeg"
                val extension = when (mime.lowercase()) {
                    "image/png" -> "png"
                    "image/webp" -> "webp"
                    "image/gif" -> "gif"
                    "image/avif" -> "avif"
                    else -> "jpg"
                }
                val digest = MessageDigest.getInstance("SHA-256")
                    .digest(imageUrl.toByteArray())
                    .joinToString("") { byte -> "%02x".format(byte) }
                val dir = File(reactContext.cacheDir, "ext-images").apply { mkdirs() }
                val target = File(dir, "$digest.$extension")
                if (!target.exists() || target.length() == 0L) {
                    body.byteStream().use { input ->
                        target.outputStream().use { output -> input.copyTo(output) }
                    }
                }
                JSONObject().apply {
                    put("path", Uri.fromFile(target).toString())
                    put("mime", mime)
                }.toString()
            }
        }
    }

    @ReactMethod
    fun getMangaUrl(sourceId: String, url: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            val manga = SManga.create().apply { this.url = preferredIdentity(url); this.title = "" }
            JSONObject().put("url", sourceUrl(source, manga)).toString()
        }
    }

    @ReactMethod
    fun getChapterUrl(sourceId: String, url: String, promise: Promise) = run(promise) {
        withSource(sourceId) { source ->
            val chapter = SChapter.create().apply { this.url = preferredIdentity(url); this.name = "" }
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

    /**
     * Extension URLs are either opaque ids ("118", a MangaDex UUID, ...) or
     * paths ("/manga/118"). Prepending a slash to an id silently corrupts
     * every request built from it, so keep the value verbatim.
     *
     * Older Mangora rows may have stored `/118` after the previous blanket
     * slash fix. A single-segment value after the slash is an id, not a path,
     * so repair just that shape. Multi-segment paths keep their slash.
     */
    private fun preferredIdentity(url: String): String {
        val raw = url.trim()
        if (!raw.startsWith("/")) return raw
        val rest = raw.trimStart('/')
        return if (rest.isNotEmpty() && !rest.contains('/')) rest else raw
    }

    private fun memoKey(sourceId: String, url: String): String = "$sourceId\u0000$url"

    private fun rememberChapterMemos(sourceId: String, chapters: List<SChapter>) {
        chapters.forEach { chapter -> chapterMemos[memoKey(sourceId, chapter.url)] = chapter.memo }
    }

    private fun parseMemo(raw: String, sourceId: String, url: String): JsonObject {
        if (raw.isNotBlank()) {
            val parsed = runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull()
            if (parsed != null && parsed.isNotEmpty()) return parsed
        }
        return chapterMemos[memoKey(sourceId, url)] ?: JsonObject(emptyMap())
    }

    private fun <T> withPathFallback(url: String, block: (String) -> T): T {
        val raw = url.trim()
        val preferred = preferredIdentity(raw)
        val candidates = when {
            raw.isEmpty() || raw.startsWith("http://") || raw.startsWith("https://") ->
                listOf(raw)
            preferred == raw && raw.startsWith("/") -> listOf(raw)
            preferred == raw -> listOf(raw, "/$raw")
            else -> listOf(preferred, raw)
        }
        var failure: Throwable? = null
        for (candidate in candidates) {
            try {
                return block(candidate)
            } catch (error: Throwable) {
                failure?.addSuppressed(error)
                failure = error
            }
        }
        throw failure ?: IllegalStateException("Extension returned no result")
    }

    /**
     * Some extensions expect the bare slug/id in `SManga.url`, while older
     * Mangora rows may hold the full `/manga/<id>` path. Only retry with the
     * last path segment after the preferred identity fails.
     */
    private fun <T> withMangaFallback(url: String, block: (String) -> T): T {
        val preferred = preferredIdentity(url)
        val path = preferred.substringBefore('?').substringBefore('#').trimEnd('/')
        val last = path.substringAfterLast('/')
        val candidates = linkedSetOf(preferred)
        if (last.isNotBlank() && last != path) candidates.add(last)
        var failure: Throwable? = null
        for (candidate in candidates) {
            try {
                return block(candidate)
            } catch (error: Throwable) {
                failure?.addSuppressed(error)
                failure = error
            }
        }
        throw failure ?: IllegalStateException("Extension returned no result")
    }

    private fun sourceUrl(source: Source, manga: SManga): String {
        val http = source as? eu.kanade.tachiyomi.source.online.HttpSource
        val url = if (http != null) http.getMangaUrl(manga) else manga.url
        return cleanUrl(url)
    }

    private fun sourceChapterUrl(source: Source, chapter: SChapter): String {
        val http = source as? eu.kanade.tachiyomi.source.online.HttpSource
        val url = if (http != null) http.getChapterUrl(chapter) else chapter.url
        return cleanUrl(url)
    }

    /** Collapses repeated path separators while keeping the URL scheme intact. */
    private fun cleanUrl(url: String): String = url.replace(Regex("(?<!:)/{2,}"), "/")

    private fun legacyChapterUrl(url: String): String? {
        val match = Regex("(^|/)chapter-([^/?#]+)(?=$|[?#])").find(url) ?: return null
        return url.replaceRange(match.range, match.groupValues[1] + match.groupValues[2])
    }

    /**
     * Ordered path repairs for chapter ids. Full URLs are passed through
     * untouched; relative ids get slash and legacy "chapter-N" variants.
     */
    private fun chapterPathCandidates(url: String): List<String> {
        val raw = url.trim()
        if (raw.isEmpty() || raw.startsWith("http://") || raw.startsWith("https://")) {
            return listOf(raw)
        }
        val out = linkedSetOf<String>()
        fun add(value: String?) {
            if (!value.isNullOrBlank()) out.add(value)
        }
        val preferred = preferredIdentity(raw)
        val noLeading = raw.trimStart('/')
        val legacy = legacyChapterUrl(raw)
        val legacyNoLeading = legacy?.trimStart('/')
        add(preferred)
        add(raw)
        add(noLeading)
        add("/" + noLeading)
        add(noLeading.trimEnd('/'))
        add(legacy)
        add(legacyNoLeading)
        add(legacyNoLeading?.trimEnd('/')?.substringAfterLast('/'))
        return out.toList()
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
        put("memo", JSONObject(memo.toString()))
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
