package com.margelo.nitro.wallballvision

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import android.content.Intent
import android.os.SystemClock
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.bridge.BaseActivityEventListener
import com.google.ai.edge.litert.BuiltinNpuAcceleratorProvider
import com.google.ai.edge.litert.CompiledModel
import com.google.ai.edge.litert.Environment
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.ArrayBuffer
import com.margelo.nitro.core.Promise
import android.os.Build
import android.util.Log
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import org.json.JSONObject

private const val WARMUP_RUNS = 10
private const val TIMED_RUNS = 100
private const val TONE_VALUES = 5
private const val SNAPSHOT_WAIT_S = 2L
/** The saved frames' name prefixes: a video's search frames, and the camera's. */
private const val SEARCH_FRAME = "search-"
private const val CAMERA_FRAME = "camera-search-"
/** The PWA's agreement.ts limit: a unit whose answer sits further from the CPU's computes something else. */
private const val AGREEMENT_LIMIT = 0.01
/** The upright frame the phone check times its looks and pose frames on: a 720p camera frame, as the board judges it. */
private const val CHECK_WIDTH = 720
private const val CHECK_HEIGHT = 1280
private const val CHECK_WARMUPS = 2
private const val CHECK_RUNS = 9
private const val FINDER_RUNS = 3
/** The request code of the video picker's result. */
private const val PICK_VIDEO = 0x5650

