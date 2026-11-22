package com.margelo.nitro.wallballvision

import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.Rect
import android.view.Surface
import java.nio.ByteBuffer

/**
 * A surface that shows upright RGBA frames, each scaled to fill it. A frame is drawn on the thread that judged it,
 * because the pipeline writes its buffer again two frames later.
 */
class FrameScreen {
  private val lock = Any()
  private var surface: Surface? = null
  private var bitmap: Bitmap? = null
  private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

  /** Takes a new or resized surface, and draws the last frame on it again: a surface keeps no picture of its own. */
  fun attach(surface: Surface) {
    synchronized(lock) {
      this.surface = surface
      bitmap?.let { draw(surface, it) }
    }
  }

  /** Returns once no draw touches the surface, as a surface's end requires. */
  fun detach() {
    synchronized(lock) { surface = null }
  }

  fun show(pixels: ByteBuffer, width: Int, height: Int) {
    synchronized(lock) {
      val target = surface?.takeIf { it.isValid } ?: return
      val frame = bitmap?.takeIf { it.width == width && it.height == height }
        ?: Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap = it }
      // ARGB_8888 keeps its bytes in RGBA order, so the frame copies in as it is.
      frame.copyPixelsFromBuffer(pixels.duplicate().apply { rewind() })
      draw(target, frame)
    }
  }

  private fun draw(target: Surface, frame: Bitmap) {
    if (!target.isValid) return
    val canvas = target.lockHardwareCanvas()
    try {
      canvas.drawBitmap(frame, null, Rect(0, 0, canvas.width, canvas.height), paint)
    } finally {
      target.unlockCanvasAndPost(canvas)
    }
  }
}
