#include <jni.h>
#include <cstdint>

namespace {

// Where an upright pixel reads the frame, for a frame turned `quarterTurns` quarter turns clockwise from upright.
inline void source(int32_t quarterTurns, int32_t ux, int32_t uy, int32_t width, int32_t height, int32_t* sx,
                   int32_t* sy) {
  switch (quarterTurns) {
    case 1:
      *sx = width - 1 - uy;
      *sy = ux;
      return;
    case 2:
      *sx = width - 1 - ux;
      *sy = height - 1 - uy;
      return;
    case 3:
      *sx = uy;
      *sy = height - 1 - ux;
      return;
    default:
      *sx = ux;
      *sy = uy;
  }
}

}  // namespace

/**
 * Copies a camera frame's RGBA plane, `rowBytes` bytes a row, upright into `rgba`: turned back by `quarterTurns`
 * quarter turns and unmirrored when `mirrored`. Returns the upright width and height.
 */
extern "C" JNIEXPORT jintArray JNICALL Java_com_margelo_nitro_wallballvision_CameraFrames_copyRgba(
    JNIEnv* env, jclass, jobject src, jint rowBytes, jint width, jint height, jint quarterTurns, jboolean mirrored,
    jobject rgba) {
  const auto* in = static_cast<const uint8_t*>(env->GetDirectBufferAddress(src));
  auto* out = static_cast<uint32_t*>(env->GetDirectBufferAddress(rgba));
  const bool turned = quarterTurns % 2 == 1;
  const int32_t outW = turned ? height : width;
  const int32_t outH = turned ? width : height;
  if (in == nullptr || out == nullptr || env->GetDirectBufferCapacity(rgba) < static_cast<jlong>(outW) * outH * 4 ||
      env->GetDirectBufferCapacity(src) < static_cast<jlong>(rowBytes) * (height - 1) + width * 4) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), "the camera frame's buffers do not fit its size");
    return nullptr;
  }
  for (int32_t uy = 0; uy < outH; ++uy) {
    uint32_t* row = out + static_cast<size_t>(uy) * outW;
    for (int32_t ux = 0; ux < outW; ++ux) {
      int32_t sx = 0;
      int32_t sy = 0;
      source(quarterTurns, mirrored ? outW - 1 - ux : ux, uy, width, height, &sx, &sy);
      row[ux] = *reinterpret_cast<const uint32_t*>(in + static_cast<size_t>(sy) * rowBytes + static_cast<size_t>(sx) * 4);
    }
  }
  jintArray size = env->NewIntArray(2);
  const jint values[2] = {outW, outH};
  env->SetIntArrayRegion(size, 0, 2, values);
  return size;
}
