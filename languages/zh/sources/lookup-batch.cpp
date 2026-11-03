// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements). Not built by
// CMake and not run by any test. Build it against a configured build:
//
//   g++ -O2 -std=c++23 -Iinclude languages/zh/sources/lookup-batch.cpp -o build/zh-lookup-batch \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/zh-lookup-batch <languages dir> <code> <imported dictionary>[,<imported dictionary>...]
//       [--max-results N] [--scan-length N] [--options id,...] [--exempt] < texts
//
// Each input line is looked up with Lookup::lookup (default 16 results, scan
// length 16, no language options: what a host's hover does) and answered with
// one JSON line: {"text", "results": [{"expression", "reading", "matched",
// "trace": [ids], "formOf", "gloss"}]}. formOf is true when every glossary of
// the result has the definition tag non-lemma (a form-of row of
// wiktionary-to-yomitan); gloss is the start of the first glossary's text.
// --exempt puts every dictionary in LookupOptions::pos_filter_exempt, so terms
// without part-of-speech tags pass the filter whatever a deinflection's
// conditions: what the pack field lookup.untaggedTerms "pass" does for
// dictionaries whose rules column is empty.

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

// The displayed text of a glossary (its JSON's plain strings and the
// `content` and `text` of structured content, without `data`, `tag`, `lang`
// and the other attributes), up to about `limit` bytes.
class GlossText {
 public:
  GlossText(const std::string& json, size_t limit) : s_(json), limit_(limit) {}
  std::string run() {
    value(true);
    if (out_.size() > limit_) {
      size_t cut = limit_;
      while (cut > 0 && (static_cast<unsigned char>(out_[cut]) & 0xC0) == 0x80) --cut;
      out_.resize(cut);
    }
    return out_;
  }

 private:
  void ws() {
    while (i_ < s_.size() && (s_[i_] == ' ' || s_[i_] == '\n' || s_[i_] == '\t' || s_[i_] == '\r')) ++i_;
  }
  std::string string() {
    std::string v;
    ++i_;  // opening quote
    while (i_ < s_.size() && s_[i_] != '"') {
      if (s_[i_] == '\\' && i_ + 1 < s_.size()) {
        const char e = s_[++i_];
        if (e == 'n') {
          v += ' ';
        } else if (e == 'u' && i_ + 4 < s_.size()) {
          const unsigned cp = std::stoul(s_.substr(i_ + 1, 4), nullptr, 16);
          i_ += 4;
          if (cp < 0x80) {
            v += static_cast<char>(cp);
          } else if (cp < 0x800) {
            v += static_cast<char>(0xC0 | (cp >> 6));
            v += static_cast<char>(0x80 | (cp & 0x3F));
          } else {
            v += static_cast<char>(0xE0 | (cp >> 12));
            v += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
            v += static_cast<char>(0x80 | (cp & 0x3F));
          }
        } else {
          v += e;
        }
        ++i_;
      } else {
        v += s_[i_++];
      }
    }
    ++i_;  // closing quote
    return v;
  }
  void emit(const std::string& text) {
    if (out_.size() >= limit_ || text.empty()) return;
    if (!out_.empty()) out_ += ' ';
    out_ += text;
  }
  void value(bool shown) {
    ws();
    if (i_ >= s_.size()) return;
    const char c = s_[i_];
    if (c == '"') {
      const std::string v = string();
      if (shown) emit(v);
    } else if (c == '[') {
      ++i_;
      for (ws(); i_ < s_.size() && s_[i_] != ']'; ws()) {
        value(shown);
        ws();
        if (i_ < s_.size() && s_[i_] == ',') ++i_;
      }
      ++i_;
    } else if (c == '{') {
      ++i_;
      for (ws(); i_ < s_.size() && s_[i_] != '}'; ws()) {
        const std::string key = string();
        ws();
        ++i_;  // colon
        value(shown && (key == "content" || key == "text"));
        ws();
        if (i_ < s_.size() && s_[i_] == ',') ++i_;
      }
      ++i_;
    } else {
      while (i_ < s_.size() && s_[i_] != ',' && s_[i_] != ']' && s_[i_] != '}') ++i_;
    }
  }

  const std::string& s_;
  size_t limit_;
  size_t i_ = 0;
  std::string out_;
};

std::string gloss_text(const std::string& json, size_t limit) {
  if (json.empty() || (json[0] != '[' && json[0] != '{' && json[0] != '"')) return json.substr(0, limit);
  try {
    return GlossText(json, limit).run();
  } catch (...) {
    return json.substr(0, limit);
  }
}
}  // namespace

int main(int argc, char** argv) {
  if (argc < 4) {
    std::cerr << "usage: zh-lookup-batch <languages dir> <code> <dictionary>[,<dictionary>...] [--max-results N] "
                 "[--scan-length N] [--options id,...] [--exempt] < texts\n";
    return 2;
  }
  const std::string dir = argv[1];
  const std::string code = argv[2];
  std::vector<std::string> dictionaries;
  {
    std::stringstream list(argv[3]);
    for (std::string path; std::getline(list, path, ',');) {
      if (!path.empty()) dictionaries.push_back(path);
    }
  }
  int max_results = 16;
  size_t scan_length = 16;
  bool exempt = false;
  std::vector<std::string> language_options;
  for (int i = 4; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--max-results" && i + 1 < argc) {
      max_results = std::stoi(argv[++i]);
    } else if (arg == "--scan-length" && i + 1 < argc) {
      scan_length = std::stoul(argv[++i]);
    } else if (arg == "--options" && i + 1 < argc) {
      std::stringstream list(argv[++i]);
      for (std::string id; std::getline(list, id, ',');) {
        if (!id.empty()) language_options.push_back(id);
      }
    } else if (arg == "--exempt") {
      exempt = true;
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
  for (const auto& path : dictionaries) {
    if (!query.add_term_dict(path)) {
      std::cerr << "cannot load " << path << ": " << query.last_error() << "\n";
      return 1;
    }
  }
  const Lookup lookup(query, registry);
  LookupOptions options;
  options.language = code;
  options.language_options = language_options;
  if (exempt) options.pos_filter_exempt = dictionaries;
  std::string text;
  while (std::getline(std::cin, text)) {
    const auto results = lookup.lookup(text, max_results, scan_length, options);
    std::string out = "{\"text\":" + quote(text) + ",\"results\":[";
    for (size_t i = 0; i < results.size(); ++i) {
      const auto& r = results[i];
      if (i) out += ",";
      out += "{\"expression\":" + quote(r.term.expression) + ",\"reading\":" + quote(r.term.reading) +
             ",\"matched\":" + quote(r.matched) + ",\"formOf\":" + (form_of(r.term) ? "true" : "false") +
             ",\"trace\":[";
      for (size_t j = 0; j < r.trace.size(); ++j) {
        if (j) out += ",";
        out += quote(r.trace[j].id);
      }
      out += "],\"gloss\":" + quote(r.term.glossaries.empty() ? std::string() : gloss_text(r.term.glossaries[0].glossary, 160)) + "}";
    }
    out += "]}\n";
    std::cout << out;
  }
  return 0;
}
