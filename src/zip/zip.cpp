#include "zip.hpp"

#include <libdeflate.h>

#include <algorithm>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <initializer_list>
#include <numeric>

#include "../memory/memory.hpp"

namespace {
template <typename T>
T read_at(const uint8_t* base, size_t offset) {
  T val;
  std::memcpy(&val, base + offset, sizeof(T));
  return val;
}

constexpr uint32_t ZIP64_SENTINEL = 0xFFFFFFFF;

// Reads smaller than half of this come from a window of the file this large.
constexpr size_t WINDOW_SIZE = 4 * 1024 * 1024;
// The end of central directory record, its comment of 64 KiB at most, and the
// Zip64 locator that may come before it.
constexpr size_t TAIL_SIZE = 22 + 0xFFFF + 20;

std::atomic<uint64_t> next_zip_id{0};

// A part of a file read ahead, for many small reads that go through the file
// in order: an archive has an entry for every image of a dictionary, and each
// read of a file in a browser can cost a round trip.
class read_window {
 public:
  // The `len` bytes at `offset` of the file of archive `owner`, valid until the
  // next call; null on an I/O error or a range beyond the end of the file.
  const uint8_t* get(const memory::file_reader& file, uint64_t owner, uint64_t offset, size_t len) {
    if (owner != owner_ || offset < start_ || offset - start_ > data_.size() || data_.size() - (offset - start_) < len) {
      if (offset > file.size() || file.size() - offset < len) {
        return nullptr;
      }
      const auto size = static_cast<size_t>(std::min<uint64_t>(std::max(WINDOW_SIZE, len), file.size() - offset));
      data_.resize(size);
      if (!file.read(data_.data(), size, offset)) {
        owner_ = UINT64_MAX;
        data_.clear();
        return nullptr;
      }
      owner_ = owner;
      start_ = offset;
    }
    return data_.data() + (offset - start_);
  }

 private:
  uint64_t owner_ = UINT64_MAX;
  uint64_t start_ = 0;
  std::vector<uint8_t> data_;
};

thread_local read_window entry_window;

// The Zip64 extended information extra field (APPNOTE 4.5.3) of the extra
// block at [start, start + length): the offset and length of its data, or
// false when the block has none or runs past the file.
bool find_zip64_extra(const uint8_t* base, size_t file_size, size_t start, size_t length, size_t& data,
                      size_t& data_length) {
  if (start > file_size || file_size - start < length) {
    return false;
  }
  for (size_t pos = start; length - (pos - start) >= 4;) {
    const auto id = read_at<uint16_t>(base, pos);
    const auto size = read_at<uint16_t>(base, pos + 2);
    if (length - (pos - start) - 4 < size) {
      return false;
    }
    if (id == 0x0001) {
      data = pos + 4;
      data_length = size;
      return true;
    }
    pos += 4 + static_cast<size_t>(size);
  }
  return false;
}

// Replaces each 32-bit size or offset that holds the Zip64 sentinel with the
// next 64-bit value of the extra field, in the field's fixed order. Returns
// false when the extra field is missing or too short for the values it owes.
bool read_zip64_values(const uint8_t* base, size_t file_size, size_t extra_start, size_t extra_length,
                       std::initializer_list<uint64_t*> values) {
  size_t data = 0;
  size_t data_length = 0;
  bool found = false;
  size_t used = 0;
  for (uint64_t* value : values) {
    if (*value != ZIP64_SENTINEL) {
      continue;
    }
    if (!found && !(found = find_zip64_extra(base, file_size, extra_start, extra_length, data, data_length))) {
      return false;
    }
    if (data_length - used < 8) {
      return false;
    }
    *value = read_at<uint64_t>(base, data + used);
    used += 8;
  }
  return true;
}
}

Zip::Zip() : id_(next_zip_id++) {}

bool Zip::open(const std::filesystem::path& path) {
  file = memory::file_reader::open(path);
  if (!file) {
    return false;
  }

  return parse_central_directory();
}

int Zip::find(const std::string& name) const {
  for (int i = 0; i < static_cast<int>(entries.size()); ++i) {
    if (entries[i].name == name) {
      return i;
    }
  }
  return -1;
}

bool Zip::read_data(const ZipEntry& e, uint8_t* out, size_t size) const {
  if (size >= WINDOW_SIZE / 2) {
    return file.read(out, size, e.data_offset);
  }
  const uint8_t* data = entry_window.get(file, id_, e.data_offset, size);
  if (!data) {
    return false;
  }
  std::memcpy(out, data, size);
  return true;
}

