#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <string>

namespace memory {
struct mapped_file {
  uint8_t* data = nullptr;
  size_t size = 0;
  // Emscripten's mmap emulation flushes MAP_SHARED writes through the file
  // descriptor when msync/munmap runs, so the descriptor has to outlive the
  // mapping there. Left at -1 on platforms that close it eagerly.
  int fd = -1;

  explicit operator bool() const { return data != nullptr; }
};

mapped_file map_rd(const std::filesystem::path& path);
mapped_file map_rw(const std::filesystem::path& path, size_t file_size);
void unmap(mapped_file mapping);

// Reads all of a non-empty regular file into `out` with one read of the size
// it has, where an std::ifstream refills a small buffer with a read each time.
// Through WasmFS's OPFS backend every read of a read-only file is an
// asynchronous round trip, so a 112 KB dict.zstd costs one instead of 56. The
// file is opened read-only, as by the stream, and is not mapped: the classic
// Emscripten FS writes a mapping back into its file when it is synced. False,
// with `out` empty, when the path cannot be opened, is not a regular file, has
// a size of 0 (procfs gives that for files with content) or a read fails.
bool read_file(const std::filesystem::path& path, std::string& out);

// A file kept open for positional reads, for data that is read on demand
// instead of mapped. Under Emscripten mmap copies the whole file into linear
// memory, so a file only some of which is ever read is cheaper this way.
// Reads may run on several threads at once.
class file_reader {
 public:
  file_reader() = default;
  ~file_reader();

  file_reader(const file_reader&) = delete;
  file_reader& operator=(const file_reader&) = delete;
  file_reader(file_reader&& other) noexcept;
  file_reader& operator=(file_reader&& other) noexcept;

  // Opens an existing, non-empty file; an empty reader when that fails.
  static file_reader open(const std::filesystem::path& path);

  explicit operator bool() const { return size_ != 0; }
  uint64_t size() const { return size_; }

  // Copies `len` bytes at `offset` into `out`; false on an I/O error or a
  // range beyond the end of the file.
  bool read(void* out, size_t len, uint64_t offset) const;

 private:
  void close();

#ifdef _WIN32
  void* handle_ = nullptr;
#else
  int fd_ = -1;
#endif
  uint64_t size_ = 0;
};
}
