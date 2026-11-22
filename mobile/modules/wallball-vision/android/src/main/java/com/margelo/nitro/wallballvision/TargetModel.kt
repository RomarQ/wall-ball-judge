package com.margelo.nitro.wallballvision

import android.content.Context
import android.os.SystemClock
import com.google.ai.edge.litert.Accelerator
import com.google.ai.edge.litert.CompiledModel
import com.google.ai.edge.litert.TensorBuffer
import java.nio.ByteBuffer

/** The search model's square input. */
const val TARGET_INPUT = 640

/**
 * The PWA's target search model, `detector-640.tflite`, on LiteRT's CPU, which answers as the PWA's search does in
 * full precision, so the search finds the same plates. One thread at a time may use it.
 *
 * A look returns the anchors whose best class score reaches `minScore`, as [Anchors.scored] gives them.
 */
class TargetModel(context: Context) : AutoCloseable {
  private val model = CompiledModel.create(
    context.assets,
    "models/detector-640.tflite",
    Litert.options(context, Accelerator.CPU, "finder"),
    Litert.environment(context),
  )
  private val inputs: List<TensorBuffer> = model.createInputBuffers()
  private val outputs: List<TensorBuffer> = model.createOutputBuffers()
  private val input = FloatArray(3 * TARGET_INPUT * TARGET_INPUT)

  fun look(frame: RgbaFrame, cutWidth: Int, minScore: Double): TargetRows {
    val start = SystemClock.elapsedRealtimeNanos()
    frame.pixels.rewind()
    Letterbox.draw(frame.pixels, frame.width, frame.height, cutWidth, TARGET_INPUT, input)
    inputs[0].writeFloat(input)
    model.run(inputs, outputs)
    val rows = Anchors.scored(outputs[0].readFloat(), minScore.toFloat(), TARGET_INPUT)
    return TargetRows(rows, (rows.size / Anchors.ROWS).toDouble(), (SystemClock.elapsedRealtimeNanos() - start) / 1e6)
  }

  /** The median time of `runs` looks at a blank frame of `width` by `height`, in milliseconds, after one look that warms up. */
  fun lookMs(width: Int, height: Int, cutWidth: Int, runs: Int): Double {
    val blank = RgbaFrame(ByteBuffer.allocateDirect(width * height * 4), width, height)
    look(blank, cutWidth, 1.0)
    val times = DoubleArray(runs) { look(blank, cutWidth, 1.0).ms }
    times.sort()
    return times[runs / 2]
  }

  override fun close() {
    inputs.forEach { it.close() }
    outputs.forEach { it.close() }
    model.close()
  }
}