std::string Zip::read(int index) const {
  const auto& e = entries[index];
  if (e.uncompressed_size == 0) {
    return "";
  }

  std::string result;
  result.resize(static_cast<size_t>(e.uncompressed_size));

  if (e.compression_method == 0) {
    if (!read_data(e, reinterpret_cast<uint8_t*>(result.data()), result.size())) {
      return "";
    }
  } else if (e.compression_method == 8) {
    std::vector<uint8_t> src(static_cast<size_t>(e.compressed_size));
    if (!read_data(e, src.data(), src.size())) {
      return "";
    }
    thread_local auto* d = libdeflate_alloc_decompressor();
    if (libdeflate_deflate_decompress(d, src.data(), src.size(), result.data(),
                                      static_cast<size_t>(e.uncompressed_size), nullptr) !=
        LIBDEFLATE_SUCCESS) {
      return "";
    }
  } else {
    return "";
  }
  return result;
}

std::optional<Zip::MediaResult> Zip::read_media(int index) const {
  const auto& e = entries[index];
  MediaResult out;
  out.path = e.name;
  out.blob.resize(static_cast<size_t>(e.uncompressed_size));
  if (e.uncompressed_size == 0) {
    return out;
  }

  if (e.compression_method == 0) {
    if (!read_data(e, reinterpret_cast<uint8_t*>(out.blob.data()), out.blob.size())) {
      return std::nullopt;
    }
  } else if (e.compression_method == 8) {
    std::vector<uint8_t> src(static_cast<size_t>(e.compressed_size));
    if (!read_data(e, src.data(), src.size())) {
      return std::nullopt;
    }
    thread_local auto* d = libdeflate_alloc_decompressor();
    if (libdeflate_deflate_decompress(d, src.data(), src.size(), out.blob.data(),
                                      static_cast<size_t>(e.uncompressed_size), nullptr) !=
        LIBDEFLATE_SUCCESS) {
      return std::nullopt;
    }
  } else {
    return std::nullopt;
  }
  return out;
}

// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
bool Zip::parse_central_directory() {
  const uint64_t file_size = file.size();
  if (file_size < 22) {
    return false;
  }

  // The end of central directory record is within the last TAIL_SIZE bytes.
  const uint64_t tail_start = file_size > TAIL_SIZE ? file_size - TAIL_SIZE : 0;
  std::vector<uint8_t> tail(static_cast<size_t>(file_size - tail_start));
  if (!file.read(tail.data(), tail.size(), tail_start)) {
    return false;
  }
  const uint8_t* tail_base = tail.data();

  size_t eocd = tail.size() - 22;
  while (eocd > 0 && read_at<uint32_t>(tail_base, eocd) != 0x06054b50) {
    eocd--;
  }
  if (read_at<uint32_t>(tail_base, eocd) != 0x06054b50) {
    return false;
  }

  uint64_t total_entries = read_at<uint16_t>(tail_base, eocd + 10);
  uint64_t cd_offset = read_at<uint32_t>(tail_base, eocd + 16);

  if (eocd >= 20 && read_at<uint32_t>(tail_base, eocd - 20) == 0x07064b50) {
    auto eocd64_offset = read_at<uint64_t>(tail_base, eocd - 12);
    uint8_t eocd64[56];
    if (eocd64_offset <= file_size && file_size - eocd64_offset >= 56 && file.read(eocd64, 56, eocd64_offset) &&
        read_at<uint32_t>(eocd64, 0) == 0x06064b50) {
      total_entries = read_at<uint64_t>(eocd64, 32);
      cd_offset = read_at<uint64_t>(eocd64, 48);
    }
  }

  // The central directory, read from its start to the end of the file, so
  // offsets in it are relative to cd_offset.
  if (cd_offset > file_size) {
    return false;
  }
  std::vector<uint8_t> cd(static_cast<size_t>(file_size - cd_offset));
  if (!cd.empty() && !file.read(cd.data(), cd.size(), cd_offset)) {
    return false;
  }
  const uint8_t* base = cd.data();
  const size_t cd_size = cd.size();

  entries.reserve(total_entries);
  std::vector<uint64_t> local_header_offsets;
  local_header_offsets.reserve(total_entries);
  size_t pos = 0;

  for (uint64_t i = 0; i < total_entries; ++i) {
    if (pos > cd_size || cd_size - pos < 46) {
      return false;
    }
    if (read_at<uint32_t>(base, pos) != 0x02014b50) {
      return false;
    }

    ZipEntry e;
    e.compression_method = read_at<uint16_t>(base, pos + 10);
    e.compressed_size = read_at<uint32_t>(base, pos + 20);
    e.uncompressed_size = read_at<uint32_t>(base, pos + 24);

    auto name_len = read_at<uint16_t>(base, pos + 28);
    auto extra_len = read_at<uint16_t>(base, pos + 30);
    auto comment_len = read_at<uint16_t>(base, pos + 32);

    uint64_t lfh_offset = read_at<uint32_t>(base, pos + 42);
    if (cd_size - pos - 46 < name_len) {
      return false;
    }
    e.name.assign(reinterpret_cast<const char*>(base + pos + 46), name_len);
    // A Zip64 writer records sizes and the local header offset that do not
    // fit, or all of them when forced, in the entry's Zip64 extra field.
    if (!read_zip64_values(base, cd_size, pos + 46 + name_len, extra_len,
                           {&e.uncompressed_size, &e.compressed_size, &lfh_offset})) {
      error = "archive entry has an unreadable Zip64 extra field";
      return false;
    }

    if (lfh_offset > file_size || file_size - lfh_offset < 30) {
      return false;
    }
    // An entry must fit in memory to be read at all; on a 32-bit target a
    // Zip64 size may not.
    if (e.uncompressed_size > SIZE_MAX || e.compressed_size > SIZE_MAX) {
      error = "archive entry is too large to read on this platform";
      return false;
    }
    if (e.compression_method != 0 && e.uncompressed_size > 0) {
      if (e.compressed_size == 0) {
        error = "archive entry has no compressed data for its declared size";
        return false;
      }
    }

    entries.push_back(std::move(e));
    local_header_offsets.push_back(lfh_offset);
    pos += static_cast<size_t>(46) + name_len + extra_len + comment_len;
  }

  return read_local_headers(local_header_offsets);
}

