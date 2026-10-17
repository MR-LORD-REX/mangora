package eu.kanade.tachiyomi.network

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/** Shares the WebView cookie jar so extension sessions survive app restarts. */
class AndroidCookieJar : CookieJar {
    private val manager: CookieManager? = CookieManager.getInstance()

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val header = manager?.getCookie(url.toString()) ?: return emptyList()
        return header.split(';').mapNotNull { part ->
            val trimmed = part.trim()
            if (trimmed.isEmpty()) null else Cookie.parse(url, trimmed)
        }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val manager = manager ?: return
        cookies.forEach { cookie ->
            manager.setCookie(url.toString(), cookie.toString())
        }
        manager.flush()
    }
}