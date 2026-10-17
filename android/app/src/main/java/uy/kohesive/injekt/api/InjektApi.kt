package uy.kohesive.injekt.api

import java.lang.reflect.ParameterizedType
import java.lang.reflect.Type

/**
 * Minimal Injekt-compatible container.
 *
 * Extension APKs compiled for extensions-lib 1.6 use Injekt to obtain the
 * host Application (the generated SharedPreferences helper does this). The
 * real Injekt runtime is not needed; a type-keyed singleton/factory registry
 * with the same public ABI is enough and keeps the dependency surface small.
 */
interface TypeReference<T> {
    fun getType(): Type
}

abstract class FullTypeReference<T> : TypeReference<T> {
    private val resolvedType: Type = run {
        var current: Class<*>? = javaClass
        while (current != null) {
            val superclass = current.genericSuperclass
            if (superclass is ParameterizedType) {
                val raw = superclass.rawType
                if (raw is Class<*> && FullTypeReference::class.java.isAssignableFrom(raw)) {
                    return@run superclass.actualTypeArguments.firstOrNull() ?: Any::class.java
                }
            }
            current = current.superclass
        }
        Any::class.java
    }

    override fun getType(): Type = resolvedType
}

interface InjektFactory {
    fun <R> getInstance(type: Type): R
    fun <R> getInstanceOrNull(type: Type): R?
    fun <R> getInstanceOrElse(type: Type, fallback: R): R
    fun <R> getInstanceOrElse(type: Type, fallback: () -> R): R
    fun <R, K> getKeyedInstance(type: Type, key: K): R
    fun <R, K> getKeyedInstanceOrNull(type: Type, key: K): R?
    fun <R, K> getKeyedInstanceOrElse(type: Type, key: K, fallback: R): R
    fun <R, K> getKeyedInstanceOrElse(type: Type, key: K, fallback: () -> R): R
    fun <R> getLogger(type: Type, name: String): R
    fun <R, T> getLogger(type: Type, clazz: Class<T>): R
}

interface InjektRegistrar {
    fun <T> addSingleton(type: TypeReference<T>, value: T)
    fun <R> addSingletonFactory(type: TypeReference<R>, factory: () -> R)
    fun <R> addFactory(type: TypeReference<R>, factory: () -> R)
    fun <R> addPerThreadFactory(type: TypeReference<R>, factory: () -> R)
    fun <R, K> addPerKeyFactory(type: TypeReference<R>, factory: (K) -> R)
    fun <R, K> addPerThreadPerKeyFactory(type: TypeReference<R>, factory: (K) -> R)
    fun <R> addLoggerFactory(
        type: TypeReference<R>,
        stringFactory: (String) -> R,
        classFactory: (Class<*>) -> R,
    )
    fun <O, T : O> addAlias(type: TypeReference<T>, underlying: TypeReference<O>)
    fun <T> hasFactory(type: TypeReference<T>): Boolean
}

class InjektScope : InjektFactory, InjektRegistrar {
    private val singletons = mutableMapOf<Type, Any>()
    private val factories = mutableMapOf<Type, () -> Any?>()

    override fun <T> addSingleton(type: TypeReference<T>, value: T) {
        @Suppress("UNCHECKED_CAST")
        singletons[type.getType()] = value as Any
    }

    override fun <R> addSingletonFactory(type: TypeReference<R>, factory: () -> R) {
        factories[type.getType()] = factory
    }

    override fun <R> addFactory(type: TypeReference<R>, factory: () -> R) {
        factories[type.getType()] = factory
    }

    override fun <R> addPerThreadFactory(type: TypeReference<R>, factory: () -> R) {
        factories[type.getType()] = factory
    }

    override fun <R, K> addPerKeyFactory(type: TypeReference<R>, factory: (K) -> R) {
        factories[type.getType()] = { factory(Unit as K) }
    }

    override fun <R, K> addPerThreadPerKeyFactory(type: TypeReference<R>, factory: (K) -> R) {
        factories[type.getType()] = { factory(Unit as K) }
    }

    override fun <R> addLoggerFactory(
        type: TypeReference<R>,
        stringFactory: (String) -> R,
        classFactory: (Class<*>) -> R,
    ) {
        factories[type.getType()] = { stringFactory("injekt") }
    }

    override fun <O, T : O> addAlias(type: TypeReference<T>, underlying: TypeReference<O>) {
        val value = getInstanceOrNull<O>(underlying.getType())
        if (value != null) {
            @Suppress("UNCHECKED_CAST")
            singletons[type.getType()] = value as Any
        }
    }

    override fun <T> hasFactory(type: TypeReference<T>): Boolean {
        val resolved = type.getType()
        return singletons.containsKey(resolved) || factories.containsKey(resolved)
    }

    @Suppress("UNCHECKED_CAST")
    override fun <R> getInstance(type: Type): R {
        singletons[type]?.let { return it as R }
        factories[type]?.let { factory ->
            val value = factory()
            singletons[type] = value as Any
            return value as R
        }
        throw IllegalStateException("No Injekt binding for $type")
    }

    @Suppress("UNCHECKED_CAST")
    override fun <R> getInstanceOrNull(type: Type): R? {
        singletons[type]?.let { return it as R }
        factories[type]?.let { factory ->
            val value = factory()
            singletons[type] = value as Any
            return value as R
        }
        return null
    }

    override fun <R> getInstanceOrElse(type: Type, fallback: R): R =
        getInstanceOrNull(type) ?: fallback

    override fun <R> getInstanceOrElse(type: Type, fallback: () -> R): R =
        getInstanceOrNull(type) ?: fallback()

    override fun <R, K> getKeyedInstance(type: Type, key: K): R = getInstance(type)
    override fun <R, K> getKeyedInstanceOrNull(type: Type, key: K): R? = getInstanceOrNull(type)
    override fun <R, K> getKeyedInstanceOrElse(type: Type, key: K, fallback: R): R =
        getInstanceOrNull(type) ?: fallback

    override fun <R, K> getKeyedInstanceOrElse(type: Type, key: K, fallback: () -> R): R =
        getInstanceOrNull(type) ?: fallback()

    @Suppress("UNCHECKED_CAST")
    override fun <R> getLogger(type: Type, name: String): R = Any() as R

    @Suppress("UNCHECKED_CAST")
    override fun <R, T> getLogger(type: Type, clazz: Class<T>): R = Any() as R
}