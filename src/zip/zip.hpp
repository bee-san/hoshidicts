#pragma once

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <vector>

#include "../memory/memory.hpp"

struct ZipEntry {
  std::string name;
  uint16_t compression_method;
  uint64_t compressed_size;
  uint64_t uncompressed_size;
  size_t data_offset;
};

// Reads entries from the archive on demand rather than mapping it: under
// Emscripten mmap copies the whole file into linear memory, which for a large
// dictionary is hundreds of megabytes more than an import needs.
struct Zip {
  memory::file_reader file;
  std::vector<ZipEntry> entries;
  std::string error;

  Zip();
  bool open(const std::filesystem::path& path);
  int find(const std::string& name) const;
  std::string read(int index) const;

  struct MediaResult {
    std::string path;
    std::vector<char> blob;
  };

  std::optional<MediaResult> read_media(int index) const;

 private:
  bool parse_central_directory();
  bool read_local_headers(const std::vector<uint64_t>& local_header_offsets);
  // Copies an entry's stored bytes; small entries come from a window of the
  // file read ahead, as each read of a file can cost a round trip.
  bool read_data(const ZipEntry& e, uint8_t* out, size_t size) const;

  // Tells this archive's read-ahead windows from those of archives before it.
  uint64_t id_;
};
