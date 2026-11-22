package com.margelo.nitro.wallballvision

import android.content.Context
import android.os.SystemClock
import com.google.ai.edge.litert.Accelerator
import com.google.ai.edge.litert.CompiledModel
import com.google.ai.edge.litert.TensorBuffer
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

// The detector, as MediaPipe Tasks' pose_detector_graph.cc configures it.
private const val DETECTOR_INPUT = 224
private const val DETECTOR_ANCHORS = 2254
private const val DETECTOR_VALUES = 12
private const val SCORE_CLIP = 100.0
private const val NMS_IOU = 0.5

// The landmark model, as pose_landmarks_detector_graph.cc configures it.
private const val LANDMARK_INPUT = 256
private const val MODEL_LANDMARKS = 39
private const val LANDMARK_VALUES = 5
private const val POSE_LANDMARKS = 33
private const val ROI_CENTRE = 33
private const val ROI_SCALE = 34
private const val HEATMAP_SIDE = 64
private const val HEATMAP_KERNEL = 7
private const val HEATMAP_MIN_CONFIDENCE = 0.5

/** The rect's side over the distance between its two alignment points: 2 from alignment_points_to_rects, times rect_transformation's 1.25. */
private const val ROI_SIDE_PER_DISTANCE = 2.5

// Smoothing in video mode, as smoothing.cc configures it for image landmarks.
private const val VISIBILITY_ALPHA = 0.1
private const val EURO_MIN_CUTOFF = 0.05
private const val EURO_BETA = 80.0
private const val EURO_DERIVATE_CUTOFF = 1.0
private const val EURO_START_FREQUENCY = 30.0
private const val MIN_OBJECT_SCALE = 1e-6

private const val OUT_VALUES = 4


/** Samples an RGBA frame into a model input; see crop.cpp. */
object Crop {
  @JvmStatic
  external fun warp(
    rgba: ByteBuffer, width: Int, height: Int,
    a: Float, b: Float, c: Float, d: Float, e: Float, f: Float,
    outW: Int, outH: Int, replicate: Boolean, scale: Float, offset: Float, out: FloatArray,
  )
}

/** A square region of the frame in pixels, turned by `rotation` radians, clockwise on screen. */
private data class Roi(val cx: Double, val cy: Double, val side: Double, val rotation: Double)

private class Detection(val score: Double, val box: DoubleArray, val keypoints: DoubleArray)

/**
 * MediaPipe Tasks' video-mode pose landmarker, one pose, rebuilt so its landmark model can run on the TPU.
 *
 * Each step and constant follows MediaPipe's own graphs: the detector finds the athlete when no region is tracked,
 * the landmark model reads a rotated square around them, the next frame's region comes from the two auxiliary
 * landmarks, and the points are smoothed as MediaPipe smooths them.
 */
