#include <xxh3.h>
#include <zstd.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <optional>
#include <ranges>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "hash/hash.hpp"
#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"
#include "hoshidicts_c.h"
#include "json/yomitan_parser.hpp"
#include "path_utils.hpp"

namespace {
int failures = 0;

void check(bool condition, std::string_view message) {
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    failures++;
  }
}

void check_close(double actual, double expected, std::string_view message) {
  check(std::abs(actual - expected) < 1e-12, message);
}

template <typename T>
void append(std::vector<char>& output, T value) {
  const size_t position = output.size();
  output.resize(position + sizeof(T));
  std::memcpy(output.data() + position, &value, sizeof(T));
}

template <typename T, typename... Values>
void append_many(std::vector<char>& output, Values... values) {
  (append<T>(output, static_cast<T>(values)), ...);
}

void append_bytes(std::vector<char>& output, std::string_view value) {
  output.insert(output.end(), value.begin(), value.end());
}

struct ZipFile {
  std::string name;
  std::string data;
  uint32_t local_offset = 0;
};

void write_stored_zip(const std::filesystem::path& path, std::vector<ZipFile> files) {
  std::vector<char> output;
  for (auto& file : files) {
    file.local_offset = static_cast<uint32_t>(output.size());
    append<uint32_t>(output, 0x04034b50);
    append_many<uint16_t>(output, 20, 0, 0, 0, 0);
    append_many<uint32_t>(output, 0, file.data.size(), file.data.size());
    append_many<uint16_t>(output, file.name.size(), 0);
    append_bytes(output, file.name);
    append_bytes(output, file.data);
  }

  const uint32_t central_offset = static_cast<uint32_t>(output.size());
  for (const auto& file : files) {
    append<uint32_t>(output, 0x02014b50);
    append_many<uint16_t>(output, 20, 20, 0, 0, 0, 0);
    append_many<uint32_t>(output, 0, file.data.size(), file.data.size());
    append_many<uint16_t>(output, file.name.size(), 0, 0, 0, 0);
    append_many<uint32_t>(output, 0, file.local_offset);
    append_bytes(output, file.name);
  }

  const uint32_t central_size = static_cast<uint32_t>(output.size()) - central_offset;
  append<uint32_t>(output, 0x06054b50);
  append_many<uint16_t>(output, 0, 0, files.size(), files.size());
  append_many<uint32_t>(output, central_size, central_offset);
  append<uint16_t>(output, 0);

  std::ofstream stream(path, std::ios::binary);
  stream.write(output.data(), static_cast<std::streamsize>(output.size()));
  if (!stream) {
    throw std::runtime_error("failed to write test zip");
  }
}

struct TempDirectory {
  std::filesystem::path path;

  TempDirectory() {
    const auto suffix = std::chrono::steady_clock::now().time_since_epoch().count();
    path = std::filesystem::temp_directory_path() / ("hoshidicts-frequency-tests-" + std::to_string(suffix));
    std::filesystem::create_directories(path);
  }

  ~TempDirectory() { std::filesystem::remove_all(path); }
};

std::filesystem::path import_dictionary(const TempDirectory& temp, const std::string& title,
                                        std::optional<std::string_view> frequency_mode,
                                        std::optional<std::string_view> source_language,
                                        std::optional<std::string> terms, std::optional<std::string> frequencies) {
  std::string index = "{\"title\":\"" + title + "\",\"revision\":\"test\",\"format\":3";
  if (frequency_mode.has_value()) {
    index += ",\"frequencyMode\":\"" + std::string(*frequency_mode) + "\"";
  }
  if (source_language.has_value()) {
    index += ",\"sourceLanguage\":\"" + std::string(*source_language) + "\"";
  }
  index += "}";

  std::vector<ZipFile> files{{"index.json", index}};
  if (terms.has_value()) {
    files.push_back({"term_bank_1.json", std::move(*terms)});
  }
  if (frequencies.has_value()) {
    files.push_back({"term_meta_bank_1.json", std::move(*frequencies)});
  }

  const auto zip_path = temp.path / (title + ".zip");
  const auto output_path = temp.path / "imported";
  write_stored_zip(zip_path, std::move(files));
  const auto result = dictionary_importer::import(path_utils::to_utf8(zip_path), path_utils::to_utf8(output_path));
  if (!result.success) {
    throw std::runtime_error("dictionary import failed: " + result.error);
  }
  return output_path / title;
}

struct LegacyTerm {
  std::string expression;
  std::string reading;
  std::string rules;
  int32_t score;
  std::string glossary;
};

std::vector<char> compress_glossary(std::string_view glossary) {
  std::vector<char> compressed(ZSTD_compressBound(glossary.size()));
  const size_t size = ZSTD_compress(compressed.data(), compressed.size(), glossary.data(), glossary.size(), 0);
  if (ZSTD_isError(size)) {
    throw std::runtime_error("failed to compress legacy glossary fixture");
  }
  compressed.resize(size);
  return compressed;
}

