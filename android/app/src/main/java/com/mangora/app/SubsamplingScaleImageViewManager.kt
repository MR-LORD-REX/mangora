package com.mangora.app

import com.davemorrissey.labs.subscaleview.ImageSource
import com.davemorrissey.labs.subscaleview.SubsamplingScaleImageView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class SubsamplingScaleImageViewManager : SimpleViewManager<SubsamplingScaleImageView>() {
    override fun getName(): String = "SubsamplingScaleImageView"

    override fun createViewInstance(reactContext: ThemedReactContext): SubsamplingScaleImageView =
        SubsamplingScaleImageView(reactContext)

    @ReactProp(name = "src")
    fun setSource(view: SubsamplingScaleImageView, source: String?) {
        if (!source.isNullOrBlank()) {
            view.setImage(ImageSource.uri(source))
        }
    }
}
