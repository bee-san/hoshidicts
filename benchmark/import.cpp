#include <cstdint>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "common.hpp"
#include "hoshidicts/importer.hpp"

namespace {

constexpr int report_schema_version = 1;

enum class ImportMode { normal, low_ram };

struct Options {
  std::vector<std::filesystem::path> archives;
  size_t iterations = 0;
  size_t warmup_iterations = 0;
  std::string mode = "normal";
  std::optional<std::filesystem::path> output_base;
  bool keep_output = false;
  bool measure_memory = false;
  std::optional<std::filesystem::path> json_path;
};

struct ImportConfig {
  std::vector<std::string> archives;
  uint64_t iterations = 0;
  uint64_t warmup_iterations = 0;
  std::string mode;
  bool measure_memory = false;
  bool keep_output = false;
  std::string kept_output_root;
};

struct ImportCaseResult {
  std::string archive;
  std::string dictionary_title;
  std::string dictionary_revision;
  std::string mode;
  uint64_t input_bytes = 0;
  hd_benchmark::Distribution output_bytes;
  double output_to_input_ratio = 0.0;
  uint64_t term_count = 0;
  uint64_t term_meta_count = 0;
  uint64_t kanji_count = 0;
  uint64_t kanji_meta_count = 0;
  uint64_t tag_count = 0;
  uint64_t media_count = 0;
  hd_benchmark::Distribution duration_ms;
  double imports_per_second = 0.0;
  double input_mib_per_second = 0.0;
  bool memory_samples_available = false;
  hd_benchmark::Distribution baseline_rss_bytes;
  hd_benchmark::Distribution peak_rss_bytes;
  hd_benchmark::Distribution peak_rss_delta_bytes;
};

struct ImportReport {
  int schema_version = report_schema_version;
  std::string benchmark = "import";
  hd_benchmark::Environment environment;
  ImportConfig config;
  std::vector<ImportCaseResult> cases;
};

struct RunResult {
  double duration_ms = 0.0;
  double output_bytes = 0.0;
  hd_benchmark::MemorySample memory;
  ImportResult imported;
};

class Workspace {
 public:
  Workspace(const std::optional<std::filesystem::path>& output_base, bool keep) : keep_(keep) {
    const std::filesystem::path base = output_base.value_or(std::filesystem::temp_directory_path());
    std::filesystem::create_directories(base);
    root_ = base / ("hoshidicts-benchmark-" + hd_benchmark::unique_suffix());
    if (!std::filesystem::create_directory(root_)) {
      throw std::runtime_error("could not create benchmark workspace: " + root_.string());
    }
  }

  ~Workspace() {
    if (!keep_) {
      std::error_code ignored;
      std::filesystem::remove_all(root_, ignored);
    }
  }

  Workspace(const Workspace&) = delete;
  Workspace& operator=(const Workspace&) = delete;

  const std::filesystem::path& root() const { return root_; }

