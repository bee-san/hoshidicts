// SPDX-License-Identifier: GPL-3.0-or-later
// Batch lookups for the measurements of README.md (Measurements), after
// languages/en/sources/lookup-batch.cpp. Not built by CMake and not run by any
// test. Build it against a configured build:
//
//   g++ -O2 -std=c++23 -Iinclude languages/tl/sources/lookup-batch.cpp -o build/tl-lookup-batch \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/tl-lookup-batch <languages dir> <code> <imported dictionary> [--transforms <file>] < texts
//
// Each input line is looked up with Lookup::lookup (16 results, scan length
// 16, no language options: what a host's hover does) and answered with one
// JSON line: {"text", "results": [{"expression", "matched", "deinflected",
// "steps", "trace": [[id, fromDictionary], ...]}]}. A form-of reference's
// trace steps are marked fromDictionary (wiktionary-to-yomitan names them
// "progressive", "completive", ..., which are also ids of the pack's own
// transforms). With --transforms the pack's rules are replaced by the file's,
// as hoshidicts-cli does (docs/languages.md, section 10.3).

#include <fstream>
#include <iostream>
#include <memory>
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
}  // namespace

int main(int argc, char** argv) {
  if (argc < 4) {
    std::cerr << "usage: tl-lookup-batch <languages dir> <code> <imported dictionary> [--transforms <file>] < texts\n";
    return 2;
  }
  const std::string dir = argv[1];
  const std::string code = argv[2];
  std::string transforms;
  for (int i = 4; i + 1 < argc; ++i) {
    if (std::string(argv[i]) == "--transforms") transforms = argv[i + 1];
  }
  hoshidicts::LanguageRegistry registry;
  std::string error;
  if (transforms.empty()) {
    if (!registry.add_directory(dir, &error) || !registry.find(code)) {
      std::cerr << "cannot load the pack " << code << " from " << dir << ": " << error << "\n";
      return 1;
    }
  } else if (!registry.add(read(dir + "/" + code + "/language.json"), read(transforms), &error)) {
    std::cerr << "cannot load the pack " << code << " with " << transforms << ": " << error << "\n";
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
    const auto results = lookup.lookup(text, 16, 16, options);
    std::string out = "{\"text\":" + quote(text) + ",\"results\":[";
    for (size_t i = 0; i < results.size(); ++i) {
      const auto& r = results[i];
      if (i) out += ",";
      out += "{\"expression\":" + quote(r.term.expression) + ",\"matched\":" + quote(r.matched) +
             ",\"deinflected\":" + quote(r.deinflected) + ",\"steps\":" + std::to_string(r.preprocessor_steps) + ",\"trace\":[";
      for (size_t j = 0; j < r.trace.size(); ++j) {
        if (j) out += ",";
        out += "[" + quote(r.trace[j].id) + "," + (r.trace[j].from_dictionary ? "true" : "false") + "]";
      }
      out += "]}";
    }
    out += "]}\n";
    std::cout << out;
  }
  return 0;
}
