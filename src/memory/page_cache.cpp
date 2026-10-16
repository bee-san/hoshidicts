#include "page_cache.hpp"

#include <algorithm>
#include <atomic>
#include <cstring>
#include <stdexcept>

namespace memory {
page_cache::page_cache(size_t page_bytes, size_t budget_bytes)
    : page_bytes_(std::max<size_t>(page_bytes, 1)), budget_bytes_(budget_bytes) {}

uint64_t page_cache::new_file_id() {
  static std::atomic<uint64_t> next{1};
  return next.fetch_add(1, std::memory_order_relaxed);
}

size_t page_cache::key_hash::operator()(const key& k) const noexcept {
  // splitmix64 finaliser over the pair; file ids and page indexes are both
  // small and dense.
  uint64_t x = k.file * 0x9E3779B97F4A7C15ULL ^ k.index;
  x ^= x >> 30;
  x *= 0xBF58476D1CE4E5B9ULL;
  x ^= x >> 27;
  x *= 0x94D049BB133111EBULL;
  x ^= x >> 31;
  return static_cast<size_t>(x);
}

std::shared_ptr<const page> page_cache::get(uint64_t file_id, const file_reader& file, uint64_t index, page_kind kind) {
  const key id{.file = file_id, .index = index};
  std::lock_guard lock(mutex_);
  auto& activity = stats_[static_cast<size_t>(kind)];
  if (const auto it = index_.find(id); it != index_.end()) {
    ++activity.hits;
    lru_.splice(lru_.begin(), lru_, it->second);
    return it->second->held;
  }

  const uint64_t offset = index * page_bytes_;
  if (offset >= file.size()) {
    throw std::runtime_error("page beyond the end of the file");
  }
  auto fresh = std::make_shared<page>();
  const uint64_t remaining = file.size() - offset;
  fresh->size = static_cast<size_t>(std::min<uint64_t>(page_bytes_, remaining));
  const auto readable = static_cast<size_t>(std::min<uint64_t>(fresh->size + lookahead_bytes, remaining));
  fresh->data = std::make_unique_for_overwrite<uint8_t[]>(fresh->size + lookahead_bytes);
  if (!file.read(fresh->data.get(), readable, offset)) {
    throw std::runtime_error("could not read a dictionary page");
  }
  ++activity.reads;
  activity.read_bytes += readable;
  std::memset(fresh->data.get() + readable, 0, fresh->size + lookahead_bytes - readable);

  lru_.push_front(entry{.id = id, .held = fresh, .kind = kind});
  index_.emplace(id, lru_.begin());
  resident_ += fresh->size;
  activity.bytes += fresh->size;
  trim_locked();
  return fresh;
}

void page_cache::forget(uint64_t file_id) {
  std::lock_guard lock(mutex_);
  for (auto it = lru_.begin(); it != lru_.end();) {
    if (it->id.file == file_id) {
      resident_ -= it->held->size;
      stats_[static_cast<size_t>(it->kind)].bytes -= it->held->size;
      index_.erase(it->id);
      it = lru_.erase(it);
    } else {
      ++it;
    }
  }
}

void page_cache::trim() {
  std::lock_guard lock(mutex_);
  trim_locked();
}

void page_cache::trim_locked() {
  for (auto it = lru_.end(); resident_ > budget_bytes_ && it != lru_.begin();) {
    --it;
    // A page someone still holds keeps its memory whether or not the cache
    // drops it, and dropping it would only read it again on the next use.
    if (it->held.use_count() > 1) {
      continue;
    }
    resident_ -= it->held->size;
    stats_[static_cast<size_t>(it->kind)].bytes -= it->held->size;
    index_.erase(it->id);
    it = lru_.erase(it);
  }
}

size_t page_cache::resident_bytes() const {
  std::lock_guard lock(mutex_);
  return resident_;
}

cache_stats page_cache::stats(page_kind kind) const {
  std::lock_guard lock(mutex_);
  return stats_[static_cast<size_t>(kind)];
}
}
