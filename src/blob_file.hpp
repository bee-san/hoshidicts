#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <memory>
#include <string_view>
#include <vector>

#include "memory/memory.hpp"
#include "memory/page_cache.hpp"

struct BlobPins;

// A dictionary file: mapped, or read on demand through a shared page cache.
class BlobFile {
 public:
  BlobFile() = default;
  ~BlobFile();

  BlobFile(const BlobFile&) = delete;
  BlobFile& operator=(const BlobFile&) = delete;
  BlobFile(BlobFile&& other) noexcept;
  BlobFile& operator=(BlobFile&& other) noexcept;

  static BlobFile map(const std::filesystem::path& path);
  static BlobFile open(const std::filesystem::path& path, std::shared_ptr<memory::page_cache> cache,
                       memory::page_kind kind = memory::page_kind::entries);

  explicit operator bool() const { return size_ != 0; }
  bool paged() const { return cache_ != nullptr; }
  uint64_t size() const { return size_; }
  // The mapping of a file that is not paged.
  const uint8_t* mapped_data() const { return mapping_.data; }

  // `length` bytes at `offset`, valid while `pins` lives.
  const uint8_t* range(uint64_t offset, size_t length, BlobPins& pins) const {
    return paged() ? paged_range(offset, length, pins) : mapping_.data + offset;
  }
  // Scalar index probes copy their slot and release each page immediately;
  // they need neither the query's pins nor a spill allocation at a boundary.
  void copy(uint64_t offset, size_t length, void* out) const;

 private:
  friend class BlobCursor;
  const uint8_t* paged_range(uint64_t offset, size_t length, BlobPins& pins) const;
  void release();

  memory::mapped_file mapping_;
  memory::file_reader reader_;
  std::shared_ptr<memory::page_cache> cache_;
  uint64_t file_id_ = 0;
  uint64_t size_ = 0;
  memory::page_kind kind_ = memory::page_kind::entries;
};

// Keeps every byte range a query read out of paged blob files valid until the
// query has copied what it returns: the pages it read, and copies of the
// ranges that crossed a page boundary. Releasing them lets the cache shrink
// back to its budget. Queries of mapped files never pin anything, and most
// queries of paged ones hit nothing, so the holder is allocated on first use.
struct BlobPins {
  struct Held {
    Held() = default;
    ~Held();
    Held(const Held&) = delete;
    Held& operator=(const Held&) = delete;

    std::vector<std::shared_ptr<const memory::page>> pages;
    std::vector<std::unique_ptr<uint8_t[]>> spills;
    memory::page_cache* cache = nullptr;
  };

  Held& get() {
    if (!held) {
      held = std::make_unique<Held>();
    }
    return *held;
  }

  std::unique_ptr<Held> held;
};

// Reads a record of a paged blob file field by field from an offset on. The
// window is the current page: a read inside it is a bounds check and a pointer
// bump, and one that leaves it pins the next page, or a copy when the range
// crosses into it. Every range returned stays valid while `pins` lives. Throws
// std::out_of_range for a range past the end of the file and
// std::runtime_error when a page cannot be read.
class BlobCursor {
 public:
  // Starts with an empty window at `offset`; the first read pins its page.
  BlobCursor(const BlobFile& file, uint64_t offset, BlobPins& pins)
      : file_(file), pins_(pins), end_offset_(offset) {
    if (offset > file.size_) [[unlikely]] {
      past_end();
    }
  }

  const uint8_t* bytes(size_t length) {
    if (static_cast<size_t>(end_ - pos_) >= length) [[likely]] {
      const uint8_t* at = pos_;
      pos_ += length;
      return at;
    }
    return bytes_slow(length);
  }

  std::string_view str(size_t length) { return {reinterpret_cast<const char*>(bytes(length)), length}; }

  void skip(size_t length) {
    if (static_cast<size_t>(end_ - pos_) >= length) [[likely]] {
      pos_ += length;
      return;
    }
    skip_slow(length);
  }

 private:
  [[noreturn]] static void past_end();
  uint64_t offset() const { return end_offset_ - static_cast<uint64_t>(end_ - pos_); }
  void require(uint64_t offset, size_t length) const;
  const memory::page& pin(uint64_t index);
  const uint8_t* bytes_slow(size_t length);
  void skip_slow(size_t length);

  const BlobFile& file_;
  BlobPins& pins_;
  const uint8_t* pos_ = nullptr;
  const uint8_t* end_ = nullptr;
  // File offset of end_.
  uint64_t end_offset_ = 0;
};

// Reads a mapped blob file with no bounds checks, exactly as the readers did
// before paging existed: a record read is a pointer bump per field.
class MappedCursor {
 public:
  explicit MappedCursor(const uint8_t* at) : pos_(at) {}

  const uint8_t* bytes(size_t length) {
    const uint8_t* at = pos_;
    pos_ += length;
    return at;
  }

  std::string_view str(size_t length) { return {reinterpret_cast<const char*>(bytes(length)), length}; }

  void skip(size_t length) { pos_ += length; }

 private:
  const uint8_t* pos_;
};

template <typename T, typename Cursor>
T read_value(Cursor& cursor) {
  T out;
  std::memcpy(&out, cursor.bytes(sizeof(T)), sizeof(T));
  return out;
}

// Calls `visit` with a function that opens a cursor at an offset of `file`, so
// that one reader body compiles to the unchecked pointer walk for a mapped
// file and to BlobCursor, pinning into `pins`, for a paged one.
template <typename Visit>
void visit_blobs(const BlobFile& file, BlobPins& pins, Visit&& visit) {
  if (file.paged()) {
    visit([&file, &pins](uint64_t offset) { return BlobCursor(file, offset, pins); });
  } else {
    const uint8_t* base = file.mapped_data();
    visit([base](uint64_t offset) { return MappedCursor(base + offset); });
  }
}
