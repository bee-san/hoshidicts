#include "memory.hpp"

#include <algorithm>
#include <memory>
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
namespace {
// Reads `size` bytes, the size the file is said to have, into `out`, then on
// to the end of the file as a stream does: short of `size` if the file is
// shorter, past it if it is longer (it grew, or its file system gives sizes
// that are off), unless `exact` says the size is the content's. `read_some`
// returns the bytes it read, 0 at the end of the file or -1 on an error. False,
// with `out` empty, on an error.
template <typename ReadSome>
bool read_all(size_t size, bool exact, ReadSome read_some, std::string& out) {
  out.resize(size);
  size_t done = 0;
  while (done < size) {
    const int64_t n = read_some(out.data() + done, size - done);
    if (n < 0) {
      out.clear();
      return false;
    }
    if (n == 0) {
      out.resize(done);
      return true;
    }
    done += static_cast<size_t>(n);
  }
  if (exact) {
    return true;
  }
  char more[4096];
  for (;;) {
    const int64_t n = read_some(more, sizeof(more));
    if (n < 0) {
      out.clear();
      return false;
    }
    if (n == 0) {
      return true;
    }
    out.append(more, static_cast<size_t>(n));
  }
}
}  // namespace

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
#if defined(__EMSCRIPTEN__) && HOSHIDICTS_WASMFS
  // WasmFS keeps no FIFOs (mknod refuses them, and its node backend does not
  // show the host's), and a read-only descriptor of its OPFS backend reads the
  // snapshot its open took, whose size fstat gives. Each stat or read through
  // that backend is a round trip, so neither the stat before the open nor the
  // read that finds the end is made there.
  constexpr bool exact_sizes = true;
#else
  constexpr bool exact_sizes = false;
#endif
#ifdef _WIN32
  // The sharing of the std::ifstream it replaces (_SH_DENYNO): a writer may
  // hold the file open, and may open it while it is read.
  HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
                            FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return false;
  }
  // Closed on every return, and when the buffer's allocation throws.
  const std::unique_ptr<void, decltype(&CloseHandle)> closer(file, &CloseHandle);
  LARGE_INTEGER file_size;
  if (GetFileType(file) != FILE_TYPE_DISK || !GetFileSizeEx(file, &file_size) || file_size.QuadPart <= 0 ||
      static_cast<uint64_t>(file_size.QuadPart) > out.max_size()) {
    return false;
  }
  const auto read_some = [file](char* buf, size_t len) -> int64_t {
    DWORD n = 0;
    if (!ReadFile(file, buf, static_cast<DWORD>(std::min<size_t>(len, 1u << 30)), &n, nullptr)) {
      return -1;
    }
    return n;
  };
  return read_all(static_cast<size_t>(file_size.QuadPart), exact_sizes, read_some, out);
#else
  if constexpr (!exact_sizes) {
    // Only a non-empty regular file is opened. Opening a FIFO would let its
    // writer's open return, and the stream's own open after this one would
    // then wait for a writer that has gone.
    struct stat path_st{};
    if (::stat(path.c_str(), &path_st) != 0 || !S_ISREG(path_st.st_mode) || path_st.st_size <= 0) {
      return false;
    }
  }
#ifdef __EMSCRIPTEN__
  const int fd = ::open(path.c_str(), O_RDONLY);
#else
  const int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC);
#endif
  if (fd < 0) {
    return false;
  }
  // Closed on every return, and when the buffer's allocation throws.
  struct closer {
    int fd;
    ~closer() { ::close(fd); }
  } const close_fd{fd};
  struct stat st{};
  if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode) || st.st_size <= 0 ||
      static_cast<uint64_t>(st.st_size) > out.max_size()) {
    return false;
  }
  const auto read_some = [fd](char* buf, size_t len) -> int64_t {
    for (;;) {
      const ssize_t n = ::read(fd, buf, len);
      if (n >= 0 || errno != EINTR) {
        return n;
      }
    }
  };
  return read_all(static_cast<size_t>(st.st_size), exact_sizes, read_some, out);
#endif
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
