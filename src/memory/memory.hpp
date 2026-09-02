#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>

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
}
