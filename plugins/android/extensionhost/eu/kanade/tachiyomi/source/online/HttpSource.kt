package eu.kanade.tachiyomi.source.online

import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import uy.kohesive.injekt.Injekt
import java.net.URI
import java.net.URISyntaxException
import java.security.MessageDigest

abstract class HttpSource : CatalogueSource {
    protected val network: NetworkHelper by lazy {
        Injekt.getInstance(NetworkHelper::class.java)
    }

    abstract val baseUrl: String

    open fun getHomeUrl(): String = baseUrl

    open val versionId: Int = 1

    override val id: Long by lazy { generateId(name, lang, versionId) }

    val headers: Headers by lazy { headersBuilder().build() }

    open val client: OkHttpClient get() = network.client

    protected fun generateId(name: String, lang: String, versionId: Int): Long {
        val key = "${name.lowercase()}/$lang/$versionId"
        val bytes = MessageDigest.getInstance("MD5").digest(key.toByteArray())
        return (0..7).map { bytes[it].toLong() and 0xff shl 8 * (7 - it) }
            .reduce(Long::or) and Long.MAX_VALUE
    }

    protected open fun headersBuilder(): Headers.Builder = Headers.Builder().apply {
        add("User-Agent", network.defaultUserAgentProvider())
    }

    override fun toString(): String = "$name (${lang.uppercase()})"

    open suspend fun getImageUrl(page: Page): String = page.imageUrl ?: page.url

    protected open fun imageRequest(page: Page): Request = GET(page.imageUrl!!, headers)

    fun setUrlWithoutDomain(manga: SManga, url: String) {
        manga.url = getUrlWithoutDomain(url)
    }

    fun setUrlWithoutDomain(chapter: SChapter, url: String) {
        chapter.url = getUrlWithoutDomain(url)
    }

    private fun getUrlWithoutDomain(orig: String): String {
        return try {
            val uri = URI(orig.replace(" ", "%20"))
            var out = uri.path
            if (uri.query != null) out += "?" + uri.query
            if (uri.fragment != null) out += "#" + uri.fragment
            out
        } catch (_: URISyntaxException) {
            orig
        }
    }

    open fun getMangaUrl(manga: SManga): String = joinUrl(manga.url)

    open fun getChapterUrl(chapter: SChapter): String = joinUrl(chapter.url)

    internal fun joinUrl(path: String): String {
        if (path.startsWith("http://") || path.startsWith("https://")) return path
        return if (baseUrl.endsWith("/") || path.startsWith("/")) {
            baseUrl + path
        } else {
            "$baseUrl/$path"
        }
    }

    override val supportsRelatedMangas: Boolean get() = false
    override val disableRelatedMangasBySearch: Boolean get() = false
    override val disableRelatedMangas: Boolean get() = false

    override suspend fun fetchRelatedMangaList(manga: SManga): List<SManga> = emptyList()

    override fun getFilterList(): FilterList = FilterList()
}