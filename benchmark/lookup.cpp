#include "hoshidicts/lookup.hpp"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <numeric>
#include <optional>
#include <random>
#include <ranges>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "common.hpp"
#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/query.hpp"

namespace {

constexpr int report_schema_version = 1;
std::atomic<uint64_t> benchmark_sink = 0;

enum class Operation { lookup, query };

struct CorpusEntry {
  std::string input;
  std::string label;
};

struct Options {
  std::filesystem::path corpus_path;
  size_t iterations = 0;
  size_t warmup_iterations = 1;
  size_t open_iterations = 3;
  int max_results = 16;
  size_t scan_length = 16;
  std::string operation = "lookup";
  bool scale_dictionaries = false;
  bool shuffle = false;
  uint64_t seed = 1;
  std::vector<std::string> term_paths;
  std::vector<std::string> frequency_paths;
  std::vector<std::string> pitch_paths;
  std::optional<std::filesystem::path> json_path;
};

struct LookupConfig {
  std::string corpus;
  uint64_t corpus_entries = 0;
  uint64_t iterations = 0;
  uint64_t warmup_iterations = 0;
  uint64_t dictionary_open_iterations = 0;
  int max_results = 0;
  uint64_t scan_length = 0;
  std::string operation;
  bool scale_dictionaries = false;
  bool shuffle = false;
  uint64_t seed = 0;
  std::vector<std::string> term_dictionaries;
  std::vector<std::string> frequency_dictionaries;
  std::vector<std::string> pitch_dictionaries;
};

struct GroupResult {
  std::string label;
  hd_benchmark::Distribution latency_ms;
  double operations_per_second = 0.0;
  uint64_t operations = 0;
  uint64_t hits = 0;
  double hit_rate = 0.0;
  uint64_t returned_results = 0;
};

struct ScenarioResult {
  std::string name;
  std::string operation;
  uint64_t term_dictionary_count = 0;
  hd_benchmark::Distribution dictionary_open_ms;
  double deinflector_initialization_ms = 0.0;
  double first_operation_ms = 0.0;
  uint64_t first_operation_results = 0;
  hd_benchmark::Distribution latency_ms;
  double operations_per_second = 0.0;
  uint64_t operations = 0;
  uint64_t hits = 0;
  double hit_rate = 0.0;
  uint64_t returned_results = 0;
  std::string checksum;
  std::vector<GroupResult> groups;
};

struct LookupReport {
  int schema_version = report_schema_version;
  std::string benchmark = "lookup";
  hd_benchmark::Environment environment;
  LookupConfig config;
  std::vector<ScenarioResult> scenarios;
};

struct Invocation {
  double duration_ms = 0.0;
  size_t result_count = 0;
  uint64_t checksum = 0;
};

struct Accumulator {
  std::vector<double> durations;
  uint64_t hits = 0;
  uint64_t returned_results = 0;
};

std::string trim(std::string value) {
  const auto is_space = [](unsigned char character) { return std::isspace(character) != 0; };
  const auto first = std::ranges::find_if_not(value, is_space);
  const auto last = std::ranges::find_if_not(value | std::views::reverse, is_space).base();
  if (first >= last) {
    return {};
  }
  return std::string(first, last);
}

std::string lowercase_ascii(std::string value) {
  std::ranges::transform(value, value.begin(),
                         [](unsigned char character) { return static_cast<char>(std::tolower(character)); });
  return value;
}

std::vector<std::string> parse_csv_row(const std::string& row, size_t line_number) {
  std::vector<std::string> fields;
  std::string field;
  bool quoted = false;

  for (size_t i = 0; i < row.size(); ++i) {
    const char character = row[i];
    if (character == '"') {
      if (quoted && i + 1 < row.size() && row[i + 1] == '"') {
        field.push_back('"');
        ++i;
      } else {
        quoted = !quoted;
      }
    } else if (character == ',' && !quoted) {
      fields.push_back(std::move(field));
      field.clear();
    } else {
      field.push_back(character);
    }
  }
  if (quoted) {
    throw std::runtime_error("unterminated quoted field on corpus line " + std::to_string(line_number));
  }
  fields.push_back(std::move(field));
  return fields;
}

bool is_input_header(const std::string& value) {
  const std::string header = lowercase_ascii(trim(value));
  return header == "input" || header == "word" || header == "term" || header == "text" || header == "expression";
}

bool is_label_header(const std::string& value) {
  const std::string header = lowercase_ascii(trim(value));
  return header == "label" || header == "scenario" || header == "category";
}

std::vector<CorpusEntry> read_corpus(const std::filesystem::path& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) {
    throw std::runtime_error("could not open corpus: " + path.string());
  }

