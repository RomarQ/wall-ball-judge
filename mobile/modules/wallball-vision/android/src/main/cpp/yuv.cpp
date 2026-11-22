#include <jni.h>
#include <cstdint>

#include "yuv.h"



extern "C" JNIEXPORT void JNICALL Java_com_margelo_nitro_wallballvision_Yuv_toRgba(
    JNIEnv* env, jclass, jobject yPlane, jint yRowStride, jobject uPlane, jobject vPlane, jint uvRowStride,
    jint uvPixelStride, jint left, jint top, jint width, jint height, jboolean bt709, jboolean fullRange,
    jobject rgba) {
  const auto* y = static_cast<const uint8_t*>(env->GetDirectBufferAddress(yPlane));
  const auto* u = static_cast<const uint8_t*>(env->GetDirectBufferAddress(uPlane));
  const auto* v = static_cast<const uint8_t*>(env->GetDirectBufferAddress(vPlane));
  auto* out = static_cast<uint8_t*>(env->GetDirectBufferAddress(rgba));
  const yuv::Matrix m = yuv::matrixFor(bt709, fullRange);
  const int32_t yOffset = fullRange ? 0 : 16;
  for (int32_t row = 0; row < height; ++row) {
    const uint8_t* yRow = y + (top + row) * yRowStride + left;
    const int32_t uvRow = ((top + row) / 2) * uvRowStride;
    uint8_t* outRow = out + static_cast<size_t>(row) * width * 4;
    for (int32_t col = 0; col < width; ++col) {
      const int32_t uv = uvRow + ((left + col) / 2) * uvPixelStride;
      yuv::toPixel(m, yOffset, yRow[col], u[uv], v[uv], outRow + col * 4);
    }
  }
}
