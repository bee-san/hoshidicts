#include "mdict_reader.hpp"

#include <libdeflate.h>
#include <lzokay.hpp>

#include <algorithm>
#include <array>
#include <cctype>
#include <charconv>
#include <cstdlib>
#include <cstring>
#include <format>

#include "ripemd128.hpp"

namespace mdict {
namespace {
// A single block, key index or record block, is never anywhere near this in
// practice (MdxBuilder writes blocks of a few hundred KiB); the cap keeps a
// corrupt size field from turning into a giant allocation.
constexpr uint64_t max_block_size = 256ULL * 1024 * 1024;
constexpr uint64_t max_header_size = 16ULL * 1024 * 1024;

uint32_t be32(const uint8_t* p) {
  return (uint32_t{p[0]} << 24) | (uint32_t{p[1]} << 16) | (uint32_t{p[2]} << 8) | uint32_t{p[3]};
}
uint32_t le32(const uint8_t* p) {
  return uint32_t{p[0]} | (uint32_t{p[1]} << 8) | (uint32_t{p[2]} << 16) | (uint32_t{p[3]} << 24);
}
uint64_t be64(const uint8_t* p) { return (uint64_t{be32(p)} << 32) | be32(p + 4); }

uint32_t adler32(const uint8_t* data, size_t size) { return libdeflate_adler32(1, data, size); }

std::string lower(std::string_view s) {
  std::string out(s);
  for (auto& c : out) {
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  }
  return out;
}

void append_utf8(std::string& out, uint32_t cp) {
  if (cp < 0x80) {
    out += static_cast<char>(cp);
  } else if (cp < 0x800) {
    out += static_cast<char>(0xc0 | (cp >> 6));
    out += static_cast<char>(0x80 | (cp & 0x3f));
  } else if (cp < 0x10000) {
    out += static_cast<char>(0xe0 | (cp >> 12));
    out += static_cast<char>(0x80 | ((cp >> 6) & 0x3f));
    out += static_cast<char>(0x80 | (cp & 0x3f));
  } else {
    out += static_cast<char>(0xf0 | (cp >> 18));
    out += static_cast<char>(0x80 | ((cp >> 12) & 0x3f));
    out += static_cast<char>(0x80 | ((cp >> 6) & 0x3f));
    out += static_cast<char>(0x80 | (cp & 0x3f));
  }
}

// XML character and entity references in header attribute values.
std::string unescape_xml(std::string_view s) {
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size();) {
    if (s[i] != '&') {
      out += s[i++];
      continue;
    }
    const size_t end = s.find(';', i);
    if (end == std::string_view::npos || end - i > 10) {
      out += s[i++];
      continue;
    }
    const std::string_view name = s.substr(i + 1, end - i - 1);
    if (name == "lt") {
      out += '<';
    } else if (name == "gt") {
      out += '>';
    } else if (name == "amp") {
      out += '&';
    } else if (name == "quot") {
      out += '"';
    } else if (name == "apos") {
      out += '\'';
    } else if (name.size() > 1 && name[0] == '#') {
      const bool hex = name[1] == 'x' || name[1] == 'X';
      const std::string_view digits = name.substr(hex ? 2 : 1);
      uint32_t cp = 0;
      auto [ptr, ec] = std::from_chars(digits.data(), digits.data() + digits.size(), cp, hex ? 16 : 10);
      if (ec != std::errc{} || ptr != digits.data() + digits.size() || cp > 0x10ffff) {
        out += s[i++];
        continue;
      }
      append_utf8(out, cp);
    } else {
      out += s[i++];
      continue;
    }
    i = end + 1;
  }
  return out;
}

// Parses `<Name attr="value" attr2='value2' ... />`. Returns the element name.
std::string parse_element(std::string_view xml, std::map<std::string, std::string>& attributes) {
  size_t pos = xml.find('<');
  if (pos == std::string_view::npos) {
    throw Error("not an MDict file: header is not an XML element");
  }
  pos++;
  const size_t name_end = xml.find_first_of(" \t\r\n/>", pos);
  if (name_end == std::string_view::npos) {
    throw Error("not an MDict file: unterminated header element");
  }
  std::string name(xml.substr(pos, name_end - pos));
  pos = name_end;
  while (pos < xml.size()) {
    pos = xml.find_first_not_of(" \t\r\n", pos);
    if (pos == std::string_view::npos || xml[pos] == '/' || xml[pos] == '>') {
      break;
    }
    const size_t eq = xml.find('=', pos);
    if (eq == std::string_view::npos) {
      break;
    }
    std::string attr(xml.substr(pos, eq - pos));
    while (!attr.empty() && std::isspace(static_cast<unsigned char>(attr.back()))) {
      attr.pop_back();
    }
    size_t value_start = xml.find_first_not_of(" \t\r\n", eq + 1);
    if (value_start == std::string_view::npos || (xml[value_start] != '"' && xml[value_start] != '\'')) {
      throw Error(std::format("malformed MDict header: attribute {} has no quoted value", attr));
    }
    const char quote = xml[value_start];
    const size_t value_end = xml.find(quote, value_start + 1);
    if (value_end == std::string_view::npos) {
      throw Error(std::format("malformed MDict header: attribute {} is not closed", attr));
    }
    attributes[attr] = unescape_xml(xml.substr(value_start + 1, value_end - value_start - 1));
    pos = value_end + 1;
  }
  return name;
}

// The key-block index cipher of Encrypted="2": key = RIPEMD-128(adler32 bytes
// || 0x3695 LE), then a byte-wise nibble swap XOR chain.
void decrypt_key_index(std::vector<uint8_t>& block) {
  std::array<uint8_t, 8> seed{};
  std::memcpy(seed.data(), block.data() + 4, 4);
  seed[4] = 0x95;
  seed[5] = 0x36;
  const std::array<uint8_t, 16> key = ripemd128(seed.data(), seed.size());
  uint8_t previous = 0x36;
  for (size_t i = 8; i < block.size(); ++i) {
    const uint8_t b = block[i];
    uint8_t t = static_cast<uint8_t>((b >> 4) | (b << 4));
    t = static_cast<uint8_t>(t ^ previous ^ static_cast<uint8_t>((i - 8) & 0xff) ^ key[(i - 8) % key.size()]);
    previous = b;
    block[i] = t;
  }
}

// Inflates/copies the payload of a framed block into exactly `unpacked_size`
// bytes and verifies the stored Adler-32.
std::vector<uint8_t> decode_framed(const std::vector<uint8_t>& framed, uint64_t unpacked_size, const char* what) {
  if (framed.size() < 8) {
    throw Error(std::format("truncated {}: {} bytes, framing needs 8", what, framed.size()));
  }
  if (unpacked_size > max_block_size) {
    throw Error(std::format("{} claims {} bytes, over the {} MiB limit", what, unpacked_size,
                            max_block_size / (1024 * 1024)));
  }
  const uint32_t compression = le32(framed.data());
  const uint32_t expected = be32(framed.data() + 4);
  const uint8_t* payload = framed.data() + 8;
  const size_t payload_size = framed.size() - 8;

  std::vector<uint8_t> out(static_cast<size_t>(unpacked_size));
  if (compression == 0) {
    if (payload_size != unpacked_size) {
      throw Error(std::format("{}: stored size {} does not match declared size {}", what, payload_size,
                              unpacked_size));
    }
    std::memcpy(out.data(), payload, payload_size);
  } else if (compression == 1) {
    size_t produced = 0;
    const auto result = lzokay::decompress(payload, payload_size, out.data(), out.size(), produced);
    if (result != lzokay::EResult::Success || produced != unpacked_size) {
      throw Error(std::format("{}: LZO data is corrupt or does not match declared size {}", what, unpacked_size));
    }
  } else if (compression == 2) {
    struct Decompressor {
      libdeflate_decompressor* handle = libdeflate_alloc_decompressor();
      ~Decompressor() { libdeflate_free_decompressor(handle); }
    };
    thread_local Decompressor decompressor;
    if (!decompressor.handle) {
      throw Error("out of memory allocating a zlib decompressor");
    }
    size_t produced = 0;
    const auto result = libdeflate_zlib_decompress(decompressor.handle, payload, payload_size, out.data(),
                                                   out.size(), &produced);
    if (result != LIBDEFLATE_SUCCESS || produced != unpacked_size) {
      throw Error(std::format("{}: zlib data is corrupt or does not match declared size {}", what, unpacked_size));
    }
  } else {
    throw Error(std::format("unsupported compression type {} in {}", compression, what));
  }

  if (adler32(out.data(), out.size()) != expected) {
    throw Error(std::format("{}: Adler-32 checksum mismatch", what));
  }
  return out;
}
}