std::filesystem::path write_legacy_v3_dictionary(const TempDirectory& temp, const std::string& title,
                                                 const std::vector<LegacyTerm>& terms) {
  const auto dictionary_path = temp.path / "legacy" / title;
  std::filesystem::create_directories(dictionary_path);

  std::vector<char> blobs;
  struct CompressedGlossary {
    uint64_t offset;
    uint32_t size;
  };
  std::vector<CompressedGlossary> glossaries;
  glossaries.reserve(terms.size());
  for (const auto& term : terms) {
    auto compressed = compress_glossary(term.glossary);
    glossaries.push_back(
        {.offset = static_cast<uint64_t>(blobs.size()), .size = static_cast<uint32_t>(compressed.size())});
    blobs.insert(blobs.end(), compressed.begin(), compressed.end());
  }

  std::map<uint64_t, std::vector<uint64_t>> offsets;
  for (size_t i = 0; i < terms.size(); i++) {
    const auto& term = terms[i];
    const std::string_view reading = term.reading.empty() ? std::string_view(term.expression) : term.reading;
    const uint64_t record_offset = blobs.size();
    append<uint8_t>(blobs, 0);
    append<uint16_t>(blobs, term.expression.size());
    append_bytes(blobs, term.expression);
    append<uint16_t>(blobs, reading.size());
    append_bytes(blobs, reading);
    append<uint64_t>(blobs, glossaries[i].offset);
    append<uint32_t>(blobs, glossaries[i].size);
    append<uint8_t>(blobs, 0);
    append<uint8_t>(blobs, term.rules.size());
    append_bytes(blobs, term.rules);
    append<uint8_t>(blobs, 0);
    append<uint32_t>(blobs, 0);  // Old importers discarded dictionary redirects here.
    append<int32_t>(blobs, term.score);

    offsets[XXH3_64bits(term.expression.data(), term.expression.size())].push_back(record_offset);
    if (reading != term.expression) {
      offsets[XXH3_64bits(reading.data(), reading.size())].push_back(record_offset);
    }
  }

  std::vector<std::pair<uint64_t, uint64_t>> hash_entries;
  for (const auto& [hash, record_offsets] : offsets) {
    const uint64_t offset = blobs.size();
    append<uint32_t>(blobs, record_offsets.size());
    for (uint64_t record_offset : record_offsets) {
      append<uint64_t>(blobs, record_offset);
    }
    hash_entries.emplace_back(hash, offset);
  }

  std::ofstream blob_stream(dictionary_path / "blobs.bin", std::ios::binary);
  blob_stream.write(blobs.data(), static_cast<std::streamsize>(blobs.size()));
  if (!blob_stream) {
    throw std::runtime_error("failed to write legacy blobs fixture");
  }
  blob_stream.close();

  hash::linear table;
  table.build_to_file(hash_entries, dictionary_path / "hash.table");
  auto hashes = hash_entries | std::views::keys | std::ranges::to<std::vector>();
  hash::bloom::build_to_file(hashes, dictionary_path / "bloom.filter");

  std::ofstream index_stream(dictionary_path / "index.json", std::ios::binary);
  index_stream << "{\"title\":\"" << title
               << "\",\"revision\":\"legacy\",\"version\":3,\"sourceLanguage\":\"ja\",\"counts\":{\"terms\":{\"total\":"
               << terms.size() << "}}}";
  std::ofstream marker_stream(dictionary_path / ".hoshidicts_3", std::ios::binary);
  if (!index_stream || !marker_stream) {
    throw std::runtime_error("failed to write legacy dictionary metadata");
  }
  return dictionary_path;
}

void expect_frequency(std::string_view json, int value, std::string_view display, std::string_view reading = "") {
  ParsedFrequency parsed;
  check(yomitan_parser::parse_frequency(json, parsed), "frequency shape parses");
  check(parsed.value == value, "frequency numeric value");
  check(parsed.reading == reading, "frequency reading");
  check(parsed.display_value == display, "frequency display value");
}

