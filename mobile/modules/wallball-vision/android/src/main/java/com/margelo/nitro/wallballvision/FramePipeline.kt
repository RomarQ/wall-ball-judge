package com.margelo.nitro.wallballvision

import android.content.Context
import android.os.SystemClock
import com.google.mediapipe.framework.image.ByteBufferImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicReference

private const val POSE_MODEL = "models/pose_landmarker_full.task"
private const val POINT_VALUES = 4

/**
 * What every frame goes through once it is upright RGBA with a time, from a clip or from the camera: the video-mode
 * pose, and a look of the ball model when one is asked for and the last one has finished.
 *
 * `pose` picks the pose: CPU or GPU runs MediaPipe Tasks on that unit; OWN_CPU or OWN_TPU runs [OwnPose], its landmark
 * model on that unit. Frames go into two RGBA buffers in turn, so a look can draw from one while the next frame is
 * written into the other.
 */
class FramePipeline(
  context: Context,
  pose: String,
  ball: BallOptions,
  detection: Float,
  presence: Float,
  tracking: Float,
) : AutoCloseable {
  private val own: OwnPose? =
    if (pose.startsWith("OWN_")) OwnPose(context, pose.removePrefix("OWN_"), detection.toDouble(), presence.toDouble()) else null
  private val landmarker: PoseLandmarker? = if (own != null) null else {
    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetPath(POSE_MODEL).setDelegate(Delegate.valueOf(pose)).build())
      .setRunningMode(RunningMode.VIDEO)
      .setNumPoses(1)
      .setMinPoseDetectionConfidence(detection)
      .setMinPosePresenceConfidence(presence)
      .setMinTrackingConfidence(tracking)
      .build()
    PoseLandmarker.createFromOptions(context, options)
  }
  private val balls: BallEngine? = if (ball.unit == "off") null else BallEngine(context, ball)
  private val rgba = arrayOfNulls<ByteBuffer>(2)
  private var index = 0
  private var lastPoseMs = Long.MIN_VALUE

  private val snapshotWanted = AtomicReference<CompletableFuture<RgbaFrame>?>(null)

  /**
   * A copy of the next frame judged, for a search look of a running camera. The copy is taken on the frame's own
   * thread, as the buffers it comes from are written again two frames later.
   */
  fun snapshot(): CompletableFuture<RgbaFrame> = CompletableFuture<RgbaFrame>().also { snapshotWanted.set(it) }

  /** The buffer the next frame is written into, `bytes` long, once no look still draws from it. */
  fun nextBuffer(bytes: Int): ByteBuffer {
    val slot = index % 2
    while (balls?.isReading(rgba[slot]) == true) Thread.yield()
    val held = rgba[slot]
    val buffer = if (held != null && held.capacity() == bytes) held else ByteBuffer.allocateDirect(bytes).order(ByteOrder.nativeOrder())
    rgba[slot] = buffer
    buffer.rewind()
    return buffer
  }

  /** Finds the pose on the frame in `pixels`, written by [nextBuffer], and starts the look `look` asks for, if any. */
  fun judge(pixels: ByteBuffer, width: Int, height: Int, tMs: Long, look: LookRequest?, decodeMs: Double, convertMs: Double): PoseFrame {
    // MediaPipe's video mode refuses a timestamp that does not increase.
    val poseMs = maxOf(tMs, lastPoseMs + 1)
    lastPoseMs = poseMs
    pixels.rewind()
    snapshotWanted.getAndSet(null)?.complete(RgbaFrame(copyOf(pixels), width, height))
    // The look starts first, so the ball model runs while the pose does.
    val lookStarted = look != null && balls?.look(pixels, width, height, index, look.window) == true
    val start = SystemClock.elapsedRealtimeNanos()
    val (landmarks, detectorMs) = own?.find(pixels, width, height, poseMs) ?: (mediaPipePose(pixels, width, height, poseMs) to 0.0)
    val took = (SystemClock.elapsedRealtimeNanos() - start) / 1e6
    return PoseFrame(
      (index++).toDouble(), poseMs.toDouble(), width.toDouble(), height.toDouble(), landmarks, decodeMs, convertMs, took,
      detectorMs, lookStarted, balls?.take() ?: emptyArray(),
    )
  }

  private fun mediaPipePose(pixels: ByteBuffer, width: Int, height: Int, tMs: Long): DoubleArray {
    val frame = ByteBufferImageBuilder(pixels, width, height, MPImage.IMAGE_FORMAT_RGBA).build()
    return Landmarks.flat(landmarker!!.detectForVideo(frame, tMs).landmarks().firstOrNull())
  }

  /** Drops the athlete the pose follows, so a coming frame finds them afresh. MediaPipe's landmarker has no way to. */
  fun retrack() {
    own?.retrack()
  }

  override fun close() {
    balls?.close()
    landmarker?.close()
    own?.close()
  }
}

/** A frame's look of the ball model: at `window` of the frame, or at the whole frame without one. */
class LookRequest(val window: LookWindow?)

/** An upright RGBA frame. */
class RgbaFrame(val pixels: ByteBuffer, val width: Int, val height: Int)

private fun copyOf(pixels: ByteBuffer): ByteBuffer {
  val copy = ByteBuffer.allocateDirect(pixels.capacity()).order(ByteOrder.nativeOrder())
  copy.put(pixels.duplicate().apply { rewind() })
  copy.rewind()
  return copy
}

/** MediaPipe's results as the module hands landmarks on. */
object Landmarks {
  /** MediaPipe's landmarks as x, y, z and visibility for each point; empty for no pose. */
  fun flat(pose: List<com.google.mediapipe.tasks.components.containers.NormalizedLandmark>?): DoubleArray {
    val landmarks = DoubleArray((pose?.size ?: 0) * POINT_VALUES)
    pose?.forEachIndexed { i, point ->
      landmarks[i * POINT_VALUES] = point.x().toDouble()
      landmarks[i * POINT_VALUES + 1] = point.y().toDouble()
      landmarks[i * POINT_VALUES + 2] = point.z().toDouble()
      landmarks[i * POINT_VALUES + 3] = point.visibility().orElse(0f).toDouble()
    }
    return landmarks
  }
}
