#include <jni.h>
#include <algorithm>
#include <cmath>
#include <cstdint>

/**
 * Samples an RGBA frame into a model input of `outW` by `outH` RGB floats, channel last.
 *
 * Output pixel (u, v) takes the frame at sx = a·(u+½) + b·(v+½) + c, sy = d·(u+½) + e·(v+½) + f,
 * bilinearly between pixel centres. Outside the frame a tap reads the nearest edge pixel when
 * `replicate`, else 0. Each channel is written as value·scale + offset.
 */
extern "C" JNIEXPORT void JNICALL Java_com_margelo_nitro_wallballvision_Crop_warp(
    JNIEnv* env, jclass, jobject rgbaBuffer, jint width, jint height, jfloat a, jfloat b, jfloat c, jfloat d,
    jfloat e, jfloat f, jint outW, jint outH, jboolean replicate, jfloat scale, jfloat offset, jfloatArray out) {
  const auto* rgba = static_cast<const uint8_t*>(env->GetDirectBufferAddress(rgbaBuffer));
  jfloat* hwc = static_cast<jfloat*>(env->GetPrimitiveArrayCritical(out, nullptr));
  auto tap = [&](int32_t x, int32_t y, int32_t channel) -> float {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      if (!replicate) return 0.0f;
      x = std::clamp(x, 0, width - 1);
      y = std::clamp(y, 0, height - 1);
    }
    return rgba[(static_cast<size_t>(y) * width + x) * 4 + channel];
  };
  for (int32_t v = 0; v < outH; ++v) {
    for (int32_t u = 0; u < outW; ++u) {
      const float px = a * (u + 0.5f) + b * (v + 0.5f) + c - 0.5f;
      const float py = d * (u + 0.5f) + e * (v + 0.5f) + f - 0.5f;
      const float fx = std::floor(px);
      const float fy = std::floor(py);
      const auto x0 = static_cast<int32_t>(fx);
      const auto y0 = static_cast<int32_t>(fy);
      const float wx = px - fx;
      const float wy = py - fy;
      jfloat* pixel = hwc + (static_cast<size_t>(v) * outW + u) * 3;
      for (int32_t ch = 0; ch < 3; ++ch) {
        const float top = tap(x0, y0, ch) * (1 - wx) + tap(x0 + 1, y0, ch) * wx;
        const float bottom = tap(x0, y0 + 1, ch) * (1 - wx) + tap(x0 + 1, y0 + 1, ch) * wx;
        pixel[ch] = (top * (1 - wy) + bottom * wy) * scale + offset;
      }
    }
  }
  env->ReleasePrimitiveArrayCritical(out, hwc, 0);
}
