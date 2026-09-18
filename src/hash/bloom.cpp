#include "bloom.hpp"

#include <algorithm>
#include <atomic>
#include <bit>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <vector>

#include "../memory/memory.hpp"

namespace hash {
namespace {
constexpr uint64_t num_hashes = 7;
}

bool bloom::load(const uint8_t* ptr, size_t size) {
  uint64_t num_bits = *reinterpret_cast<const uint64_t*>(ptr);
  if (size != 2 * sizeof(uint64_t) + num_bits / 8) {
    return false;
  }
  num_hashes_ = *reinterpret_cast<const uint64_t*>(ptr + sizeof(uint64_t));
  mask_ = num_bits - 1;
  bits_ = reinterpret_cast<const uint64_t*>(ptr + 2 * sizeof(uint64_t));
  return true;
}

void bloom::build_to_file(const std::vector<uint64_t>& hashes, const std::filesystem::path& path, size_t threads,
                          const spawn_fn& spawn) {
  uint64_t num_bits = std::bit_ceil(std::max<uint64_t>(hashes.size() * 10, 64));
  uint64_t mask = num_bits - 1;

  size_t bits_size = num_bits / 8;
  auto out = memory::map_rw(path, 2 * sizeof(uint64_t) + bits_size);
  if (!out) {
    throw std::runtime_error("failed to create bloom filter");
  }

  std::memcpy(out.data, &num_bits, sizeof(uint64_t));
  std::memcpy(out.data + sizeof(uint64_t), &num_hashes, sizeof(uint64_t));
  auto* bits = reinterpret_cast<uint64_t*>(out.data + 2 * sizeof(uint64_t));
  std::memset(bits, 0, bits_size);

  const auto set_bits = [bits, mask](const uint64_t* begin, const uint64_t* end, bool shared) {
    for (const uint64_t* it = begin; it != end; ++it) {
      const uint64_t h = *it;
      auto h1 = static_cast<uint32_t>(h);
      auto h2 = static_cast<uint32_t>(h >> 32);
      for (uint64_t k = 0; k < num_hashes; k++) {
        uint64_t bit = (h1 + k * h2) & mask;
        if (shared) {
          // Setting bits is order-independent, so threads share the array;
          // the atomic OR only keeps concurrent writers from losing bits.
          std::atomic_ref<uint64_t>(bits[bit >> 6]).fetch_or(1ULL << (bit & 63), std::memory_order_relaxed);
        } else {
          bits[bit >> 6] |= 1ULL << (bit & 63);
        }
      }
    }
  };

  // Chunks of at least 64K hashes; the caller's thread takes the first one.
  const size_t chunks = spawn ? std::max<size_t>(1, std::min(threads, hashes.size() / 65536 + 1)) : 1;
  if (chunks == 1) {
    set_bits(hashes.data(), hashes.data() + hashes.size(), false);
  } else {
    const size_t chunk = (hashes.size() + chunks - 1) / chunks;
    std::vector<std::future<void>> futures;
    for (size_t t = 1; t < chunks; t++) {
      const size_t begin = std::min(t * chunk, hashes.size());
      const size_t end = std::min(begin + chunk, hashes.size());
      if (begin >= end) break;
      futures.push_back(spawn([&set_bits, &hashes, begin, end]() {
        set_bits(hashes.data() + begin, hashes.data() + end, true);
      }));
    }
    set_bits(hashes.data(), hashes.data() + std::min(chunk, hashes.size()), true);
    for (auto& future : futures) future.get();
  }

  memory::unmap(out);
}
}