void test_parser() {
  // The four shapes the dictionaries in circulation actually emit. A display
  // value is synthesised from the numeric value when the archive omits one.
  expect_frequency("12", 12, "12");
  expect_frequency(R"({"value":3,"displayValue":"3㋕"})", 3, "3㋕");
  expect_frequency(R"({"value":3})", 3, "3");
  expect_frequency(R"({"reading":"よみ","frequency":4})", 4, "4", "よみ");
  expect_frequency(R"({"reading":"よみ","frequency":{"value":5,"displayValue":"five"}})", 5, "five", "よみ");
  expect_frequency(R"({"reading":"よみ","frequency":{"value":5}})", 5, "5", "よみ");
  expect_frequency(R"({"reading":"よみ","value":6,"displayValue":"legacy"})", 6, "legacy", "よみ");
  expect_frequency(R"({"value":7,"displayValue":""})", 7, "");
  expect_frequency(R"({"reading":"","frequency":8})", 8, "8", "");

  for (const std::string_view invalid : {"true", "null", "[]", R"({"frequency":true})", R"({"value":"12"})"}) {
    ParsedFrequency parsed;
    check(!yomitan_parser::parse_frequency(invalid, parsed), "invalid frequency rejected");
  }

  ParsedGlossary glossary;
  check(
      yomitan_parser::parse_glossary(
          R"(["plain",{"number":9007199254740993},["base",["redirected from alias"]],["bad",["rule"],"extra"],["",["empty target"]]])",
          glossary),
      "mixed glossary parses");
  check(glossary.display_json == R"(["plain",{"number":9007199254740993}])",
        "glossary filtering preserves non-array JSON without numeric coercion");
  check(glossary.has_display_definitions && glossary.redirects.size() == 1 && glossary.redirects[0].form_of == "base" &&
            glossary.redirects[0].inflection_rules == std::vector<std::string>{"redirected from alias"},
        "only schema-valid non-empty redirect tuples are extracted");
}

const TermResult* find_reading(const std::vector<TermResult>& terms, std::string_view reading) {
  const auto it = std::ranges::find(terms, reading, &TermResult::reading);
  return it == terms.end() ? nullptr : &*it;
}

std::string term_bank() {
  return R"([["語","ご一","","",0,["one"],1,""],["語","ご二","","",0,["two"],2,""],["語","ご三","","",0,["three"],3,""]])";
}

void test_query_shapes(const TempDirectory& temp, const std::filesystem::path& terms_path) {
  const auto frequency_path = import_dictionary(
      temp, "Shapes", "rank-based", "ja", std::nullopt,
      R"([["語","freq",{"reading":"ご一","frequency":1}],["語","freq",{"reading":"ご一","frequency":1}],["語","freq",{"reading":"ご一","frequency":{"value":1,"displayValue":""}}],["語","freq",{"reading":"ご一","frequency":{"value":1,"displayValue":"1㋕"}}],["語","freq",{"reading":"ご二","frequency":9}],["語","freq",{"reading":"other","frequency":100}],["語","freq",{"reading":"","frequency":200}]])");

  DictionaryQuery query;
  const std::string terms_path_utf8 = path_utils::to_utf8(terms_path);
  const std::string frequency_path_utf8 = path_utils::to_utf8(frequency_path);
  query.add_term_dict(terms_path_utf8);
  query.add_freq_dict(frequency_path_utf8);
  const auto terms = query.query("語");
  const auto* first = find_reading(terms, "ご一");
  const auto* second = find_reading(terms, "ご二");
  const auto* third = find_reading(terms, "ご三");
  check(first != nullptr && second != nullptr && third != nullptr, "all reading variants returned");
  // An entry whose reading is absent or empty applies to every reading of the
  // expression, so the 200 below lands on all three. No frequency dictionary in
  // circulation emits one, but the semantics are worth pinning down.
  if (first != nullptr) {
    check(first->frequencies.size() == 1, "one frequency dictionary on first reading");
    if (!first->frequencies.empty()) {
      const auto& values = first->frequencies[0].frequencies;
      // "1" twice collapses; the synthesised "1", the empty display and "1㋕"
      // are three distinct value/display pairs, plus the unscoped 200.
      check(values.size() == 4, "exact value/display pairs deduplicated");
      check(std::ranges::count_if(values, [](const Frequency& item) { return item.display_value == "1"; }) == 1,
            "display synthesised from the numeric value when absent");
      check(std::ranges::count_if(values, [](const Frequency& item) { return item.display_value.empty(); }) == 1,
            "empty display remains distinct");
      check(std::ranges::count_if(values, [](const Frequency& item) { return item.display_value == "1㋕"; }) == 1,
            "marked display value retained verbatim");
    }
  }
  if (second != nullptr) {
    check(second->frequencies.size() == 1 && second->frequencies[0].frequencies.size() == 2,
          "reading-specific frequency retained alongside the unscoped one");
    if (!second->frequencies.empty() && second->frequencies[0].frequencies.size() == 2) {
      check(second->frequencies[0].frequencies[0].value == 9, "reading-specific value retained");
    }
  }
  if (third != nullptr) {
    check(third->frequencies.size() == 1 && third->frequencies[0].frequencies.size() == 1,
          "a reading with no specific entry keeps only the unscoped one");
    if (!third->frequencies.empty() && !third->frequencies[0].frequencies.empty()) {
      check(third->frequencies[0].frequencies[0].value == 200, "mismatched reading-specific entries filtered");
    }
  }

  hd_query* c_query = hd_query_new();
  check(c_query != nullptr, "C query allocated");
  if (c_query == nullptr) {
    return;
  }
  check(hd_query_add_term_dict(c_query, terms_path_utf8.c_str()) == 0, "C term dictionary added");
  check(hd_query_add_freq_dict(c_query, frequency_path_utf8.c_str()) == 0, "C frequency dictionary added");

  const hd_term_result* c_terms = nullptr;
  size_t c_count = 0;
  hd_results* c_owner = hd_query_run(c_query, "語", &c_terms, &c_count);
  check(c_owner != nullptr && c_count == 3, "C query returns terms");
  if (c_owner != nullptr) {
    bool saw_synthesised = false;
    bool saw_empty = false;
    bool saw_marked = false;
    for (size_t i = 0; i < c_count; i++) {
      for (size_t j = 0; j < c_terms[i].frequencies_count; j++) {
        const auto& entry = c_terms[i].frequencies[j];
        for (size_t k = 0; k < entry.frequencies_count; k++) {
          const auto& value = entry.frequencies[k];
          const std::string_view display(value.display_value.ptr, value.display_value.len);
          saw_synthesised = saw_synthesised || (value.value == 1 && display == "1");
          saw_empty = saw_empty || (value.display_value.ptr != nullptr && value.display_value.len == 0);
          saw_marked = saw_marked || display == "1㋕";
        }
      }
    }
    check(saw_synthesised, "C query exposes the synthesised display value");
    check(saw_empty, "C query distinguishes an empty display value");
    check(saw_marked, "C query exposes a marked display value");
    hd_results_free(c_owner);
  }

  hd_deinflector* c_deinflector = hd_deinflector_new();
  hd_lookup* c_lookup = c_deinflector == nullptr ? nullptr : hd_lookup_new(c_query, c_deinflector);
  check(c_deinflector != nullptr && c_lookup != nullptr, "C lookup allocated");
  if (c_lookup != nullptr) {
    const hd_lookup_result* lookup_results = nullptr;
    size_t lookup_count = 0;
    hd_lookup_results* lookup_owner = hd_lookup_run(c_lookup, "語", 1, 1, &lookup_results, &lookup_count);
    check(lookup_owner != nullptr && lookup_count == 1, "C lookup returns sorted result");
    if (lookup_owner != nullptr) {
      hd_lookup_results_free(lookup_owner);
    }
    hd_lookup_free(c_lookup);
  }
  if (c_deinflector != nullptr) {
    hd_deinflector_free(c_deinflector);
  }
  hd_query_free(c_query);
}

