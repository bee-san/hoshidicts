#pragma once

#include <cstddef>
#include <cstdint>
#include <list>
#include <memory>
#include <mutex>
#include <unordered_map>

#include "memory.hpp"

namespace memory {
struct page {
  // `size` bytes of the file, followed by page_cache::lookahead_bytes more:
  // the bytes that follow the page in the file, zeros past its end.
  std::unique_ptr<uint8_t[]> data;
  size_t size = 0;
};

// Fixed-size pages of files read through file_reader, shared by every file
// that reads through the same cache. Once the cached pages exceed the budget
// the least recently used ones that nobody holds are dropped. A page handed
// out stays valid for as long as its holder keeps it, even after the cache has
// dropped it, so a caller can keep views into every page it read until it has
// copied its results out; while it does, the cache can exceed its budget.
// Safe to use from several threads.
class page_cache {
 public:
  // The dictionary readers hand views of the file to glaze, which reads a
  // value as if its buffer were null-terminated: it looks at the byte after a
  // number or an object. In a mapped file that is the next record's byte, so a
  // page (and a copy of a range that crosses pages) carries the bytes that
  // follow it too, and a view reads the same either way.
  static constexpr size_t lookahead_bytes = 16;

  page_cache(size_t page_bytes, size_t budget_bytes);

  page_cache(const page_cache&) = delete;
  page_cache& operator=(const page_cache&) = delete;

  size_t page_bytes() const { return page_bytes_; }

  // A key for one file's pages that no other file has had.
  static uint64_t new_file_id();

  // Page `index` of `file`, read on a miss. Throws std::runtime_error when the
  // read fails.
  std::shared_ptr<const page> get(uint64_t file_id, const file_reader& file, uint64_t index);

  // Drops the pages of a file that is going away.
  void forget(uint64_t file_id);

  // Drops pages nobody holds until the cache is within its budget again.
  void trim();

  // Bytes of the pages the cache holds.
  size_t resident_bytes() const;

 private:
  struct key {
    uint64_t file;
    uint64_t index;
    bool operator==(const key&) const = default;
  };
  struct key_hash {
    size_t operator()(const key& k) const noexcept;
  };
  struct entry {
    key id;
    std::shared_ptr<const page> held;
  };

  void trim_locked();

  const size_t page_bytes_;
  const size_t budget_bytes_;
  mutable std::mutex mutex_;
  // Most recently used first.
  std::list<entry> lru_;
  std::unordered_map<key, std::list<entry>::iterator, key_hash> index_;
  size_t resident_ = 0;
};
}
