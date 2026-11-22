#include <jni.h>
#include <cstdint>
#include <cstring>

/** Turns an RGBA image `turns` quarter turns clockwise into `dst`, which is height by width for an odd number of turns. */
extern "C" JNIEXPORT void JNICALL Java_com_margelo_nitro_wallballvision_Rgba_rotate(JNIEnv* env, jclass, jobject src,
                                                                                    jint width, jint height, jint turns,
                                                                                    jobject dst) {
  const auto* in = static_cast<const uint32_t*>(env->GetDirectBufferAddress(src));
  auto* out = static_cast<uint32_t*>(env->GetDirectBufferAddress(dst));
  const int32_t q = ((turns % 4) + 4) % 4;
  const int32_t outW = q % 2 == 1 ? height : width;
  for (int32_t y = 0; y < height; ++y) {
    for (int32_t x = 0; x < width; ++x) {
      int32_t ox = x;
      int32_t oy = y;
      switch (q) {
        case 1:
          ox = height - 1 - y;
          oy = x;
          break;
        case 2:
          ox = width - 1 - x;
          oy = height - 1 - y;
          break;
        case 3:
          ox = y;
          oy = width - 1 - x;
          break;
        default:
          break;
      }
      out[static_cast<size_t>(oy) * outW + ox] = in[static_cast<size_t>(y) * width + x];
    }
  }
}
