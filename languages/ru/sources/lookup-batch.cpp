// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements), adapted from
// languages/en/sources/lookup-batch.cpp. Not built by CMake and not run by any
// test. Build it against a configured build:
//
//   g++ -O2 -std=c++23 -Iinclude languages/ru/sources/lookup-batch.cpp -o build/lookup-batch-ru \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/lookup-batch-ru <languages dir> <code> <imported dictionary> [--exempt] [--max <n>] [--scan <n>] < texts
//
// Each input line is looked up with Lookup::lookup (16 results, scan length
// 16, no language options: what a host's hover does) and answered with one
// JSON line: {"text", "results": [{"expression", "matched", "trace": [ids],
// "formOf", "tags", "steps"}]}; steps are its processor steps. formOf is true when every glossary of the result has
// the definition tag non-lemma (a form-of row of wiktionary-to-yomitan);
// tags are the definition tags of its first glossary. --exempt puts the
// dictionary in LookupOptions::pos_filter_exempt, so its terms without part
// of speech pass the filter (a labelled measurement, docs/languages.md 9.4).
// The pack has no optional processor, transform or pass, so a lookup with
// every option on is the same lookup.

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
  if (argc < 4) {
    std::cerr << "usage: lookup-batch-ru <languages dir> <code> <imported dictionary> [--exempt] [--max n] [--scan n] < texts\n";
    return 2;
  }
  const std::string dir = argv[1];
  const std::string code = argv[2];
  const std::string dictionary = argv[3];
  bool exempt = false;
  int max_results = 16;
  size_t scan_length = 16;
  for (int i = 4; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--exempt") {
      exempt = true;
    } else if (arg == "--max" && i + 1 < argc) {
      max_results = std::stoi(argv[++i]);
    } else if (arg == "--scan" && i + 1 < argc) {
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
  if (!query.add_term_dict(dictionary)) {
    std::cerr << "cannot load " << dictionary << ": " << query.last_error() << "\n";
    return 1;
  }
  const Lookup lookup(query, registry);
  LookupOptions options;
  options.language = code;
  if (exempt) options.pos_filter_exempt.push_back(dictionary);
  std::string text;
  while (std::getline(std::cin, text)) {
    const auto results = lookup.lookup(text, max_results, scan_length, options);
    std::string out = "{\"text\":" + quote(text) + ",\"results\":[";
    for (size_t i = 0; i < results.size(); ++i) {
      const auto& r = results[i];
      if (i) out += ",";
      const std::string tags = r.term.glossaries.empty() ? std::string() : r.term.glossaries.front().definition_tags;
      out += "{\"expression\":" + quote(r.term.expression) + ",\"matched\":" + quote(r.matched) +
             ",\"formOf\":" + (form_of(r.term) ? "true" : "false") + ",\"tags\":" + quote(tags) +
             ",\"steps\":" + std::to_string(r.preprocessor_steps) + ",\"trace\":[";
      for (size_t j = 0; j < r.trace.size(); ++j) {
        if (j) out += ",";
        out += quote(r.trace[j].id);
      }
      out += "]}";
    }
    out += "]}\n";
    std::cout << out;
  }
  return 0;
}
