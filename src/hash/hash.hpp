#pragma once
#include <cstdint>
#include <filesystem>
#include <memory>
#include <vector>

#include "bloom.hpp"
#include "../blob_file.hpp"

namespace hash {
class linear {
 public:
  linear();
  ~linear();
  uint64_t operator()(std::string_view key) const;

  void build_to_file(const std::vector<std::pair<uint64_t, uint64_t>>& hash_entries, const std::filesystem::path& path);
  bool load(uint8_t* ptr, size_t size);
  bool load(BlobFile file);
  bool paged() const { return file_.paged(); }
  void set_bloom(const bloom* b) { bloom_ = b; }

 private:
  struct slot {
    uint64_t hash;
    uint64_t offset;
  };

  struct table {
    uint32_t capacity = 0;
    const uint8_t* data = nullptr;
  };
  std::unique_ptr<table> ptr_;
  const bloom* bloom_ = nullptr;
  BlobFile file_;
};
}
