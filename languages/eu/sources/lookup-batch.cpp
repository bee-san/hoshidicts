// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements), as a host's
// hover makes them. Not built by CMake and not run by any test. Build it
// against a configured build from the repository root:
//
//   g++ -O2 -std=c++23 -Iinclude languages/eu/sources/lookup-batch.cpp -o build/eu-lookup-batch \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/eu-lookup-batch <languages dir> <code> <imported dictionary> [max_results] [scan_length] < texts
//
// Each input line is looked up with Lookup::lookup (16 results, scan length
// 16, no language options: what a host's hover does) and answered with one
// JSON line: {"text", "results": [{"expression", "matched", "trace": [ids],
// "dict": [bool per trace step: named by a form-of reference], "glossaries":
// count}]}. A form-of row is never a result (the pack follows references,
// docs/languages.md 9.10), so every result has a definition.

#include <iostream>
#include <string>

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
    std::cerr << "usage: eu-lookup-batch <languages dir> <code> <imported dictionary> [max_results] [scan_length] < texts\n";
    return 2;
  }
  const std::string dir = argv[1];
  const std::string code = argv[2];
  const int max_results = argc > 4 ? std::stoi(argv[4]) : 16;
  const size_t scan_length = argc > 5 ? std::stoul(argv[5]) : 16;
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
  std::string text;
  while (std::getline(std::cin, text)) {
    const auto results = lookup.lookup(text, max_results, scan_length, options);
    std::string out = "{\"text\":" + quote(text) + ",\"results\":[";
    for (size_t i = 0; i < results.size(); ++i) {
      const auto& r = results[i];
      if (i) out += ",";
      out += "{\"expression\":" + quote(r.term.expression) + ",\"matched\":" + quote(r.matched) +
             ",\"glossaries\":" + std::to_string(r.term.glossaries.size()) + ",\"trace\":[";
      for (size_t j = 0; j < r.trace.size(); ++j) {
        if (j) out += ",";
        out += quote(r.trace[j].id);
      }
      out += "],\"dict\":[";
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
