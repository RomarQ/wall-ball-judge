#pragma once

#include <algorithm>
#include <cstdint>

// YUV to RGB in fixed point, scaled by 2^10, shared by the decoder's and the camera's frames.
namespace yuv {

struct Matrix {
  int32_t y, rv, gu, gv, bu;
};

constexpr int32_t kShift = 10;

// The matrix also folds in the range: limited range stretches Y from 16..235 and chroma from 16..240.
inline Matrix matrixFor(bool bt709, bool fullRange) {
  const double ys = fullRange ? 1.0 : 255.0 / 219.0;
  const double cs = fullRange ? 1.0 : 255.0 / 224.0;
  const double rv = bt709 ? 1.5748 : 1.402;
  const double gu = bt709 ? 0.187324 : 0.344136;
  const double gv = bt709 ? 0.468124 : 0.714136;
  const double bu = bt709 ? 1.8556 : 1.772;
  const double one = 1 << kShift;
  return {static_cast<int32_t>(ys * one), static_cast<int32_t>(rv * cs * one),
          static_cast<int32_t>(gu * cs * one), static_cast<int32_t>(gv * cs * one),
          static_cast<int32_t>(bu * cs * one)};
}

inline uint8_t clamp8(int32_t value) {
  return static_cast<uint8_t>(std::min(255, std::max(0, value >> kShift)));
}

// Writes one RGBA pixel from a luma and the two chroma samples.
inline void toPixel(const Matrix& m, int32_t yOffset, uint8_t y, uint8_t u, uint8_t v, uint8_t* out) {
  const int32_t luma = (y - yOffset) * m.y;
  const int32_t cb = u - 128;
  const int32_t cr = v - 128;
  out[0] = clamp8(luma + m.rv * cr);
  out[1] = clamp8(luma - m.gu * cb - m.gv * cr);
  out[2] = clamp8(luma + m.bu * cb);
  out[3] = 255;
}

}  // namespace yuv
