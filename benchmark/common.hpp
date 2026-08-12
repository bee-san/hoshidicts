#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <glaze/glaze.hpp>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

namespace hd_benchmark {

using Clock = std::chrono::steady_clock;

struct Distribution {
  uint64_t samples = 0;
  double total = 0.0;
  double min = 0.0;
  double mean = 0.0;
  double standard_deviation = 0.0;
  double p50 = 0.0;
  double p90 = 0.0;
  double p95 = 0.0;
  double p99 = 0.0;
  double max = 0.0;
};

struct Environment {
  std::string timestamp_utc;
  std::string git_commit;
  bool git_dirty = false;
  std::string build_type;
  std::string compiler;
  std::string platform;
  unsigned int hardware_threads = 0;
};

struct MemorySample {
  bool available = false;
  uint64_t baseline_rss_bytes = 0;
  uint64_t peak_rss_bytes = 0;
  uint64_t peak_rss_delta_bytes = 0;
};

Distribution summarize(const std::vector<double>& samples);
Environment get_environment();
double elapsed_ms(Clock::time_point start, Clock::time_point end);
uint64_t directory_size(const std::filesystem::path& path);
uint64_t parse_count(std::string_view value, std::string_view name, bool allow_zero = false);
int parse_positive_int(std::string_view value, std::string_view name);
std::string format_bytes(double bytes);
std::string format_duration(double milliseconds);
std::string unique_suffix();
void emit_report(std::string_view human, std::string_view json, const std::optional<std::filesystem::path>& json_path);

class RssSampler {
 public:
  explicit RssSampler(bool enabled);
  ~RssSampler();

  RssSampler(const RssSampler&) = delete;
  RssSampler& operator=(const RssSampler&) = delete;

  void start();
  MemorySample finish();

 private:
  void observe();

  bool enabled_;
  bool started_ = false;
  std::atomic<bool> running_ = false;
  std::atomic<uint64_t> peak_ = 0;
  uint64_t baseline_ = 0;
  std::thread worker_;
};

template <typename T>
std::string to_pretty_json(const T& value) {
  std::string json;
  const auto error = glz::write<glz::opts{.prettify = true}>(value, json);
  if (error) {
    throw std::runtime_error("failed to serialize benchmark report");
  }
  json.push_back('\n');
  return json;
}

}  // namespace hd_benchmark