class OwnPose(
  context: Context,
  landmarkUnit: String,
  private val minDetection: Double,
  private val minPresence: Double,
) : AutoCloseable {
  private val detector: CompiledModel
  private val detectorIn: List<TensorBuffer>
  private val detectorOut: List<TensorBuffer>
  private val landmarker: CompiledModel
  private val landmarkerIn: List<TensorBuffer>
  private val landmarkerOut: List<TensorBuffer>
  private val detectorInput = FloatArray(DETECTOR_INPUT * DETECTOR_INPUT * 3)
  private val landmarkInput = FloatArray(LANDMARK_INPUT * LANDMARK_INPUT * 3)
  private val anchors = ssdAnchors()
  private var tracked: Roi? = null
  private val visibility = Array(POSE_LANDMARKS) { LowPass() }
  private var smoother: Array<OneEuro>? = null

  init {
    val environment = Litert.environment(context)
    detector = CompiledModel.create(context.assets, "models/pose-detector.tflite", Litert.options(context, Accelerator.CPU, "pose-detector"), environment)
    detectorIn = detector.createInputBuffers()
    detectorOut = detector.createOutputBuffers()
    val (asset, accelerator) = when (landmarkUnit) {
      "TPU" -> "models/pose-landmarks-full-g6.tflite" to Accelerator.NPU
      "CPU" -> "models/pose-landmarks-full.tflite" to Accelerator.CPU
      else -> error("no landmark unit $landmarkUnit")
    }
    landmarker = CompiledModel.create(context.assets, asset, Litert.options(context, accelerator, "pose-landmarks"), environment)
    landmarkerIn = landmarker.createInputBuffers()
    landmarkerOut = landmarker.createOutputBuffers()
  }

  /**
   * The median time of `runs` frames while the athlete is tracked, in milliseconds: the landmark crop and model on a
   * blank frame of `width` by `height`, as most frames of a set run. A frame that must find the athlete again also runs
   * the person search, a few times a set.
   */
  fun trackedFrameMs(width: Int, height: Int, runs: Int): Double {
    val blank = ByteBuffer.allocateDirect(width * height * 4)
    val middle = Roi(width / 2.0, height / 2.0, height / 2.0, 0.0)
    val frame = {
      sample(blank, width, height, middle)
      landmarkerIn[0].writeFloat(landmarkInput)
      landmarker.run(landmarkerIn, landmarkerOut)
    }
    // The first run sets the models up, which a set pays once and not on each frame.
    frame()
    val times = DoubleArray(runs) {
      val start = SystemClock.elapsedRealtimeNanos()
      frame()
      (SystemClock.elapsedRealtimeNanos() - start) / 1e6
    }
    times.sort()
    return times[runs / 2]
  }

  /** The 33 landmarks as x, y, z, visibility in fractions of the frame, or none; and the time the detector took, 0 when it did not run. */
  fun find(rgba: ByteBuffer, width: Int, height: Int, tMs: Long): Pair<DoubleArray, Double> {
    var detectorMs = 0.0
    val roi = tracked ?: run {
      val start = SystemClock.elapsedRealtimeNanos()
      val found = detect(rgba, width, height)
      detectorMs = (SystemClock.elapsedRealtimeNanos() - start) / 1e6
      found
    }
    if (roi == null) return lost() to detectorMs

    sample(rgba, width, height, roi)
    landmarkerIn[0].writeFloat(landmarkInput)
    landmarker.run(landmarkerIn, landmarkerOut)
    val presence = landmarkerOut[1].readFloat()[0].toDouble()
    if (presence <= minPresence) return lost() to detectorMs

    val raw = landmarkerOut[0].readFloat()
    val heatmap = landmarkerOut[3].readFloat()
    val points = Array(MODEL_LANDMARKS) { i ->
      doubleArrayOf(
        raw[i * LANDMARK_VALUES] / LANDMARK_INPUT.toDouble(),
        raw[i * LANDMARK_VALUES + 1] / LANDMARK_INPUT.toDouble(),
        raw[i * LANDMARK_VALUES + 2] / LANDMARK_INPUT.toDouble(),
        sigmoid(raw[i * LANDMARK_VALUES + 3].toDouble()),
      )
    }
    refineFromHeatmap(points, heatmap)
    val projected = points.map { project(it, roi, width, height) }
    val next = roiFrom(
      projected[ROI_CENTRE][0] * width, projected[ROI_CENTRE][1] * height,
      projected[ROI_SCALE][0] * width, projected[ROI_SCALE][1] * height,
    )
    tracked = next
    return smooth(projected, next, width, height, tMs) to detectorMs
  }

  /** A frame without an athlete: the next frame runs the detector, and the point smoother starts over, as MediaPipe's does. */
  private fun lost(): DoubleArray {
    tracked = null
    smoother = null
    return DoubleArray(0)
  }

  private fun detect(rgba: ByteBuffer, width: Int, height: Int): Roi? {
    // Letterboxed to the square input, the padding at 0 before the [-1, 1] mapping.
    val portrait = height > width
    val hPad = if (portrait) (1 - width.toDouble() / height) / 2 else 0.0
    val vPad = if (portrait) 0.0 else (1 - height.toDouble() / width) / 2
    val sx = width / (DETECTOR_INPUT * (1 - 2 * hPad))
    val sy = height / (DETECTOR_INPUT * (1 - 2 * vPad))
    Crop.warp(
      rgba, width, height,
      sx.toFloat(), 0f, (-hPad * width / (1 - 2 * hPad)).toFloat(),
      0f, sy.toFloat(), (-vPad * height / (1 - 2 * vPad)).toFloat(),
      DETECTOR_INPUT, DETECTOR_INPUT, false, 2f / 255f, -1f, detectorInput,
    )
    detectorIn[0].writeFloat(detectorInput)
    detector.run(detectorIn, detectorOut)
    val boxes = detectorOut[0].readFloat()
    val scores = detectorOut[1].readFloat()
    val found = ArrayList<Detection>()
    for (i in 0 until DETECTOR_ANCHORS) {
      val score = sigmoid(scores[i].toDouble().coerceIn(-SCORE_CLIP, SCORE_CLIP))
      if (score < minDetection) continue
      val row = i * DETECTOR_VALUES
      val (ax, ay) = anchors[i]
      val xc = boxes[row] / DETECTOR_INPUT.toDouble() + ax
      val yc = boxes[row + 1] / DETECTOR_INPUT.toDouble() + ay
      val w = boxes[row + 2] / DETECTOR_INPUT.toDouble()
      val h = boxes[row + 3] / DETECTOR_INPUT.toDouble()
      if (!(w >= 0 && h >= 0)) continue
      val keypoints = DoubleArray(8) { k -> boxes[row + 4 + k] / DETECTOR_INPUT.toDouble() + if (k % 2 == 0) ax else ay }
      found.add(Detection(score, doubleArrayOf(xc - w / 2, yc - h / 2, xc + w / 2, yc + h / 2), keypoints))
    }
    val best = weightedNms(found).firstOrNull() ?: return null
    // Out of the letterbox, into fractions of the frame, then pixels.
    val kx = { k: Int -> (best.keypoints[2 * k] - hPad) / (1 - 2 * hPad) * width }
    val ky = { k: Int -> (best.keypoints[2 * k + 1] - vPad) / (1 - 2 * vPad) * height }
    return roiFrom(kx(0), ky(0), kx(1), ky(1))
  }

  /** Draws the rotated square into the landmark model's input, edges repeated, values in [0, 1]. */
  private fun sample(rgba: ByteBuffer, width: Int, height: Int, roi: Roi) {
    val step = roi.side / LANDMARK_INPUT
    val c = cos(roi.rotation)
    val s = sin(roi.rotation)
    Crop.warp(
      rgba, width, height,
      (step * c).toFloat(), (-step * s).toFloat(), (roi.cx - roi.side * c / 2 + roi.side * s / 2).toFloat(),
      (step * s).toFloat(), (step * c).toFloat(), (roi.cy - roi.side * s / 2 - roi.side * c / 2).toFloat(),
      LANDMARK_INPUT, LANDMARK_INPUT, true, 1f / 255f, 0f, landmarkInput,
    )
  }

  private fun smooth(points: List<DoubleArray>, next: Roi, width: Int, height: Int, tMs: Long): DoubleArray {
    val filters = smoother ?: Array(POSE_LANDMARKS * 3) { OneEuro() }.also { smoother = it }
    val valueScale = if (next.side < MIN_OBJECT_SCALE) 0.0 else 1 / next.side
    val tNs = tMs * 1_000_000
    val out = DoubleArray(POSE_LANDMARKS * OUT_VALUES)
    for (i in 0 until POSE_LANDMARKS) {
      val p = points[i]
      val scales = doubleArrayOf(width.toDouble(), height.toDouble(), width.toDouble())
      for (k in 0 until 3) {
        val pixels = p[k] * scales[k]
        val filtered = if (valueScale == 0.0) pixels else filters[i * 3 + k].apply(tNs, valueScale, pixels)
        out[i * OUT_VALUES + k] = filtered / scales[k]
      }
      out[i * OUT_VALUES + 3] = visibility[i].apply(p[3], VISIBILITY_ALPHA)
    }
    return out
  }

  override fun close() {
    (detectorIn + detectorOut + landmarkerIn + landmarkerOut).forEach { it.close() }
    detector.close()
    landmarker.close()
  }
}

