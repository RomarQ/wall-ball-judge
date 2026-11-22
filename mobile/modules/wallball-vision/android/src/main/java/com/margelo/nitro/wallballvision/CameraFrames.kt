package com.margelo.nitro.wallballvision

import android.os.SystemClock
import java.nio.ByteBuffer

private const val RGBA_BYTES = 4

/** Camera frames into the pipeline: each frame's RGBA plane is copied upright in the module's native library. */
object CameraFrames {
  /**
   * Copies the camera frame in `pixels`, `rowBytes` bytes a row, and judges it. `orientation` is the frame's turn from
   * upright as VisionCamera names it, and `mirrored` whether its pixels are mirrored.
   */
  fun judge(pipeline: FramePipeline, pixels: ByteBuffer, rowBytes: Int, width: Int, height: Int, orientation: String, mirrored: Boolean, tMs: Long, look: LookRequest?): PoseFrame {
    val converting = SystemClock.elapsedRealtimeNanos()
    val buffer = pipeline.nextBuffer(width * height * RGBA_BYTES)
    val size = copyRgba(pixels, rowBytes, width, height, quarterTurns(orientation), mirrored, buffer)
    val convertMs = (SystemClock.elapsedRealtimeNanos() - converting) / 1e6
    return pipeline.judge(buffer, size[0], size[1], tMs, look, 0.0, convertMs)
  }

  /** Quarter turns clockwise the frame's pixels sit from upright. */
  private fun quarterTurns(orientation: String): Int = when (orientation) {
    "up" -> 0
    "right" -> 1
    "down" -> 2
    "left" -> 3
    else -> error("no frame orientation $orientation")
  }

  @JvmStatic
  private external fun copyRgba(src: ByteBuffer, rowBytes: Int, width: Int, height: Int, quarterTurns: Int, mirrored: Boolean, rgba: ByteBuffer): IntArray
}