std::string utf16le_to_utf8(const uint8_t* data, size_t size) {
  std::string out;
  out.reserve(size);
  const size_t units = size / 2;
  for (size_t i = 0; i < units; ++i) {
    uint32_t cp = uint32_t{data[2 * i]} | (uint32_t{data[2 * i + 1]} << 8);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      if (i + 1 < units) {
        const uint32_t low = uint32_t{data[2 * i + 2]} | (uint32_t{data[2 * i + 3]} << 8);
        if (low >= 0xdc00 && low <= 0xdfff) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
          i++;
        } else {
          cp = 0xfffd;
        }
      } else {
        cp = 0xfffd;
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd;
    }
    append_utf8(out, cp);
  }
  return out;
}

bool looks_like_mdict(const uint8_t* data, size_t size) {
  static constexpr std::string_view roots[] = {"<Dictionary", "<Library_Data"};
  if (size < 4) {
    return false;
  }
  const uint32_t length = be32(data);
  if (length < 22 || length > max_header_size) {
    return false;
  }
  for (std::string_view root : roots) {
    if (size < 4 + root.size() * 2) {
      continue;
    }
    bool match = true;
    for (size_t i = 0; i < root.size() && match; ++i) {
      match = data[4 + 2 * i] == static_cast<uint8_t>(root[i]) && data[5 + 2 * i] == 0;
    }
    if (match) {
      return true;
    }
  }
  return false;
}

