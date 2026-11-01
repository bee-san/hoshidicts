// SPDX-License-Identifier: GPL-3.0-or-later
// The language pack conformance test (docs/languages.md, section 12.1), run
// once per pack directory:
//
//   language-conformance-test <languages/<code>> [<scratch dir>]
//
// 1. language.json and the transforms file it names parse and pass the schema
//    checks (src/languages/pack.cpp), `code` is the directory name, and a
//    built-in pack's embedded copy is byte-identical to the directory.
// 2. tests/classes.json (written by `node tools/check-classes.mjs <code>
//    --write`) equals what the engine computes: every class, every other
//    field that holds a class, and every `pattern` and `case` step on the
//    pack's corpus strings.
// 3. Every pattern is in the dialect and compiles; no `todo` rules (the parser
//    refuses both).
// 4. Every TSV in tests/ except gaps.tsv passes; gaps.tsv is run and its pass
//    count printed; no corpus input reaches the 4,096-variant limit.
// 5. Every `own` and `both` transform has a passing `valid = 1` row; the
//    rules no row exercises are printed.
// 6. README.md has the sections of languages/_template/README.md.
#include <glaze/glaze.hpp>
#include <utf8proc.h>

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <random>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include "hoshidicts/importer.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"
#include "languages/builtin_packs.hpp"
#include "languages/corpus.hpp"
#include "languages/pack.hpp"
#include "languages/steps.hpp"

namespace fs = std::filesystem;
namespace lang = hoshidicts::lang;

