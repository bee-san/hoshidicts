#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace mdict {
// RIPEMD-128 (Dobbertin, Bosselaers, Preneel 1996). MDX files with
// Encrypted="2" derive the key-index cipher key from it; nothing else in the
// project needs it, so this is a small standalone implementation rather than
// a crypto dependency.
std::array<uint8_t, 16> ripemd128(const uint8_t* data, size_t size);
}
