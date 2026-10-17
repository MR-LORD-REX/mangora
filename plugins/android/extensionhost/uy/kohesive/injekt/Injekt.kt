package uy.kohesive.injekt

import uy.kohesive.injekt.api.InjektScope

/**
 * Global registry used by extension bytecode (`InjektKt.getInjekt()`).
 * ExtensionHost.initialize() replaces this with a registry containing the
 * Android Application, NetworkHelper and JavaScriptEngine.
 */
var Injekt: InjektScope = InjektScope()