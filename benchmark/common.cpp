#include "common.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <numeric>
#include <random>
#include <sstream>
#include <stdexcept>
#include <system_error>

#if defined(__linux__)
#include <unistd.h>
#elif defined(__APPLE__)
#include <mach/mach.h>
#elif defined(_WIN32)
#define NOMINMAX
// clang-format off
#include <windows.h>
#include <psapi.h>
// clang-format on
#endif

#include "benchmark_version.hpp"

namespace hd_benchmark {
namespace {

double percentile(const std::vector<double>& sorted, double fraction) {
  if (sorted.empty()) {
    return 0.0;
  }
  if (sorted.size() == 1) {
    return sorted.front();
  }

  const double position = fraction * static_cast<double>(sorted.size() - 1);
  const auto lower = static_cast<size_t>(std::floor(position));
  const auto upper = static_cast<size_t>(std::ceil(position));
  const double weight = position - static_cast<double>(lower);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

uint64_t current_rss_bytes() {
#if defined(__linux__)
  std::ifstream statm("/proc/self/statm");
  uint64_t virtual_pages = 0;
  uint64_t resident_pages = 0;
  if (!(statm >> virtual_pages >> resident_pages)) {
    return 0;
  }
  const long page_size = sysconf(_SC_PAGESIZE);
  if (page_size <= 0) {
    return 0;
  }
  return resident_pages * static_cast<uint64_t>(page_size);
#elif defined(__APPLE__)
  mach_task_basic_info_data_t info{};
  mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
  if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, reinterpret_cast<task_info_t>(&info), &count) != KERN_SUCCESS) {
    return 0;
  }
  return static_cast<uint64_t>(info.resident_size);
#elif defined(_WIN32)
  PROCESS_MEMORY_COUNTERS_EX counters{};
  counters.cb = sizeof(counters);
  if (!GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters),
                            sizeof(counters))) {
    return 0;
  }
  return static_cast<uint64_t>(counters.WorkingSetSize);
#else
  return 0;
#endif
}

std::string utc_timestamp() {
  const std::time_t now = std::time(nullptr);
  std::tm utc{};
#if defined(_WIN32)
  gmtime_s(&utc, &now);
#else
  gmtime_r(&now, &utc);
#endif
  std::ostringstream output;
  output << std::put_time(&utc, "%Y-%m-%dT%H:%M:%SZ");
  return output.str();
}

std::string compiler_name() {
#if defined(__clang__)
  return std::string("Clang ") + __clang_version__;
#elif defined(__GNUC__)
  return std::string("GCC ") + __VERSION__;
#elif defined(_MSC_VER)
  return "MSVC " + std::to_string(_MSC_VER);
#else
  return "unknown";
#endif
}

std::string platform_name() {
#if defined(__linux__)
  return "linux";
#elif defined(__APPLE__)
  return "macos";
#elif defined(_WIN32)
  return "windows";
#else
  return "unknown";
#endif
}

}  // namespace

Distribution summarize(const std::vector<double>& samples) {
  Distribution result;
  result.samples = samples.size();
  if (samples.empty()) {
    return result;
  }

  std::vector<double> sorted = samples;
  std::ranges::sort(sorted);
  result.total = std::accumulate(sorted.begin(), sorted.end(), 0.0);
  result.min = sorted.front();
  result.mean = result.total / static_cast<double>(sorted.size());
  result.p50 = percentile(sorted, 0.50);
  result.p90 = percentile(sorted, 0.90);
  result.p95 = percentile(sorted, 0.95);
  result.p99 = percentile(sorted, 0.99);
  result.max = sorted.back();

  double squared_difference_sum = 0.0;
  for (const double sample : sorted) {
    const double difference = sample - result.mean;
    squared_difference_sum += difference * difference;
  }
  result.standard_deviation = std::sqrt(squared_difference_sum / static_cast<double>(sorted.size()));
  return result;
}

Environment get_environment() {
  return Environment{.timestamp_utc = utc_timestamp(),
                     .git_commit = HOSHIDICTS_BENCHMARK_GIT_COMMIT,
                     .git_dirty = HOSHIDICTS_BENCHMARK_GIT_DIRTY != 0,
#ifdef NDEBUG
                     .build_type = "release",
#else
                     .build_type = "debug",
#endif
                     .compiler = compiler_name(),
                     .platform = platform_name(),
                     .hardware_threads = std::thread::hardware_concurrency()};
}