  std::vector<CorpusEntry> entries;
  std::string line;
  size_t line_number = 0;
  bool first_record = true;
  bool labels_enabled = false;
  while (std::getline(file, line)) {
    ++line_number;
    if (line.ends_with('\r')) {
      line.pop_back();
    }
    if (line_number == 1 && line.starts_with("\xEF\xBB\xBF")) {
      line.erase(0, 3);
    }

    const std::string stripped = trim(line);
    if (stripped.empty() || stripped.starts_with('#')) {
      continue;
    }

    auto fields = parse_csv_row(line, line_number);
    if (first_record) {
      first_record = false;
      if (is_input_header(fields.front())) {
        labels_enabled = fields.size() > 1 && is_label_header(fields[1]);
        continue;
      }
    }

    std::string input = trim(fields.front());
    if (input.empty()) {
      continue;
    }
    std::string label = "all";
    if (labels_enabled && fields.size() > 1) {
      label = trim(fields[1]);
      if (label.empty()) {
        label = "unlabeled";
      }
    }
    entries.push_back(CorpusEntry{.input = std::move(input), .label = std::move(label)});
  }

  if (entries.empty()) {
    throw std::runtime_error("corpus contains no benchmark inputs: " + path.string());
  }
  return entries;
}

void print_usage(const char* program, std::ostream& output) {
  output << "Usage:\n"
         << "  " << program
         << " <csv_path> <iterations> --term <dict_path>...\n"
            "      [--freq <dict_path>...] [--pitch <dict_path>...]\n"
            "      [--operation lookup|query|both] [--warmup <iterations>]\n"
            "      [--open-iterations <iterations>] [--max-results <count>]\n"
            "      [--scan-length <characters>] [--scale-dictionaries]\n"
            "      [--shuffle] [--seed <integer>] [--json <path|->]\n\n"
            "The first CSV column is the lookup input. A second column is grouped in the\n"
            "report when the header is label, scenario, or category.\n";
}

Options parse_options(int argc, char** argv) {
  if (argc < 3) {
    throw std::invalid_argument("missing corpus path or iteration count");
  }

  Options options;
  options.corpus_path = argv[1];
  options.iterations = hd_benchmark::parse_count(argv[2], "iterations");

  enum class DictionarySection { term, frequency, pitch };
  DictionarySection section = DictionarySection::term;

  for (int i = 3; i < argc; ++i) {
    const std::string_view argument = argv[i];
    const auto next_value = [&](std::string_view name) -> std::string_view {
      if (++i >= argc) {
        throw std::invalid_argument(std::string(name) + " requires a value");
      }
      return argv[i];
    };

    if (argument == "--term") {
      section = DictionarySection::term;
    } else if (argument == "--freq") {
      section = DictionarySection::frequency;
    } else if (argument == "--pitch") {
      section = DictionarySection::pitch;
    } else if (argument == "--operation") {
      options.operation = std::string(next_value(argument));
      if (options.operation != "lookup" && options.operation != "query" && options.operation != "both") {
        throw std::invalid_argument("--operation must be lookup, query, or both");
      }
    } else if (argument == "--warmup") {
      options.warmup_iterations = hd_benchmark::parse_count(next_value(argument), "warmup iterations", true);
    } else if (argument == "--open-iterations") {
      options.open_iterations = hd_benchmark::parse_count(next_value(argument), "dictionary open iterations");
    } else if (argument == "--max-results") {
      options.max_results = hd_benchmark::parse_positive_int(next_value(argument), "max results");
    } else if (argument == "--scan-length") {
      options.scan_length = hd_benchmark::parse_count(next_value(argument), "scan length");
    } else if (argument == "--scale-dictionaries") {
      options.scale_dictionaries = true;
    } else if (argument == "--shuffle") {
      options.shuffle = true;
    } else if (argument == "--seed") {
      options.seed = hd_benchmark::parse_count(next_value(argument), "seed", true);
    } else if (argument == "--json") {
      options.json_path = std::filesystem::path(next_value(argument));
    } else if (argument.starts_with("--")) {
      throw std::invalid_argument("unknown option: " + std::string(argument));
    } else {
      switch (section) {
        case DictionarySection::term:
          options.term_paths.emplace_back(argument);
          break;
        case DictionarySection::frequency:
          options.frequency_paths.emplace_back(argument);
          break;
        case DictionarySection::pitch:
          options.pitch_paths.emplace_back(argument);
          break;
      }
    }
  }

  if (options.term_paths.empty()) {
    throw std::invalid_argument("at least one --term dictionary is required");
  }
  return options;
}

