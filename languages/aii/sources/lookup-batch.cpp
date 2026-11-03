// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements), adapted from
// languages/en/sources/lookup-batch.cpp. Not built by CMake and not run by any
// test. Build it against a configured build:
//
//   g++ -O2 -std=c++23 -Iinclude languages/aii/sources/lookup-batch.cpp -o build/aii-lookup-batch \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/aii-lookup-batch <languages dir> <imported dictionary> [--options id,...] [--max N] [--scan N] < texts
//
// Each input line is looked up with Lookup::lookup (16 results, scan length
// 16, the given language options; none by default, as a host's hover does)
// and answered with one JSON line: {"text", "results": [{"expression",
// "matched", "deinflected", "steps", "trace": [ids], "fromDictionary": [bools],
// "formOf"}]}. formOf is true when every glossary of the result has the
// definition tag non-lemma (a form-of row of wiktionary-to-yomitan).

#include <fstream>
#include <iostream>
#include <sstream>
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

bool form_of(const TermResult& term) {
  if (term.glossaries.empty()) return false;
  for (const auto& g : term.glossaries) {
    bool found = false;
    std::istringstream tags(g.definition_tags);
    for (std::string tag; tags >> tag;) found = found || tag == "non-lemma";
    if (!found) return false;
  }
  return true;
}
}  // namespace

int main(int argc, char** argv) {
  if (argc < 3) {
    std::cerr << "usage: aii-lookup-batch <languages dir> <imported dictionary> [--options id,...] [--max N] [--scan N] < texts\n";
    return 2;
  }
  const std::string dir = argv[1];
  LookupOptions options;
  options.language = "aii";
  int max_results = 16;
  size_t scan_length = 16;
  for (int i = 3; i + 1 < argc; i += 2) {
    const std::string flag = argv[i];
    if (flag == "--options") {
      std::istringstream ids(argv[i + 1]);
      for (std::string id; std::getline(ids, id, ',');) options.language_options.push_back(id);
    } else if (flag == "--max") {
      max_results = std::stoi(argv[i + 1]);
    } else if (flag == "--scan") {
      scan_length = std::stoul(argv[i + 1]);
    }
  }
  hoshidicts::LanguageRegistry registry;
  std::string error;
  if (!registry.add_directory(dir, &error) || !registry.find("aii")) {
    std::cerr << "cannot load the pack aii from " << dir << ": " << error << "\n";
    return 1;
  }
  DictionaryQuery query;
  if (!query.add_term_dict(argv[2])) {
    std::cerr << "cannot load " << argv[2] << ": " << query.last_error() << "\n";
    return 1;
  }
  const Lookup lookup(query, registry);
  std::string text;
  while (std::getline(std::cin, text)) {
    const auto results = lookup.lookup(text, max_results, scan_length, options);
    std::string out = "{\"text\":" + quote(text) + ",\"results\":[";
    for (size_t i = 0; i < results.size(); ++i) {
      const auto& r = results[i];
      if (i) out += ",";
      out += "{\"expression\":" + quote(r.term.expression) + ",\"matched\":" + quote(r.matched) +
             ",\"deinflected\":" + quote(r.deinflected) + ",\"steps\":" + std::to_string(r.preprocessor_steps) +
             ",\"formOf\":" + (form_of(r.term) ? "true" : "false") + ",\"trace\":[";
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
