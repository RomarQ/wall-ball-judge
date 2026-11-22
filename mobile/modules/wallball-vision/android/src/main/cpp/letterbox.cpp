#include <jni.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace {

// The grey of the letterbox's bars, as the PWA and the model's training draw it.
constexpr float kGrey = 114.0f / 255.0f;
// Bilinear weights in fixed point: 8 bits a step, so two steps fit in 16 bits.
constexpr int32_t kOne = 256;

// Where each destination pixel samples its source along one axis, at pixel centres.
struct Axis {
  std::vector<int32_t> lo;
  std::vector<int32_t> hi;
  std::vector<int32_t> weight;  // of `hi`, out of kOne
};

Axis axis(int32_t source, int32_t target) {
  Axis a{std::vector<int32_t>(target), std::vector<int32_t>(target), std::vector<int32_t>(target)};
  const float step = static_cast<float>(source) / target;
  for (int32_t d = 0; d < target; ++d) {
    const float s = std::clamp((d + 0.5f) * step - 0.5f, 0.0f, static_cast<float>(source - 1));
    a.lo[d] = static_cast<int32_t>(s);
    a.hi[d] = std::min(a.lo[d] + 1, source - 1);
    a.weight[d] = static_cast<int32_t>(std::lround((s - a.lo[d]) * kOne));
  }
  return a;
}

// Bilinear resize to 3 interleaved channels from `stride` bytes a source pixel (4 for RGBA, 3 for RGB).
void resizeRgb(const uint8_t* src, int32_t sw, int32_t sh, int32_t stride, uint8_t* dst, int32_t dw, int32_t dh) {
  const Axis ax = axis(sw, dw);
  const Axis ay = axis(sh, dh);
  for (int32_t y = 0; y < dh; ++y) {
    const uint8_t* top = src + static_cast<size_t>(ay.lo[y]) * sw * stride;
    const uint8_t* bottom = src + static_cast<size_t>(ay.hi[y]) * sw * stride;
    const int32_t wy = ay.weight[y];
    uint8_t* out = dst + static_cast<size_t>(y) * dw * 3;
    for (int32_t x = 0; x < dw; ++x) {
      const int32_t l = ax.lo[x] * stride;
      const int32_t r = ax.hi[x] * stride;
      const int32_t wx = ax.weight[x];
      for (int32_t c = 0; c < 3; ++c) {
        const int32_t upper = top[l + c] * (kOne - wx) + top[r + c] * wx;
        const int32_t lower = bottom[l + c] * (kOne - wx) + bottom[r + c] * wx;
        out[x * 3 + c] = static_cast<uint8_t>((upper * (kOne - wy) + lower * wy + kOne * kOne / 2) >> 16);
      }
    }
  }
}

// Where each of `count` destination pixels samples its source along one axis, at pixel centres: destination pixel d
// sits at source coordinate `start + (d + 0.5) * step - 0.5`, kept inside the source's `limit` pixels.
Axis axisAt(double start, double step, int32_t limit, int32_t count) {
  Axis a{std::vector<int32_t>(count), std::vector<int32_t>(count), std::vector<int32_t>(count)};
  for (int32_t d = 0; d < count; ++d) {
    const double s = std::clamp(start + (d + 0.5) * step - 0.5, 0.0, static_cast<double>(limit - 1));
    a.lo[d] = static_cast<int32_t>(s);
    a.hi[d] = std::min(a.lo[d] + 1, limit - 1);
    a.weight[d] = static_cast<int32_t>(std::lround((s - a.lo[d]) * kOne));
  }
  return a;
}

// The frame as the PWA's canvas holds it before a look: shrunk to `cutWidth` when wider, else the frame itself.
struct Cut {
  std::vector<uint8_t> pixels;
  const uint8_t* data;
  int32_t stride;
  int32_t w;
  int32_t h;
  double scale;  // cut pixels a frame pixel
};

Cut cutOf(const uint8_t* rgba, int32_t width, int32_t height, int32_t cutWidth) {
  if (width <= cutWidth) return Cut{{}, rgba, 4, width, height, 1.0};
  Cut c{{}, nullptr, 3, cutWidth, static_cast<int32_t>(std::lround(static_cast<double>(height) * cutWidth / width)),
        static_cast<double>(cutWidth) / width};
  c.pixels.resize(static_cast<size_t>(c.w) * c.h * 3);
  resizeRgb(rgba, width, height, 4, c.pixels.data(), c.w, c.h);
  c.data = c.pixels.data();
  return c;
}

}  // namespace

/**
 * Draws the part `x, y, w, h` of an RGBA frame, in frame pixels, into the detector's square input as the PWA's canvas
 * does: the frame shrunk to `cutWidth` when wider, then that part of it letterboxed into `size`, grey where the part
 * reaches past the frame, as channel-first floats from 0 to 1.
 */
