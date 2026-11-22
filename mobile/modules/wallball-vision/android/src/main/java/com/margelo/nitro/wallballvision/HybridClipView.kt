package com.margelo.nitro.wallballvision

import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import com.facebook.react.uimanager.ThemedReactContext

class HybridClipView(context: ThemedReactContext) : HybridClipViewSpec(), SurfaceHolder.Callback {
  private val surfaceView = SurfaceView(context)
  private val screen = FrameScreen()

  override val view: View
    get() = surfaceView

  init {
    surfaceView.holder.addCallback(this)
  }

  override var vision: HybridWallballVisionSpec? = null
    set(value) {
      (field as? HybridWallballVision)?.let { if (it.screen === screen) it.screen = null }
      (value as? HybridWallballVision)?.screen = screen
      field = value
    }

  override fun surfaceCreated(holder: SurfaceHolder) = screen.attach(holder.surface)

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = screen.attach(holder.surface)

  override fun surfaceDestroyed(holder: SurfaceHolder) = screen.detach()
}