double elapsed_ms(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

uint64_t directory_size(const std::filesystem::path& path) {
  std::error_code error;
  uint64_t total = 0;
  std::filesystem::recursive_directory_iterator iterator(
      path, std::filesystem::directory_options::skip_permission_denied, error);
  const std::filesystem::recursive_directory_iterator end;
  while (iterator != end) {
    if (iterator->is_regular_file(error)) {
      total += iterator->file_size(error);
    }
    if (error) {
      break;
    }
    iterator.increment(error);
    if (error) {
      break;
    }
  }
  if (error) {
    throw std::filesystem::filesystem_error("failed to measure directory", path, error);
  }
  return total;
}

uint64_t parse_count(std::string_view value, std::string_view name, bool allow_zero) {
  uint64_t parsed = 0;
  const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), parsed);
  if (error != std::errc{} || end != value.data() + value.size() || (!allow_zero && parsed == 0)) {
    throw std::invalid_argument(std::string(name) + " must be " + (allow_zero ? "a non-negative" : "a positive") +
                                " integer");
  }
  return parsed;
}

int parse_positive_int(std::string_view value, std::string_view name) {
  const uint64_t parsed = parse_count(value, name);
  if (parsed > static_cast<uint64_t>(std::numeric_limits<int>::max())) {
    throw std::invalid_argument(std::string(name) + " is too large");
  }
  return static_cast<int>(parsed);
}

std::string format_bytes(double bytes) {
  constexpr double kib = 1024.0;
  constexpr double mib = kib * 1024.0;
  constexpr double gib = mib * 1024.0;

  std::ostringstream output;
  output << std::fixed << std::setprecision(2);
  if (bytes >= gib) {
    output << bytes / gib << " GiB";
  } else if (bytes >= mib) {
    output << bytes / mib << " MiB";
  } else if (bytes >= kib) {
    output << bytes / kib << " KiB";
  } else {
    output << bytes << " B";
  }
  return output.str();
}

std::string format_duration(double milliseconds) {
  std::ostringstream output;
  output << std::fixed;
  if (milliseconds < 1.0) {
    output << std::setprecision(2) << milliseconds * 1000.0 << " us";
  } else if (milliseconds < 1000.0) {
    output << std::setprecision(3) << milliseconds << " ms";
  } else {
    output << std::setprecision(3) << milliseconds / 1000.0 << " s";
  }
  return output.str();
}

std::string unique_suffix() {
  const auto ticks = Clock::now().time_since_epoch().count();
  std::random_device random;
  std::ostringstream output;
  output << std::hex << ticks << '-' << random();
  return output.str();
}

void emit_report(std::string_view human, std::string_view json, const std::optional<std::filesystem::path>& json_path) {
  if (!json_path) {
    std::cout << human;
    return;
  }
  if (*json_path == "-") {
    std::cout << json;
    return;
  }

  std::ofstream output(*json_path, std::ios::binary);
  if (!output) {
    throw std::runtime_error("could not open JSON output: " + json_path->string());
  }
  output << json;
  if (!output) {
    throw std::runtime_error("could not write JSON output: " + json_path->string());
  }
  std::cout << human << "json: " << json_path->string() << '\n';
}

RssSampler::RssSampler(bool enabled) : enabled_(enabled) {}

RssSampler::~RssSampler() {
  if (started_) {
    finish();
  }
}

void RssSampler::start() {
  if (!enabled_ || started_) {
    return;
  }
  started_ = true;
  baseline_ = current_rss_bytes();
  peak_.store(baseline_, std::memory_order_relaxed);
  running_.store(true, std::memory_order_relaxed);
  worker_ = std::thread([this]() {
    while (running_.load(std::memory_order_relaxed)) {
      observe();
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    observe();
  });
}

MemorySample RssSampler::finish() {
  if (!enabled_ || !started_) {
    return {};
  }
  running_.store(false, std::memory_order_relaxed);
  if (worker_.joinable()) {
    worker_.join();
  }
  observe();
  started_ = false;

  const uint64_t peak = peak_.load(std::memory_order_relaxed);
  return MemorySample{.available = baseline_ != 0 && peak != 0,
                      .baseline_rss_bytes = baseline_,
                      .peak_rss_bytes = peak,
                      .peak_rss_delta_bytes = peak >= baseline_ ? peak - baseline_ : 0};
}

void RssSampler::observe() {
  const uint64_t current = current_rss_bytes();
  uint64_t peak = peak_.load(std::memory_order_relaxed);
  while (current > peak && !peak_.compare_exchange_weak(peak, current, std::memory_order_relaxed)) {
  }
}

}  // namespace hd_benchmark
