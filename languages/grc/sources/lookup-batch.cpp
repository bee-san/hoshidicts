// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements). Not built by
// CMake and not run by any test. Build it against a configured build:
//
//   g++ -O2 -std=c++23 -Iinclude languages/grc/sources/lookup-batch.cpp -o build/lookup-batch \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/lookup-batch <languages dir> <code> <imported dictionary> [max_results] [scan_length] < texts
//
// Each input line is looked up with Lookup::lookup (default 16 results, scan
// length 16, no language options: what a host's hover does) and answered with
// one JSON line: {"text", "results": [{"expression", "reading", "matched",
// "rules", "trace": [ids], "formOf", "gloss"}]}. rules is the term's
// part-of-speech tags (the rules column of its rows). formOf is true when every glossary of
// the result has the definition tag non-lemma (a form-of row of kaikki- or
// wiktionary-to-yomitan); gloss is the text of the first glossary's definitions
// (its JSON's string values joined by spaces, from wiktionary-to-yomitan's
// "glosses" list to its "backlink", so without the grammar and etymology
// preamble; the whole glossary when it has no such list), at most 600 bytes.

#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"

namespace {
std::string read(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  std::stringstream s;
  s << f.rdbuf();
  return s.str();
}

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

// The strings of a glossary's JSON, joined by spaces (the words a reader sees):
// the definitions only, when the glossary marks them.
std::string gloss_text(const std::string& full) {
  std::string_view json = full;
  if (const size_t at = json.find("\"glosses\""); at != std::string_view::npos) {
    json = json.substr(at + 9);
    if (const size_t end = json.find("\"backlink\""); end != std::string_view::npos) json = json.substr(0, end);
  }
  std::string out;
  bool in = false, escape = false, key = false;
  std::string cur;
  for (size_t i = 0; i < json.size() && out.size() < 600; ++i) {
    const char c = json[i];
    if (!in) {
      if (c == '"') { in = true; cur.clear(); }
      continue;
    }
    if (escape) { cur += c; escape = false; continue; }
    if (c == '\\') { escape = true; continue; }
    if (c == '"') {
      in = false;
      size_t j = i + 1;
      while (j < json.size() && json[j] == ' ') ++j;
      key = j < json.size() && json[j] == ':';
      if (!key && !cur.empty()) { if (!out.empty()) out += ' '; out += cur; }
      continue;
    }
    cur += c;
  }
  if (out.size() > 600) {
    size_t cut = 600;
    while (cut > 0 && (static_cast<unsigned char>(out[cut]) & 0xC0) == 0x80) --cut;
    out.resize(cut);
  }
  return out;
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
    std::cerr << "usage: lookup-batch <languages dir> <code> <imported dictionary> [max_results] [scan_length] < texts\n";
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
      out += "{\"expression\":" + quote(r.term.expression) + ",\"reading\":" + quote(r.term.reading) +
             ",\"rules\":" + quote(r.term.rules) +
             ",\"matched\":" + quote(r.matched) + ",\"formOf\":" + (form_of(r.term) ? "true" : "false") +
             ",\"gloss\":" + quote(r.term.glossaries.empty() ? std::string() : gloss_text(r.term.glossaries.front().glossary)) +
             ",\"trace\":[";
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
