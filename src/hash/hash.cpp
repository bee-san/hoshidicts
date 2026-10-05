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
  if (!bloom_->contains(h)) {
    return 0;
  }
  uint64_t pos = h % ptr_->capacity;
  for (uint64_t probes = 0; probes < ptr_->capacity; ++probes) {
    slot value;
    if (file_.paged()) {
      file_.copy(sizeof(uint32_t) + pos * sizeof(slot), sizeof(value), &value);
    } else {
      std::memcpy(&value, ptr_->table + pos, sizeof(value));
    }
    if (value.hash == 0) {
      return 0;
    }
    if (value.hash == h) {
      return value.offset;
    }
    if (++pos == ptr_->capacity) {
      pos = 0;
    }
  }
  throw std::runtime_error("hash.table has no empty slot in its probe chain");
}

void linear::build_to_file(const std::vector<std::pair<uint64_t, uint64_t>>& hash_entries,
                           const std::filesystem::path& path) {
  ptr_->capacity = std::max<uint64_t>(hash_entries.size() * 10 / 7, 16);
  size_t file_size = sizeof(uint32_t) + ptr_->capacity * sizeof(slot);

  auto out = memory::map_rw(path, file_size);
  if (!out) {
    throw std::runtime_error("failed to create hash table");
  }

  std::memcpy(out.data, &ptr_->capacity, sizeof(uint32_t));
  ptr_->table = reinterpret_cast<slot*>(out.data + sizeof(uint32_t));
  std::memset(ptr_->table, 0, ptr_->capacity * sizeof(slot));
  for (const auto& he : hash_entries) {
    uint64_t h = he.first;
    uint64_t pos = h % ptr_->capacity;
    while (true) {
      if (ptr_->table[pos].hash == 0) {
        ptr_->table[pos] = {.hash = h, .offset = he.second};
        break;
      }
      pos = (pos + 1) % ptr_->capacity;
    }
  }
  memory::unmap(out);
  ptr_->table = nullptr;
  ptr_->capacity = 0;
}

bool linear::load(uint8_t* ptr, size_t size) {
  if (size < sizeof(uint32_t)) return false;
  uint32_t capacity;
  std::memcpy(&capacity, ptr, sizeof(capacity));
  if (capacity == 0 || static_cast<uint64_t>(size) != sizeof(uint32_t) + uint64_t{capacity} * sizeof(slot)) {
    return false;
  }
  ptr_->capacity = capacity;
  ptr_->table = reinterpret_cast<slot*>(ptr + sizeof(uint32_t));
  return true;
}

bool linear::load(BlobFile file) {
  if (file.size() < sizeof(uint32_t)) return false;
  uint32_t capacity;
  file.copy(0, sizeof(capacity), &capacity);
  if (capacity == 0 || file.size() != sizeof(uint32_t) + uint64_t{capacity} * sizeof(slot)) return false;
  ptr_->capacity = capacity;
  ptr_->table = file.paged() ? nullptr : reinterpret_cast<slot*>(const_cast<uint8_t*>(file.mapped_data()) + sizeof(uint32_t));
  file_ = std::move(file);
  return true;
}
}