private fun sigmoid(x: Double): Double = 1 / (1 + exp(-x))

/** NormalizeRadians in detections_to_rects_calculator.h. */
private fun normalizeRadians(a: Double): Double = a - 2 * PI * floor((a + PI) / (2 * PI))

/** A region centred on the first point, its side 2.5 times the distance to the second, turned so the second lies straight above the first. */
private fun roiFrom(x0: Double, y0: Double, x1: Double, y1: Double): Roi {
  val rotation = normalizeRadians(PI / 2 - atan2(-(y1 - y0), x1 - x0))
  return Roi(x0, y0, ROI_SIDE_PER_DISTANCE * hypot(x1 - x0, y1 - y0), rotation)
}

/** landmark_projection_calculator.cc with a NORM_RECT: from fractions of the crop to fractions of the frame. */
private fun project(p: DoubleArray, roi: Roi, width: Int, height: Int): DoubleArray {
  val a = p[0] - 0.5
  val b = p[1] - 0.5
  val c = cos(roi.rotation)
  val s = sin(roi.rotation)
  return doubleArrayOf(
    (roi.cx + (c * a - s * b) * roi.side) / width,
    (roi.cy + (s * a + c * b) * roi.side) / height,
    p[2] * roi.side / width,
    p[3],
  )
}

