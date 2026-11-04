// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements). Not built by
// CMake and not run by any test. Build it against a configured build:
//
//   g++ -O2 -std=c++23 -Iinclude languages/it/sources/lookup-batch.cpp -o build/lookup-batch-it \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/lookup-batch-it <languages dir> <code> <imported dictionary> [--options <id,...>] [--max <n>] [--scan <n>] < texts
//
// Each input line is looked up with Lookup::lookup (16 results, scan length
// 16, and no language options unless --options names some: what a host's
// hover does) and answered with one JSON line:
// {"text", "results": [{"expression", "matched", "trace": [ids], "steps",
// "fromDictionary": [bool per trace step]}]}.

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
  if (argc < 4) {
    std::cerr << "usage: lookup-batch-it <languages dir> <code> <imported dictionary> [--options <id,...>] [--max <n>] [--scan <n>] < texts\n";
    return 2;
  }
  const std::string dir = argv[1];
  const std::string code = argv[2];
  const std::string dictionary = argv[3];
  int max_results = 16;
  size_t scan_length = 16;
  std::vector<std::string> language_options;
  for (int i = 4; i + 1 < argc; i += 2) {
    const std::string flag = argv[i];
    if (flag == "--options") {
      std::istringstream ids(argv[i + 1]);
      for (std::string id; std::getline(ids, id, ',');) language_options.push_back(id);
    } else if (flag == "--max") {
      max_results = std::stoi(argv[i + 1]);
    } else if (flag == "--scan") {
      scan_length = std::stoul(argv[i + 1]);
    } else {
      std::cerr << "unknown option " << flag << "\n";
      return 2;
    }
  }
  hoshidicts::LanguageRegistry registry = hoshidicts::LanguageRegistry::with_builtin();
  std::string error;
  if (!registry.add_directory(dir, &error) || !registry.find(code)) {
    std::cerr << "cannot load the pack " << code << " from " << dir << ": " << error << "\n";
    return 1;
  }
  DictionaryQuery query;
  if (!query.add_term_dict(dictionary)) {
    std::cerr << "cannot load " << dictionary << ": " << query.last_error() << "\n";
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
      out += "{\"expression\":" + quote(r.term.expression) + ",\"matched\":" + quote(r.matched) +
             ",\"steps\":" + std::to_string(r.preprocessor_steps) + ",\"trace\":[";
      for (size_t j = 0; j < r.trace.size(); ++j) {
        if (j) out += ",";
        out += quote(r.trace[j].id);
      }
      out += "],\"fromDictionary\":[";
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