void validate_dictionary(const std::string& path) {
  const std::filesystem::path dictionary(path);
  if (!std::filesystem::is_directory(dictionary)) {
    throw std::invalid_argument("dictionary path is not a directory: " + path);
  }
  if (!std::filesystem::is_regular_file(dictionary / "index.json")) {
    throw std::invalid_argument("dictionary has no index.json: " + path);
  }
  for (const std::string_view required_file : {"blobs.bin", "hash.table", "bloom.filter"}) {
    if (!std::filesystem::is_regular_file(dictionary / required_file)) {
      throw std::invalid_argument("dictionary has no " + std::string(required_file) + ": " + path);
    }
  }

  bool supported_marker = false;
  for (int version = 1; version <= 4; ++version) {
    supported_marker |= std::filesystem::is_regular_file(dictionary / (".hoshidicts_" + std::to_string(version)));
  }
  if (!supported_marker) {
    throw std::invalid_argument("dictionary does not use a supported hoshidicts format: " + path);
  }
}

std::unique_ptr<DictionaryQuery> open_query(const Options& options, size_t term_dictionary_count) {
  auto query = std::make_unique<DictionaryQuery>();
  for (size_t i = 0; i < term_dictionary_count; ++i) {
    query->add_term_dict(options.term_paths[i]);
  }
  for (const auto& path : options.frequency_paths) {
    query->add_freq_dict(path);
  }
  for (const auto& path : options.pitch_paths) {
    query->add_pitch_dict(path);
  }
  return query;
}

uint64_t checksum_terms(const std::vector<TermResult>& results) {
  uint64_t checksum = results.size();
  for (const auto& result : results) {
    checksum = checksum * 131 + result.expression.size();
    checksum = checksum * 131 + result.reading.size();
    checksum = checksum * 131 + result.glossaries.size();
    checksum = checksum * 131 + result.frequencies.size();
    checksum = checksum * 131 + result.pitches.size();
  }
  return checksum;
}

uint64_t checksum_lookups(const std::vector<LookupResult>& results) {
  uint64_t checksum = results.size();
  for (const auto& result : results) {
    checksum = checksum * 131 + result.matched.size();
    checksum = checksum * 131 + result.deinflected.size();
    checksum = checksum * 131 + result.trace.size();
    checksum = checksum * 131 + result.term.expression.size();
    checksum = checksum * 131 + result.term.glossaries.size();
  }
  return checksum;
}

std::string checksum_string(uint64_t checksum) {
  std::ostringstream output;
  output << "0x" << std::hex << std::setfill('0') << std::setw(16) << checksum;
  return output.str();
}

Invocation invoke(Operation operation, DictionaryQuery& query, Lookup* lookup, const std::string& input,
                  int max_results, size_t scan_length) {
  if (operation == Operation::query) {
    const auto start = hd_benchmark::Clock::now();
    const auto results = query.query(input);
    const auto end = hd_benchmark::Clock::now();
    return Invocation{.duration_ms = hd_benchmark::elapsed_ms(start, end),
                      .result_count = results.size(),
                      .checksum = checksum_terms(results)};
  }

  const auto start = hd_benchmark::Clock::now();
  const auto results = lookup->lookup(input, max_results, scan_length);
  const auto end = hd_benchmark::Clock::now();
  return Invocation{.duration_ms = hd_benchmark::elapsed_ms(start, end),
                    .result_count = results.size(),
                    .checksum = checksum_lookups(results)};
}

GroupResult finish_group(const std::string& label, const Accumulator& accumulator) {
  const auto latency = hd_benchmark::summarize(accumulator.durations);
  const uint64_t operations = accumulator.durations.size();
  return GroupResult{.label = label,
                     .latency_ms = latency,
                     .operations_per_second = latency.mean > 0.0 ? 1000.0 / latency.mean : 0.0,
                     .operations = operations,
                     .hits = accumulator.hits,
                     .hit_rate = operations > 0 ? static_cast<double>(accumulator.hits) / operations : 0.0,
                     .returned_results = accumulator.returned_results};
}

