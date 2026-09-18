#pragma once
#include <cstdint>
#include <filesystem>
#include <functional>
#include <future>
#include <vector>

namespace hash {
class bloom {
 public:
  // Runs a task on another thread and returns its future; when absent, the
  // filter is built on the calling thread alone.
  using spawn_fn = std::function<std::future<void>(std::function<void()>)>;
  // Setting bits is order-independent, so up to `threads` chunks of hashes
  // are set concurrently (with atomic ORs); the result is the same bits.
  static void build_to_file(const std::vector<uint64_t>& hashes, const std::filesystem::path& path,
                            size_t threads = 1, const spawn_fn& spawn = nullptr);
  bool load(const uint8_t* ptr, size_t size);

  bool contains(uint64_t h) const {
    auto h1 = static_cast<uint32_t>(h);
    auto h2 = static_cast<uint32_t>(h >> 32);
    for (uint64_t k = 0; k < num_hashes_; k++) {
      uint64_t bit = (h1 + k * h2) & mask_;
      if (!(bits_[bit >> 6] & (1ULL << (bit & 63)))) {
        return false;
      }
    }
    return true;
  }

 private:
  uint64_t mask_ = 0;
  uint64_t num_hashes_ = 0;
  const uint64_t* bits_ = nullptr;
};
}
