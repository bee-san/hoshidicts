// read_fault_shim.c: an LD_PRELOAD library for `open-dict-files-test --faults`
// (ctest open-dict-reads, Linux only). It watches the descriptors of one file,
// chosen by base name with read_shim_set(), and changes what their reads see:
//   count   nothing; read_shim_reads() returns the read() calls made on them;
//   eintr   the first read() of each descriptor fails with EINTR;
//   eio     every read() fails with EIO;
//   short   every read() returns at most `arg` bytes;
//   shrink  the file is cut to `arg` bytes once, at the first fstat() or read()
//           of a descriptor of it, whichever comes first (after the real
//           fstat(), so that it still gives the size the file had);
//   grow    the bytes given to read_shim_data() are appended to the file at
//           that same point.
// Descriptors opened by open, open64, openat, fopen and fopen64 (libstdc++'s
// filebuf opens with fopen) are watched. A read loop that does not stop at the
// end of the file is ended: 1000 reads in a row that return 0 on one
// descriptor exit the process with status 97.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define MAX_FD 4096

static char g_file[256];
static char g_mode[16];
static long g_arg;
static long g_reads;
static int g_changed;
static char g_path[4096];
static const char* g_data;
static long g_data_size;
static unsigned char watched[MAX_FD];
static unsigned char read_before[MAX_FD];
static long ends_in_a_row[MAX_FD];

void read_shim_set(const char* file, const char* mode, long arg) {
  snprintf(g_file, sizeof g_file, "%s", file ? file : "");
  snprintf(g_mode, sizeof g_mode, "%s", mode ? mode : "count");
  g_arg = arg;
  g_reads = 0;
  g_changed = 0;
  g_path[0] = '\0';
}

long read_shim_reads(void) { return g_reads; }

// The bytes grow appends; they must outlive the reads.
void read_shim_data(const char* data, long size) {
  g_data = data;
  g_data_size = size;
}

static int is_mode(const char* mode) { return strcmp(g_mode, mode) == 0; }

static void watch(int fd, const char* path) {
  if (fd < 0 || fd >= MAX_FD) return;
  watched[fd] = 0;
  read_before[fd] = 0;
  ends_in_a_row[fd] = 0;
  if (!path || !g_file[0]) return;
  const char* base = strrchr(path, '/');
  base = base ? base + 1 : path;
  if (strcmp(base, g_file) != 0) return;
  watched[fd] = 1;
  snprintf(g_path, sizeof g_path, "%s", path);
}

static int is_watched(int fd) { return fd >= 0 && fd < MAX_FD && watched[fd]; }

// The file changes once per read_shim_set(), through descriptors of its own.
static void change_file(void) {
  if (g_changed || !g_path[0]) return;
  g_changed = 1;
  if (is_mode("shrink")) {
    if (truncate(g_path, g_arg) != 0) perror("read-fault-shim: truncate");
  } else if (is_mode("grow")) {
    static int (*real_open)(const char*, int, ...);
    if (!real_open) real_open = (int (*)(const char*, int, ...))dlsym(RTLD_NEXT, "open");
    const int fd = real_open(g_path, O_WRONLY | O_APPEND);
    if (fd < 0) {
      perror("read-fault-shim: open to grow");
      return;
    }
    for (long done = 0; done < g_data_size;) {
      const ssize_t n = write(fd, g_data + done, (size_t)(g_data_size - done));
      if (n <= 0) break;
      done += n;
    }
    close(fd);
  }
}

int open(const char* path, int flags, ...) {
  static int (*real)(const char*, int, ...);
  if (!real) real = (int (*)(const char*, int, ...))dlsym(RTLD_NEXT, "open");
  mode_t mode = 0;
  if (flags & (O_CREAT | O_TMPFILE)) {
    va_list ap;
    va_start(ap, flags);
    mode = va_arg(ap, mode_t);
    va_end(ap);
  }
  const int fd = real(path, flags, mode);
  watch(fd, path);
  return fd;
}