 private:
  std::filesystem::path root_;
  bool keep_;
};

void print_usage(const char* program, std::ostream& output) {
  output << "Usage:\n"
         << "  " << program
         << " <zip_path> <iterations> [--archive <zip_path>]...\n"
            "      [--mode normal|low-ram|both] [--warmup <iterations>]\n"
            "      [--measure-memory] [--output-dir <path>] [--keep-output]\n"
            "      [--json <path|->]\n\n"
            "Each import runs in a unique directory. Outputs are removed after they are\n"
            "measured unless --keep-output is supplied.\n";
}

Options parse_options(int argc, char** argv) {
  if (argc < 3) {
    throw std::invalid_argument("missing dictionary archive or iteration count");
  }

  Options options;
  options.archives.emplace_back(argv[1]);
  options.iterations = hd_benchmark::parse_count(argv[2], "iterations");

  for (int i = 3; i < argc; ++i) {
    const std::string_view argument = argv[i];
    const auto next_value = [&](std::string_view name) -> std::string_view {
      if (++i >= argc) {
        throw std::invalid_argument(std::string(name) + " requires a value");
      }
      return argv[i];
    };

    if (argument == "--archive") {
      options.archives.emplace_back(next_value(argument));
    } else if (argument == "--mode") {
      options.mode = std::string(next_value(argument));
      if (options.mode != "normal" && options.mode != "low-ram" && options.mode != "both") {
        throw std::invalid_argument("--mode must be normal, low-ram, or both");
      }
    } else if (argument == "--warmup") {
      options.warmup_iterations = hd_benchmark::parse_count(next_value(argument), "warmup iterations", true);
    } else if (argument == "--measure-memory") {
      options.measure_memory = true;
    } else if (argument == "--output-dir") {
      options.output_base = std::filesystem::path(next_value(argument));
    } else if (argument == "--keep-output") {
      options.keep_output = true;
    } else if (argument == "--json") {
      options.json_path = std::filesystem::path(next_value(argument));
    } else {
      throw std::invalid_argument("unknown option: " + std::string(argument));
    }
  }
  return options;
}

std::string mode_name(ImportMode mode) { return mode == ImportMode::normal ? "normal" : "low-ram"; }

std::vector<ImportMode> selected_modes(const Options& options) {
  if (options.mode == "normal") {
    return {ImportMode::normal};
  }
  if (options.mode == "low-ram") {
    return {ImportMode::low_ram};
  }
  return {ImportMode::normal, ImportMode::low_ram};
}

uint64_t sum_counts(const SummaryMetaCount& counts) {
  return std::accumulate(counts.begin(), counts.end(), uint64_t{0},
                         [](uint64_t total, const auto& item) { return total + item.second; });
}

void remove_output(const std::filesystem::path& path) {
  std::error_code error;
  std::filesystem::remove_all(path, error);
  if (error) {
    throw std::filesystem::filesystem_error("failed to remove benchmark output", path, error);
  }
}

RunResult run_import(const std::filesystem::path& archive, ImportMode mode, const std::filesystem::path& run_directory,
                     bool measure_memory, bool keep_output) {
  std::filesystem::create_directories(run_directory);

  hd_benchmark::RssSampler memory(measure_memory);
  memory.start();
  const auto start = hd_benchmark::Clock::now();
  ImportResult imported =
      dictionary_importer::import(archive.string(), run_directory.string(), mode == ImportMode::low_ram);
  const auto end = hd_benchmark::Clock::now();
  const auto memory_sample = memory.finish();

  if (!imported.success) {
    if (!keep_output) {
      remove_output(run_directory);
    }
    throw std::runtime_error("import failed for " + archive.string() + " (" + mode_name(mode) + "): " + imported.error +
                             "; output directory: " + run_directory.string());
  }

  const uint64_t output_bytes = hd_benchmark::directory_size(run_directory);
  if (!keep_output) {
    remove_output(run_directory);
  }

  return RunResult{.duration_ms = hd_benchmark::elapsed_ms(start, end),
                   .output_bytes = static_cast<double>(output_bytes),
                   .memory = memory_sample,
                   .imported = std::move(imported)};
}

ImportCaseResult run_case(const Options& options, const std::filesystem::path& archive, ImportMode mode,
                          const std::filesystem::path& case_directory) {
  for (size_t warmup = 0; warmup < options.warmup_iterations; ++warmup) {
    const auto directory = case_directory / ("warmup-" + std::to_string(warmup + 1));
    run_import(archive, mode, directory, false, false);
  }

  std::vector<double> durations;
  std::vector<double> output_sizes;
  std::vector<double> baseline_rss;
  std::vector<double> peak_rss;
  std::vector<double> peak_rss_delta;
  durations.reserve(options.iterations);
  output_sizes.reserve(options.iterations);
  ImportResult representative;

  for (size_t iteration = 0; iteration < options.iterations; ++iteration) {
    const auto directory = case_directory / ("run-" + std::to_string(iteration + 1));
    RunResult run = run_import(archive, mode, directory, options.measure_memory, options.keep_output);
    durations.push_back(run.duration_ms);
    output_sizes.push_back(run.output_bytes);
    if (run.memory.available) {
      baseline_rss.push_back(static_cast<double>(run.memory.baseline_rss_bytes));
      peak_rss.push_back(static_cast<double>(run.memory.peak_rss_bytes));
      peak_rss_delta.push_back(static_cast<double>(run.memory.peak_rss_delta_bytes));
    }
    if (!representative.success) {
      representative = std::move(run.imported);
    }
  }

  const uint64_t input_bytes = std::filesystem::file_size(archive);
  const auto duration = hd_benchmark::summarize(durations);
  const auto output = hd_benchmark::summarize(output_sizes);
  const double input_mib = static_cast<double>(input_bytes) / (1024.0 * 1024.0);

  return ImportCaseResult{
      .archive = archive.string(),
      .dictionary_title = representative.title,
      .dictionary_revision = representative.summary.revision,
      .mode = mode_name(mode),
      .input_bytes = input_bytes,
      .output_bytes = output,
      .output_to_input_ratio = input_bytes > 0 ? output.mean / static_cast<double>(input_bytes) : 0.0,
      .term_count = representative.summary.counts.terms.total,
      .term_meta_count = sum_counts(representative.summary.counts.termMeta),
      .kanji_count = representative.summary.counts.kanji.total,
      .kanji_meta_count = sum_counts(representative.summary.counts.kanjiMeta),
      .tag_count = representative.summary.counts.tagMeta.total,
      .media_count = representative.summary.counts.media.total,
      .duration_ms = duration,
      .imports_per_second = duration.mean > 0.0 ? 1000.0 / duration.mean : 0.0,
      .input_mib_per_second = duration.mean > 0.0 ? input_mib / (duration.mean / 1000.0) : 0.0,
      .memory_samples_available = !peak_rss.empty(),
      .baseline_rss_bytes = hd_benchmark::summarize(baseline_rss),
      .peak_rss_bytes = hd_benchmark::summarize(peak_rss),
      .peak_rss_delta_bytes = hd_benchmark::summarize(peak_rss_delta)};
}

std::string human_report(const ImportReport& report) {
  std::ostringstream output;
  output << "Hoshidicts import benchmark\n"
         << "commit: " << report.environment.git_commit << (report.environment.git_dirty ? " (dirty)" : "")
         << "  build: " << report.environment.build_type << "  compiler: " << report.environment.compiler << '\n'
         << "measured imports: " << report.config.iterations
         << " per case  warmups: " << report.config.warmup_iterations << '\n';
  if (report.environment.build_type != "release") {
    output << "warning: benchmark results from a debug build are not representative\n";
  }

  for (const auto& result : report.cases) {
    output << "\n[" << result.dictionary_title << " / " << result.mode << "]\n"
           << "archive: " << result.archive << '\n'
           << "duration: mean " << hd_benchmark::format_duration(result.duration_ms.mean) << "  p50 "
           << hd_benchmark::format_duration(result.duration_ms.p50) << "  p95 "
           << hd_benchmark::format_duration(result.duration_ms.p95) << "  min "
           << hd_benchmark::format_duration(result.duration_ms.min) << '\n'
           << "throughput: " << std::fixed << std::setprecision(2) << result.input_mib_per_second << " MiB/s\n"
           << "size: " << hd_benchmark::format_bytes(static_cast<double>(result.input_bytes)) << " archive -> "
           << hd_benchmark::format_bytes(result.output_bytes.mean) << " output (" << result.output_to_input_ratio
           << "x)\n"
           << "content: " << result.term_count << " terms, " << result.term_meta_count << " term metadata, "
           << result.kanji_count << " kanji, " << result.kanji_meta_count << " kanji metadata, " << result.media_count
           << " media, " << result.tag_count << " tags\n";
    if (result.memory_samples_available) {
      output << "RSS: peak p50 " << hd_benchmark::format_bytes(result.peak_rss_bytes.p50) << "  p95 "
             << hd_benchmark::format_bytes(result.peak_rss_bytes.p95) << "  growth p50 "
             << hd_benchmark::format_bytes(result.peak_rss_delta_bytes.p50) << '\n';
    }
  }
  if (report.config.keep_output) {
    output << "\noutputs kept in: " << report.config.kept_output_root << '\n';
  }
  return output.str();
}

}  // namespace