std::vector<std::string> lookup_readings(DictionaryQuery& query, size_t max_results = 3) {
  Deinflector deinflector;
  Lookup lookup(query, deinflector);
  auto results = lookup.lookup("語", static_cast<int>(max_results), 1);
  std::vector<std::string> readings;
  std::ranges::transform(results, std::back_inserter(readings),
                         [](const LookupResult& result) { return result.term.reading; });
  return readings;
}

void check_reading_order(const std::vector<std::string>& readings, std::initializer_list<std::string_view> expected,
                         std::string_view message) {
  check(readings.size() == expected.size(), message);
  if (readings.size() != expected.size()) {
    return;
  }
  check(std::equal(readings.begin(), readings.end(), expected.begin()), message);
}

void test_sorting(const TempDirectory& temp, const std::filesystem::path& terms_path) {
  const auto primary_rank = import_dictionary(
      temp, "PrimaryRank", "rank-based", "ja", std::nullopt,
      R"([["語","freq",{"reading":"ご一","frequency":100}],["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご二","frequency":20}]])");
  const auto secondary_conflict = import_dictionary(
      temp, "SecondaryConflict", "rank-based", "ja", std::nullopt,
      R"([["語","freq",{"reading":"ご一","frequency":100}],["語","freq",{"reading":"ご二","frequency":1}],["語","freq",{"reading":"ご三","frequency":0}]])");

  DictionaryQuery priority_query;
  priority_query.add_term_dict(path_utils::to_utf8(terms_path));
  priority_query.add_freq_dict(path_utils::to_utf8(primary_rank));
  priority_query.add_freq_dict(path_utils::to_utf8(secondary_conflict));
  check_reading_order(lookup_readings(priority_query), {"ご一", "ご二", "ご三"},
                      "only primary rank dictionary sorts and missing is last");
  check_reading_order(lookup_readings(priority_query, 1), {"ご一"}, "sorting happens before truncation");

  const auto primary_occurrence = import_dictionary(
      temp, "PrimaryOccurrence", "occurrence-based", "ja", std::nullopt,
      R"([["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご一","frequency":30}],["語","freq",{"reading":"ご二","frequency":20}]])");
  DictionaryQuery occurrence_query;
  occurrence_query.add_term_dict(path_utils::to_utf8(terms_path));
  occurrence_query.add_freq_dict(path_utils::to_utf8(primary_occurrence));
  check_reading_order(lookup_readings(occurrence_query), {"ご一", "ご二", "ご三"},
                      "occurrence mode uses maximum descending and missing last");
}

