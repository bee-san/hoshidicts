// SPDX-License-Identifier: GPL-3.0-or-later
#include "hoshidicts/deinflector.hpp"

#include <cstdio>
#include <fstream>
#include <string>
#include <vector>

namespace {
std::vector<std::string> split(const std::string& text, char separator) {
  std::vector<std::string> fields;
  size_t begin = 0;
  while (true) {
    const size_t end = text.find(separator, begin);
    fields.push_back(text.substr(begin, end == std::string::npos ? end : end - begin));
    if (end == std::string::npos) return fields;
    begin = end + 1;
  }
}

bool has_candidate(const Deinflector& deinflector, const std::string& source, const std::string& term,
                   const std::string& pos, const std::string& reasons) {
  const auto expected = reasons.empty() ? std::vector<std::string>{} : split(reasons, '|');
  // v1d is an intermediate descriptor condition, not a dictionary POS tag.
  const auto flags = pos == "v1d" ? 1u : Deinflector::pos_to_conditions({pos});
  for (const auto& result : deinflector.deinflect(source)) {
    if (result.text != term) continue;
    // NONE is the uninflected wildcard, as in Yomitan's conditionsMatch.
    if (pos != "*" && result.conditions != 0 && !(result.conditions & flags)) continue;
    if (reasons == "*") return true;
    if (result.trace.size() != expected.size()) continue;
    bool matches = true;
    for (size_t i = 0; i < expected.size(); ++i) {
      // Hoshidicts exposes application order; Yomitan fixtures use forward order.
      if (result.trace[i].name != expected[expected.size() - 1 - i]) matches = false;
    }
    if (matches) return true;
  }
  return false;
}
}

int main(int argc, char** argv) {
  if (argc != 2) {
    std::fprintf(stderr, "usage: deinflector-test fixtures/yomitan-deinflections.tsv\n");
    return 1;
  }
  std::ifstream fixture(argv[1]);
  if (!fixture) {
    std::fprintf(stderr, "Cannot read fixture: %s\n", argv[1]);
    return 1;
  }
  Deinflector deinflector;
  size_t cases = 0, failures = 0;
  std::string line;
  while (std::getline(fixture, line)) {
    if (line.empty() || line[0] == '#') continue;
    const auto fields = split(line, '\t');
    if (fields.size() != 6) {
      std::fprintf(stderr, "Malformed fixture row %zu\n", cases + 1);
      return 1;
    }
    ++cases;
    const bool found = has_candidate(deinflector, fields[2], fields[3], fields[4], fields[5]);
    if (found != (fields[1] == "1")) {
      ++failures;
      std::fprintf(stderr, "FAIL [%s]: %s -> %s (%s; %s), expected %s\n", fields[0].c_str(),
                   fields[2].c_str(), fields[3].c_str(), fields[4].c_str(), fields[5].c_str(),
                   fields[1] == "1" ? "present" : "absent");
    }
  }
  // Whole-word honorific rules must not match inside a different word.
  for (const auto& source : {"偽ございます", "偽なさいました", "偽いらっしゃいます"}) {
    ++cases;
    const std::string term = source == std::string("偽ございます") ? "偽ござる" :
                             source == std::string("偽なさいました") ? "偽なさる" : "偽いらっしゃる";
    if (has_candidate(deinflector, source, term, "v5", "*")) {
      ++failures;
      std::fprintf(stderr, "FAIL whole-word honorific: %s -> %s\n", source, term.c_str());
    }
  }
  ++cases;
  if (!has_candidate(deinflector, "ございます", "ござる", "v5", "-ます") ||
      !has_candidate(deinflector, "なさいました", "なさる", "v5", "-ます|-た")) {
    ++failures;
    std::fprintf(stderr, "FAIL exact/chained honorific\n");
  }
  std::printf("%zu cases, %zu failures\n", cases, failures);
  return cases > 4 && failures == 0 ? 0 : 1;
}
