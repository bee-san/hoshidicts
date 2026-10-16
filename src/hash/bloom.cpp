#include "bloom.hpp"

#include <algorithm>
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

  // Each thread owns a range of words and scans every hash, setting only the
  // bits that fall into its range: no atomics, no per-thread copies, and each
  // thread's writes stay within a slice small enough to sit in its cache. The
  // position arithmetic is repeated per thread, but it is a few ALU operations
  // against a random write that would otherwise miss the cache.
  const uint64_t words = bits_size / sizeof(uint64_t);
  const auto set_range = [bits, mask, &hashes](uint64_t word_begin, uint64_t word_end) {
    for (uint64_t h : hashes) {
      auto h1 = static_cast<uint32_t>(h);
      auto h2 = static_cast<uint32_t>(h >> 32);
      for (uint64_t k = 0; k < num_hashes; k++) {
        uint64_t bit = (h1 + k * h2) & mask;
        uint64_t word = bit >> 6;
        if (word >= word_begin && word < word_end) {
          bits[word] |= 1ULL << (bit & 63);
        }
      }
    }
  };

  // Splitting only pays for large filters; below that the scan repeats cost
  // more than the cache misses they avoid.
  const size_t ranges = (spawn && hashes.size() >= 262144) ? std::max<size_t>(1, std::min<uint64_t>(threads, words / 4096)) : 1;
  if (ranges == 1) {
    for (uint64_t h : hashes) {
      auto h1 = static_cast<uint32_t>(h);
      auto h2 = static_cast<uint32_t>(h >> 32);
      for (uint64_t k = 0; k < num_hashes; k++) {
        uint64_t bit = (h1 + k * h2) & mask;
        bits[bit >> 6] |= 1ULL << (bit & 63);
      }
    }
  } else {
    const uint64_t per_range = (words + ranges - 1) / ranges;
    std::vector<std::future<void>> futures;
    for (size_t r = 1; r < ranges; r++) {
      const uint64_t begin = std::min<uint64_t>(r * per_range, words);
      const uint64_t end = std::min<uint64_t>(begin + per_range, words);
      if (begin >= end) break;
      futures.push_back(spawn([&set_range, begin, end]() { set_range(begin, end); }));
    }
    set_range(0, std::min<uint64_t>(per_range, words));
    for (auto& future : futures) future.get();
  }

  memory::unmap(out);
}
}