namespace {

int failures = 0;
std::string code;

void fail(const std::string& what) {
  ++failures;
  std::fprintf(stderr, "FAIL %s: %s\n", code.c_str(), what.c_str());
}

void note(const std::string& what) { std::printf("%s: %s\n", code.c_str(), what.c_str()); }

bool read_file(const fs::path& path, std::string& out) {
  std::ifstream file(path, std::ios::binary);
  if (!file) return false;
  out.assign(std::istreambuf_iterator<char>(file), {});
  return true;
}

std::string ranges_text(const std::vector<lang::CodePointRange>& ranges) {
  std::string out;
  for (const auto& r : ranges) out += "[" + std::to_string(r.first) + "," + std::to_string(r.last) + "]";
  return out;
}

// [[first, last], ...] from classes.json, as text in the form ranges_text writes.
bool json_ranges(const glz::generic& value, std::string& out) {
  if (!value.is_array()) return false;
  out.clear();
  for (const auto& pair : value.get_array()) {
    if (!pair.is_array() || pair.get_array().size() != 2 || !pair.get_array()[0].is_number() ||
        !pair.get_array()[1].is_number()) {
      return false;
    }
    out += "[" + std::to_string(static_cast<long long>(pair.get_array()[0].get_number())) + "," +
           std::to_string(static_cast<long long>(pair.get_array()[1].get_number())) + "]";
  }
  return true;
}

// The pack's corpus strings (tools/lib/pack.mjs corpusStrings): the sources of
// every deinflection TSV, text.tsv inputs, lookup.tsv texts, then host.sample.
std::vector<std::string> corpus_strings(const fs::path& tests, const lang::PackData& pack) {
  std::vector<std::string> out;
  std::set<std::string> seen;
  const auto add = [&](const std::string& s) {
    if (!s.empty() && seen.insert(s).second) out.push_back(s);
  };
  std::string error;
  for (const char* name : {"yomitan.tsv", "corpus.tsv", "cases.tsv", "gaps.tsv"}) {
    std::vector<lang::CorpusRow> rows;
    if (fs::exists(tests / name) && lang::read_corpus((tests / name).string(), rows, &error)) {
      for (const auto& row : rows) add(row.source);
    }
  }
  std::vector<lang::TextRow> text_rows;
  if (fs::exists(tests / "text.tsv") && lang::read_text_tsv((tests / "text.tsv").string(), text_rows, &error)) {
    for (const auto& row : text_rows) add(row.input);
  }
  std::vector<lang::LookupRow> lookup_rows;
  if (fs::exists(tests / "lookup.tsv") && lang::read_lookup_tsv((tests / "lookup.tsv").string(), lookup_rows, &error)) {
    for (const auto& row : lookup_rows) add(row.text);
  }
  for (const auto& s : pack.sample_texts) add(s);
  return out;
}

void check_classes_json(const fs::path& tests, const lang::PackData& pack) {
  std::string text;
  if (!read_file(tests / "classes.json", text)) {
    fail("tests/classes.json is missing; run node tools/check-classes.mjs " + code + " --write and commit it");
    return;
  }
  glz::generic expected;
  if (auto ec = glz::read_json(expected, text); ec || !expected.is_object()) {
    fail("tests/classes.json is not valid JSON");
    return;
  }
  const auto& root = expected.get_object();
  const auto get = [&root](std::string_view key) -> const glz::generic* {
    for (const auto& [k, v] : root) {
      if (k == key) return &v;
    }
    return nullptr;
  };
  const auto* generator = get("generator");
  if (generator == nullptr || !generator->is_string() || generator->get_string() != "tools/check-classes.mjs") {
    fail("tests/classes.json: generator is not tools/check-classes.mjs");
  }
  if (const auto* unicode = get("unicode"); unicode != nullptr && unicode->is_string()) {
    const std::string ours = utf8proc_unicode_version();
    if (!ours.starts_with(unicode->get_string())) {
      note("tests/classes.json was written with Unicode " + unicode->get_string() + ", utf8proc has " + ours);
    }
  }
  // Classes and fields, in order.
  const auto compare_ranges = [&](const char* key, const std::vector<std::pair<std::string, lang::CharClass>>& ours) {
    const auto* section = get(key);
    if (section == nullptr || !section->is_object()) {
      fail(std::string("tests/classes.json has no ") + key);
      return;
    }
    const auto& theirs = section->get_object();
    if (theirs.size() != ours.size()) {
      fail(std::string("tests/classes.json lists ") + std::to_string(theirs.size()) + " " + key + ", the engine has " +
           std::to_string(ours.size()) + "; run node tools/check-classes.mjs " + code + " --write");
    }
    size_t i = 0;
    for (const auto& [name, value] : theirs) {
      if (i >= ours.size()) break;
      if (ours[i].first != name) {
        fail(std::string(key) + "[" + std::to_string(i) + "] is " + name + " in tests/classes.json, " + ours[i].first +
             " in the engine");
        ++i;
        continue;
      }
      std::string want;
      if (!json_ranges(value, want)) {
        fail(std::string(key) + "." + name + " is not a list of ranges");
      } else if (want != ranges_text(ours[i].second.ranges())) {
        fail(std::string(key) + "." + name + ": the engine accepts other code points than JavaScript");
      }
      ++i;
    }
  };
  compare_ranges("classes", pack.classes);
  compare_ranges("fields", pack.class_fields);

  // Steps: every pattern and case step on every corpus string.
  struct StepCase {
    std::string processor;
    size_t index;
    const lang::Step* step;
  };
  std::vector<StepCase> ours;
  for (const auto& named : pack.named_steps) {
    for (size_t k = 0; k < named.steps.size(); ++k) {
      const auto kind = named.steps[k]->kind;
      if (kind == lang::StepKind::Case || kind == lang::StepKind::Pattern) ours.push_back({named.name, k, named.steps[k]});
    }
  }
  const auto* steps = get("steps");
  if (steps == nullptr || !steps->is_array()) {
    fail("tests/classes.json has no steps");
    return;
  }
  const auto& theirs = steps->get_array();
  if (theirs.size() != ours.size()) {
    fail("tests/classes.json lists " + std::to_string(theirs.size()) + " steps, the engine has " + std::to_string(ours.size()));
    return;
  }
  const auto inputs = corpus_strings(tests, pack);
  size_t outputs = 0;
  for (size_t i = 0; i < ours.size(); ++i) {
    const auto& entry = theirs[i];
    if (!entry.is_object()) {
      fail("steps[" + std::to_string(i) + "] is not an object");
      continue;
    }
    const auto& o = entry.get_object();
    std::string processor;
    double index = -1;
    const glz::generic* cases = nullptr;
    for (const auto& [k, v] : o) {
      if (k == "processor" && v.is_string()) processor = v.get_string();
      if (k == "step" && v.is_number()) index = v.get_number();
      if (k == "cases" && v.is_array()) cases = &v;
    }
    if (processor != ours[i].processor || index != static_cast<double>(ours[i].index) || cases == nullptr) {
      fail("steps[" + std::to_string(i) + "] is " + processor + " step " + std::to_string(static_cast<long long>(index)) +
           ", the engine's is " + ours[i].processor + " step " + std::to_string(ours[i].index));
      continue;
    }
    const auto& list = cases->get_array();
    if (list.size() != inputs.size()) {
      fail("steps[" + std::to_string(i) + "] has " + std::to_string(list.size()) + " cases for " +
           std::to_string(inputs.size()) + " corpus strings");
      continue;
    }
    for (size_t k = 0; k < list.size(); ++k) {
      const auto& c = list[k];
      if (!c.is_array() || c.get_array().size() != 2 || !c.get_array()[0].is_string() || !c.get_array()[1].is_string() ||
          c.get_array()[0].get_string() != inputs[k]) {
        fail("steps[" + std::to_string(i) + "].cases[" + std::to_string(k) + "] is not for " + inputs[k]);
        break;
      }
      std::u32string in;
      lang::decode_utf8(inputs[k], in);
      std::u32string out;
      lang::apply_step(*ours[i].step, in, out);
      ++outputs;
      if (lang::to_utf8(out) != c.get_array()[1].get_string()) {
        fail(ours[i].processor + " step " + std::to_string(ours[i].index) + " on " + inputs[k] + " gives " + lang::to_utf8(out) +
             ", JavaScript " + c.get_array()[1].get_string());
      }
    }
  }
  note("classes.json: " + std::to_string(pack.classes.size()) + " classes, " + std::to_string(pack.class_fields.size()) +
       " fields, " + std::to_string(ours.size()) + " steps (" + std::to_string(outputs) + " outputs) agree");
}

// --- lookup.tsv: a stored ZIP of tests/dictionary/, imported -------------------------

uint32_t crc32(const std::string& data) {
  uint32_t crc = 0xFFFFFFFFu;
  for (unsigned char c : data) {
    crc ^= c;
    for (int i = 0; i < 8; ++i) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
  }
  return ~crc;
}

template <typename T>
void put(std::string& out, T value) {
  char buf[sizeof(T)];
  std::memcpy(buf, &value, sizeof(T));
  out.append(buf, sizeof(T));
}

std::string zip_directory(const fs::path& dir) {
  std::vector<std::pair<std::string, std::string>> files;
  for (const auto& entry : fs::recursive_directory_iterator(dir)) {
    if (!entry.is_regular_file()) continue;
    std::string data;
    read_file(entry.path(), data);
    files.emplace_back(fs::relative(entry.path(), dir).generic_string(), std::move(data));
  }
  std::ranges::sort(files);
  std::string out;
  std::string central;
  for (const auto& [name, data] : files) {
    const auto offset = static_cast<uint32_t>(out.size());
    const uint32_t crc = crc32(data);
    const auto size = static_cast<uint32_t>(data.size());
    for (std::string* part : {&out}) {
      put<uint32_t>(*part, 0x04034b50);
      put<uint16_t>(*part, 20);
      put<uint16_t>(*part, 0x0800);  // UTF-8 names
      put<uint16_t>(*part, 0);
      put<uint16_t>(*part, 0);
      put<uint16_t>(*part, 0);
      put<uint32_t>(*part, crc);
      put<uint32_t>(*part, size);
      put<uint32_t>(*part, size);
      put<uint16_t>(*part, static_cast<uint16_t>(name.size()));
      put<uint16_t>(*part, 0);
    }
    out += name;
    out += data;
    put<uint32_t>(central, 0x02014b50);
    put<uint16_t>(central, 20);
    put<uint16_t>(central, 20);
    put<uint16_t>(central, 0x0800);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint32_t>(central, crc);
    put<uint32_t>(central, size);
    put<uint32_t>(central, size);
    put<uint16_t>(central, static_cast<uint16_t>(name.size()));
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint32_t>(central, 0);
    put<uint32_t>(central, offset);
    central += name;
  }
  const auto central_offset = static_cast<uint32_t>(out.size());
  out += central;
  put<uint32_t>(out, 0x06054b50);
  put<uint16_t>(out, 0);
  put<uint16_t>(out, 0);
  put<uint16_t>(out, static_cast<uint16_t>(files.size()));
  put<uint16_t>(out, static_cast<uint16_t>(files.size()));
  put<uint32_t>(out, static_cast<uint32_t>(central.size()));
  put<uint32_t>(out, central_offset);
  put<uint16_t>(out, 0);
  return out;
}

std::vector<std::string> all_option_ids(const lang::PackData& pack) {
  std::vector<std::string> ids;
  for (const auto* list : {&pack.preprocessors, &pack.postprocessors}) {
    for (const auto& p : *list) ids.push_back(p.id);
  }
  for (const auto& pass : pack.variant_passes) ids.push_back(pass.id);
  if (pack.transforms) {
    for (const auto& t : pack.transforms->transforms) ids.push_back(t.id);
  }
  return ids;
}

void check_lookup_tsv(const fs::path& tests, const std::shared_ptr<const hoshidicts::LanguagePack>& pack,
                      const fs::path& scratch) {
  std::vector<lang::LookupRow> rows;
  std::string error;
  if (!lang::read_lookup_tsv((tests / "lookup.tsv").string(), rows, &error)) {
    fail(error);
    return;
  }
  if (!fs::is_directory(tests / "dictionary")) {
    fail("tests/lookup.tsv needs tests/dictionary/");
    return;
  }
  const fs::path dir = scratch / ("language-" + code + "-" + std::to_string(std::random_device{}()));
  fs::create_directories(dir);
  const fs::path zip = dir / "dictionary.zip";
  {
    const std::string data = zip_directory(tests / "dictionary");
    std::ofstream(zip, std::ios::binary).write(data.data(), static_cast<std::streamsize>(data.size()));
  }
  const auto imported = dictionary_importer::import(zip.string(), dir.string());
  if (!imported.success) {
    fail("tests/dictionary does not import: " + imported.error);
    fs::remove_all(dir);
    return;
  }
  const std::string path = (dir / dictionary_importer::folder_name(imported.summary.title)).string();
  {
    DictionaryQuery query;
    query.add_term_dict(path);
    query.add_freq_dict(path);
    query.add_pitch_dict(path);
    query.add_kanji_dict(path);
    hoshidicts::LanguageRegistry registry;
    registry.add(pack);
    const Lookup lookup(query, registry);
    LookupOptions options;
    options.language = code;
    options.language_options = all_option_ids(pack->data());
    size_t passed = 0;
    for (const auto& row : rows) {
      // The whole text, as eval-language's firstRank looks a source up.
      const size_t length = [&] {
        std::u32string cps;
        lang::decode_utf8(row.text, cps);
        return cps.size();
      }();
      const auto results = lookup.lookup(row.text, 16, std::max<size_t>(16, length), options);
      const bool first = !results.empty() && results.front().term.expression == row.expression &&
                         results.front().matched == row.matched;
      if (first == row.valid) {
        ++passed;
      } else {
        fail("tests/lookup.tsv:" + std::to_string(row.line) + ": " + row.text + " -> " +
             (results.empty() ? std::string("nothing") : results.front().term.expression + " (" + results.front().matched + ")") +
             (row.valid ? ", expected " : ", not expected ") + row.expression + " (" + row.matched + ")");
      }
    }
    note("tests/lookup.tsv: " + std::to_string(passed) + "/" + std::to_string(rows.size()) + " pass");
  }
  fs::remove_all(dir);
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: language-conformance-test <languages/<code>> [<scratch dir>]\n");
    return 2;
  }
  const fs::path dir = fs::absolute(argv[1]).lexically_normal();
  const fs::path scratch = argc > 2 ? fs::path(argv[2]) : fs::temp_directory_path();
  code = (dir.filename().empty() ? dir.parent_path() : dir).filename().string();
  const fs::path tests = dir / "tests";