@Keep
@DoNotStrip
class HybridWallballVision : HybridWallballVisionSpec() {
  private val context: Context get() = NitroModules.applicationContext ?: error("no application context")
  private var clip: Clip? = null
  private var clipPipeline: FramePipeline? = null
  private var camera: FramePipeline? = null
  /** The look the next camera frames start, or null for none. */
  @Volatile private var lookWanted: LookRequest? = null
  /** Where an open clip shows each frame it judges: the [HybridClipView] that names this module. */
  @Volatile internal var screen: FrameScreen? = null
  /** One thread for search looks, so a search's decoder and models are used one look at a time. */
  private val searchThread = Executors.newSingleThreadExecutor()
  private var search: Clip? = null
  private var searchSource: String? = null
  /** Numbers the saved frames: the board's image view caches a frame by its address, so no two frames may share one. */
  private var savedFrames = 0L
  /** Moves set videos into the phone's Movies folder, off the JavaScript thread: a set's video is hundreds of MB. */
  private val videoThread = Executors.newSingleThreadExecutor()
  private var targetModel: TargetModel? = null
  private var stillPose: Pair<Float, StillPose>? = null
  private val prefs by lazy { Prefs(context) }
  /** The open pick, which the picker's result settles. */
  @Volatile private var picking: Promise<VideoItem?>? = null
  private var listensForPicks = false
  private val pickResult = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != PICK_VIDEO) return
      val promise = picking ?: return
      picking = null
      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) promise.resolve(null)
      else videoThread.execute { promise.resolve(Media.video(context, uri.toString())) }
    }
  }
  private val sound by lazy { Sound(context) }

  override fun nowMs(): Double = SystemClock.elapsedRealtimeNanos() / 1e6

  override fun ballUnits(input: Double): Promise<Array<String>> = onSearchThread { checkBallUnits(context, prefs, input.toInt()) }

  override fun checkPhone(cutWidth: Double, input: Double): Promise<PhoneCheck> = onSearchThread {
    val size = input.toInt()
    val unit = checkBallUnits(context, prefs, size).first()
    val cut = cutWidth.toInt()
    val ballMs = ballRunMs(context, prefs, unit, size)?.let { it + Letterbox.drawMs(CHECK_WIDTH, CHECK_HEIGHT, cut, size, CHECK_RUNS) }
    val poseMs = runCatching {
      OwnPose(context, "CPU", CHECK_THRESHOLD, CHECK_THRESHOLD).use { it.trackedFrameMs(CHECK_WIDTH, CHECK_HEIGHT, CHECK_RUNS) }
    }.getOrNull()
    val finderMs = runCatching {
      val model = targetModel ?: TargetModel(context).also { targetModel = it }
      model.lookMs(CHECK_WIDTH, CHECK_HEIGHT, cut, FINDER_RUNS)
    }.getOrNull()
    PhoneCheck(unit, ballMs, poseMs, finderMs)
  }

  override fun openClip(source: String, options: JudgeOptions): ClipInfo {
    closeClip()
    val opened = Clip(context, source)
    clip = opened
    clipPipeline = pipelineFor(options)
    return opened.info
  }

  override fun nextPoseFrame(look: Boolean, window: LookWindow?): PoseFrame? {
    val pipeline = clipPipeline ?: return null
    return clip?.next(pipeline, if (look) LookRequest(window) else null, screen)
  }

  override fun closeClip() {
    clip?.close()
    clip = null
    clipPipeline?.close()
    clipPipeline = null
  }

  override fun searchClipAt(source: String, seconds: Double, cutWidth: Double, minScore: Double, confidence: Double): Promise<TargetLook> =
    onSearchThread {
      if (searchSource != source) {
        search?.close()
        search = Clip(context, source)
        searchSource = source
        Media.clearFrames(context, SEARCH_FRAME)
      }
      val frame = search!!.frameAt(seconds)
      val landmarks = stillPoseAt(confidence.toFloat()).find(frame)
      lookAt(frame, cutWidth, minScore, landmarks, "$SEARCH_FRAME${++savedFrames}.jpg")
    }

  override fun closeSearch() {
    searchThread.execute {
      search?.close()
      search = null
      searchSource = null
    }
  }

  override fun openCamera(options: JudgeOptions) {
    closeCamera()
    camera = pipelineFor(options)
  }

  override fun cameraFrame(pixels: ArrayBuffer, bytesPerRow: Double, width: Double, height: Double, orientation: String, mirrored: Boolean, tMs: Double): PoseFrame {
    val pipeline = camera ?: error("the camera's pipeline is not open")
    return synchronized(pipeline) {
      CameraFrames.judge(pipeline, pixels.getBuffer(false), bytesPerRow.toInt(), width.toInt(), height.toInt(), orientation, mirrored, tMs.toLong(), lookWanted)
    }
  }

  override fun setLookWanted(wanted: Boolean, window: LookWindow?) {
    lookWanted = if (wanted) LookRequest(window) else null
  }

  override fun retrackPose() {
    camera?.retrack()
    clipPipeline?.retrack()
  }

  override fun searchCamera(cutWidth: Double, minScore: Double): Promise<TargetLook> {
    val pipeline = camera ?: return Promise.rejected(IllegalStateException("the camera is not open"))
    val next = pipeline.snapshot()
    return onSearchThread {
      Media.clearFrames(context, CAMERA_FRAME)
      lookAt(next.get(SNAPSHOT_WAIT_S, TimeUnit.SECONDS), cutWidth, minScore, DoubleArray(0), "$CAMERA_FRAME${++savedFrames}.jpg")
    }
  }

  override fun closeCamera() {
    val pipeline = camera ?: return
    camera = null
    // A frame still being judged holds the pipeline; it closes once that frame is done.
    synchronized(pipeline) { pipeline.close() }
  }

  override fun getSetting(key: String): String? = prefs.get(key)

  override fun setSetting(key: String, value: String) = prefs.set(key, value)

  override fun removeSetting(key: String) = prefs.remove(key)

  override fun locale(): String = Locale.getDefault().toLanguageTag()

  // The int overload works on every Android version; the flags overload needs Android 13.
  @Suppress("DEPRECATION")
  override fun appVersion(): String = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""

  override fun say(text: String, tag: String, rate: Double) = sound.say(text, tag, rate)

  override fun tones(parts: DoubleArray, attackMs: Double, floor: Double) {
    require(parts.size % TONE_VALUES == 0) { "tones take $TONE_VALUES numbers each" }
    val tones = parts.toList().chunked(TONE_VALUES).map { (atMs, ms, frequency, gain, square) ->
      Tone(atMs / 1000, ms / 1000, frequency, gain, square != 0.0)
    }
    sound.tones(tones, attackMs / 1000, floor)
  }

  override fun pickVideo(): Promise<VideoItem?> {
    val promise = Promise<VideoItem?>()
    val react = NitroModules.applicationContext ?: error("no application context")
    val activity = react.currentActivity
    if (activity == null || picking != null) return promise.also { it.resolve(null) }
    if (!listensForPicks) {
      react.addActivityEventListener(pickResult)
      listensForPicks = true
    }
    picking = promise
    val pick = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("video/*")
    activity.runOnUiThread {
      try {
        activity.startActivityForResult(pick, PICK_VIDEO)
      } catch (e: ActivityNotFoundException) {
        picking = null
        promise.resolve(null)
      }
    }
    return promise
  }

  override fun videoAt(source: String): VideoItem? = Media.video(context, source)

  override fun saveText(name: String, text: String) {
    File(context.getExternalFilesDir(null), name).writeText(text)
  }

  override fun readKeptText(name: String): String? = File(context.filesDir, name).takeIf { it.exists() }?.readText()

  override fun keepText(name: String, text: String) {
    val file = File(context.filesDir, name)
    val partial = File(context.filesDir, "$name.partial")
    partial.writeText(text)
    check(partial.renameTo(file)) { "could not keep $name" }
  }

  override fun keepVideo(path: String, title: String): Promise<String> {
    val promise = Promise<String>()
    videoThread.execute { promise.resolve(Media.keepVideo(context, File(path), title)) }
    return promise
  }

  override fun dropVideo(path: String) {
    File(path).delete()
  }

  override fun deleteVideo(uri: String): Boolean = context.contentResolver.delete(Uri.parse(uri), null, null) > 0

  override fun openVideo(uri: String) {
    val view = Intent(Intent.ACTION_VIEW)
      .setDataAndType(Uri.parse(uri), "video/mp4")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(view)
  }

  private fun pipelineFor(options: JudgeOptions) = FramePipeline(
    context, options.pose, options.ball, options.detection.toFloat(), options.presence.toFloat(), options.tracking.toFloat(),
  )

  private fun stillPoseAt(confidence: Float): StillPose {
    val held = stillPose
    if (held != null && held.first == confidence) return held.second
    held?.second?.close()
    return StillPose(context, confidence).also { stillPose = confidence to it }
  }

  private fun lookAt(frame: RgbaFrame, cutWidth: Double, minScore: Double, landmarks: DoubleArray, image: String): TargetLook {
    val model = targetModel ?: TargetModel(context).also { targetModel = it }
    val found = model.look(frame, cutWidth.toInt(), minScore)
    return TargetLook(frame.width.toDouble(), frame.height.toDouble(), found, landmarks, Media.saveJpeg(context, frame, image))
  }

  private fun <T> onSearchThread(run: () -> T): Promise<T> {
    val promise = Promise<T>()
    searchThread.execute {
      try {
        promise.resolve(run())
      } catch (e: Throwable) {
        promise.reject(e)
      }
    }
    return promise
  }
}