int main(int argc, char** argv) {
  if (argc == 2 && std::string_view(argv[1]) == "--help") {
    print_usage(argv[0], std::cout);
    return 0;
  }

  try {
    const Options options = parse_options(argc, argv);
    for (const auto& archive : options.archives) {
      if (!std::filesystem::is_regular_file(archive)) {
        throw std::invalid_argument("dictionary archive is not a file: " + archive.string());
      }
    }

    Workspace workspace(options.output_base, options.keep_output);
    ImportReport report{
        .environment = hd_benchmark::get_environment(),
        .config = ImportConfig{.archives = {},
                               .iterations = options.iterations,
                               .warmup_iterations = options.warmup_iterations,
                               .mode = options.mode,
                               .measure_memory = options.measure_memory,
                               .keep_output = options.keep_output,
                               .kept_output_root = options.keep_output ? workspace.root().string() : ""},
        .cases = {}};
    report.config.archives.reserve(options.archives.size());
    for (const auto& archive : options.archives) {
      report.config.archives.push_back(archive.string());
    }

    const auto modes = selected_modes(options);
    for (size_t archive_index = 0; archive_index < options.archives.size(); ++archive_index) {
      for (const ImportMode mode : modes) {
        const auto case_directory =
            workspace.root() / ("archive-" + std::to_string(archive_index + 1) + "-" + mode_name(mode));
        report.cases.push_back(run_case(options, options.archives[archive_index], mode, case_directory));
      }
    }

    const std::string human = human_report(report);
    const std::string json = hd_benchmark::to_pretty_json(report);
    hd_benchmark::emit_report(human, json, options.json_path);
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "error: " << error.what() << "\n\n";
    print_usage(argv[0], std::cerr);
    return 1;
  }
}