// Finds where each entry's data starts, after its local header, and checks the
// header against the central directory. The headers are read in the order they
// are in the file, so a window of it read ahead holds many of them.
bool Zip::read_local_headers(const std::vector<uint64_t>& local_header_offsets) {
  const uint64_t file_size = file.size();
  std::vector<size_t> order(entries.size());
  std::iota(order.begin(), order.end(), size_t{0});
  std::sort(order.begin(), order.end(),
            [&](size_t a, size_t b) { return local_header_offsets[a] < local_header_offsets[b]; });
  read_window window;

  for (const size_t i : order) {
    auto& e = entries[i];
    const uint64_t lfh_offset = local_header_offsets[i];
    const uint8_t* lfh = window.get(file, id_, lfh_offset, 30);
    if (!lfh) {
      return false;
    }
    // General-purpose bit 3 lets a local header leave its sizes zero and put
    // them in a data descriptor after the data (APPNOTE 4.4.4, 4.4.8, 4.4.9).
    // Some writers zero only one of the two (the compressed size, while the
    // uncompressed size is known up front). Reads use the central directory's
    // sizes either way, so each size the local header does record must agree.
    const bool sizes_deferred = (read_at<uint16_t>(lfh, 6) & 0x0008) != 0;
    uint64_t lfh_compressed = read_at<uint32_t>(lfh, 18);
    uint64_t lfh_uncompressed = read_at<uint32_t>(lfh, 22);
    auto lfh_name_len = read_at<uint16_t>(lfh, 26);
    auto lfh_extra_len = read_at<uint16_t>(lfh, 28);
    // A local Zip64 extra field carries both sizes once either is the
    // sentinel (APPNOTE 4.5.3), uncompressed first. zip.js writes the sentinel
    // without one and keeps the sizes in the central directory alone, which
    // reads use anyway: a sentinel with no local Zip64 field records nothing.
    bool local_sentinel_only = false;
    if (lfh_compressed == ZIP64_SENTINEL || lfh_uncompressed == ZIP64_SENTINEL) {
      const uint64_t lfh_extra = lfh_offset + 30 + lfh_name_len;
      const uint8_t* extra = nullptr;
      if (lfh_extra <= file_size && file_size - lfh_extra >= lfh_extra_len) {
        extra = window.get(file, id_, lfh_extra, lfh_extra_len);
        if (!extra) {
          return false;
        }
      }
      size_t data = 0;
      size_t data_length = 0;
      if (!extra || !find_zip64_extra(extra, lfh_extra_len, 0, lfh_extra_len, data, data_length)) {
        local_sentinel_only = true;
      } else {
        lfh_compressed = lfh_uncompressed = ZIP64_SENTINEL;
        if (!read_zip64_values(extra, lfh_extra_len, 0, lfh_extra_len, {&lfh_uncompressed, &lfh_compressed})) {
          error = "archive entry has an unreadable Zip64 extra field";
          return false;
        }
      }
    }
    const auto local_size_agrees = [sizes_deferred, local_sentinel_only](uint64_t local, uint64_t central) {
      return local == central || (sizes_deferred && local == 0) || (local_sentinel_only && local == ZIP64_SENTINEL);
    };
    if (!local_size_agrees(lfh_compressed, e.compressed_size) ||
        !local_size_agrees(lfh_uncompressed, e.uncompressed_size)) {
      error = "archive entry sizes disagree between headers";
      return false;
    }
    const uint64_t data_offset = lfh_offset + 30 + lfh_name_len + lfh_extra_len;
    const uint64_t data_size = e.compression_method == 0 ? e.uncompressed_size : e.compressed_size;
    if (data_offset > file_size || file_size - data_offset < data_size || data_offset > SIZE_MAX) {
      return false;
    }
    e.data_offset = static_cast<size_t>(data_offset);
  }

  return true;
}