// Bounds-checked reads from the mapping; every offset the reader follows goes
// through here.
class Cursor {
 public:
  Cursor(const memory::mapped_file& file, uint64_t offset, const char* what)
      : file_(file), pos_(offset), what_(what) {}

  uint64_t pos() const { return pos_; }

  const uint8_t* take(uint64_t n) {
    if (pos_ > file_.size || file_.size - pos_ < n) {
      throw Error(std::format("truncated file: {} needs {} bytes at offset {}, file has {}", what_, n, pos_,
                              file_.size));
    }
    const uint8_t* p = file_.data + pos_;
    pos_ += n;
    return p;
  }

  uint64_t number(size_t width) {
    const uint8_t* p = take(width);
    return width == 8 ? be64(p) : be32(p);
  }

  std::vector<uint8_t> bytes(uint64_t n) {
    const uint8_t* p = take(n);
    return std::vector<uint8_t>(p, p + n);
  }

 private:
  const memory::mapped_file& file_;
  uint64_t pos_;
  const char* what_;
};

Reader::~Reader() { memory::unmap(file_); }

void Reader::open(const std::filesystem::path& path) {
  memory::unmap(file_);
  key_blocks_.clear();
  record_blocks_.clear();
  header_ = Header{};
  file_ = memory::map_rd(path);
  if (!file_) {
    throw Error("could not open file");
  }
  parse_header();
  parse_key_section();
  parse_record_section();
}