int open64(const char* path, int flags, ...) {
  static int (*real)(const char*, int, ...);
  if (!real) real = (int (*)(const char*, int, ...))dlsym(RTLD_NEXT, "open64");
  mode_t mode = 0;
  if (flags & (O_CREAT | O_TMPFILE)) {
    va_list ap;
    va_start(ap, flags);
    mode = va_arg(ap, mode_t);
    va_end(ap);
  }
  const int fd = real(path, flags, mode);
  watch(fd, path);
  return fd;
}

int openat(int dirfd, const char* path, int flags, ...) {
  static int (*real)(int, const char*, int, ...);
  if (!real) real = (int (*)(int, const char*, int, ...))dlsym(RTLD_NEXT, "openat");
  mode_t mode = 0;
  if (flags & (O_CREAT | O_TMPFILE)) {
    va_list ap;
    va_start(ap, flags);
    mode = va_arg(ap, mode_t);
    va_end(ap);
  }
  const int fd = real(dirfd, path, flags, mode);
  watch(fd, path);
  return fd;
}

FILE* fopen(const char* path, const char* mode) {
  static FILE* (*real)(const char*, const char*);
  if (!real) real = (FILE * (*)(const char*, const char*)) dlsym(RTLD_NEXT, "fopen");
  FILE* f = real(path, mode);
  if (f) watch(fileno(f), path);
  return f;
}

FILE* fopen64(const char* path, const char* mode) {
  static FILE* (*real)(const char*, const char*);
  if (!real) real = (FILE * (*)(const char*, const char*)) dlsym(RTLD_NEXT, "fopen64");
  FILE* f = real(path, mode);
  if (f) watch(fileno(f), path);
  return f;
}

int fstat(int fd, struct stat* st) {
  static int (*real)(int, struct stat*);
  if (!real) real = (int (*)(int, struct stat*))dlsym(RTLD_NEXT, "fstat");
  const int r = real(fd, st);
  if (is_watched(fd)) change_file();
  return r;
}

int fstat64(int fd, struct stat64* st) {
  static int (*real)(int, struct stat64*);
  if (!real) real = (int (*)(int, struct stat64*))dlsym(RTLD_NEXT, "fstat64");
  const int r = real(fd, st);
  if (is_watched(fd)) change_file();
  return r;
}

ssize_t read(int fd, void* buf, size_t len) {
  static ssize_t (*real)(int, void*, size_t);
  if (!real) real = (ssize_t(*)(int, void*, size_t))dlsym(RTLD_NEXT, "read");
  if (!is_watched(fd)) return real(fd, buf, len);
  change_file();
  ++g_reads;
  const int first = !read_before[fd];
  read_before[fd] = 1;
  if (is_mode("eintr") && first) {
    errno = EINTR;
    return -1;
  }
  if (is_mode("eio")) {
    errno = EIO;
    return -1;
  }
  if (is_mode("short") && (long)len > g_arg) len = (size_t)g_arg;
  const ssize_t n = real(fd, buf, len);
  if (n == 0 && len > 0) {
    if (++ends_in_a_row[fd] >= 1000) {
      fprintf(stderr, "read-fault-shim: 1000 reads in a row at the end of %s: a read loop that does not stop\n",
              g_file);
      _exit(97);
    }
  } else {
    ends_in_a_row[fd] = 0;
  }
  return n;
}

int close(int fd) {
  static int (*real)(int);
  if (!real) real = (int (*)(int))dlsym(RTLD_NEXT, "close");
  if (fd >= 0 && fd < MAX_FD) watched[fd] = 0;
  return real(fd);
}

int fclose(FILE* f) {
  static int (*real)(FILE*);
  if (!real) real = (int (*)(FILE*))dlsym(RTLD_NEXT, "fclose");
  const int fd = f ? fileno(f) : -1;
  if (fd >= 0 && fd < MAX_FD) watched[fd] = 0;
  return real(f);
}
