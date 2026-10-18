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
        SubsamplingScaleImageView(reactContext).apply {
            // Zoom/pan belongs to ZoomablePage so translation overlays (RN
            // siblings) transform with the page. The native view's built-in
            // gestures would zoom only the bitmap and leave overlays behind.
            setPanEnabled(false)
            setZoomEnabled(false)
            setQuickScaleEnabled(false)
            setMinimumScaleType(SubsamplingScaleImageView.SCALE_TYPE_CENTER_INSIDE)
            isClickable = false
            isFocusable = false
        }

    @ReactProp(name = "src")
    fun setSource(view: SubsamplingScaleImageView, source: String?) {
        if (!source.isNullOrBlank()) {
            view.setImage(ImageSource.uri(source))
        }
    }
}