void Reader::parse_header() {
  Cursor cursor(file_, 0, "header");
  const uint64_t length = cursor.number(4);
  if (length > max_header_size) {
    throw Error(std::format("header claims {} bytes, over the {} MiB limit", length, max_header_size / (1024 * 1024)));
  }
  const uint8_t* text = cursor.take(length);
  const uint32_t checksum = le32(cursor.take(4));
  if (adler32(text, length) != checksum) {
    throw Error("header Adler-32 checksum mismatch");
  }

  const std::string xml = utf16le_to_utf8(text, length);
  const std::string root = parse_element(xml, header_.attributes);
  if (root == "Dictionary") {
    header_.kind = Kind::Mdx;
  } else if (root == "Library_Data") {
    header_.kind = Kind::Mdd;
  } else {
    throw Error(std::format("not an MDict file: header element is <{}>", root));
  }

  auto attr = [this](const char* name) -> std::string {
    auto it = header_.attributes.find(name);
    return it == header_.attributes.end() ? std::string() : it->second;
  };

  header_.engine_version = attr("GeneratedByEngineVersion");
  {
    const std::string_view text = header_.engine_version;
    const auto [end, ec] = std::from_chars(text.data(), text.data() + text.size(), header_.version);
    if (ec != std::errc{} || end == text.data()) {
      header_.version = 0;
    }
  }
  if (header_.version < 1.0) {
    throw Error(std::format("unsupported MDX engine version \"{}\"", header_.engine_version));
  }
  if (header_.version >= 3.0) {
    throw Error(std::format("unsupported MDX engine version {} (only 1.x and 2.0 are readable)",
                            header_.engine_version));
  }
  num_width_ = header_.version >= 2.0 ? 8 : 4;

  const std::string encrypted = attr("Encrypted");
  if (encrypted.empty() || lower(encrypted) == "no") {
    header_.encrypted = 0;
  } else if (lower(encrypted) == "yes") {
    header_.encrypted = 1;
  } else {
    header_.encrypted = std::atoi(encrypted.c_str());
  }
  if (header_.encrypted & 1) {
    throw Error("unsupported: registration-protected MDX (Encrypted=1 needs a user key)");
  }

  if (header_.kind == Kind::Mdd) {
    header_.encoding = Encoding::Utf16le;
  } else {
    const std::string encoding = lower(attr("Encoding"));
    if (encoding.empty() || encoding == "utf-8" || encoding == "utf8") {
      header_.encoding = Encoding::Utf8;
    } else if (encoding == "utf-16" || encoding == "utf16" || encoding == "utf-16le") {
      header_.encoding = Encoding::Utf16le;
    } else {
      throw Error(std::format("unsupported MDX encoding: {}", attr("Encoding")));
    }
  }

  header_.format = attr("Format");
  header_.compact = lower(attr("Compact")) == "yes" || lower(attr("Compat")) == "yes";
  header_.stylesheet = attr("StyleSheet");
  header_.title = attr("Title");
  header_.description = attr("Description");
  key_section_offset_ = cursor.pos();
}