extern "C" JNIEXPORT void JNICALL Java_com_margelo_nitro_wallballvision_Letterbox_drawWindow(
    JNIEnv* env, jclass, jobject rgbaBuffer, jint width, jint height, jint cutWidth, jdouble x, jdouble y, jdouble w,
    jdouble h, jint size, jfloatArray out) {
  const auto* rgba = static_cast<const uint8_t*>(env->GetDirectBufferAddress(rgbaBuffer));
  const Cut cut = cutOf(rgba, width, height, cutWidth);
  // The part in the cut's pixels, and where it lands in the letterbox.
  const double rx = x * cut.scale, ry = y * cut.scale, rw = w * cut.scale, rh = h * cut.scale;
  const double fit = std::min(size / rw, size / rh);
  const int32_t dw = static_cast<int32_t>(std::lround(rw * fit));
  const int32_t dh = static_cast<int32_t>(std::lround(rh * fit));
  const int32_t dx = (size - dw) / 2;
  const int32_t dy = (size - dh) / 2;
  // Only the part inside the cut is drawn, at its place in the letterbox, as a canvas clips a source rectangle.
  const double sx0 = std::max(rx, 0.0), sx1 = std::min(rx + rw, static_cast<double>(cut.w));
  const double sy0 = std::max(ry, 0.0), sy1 = std::min(ry + rh, static_cast<double>(cut.h));
  const double kx = dw / rw, ky = dh / rh;
  const int32_t px0 = std::clamp(static_cast<int32_t>(std::lround(dx + (sx0 - rx) * kx)), 0, size);
  const int32_t px1 = std::clamp(static_cast<int32_t>(std::lround(dx + (sx1 - rx) * kx)), 0, size);
  const int32_t py0 = std::clamp(static_cast<int32_t>(std::lround(dy + (sy0 - ry) * ky)), 0, size);
  const int32_t py1 = std::clamp(static_cast<int32_t>(std::lround(dy + (sy1 - ry) * ky)), 0, size);

  jfloat* chw = static_cast<jfloat*>(env->GetPrimitiveArrayCritical(out, nullptr));
  const size_t plane = static_cast<size_t>(size) * size;
  std::fill(chw, chw + 3 * plane, kGrey);
  if (px1 > px0 && py1 > py0) {
    const Axis ax = axisAt(rx + (px0 - dx) / kx, 1 / kx, cut.w, px1 - px0);
    const Axis ay = axisAt(ry + (py0 - dy) / ky, 1 / ky, cut.h, py1 - py0);
    for (int32_t j = 0; j < py1 - py0; ++j) {
      const uint8_t* top = cut.data + static_cast<size_t>(ay.lo[j]) * cut.w * cut.stride;
      const uint8_t* bottom = cut.data + static_cast<size_t>(ay.hi[j]) * cut.w * cut.stride;
      const int32_t wy = ay.weight[j];
      const size_t at = static_cast<size_t>(py0 + j) * size + px0;
      for (int32_t i = 0; i < px1 - px0; ++i) {
        const int32_t l = ax.lo[i] * cut.stride;
        const int32_t r = ax.hi[i] * cut.stride;
        const int32_t wx = ax.weight[i];
        for (int32_t c = 0; c < 3; ++c) {
          const int32_t upper = top[l + c] * (kOne - wx) + top[r + c] * wx;
          const int32_t lower = bottom[l + c] * (kOne - wx) + bottom[r + c] * wx;
          chw[c * plane + at + i] = ((upper * (kOne - wy) + lower * wy + kOne * kOne / 2) >> 16) / 255.0f;
        }
      }
    }
  }
  env->ReleasePrimitiveArrayCritical(out, chw, 0);
}

/**
 * Draws an RGBA frame into the detector's square input as the PWA does: first shrunk to `cutWidth`
 * when wider, then into a `size` letterbox with grey bars, as channel-first floats from 0 to 1.
 */
extern "C" JNIEXPORT void JNICALL Java_com_margelo_nitro_wallballvision_Letterbox_draw(
    JNIEnv* env, jclass, jobject rgbaBuffer, jint width, jint height, jint cutWidth, jint size, jfloatArray out) {
  const auto* rgba = static_cast<const uint8_t*>(env->GetDirectBufferAddress(rgbaBuffer));
  std::vector<uint8_t> cut;
  const uint8_t* frame = rgba;
  int32_t stride = 4;
  int32_t w = width;
  int32_t h = height;
  if (width > cutWidth) {
    w = cutWidth;
    h = static_cast<int32_t>(std::lround(static_cast<double>(height) * cutWidth / width));
    cut.resize(static_cast<size_t>(w) * h * 3);
    resizeRgb(rgba, width, height, 4, cut.data(), w, h);
    frame = cut.data();
    stride = 3;
  }
  const double scale = std::min(static_cast<double>(size) / w, static_cast<double>(size) / h);
  const int32_t dw = static_cast<int32_t>(std::lround(w * scale));
  const int32_t dh = static_cast<int32_t>(std::lround(h * scale));
  const int32_t dx = (size - dw) / 2;
  const int32_t dy = (size - dh) / 2;
  std::vector<uint8_t> inner(static_cast<size_t>(dw) * dh * 3);
  resizeRgb(frame, w, h, stride, inner.data(), dw, dh);

  jfloat* chw = static_cast<jfloat*>(env->GetPrimitiveArrayCritical(out, nullptr));
  const size_t plane = static_cast<size_t>(size) * size;
  std::fill(chw, chw + 3 * plane, kGrey);
  for (int32_t y = 0; y < dh; ++y) {
    const uint8_t* row = &inner[static_cast<size_t>(y) * dw * 3];
    const size_t at = static_cast<size_t>(dy + y) * size + dx;
    for (int32_t x = 0; x < dw; ++x) {
      chw[at + x] = row[x * 3] / 255.0f;
      chw[plane + at + x] = row[x * 3 + 1] / 255.0f;
      chw[2 * plane + at + x] = row[x * 3 + 2] / 255.0f;
    }
  }
  env->ReleasePrimitiveArrayCritical(out, chw, 0);
}
