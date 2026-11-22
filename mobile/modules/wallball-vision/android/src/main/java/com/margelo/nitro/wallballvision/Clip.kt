package com.margelo.nitro.wallballvision

import android.content.Context
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.SystemClock
import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val DEQUEUE_TIMEOUT_US = 10_000L
private const val RGBA_BYTES = 4
private const val FRAME_WAIT_MS = 10_000L

/**
 * A video decoded frame by frame in display order, as upright RGBA.
 *
 * `source` is a `content://` address, such as a video from the phone's gallery, or the name of a file in the app's
 * `clips` folder. The decoder hands each frame over as a YUV image, the format the camera gives too. Timestamps come
 * from the container, so a clip with a variable frame rate keeps its own timing.
 */
class Clip(context: Context, source: String) : AutoCloseable {
  private val extractor = MediaExtractor()
  private val decoder: MediaCodec
  private val format: MediaFormat
  private val output = MediaCodec.BufferInfo()
  private var inputDone = false
  /** Whether the decoder has been fed: a decoder flushed before its first frame loses its codec data and never answers. */
  private var fed = false
  private var colour: YuvColour? = null
  /** Quarter turns clockwise that show a frame upright, from the file's rotation tag. */
  private val turns: Int
  /** The decoded frame before its turn, for a file that stores its frames turned. */
  private var stored: ByteBuffer? = null
  val info: ClipInfo

  init {
    if (source.startsWith("content://")) {
      extractor.setDataSource(context, Uri.parse(source), null)
    } else {
      val file = Media.clipFile(context, source)
      require(file.isFile) { "no clip at ${file.path}" }
      extractor.setDataSource(file.path)
    }
    val track = (0 until extractor.trackCount).first {
      extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
    }
    format = extractor.getTrackFormat(track)
    extractor.selectTrack(track)
    val rotation = if (format.containsKey(MediaFormat.KEY_ROTATION)) format.getInteger(MediaFormat.KEY_ROTATION) else 0
    turns = ((rotation / 90) % 4 + 4) % 4
    val storedWidth = format.getInteger(MediaFormat.KEY_WIDTH)
    val storedHeight = format.getInteger(MediaFormat.KEY_HEIGHT)
    info = ClipInfo(
      (if (turns % 2 == 1) storedHeight else storedWidth).toDouble(),
      (if (turns % 2 == 1) storedWidth else storedHeight).toDouble(),
      countSamples(extractor),
      if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) / 1000.0 else 0.0,
    )
    format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
    decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    decoder.configure(format, null, null, 0)
    decoder.start()
  }

  /** Decodes the next frame into the pipeline, judges it and shows it on `screen`, or returns null past the last frame. */
  fun next(pipeline: FramePipeline, look: LookRequest?, screen: FrameScreen?): PoseFrame? {
    val decoding = SystemClock.elapsedRealtimeNanos()
    val buffer = nextOutputBuffer() ?: return null
    val decodeMs = (SystemClock.elapsedRealtimeNanos() - decoding) / 1e6
    try {
      val image = decoder.getOutputImage(buffer) ?: error("no image for the frame at ${output.presentationTimeUs} us")
      val converting = SystemClock.elapsedRealtimeNanos()
      val (pixels, width, height) = upright(image) { bytes -> pipeline.nextBuffer(bytes) }
      val convertMs = (SystemClock.elapsedRealtimeNanos() - converting) / 1e6
      val judged = pipeline.judge(pixels, width, height, output.presentationTimeUs / 1000, look, decodeMs, convertMs)
      screen?.show(pixels, width, height)
      return judged
    } finally {
      decoder.releaseOutputBuffer(buffer, false)
    }
  }

  /**
   * The frame a player shows at `seconds`: the last one whose time is not past it, or the first frame when none is.
   * It reads from the key frame before it, so a search can ask for any second in any order.
   */
  fun frameAt(seconds: Double): RgbaFrame {
    val atUs = (seconds * 1e6).toLong()
    extractor.seekTo(atUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
    if (fed) decoder.flush()
    inputDone = false
    var shown: RgbaFrame? = null
    while (true) {
      val buffer = nextOutputBuffer() ?: break
      val past = output.presentationTimeUs > atUs
      if (past && shown != null) {
        decoder.releaseOutputBuffer(buffer, false)
        break
      }
      val image: Image = decoder.getOutputImage(buffer) ?: error("no image for the frame at ${output.presentationTimeUs} us")
      val held = shown?.pixels
      val (pixels, width, height) = upright(image) { bytes ->
        if (held != null && held.capacity() == bytes) held else ByteBuffer.allocateDirect(bytes).order(ByteOrder.nativeOrder())
      }
      shown = RgbaFrame(pixels, width, height)
      decoder.releaseOutputBuffer(buffer, false)
      if (past) break
    }
    return shown ?: error("no frame at $seconds s")
  }

  /**
   * The image as upright RGBA in a buffer `bufferOf` gives for the byte count, turned when the file stores it turned,
   * with its upright width and height. Closes the image.
   */
  private fun upright(image: Image, bufferOf: (Int) -> ByteBuffer): Triple<ByteBuffer, Int, Int> {
    val width = image.cropRect.width()
    val height = image.cropRect.height()
    val bytes = width * height * RGBA_BYTES
    try {
      if (turns == 0) return Triple(Yuv.copyRgba(image, colourOf(image), bufferOf(bytes)), width, height)
      val decoded = Yuv.copyRgba(image, colourOf(image), stored).also { stored = it }
      val out = bufferOf(bytes)
      Rgba.rotate(decoded, width, height, turns, out)
      out.rewind()
      return if (turns % 2 == 1) Triple(out, height, width) else Triple(out, width, height)
    } finally {
      image.close()
    }
  }

  private fun colourOf(image: Image): YuvColour =
    colour ?: YuvColour(decoder.outputFormat, image.cropRect.height()).also { colour = it }

  /** Feeds the decoder until it gives a frame, and returns that frame's buffer, or null past the last frame. */
  private fun nextOutputBuffer(): Int? {
    val deadline = SystemClock.elapsedRealtime() + FRAME_WAIT_MS
    while (true) {
      check(SystemClock.elapsedRealtime() < deadline) { "the video's decoder gave no frame within $FRAME_WAIT_MS ms" }
      if (!inputDone) {
        val input = decoder.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
        if (input >= 0) {
          val size = extractor.readSampleData(decoder.getInputBuffer(input)!!, 0)
          if (size < 0) {
            decoder.queueInputBuffer(input, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            decoder.queueInputBuffer(input, 0, size, extractor.sampleTime, 0)
            extractor.advance()
            fed = true
          }
        }
      }
      val buffer = decoder.dequeueOutputBuffer(output, DEQUEUE_TIMEOUT_US)
      if (buffer < 0) continue
      if (output.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0 && output.size == 0) {
        decoder.releaseOutputBuffer(buffer, false)
        return null
      }
      return buffer
    }
  }

  override fun close() {
    decoder.stop()
    decoder.release()
    extractor.release()
  }
}

/** The frames in the selected track, counted by stepping through its samples once and rewinding. */
private fun countSamples(extractor: MediaExtractor): Double {
  var count = 0
  while (extractor.sampleTime >= 0) {
    count += 1
    extractor.advance()
  }
  extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
  return count.toDouble()
}

/** RGBA image steps in the module's native library. */
object Rgba {
  /** Turns an RGBA image `turns` quarter turns clockwise into `dst`. */
  @JvmStatic
  external fun rotate(src: ByteBuffer, width: Int, height: Int, turns: Int, dst: ByteBuffer)
}
