#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <map>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "../memory/memory.hpp"

// Reader for the MDict container format (.mdx dictionaries and .mdd resource
// archives), engine versions 1.x and 2.0. Layout after
// https://github.com/zhansliu/writemdict/blob/master/fileformat.md:
//
//   header        BE u32 length, UTF-16LE XML element, LE adler32
//   key section   counts, key-block index (v2: zlib, optionally XOR-ciphered),
//                 key blocks (each: LE u32 compression, BE adler32, payload)
//   record section counts, record-block index, record blocks (same framing)
//
// Every key entry is (record offset, key text); the record offset addresses the
// concatenation of all decompressed record blocks. Keys are stored sorted, and
// records in key order, so an entry's record ends where the next entry's
// begins (or at the end of its block).
//
// The reader maps the file and decodes on demand: opening reads the header
// and both indexes; key blocks and record blocks are decompressed per call,
// so callers can stream a large dictionary without holding every record.
// All const methods are safe to call concurrently.
//
// Every failure throws mdict::Error with a message that names what was
// unsupported or malformed (engine version, encoding, compression type,
// encryption mode, checksum, truncation).
namespace mdict {
class Error : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

enum class Kind : uint8_t { Mdx, Mdd };
enum class Encoding : uint8_t { Utf8, Utf16le };

struct Header {
  Kind kind = Kind::Mdx;
  // Numeric engine version (1.x or 2.0) and the raw attribute.
  double version = 0;
  std::string engine_version;
  Encoding encoding = Encoding::Utf8;
  // Bit 0: record blocks ciphered (needs a registration code; rejected).
  // Bit 1: key-block index ciphered (handled).
  int encrypted = 0;
  std::string format;  // "Html" or "Text" for MDX
  bool compact = false;
  std::string stylesheet;  // raw StyleSheet attribute (backtick substitution table)
  std::string title;
  std::string description;
  // Every attribute of the root element with XML entities decoded.
  std::map<std::string, std::string> attributes;
};

struct KeyEntry {
  uint64_t record_offset = 0;
  std::string key;  // UTF-8 whatever the file encoding
};

struct KeyBlockInfo {
  uint64_t entries = 0;
  uint64_t packed_size = 0;
  uint64_t unpacked_size = 0;
  // Offset of the block's framing within the file.
  uint64_t file_offset = 0;
  std::string first_key;
  std::string last_key;
};

struct RecordBlockInfo {
  uint64_t packed_size = 0;
  uint64_t unpacked_size = 0;
  uint64_t file_offset = 0;
  // Offset of the block's first byte in the decompressed record space.
  uint64_t unpacked_offset = 0;
};

class Reader {
 public:
  Reader() = default;
  ~Reader();
  Reader(const Reader&) = delete;
  Reader& operator=(const Reader&) = delete;

  // Maps the file and decodes the header, key-block index and record-block
  // index. Throws mdict::Error.
  void open(const std::filesystem::path& path);

  const Header& header() const { return header_; }
  uint64_t key_count() const { return key_count_; }
  const std::vector<KeyBlockInfo>& key_blocks() const { return key_blocks_; }
  const std::vector<RecordBlockInfo>& record_blocks() const { return record_blocks_; }
  // Total size of the decompressed record space.
  uint64_t record_space_size() const { return record_space_size_; }

  // Decodes key block `index` and appends its entries to `out` in file order.
  void read_key_block(size_t index, std::vector<KeyEntry>& out) const;
  // Every key entry of the file in file order.
  std::vector<KeyEntry> read_all_keys() const;

  // Index of the record block containing decompressed-space `offset`.
  size_t record_block_for(uint64_t offset) const;
  // Decompresses (and verifies) record block `index`.
  std::vector<uint8_t> read_record_block(size_t index) const;

  // The record starting at `offset` in the decompressed space. `next_offset`
  // is the following entry's record offset (or record_space_size() for the
  // last entry); the record is clipped to its block. `block` must be the
  // block returned by read_record_block(record_block_for(offset)).
  std::string_view record_in_block(const std::vector<uint8_t>& block, size_t block_index, uint64_t offset,
                                   uint64_t next_offset) const;

  // MDX record bytes -> UTF-8 text with the terminating NUL(s) removed.
  std::string record_text(std::string_view record) const;

 private:
  void parse_header();
  void parse_key_section();
  void parse_record_section();
  std::vector<uint8_t> unpack_block(uint64_t offset, uint64_t packed_size, uint64_t unpacked_size,
                                    const char* what) const;
  std::string decode_key(const uint8_t* data, size_t size) const;

  memory::mapped_file file_;
  Header header_;
  size_t num_width_ = 8;
  uint64_t key_section_offset_ = 0;
  uint64_t record_section_offset_ = 0;
  uint64_t key_count_ = 0;
  std::vector<KeyBlockInfo> key_blocks_;
  std::vector<RecordBlockInfo> record_blocks_;
  uint64_t record_space_size_ = 0;
};

// Decodes a UTF-16LE byte sequence to UTF-8, replacing unpaired surrogates
// with U+FFFD. Exposed for the MDD stylesheet sniffing in MdictSource.
std::string utf16le_to_utf8(const uint8_t* data, size_t size);

// True when the first bytes look like an MDict header (BE length followed by
// UTF-16LE "<Dictionary" or "<Library_Data"). Used by import() to dispatch.
bool looks_like_mdict(const uint8_t* data, size_t size);
}