void Reader::parse_key_section() {
  Cursor cursor(file_, key_section_offset_, "key section header");
  const bool v2 = num_width_ == 8;
  const uint8_t* counts = cursor.take(v2 ? 40 : 16);
  size_t p = 0;
  auto next = [&]() {
    const uint64_t v = v2 ? be64(counts + p) : be32(counts + p);
    p += num_width_;
    return v;
  };
  const uint64_t num_blocks = next();
  key_count_ = next();
  const uint64_t info_unpacked = v2 ? next() : 0;
  const uint64_t info_packed = next();
  const uint64_t blocks_packed = next();
  if (v2) {
    const uint32_t checksum = be32(cursor.take(4));
    if (adler32(counts, 40) != checksum) {
      throw Error("key section header Adler-32 checksum mismatch");
    }
  }
  if (num_blocks == 0 || key_count_ == 0) {
    throw Error("empty dictionary: no key blocks");
  }
  if (info_packed > max_block_size || info_unpacked > max_block_size) {
    throw Error("key-block index claims a size over the 256 MiB limit");
  }

  std::vector<uint8_t> info = cursor.bytes(info_packed);
  const uint64_t blocks_start = cursor.pos();
  if (v2) {
    if (header_.encrypted & 2) {
      if (info.size() < 8) {
        throw Error("truncated key-block index");
      }
      decrypt_key_index(info);
    }
    info = decode_framed(info, info_unpacked, "key-block index");
  }

  const size_t width = header_.encoding == Encoding::Utf16le ? 2 : 1;
  const size_t size_field = num_width_ / 4;
  const size_t terminator = v2 ? 1 : 0;
  size_t pos = 0;
  auto need = [&](size_t n) {
    if (info.size() - pos < n) {
      throw Error("truncated key-block index");
    }
  };
  auto number = [&]() {
    need(num_width_);
    const uint64_t v = v2 ? be64(info.data() + pos) : be32(info.data() + pos);
    pos += num_width_;
    return v;
  };
  auto key_text = [&]() {
    need(size_field);
    const uint64_t chars = size_field == 2 ? (uint64_t{info[pos]} << 8) | info[pos + 1] : info[pos];
    pos += size_field;
    const size_t bytes = static_cast<size_t>(chars + terminator) * width;
    need(bytes);
    // The stored text is NUL terminated in v2; the terminator is not part of the key.
    std::string text = decode_key(info.data() + pos, static_cast<size_t>(chars) * width);
    pos += bytes;
    return text;
  };

  key_blocks_.reserve(static_cast<size_t>(std::min<uint64_t>(num_blocks, info.size())));
  uint64_t file_offset = blocks_start;
  uint64_t entries_total = 0;
  for (uint64_t i = 0; i < num_blocks; ++i) {
    KeyBlockInfo block;
    block.entries = number();
    block.first_key = key_text();
    block.last_key = key_text();
    block.packed_size = number();
    block.unpacked_size = number();
    block.file_offset = file_offset;
    const uint64_t used = file_offset - blocks_start;
    // Every entry needs at least its offset number and a terminated key.
    if (block.packed_size < 8 || block.unpacked_size > max_block_size || block.packed_size > blocks_packed ||
        used > blocks_packed - block.packed_size || block.entries > block.unpacked_size / (num_width_ + width)) {
      throw Error(std::format("key block {} has an impossible size", i));
    }
    file_offset += block.packed_size;
    entries_total += block.entries;
    key_blocks_.push_back(std::move(block));
  }
  if (file_offset - blocks_start != blocks_packed) {
    throw Error("key blocks do not add up to the declared key section size");
  }
  if (entries_total != key_count_) {
    throw Error(std::format("key-block index lists {} entries, header says {}", entries_total, key_count_));
  }
  if (file_offset > file_.size) {
    throw Error("truncated file: key blocks run past the end");
  }
  record_section_offset_ = file_offset;
}

void Reader::parse_record_section() {
  Cursor cursor(file_, record_section_offset_, "record section header");
  const uint64_t num_blocks = cursor.number(num_width_);
  const uint64_t num_entries = cursor.number(num_width_);
  const uint64_t info_size = cursor.number(num_width_);
  const uint64_t blocks_size = cursor.number(num_width_);
  if (num_entries != key_count_) {
    throw Error(std::format("record section lists {} entries, key section {}", num_entries, key_count_));
  }
  if (num_blocks == 0 || num_blocks > file_.size / (2 * num_width_) || info_size != num_blocks * 2 * num_width_) {
    throw Error("record-block index size does not match its block count");
  }

  Cursor info(file_, cursor.pos(), "record-block index");
  const uint64_t blocks_start = cursor.pos() + info_size;
  record_blocks_.reserve(static_cast<size_t>(num_blocks));
  uint64_t file_offset = blocks_start;
  uint64_t unpacked_offset = 0;
  for (uint64_t i = 0; i < num_blocks; ++i) {
    RecordBlockInfo block;
    block.packed_size = info.number(num_width_);
    block.unpacked_size = info.number(num_width_);
    block.file_offset = file_offset;
    block.unpacked_offset = unpacked_offset;
    const uint64_t used = file_offset - blocks_start;
    if (block.packed_size < 8 || block.unpacked_size > max_block_size || block.packed_size > blocks_size ||
        used > blocks_size - block.packed_size) {
      throw Error(std::format("record block {} has an impossible size", i));
    }
    file_offset += block.packed_size;
    unpacked_offset += block.unpacked_size;
    record_blocks_.push_back(block);
  }
  if (file_offset - blocks_start != blocks_size) {
    throw Error("record blocks do not add up to the declared record section size");
  }
  if (file_offset > file_.size) {
    throw Error(std::format("truncated file: record blocks end at {}, file has {} bytes", file_offset, file_.size));
  }
  record_space_size_ = unpacked_offset;
}

