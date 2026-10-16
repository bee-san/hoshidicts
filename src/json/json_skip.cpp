#include "json_skip.hpp"

#include <bit>
#include <cstdint>
#include <cstring>

// The portable classifier is used where neither wasm simd128 nor SSE2 is
// available; HOSHIDICTS_JSON_SKIP_SCALAR forces it (its test does).
#if defined(HOSHIDICTS_JSON_SKIP_SCALAR) || !(defined(__wasm_simd128__) || defined(__SSE2__))
#define HOSHIDICTS_JSON_SKIP_USE_SCALAR 1
#elif defined(__wasm_simd128__)
#include <wasm_simd128.h>
#else
#include <emmintrin.h>
#endif

namespace hoshidicts {
namespace {

struct Masks {
  uint64_t quote;
  uint64_t backslash;
  uint64_t open;
  uint64_t close;
};

#if defined(HOSHIDICTS_JSON_SKIP_USE_SCALAR)
inline Masks classify64(const char* p, char open, char close) noexcept {
  Masks m{};
  for (int i = 0; i < 64; ++i) {
    const uint64_t bit = uint64_t{1} << i;
    const char c = p[i];
    if (c == '"') m.quote |= bit;
    else if (c == '\\') m.backslash |= bit;
    else if (c == open) m.open |= bit;
    else if (c == close) m.close |= bit;
  }
  return m;
}
#elif defined(__wasm_simd128__)
inline uint64_t eq_bits16(v128_t v, char c) noexcept {
  return static_cast<uint64_t>(static_cast<uint16_t>(wasm_i8x16_bitmask(wasm_i8x16_eq(v, wasm_i8x16_splat(c)))));
}
inline Masks classify64(const char* p, char open, char close) noexcept {
  Masks m{};
  for (int i = 0; i < 4; ++i) {
    const v128_t v = wasm_v128_load(p + 16 * i);
    const int shift = 16 * i;
    m.quote |= eq_bits16(v, '"') << shift;
    m.backslash |= eq_bits16(v, '\\') << shift;
    m.open |= eq_bits16(v, open) << shift;
    m.close |= eq_bits16(v, close) << shift;
  }
  return m;
}
#else
inline uint64_t eq_bits16(__m128i v, char c) noexcept {
  return static_cast<uint64_t>(static_cast<uint16_t>(_mm_movemask_epi8(_mm_cmpeq_epi8(v, _mm_set1_epi8(c)))));
}
inline Masks classify64(const char* p, char open, char close) noexcept {
  Masks m{};
  for (int i = 0; i < 4; ++i) {
    const __m128i v = _mm_loadu_si128(reinterpret_cast<const __m128i*>(p + 16 * i));
    const int shift = 16 * i;
    m.quote |= eq_bits16(v, '"') << shift;
    m.backslash |= eq_bits16(v, '\\') << shift;
    m.open |= eq_bits16(v, open) << shift;
    m.close |= eq_bits16(v, close) << shift;
  }
  return m;
}
#endif

// Positions escaped by a preceding odd-length run of backslashes (after
// simdjson's json_escape_scanner). `next_escaped` carries whether a run at the
// end of this block escapes the first byte of the next one.
inline uint64_t find_escaped(uint64_t backslash, uint64_t& next_escaped) noexcept {
  const uint64_t prev_escaped = next_escaped;
  if (backslash == 0) {
    next_escaped = 0;
    return prev_escaped;
  }
  backslash &= ~prev_escaped;
  const uint64_t follows_escape = (backslash << 1) | prev_escaped;
  constexpr uint64_t even_bits = 0x5555555555555555ULL;
  const uint64_t odd_sequence_starts = backslash & ~even_bits & ~follows_escape;
  uint64_t sequences_starting_on_even_bits = 0;
  next_escaped = __builtin_add_overflow(odd_sequence_starts, backslash, &sequences_starting_on_even_bits) ? 1 : 0;
  const uint64_t invert_mask = sequences_starting_on_even_bits << 1;
  return (even_bits ^ invert_mask) & follows_escape;
}

inline uint64_t prefix_xor(uint64_t x) noexcept {
  x ^= x << 1;
  x ^= x << 2;
  x ^= x << 4;
  x ^= x << 8;
  x ^= x << 16;
  x ^= x << 32;
  return x;
}

}  // namespace

const char* skip_json_container(const char* begin, const char* end) noexcept {
  const char open = *begin;
  const char close = open == '[' ? ']' : '}';
  const char* p = begin + 1;
  int64_t depth = 1;
  uint64_t next_escaped = 0;
  uint64_t in_string = 0;  // all ones while inside a string at a block boundary

  while (end - p >= 64) {
    const Masks m = classify64(p, open, close);
    const uint64_t escaped = find_escaped(m.backslash, next_escaped);
    const uint64_t quotes = m.quote & ~escaped;
    // Bits set from each opening quote (inclusive) to its closing quote (exclusive).
    const uint64_t inside = prefix_xor(quotes) ^ in_string;
    in_string = static_cast<uint64_t>(static_cast<int64_t>(inside) >> 63);
    const uint64_t open = m.open & ~inside;
    const uint64_t close = m.close & ~inside;
    if (depth - std::popcount(close) <= 0) {
      // The matching bracket may be in this block: walk the structural bits in order.
      uint64_t structural = open | close;
      while (structural != 0) {
        const int i = std::countr_zero(structural);
        if ((open >> i) & 1) {
          ++depth;
        } else if (--depth == 0) {
          return p + i + 1;
        }
        structural &= structural - 1;
      }
    } else {
      depth += std::popcount(open) - std::popcount(close);
    }
    p += 64;
  }

  bool in_str = in_string != 0;
  bool escaped = (next_escaped & 1) != 0;
  for (; p < end; ++p) {
    const char c = *p;
    if (in_str) {
      if (escaped) {
        escaped = false;
      } else if (c == '\\') {
        escaped = true;
      } else if (c == '"') {
        in_str = false;
      }
    } else if (c == '"') {
      in_str = true;
    } else if (c == open) {
      ++depth;
    } else if (c == close) {
      if (--depth == 0) {
        return p + 1;
      }
    }
  }
  return nullptr;
}

}  // namespace hoshidicts
