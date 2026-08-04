#include "hash.hpp"

#include <xxh3.h>

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <stdexcept>

#include "../memory/memory.hpp"

namespace hash {
linear::linear() : ptr_(std::make_unique<table>()) {};
linear::~linear() = default;

uint64_t linear::operator()(std::string_view key) const {
  uint64_t h = XXH3_64bits(key.data(), key.size());
  uint64_t pos = h % ptr_->capacity;
  while (true) {
    slot current{};
    std::memcpy(&current, ptr_->slots + pos * sizeof(slot), sizeof(current));
    if (current.hash == 0) {
      return 0;
    }
    if (current.hash == h) {
      return current.offset;
    }
    pos = (pos + 1) % ptr_->capacity;
  }
}

void linear::build_to_file(const std::vector<std::pair<uint64_t, uint64_t>>& hash_entries, const std::string& path) {
  ptr_->capacity = std::max<uint64_t>(hash_entries.size() * 10 / 7, 16);
  size_t file_size = sizeof(uint32_t) + ptr_->capacity * sizeof(slot);

  auto out = memory::map_rw(path, file_size);
  if (!out) {
    throw std::runtime_error("failed to create hash table");
  }
 
  std::memcpy(out.data, &ptr_->capacity, sizeof(uint32_t));
  ptr_->slots = out.data + sizeof(uint32_t);
  std::memset(ptr_->slots, 0, ptr_->capacity * sizeof(slot));
  for (const auto& he : hash_entries) {
    uint64_t h = he.first;
    uint64_t pos = h % ptr_->capacity;
    while (true) {
      slot current{};
      std::memcpy(&current, ptr_->slots + pos * sizeof(slot), sizeof(current));
      if (current.hash == 0) {
        const slot entry{.hash = h, .offset = he.second};
        std::memcpy(ptr_->slots + pos * sizeof(slot), &entry, sizeof(entry));
        break;
      }
      pos = (pos + 1) % ptr_->capacity;
    }
  }
  memory::unmap(out);
  ptr_->slots = nullptr;
  ptr_->capacity = 0;
}

void linear::load(uint8_t* ptr) {
  std::memcpy(&ptr_->capacity, ptr, sizeof(ptr_->capacity));
  ptr_->slots = ptr + sizeof(uint32_t);
}
}
