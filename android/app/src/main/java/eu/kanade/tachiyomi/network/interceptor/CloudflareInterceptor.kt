package eu.kanade.tachiyomi.network.interceptor

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Present so extension client builders that expect a Cloudflare-aware default
 * client keep working. The first version relies on the shared WebView cookie
 * jar; challenge solving can hook in here later without touching the ABI.
 */
class CloudflareInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response = chain.proceed(chain.request())
}