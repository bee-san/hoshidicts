#include "../src/blob_file.hpp"
#include "../src/hash/hash.hpp"
#include <xxh3.h>

#include <array>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>

namespace {
int failures = 0;
void check(bool value, const char* name) {
  if (!value) { ++failures; std::cerr << "FAIL: " << name << '\n'; }
}
void write(const std::filesystem::path& path, const std::string& bytes) {
  std::ofstream file(path, std::ios::binary);
  file.write(bytes.data(), bytes.size());
}
}

int main() {
  const auto root = std::filesystem::temp_directory_path() / "hoshidicts-paged-hash-test";
  std::filesystem::create_directories(root);
  const auto path = root / "hash.table";
  std::array<std::string, 3> keys;
  std::vector<uint64_t> hashes;
  for (size_t n = 0; hashes.size() < keys.size(); ++n) {
    const auto key = "collision-" + std::to_string(n);
    const auto hash = XXH3_64bits(key.data(), key.size());
    if (hash % 16 == 15) { keys[hashes.size()] = key; hashes.push_back(hash); }
  }
  hash::bloom::build_to_file(hashes, root / "bloom.filter");
  auto filter = memory::map_rd(root / "bloom.filter");
  hash::bloom bloom;
  check(bloom.load(filter.data, filter.size), "load filter");
  const uint32_t capacity = 16;
  std::string table(4 + capacity * 16, '\0');
  std::memcpy(table.data(), &capacity, 4);
  const std::array<uint64_t, 2> first{hashes[0], 123}, second{hashes[1], 456};
  std::memcpy(table.data() + 4 + 15 * 16, first.data(), 16);
  std::memcpy(table.data() + 4, second.data(), 16);
  write(path, table);

  // The four-byte header puts slots across page boundaries, even with 4 KiB
  // pages. Tiny pages exercise multiple boundaries and eviction in one slot.
  for (size_t page_bytes : {size_t{7}, size_t{16}, size_t{4096}}) {
    auto cache = std::make_shared<memory::page_cache>(page_bytes, page_bytes);
    {
      hash::linear paged, mapped;
      check(paged.load(BlobFile::open(path, cache, memory::page_kind::index)), "load paged table");
      check(mapped.load(BlobFile::map(path)), "load mapped table");
      paged.set_bloom(&bloom); mapped.set_bloom(&bloom);
      for (const auto& key : keys) check(paged(key) == mapped(key), "collision and wraparound parity");
      check(paged(keys[0]) == 123 && paged(keys[1]) == 456 && paged(keys[2]) == 0, "exact offsets and miss");
      const auto before = cache->stats(memory::page_kind::index).reads;
      check(paged("bloom-negative") == 0, "Bloom-negative miss");
      check(cache->stats(memory::page_kind::index).reads == before, "Bloom negative reads no pages");
      check(cache->resident_bytes() <= page_bytes, "scalar probes release pins");
    }
    check(cache->resident_bytes() == 0, "unload forgets hash pages");
  }
  for (const auto& bad : {std::string{}, std::string(3, '\0'), std::string(4, '\0'), table.substr(0, table.size()-1)}) {
    write(path, bad);
    hash::linear mapped, paged;
    auto cache = std::make_shared<memory::page_cache>(16, 32);
    check(!mapped.load(BlobFile::map(path)), "reject malformed mapped table");
    check(!paged.load(BlobFile::open(path, cache, memory::page_kind::index)), "reject malformed paged table");
  }
  auto full = table;
  for (size_t n = 0; n < capacity; ++n) std::memcpy(full.data() + 4 + n*16, first.data(), 16);
  write(path, full);
  hash::linear paged;
  paged.set_bloom(&bloom);
  auto cache = std::make_shared<memory::page_cache>(16, 32);
  check(paged.load(BlobFile::open(path, cache, memory::page_kind::index)), "open full table");
  bool threw = false;
  try { paged(keys[1]); } catch (const std::runtime_error&) { threw = true; }
  check(threw, "full corrupt probe chain fails instead of hanging or missing");
  write(path, table);
  hash::linear unreadable;
  unreadable.set_bloom(&bloom);
  check(unreadable.load(BlobFile::open(path, cache, memory::page_kind::index)), "open before read fault");
  std::filesystem::resize_file(path, 4);
  threw = false;
  try { unreadable(keys[0]); } catch (const std::runtime_error&) { threw = true; }
  check(threw, "read errors are not dictionary misses");
  memory::unmap(filter);
  std::filesystem::remove_all(root);
  return failures ? 1 : 0;
}
