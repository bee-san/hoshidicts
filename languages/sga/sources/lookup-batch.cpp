// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements). Not built by
// CMake and not run by any test. Build it against a configured build:
//
//   g++ -O2 -std=c++23 -Iinclude languages/sga/sources/lookup-batch.cpp -o build/lookup-batch-sga \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/lookup-batch-sga [--exempt] [--options <id,...>] [--languages <dir>] <imported dictionary> [max_results] [scan_length] < texts
//
// Each input line is looked up with Lookup::lookup (default 16 results, scan
// length 16, no language options unless --options names some: what a host's
// hover does) and answered with one JSON line: {"text", "results":
// [{"expression", "matched", "trace": [ids], "rules": [ids], "steps"}]}, where
// "rules" lists the trace steps a rule made, not a form-of row of the
// dictionary (TransformGroup::from_dictionary): a form-of row's step is named
// by its rule text, which can equal a transform id (lenition, comparative).
// --exempt puts the dictionary in LookupOptions::pos_filter_exempt, which is
// how a lookup sees a dictionary without part-of-speech tags once the pack's
// lookup.untaggedTerms is "pass".

#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"

namespace {
std::string quote(const std::string& s) {
  std::string out = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') {
      out += '\\';
      out += static_cast<char>(c);
    } else if (c < 0x20) {
      char buf[8];
      std::snprintf(buf, sizeof buf, "\\u%04x", c);
      out += buf;
    } else {
      out += static_cast<char>(c);
    }
  }
  return out + "\"";
}
}  // namespace

int main(int argc, char** argv) {
  bool exempt = false;
  std::string languages_dir = "languages";
  std::vector<std::string> language_options;
  std::vector<std::string> positional;
  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--exempt") {
      exempt = true;
    } else if (arg == "--languages" && i + 1 < argc) {
      languages_dir = argv[++i];
    } else if (arg == "--options" && i + 1 < argc) {
      std::istringstream list(argv[++i]);
      for (std::string id; std::getline(list, id, ',');) language_options.push_back(id);
    } else {
      positional.push_back(arg);
    }
  }
  if (positional.empty()) {
    std::cerr << "usage: lookup-batch-sga [--exempt] [--options <id,...>] [--languages <dir>] <imported dictionary> [max_results] [scan_length] < texts\n";
    return 2;
  }
  const std::string dictionary = positional[0];
  const int max_results = positional.size() > 1 ? std::stoi(positional[1]) : 16;
  const size_t scan_length = positional.size() > 2 ? std::stoul(positional[2]) : 16;
  hoshidicts::LanguageRegistry registry;
  std::string error;
  if (!registry.add_directory(languages_dir, &error) || !registry.find("sga")) {
    std::cerr << "cannot load the pack sga from " << languages_dir << ": " << error << "\n";
    return 1;
  }
  DictionaryQuery query;
  if (!query.add_term_dict(dictionary)) {
    std::cerr << "cannot load " << dictionary << ": " << query.last_error() << "\n";
    return 1;
  }
  const Lookup lookup(query, registry);
  LookupOptions options;
  options.language = "sga";
  options.language_options = language_options;
  if (exempt) options.pos_filter_exempt = {dictionary};
  std::string text;
  while (std::getline(std::cin, text)) {
    const auto results = lookup.lookup(text, max_results, scan_length, options);
    std::string out = "{\"text\":" + quote(text) + ",\"results\":[";
    for (size_t i = 0; i < results.size(); ++i) {
      const auto& r = results[i];
      if (i) out += ",";
      out += "{\"expression\":" + quote(r.term.expression) + ",\"matched\":" + quote(r.matched) +
             ",\"steps\":" + std::to_string(r.preprocessor_steps) + ",\"trace\":[";
      for (size_t j = 0; j < r.trace.size(); ++j) {
        if (j) out += ",";
        out += quote(r.trace[j].id);
      }
      out += "],\"rules\":[";
      bool first_rule = true;
      for (const auto& step : r.trace) {
        if (step.from_dictionary) continue;
        if (!first_rule) out += ",";
        first_rule = false;
        out += quote(step.id);
      }
      out += "]}";
    }
    out += "]}\n";
    std::cout << out;
  }
  return 0;
}