  // 1. Schema.
  std::string language;
  if (!read_file(dir / "language.json", language)) {
    fail("language.json is missing");
    return 1;
  }
  const std::string transforms_name = lang::transforms_file_name(language);
  std::string transforms;
  if (!transforms_name.empty() && !read_file(dir / transforms_name, transforms)) {
    fail(transforms_name + " is missing");
    return 1;
  }
  std::string error;
  const auto pack = hoshidicts::parse_language_pack(language, transforms, &error);
  if (!pack) {
    fail(error);
    return 1;
  }
  const auto& data = pack->data();
  if (data.code != code) fail("language.json: code is " + data.code + ", not the directory name " + code);
  for (size_t i = 0; i < lang::builtin_pack_count; ++i) {
    const auto& builtin = lang::builtin_packs[i];
    if (builtin.code != code) continue;
    if (lang::unpack(builtin.language_json) != language || lang::unpack(builtin.transforms_json) != transforms) {
      fail("src/languages/builtin_packs.cpp differs from languages/" + code + "; run python3 tools/embed-packs.py");
    } else {
      note("the embedded copy matches the pack");
    }
  }
  const size_t rules = data.transforms ? data.transforms->rules.size() : 0;
  note(std::to_string(data.transforms ? data.transforms->transforms.size() : 0) + " transforms, " + std::to_string(rules) +
       " rules, " + std::to_string(data.preprocessors.size()) + " preprocessors, " +
       std::to_string(data.postprocessors.size()) + " postprocessors");