ScenarioResult run_scenario(const Options& options, const std::vector<CorpusEntry>& corpus, Operation operation,
                            size_t term_dictionary_count, uint64_t scenario_seed) {
  if (options.iterations > std::numeric_limits<size_t>::max() / corpus.size()) {
    throw std::invalid_argument("iterations and corpus size exceed the supported operation count");
  }

  std::vector<double> open_durations;
  open_durations.reserve(options.open_iterations);
  std::unique_ptr<DictionaryQuery> query;
  for (size_t i = 0; i < options.open_iterations; ++i) {
    const auto start = hd_benchmark::Clock::now();
    auto candidate = open_query(options, term_dictionary_count);
    const auto end = hd_benchmark::Clock::now();
    open_durations.push_back(hd_benchmark::elapsed_ms(start, end));
    if (i + 1 == options.open_iterations) {
      query = std::move(candidate);
    }
  }

  std::optional<Deinflector> deinflector;
  std::optional<Lookup> lookup;
  double deinflector_initialization_ms = 0.0;
  if (operation == Operation::lookup) {
    const auto start = hd_benchmark::Clock::now();
    deinflector.emplace();
    const auto end = hd_benchmark::Clock::now();
    deinflector_initialization_ms = hd_benchmark::elapsed_ms(start, end);
    lookup.emplace(*query, *deinflector);
  }

  const Invocation first = invoke(operation, *query, lookup ? &*lookup : nullptr, corpus.front().input,
                                  options.max_results, options.scan_length);
  benchmark_sink.fetch_xor(first.checksum, std::memory_order_relaxed);

  for (size_t warmup = 0; warmup < options.warmup_iterations; ++warmup) {
    for (const auto& entry : corpus) {
      const Invocation result =
          invoke(operation, *query, lookup ? &*lookup : nullptr, entry.input, options.max_results, options.scan_length);
      benchmark_sink.fetch_xor(result.checksum, std::memory_order_relaxed);
    }
  }

  const size_t total_operations = options.iterations * corpus.size();
  std::vector<double> durations;
  durations.reserve(total_operations);
  std::map<std::string, Accumulator> groups;
  std::vector<size_t> order(corpus.size());
  std::iota(order.begin(), order.end(), 0);
  std::mt19937_64 random(scenario_seed);
  uint64_t hits = 0;
  uint64_t returned_results = 0;
  uint64_t checksum = 0;

  for (size_t iteration = 0; iteration < options.iterations; ++iteration) {
    if (options.shuffle) {
      std::ranges::shuffle(order, random);
    }
    for (const size_t index : order) {
      const auto& entry = corpus[index];
      const Invocation result =
          invoke(operation, *query, lookup ? &*lookup : nullptr, entry.input, options.max_results, options.scan_length);
      durations.push_back(result.duration_ms);
      hits += result.result_count > 0 ? 1 : 0;
      returned_results += result.result_count;
      checksum = checksum * 131 + result.checksum;

      auto& group = groups[entry.label];
      group.durations.push_back(result.duration_ms);
      group.hits += result.result_count > 0 ? 1 : 0;
      group.returned_results += result.result_count;
    }
  }
  benchmark_sink.fetch_xor(checksum, std::memory_order_relaxed);

  const auto latency = hd_benchmark::summarize(durations);
  std::vector<GroupResult> group_results;
  group_results.reserve(groups.size());
  for (const auto& [label, accumulator] : groups) {
    group_results.push_back(finish_group(label, accumulator));
  }

  const std::string operation_name = operation == Operation::lookup ? "lookup" : "query";
  return ScenarioResult{.name = operation_name + "/" + std::to_string(term_dictionary_count) + "-term-" +
                                (term_dictionary_count == 1 ? "dictionary" : "dictionaries"),
                        .operation = operation_name,
                        .term_dictionary_count = term_dictionary_count,
                        .dictionary_open_ms = hd_benchmark::summarize(open_durations),
                        .deinflector_initialization_ms = deinflector_initialization_ms,
                        .first_operation_ms = first.duration_ms,
                        .first_operation_results = first.result_count,
                        .latency_ms = latency,
                        .operations_per_second = latency.mean > 0.0 ? 1000.0 / latency.mean : 0.0,
                        .operations = durations.size(),
                        .hits = hits,
                        .hit_rate = durations.empty() ? 0.0 : static_cast<double>(hits) / durations.size(),
                        .returned_results = returned_results,
                        .checksum = checksum_string(checksum),
                        .groups = std::move(group_results)};
}