private class Timed(val output: FloatArray, val summary: JSONObject)

/** The thresholds the check's pose opens with: they decide what a frame finds, not what it costs. */
private const val CHECK_THRESHOLD = 0.5

/**
 * The scope of a stored ball-unit check: this system build, this install and the ball model's input size, since a new
 * install may ship another ball model, and each size is a model of its own.
 */
private fun unitScope(context: Context, input: Int) = "${Build.FINGERPRINT}@${Litert.installed(context)}@$input"

private fun ballRunKey(context: Context, unit: String, input: Int) = "ballRunMs3@${unitScope(context, input)}@$unit"

/** Times the ball model at `input` pixels on `unit` as a set opens it, on the probe frame, and keeps its median run for the phone check. */
private fun timeBall(context: Context, prefs: Prefs, unit: String, input: Int, frame: FloatArray, warmups: Int = WARMUP_RUNS, runs: Int = TIMED_RUNS): Timed {
  val (asset, opening) = BallModel.on(context, unit, input)
  val timed = timeModel(context, Litert.environment(context), asset, opening, frame, warmups, runs)
  prefs.set(ballRunKey(context, unit, input), timed.summary.getDouble("medianMs").toString())
  return timed
}

/** The median run of the ball model at `input` pixels on `unit`, as the unit check timed it, timed now when it did not; null when it does not run. */
private fun ballRunMs(context: Context, prefs: Prefs, unit: String, input: Int): Double? {
  prefs.get(ballRunKey(context, unit, input))?.toDoubleOrNull()?.let { return it }
  return runCatching {
    timeBall(context, prefs, unit, input, readFrame(context, input), CHECK_WARMUPS, CHECK_RUNS).summary.getDouble("medianMs")
  }.getOrNull()
}


/** The probe frame of the ball model at `input` pixels, `[1, 3, input, input]` float32. */
private fun readFrame(context: Context, input: Int): FloatArray {
  val bytes = context.assets.open("probe/frame-$input.raw").use { it.readBytes() }
  val frame = FloatArray(bytes.size / 4)
  ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(frame)
  return frame
}

