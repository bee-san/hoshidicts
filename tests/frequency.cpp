#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"
#include "hoshidicts_c.h"
#include "json/yomitan_parser.hpp"

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
  const auto result = dictionary_importer::import(zip_path.string(), output_path.string());
  if (!result.success) {
    throw std::runtime_error("dictionary import failed: " + result.error);
  }
  return output_path / title;
}

void expect_frequency(std::string_view json, double value, std::optional<std::string_view> display,
                      std::optional<std::string_view> reading = std::nullopt) {
  ParsedFrequency parsed;
  check(yomitan_parser::parse_frequency(json, parsed), "frequency shape parses");
  check_close(parsed.value, value, "frequency numeric value");
  check(parsed.reading == reading, "frequency reading presence and value");
  check(parsed.display_value.has_value() == display.has_value(), "frequency display nullability");
  if (parsed.display_value.has_value() && display.has_value()) {
    check(*parsed.display_value == *display, "frequency display exact value");
  }
}

void test_parser() {
  expect_frequency("12.5", 12.5, std::nullopt);
  expect_frequency("-1.25e2", -125, std::nullopt);
  expect_frequency(R"("rank: .5E+2 / 100")", 50, "rank: .5E+2 / 100");
  expect_frequency(R"("rank: +1.25e+2")", 125, "rank: +1.25e+2");
  expect_frequency(R"("rank: +1.")", 1, "rank: +1.");
  expect_frequency(R"("rank: -.5")", -0.5, "rank: -.5");
  expect_frequency(R"("not ranked")", 0, "not ranked");
  expect_frequency(R"("1e")", 1, "1e");
  expect_frequency(R"({"value":2.75})", 2.75, std::nullopt);
  expect_frequency(R"({"value":2.75,"displayValue":""})", 2.75, "");
  expect_frequency(R"({"value":2.75,"displayValue":"top 3"})", 2.75, "top 3");
  expect_frequency(R"({"reading":"よみ","frequency":3.5})", 3.5, std::nullopt, "よみ");
  expect_frequency(R"({"reading":"よみ","frequency":"#4.5"})", 4.5, "#4.5", "よみ");
  expect_frequency(R"({"reading":"よみ","frequency":{"value":5.5,"displayValue":"five"}})", 5.5, "five", "よみ");
  expect_frequency(R"({"reading":"","frequency":5.75})", 5.75, std::nullopt, "");
  expect_frequency(R"({"reading":"よみ","value":6.5,"displayValue":"legacy"})", 6.5, "legacy", "よみ");

  for (const std::string_view invalid : {"true", "null", "[]", R"({"frequency":true})", R"({"value":"12"})", "1e999"}) {
    ParsedFrequency parsed;
    check(!yomitan_parser::parse_frequency(invalid, parsed), "invalid frequency rejected");
  }
}

const TermResult* find_reading(const std::vector<TermResult>& terms, std::string_view reading) {
  const auto it = std::ranges::find(terms, reading, &TermResult::reading);
  return it == terms.end() ? nullptr : &*it;
}

std::string term_bank() {
  return R"([["語","ご一","","",0,["one"],1,""],["語","ご二","","",0,["two"],2,""],["語","ご三","","",0,["three"],3,""]])";
}

void test_query_shapes_and_c_v2(const TempDirectory& temp, const std::filesystem::path& terms_path) {
  const auto frequency_path = import_dictionary(
      temp, "Shapes", "rank-based", "ja", std::nullopt,
      R"([["語","freq",{"reading":"ご一","frequency":1.25}],["語","freq",{"reading":"ご一","frequency":1.25}],["語","freq",{"reading":"ご一","frequency":{"value":1.25,"displayValue":""}}],["語","freq",{"reading":"ご一","frequency":{"value":1.25,"displayValue":"1.25"}}],["語","freq",{"reading":"ご一","frequency":"rank 1.25"}],["語","freq",{"reading":"ご二","frequency":9.5}],["語","freq",{"reading":"other","frequency":100}],["語","freq",{"reading":"","frequency":200}]])");

  DictionaryQuery query;
  query.add_term_dict(terms_path.string());
  query.add_freq_dict(frequency_path.string());
  const auto terms = query.query("語");
  const auto* first = find_reading(terms, "ご一");
  const auto* second = find_reading(terms, "ご二");
  const auto* third = find_reading(terms, "ご三");
  check(first != nullptr && second != nullptr && third != nullptr, "all reading variants returned");
  if (first != nullptr) {
    check(first->frequencies.size() == 1, "one frequency dictionary on first reading");
    if (!first->frequencies.empty()) {
      check(first->frequencies[0].frequencies.size() == 4, "exact value/display pairs deduplicated");
      const auto& values = first->frequencies[0].frequencies;
      check(std::ranges::count_if(values, [](const Frequency& item) { return !item.display_value.has_value(); }) == 1,
            "null display preserved and deduplicated");
      check(std::ranges::count_if(values,
                                  [](const Frequency& item) {
                                    return item.display_value.has_value() && item.display_value->empty();
                                  }) == 1,
            "empty display remains distinct from null");
    }
  }
  if (second != nullptr) {
    check(second->frequencies.size() == 1 && second->frequencies[0].frequencies.size() == 1,
          "reading-specific frequency retained");
    if (!second->frequencies.empty() && !second->frequencies[0].frequencies.empty()) {
      check_close(second->frequencies[0].frequencies[0].value, 9.5, "reading-specific decimal retained");
    }
  }
  if (third != nullptr) {
    check(third->frequencies.empty(), "mismatched readings filtered");
  }

  hd_query* c_query = hd_query_new();
  check(c_query != nullptr, "C query allocated");
  if (c_query == nullptr) {
    return;
  }
  check(hd_query_add_term_dict(c_query, terms_path.string().c_str()) == 0, "C term dictionary added");
  check(hd_query_add_freq_dict(c_query, frequency_path.string().c_str()) == 0, "C frequency dictionary added");

  const hd_term_result_v2* v2_terms = nullptr;
  size_t v2_count = 0;
  hd_results* v2_owner = hd_query_run_v2(c_query, "語", &v2_terms, &v2_count);
  check(v2_owner != nullptr && v2_count == 3, "v2 C query returns terms");
  if (v2_owner != nullptr) {
    bool saw_null = false;
    bool saw_empty = false;
    bool saw_decimal = false;
    for (size_t i = 0; i < v2_count; i++) {
      for (size_t j = 0; j < v2_terms[i].frequencies_count; j++) {
        const auto& entry = v2_terms[i].frequencies[j];
        for (size_t k = 0; k < entry.frequencies_count; k++) {
          const auto& value = entry.frequencies[k];
          saw_decimal = saw_decimal || value.value == 1.25 || value.value == 9.5;
          saw_null = saw_null || (value.display_value_is_null != 0 && value.display_value.ptr == nullptr);
          saw_empty = saw_empty || (value.display_value_is_null == 0 && value.display_value.ptr != nullptr &&
                                    value.display_value.len == 0);
        }
      }
    }
    check(saw_decimal, "v2 C query preserves doubles");
    check(saw_null, "v2 C query exposes null display");
    check(saw_empty, "v2 C query distinguishes empty display");
    hd_results_free(v2_owner);
  }

  const hd_term_result* v1_terms = nullptr;
  size_t v1_count = 0;
  hd_results* v1_owner = hd_query_run(c_query, "語", &v1_terms, &v1_count);
  check(v1_owner != nullptr && v1_count == 3, "v1 C query remains callable");
  if (v1_owner != nullptr) {
    hd_results_free(v1_owner);
  }

  hd_deinflector* c_deinflector = hd_deinflector_new();
  hd_lookup* c_lookup = c_deinflector == nullptr ? nullptr : hd_lookup_new(c_query, c_deinflector);
  check(c_deinflector != nullptr && c_lookup != nullptr, "v2 C lookup allocated");
  if (c_lookup != nullptr) {
    const hd_lookup_result_v2* lookup_results = nullptr;
    size_t lookup_count = 0;
    hd_lookup_results* lookup_owner = hd_lookup_run_v2(c_lookup, "語", 1, 1, &lookup_results, &lookup_count);
    check(lookup_owner != nullptr && lookup_count == 1, "v2 C lookup returns sorted result");
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
  priority_query.add_term_dict(terms_path.string());
  priority_query.add_freq_dict(primary_rank.string());
  priority_query.add_freq_dict(secondary_conflict.string());
  check_reading_order(lookup_readings(priority_query), {"ご一", "ご二", "ご三"},
                      "only primary rank dictionary sorts and missing is last");
  check_reading_order(lookup_readings(priority_query, 1), {"ご一"}, "sorting happens before truncation");

  const auto primary_occurrence = import_dictionary(
      temp, "PrimaryOccurrence", "occurrence-based", "ja", std::nullopt,
      R"([["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご一","frequency":30}],["語","freq",{"reading":"ご二","frequency":20}]])");
  DictionaryQuery occurrence_query;
  occurrence_query.add_term_dict(terms_path.string());
  occurrence_query.add_freq_dict(primary_occurrence.string());
  check_reading_order(lookup_readings(occurrence_query), {"ご一", "ご二", "ご三"},
                      "occurrence mode uses maximum descending and missing last");
}

void test_inference(const TempDirectory& temp, const std::filesystem::path& terms_path) {
  const auto occurrence = import_dictionary(
      temp, "InferredOccurrence", std::nullopt, "JA", std::nullopt,
      R"([["来る","freq",100],["猫","freq",1],["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご二","frequency":20}]])");
  DictionaryQuery occurrence_query;
  occurrence_query.add_term_dict(terms_path.string());
  occurrence_query.add_freq_dict(occurrence.string());
  check_reading_order(lookup_readings(occurrence_query), {"ご二", "ご一", "ご三"},
                      "case-insensitive Japanese heuristic infers occurrence sorting");

  const auto rank = import_dictionary(
      temp, "InferredRank", "invalid-mode", "ja", std::nullopt,
      R"([["来る","freq",1],["猫","freq",100],["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご二","frequency":20}]])");
  DictionaryQuery rank_query;
  rank_query.add_term_dict(terms_path.string());
  rank_query.add_freq_dict(rank.string());
  check_reading_order(lookup_readings(rank_query), {"ご一", "ご二", "ご三"},
                      "invalid explicit mode uses Japanese heuristic for rank sorting");

  const auto fallback = import_dictionary(
      temp, "FallbackRank", std::nullopt, "en", std::nullopt,
      R"([["語","freq",{"reading":"ご一","frequency":10}],["語","freq",{"reading":"ご二","frequency":20}]])");
  DictionaryQuery fallback_query;
  fallback_query.add_term_dict(terms_path.string());
  fallback_query.add_freq_dict(fallback.string());
  check_reading_order(lookup_readings(fallback_query), {"ご一", "ご二", "ご三"},
                      "non-Japanese or inconclusive mode falls back to rank sorting");
}
}

int main() {
  try {
    test_parser();
    TempDirectory temp;
    const auto terms_path = import_dictionary(temp, "Terms", std::nullopt, "ja", term_bank(), std::nullopt);
    test_query_shapes_and_c_v2(temp, terms_path);
    test_sorting(temp, terms_path);
    test_inference(temp, terms_path);
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
