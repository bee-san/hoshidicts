#include "memory.hpp"

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace memory {
mapped_file map_rd(const std::filesystem::path& path) {
#ifdef _WIN32
  HANDLE file =
      CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return {};
  }

  LARGE_INTEGER file_size;
  if (!GetFileSizeEx(file, &file_size) || file_size.QuadPart == 0) {
    CloseHandle(file);
    return {};
  }

  HANDLE mapping = CreateFileMappingW(file, nullptr, PAGE_READONLY, 0, 0, nullptr);
  CloseHandle(file);
  if (!mapping) {
    return {};
  }

  auto* data = static_cast<uint8_t*>(MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, 0));
  CloseHandle(mapping);
  if (!data) {
    return {};
  }

  return {.data = data, .size = static_cast<size_t>(file_size.QuadPart)};
#else
#if defined(__EMSCRIPTEN__) && HOSHIDICTS_WASMFS
  // WasmFS's OPFS backend serves a read-only descriptor from a Blob: the whole
  // file is copied into a JavaScript ArrayBuffer and then into the heap, with
  // an async round trip in between. A read-write descriptor uses a sync access
  // handle that reads straight into the heap, about twice as fast. WasmFS's
  // mmap copies the file either way and its munmap never touches a read-only
  // mapping's descriptor, so the handle (and its lock on the file) is released
  // as soon as the copy is done. The classic Emscripten FS is different on
  // both counts, hence the gate.
  int fd = open(path.c_str(), O_RDWR);
  if (fd < 0) {
    fd = open(path.c_str(), O_RDONLY);
  }
  constexpr bool keep_fd = false;
#else
  int fd = open(path.c_str(), O_RDONLY);
#ifdef __EMSCRIPTEN__
  constexpr bool keep_fd = true;
#else
  constexpr bool keep_fd = false;
#endif
#endif
  if (fd < 0) {
    return {};
  }

  struct stat st{};
  if (fstat(fd, &st) != 0 || st.st_size == 0) {
    close(fd);
    return {};
  }

  auto* data = static_cast<uint8_t*>(mmap(nullptr, st.st_size, PROT_READ, MAP_SHARED, fd, 0));
  if (!keep_fd) {
    close(fd);
    fd = -1;
  }
  if (data == reinterpret_cast<uint8_t*>(MAP_FAILED)) {
    if (fd >= 0) {
      close(fd);
    }
    return {};
  }

  return {.data = data, .size = static_cast<size_t>(st.st_size), .fd = fd};
#endif
}

mapped_file map_rw(const std::filesystem::path& path, size_t file_size) {
  if (file_size == 0) {
    return {};
  }

#ifdef _WIN32
  HANDLE file = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return {};
  }

  LARGE_INTEGER size;
  size.QuadPart = static_cast<LONGLONG>(file_size);
  if (!SetFilePointerEx(file, size, nullptr, FILE_BEGIN) || !SetEndOfFile(file)) {
    CloseHandle(file);
    return {};
  }

  HANDLE mapping = CreateFileMappingW(file, nullptr, PAGE_READWRITE, size.HighPart, size.LowPart, nullptr);
  CloseHandle(file);
  if (!mapping) {
    return {};
  }

  auto* data = static_cast<uint8_t*>(MapViewOfFile(mapping, FILE_MAP_WRITE, 0, 0, file_size));
  CloseHandle(mapping);
  if (!data) {
    return {};
  }

  return {.data = data, .size = file_size};
#else
  int fd = open(path.c_str(), O_RDWR | O_CREAT | O_TRUNC, 0644);
  if (fd < 0) {
    return {};
  }

  if (ftruncate(fd, static_cast<off_t>(file_size)) < 0) {
    close(fd);
    return {};
  }

  auto* data = static_cast<uint8_t*>(mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0));
#ifndef __EMSCRIPTEN__
  close(fd);
  fd = -1;
#endif
  if (data == reinterpret_cast<uint8_t*>(MAP_FAILED)) {
    if (fd >= 0) {
      close(fd);
    }
    return {};
  }

  return {.data = data, .size = file_size, .fd = fd};
#endif
}

void unmap(mapped_file mapping) {
  if (!mapping.data) {
    return;
  }

#ifdef _WIN32
  FlushViewOfFile(mapping.data, 0);
  UnmapViewOfFile(mapping.data);
#else
  msync(mapping.data, mapping.size, MS_SYNC);
  munmap(mapping.data, mapping.size);
  if (mapping.fd >= 0) {
    close(mapping.fd);
  }
#endif
}
}
