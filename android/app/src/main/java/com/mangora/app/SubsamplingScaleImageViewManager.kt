package com.mangora.app

import com.davemorrissey.labs.subscaleview.ImageSource
import com.davemorrissey.labs.subscaleview.SubsamplingScaleImageView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class SubsamplingScaleImageViewManager :
    SimpleViewManager<ReaderTiledImageView>() {
    override fun getName(): String = "SubsamplingScaleImageView"

    override fun createViewInstance(reactContext: ThemedReactContext): ReaderTiledImageView =
        ReaderTiledImageView(reactContext).apply {
            // Zoom/pan belongs to the reader camera so translation overlays
            // (RN siblings) transform with the page.
            setPanEnabled(false)
            setZoomEnabled(false)
            setQuickScaleEnabled(false)
            setMinimumScaleType(SubsamplingScaleImageView.SCALE_TYPE_CENTER_INSIDE)
            isClickable = false
            isFocusable = false
        }

    @ReactProp(name = "src")
    fun setSource(view: ReaderTiledImageView, source: String?) {
        if (!source.isNullOrBlank()) {
            view.setImage(ImageSource.uri(source))
        }
    }
}