hd_str borrowed_string(std::string_view value) { return hd_str{value.data(), value.size()}; }

std::vector<std::string> run_c_lookup_with_options(const hd_lookup* lookup, const hd_lookup_options* options,
                                         int max_results = 8) {
  const hd_lookup_result* results = nullptr;
  size_t count = 0;
  hd_lookup_results* owner = hd_lookup_run_with_options(lookup, "順位", max_results, 2, options, &results, &count);
  if (owner == nullptr) {
    throw std::runtime_error("v3 lookup unexpectedly failed");
  }
  std::vector<std::string> readings;
  readings.reserve(count);
  for (size_t i = 0; i < count; i++) {
    readings.emplace_back(results[i].term.reading.ptr, results[i].term.reading.len);
  }
  hd_lookup_results_free(owner);
  return readings;
}

void test_lookup_options(const TempDirectory& temp) {
  const auto terms_path = import_dictionary(
      temp, "RankedTerms", std::nullopt, "ja",
      R"([["順位","じゅんいち","","",30,["alpha"],1,""],["順位","じゅんに","","",20,["beta"],2,""],["順位","じゅんさん","","",10,["preferred"],3,""],["順位","","","",5,["expression reading"],4,""]])",
      std::nullopt);
  const auto legacy_frequency = import_dictionary(
      temp, "LegacyFrequency", "rank-based", "ja", std::nullopt,
      R"([["順位","freq",{"reading":"じゅんいち","frequency":100}],["順位","freq",{"reading":"じゅんに","frequency":2}],["順位","freq",{"reading":"じゅんさん","frequency":50}]])");
  const auto selected_frequency = import_dictionary(
      temp, "選択頻度", "rank-based", "ja", std::nullopt,
      R"([["順位","freq",{"reading":"じゅんいち","frequency":3}],["順位","freq",{"reading":"じゅんいち","frequency":4}],["順位","freq",{"reading":"じゅんに","frequency":30}],["順位","freq",{"reading":"じゅんに","frequency":40}],["順位","freq",{"reading":"じゅんさん","frequency":20}],["順位","freq",{"reading":"じゅんさん","frequency":25}]])");

  hd_query* query = hd_query_new();
  hd_deinflector* deinflector = hd_deinflector_new();
  check(query != nullptr && deinflector != nullptr, "v3 option test allocates query and deinflector");
  if (query == nullptr || deinflector == nullptr) {
    hd_query_free(query);
    hd_deinflector_free(deinflector);
    return;
  }
  const std::string terms_path_utf8 = path_utils::to_utf8(terms_path);
  const std::string legacy_path_utf8 = path_utils::to_utf8(legacy_frequency);
  const std::string selected_path_utf8 = path_utils::to_utf8(selected_frequency);
  check(hd_query_add_term_dict(query, terms_path_utf8.c_str()) == 0, "v3 terms dictionary loads");
  check(hd_query_add_freq_dict(query, legacy_path_utf8.c_str()) == 0, "v3 legacy frequency dictionary loads");
  check(hd_query_add_freq_dict(query, selected_path_utf8.c_str()) == 0, "v3 selected frequency dictionary loads");
  hd_lookup* lookup = hd_lookup_new(query, deinflector);
  check(lookup != nullptr, "v3 lookup allocates");
  if (lookup == nullptr) {
    hd_query_free(query);
    hd_deinflector_free(deinflector);
    return;
  }

  const hd_lookup_result* plain_results = nullptr;
  size_t plain_count = 0;
  hd_lookup_results* plain_owner = hd_lookup_run(lookup, "順位", 8, 2, &plain_results, &plain_count);
  std::vector<std::string> plain_readings;
  if (plain_owner != nullptr) {
    for (size_t i = 0; i < plain_count; i++) {
      plain_readings.emplace_back(plain_results[i].term.reading.ptr, plain_results[i].term.reading.len);
    }
  }
  check_reading_order(plain_readings, {"じゅんに", "じゅんさん", "じゅんいち", "順位"},
                      "hd_lookup_run retains first-frequency sorting");
  hd_lookup_results_free(plain_owner);

  check_reading_order(run_c_lookup_with_options(lookup, nullptr), {"じゅんに", "じゅんさん", "じゅんいち", "順位"},
                      "null v3 options retain legacy first-frequency sorting");

  hd_lookup_options options{};
  options.frequency_order = HD_LOOKUP_FREQUENCY_ORDER_AUTO;
  check_reading_order(run_c_lookup_with_options(lookup, &options), {"じゅんに", "じゅんさん", "じゅんいち", "順位"},
                      "explicit v3 auto retains legacy first-frequency sorting");

  options.frequency_order = HD_LOOKUP_FREQUENCY_ORDER_DISABLED;
  check_reading_order(run_c_lookup_with_options(lookup, &options), {"じゅんいち", "じゅんに", "じゅんさん", "順位"},
                      "disabled v3 frequency sorting falls through to term score");

  const std::string selected_title = "選択頻度";
  options.frequency_dictionary = borrowed_string(selected_title);
  options.frequency_order = HD_LOOKUP_FREQUENCY_ORDER_ASCENDING;
  check_reading_order(run_c_lookup_with_options(lookup, &options), {"じゅんいち", "じゅんさん", "じゅんに", "順位"},
                      "explicit ascending frequency uses the selected UTF-8 dictionary and minimum value");
  options.frequency_order = HD_LOOKUP_FREQUENCY_ORDER_DESCENDING;
  check_reading_order(run_c_lookup_with_options(lookup, &options), {"じゅんに", "じゅんさん", "じゅんいち", "順位"},
                      "explicit descending frequency uses maximum value and keeps missing readings last");

  const std::string unknown_title = "選択頻度x";
  options.frequency_dictionary = borrowed_string(unknown_title);
  options.frequency_order = HD_LOOKUP_FREQUENCY_ORDER_ASCENDING;
  check_reading_order(run_c_lookup_with_options(lookup, &options), {"じゅんいち", "じゅんに", "じゅんさん", "順位"},
                      "unknown selected frequency dictionary does not fall back to the first dictionary");

  const std::string preferred = "じゅんさん";
  options = {};
  options.primary_reading = borrowed_string(preferred);
  options.frequency_order = HD_LOOKUP_FREQUENCY_ORDER_DISABLED;
  check_reading_order(run_c_lookup_with_options(lookup, &options, 1), {"じゅんさん"},
                      "primary reading wins before result truncation");
  check_reading_order(run_c_lookup_with_options(lookup, &options), {"じゅんさん", "じゅんいち", "じゅんに", "順位"},
                      "primary reading boosts one result without filtering alternatives");

  const std::string expression_reading = "順位";
  options.primary_reading = borrowed_string(expression_reading);
  check_reading_order(run_c_lookup_with_options(lookup, &options, 1), {"順位"},
                      "primary reading matches an imported empty reading through its expression fallback");

  options.primary_reading = hd_str{nullptr, 1};
  const hd_lookup_result* invalid_results = nullptr;
  size_t invalid_count = 0;
  check(hd_lookup_run_with_options(lookup, "順位", 4, 2, &options, &invalid_results, &invalid_count) == nullptr,
        "v3 rejects a malformed primary-reading slice");
  options = {};
  options.frequency_dictionary = hd_str{nullptr, 1};
  options.frequency_order = HD_LOOKUP_FREQUENCY_ORDER_ASCENDING;
  check(hd_lookup_run_with_options(lookup, "順位", 4, 2, &options, &invalid_results, &invalid_count) == nullptr,
        "v3 rejects a malformed frequency-dictionary slice");
  options = {};
  options.frequency_order = 99;
  check(hd_lookup_run_with_options(lookup, "順位", 4, 2, &options, &invalid_results, &invalid_count) == nullptr,
        "v3 rejects an unknown frequency order");
  options.frequency_order = HD_LOOKUP_FREQUENCY_ORDER_DISABLED;
  check(hd_lookup_run_with_options(lookup, "順位", 0, 2, &options, &invalid_results, &invalid_count) == nullptr,
        "v3 rejects a non-positive result limit");
  check(hd_lookup_run_with_options(lookup, "順位", 4, 0, &options, &invalid_results, &invalid_count) == nullptr,
        "v3 rejects an empty scan length");

  check_reading_order(run_c_lookup_with_options(lookup, nullptr), {"じゅんに", "じゅんさん", "じゅんいち", "順位"},
                      "per-call v3 options do not mutate legacy lookup state");

  hd_lookup_free(lookup);
  hd_deinflector_free(deinflector);
  hd_query_free(query);
}