/** refine_landmarks_from_heatmap_calculator.cc: each point moves to the confidence-weighted mean of the heatmap cells around it. */
private fun refineFromHeatmap(points: Array<DoubleArray>, heatmap: FloatArray) {
  val offset = (HEATMAP_KERNEL - 1) / 2
  for (j in points.indices) {
    val col = (points[j][0] * HEATMAP_SIDE).toInt()
    val row = (points[j][1] * HEATMAP_SIDE).toInt()
    if (col < 0 || col >= HEATMAP_SIDE || row < 0 || row >= HEATMAP_SIDE) continue
    var sum = 0.0
    var weightedCol = 0.0
    var weightedRow = 0.0
    var most = 0.0
    for (r in max(0, row - offset) until min(HEATMAP_SIDE, row + offset + 1)) {
      for (cc in max(0, col - offset) until min(HEATMAP_SIDE, col + offset + 1)) {
        val confidence = sigmoid(heatmap[(r * HEATMAP_SIDE + cc) * MODEL_LANDMARKS + j].toDouble())
        sum += confidence
        most = max(most, confidence)
        weightedCol += cc * confidence
        weightedRow += r * confidence
      }
    }
    if (most >= HEATMAP_MIN_CONFIDENCE && sum > 0) {
      points[j][0] = weightedCol / HEATMAP_SIDE / sum
      points[j][1] = weightedRow / HEATMAP_SIDE / sum
    }
  }
}

/** The SSD anchors of ssd_anchors_calculator.cc for the pose detector: centres only, as its anchor size is fixed at 1. */
private fun ssdAnchors(): List<Pair<Double, Double>> {
  val strides = intArrayOf(8, 16, 32, 32, 32)
  val anchors = ArrayList<Pair<Double, Double>>()
  var layer = 0
  while (layer < strides.size) {
    var perCell = 0
    var last = layer
    // Layers that share a stride share one feature map; each adds an anchor and an interpolated one.
    while (last < strides.size && strides[last] == strides[layer]) {
      perCell += 2
      last += 1
    }
    val side = (DETECTOR_INPUT + strides[layer] - 1) / strides[layer]
    for (y in 0 until side) for (x in 0 until side) repeat(perCell) {
      anchors.add((x + 0.5) / side to (y + 0.5) / side)
    }
    layer = last
  }
  check(anchors.size == DETECTOR_ANCHORS) { "anchors ${anchors.size}" }
  return anchors
}

/** non_max_suppression_calculator.cc's weighted overlap: a group takes its best score and the score-weighted mean of its boxes and keypoints. */
private fun weightedNms(detections: List<Detection>): List<Detection> {
  val remaining = detections.sortedByDescending { it.score }.toMutableList()
  val kept = ArrayList<Detection>()
  while (remaining.isNotEmpty()) {
    val top = remaining[0]
    val group = remaining.filter { iou(top.box, it.box) > NMS_IOU }
    remaining.removeAll(group.toSet())
    val total = group.sumOf { it.score }
    val box = DoubleArray(4) { k -> group.sumOf { it.box[k] * it.score } / total }
    val keypoints = DoubleArray(top.keypoints.size) { k -> group.sumOf { it.keypoints[k] * it.score } / total }
    kept.add(Detection(top.score, box, keypoints))
  }
  return kept
}

private fun iou(a: DoubleArray, b: DoubleArray): Double {
  val w = min(a[2], b[2]) - max(a[0], b[0])
  val h = min(a[3], b[3]) - max(a[1], b[1])
  if (w <= 0 || h <= 0) return 0.0
  val shared = w * h
  return shared / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - shared)
}

/** low_pass_filter.cc: the first value passes, then each is blended with the last output. */
private class LowPass {
  var last = Double.NaN
    private set
  var lastRaw = Double.NaN
    private set

  fun apply(value: Double, alpha: Double): Double {
    lastRaw = value
    last = if (last.isNaN()) value else alpha * value + (1 - alpha) * last
    return last
  }
}

/** one_euro_filter.cc, with its time in nanoseconds and its derivative from the raw values. */
private class OneEuro {
  private var frequency = EURO_START_FREQUENCY
  private var lastTime = -1L
  private val x = LowPass()
  private val dx = LowPass()

  fun apply(tNs: Long, valueScale: Double, value: Double): Double {
    if (lastTime >= tNs) return value
    if (lastTime != 0L && tNs != 0L) frequency = 1 / ((tNs - lastTime) * 1e-9)
    lastTime = tNs
    val dvalue = if (x.lastRaw.isNaN()) 0.0 else (value - x.lastRaw) * valueScale * frequency
    val edvalue = dx.apply(dvalue, alpha(EURO_DERIVATE_CUTOFF))
    val cutoff = EURO_MIN_CUTOFF + EURO_BETA * abs(edvalue)
    return x.apply(value, alpha(cutoff))
  }

  private fun alpha(cutoff: Double): Double = 1 / (1 + frequency / (2 * PI * cutoff))
}
