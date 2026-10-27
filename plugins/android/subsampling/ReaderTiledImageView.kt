package com.mangora.app

import android.content.Context
import android.view.MotionEvent
import com.davemorrissey.labs.subscaleview.SubsamplingScaleImageView

/**
 * Non-interactive tiled bitmap surface for the reader.
 *
 * SubsamplingScaleImageView calls requestDisallowInterceptTouchEvent(true) on
 * ACTION_DOWN even when its own pan/zoom gestures are disabled. That prevents
 * the RN reader's tap/pinch owners from receiving a touch. The reader camera
 * owns all gestures, so this subclass deliberately releases touch handling.
 */
class ReaderTiledImageView(context: Context) : SubsamplingScaleImageView(context) {
    override fun onTouchEvent(event: MotionEvent): Boolean {
        parent?.requestDisallowInterceptTouchEvent(false)
        return false
    }
}
