package eu.kanade.tachiyomi.network.interceptor

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import eu.kanade.tachiyomi.network.AndroidCookieJar
import okhttp3.Headers
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * Detects Cloudflare managed challenges (the official `cf-mitigated` signal)
 * and solves them in a throwaway WebView. The WebView writes into the shared
 * Android cookie jar, so the retried OkHttp request carries `cf_clearance`.
 *
 * Interactive challenges (Turnstile checkbox) cannot be solved off-screen;
 * those fail fast with a message instead of hanging the caller.
 */
class CloudflareInterceptor(
    private val context: Context,
    private val cookieJar: AndroidCookieJar,
    private val defaultUserAgentProvider: () -> String,
) : Interceptor {

    private val mainHandler = Handler(Looper.getMainLooper())

    // One solve per host. Concurrent requests wait for the same WebView.
    private val hostLocks = ConcurrentHashMap<String, ReentrantReadWriteLock>()

    private val listenerScript = """
        addEventListener("message", ({data}) => {
            if (data?.source === "cloudflare-challenge") {
                mangora?.postMessage(data.event);
            }
        })
    """.trimIndent()

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val lock = hostLocks.computeIfAbsent(request.url.host.lowercase(Locale.US)) {
            ReentrantReadWriteLock()
        }
        val clearanceBefore = clearance(request.url)
        val response = lock.read { chain.proceed(request) }
        if (!shouldIntercept(response)) return response

        lock.write {
            // Another request may have solved the challenge while this one
            // was waiting for the write lock.
            val current = clearance(request.url)
            if (!current.isNullOrBlank() && current != clearanceBefore) {
                response.close()
                return@write
            }
            solve(request, response, clearanceBefore)
        }
        return chain.proceed(request)
    }

    private fun shouldIntercept(response: Response): Boolean {
        if (response.header("cf-mitigated") != "challenge") return false
        val server = response.header("Server")?.lowercase(Locale.US)
        return server == null || server.contains("cloudflare")
    }

    private fun clearance(url: HttpUrl): String? =
        cookieJar.get(url).firstOrNull { it.name == COOKIE_NAME }?.value

    private fun isCleared(url: HttpUrl, previous: String?): Boolean {
        val current = clearance(url)
        return !current.isNullOrBlank() && current != previous
    }

    private fun solve(request: Request, response: Response, originalClearance: String?) {
        response.close()
        cookieJar.remove(request.url, COOKIE_NAMES, 0)
        resolveWithWebView(request, originalClearance)
        cookieJar.flush()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun resolveWithWebView(originalRequest: Request, originalClearance: String?) {
        val latch = CountDownLatch(1)
        val bypassed = AtomicBoolean(false)
        val interactive = AtomicBoolean(false)
        val rendererGone = AtomicBoolean(false)
        var webView: WebView? = null

        fun finish(success: Boolean) {
            if (latch.count == 0L) return
            bypassed.set(success)
            latch.countDown()
        }

        val originalUrl = originalRequest.url
        val challengeUrl = if (originalRequest.method == "GET") {
            originalUrl.toString()
        } else {
            originalUrl.newBuilder().encodedPath("/").query(null).fragment(null).build().toString()
        }
        val headers = parseHeaders(originalRequest.headers)
        val userAgent = originalRequest.header("User-Agent")
            ?.takeIf { it.isNotBlank() }
            ?: defaultUserAgentProvider()

        mainHandler.post {
            try {
                CookieManager.getInstance().setAcceptCookie(true)
                val view = WebView(context)
                webView = view
                CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)

                view.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    loadsImagesAutomatically = true
                    mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    userAgentString = userAgent
                }

                view.addJavascriptInterface(
                    object {
                        @Suppress("unused")
                        @JavascriptInterface
                        fun postMessage(event: String) {
                            when (event) {
                                // Cloudflare needs a human: fail immediately.
                                "interactiveBegin" -> {
                                    interactive.set(true)
                                    finish(false)
                                }
                                "fail" -> finish(false)
                            }
                        }
                    },
                    "mangora",
                )

                view.webViewClient = object : WebViewClient() {
                    override fun onPageStarted(
                        view: WebView?,
                        url: String?,
                        favicon: Bitmap?,
                    ) {
                        // Install the listener before the challenge scripts run.
                        view?.evaluateJavascript(listenerScript, null)
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        if (isCleared(originalUrl, originalClearance)) {
                            finish(true)
                        }
                    }

                    override fun onReceivedHttpError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        errorResponse: WebResourceResponse?,
                    ) {
                        // A challenge response is expected here. Any other
                        // main-frame error means the page did not load.
                        if (request?.isForMainFrame == true &&
                            errorResponse?.responseHeaders?.get("cf-mitigated") != "challenge"
                        ) {
                            finish(false)
                        }
                    }

                    override fun onRenderProcessGone(
                        view: WebView,
                        detail: RenderProcessGoneDetail,
                    ): Boolean {
                        rendererGone.set(true)
                        finish(false)
                        return true
                    }
                }

                view.loadUrl(challengeUrl, headers)
                pollClearance(originalUrl, originalClearance, latch, ::finish)
            } catch (_: Throwable) {
                finish(false)
            }
        }

        latch.await(35, TimeUnit.SECONDS)

        mainHandler.post {
            if (!rendererGone.get()) {
                webView?.let { view ->
                    runCatching { view.stopLoading() }
                    runCatching { view.loadUrl("about:blank") }
                    runCatching { view.destroy() }
                }
            }
            runCatching { CookieManager.getInstance().flush() }
        }

        if (!bypassed.get()) {
            // A clearance from a failed challenge is rejected again.
            cookieJar.remove(originalRequest.url, COOKIE_NAMES, 0)
            val reason = if (interactive.get()) {
                "Cloudflare requires an interactive challenge. Open the source in a browser and retry."
            } else {
                "Cloudflare challenge did not complete."
            }
            throw IOException(reason)
        }
    }

    private fun pollClearance(
        url: HttpUrl,
        previous: String?,
        latch: CountDownLatch,
        finish: (Boolean) -> Unit,
    ) {
        val started = SystemClock.uptimeMillis()

        fun poll() {
            if (latch.count == 0L) return
            if (isCleared(url, previous)) {
                finish(true)
                return
            }
            if (SystemClock.uptimeMillis() - started >= 30_000L) {
                latch.countDown()
                return
            }
            mainHandler.postDelayed({ poll() }, 250L)
        }

        poll()
    }

    private fun parseHeaders(headers: Headers): Map<String, String> {
        return headers
            .filter { (name, value) -> isRequestHeaderSafe(name, value) }
            .groupBy(keySelector = { (name, _) -> name }) { (_, value) -> value }
            .mapValues { it.value.firstOrNull().orEmpty() }
    }

    private fun isRequestHeaderSafe(name: String, value: String): Boolean {
        val lowerName = name.lowercase(Locale.US)
        val lowerValue = value.lowercase(Locale.US)
        if (lowerName in UNSAFE_HEADER_NAMES || lowerName.startsWith("proxy-")) return false
        if (lowerName == "connection" && lowerValue == "upgrade") return false
        return true
    }

    private companion object {
        const val COOKIE_NAME = "cf_clearance"
        val COOKIE_NAMES = listOf(COOKIE_NAME)
        val UNSAFE_HEADER_NAMES = listOf(
            "content-length",
            "host",
            "trailer",
            "te",
            "upgrade",
            "cookie2",
            "keep-alive",
            "transfer-encoding",
            "set-cookie",
        )
    }
}