const LookupResult* find_expression(const std::vector<LookupResult>& results, std::string_view expression) {
  const auto result = std::ranges::find_if(
      results, [expression](const LookupResult& candidate) { return candidate.term.expression == expression; });
  return result == results.end() ? nullptr : &*result;
}

bool glossaries_contain(const TermResult& term, std::string_view text) {
  return std::ranges::any_of(term.glossaries,
                             [text](const GlossaryEntry& glossary) { return glossary.glossary.contains(text); });
}

void test_dictionary_redirects_v4(const TempDirectory& temp) {
  const auto dictionary_path = import_dictionary(
      temp, "RedirectsV4", std::nullopt, "ja",
      R"([["へそ曲げる","","","v1",10,[{"type":"structured-content","content":{"tag":"a","href":"?query=へそを曲げる","content":"へそを曲げる"}},["へそを曲げる",["redirected from へそ曲げる"]]],1,""],["へそを曲げる","へそをまげる","","v1",9,["target definition"],2,""],["甲","","","",8,["source",["乙",["redirected from 甲"]]],3,""],["乙","","","",7,["middle",["丙",["redirected from 乙"]]],4,""],["丙","","","",6,["final"],5,""],["サイクル一","","","",5,["cycle one",["サイクル二",["redirected from サイクル一"]]],6,""],["サイクル二","","","",4,["cycle two",["サイクル一",["redirected from サイクル二"]]],7,""],["別表記","","","",3,[["本体",["redirected from 別表記"]]],8,""],["本体","ほんたい","","",2,["redirect-only target"],9,""],["壊れ","","","",1,[["ghost",["bad"],"extra"]],10,""],["ghost","","","",1,["must not be followed"],11,""],["食べる","たべる","","v1",1,["source verb",["喰う",["redirected from 食べる"]]],12,""],["喰う","くう","","v5",1,["target with a different POS"],13,""]])",
      std::nullopt);

  check(std::filesystem::is_regular_file(dictionary_path / ".hoshidicts_4"), "new imports use the v4 native marker");
  check(!std::filesystem::exists(dictionary_path / ".hoshidicts_3"), "new imports do not masquerade as v3");

  DictionaryQuery query;
  query.add_term_dict(path_utils::to_utf8(dictionary_path));
  Deinflector deinflector;
  Lookup lookup(query, deinflector);

  const auto alias_results = lookup.lookup("へそ曲げる", 16, 16);
  const auto* source = find_expression(alias_results, "へそ曲げる");
  const auto* target = find_expression(alias_results, "へそを曲げる");
  check(source != nullptr && target != nullptr, "mixed redirect lookup keeps source content and follows target");
  if (source != nullptr) {
    check(glossaries_contain(source->term, "structured-content"), "structured source definition is preserved");
    check(!glossaries_contain(source->term, "redirected from"), "redirect tuple is absent from source glossary JSON");
  }
  if (target != nullptr) {
    check(target->matched == "へそ曲げる" && target->deinflected == "へそを曲げる",
          "redirect target retains original match and target deinflection");
    check(!target->trace.empty() && target->trace.back().name == "redirected from へそ曲げる",
          "redirect rule is appended to the lookup trace");
    check(glossaries_contain(target->term, "target definition"), "redirect target definition is materialized");
  }

  const auto chain_results = lookup.lookup("甲", 16, 16);
  check(find_expression(chain_results, "甲") != nullptr && find_expression(chain_results, "乙") != nullptr,
        "one-hop redirect returns source and immediate target");
  check(find_expression(chain_results, "丙") == nullptr, "dictionary redirects are not recursively followed");

  const auto cycle_results = lookup.lookup("サイクル一", 16, 16);
  check(find_expression(cycle_results, "サイクル一") != nullptr &&
            find_expression(cycle_results, "サイクル二") != nullptr && cycle_results.size() == 2,
        "one-hop lookup terminates on redirect cycles");

  const auto redirect_only_results = lookup.lookup("別表記", 16, 16);
  check(find_expression(redirect_only_results, "別表記") == nullptr,
        "redirect-only source is omitted after its tuple is stripped");
  check(find_expression(redirect_only_results, "本体") != nullptr, "redirect-only source still follows its target");

  const auto malformed_results = lookup.lookup("壊れ", 16, 16);
  check(find_expression(malformed_results, "壊れ") == nullptr && find_expression(malformed_results, "ghost") == nullptr,
        "malformed top-level arrays are stripped but never followed");

  const auto inflected_results = lookup.lookup("食べた", 16, 16);
  const auto* different_pos_target = find_expression(inflected_results, "喰う");
  check(different_pos_target != nullptr, "redirect target is not filtered by the source deinflection POS");
  if (different_pos_target != nullptr) {
    check(different_pos_target->matched == "食べた" && different_pos_target->deinflected == "喰う",
          "inflected redirect preserves source match and target deinflection");
    check(
        different_pos_target->trace.size() >= 2 && different_pos_target->trace.back().name == "redirected from 食べる",
        "dictionary redirect follows the algorithmic inflection trace");
  }
}