std::string human_report(const LookupReport& report) {
  std::ostringstream output;
  output << "Hoshidicts lookup benchmark\n"
         << "commit: " << report.environment.git_commit << (report.environment.git_dirty ? " (dirty)" : "")
         << "  build: " << report.environment.build_type << "  compiler: " << report.environment.compiler << '\n'
         << "corpus: " << report.config.corpus << " (" << report.config.corpus_entries << " inputs)\n"
         << "passes: " << report.config.iterations << " measured  " << report.config.warmup_iterations << " warmup\n";
  if (report.environment.build_type != "release") {
    output << "warning: benchmark results from a debug build are not representative\n";
  }

  for (const auto& scenario : report.scenarios) {
    output << "\n[" << scenario.name << "]\n"
           << "dictionary open: p50 " << hd_benchmark::format_duration(scenario.dictionary_open_ms.p50) << "  p95 "
           << hd_benchmark::format_duration(scenario.dictionary_open_ms.p95) << "  ("
           << scenario.dictionary_open_ms.samples << " samples)\n";
    if (scenario.operation == "lookup") {
      output << "deinflector init: " << hd_benchmark::format_duration(scenario.deinflector_initialization_ms) << '\n';
    }
    output << "first operation: " << hd_benchmark::format_duration(scenario.first_operation_ms) << "  ("
           << scenario.first_operation_results << " results)\n"
           << "steady latency: mean " << hd_benchmark::format_duration(scenario.latency_ms.mean) << "  p50 "
           << hd_benchmark::format_duration(scenario.latency_ms.p50) << "  p95 "
           << hd_benchmark::format_duration(scenario.latency_ms.p95) << "  p99 "
           << hd_benchmark::format_duration(scenario.latency_ms.p99) << '\n'
           << "throughput: " << std::fixed << std::setprecision(0) << scenario.operations_per_second
           << " operations/s  hits: " << scenario.hits << '/' << scenario.operations << " (" << std::setprecision(1)
           << scenario.hit_rate * 100.0 << "%)  results: " << scenario.returned_results << '\n';

    if (scenario.groups.size() > 1) {
      output << "groups:\n";
      for (const auto& group : scenario.groups) {
        output << "  " << group.label << ": p50 " << hd_benchmark::format_duration(group.latency_ms.p50) << "  p95 "
               << hd_benchmark::format_duration(group.latency_ms.p95) << "  hits " << group.hits << '/'
               << group.operations << '\n';
      }
    }
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
    for (const auto& path : options.term_paths) {
      validate_dictionary(path);
    }
    for (const auto& path : options.frequency_paths) {
      validate_dictionary(path);
    }
    for (const auto& path : options.pitch_paths) {
      validate_dictionary(path);
    }
    const auto corpus = read_corpus(options.corpus_path);

    LookupReport report{.environment = hd_benchmark::get_environment(),
                        .config = LookupConfig{.corpus = options.corpus_path.string(),
                                               .corpus_entries = corpus.size(),
                                               .iterations = options.iterations,
                                               .warmup_iterations = options.warmup_iterations,
                                               .dictionary_open_iterations = options.open_iterations,
                                               .max_results = options.max_results,
                                               .scan_length = options.scan_length,
                                               .operation = options.operation,
                                               .scale_dictionaries = options.scale_dictionaries,
                                               .shuffle = options.shuffle,
                                               .seed = options.seed,
                                               .term_dictionaries = options.term_paths,
                                               .frequency_dictionaries = options.frequency_paths,
                                               .pitch_dictionaries = options.pitch_paths},
                        .scenarios = {}};

    std::vector<Operation> operations;
    if (options.operation == "lookup" || options.operation == "both") {
      operations.push_back(Operation::lookup);
    }
    if (options.operation == "query" || options.operation == "both") {
      operations.push_back(Operation::query);
    }

    const size_t first_dictionary_count = options.scale_dictionaries ? 1 : options.term_paths.size();
    for (const Operation operation : operations) {
      for (size_t count = first_dictionary_count; count <= options.term_paths.size(); ++count) {
        report.scenarios.push_back(run_scenario(options, corpus, operation, count, options.seed));
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
