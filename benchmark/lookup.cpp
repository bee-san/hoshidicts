#include "hoshidicts/lookup.hpp"

#include <algorithm>
#include <chrono>
#include <format>
#include <fstream>
#include <iostream>
#include <numeric>
#include <optional>
#include <stdexcept>
#include <string_view>
#include <vector>
#include <glaze/glaze.hpp>

#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/query.hpp"

#ifndef HOSHIDICTS_LANGUAGES_DIR
#define HOSHIDICTS_LANGUAGES_DIR "languages"
#endif

struct LookupBenchmark {
  size_t words;
  size_t result_count = 0;
  size_t glossary_count = 0;
  std::vector<std::vector<double>> passes;
  std::vector<PageCacheStatistics> cache;
};

namespace {
std::vector<std::string> read_word_list(const std::string& path) {
  std::vector<std::string> words;
  std::ifstream file(path);
  std::string line;
  while (std::getline(file, line)) {
    if (line.ends_with('\r')) {
      line.pop_back();
    }
    std::string word(line, 0, line.find(','));
    if (!word.empty() && word != "Word") {
      words.push_back(std::move(word));
    }
  }
  return words;
}
}

int main(int argc, char** argv) {
  if (argc < 5) {
    std::cout << std::format(
        "{} <csv_path> <iterations> --term <dict_path>... [--freq <dict_path>...] [--pitch <dict_path>...] [--kanji <dict_path>...] [--paged-entries] [--paged-index] [--metadata-only-terms] [--language <code>] [--languages <dir>] [--json]\n"
        "--language defaults to ja (the built-in pack); --languages defaults to {}\n",
        argv[0], HOSHIDICTS_LANGUAGES_DIR);
    return 1;
  }

  const std::string csv_path = argv[1];
  const int iterations = std::stoi(argv[2]);
  const std::vector<std::string> words = read_word_list(csv_path);

  std::vector<std::string> term_paths;
  std::vector<std::string> freq_paths;
  std::vector<std::string> pitch_paths;
  std::vector<std::string> kanji_paths;
  DictionaryStorage storage = DictionaryStorage::Mapped;
  DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped;
  bool json = false;
  LookupOptions options;
  // Without --language, Lookup(query, deinflector) on the built-in Japanese
  // pack, the constructor existing callers use; with it, the pack of that
  // code from a registry (docs/languages.md 10.3 and 13).
  std::optional<std::string> language;
  std::string languages_dir = HOSHIDICTS_LANGUAGES_DIR;
  std::vector<std::string>* current = &term_paths;
  for (int i = 3; i < argc; ++i) {
    const std::string_view arg = argv[i];
    if (arg == "--term") {
      current = &term_paths;
    } else if (arg == "--freq") {
      current = &freq_paths;
    } else if (arg == "--pitch") {
      current = &pitch_paths;
    } else if (arg == "--kanji") {
      current = &kanji_paths;
    } else if (arg == "--paged-entries") {
      storage = DictionaryStorage::Paged;
    } else if (arg == "--paged-index") {
      index_storage = DictionaryIndexStorage::Paged;
    } else if (arg == "--metadata-only-terms") {
      options.metadata_only_terms = true;
    } else if (arg == "--json") {
      json = true;
    } else if (arg == "--language" && i + 1 < argc) {
      language = argv[++i];
    } else if (arg == "--languages" && i + 1 < argc) {
      languages_dir = argv[++i];
    } else {
      current->emplace_back(arg);
    }
  }

  DictionaryQuery query;
  for (const auto& path : term_paths) {
    if (!query.add_term_dict(path, storage, index_storage)) throw std::runtime_error(query.last_error());
  }
  for (const auto& path : freq_paths) {
    if (!query.add_freq_dict(path, storage, index_storage)) throw std::runtime_error(query.last_error());
  }
  for (const auto& path : pitch_paths) {
    if (!query.add_pitch_dict(path, storage, index_storage)) throw std::runtime_error(query.last_error());
  }
  for (const auto& path : kanji_paths) {
    if (!query.add_kanji_dict(path, storage, index_storage)) throw std::runtime_error(query.last_error());
  }

  Deinflector deinflector;
  auto registry = hoshidicts::LanguageRegistry::with_builtin();
  if (language && *language != "ja") {
    std::string error;
    registry.add_directory(languages_dir, &error);
    if (!registry.find(*language)) {
      std::cerr << std::format("no language pack {} in {}{}{}\n", *language, languages_dir, error.empty() ? "" : ": ", error);
      return 1;
    }
    options.language = *language;
  }
  Lookup lookup = language ? Lookup(query, registry) : Lookup(query, deinflector);

  std::vector<double> durations;
  LookupBenchmark report{.words = words.size()};
  durations.reserve(static_cast<size_t>(iterations) * words.size());
  for (int i = 0; i < iterations; ++i) {
    auto& pass = report.passes.emplace_back();
    for (const auto& word : words) {
      const auto start = std::chrono::steady_clock::now();
      const auto results = lookup.lookup(word, 16, 16, options);
      const auto end = std::chrono::steady_clock::now();

      const std::chrono::duration<double, std::milli> elapsed = end - start;
      durations.push_back(elapsed.count());
      pass.push_back(elapsed.count());
      report.result_count += results.size();
      for (const auto& result : results) report.glossary_count += result.term.glossaries.size();
    }
    report.cache.push_back(query.page_cache_statistics());
  }

  if (durations.empty()) {
    return 1;
  }
  if (json) {
    std::cout << glz::write_json(report).value() << '\n';
    return 0;
  }

  const auto [min, max] = std::ranges::minmax_element(durations);
  const double total = std::accumulate(durations.begin(), durations.end(), 0.0);
  const double average = total / durations.size();

  std::cout << std::format("words: {} ({}) iterations: {}\n", csv_path, words.size(), iterations);
  std::cout << std::format("total: {:.2f}ms\n", total);
  std::cout << std::format("avg: {:.2f}ms\n", average);
  std::cout << std::format("min: {:.2f}ms\n", *min);
  std::cout << std::format("max: {:.2f}ms\n", *max);

  return 0;
}
