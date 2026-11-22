package com.margelo.nitro.wallballvision

import android.content.Context
import android.os.SystemClock
import com.google.ai.edge.litert.Accelerator
import com.google.ai.edge.litert.CompiledModel
import com.google.ai.edge.litert.TensorBuffer
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit

/** The long side training drew each frame at, the repository's `TRAINED_INPUT` in boxes.ts. */
private const val TRAINED_INPUT = 640

private const val CLOSE_WAIT_S = 5L

object BallModel {
  /**
   * The PWA's ball model at `input` pixels as LiteRT opens it on `unit`: the plain file on the CPU or the GPU, the file
   * the phone compiled for its TPU on the NPU. The GPU keeps each size's compiled programs apart.
   */
  fun on(context: Context, unit: String, input: Int): Pair<String, CompiledModel.Options> {
    val (asset, accelerator) = when (unit) {
      "TPU" -> "models/detector-$input-g6.tflite" to Accelerator.NPU
      "GPU" -> "models/detector-$input.tflite" to Accelerator.GPU
      "CPU" -> "models/detector-$input.tflite" to Accelerator.CPU
      else -> error("no ball unit $unit")
    }
    return asset to Litert.options(context, accelerator, "ball-$input")
  }
}

/** Draws an RGBA frame, or a part of it, into a detector's input, in the module's native library. */
object Letterbox {
  @JvmStatic
  external fun draw(rgba: ByteBuffer, width: Int, height: Int, cutWidth: Int, size: Int, out: FloatArray)

  @JvmStatic
  external fun drawWindow(
    rgba: ByteBuffer, width: Int, height: Int, cutWidth: Int, x: Double, y: Double, w: Double, h: Double, size: Int, out: FloatArray,
  )

  /**
   * The median time of `runs` drawings of a blank frame into the ball model's input of `size` pixels, as a look draws its
   * frame: through a window of the input's side at the training scale, in the middle of the frame.
   */
  fun drawMs(width: Int, height: Int, cutWidth: Int, size: Int, runs: Int): Double {
    val blank = ByteBuffer.allocateDirect(width * height * 4)
    val input = FloatArray(3 * size * size)
    val side = size * maxOf(width, height).toDouble() / TRAINED_INPUT
    val times = DoubleArray(runs) {
      val start = SystemClock.elapsedRealtimeNanos()
      drawWindow(blank, width, height, cutWidth, (width - side) / 2, (height - side) / 2, side, side, size, input)
      (SystemClock.elapsedRealtimeNanos() - start) / 1e6
    }
    times.sort()
    return times[runs / 2]
  }
}

/**
 * The ball model on its own thread, one look at a time.
 *
 * A look returns the anchors whose best class score reaches `minScore`, as [Anchors.scored] gives them.
 */
class BallEngine(context: Context, options: BallOptions) : AutoCloseable {
  private val model: CompiledModel
  private val inputs: List<TensorBuffer>
  private val outputs: List<TensorBuffer>
  private val thread: ExecutorService = Executors.newSingleThreadExecutor()
  private val size = options.input.toInt()
  private val input = FloatArray(3 * size * size)
  private var running: Future<*>? = null
  private val finished = ConcurrentLinkedQueue<Look>()
  private val minScore = options.minScore.toFloat()
  private val cutWidth = options.cutWidth.toInt()
  @Volatile private var reading: ByteBuffer? = null

  init {
    val (asset, opening) = BallModel.on(context, options.unit, size)
    model = CompiledModel.create(context.assets, asset, opening, Litert.environment(context))
    inputs = model.createInputBuffers()
    outputs = model.createOutputBuffers()
  }

  /**
   * Starts a look at `window` of the frame, or at the whole frame without one, unless a look is still running, and
   * says whether it started. The look reads `rgba` on its own thread, so the caller must not write to it while
   * [isReading] says so.
   */
  fun look(rgba: ByteBuffer, width: Int, height: Int, frameIndex: Int, window: LookWindow?): Boolean {
    if (running?.isDone == false) return false
    reading = rgba
    running = thread.submit {
      val preparing = SystemClock.elapsedRealtimeNanos()
      try {
        if (window == null) Letterbox.draw(rgba, width, height, cutWidth, size, input)
        else Letterbox.drawWindow(rgba, width, height, cutWidth, window.x, window.y, window.w, window.h, size, input)
      } finally {
        reading = null
      }
      val prepMs = (SystemClock.elapsedRealtimeNanos() - preparing) / 1e6
      val start = SystemClock.elapsedRealtimeNanos()
      inputs[0].writeFloat(input)
      model.run(inputs, outputs)
      val raw = outputs[0].readFloat()
      val runMs = (SystemClock.elapsedRealtimeNanos() - start) / 1e6
      val rows = Anchors.scored(raw, minScore, size)
      finished.add(Look(frameIndex.toDouble(), rows, (rows.size / Anchors.ROWS).toDouble(), window, prepMs, runMs))
    }
    return true
  }

  /** Whether a look is still drawing from `rgba`. */
  fun isReading(rgba: ByteBuffer?): Boolean = rgba != null && reading === rgba

  /** The looks finished since the last call, oldest first. */
  fun take(): Array<Look> = generateSequence { finished.poll() }.toList().toTypedArray()

  override fun close() {
    thread.shutdown()
    // A look still running reads the model and its buffers, so they go only once it has finished.
    check(thread.awaitTermination(CLOSE_WAIT_S, TimeUnit.SECONDS)) { "a ball look did not finish within $CLOSE_WAIT_S s" }
    inputs.forEach { it.close() }
    outputs.forEach { it.close() }
    model.close()
  }
}

/**
 * The detectors' answer, `[6, anchors]` channel first: each anchor's box centre and size as a share of the input, then
 * its score for the ball and for the target.
 */
object Anchors {
  const val ROWS = 6
  private const val BOX_ROWS = 4

  /**
   * The anchors whose best class score reaches `minScore`, as `[6, count]` rows, channel first, with the box rows in
   * pixels of the model's `input`-sided square: what boxes.ts's decode reads.
   */
  fun scored(raw: FloatArray, minScore: Float, input: Int): DoubleArray {
    val anchors = raw.size / ROWS
    val kept = (0 until anchors).filter { maxOf(raw[4 * anchors + it], raw[5 * anchors + it]) >= minScore }
    val rows = DoubleArray(ROWS * kept.size)
    for (r in 0 until ROWS) {
      val scale = if (r < BOX_ROWS) input.toDouble() else 1.0
      kept.forEachIndexed { j, anchor -> rows[r * kept.size + j] = raw[r * anchors + anchor] * scale }
    }
    return rows
  }
}