std::vector<uint8_t> Reader::unpack_block(uint64_t offset, uint64_t packed_size, uint64_t unpacked_size,
                                          const char* what) const {
  Cursor cursor(file_, offset, what);
  return decode_framed(cursor.bytes(packed_size), unpacked_size, what);
}

std::string Reader::decode_key(const uint8_t* data, size_t size) const {
  if (header_.encoding == Encoding::Utf16le) {
    return utf16le_to_utf8(data, size);
  }
  return std::string(reinterpret_cast<const char*>(data), size);
}

void Reader::read_key_block(size_t index, std::vector<KeyEntry>& out) const {
  const KeyBlockInfo& info = key_blocks_.at(index);
  const std::vector<uint8_t> block = unpack_block(info.file_offset, info.packed_size, info.unpacked_size, "key block");
  const size_t width = header_.encoding == Encoding::Utf16le ? 2 : 1;
  size_t pos = 0;
  uint64_t produced = 0;
  while (pos < block.size()) {
    if (block.size() - pos < num_width_) {
      throw Error(std::format("truncated key block {}", index));
    }
    KeyEntry entry;
    entry.record_offset = num_width_ == 8 ? be64(block.data() + pos) : be32(block.data() + pos);
    pos += num_width_;
    size_t end = pos;
    while (true) {
      if (block.size() - end < width) {
        throw Error(std::format("key block {}: key text is not terminated", index));
      }
      if (block[end] == 0 && (width == 1 || block[end + 1] == 0)) {
        break;
      }
      end += width;
    }
    entry.key = decode_key(block.data() + pos, end - pos);
    pos = end + width;
    out.push_back(std::move(entry));
    produced++;
  }
  if (produced != info.entries) {
    throw Error(std::format("key block {} holds {} entries, index says {}", index, produced, info.entries));
  }
}

std::vector<KeyEntry> Reader::read_all_keys() const {
  std::vector<KeyEntry> keys;
  keys.reserve(static_cast<size_t>(key_count_));
  for (size_t i = 0; i < key_blocks_.size(); ++i) {
    read_key_block(i, keys);
  }
  return keys;
}

size_t Reader::record_block_for(uint64_t offset) const {
  auto it = std::upper_bound(record_blocks_.begin(), record_blocks_.end(), offset,
                             [](uint64_t value, const RecordBlockInfo& block) {
                               return value < block.unpacked_offset;
                             });
  if (it == record_blocks_.begin() || offset >= record_space_size_) {
    throw Error(std::format("record offset {} is outside the record space of {} bytes", offset, record_space_size_));
  }
  return static_cast<size_t>(std::distance(record_blocks_.begin(), it) - 1);
}

std::vector<uint8_t> Reader::read_record_block(size_t index) const {
  const RecordBlockInfo& info = record_blocks_.at(index);
  return unpack_block(info.file_offset, info.packed_size, info.unpacked_size, "record block");
}

std::string_view Reader::record_in_block(const std::vector<uint8_t>& block, size_t block_index, uint64_t offset,
                                         uint64_t next_offset) const {
  const RecordBlockInfo& info = record_blocks_.at(block_index);
  if (offset < info.unpacked_offset || offset - info.unpacked_offset > block.size()) {
    throw Error(std::format("record offset {} is not inside record block {}", offset, block_index));
  }
  const uint64_t block_end = info.unpacked_offset + block.size();
  const uint64_t end = std::clamp(next_offset, offset, block_end);
  const auto* begin = reinterpret_cast<const char*>(block.data()) + (offset - info.unpacked_offset);
  return std::string_view(begin, static_cast<size_t>(end - offset));
}

std::string Reader::record_text(std::string_view record) const {
  if (header_.encoding == Encoding::Utf16le) {
    while (record.size() >= 2 && record[record.size() - 1] == '\0' && record[record.size() - 2] == '\0') {
      record.remove_suffix(2);
    }
    return utf16le_to_utf8(reinterpret_cast<const uint8_t*>(record.data()), record.size());
  }
  while (!record.empty() && record.back() == '\0') {
    record.remove_suffix(1);
  }
  return std::string(record);
}
}
