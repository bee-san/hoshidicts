#include "memory.hpp"

#include <algorithm>
#include <utility>

#ifdef _WIN32
#include <windows.h>
#else
#include <cerrno>
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

bool read_file(const std::filesystem::path& path, std::string& out) {
  out.clear();
  bool ok = false;
#ifdef _WIN32
  // The sharing of the std::ifstream it replaces (_SH_DENYNO): a writer may
  // hold the file open, and may open it while it is read.
  HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
                            FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return false;
  }
  LARGE_INTEGER file_size;
  if (GetFileType(file) == FILE_TYPE_DISK && GetFileSizeEx(file, &file_size) && file_size.QuadPart > 0 &&
      static_cast<uint64_t>(file_size.QuadPart) <= out.max_size()) {
    out.resize(static_cast<size_t>(file_size.QuadPart));
    size_t done = 0;
    ok = true;
    while (done < out.size()) {
      const auto chunk = static_cast<DWORD>(std::min<size_t>(out.size() - done, 1u << 30));
      DWORD n = 0;
      if (!ReadFile(file, out.data() + done, chunk, &n, nullptr)) {
        ok = false;
        break;
      }
      if (n == 0) {
        break;
      }
      done += n;
    }
    out.resize(done);
  }
  CloseHandle(file);
#else
#ifdef __EMSCRIPTEN__
  const int fd = ::open(path.c_str(), O_RDONLY);
#else
  const int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC);
#endif
  if (fd < 0) {
    return false;
  }
  struct stat st{};
  if (fstat(fd, &st) == 0 && S_ISREG(st.st_mode) && st.st_size > 0 &&
      static_cast<uint64_t>(st.st_size) <= out.max_size()) {
    out.resize(static_cast<size_t>(st.st_size));
    size_t done = 0;
    ok = true;
    while (done < out.size()) {
      const ssize_t n = ::read(fd, out.data() + done, out.size() - done);
      if (n < 0 && errno == EINTR) {
        continue;
      }
      if (n < 0) {
        ok = false;
        break;
      }
      if (n == 0) {
        break;
      }
      done += static_cast<size_t>(n);
    }
    out.resize(done);
  }
  ::close(fd);
#endif
  if (!ok) {
    out.clear();
  }
  return ok;
}

file_reader::~file_reader() { close(); }

file_reader::file_reader(file_reader&& other) noexcept
#ifdef _WIN32
    : handle_(std::exchange(other.handle_, nullptr)),
#else
    : fd_(std::exchange(other.fd_, -1)),
#endif
      size_(std::exchange(other.size_, 0)) {
}

file_reader& file_reader::operator=(file_reader&& other) noexcept {
  if (this != &other) {
    close();
#ifdef _WIN32
    handle_ = std::exchange(other.handle_, nullptr);
#else
    fd_ = std::exchange(other.fd_, -1);
#endif
    size_ = std::exchange(other.size_, 0);
  }
  return *this;
}

file_reader file_reader::open(const std::filesystem::path& path) {
  file_reader reader;
#ifdef _WIN32
  HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_RANDOM_ACCESS, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return reader;
  }
  LARGE_INTEGER file_size;
  if (!GetFileSizeEx(file, &file_size) || file_size.QuadPart <= 0) {
    CloseHandle(file);
    return reader;
  }
  reader.handle_ = file;
  reader.size_ = static_cast<uint64_t>(file_size.QuadPart);
#else
#if defined(__EMSCRIPTEN__) && HOSHIDICTS_WASMFS
  // As in map_rd: a read-write descriptor reads through a sync access handle
  // straight into the heap, a read-only one through a Blob with an async round
  // trip per read. Here the descriptor stays open, so the handle's lock on the
  // file lasts as long as the reader. When another context still holds the
  // lock the read-only descriptor is slower but reads the same bytes.
  int fd = ::open(path.c_str(), O_RDWR);
  if (fd < 0) {
    fd = ::open(path.c_str(), O_RDONLY);
  }
#elif defined(__EMSCRIPTEN__)
  int fd = ::open(path.c_str(), O_RDONLY);
#else
  int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC);
#endif
  if (fd < 0) {
    return reader;
  }
  struct stat st{};
  if (fstat(fd, &st) != 0 || st.st_size <= 0) {
    ::close(fd);
    return reader;
  }
  reader.fd_ = fd;
  reader.size_ = static_cast<uint64_t>(st.st_size);
#endif
  return reader;
}

bool file_reader::read(void* out, size_t len, uint64_t offset) const {
  if (offset > size_ || len > size_ - offset) {
    return false;
  }
  auto* dst = static_cast<uint8_t*>(out);
  while (len > 0) {
#ifdef _WIN32
    OVERLAPPED at{};
    at.Offset = static_cast<DWORD>(offset);
    at.OffsetHigh = static_cast<DWORD>(offset >> 32);
    const auto chunk = static_cast<DWORD>(std::min<size_t>(len, 1u << 30));
    DWORD n = 0;
    if (!ReadFile(handle_, dst, chunk, &n, &at) || n == 0) {
      return false;
    }
#else
    const ssize_t n = pread(fd_, dst, len, static_cast<off_t>(offset));
    if (n < 0 && errno == EINTR) {
      continue;
    }
    if (n <= 0) {
      return false;
    }
#endif
    dst += n;
    len -= static_cast<size_t>(n);
    offset += static_cast<uint64_t>(n);
  }
  return true;
}

void file_reader::close() {
#ifdef _WIN32
  if (handle_ != nullptr) {
    CloseHandle(handle_);
    handle_ = nullptr;
  }
#else
  if (fd_ >= 0) {
    ::close(fd_);
    fd_ = -1;
  }
#endif
  size_ = 0;
}
}
