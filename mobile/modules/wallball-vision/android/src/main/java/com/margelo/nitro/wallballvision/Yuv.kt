package com.margelo.nitro.wallballvision

import android.media.Image
import android.media.MediaFormat
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** YUV 4:2:0 to RGBA, in the module's native library. */
object Yuv {
  /** Converts the image's crop to RGBA in `into`, which it reuses while the size stays the same. */
  fun copyRgba(image: Image, colour: YuvColour, into: ByteBuffer?): ByteBuffer {
    val crop = image.cropRect
    val size = crop.width() * crop.height() * 4
    val rgba = if (into != null && into.capacity() == size) into else ByteBuffer.allocateDirect(size).order(ByteOrder.nativeOrder())
    val (y, u, v) = image.planes
    toRgba(
      y.buffer, y.rowStride, u.buffer, v.buffer, u.rowStride, u.pixelStride,
      crop.left, crop.top, crop.width(), crop.height(), colour.bt709, colour.fullRange, rgba,
    )
    rgba.rewind()
    return rgba
  }

  @JvmStatic
  external fun toRgba(
    yPlane: ByteBuffer,
    yRowStride: Int,
    uPlane: ByteBuffer,
    vPlane: ByteBuffer,
    uvRowStride: Int,
    uvPixelStride: Int,
    left: Int,
    top: Int,
    width: Int,
    height: Int,
    bt709: Boolean,
    fullRange: Boolean,
    rgba: ByteBuffer,
  )
}

/** How a decoder's YUV maps to RGB, read from its output format. */
class YuvColour(format: MediaFormat, height: Int) {
  // Without a tag, HD video is BT.709 and smaller video BT.601, both in limited range, as players assume.
  val bt709 = format.intOrNull(MediaFormat.KEY_COLOR_STANDARD)?.let { it == MediaFormat.COLOR_STANDARD_BT709 } ?: (height >= 720)
  val fullRange = format.intOrNull(MediaFormat.KEY_COLOR_RANGE) == MediaFormat.COLOR_RANGE_FULL
}

private fun MediaFormat.intOrNull(key: String): Int? = if (containsKey(key)) getInteger(key) else null
