#pragma once

// Long-key scan index (`scan.idx`, optional per term dictionary).
//
// Lookup::lookup scans the input from `scan_length` code points down to one,
// running the text processors and the deinflector on every prefix, so its cost
// is linear in the scan length. A reader that wants to find a 30-character
// proverb by scanning 30 characters pays that on every hover, although almost
// no dictionary key is that long (Jitendex: 0.26% of keys are longer than 16).
//
// The importer therefore records, for every key longer than
// `long_key_min_codepoints`, the hash of its first `long_key_prefix_codepoints`
// code points and the key's length. After the ordinary scan the lookup hashes
// the processed variants of the input's first eight code points, and only when
// one of them is the prefix of some long key does it extend the scan to that
// key's length (plus room for an inflected ending). Everything else keeps the
// cost of the configured scan length.
//
// Layout (little-endian):
//   u32 magic 'HDSI'   u32 version (1)   u32 count   u16 max_key_length   u16 0
//   u64 prefix_hash[count]   (sorted ascending)
//   u16 key_length[count]    (maximum length among keys sharing the prefix)

#include <xxh3.h>

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>

namespace scan_index {

inline constexpr uint32_t magic = 0x49534448;  // "HDSI"
inline constexpr uint32_t version = 1;
inline constexpr size_t header_bytes = 16;
inline constexpr const char* file_name = "scan.idx";

// Keys at most this long are the ordinary scan's business; the index only
// knows about longer ones. 16 is the default scan length of every host.
inline constexpr size_t long_key_min_codepoints = 16;
// The prefix a long key is recognised by. Eight code points is short enough
// that an inflected ending never reaches into it for keys longer than 16, and
// long enough that ordinary text rarely shares it with a long key by chance.
inline constexpr size_t long_key_prefix_codepoints = 8;
// How far past a long key's length the extended scan looks, so that an
// inflected form (食べさせられなかった for 食べる: +7) is still covered.
inline constexpr size_t inflection_slack_codepoints = 8;

inline size_t codepoint_length(std::string_view utf8) {
  size_t n = 0;
  for (unsigned char c : utf8) {
    n += (c & 0xC0) != 0x80;
  }
  return n;
}

// Byte length of the first `codepoints` code points, or nullopt when the text
// has fewer than that.
inline std::optional<size_t> prefix_bytes(std::string_view utf8, size_t codepoints) {
  size_t seen = 0;
  for (size_t i = 0; i < utf8.size(); ++i) {
    if ((static_cast<unsigned char>(utf8[i]) & 0xC0) != 0x80) {
      if (seen == codepoints) {
        return i;
      }
      ++seen;
    }
  }
  return seen == codepoints ? std::optional<size_t>(utf8.size()) : std::nullopt;
}

inline std::optional<uint64_t> prefix_hash(std::string_view utf8) {
  const auto bytes = prefix_bytes(utf8, long_key_prefix_codepoints);
  if (!bytes) {
    return std::nullopt;
  }
  return XXH3_64bits(utf8.data(), *bytes);
}

}  // namespace scan_index