private fun timeModel(
  context: Context,
  env: Environment,
  asset: String,
  options: CompiledModel.Options,
  frame: FloatArray,
  warmups: Int = WARMUP_RUNS,
  runs: Int = TIMED_RUNS,
): Timed {
  val opening = SystemClock.elapsedRealtimeNanos()
  CompiledModel.create(context.assets, asset, options, env).use { model ->
    val openMs = (SystemClock.elapsedRealtimeNanos() - opening) / 1e6
    val inputs = model.createInputBuffers()
    val outputs = model.createOutputBuffers()
    try {
      inputs[0].writeFloat(frame)
      repeat(warmups) {
        model.run(inputs, outputs)
        outputs[0].readFloat()
      }
      // A run on the GPU returns before the GPU is done, and reading the output waits for it, as a look reads it.
      val runMs = DoubleArray(runs) {
        val start = SystemClock.elapsedRealtimeNanos()
        model.run(inputs, outputs)
        outputs[0].readFloat()
        (SystemClock.elapsedRealtimeNanos() - start) / 1e6
      }
      runMs.sort()
      val summary = JSONObject()
        .put("openMs", openMs)
        .put("medianMs", runMs[runs / 2])
        .put("p95Ms", runMs[(runs * 95) / 100])
        .put("minMs", runMs[0])
      return Timed(outputs[0].readFloat(), summary)
    } finally {
      inputs.forEach { it.close() }
      outputs.forEach { it.close() }
    }
  }
}

/** The same measure as the PWA's agreement check: the summed difference as a share of the summed CPU answer. */
private fun compare(cpu: FloatArray, tpu: FloatArray): JSONObject {
  val n = minOf(cpu.size, tpu.size)
  var apart = 0.0
  var scale = 0.0
  var largest = 0.0
  for (i in 0 until n) {
    val difference = abs(cpu[i] - tpu[i]).toDouble()
    apart += difference
    scale += abs(cpu[i]).toDouble()
    largest = max(largest, difference)
  }
  return JSONObject()
    .put("cpuValues", cpu.size)
    .put("tpuValues", tpu.size)
    .put("apartOverScale", apart / scale)
    .put("largestDifference", largest)
}

/**
 * The ball units this phone runs the ball model at `input` pixels on, the fastest first, checked once per `unitScope` on
 * the probe frame: the TPU when the model compiled for it loads and answers within the agreement limit of the CPU's;
 * else the GPU when it does so and runs faster than the CPU; then the CPU. The GPU is tried only without a TPU, which
 * beats it on every phone that has one.
 */
private fun checkBallUnits(context: Context, prefs: Prefs, input: Int): Array<String> {
  val key = "ballUnits3@${unitScope(context, input)}"
  prefs.get(key)?.let { return it.split(",").toTypedArray() }
  // For checks over adb: each unit tried, its median run and its distance from the CPU's answer.
  val seen = mutableListOf<String>()
  val units = runCatching {
    val frame = readFrame(context, input)
    val cpu = timeBall(context, prefs, "CPU", input, frame)
    seen.add("CPU %.1f ms".format(Locale.ROOT, cpu.summary.getDouble("medianMs")))
    val agrees = { unit: String, timed: Timed ->
      val apart = compare(cpu.output, timed.output).getDouble("apartOverScale")
      seen.add("$unit %.1f ms, %.1e apart".format(Locale.ROOT, timed.summary.getDouble("medianMs"), apart))
      apart < AGREEMENT_LIMIT
    }
    val tpu = if (BuiltinNpuAcceleratorProvider(context).isDeviceSupported()) tryBallUnit(context, prefs, "TPU", input, frame) else null
    when {
      tpu != null && agrees("TPU", tpu) -> listOf("TPU", "CPU")
      else -> {
        val gpu = tryBallUnit(context, prefs, "GPU", input, frame)
        val faster = gpu != null && agrees("GPU", gpu) && gpu.summary.getDouble("medianMs") < cpu.summary.getDouble("medianMs")
        if (faster) listOf("GPU", "CPU") else listOf("CPU")
      }
    }
  }.getOrElse { listOf("CPU") }
  prefs.set(key, units.joinToString(","))
  Log.i("WallballVision", "ball units on ${Build.SOC_MANUFACTURER} ${Build.SOC_MODEL} at $input: ${units.joinToString(",")} (${seen.joinToString("; ")})")
  return units.toTypedArray()
}

/**
 * Times the ball model at `input` pixels on `unit`, or null when it failed. A unit whose try crashed the process takes no
 * try with it, so a try that never came back marks the unit, and later checks skip it.
 */
private fun tryBallUnit(context: Context, prefs: Prefs, unit: String, input: Int, frame: FloatArray): Timed? {
  val tried = "ballUnitCrashed@${unitScope(context, input)}@$unit"
  if (prefs.get(tried) != null) return null
  prefs.setNow(tried, Build.SOC_MODEL)
  val timed = runCatching { timeBall(context, prefs, unit, input, frame) }.getOrNull()
  prefs.remove(tried)
  return timed
}
