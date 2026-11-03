// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements), as a host
// makes them. Not built by CMake and not run by any test. Build it against a
// configured build (see README.md, Measurements):
//
//   g++ -O2 -std=c++23 -Iinclude languages/eo/sources/lookup-batch.cpp -o build/eo-lookup-batch \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/eo-lookup-batch <languages dir> <code> <imported dictionary> [--options <id,...>]
//                         [--max-results N] [--scan-length N] < texts
//
// Each input line is looked up with Lookup::lookup (16 results and scan
// length 16 unless given; language options only with --options: what a
// host's hover does by default) and answered with one JSON line:
// {"text", "results": [{"expression", "matched", "deinflected", "trace":
// [ids], "dictionaryRules": [bool per step], "tags", "rules"}]}. tags are the
// definition tags of the result's glossaries joined with spaces in glossary
// order, rules the term's part-of-speech rules.

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

std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  std::string item;
  std::istringstream in(s);
  while (std::getline(in, item, sep)) {
    if (!item.empty()) out.push_back(item);
  }
  return out;
}
}  // namespace

int main(int argc, char** argv) {
  if (argc < 4) {
    std::cerr << "usage: eo-lookup-batch <languages dir> <code> <imported dictionary> [--options <id,...>] "
                 "[--max-results N] [--scan-length N] < texts\n";
    return 2;
  }
  const std::string dir = argv[1];
  const std::string code = argv[2];
  int max_results = 16;
  size_t scan_length = 16;
  std::vector<std::string> language_options;
  for (int i = 4; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--options" && i + 1 < argc) {
      language_options = split(argv[++i], ',');
    } else if (arg == "--max-results" && i + 1 < argc) {
      max_results = std::stoi(argv[++i]);
    } else if (arg == "--scan-length" && i + 1 < argc) {
      scan_length = std::stoul(argv[++i]);
    } else {
      std::cerr << "unknown argument " << arg << "\n";
      return 2;
    }
  }
  hoshidicts::LanguageRegistry registry;
  std::string error;
  if (!registry.add_directory(dir, &error) || !registry.find(code)) {
    std::cerr << "cannot load the pack " << code << " from " << dir << ": " << error << "\n";
    return 1;
  }
  DictionaryQuery query;
  if (!query.add_term_dict(argv[3])) {
    std::cerr << "cannot load " << argv[3] << ": " << query.last_error() << "\n";
    return 1;
  }
  const Lookup lookup(query, registry);
  LookupOptions options;
  options.language = code;
  options.language_options = language_options;
  std::string text;
  while (std::getline(std::cin, text)) {
    const auto results = lookup.lookup(text, max_results, scan_length, options);
    std::string out = "{\"text\":" + quote(text) + ",\"results\":[";
    for (size_t i = 0; i < results.size(); ++i) {
      const auto& r = results[i];
      if (i) out += ",";
      std::string tags;
      for (const auto& g : r.term.glossaries) {
        if (!tags.empty()) tags += " ";
        tags += g.definition_tags;
      }
      const std::string& rules = r.term.rules;
      out += "{\"expression\":" + quote(r.term.expression) + ",\"matched\":" + quote(r.matched) +
             ",\"deinflected\":" + quote(r.deinflected) + ",\"tags\":" + quote(tags) + ",\"rules\":" + quote(rules) +
             ",\"trace\":[";
      for (size_t j = 0; j < r.trace.size(); ++j) {
        if (j) out += ",";
        out += quote(r.trace[j].id);
      }
      out += "],\"dictionaryRules\":[";
      for (size_t j = 0; j < r.trace.size(); ++j) {
        if (j) out += ",";
        out += r.trace[j].from_dictionary ? "true" : "false";
      }
      out += "]}";
    }
    out += "]}\n";
    std::cout << out;
  }
  return 0;
}
