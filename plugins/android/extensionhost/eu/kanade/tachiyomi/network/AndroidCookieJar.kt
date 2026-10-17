package eu.kanade.tachiyomi.network

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/** Shares the WebView cookie jar so extension sessions survive app restarts. */
class AndroidCookieJar : CookieJar {
    private val manager: CookieManager?
        get() = runCatching { CookieManager.getInstance() }.getOrNull()

    override fun loadForRequest(url: HttpUrl): List<Cookie> = get(url)

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val manager = manager ?: return
        cookies.forEach { cookie ->
            manager.setCookie(url.toString(), cookie.toString())
        }
        manager.flush()
    }

    fun get(url: HttpUrl): List<Cookie> {
        val header = manager?.getCookie(url.toString()) ?: return emptyList()
        return header.split(';').mapNotNull { part ->
            val trimmed = part.trim()
            if (trimmed.isEmpty()) null else Cookie.parse(url, trimmed)
        }
    }

    fun remove(url: HttpUrl, cookieNames: List<String>? = null, maxAge: Int = -1): Int {
        val manager = manager ?: return 0
        val urlString = url.toString()
        val header = manager.getCookie(urlString) ?: return 0
        return header.split(';')
            .map { it.substringBefore('=').trim() }
            .filter { it.isNotEmpty() && (cookieNames == null || it in cookieNames) }
            .onEach { manager.setCookie(urlString, "$it=;Max-Age=$maxAge") }
            .count()
    }

    fun flush() {
        runCatching { manager?.flush() }
    }
}