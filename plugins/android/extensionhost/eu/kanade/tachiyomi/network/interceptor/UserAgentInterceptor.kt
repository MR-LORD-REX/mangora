package eu.kanade.tachiyomi.network.interceptor

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Simple-name match matters: Keiyoushi's generated client checks the default
 * interceptor list for an interceptor named UserAgentInterceptor.
 */
class UserAgentInterceptor(
    private val userAgent: () -> String,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header("User-Agent") != null) return chain.proceed(request)
        return chain.proceed(
            request.newBuilder().header("User-Agent", userAgent()).build(),
        )
    }
}