package com.margelo.nitro.wallballvision

import android.content.Context
import com.google.mediapipe.framework.image.ByteBufferImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker

/**
 * The pose in one frame at a time, with no memory of other frames, for frames the judging does not read: the PWA's
 * `createStillPose`, MediaPipe's image mode on the CPU at the settings' confidence.
 */
class StillPose(context: Context, confidence: Float) : AutoCloseable {
  private val landmarker = PoseLandmarker.createFromOptions(
    context,
    PoseLandmarker.PoseLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetPath("models/pose_landmarker_full.task").setDelegate(Delegate.CPU).build())
      .setRunningMode(RunningMode.IMAGE)
      .setNumPoses(1)
      .setMinPoseDetectionConfidence(confidence)
      .setMinPosePresenceConfidence(confidence)
      .setMinTrackingConfidence(confidence)
      .build(),
  )

  fun find(frame: RgbaFrame): DoubleArray {
    frame.pixels.rewind()
    val image = ByteBufferImageBuilder(frame.pixels, frame.width, frame.height, MPImage.IMAGE_FORMAT_RGBA).build()
    return Landmarks.flat(landmarker.detect(image).landmarks().firstOrNull())
  }

  override fun close() = landmarker.close()
}