void test_legacy_v3_redirect_fallback(const TempDirectory& temp) {
  const auto dictionary_path = write_legacy_v3_dictionary(
      temp, "LegacyRedirects",
      {{.expression = "旧表記",
        .reading = "",
        .rules = "",
        .score = 2,
        .glossary = R"([{"type":"structured-content","content":"legacy source"},["本体",["redirected from 旧表記"]]])"},
       {.expression = "本体", .reading = "ほんたい", .rules = "", .score = 1, .glossary = R"(["legacy target"])"}});

  DictionaryQuery query;
  query.add_term_dict(path_utils::to_utf8(dictionary_path));
  const auto direct = query.query("旧表記");
  check(direct.size() == 1 && glossaries_contain(direct.front(), "legacy source"),
        "legacy direct query preserves non-array definitions");
  if (!direct.empty()) {
    check(!glossaries_contain(direct.front(), "redirected from"),
          "legacy direct query filters raw redirect tuples from its glossary");
  }

  Deinflector deinflector;
  Lookup lookup(query, deinflector);
  const auto results = lookup.lookup("旧表記", 8, 8);
  const auto* target = find_expression(results, "本体");
  check(target != nullptr, "legacy v3 raw glossary fallback follows an existing indexed redirect");
  if (target != nullptr) {
    check(target->deinflected == "本体" && !target->trace.empty() &&
              target->trace.back().name == "redirected from 旧表記",
          "legacy fallback carries redirect target and rule into lookup metadata");
  }
}