  // 2. Classes and steps against JavaScript.
  check_classes_json(tests, data);

  // 4 and 5. The test files.
  std::set<std::string> known = {"yomitan.tsv", "corpus.tsv", "cases.tsv", "gaps.tsv", "text.tsv", "lookup.tsv"};
  std::error_code ec;
  if (fs::is_directory(tests, ec)) {
    for (const auto& entry : fs::directory_iterator(tests)) {
      const std::string name = entry.path().filename().string();
      if (entry.path().extension() == ".tsv" && !known.contains(name)) fail("tests/" + name + " is not a test file the contract names");
    }
  }
  if (data.transforms && !fs::exists(tests / "corpus.tsv") && !fs::exists(tests / "yomitan.tsv")) {
    fail("a pack with transforms needs tests/corpus.tsv");
  }
  std::set<size_t> exercised_rules;
  std::set<uint16_t> exercised_transforms;
  bool limit_reached = false;
  for (const char* name : {"yomitan.tsv", "corpus.tsv", "cases.tsv", "gaps.tsv"}) {
    if (!fs::exists(tests / name)) continue;
    std::vector<lang::CorpusRow> rows;
    if (!lang::read_corpus((tests / name).string(), rows, &error)) {
      fail(error);
      continue;
    }
    const bool gaps = std::string_view(name) == "gaps.tsv";
    size_t passed = 0;
    size_t shown = 0;
    for (const auto& row : rows) {
      bool limit = false;
      const auto list = lang::deinflect_source(data, row.source, &limit);
      if (limit && !limit_reached) {
        limit_reached = true;
        fail(std::string("tests/") + name + ":" + std::to_string(row.line) + ": " + row.source +
             " reaches the 4,096-variant limit");
      }
      std::vector<size_t> matching;
      error.clear();
      const bool found = lang::row_matches(data, row, list, &matching, &error);
      if (!error.empty()) {
        fail(std::string("tests/") + name + ": " + error);
        continue;
      }
      if (found == row.valid) {
        ++passed;
        if (row.valid && data.transforms) {
          for (size_t i : matching) {
            for (uint32_t r : list[i].rules) {
              exercised_rules.insert(r);
              exercised_transforms.insert(data.transforms->rules[r].transform);
            }
          }
        }
      } else if (!gaps) {
        fail(std::string("tests/") + name + ":" + std::to_string(row.line) + ": " + row.source + " -> " + row.term +
             (row.valid ? " is not among the deinflections" : " is among the deinflections"));
      } else if (shown++ < 5) {
        note(std::string("gaps.tsv:") + std::to_string(row.line) + ": " + row.source + " -> " + row.term + " still fails");
      }
    }
    note(std::string("tests/") + name + ": " + std::to_string(passed) + "/" + std::to_string(rows.size()) + " pass" +
         (gaps ? " (gaps are reported, not enforced)" : ""));
  }
  if (fs::exists(tests / "text.tsv")) {
    std::vector<lang::TextRow> rows;
    if (!lang::read_text_tsv((tests / "text.tsv").string(), rows, &error)) {
      fail(error);
    } else {
      const auto ids = all_option_ids(data);
      size_t passed = 0;
      for (const auto& row : rows) {
        bool limit = false;
        const auto variants = lang::process_text(data.preprocessors, row.input, lang::EnabledOptions{ids}, &limit);
        if (limit) fail("tests/text.tsv:" + std::to_string(row.line) + ": " + row.input + " reaches the 4,096-variant limit");
        const bool found = std::ranges::any_of(variants, [&](const lang::TextVariant& v) { return v.text == row.variant; });
        if (found == row.valid) {
          ++passed;
        } else {
          fail("tests/text.tsv:" + std::to_string(row.line) + ": " + row.input + " -> " + row.variant +
               (row.valid ? " is not a variant" : " is a variant"));
        }
      }
      note("tests/text.tsv: " + std::to_string(passed) + "/" + std::to_string(rows.size()) + " pass");
    }
  }
  if (fs::exists(tests / "lookup.tsv")) {
    check_lookup_tsv(tests, pack, scratch);
  }
  if (data.transforms) {
    for (size_t t = 0; t < data.transforms->transforms.size(); ++t) {
      const auto& transform = data.transforms->transforms[t];
      if ((transform.source == "own" || transform.source == "both") && !exercised_transforms.contains(static_cast<uint16_t>(t))) {
        fail("the " + transform.source + " transform " + transform.id + " has no passing valid = 1 row");
      }
    }
    size_t unexercised = 0;
    std::string examples;
    for (size_t r = 0; r < rules; ++r) {
      if (exercised_rules.contains(r)) continue;
      const auto& rule = data.transforms->rules[r];
      if (++unexercised <= 10) {
        examples += " " + data.transforms->transforms[rule.transform].id + "[" + std::to_string(rule.index_in_transform) + "]";
      }
    }
    note("coverage: " + std::to_string(rules - unexercised) + "/" + std::to_string(rules) + " rules exercised by a passing row" +
         (unexercised ? "; not exercised:" + examples + (unexercised > 10 ? " ..." : "") : ""));
  }

  // 6. README.md has the template's sections.
  std::string readme;
  if (!read_file(dir / "README.md", readme)) {
    fail("README.md is missing");
  } else {
    std::vector<std::string> sections;
    std::string tmpl;
    if (read_file(dir.parent_path() / "_template" / "README.md", tmpl)) {
      size_t at = 0;
      while ((at = tmpl.find("\n## ", at)) != std::string::npos) {
        const size_t end = tmpl.find('\n', at + 1);
        sections.push_back(tmpl.substr(at + 1, end - at - 1));
        at = end;
      }
    }
    if (sections.empty()) sections = {"## Sources and licences", "## Rule provenance", "## Measurements", "## Known gaps"};
    for (const auto& section : sections) {
      if (!readme.starts_with(section + "\n") && readme.find("\n" + section + "\n") == std::string::npos) {
        fail("README.md has no section \"" + section + "\"");
      }
    }
  }

  std::printf("%s: %s\n", code.c_str(), failures == 0 ? "conforms" : (std::to_string(failures) + " failures").c_str());
  return failures == 0 ? 0 : 1;
}
