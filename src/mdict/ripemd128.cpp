#include "ripemd128.hpp"

#include <cstring>

namespace mdict {
namespace {
constexpr std::array<uint8_t, 64> left_index = {0, 1, 2,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13, 14, 15,
                                                7, 4, 13, 1,  10, 6,  15, 3,  12, 0,  9,  5,  2,  14, 11, 8,
                                                3, 10, 14, 4, 9,  15, 8,  1,  2,  7,  0,  6,  13, 11, 5,  12,
                                                1, 9, 11, 10, 0,  8,  12, 4,  13, 3,  7,  15, 14, 5,  6,  2};
constexpr std::array<uint8_t, 64> right_index = {5,  14, 7, 0, 9, 2,  11, 4,  13, 6,  15, 8,  1,  10, 3,  12,
                                                 6,  11, 3, 7, 0, 13, 5,  10, 14, 15, 8,  12, 4,  9,  1,  2,
                                                 15, 5,  1, 3, 7, 14, 6,  9,  11, 8,  12, 2,  10, 0,  4,  13,
                                                 8,  6,  4, 1, 3, 11, 15, 0,  5,  12, 2,  13, 9,  7,  10, 14};
constexpr std::array<uint8_t, 64> left_shift = {11, 14, 15, 12, 5,  8,  7,  9,  11, 13, 14, 15, 6,  7,  9,  8,
                                                7,  6,  8,  13, 11, 9,  7,  15, 7,  12, 15, 9,  11, 7,  13, 12,
                                                11, 13, 6,  7,  14, 9,  13, 15, 14, 8,  13, 6,  5,  12, 7,  5,
                                                11, 12, 14, 15, 14, 15, 9,  8,  9,  14, 5,  6,  8,  6,  5,  12};
constexpr std::array<uint8_t, 64> right_shift = {8,  9,  9,  11, 13, 15, 15, 5,  7,  7,  8,  11, 14, 14, 12, 6,
                                                 9,  13, 15, 7,  12, 8,  9,  11, 7,  7,  12, 7,  6,  15, 13, 11,
                                                 9,  7,  15, 11, 8,  6,  6,  14, 12, 13, 5,  14, 13, 13, 7,  5,
                                                 15, 5,  8,  11, 14, 14, 6,  14, 6,  9,  12, 9,  12, 5,  15, 8};
constexpr std::array<uint32_t, 4> left_k = {0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc};
constexpr std::array<uint32_t, 4> right_k = {0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x00000000};

uint32_t rol(uint32_t x, unsigned n) { return (x << n) | (x >> (32 - n)); }

uint32_t f(unsigned round, uint32_t x, uint32_t y, uint32_t z) {
  switch (round) {
    case 0:
      return x ^ y ^ z;
    case 1:
      return (x & y) | (~x & z);
    case 2:
      return (x | ~y) ^ z;
    default:
      return (x & z) | (y & ~z);
  }
}

void compress(std::array<uint32_t, 4>& h, const uint8_t* block) {
  std::array<uint32_t, 16> x{};
  for (size_t i = 0; i < 16; ++i) {
    x[i] = uint32_t{block[4 * i]} | (uint32_t{block[4 * i + 1]} << 8) | (uint32_t{block[4 * i + 2]} << 16) |
           (uint32_t{block[4 * i + 3]} << 24);
  }
  uint32_t al = h[0], bl = h[1], cl = h[2], dl = h[3];
  uint32_t ar = h[0], br = h[1], cr = h[2], dr = h[3];
  for (unsigned j = 0; j < 64; ++j) {
    const unsigned round = j / 16;
    uint32_t t = rol(al + f(round, bl, cl, dl) + x[left_index[j]] + left_k[round], left_shift[j]);
    al = dl;
    dl = cl;
    cl = bl;
    bl = t;
    t = rol(ar + f(3 - round, br, cr, dr) + x[right_index[j]] + right_k[round], right_shift[j]);
    ar = dr;
    dr = cr;
    cr = br;
    br = t;
  }
  const uint32_t t = h[1] + cl + dr;
  h[1] = h[2] + dl + ar;
  h[2] = h[3] + al + br;
  h[3] = h[0] + bl + cr;
  h[0] = t;
}
}

std::array<uint8_t, 16> ripemd128(const uint8_t* data, size_t size) {
  std::array<uint32_t, 4> h = {0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476};
  size_t offset = 0;
  while (size - offset >= 64) {
    compress(h, data + offset);
    offset += 64;
  }

  std::array<uint8_t, 128> tail{};
  const size_t rest = size - offset;
  std::memcpy(tail.data(), data + offset, rest);
  tail[rest] = 0x80;
  const size_t padded = rest < 56 ? 64 : 128;
  const uint64_t bits = static_cast<uint64_t>(size) * 8;
  for (size_t i = 0; i < 8; ++i) {
    tail[padded - 8 + i] = static_cast<uint8_t>(bits >> (8 * i));
  }
  compress(h, tail.data());
  if (padded == 128) {
    compress(h, tail.data() + 64);
  }

  std::array<uint8_t, 16> digest{};
  for (size_t i = 0; i < 4; ++i) {
    for (size_t b = 0; b < 4; ++b) {
      digest[4 * i + b] = static_cast<uint8_t>(h[i] >> (8 * b));
    }
  }
  return digest;
}
}