void test_inference(const TempDirectory& temp, const std::filesystem::path& terms_path) {
  const auto occurrence = import_dictionary(
      temp, "InferredOccurrence", std::nullopt, "JA", std::nullopt,
      R"([["来る","freq",100],["猫","freq",1],["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご二","frequency":20}]])");
  DictionaryQuery occurrence_query;
  occurrence_query.add_term_dict(path_utils::to_utf8(terms_path));
  occurrence_query.add_freq_dict(path_utils::to_utf8(occurrence));
  check_reading_order(lookup_readings(occurrence_query), {"ご二", "ご一", "ご三"},
                      "case-insensitive Japanese heuristic infers occurrence sorting");

  const auto rank = import_dictionary(
      temp, "InferredRank", "invalid-mode", "ja", std::nullopt,
      R"([["来る","freq",1],["猫","freq",100],["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご二","frequency":20}]])");
  DictionaryQuery rank_query;
  rank_query.add_term_dict(path_utils::to_utf8(terms_path));
  rank_query.add_freq_dict(path_utils::to_utf8(rank));
  check_reading_order(lookup_readings(rank_query), {"ご一", "ご二", "ご三"},
                      "invalid explicit mode uses Japanese heuristic for rank sorting");

  const auto fallback = import_dictionary(
      temp, "FallbackRank", std::nullopt, "en", std::nullopt,
      R"([["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご二","frequency":20}]])");
  DictionaryQuery fallback_query;
  fallback_query.add_term_dict(path_utils::to_utf8(terms_path));
  fallback_query.add_freq_dict(path_utils::to_utf8(fallback));
  check_reading_order(lookup_readings(fallback_query), {"ご一", "ご二", "ご三"},
                      "non-Japanese or inconclusive mode falls back to rank sorting");
}

void test_katakana_reading_lookup(const TempDirectory& temp) {
  const auto terms_path =
      import_dictionary(temp, "KanaLookup", std::nullopt, "ja",
                        R"([["我輩","わがはい","","",0,["I; me; myself"],1606640,""]])", std::nullopt);

  DictionaryQuery query;
  query.add_term_dict(path_utils::to_utf8(terms_path));
  Deinflector deinflector;
  Lookup lookup(query, deinflector);

  for (const std::string_view source : {"ワガハイ", "ﾜｶﾞﾊｲ", "ワガハイ", "わがはい", "我輩"}) {
    const auto results = lookup.lookup(std::string(source), 8, 16);
    const auto result = std::ranges::find_if(results, [](const LookupResult& candidate) {
      return candidate.term.expression == "我輩" && candidate.term.reading == "わがはい";
    });
    check(result != results.end(), "kana width, composition, script, and kanji forms find a hiragana reading");
    if (result != results.end()) {
      check(result->matched == source, "normalized lookup preserves the original matched text");
    }
  }
}
}

int main() {
  try {
    test_parser();
    TempDirectory temp;
    const auto terms_path = import_dictionary(temp, "Terms", std::nullopt, "ja", term_bank(), std::nullopt);
    test_query_shapes(temp, terms_path);
    test_sorting(temp, terms_path);
    test_lookup_options(temp);
    test_inference(temp, terms_path);
    test_katakana_reading_lookup(temp);
    test_dictionary_redirects_v4(temp);
    test_legacy_v3_redirect_fallback(temp);
  } catch (const std::exception& error) {
    std::cerr << "FAIL: unexpected exception: " << error.what() << '\n';
    failures++;
  }

  if (failures != 0) {
    std::cerr << failures << " frequency test(s) failed\n";
    return 1;
  }
  std::cout << "all frequency tests passed\n";
  return 0;
}
