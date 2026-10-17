package eu.kanade.tachiyomi.network

import android.content.Context
import app.cash.quickjs.QuickJs
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

class JavaScriptEngine(context: Context) {
    @Suppress("UNCHECKED_CAST")
    suspend fun <T> evaluate(script: String): T = suspendCoroutine { continuation ->
        Thread {
            try {
                QuickJs.create().use { vm ->
                    continuation.resume(vm.evaluate(script) as T)
                }
            } catch (error: Throwable) {
                continuation.resumeWithException(error)
            }
        }.start()
    }
}