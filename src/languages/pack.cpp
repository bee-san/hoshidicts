// SPDX-License-Identifier: GPL-3.0-or-later
#include "pack.hpp"

#include "json.hpp"
#include "size.hpp"

#include <algorithm>
#include <cmath>
#include <initializer_list>
#include <map>
#include <set>
#include <stdexcept>

namespace hoshidicts::lang {

HOSHIDICTS_LOAD_TIME_BEGIN

namespace {

using Json = json::Value;
using Object = json::Object;
using Array = json::Array;

constexpr size_t max_affix_code_points = 64;
constexpr size_t max_condition_bits = 32;

struct Failure : std::runtime_error {
  using std::runtime_error::runtime_error;
};

[[noreturn]] void fail(const std::string& path, const std::string& reason) {
  throw Failure(path.empty() ? reason : path + ": " + reason);
}

bool is_identifier(std::string_view key) {
  if (key.empty()) return false;
  const auto start = [](char c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_'; };
  if (!start(key[0])) return false;
  return std::ranges::all_of(key, [&](char c) { return start(c) || (c >= '0' && c <= '9'); });
}

std::string json_quote(std::string_view s) {
  std::string out = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') out += '\\';
    out += c;
  }
  return out + "\"";
}

std::string member(const std::string& path, std::string_view key) {
  if (is_identifier(key)) return path.empty() ? std::string(key) : path + "." + std::string(key);
  return path + "[" + json_quote(key) + "]";
}

std::string item(const std::string& path, size_t i) { return path + "[" + std::to_string(i) + "]"; }

const char* type_name(const Json& v) {
  if (v.is_null()) return "null";
  if (v.is_boolean()) return "a boolean";
  if (v.is_number()) return "a number";
  if (v.is_string()) return "a string";
  if (v.is_array()) return "an array";
  return "an object";
}

Object as_object(const Json& v, const std::string& path) {
  if (!v.is_object()) fail(path, std::string("must be an object, not ") + type_name(v));
  return v.get_object();
}

Array as_array(const Json& v, const std::string& path) {
  if (!v.is_array()) fail(path, std::string("must be an array, not ") + type_name(v));
  return v.get_array();
}

std::string_view as_string(const Json& v, const std::string& path) {
  if (!v.is_string()) fail(path, std::string("must be a string, not ") + type_name(v));
  return v.get_string();
}

std::string member(const std::string& path, std::string_view key);

// The string `key` of `o`, with its JSON path built only when it is missing
// or not a string (the rule parser reads thousands of them).
std::string_view string_field(const Json* v, std::string_view key, const std::string& path) {
  if (v == nullptr) fail(path, "missing required key \"" + std::string(key) + "\"");
  if (!v->is_string()) fail(member(path, key), std::string("must be a string, not ") + type_name(*v));
  return v->get_string();
}

bool as_bool(const Json& v, const std::string& path) {
  if (!v.is_boolean()) fail(path, std::string("must be a boolean, not ") + type_name(v));
  return v.get_boolean();
}

double as_number(const Json& v, const std::string& path) {
  if (!v.is_number()) fail(path, std::string("must be a number, not ") + type_name(v));
  return v.get_number();
}

size_t as_count(const Json& v, const std::string& path, size_t minimum) {
  const double d = as_number(v, path);
  if (d != std::floor(d) || d < static_cast<double>(minimum) || d > 1e9) {
    fail(path, "must be an integer of at least " + std::to_string(minimum));
  }
  return static_cast<size_t>(d);
}

const Json* get(const Object& o, std::string_view key) { return o.find(key); }

const Json& require(const Object& o, std::string_view key, const std::string& path) {
  const Json* v = get(o, key);
  if (v == nullptr) fail(path, "missing required key " + json_quote(key));
  return *v;
}

void check_keys(const Object& o, const std::string& path, std::initializer_list<std::string_view> allowed) {
  for (const auto& [k, v] : o) {
    if (std::ranges::find(allowed, std::string_view(k)) == allowed.end()) {
      fail(member(path, k), "unknown key");
    }
  }
}

void check_keys(const Object& o, const std::string& path, const std::vector<std::string_view>& allowed) {
  for (const auto& [k, v] : o) {
    if (std::ranges::find(allowed, std::string_view(k)) == allowed.end()) {
      fail(member(path, k), "unknown key");
    }
  }
}

std::vector<std::string> string_array(const Json& v, const std::string& path) {
  std::vector<std::string> out;
  const Array a = as_array(v, path);
  out.reserve(a.size());
  for (size_t i = 0; i < a.size(); ++i) {
    if (!a[i].is_string()) fail(item(path, i), std::string("must be a string, not ") + type_name(a[i]));
    out.emplace_back(a[i].get_string());
  }
  return out;
}

std::string_view one_of(const Json& v, const std::string& path, std::initializer_list<std::string_view> values) {
  const std::string_view s = as_string(v, path);
  if (std::ranges::find(values, std::string_view(s)) == values.end()) {
    std::string list;
    for (auto value : values) list += (list.empty() ? "" : ", ") + std::string(value);
    fail(path, "must be one of " + list + ", not " + json_quote(s));
  }
  return s;
}

size_t code_point_count(std::string_view s) {
  size_t n = 0;
  for (unsigned char c : s) n += (c & 0xC0) != 0x80;
  return n;
}

std::u32string decode(std::string_view s, const std::string& path) {
  std::u32string out;
  if (!decode_utf8(s, out)) fail(path, "is not valid UTF-8");
  return out;
}

void parse_json(std::string_view text, json::Document& document) {
  if (text.starts_with("\xEF\xBB\xBF")) fail("", "pack files are UTF-8 without a byte-order mark");
  std::string error;
  if (!document.parse(text, &error)) fail("", "not valid JSON: " + error);
}

struct PackParser {
  PackData& pack;
  std::string file = "language.json";

  // Named classes: parsed on first use, so references may point forward.
  Object class_definitions;
  std::map<std::string, std::unique_ptr<CharClass>, std::less<>> named;
  std::vector<std::string> resolving;

  const CharClass* resolve(std::string_view name, std::string* error) {
    if (auto it = named.find(name); it != named.end()) return it->second.get();
    const Json* definition = class_definitions.find(name);
    if (definition == nullptr) {
      *error = "{" + std::string(name) + "} names no class of this pack";
      return nullptr;
    }
    if (std::ranges::find(resolving, name) != resolving.end()) {
      std::string cycle;
      for (auto it = std::ranges::find(resolving, name); it != resolving.end(); ++it) cycle += *it + " -> ";
      *error = "class references form a cycle: " + cycle + std::string(name);
      return nullptr;
    }
    const std::string path = member("classes", name);
    if (!definition->is_string()) {
      *error = path + ": a class must be a string";
      return nullptr;
    }
    resolving.emplace_back(name);
    std::string inner;
    auto parsed = parse_class(definition->get_string(), resolver(), &inner);
    resolving.pop_back();
    if (!parsed) {
      *error = inner.starts_with("classes") ? inner : path + ": " + inner;
      return nullptr;
    }
    auto [it, inserted] = named.emplace(std::string(name), std::make_unique<CharClass>(std::move(*parsed)));
    return it->second.get();
  }

  ClassResolver resolver() {
    return [this](std::string_view name, std::string* error) { return resolve(name, error); };
  }

  CharClass class_field(const Json& v, const std::string& path) {
    const std::string_view source = as_string(v, path);
    std::string error;
    auto parsed = parse_class(source, resolver(), &error);
    if (!parsed) fail(path, error);
    return std::move(*parsed);
  }

  PatternClassLookup pattern_classes() {
    return [this](std::string_view name) -> const CharClass* {
      std::string error;
      return resolve(name, &error);
    };
  }

  std::unique_ptr<Pattern> pattern(std::string_view source, std::string_view replacement, bool global,
                                   const std::string& path) {
    std::string error;
    auto compiled = Pattern::compile(source, replacement, global, pattern_classes(), &error);
    if (!compiled) fail(path, error);
    return compiled;
  }

  // Steps (section 6.2). `classes_path` receives the step's class fields.
  [[gnu::noinline]] Step step(const Json& v, const std::string& path, bool allow_builtin, bool allow_alternatives,
                              bool only_step, std::vector<std::pair<std::string, CharClass>>* fields) {
    const Object& o = as_object(v, path);
    static constexpr std::array<std::string_view, 7> kinds = {"case", "normalize", "strip", "map", "pattern",
                                                             "alternatives", "builtin"};
    std::vector<std::string_view> present;
    for (auto kind : kinds) {
      if (get(o, kind) != nullptr) present.push_back(kind);
    }
    if (present.size() != 1) {
      fail(path, "a step has exactly one of case, normalize, strip, map, pattern, alternatives, builtin");
    }
    Step s;
    const std::string_view kind = present[0];
    if (kind == "case") {
      check_keys(o, path, {"case"});
      const std::string_view mode = one_of(require(o, "case", path), member(path, "case"), {"lower", "upper", "upperFirst", "lowerFirst"});
      s.kind = StepKind::Case;
      s.case_mode = mode == "lower" ? CaseMode::Lower : mode == "upper" ? CaseMode::Upper : mode == "upperFirst" ? CaseMode::UpperFirst : CaseMode::LowerFirst;
    } else if (kind == "normalize") {
      check_keys(o, path, {"normalize", "within"});
      const std::string_view form = one_of(require(o, "normalize", path), member(path, "normalize"), {"NFC", "NFD", "NFKC", "NFKD"});
      s.kind = StepKind::Normalize;
      s.form = form == "NFC" ? NormalForm::NFC : form == "NFD" ? NormalForm::NFD : form == "NFKC" ? NormalForm::NFKC : NormalForm::NFKD;
      if (const Json* within = get(o, "within")) {
        s.has_within = true;
        s.chars = class_field(*within, member(path, "within"));
        if (fields != nullptr) fields->emplace_back(member(path, "within"), s.chars);
      }
    } else if (kind == "strip") {
      check_keys(o, path, {"strip"});
      s.kind = StepKind::Strip;
      s.chars = class_field(require(o, "strip", path), member(path, "strip"));
      if (fields != nullptr) fields->emplace_back(member(path, "strip"), s.chars);
    } else if (kind == "map") {
      check_keys(o, path, {"map", "at"});
      s.kind = StepKind::Map;
      const std::string mpath = member(path, "map");
      for (const auto& [key, value] : as_object(require(o, "map", path), mpath)) {
        if (key.empty()) fail(mpath, "a map key may not be empty");
        s.map.emplace_back(decode(key, mpath), decode(as_string(value, member(mpath, key)), member(mpath, key)));
      }
      std::ranges::stable_sort(s.map, [](const auto& a, const auto& b) {
        return a.first.size() != b.first.size() ? a.first.size() > b.first.size() : a.first < b.first;
      });
      if (const Json* at = get(o, "at")) {
        const std::string_view a = one_of(*at, member(path, "at"), {"all", "first", "last", "start", "end"});
        s.at = a == "all" ? MapAt::All : a == "first" ? MapAt::First : a == "last" ? MapAt::Last : a == "start" ? MapAt::Start : MapAt::End;
      }
    } else if (kind == "pattern") {
      check_keys(o, path, {"pattern", "replace", "global", "repeat"});
      s.kind = StepKind::Pattern;
      const bool global = get(o, "global") != nullptr && as_bool(*get(o, "global"), member(path, "global"));
      s.repeat = get(o, "repeat") != nullptr && as_bool(*get(o, "repeat"), member(path, "repeat"));
      s.pattern = pattern(as_string(require(o, "pattern", path), member(path, "pattern")),
                          as_string(require(o, "replace", path), member(path, "replace")), global, path);
    } else if (kind == "alternatives") {
      if (!allow_alternatives) fail(path, "alternatives are not allowed here");
      if (!only_step) fail(path, "an alternatives step must be the only step of its variant");
      check_keys(o, path, {"alternatives", "limit"});
      s.kind = StepKind::Alternatives;
      const std::string apath = member(path, "alternatives");
      for (const auto& [key, value] : as_object(require(o, "alternatives", path), apath)) {
        if (key.empty()) fail(apath, "an alternatives key may not be empty");
        std::vector<std::u32string> choices;
        for (const auto& choice : string_array(value, member(apath, key))) choices.push_back(decode(choice, member(apath, key)));
        s.alternatives.emplace_back(decode(key, apath), std::move(choices));
      }
      std::ranges::stable_sort(s.alternatives, [](const auto& a, const auto& b) {
        return a.first.size() != b.first.size() ? a.first.size() > b.first.size() : a.first < b.first;
      });
      if (const Json* limit = get(o, "limit")) s.limit = as_count(*limit, member(path, "limit"), 1);
    } else {
      if (!allow_builtin) fail(path, "builtins are not allowed here");
      check_keys(o, path, {"builtin"});
      const std::string_view name = as_string(require(o, "builtin", path), member(path, "builtin"));
      const TextBuiltin* builtin = find_text_builtin(name);
      if (builtin == nullptr) fail(member(path, "builtin"), "unknown builtin " + json_quote(name));
      s.kind = StepKind::Builtin;
      s.builtin = builtin->apply;
    }
    return s;
  }

  StepList step_list(const Json& v, const std::string& path, bool allow_builtin, bool allow_alternatives,
                     std::vector<std::pair<std::string, CharClass>>* fields) {
    StepList steps;
    const Array& a = as_array(v, path);
    steps.reserve(a.size());
    for (size_t k = 0; k < a.size(); ++k) {
      // A known builtin step, {"builtin": "<name>"} (every Japanese step), is
      // read here; any other step, and any problem, goes through step().
      if (allow_builtin && a[k].is_object()) {
        const Object o = a[k].get_object();
        if (o.size() == 1) {
          if (const Json* name = o.find("builtin"); name != nullptr && name->is_string()) {
            if (const TextBuiltin* builtin = find_text_builtin(name->get_string())) {
              Step& s = steps.emplace_back();
              s.kind = StepKind::Builtin;
              s.builtin = builtin->apply;
              continue;
            }
          }
        }
      }
      steps.push_back(step(a[k], item(path, k), allow_builtin, allow_alternatives, a.size() == 1, fields));
    }
    return steps;
  }

  std::vector<Processor> processors(const Json& v, const std::string& path, std::set<std::string, std::less<>>& ids,
                                    std::vector<std::pair<std::string, CharClass>>& fields) {
    std::vector<Processor> out;
    const Array& a = as_array(v, path);
    for (size_t i = 0; i < a.size(); ++i) {
      const std::string ppath = item(path, i);
      const Object& o = as_object(a[i], ppath);
      check_keys(o, ppath, {"id", "name", "variants", "keepInput", "optional"});
      Processor p;
      p.id = as_string(require(o, "id", ppath), member(ppath, "id"));
      if (p.id.empty()) fail(member(ppath, "id"), "a processor needs an id");
      if (!ids.insert(p.id).second) fail(member(ppath, "id"), "the processor id " + p.id + " is used twice (pre- and postprocessor ids must be unique)");
      if (const Json* name = get(o, "name")) p.name = as_string(*name, member(ppath, "name"));
      if (const Json* keep = get(o, "keepInput")) p.keep_input = as_bool(*keep, member(ppath, "keepInput"));
      if (const Json* optional = get(o, "optional")) p.optional = as_bool(*optional, member(ppath, "optional"));
      const std::string vpath = member(ppath, "variants");
      const Array& variants = as_array(require(o, "variants", ppath), vpath);
      if (variants.empty()) fail(vpath, "a processor needs at least one variant");
      for (size_t j = 0; j < variants.size(); ++j) {
        p.variants.push_back(step_list(variants[j], item(vpath, j), true, true, &fields));
      }
      p.finish();
      out.push_back(std::move(p));
    }
    return out;
  }
};

struct Capability {
  bool optional = false;
};

// The pieces of language.json the settings check needs.
struct Declared {
  std::set<std::string, std::less<>> optional_processors;
  std::set<std::string, std::less<>> passes;
  std::set<std::string, std::less<>> display_transforms;
  std::set<std::string, std::less<>> optional_capabilities;
};

[[gnu::noinline]] void check_identity(const Object& o, PackData& pack) {
  const Json& schema = require(o, "schema", "");
  if (!schema.is_number() || schema.get_number() != 1) fail("schema", "must be 1");
  pack.code = as_string(require(o, "code", ""), "code");
  if (pack.code.size() < 2 || pack.code.size() > 3 ||
      !std::ranges::all_of(pack.code, [](char c) { return c >= 'a' && c <= 'z'; })) {
    fail("code", "must be 2-3 lowercase ASCII letters");
  }
  const std::string_view iso = as_string(require(o, "iso639_3", ""), "iso639_3");
  if (iso.size() != 3 || !std::ranges::all_of(iso, [](char c) { return c >= 'a' && c <= 'z'; })) {
    fail("iso639_3", "must be an ISO 639-3 code (3 lowercase letters)");
  }
  pack.name = as_string(require(o, "name", ""), "name");
  for (const char* key : {"name", "nativeName", "bcp47"}) {
    if (as_string(require(o, key, ""), key).empty()) fail(key, "may not be empty");
  }
  const auto scripts = string_array(require(o, "scripts", ""), "scripts");
  if (scripts.empty()) fail("scripts", "needs at least one ISO 15924 code");
  for (size_t i = 0; i < scripts.size(); ++i) {
    const auto& s = scripts[i];
    if (s.size() != 4 || !(s[0] >= 'A' && s[0] <= 'Z') ||
        !std::all_of(s.begin() + 1, s.end(), [](char c) { return c >= 'a' && c <= 'z'; })) {
      fail(item("scripts", i), "must be an ISO 15924 code such as Latn");
    }
  }
  one_of(require(o, "direction", ""), "direction", {"ltr", "rtl"});
}

void check_strings_object(const Json& v, const std::string& path) {
  for (const auto& [k, value] : as_object(v, path)) as_string(value, member(path, k));
}

[[gnu::noinline]] void check_presentation(const Object& o, PackParser& parser, Declared& declared) {
  const std::string path = "presentation";
  check_keys(o, path, {"typography", "labels", "displayTransforms"});
  const std::string tpath = "presentation.typography";
  const Object& typography = as_object(require(o, "typography", path), tpath);
  check_keys(typography, tpath, {"fontFamily", "wordBreak", "lineBreak", "joinedScript"});
  for (const char* key : {"fontFamily", "wordBreak", "lineBreak"}) {
    const Json& v = require(typography, key, tpath);
    if (!v.is_null()) as_string(v, member(tpath, key));
  }
  as_bool(require(typography, "joinedScript", tpath), member(tpath, "joinedScript"));
  const std::string lpath = "presentation.labels";
  const Object& labels = as_object(require(o, "labels", path), lpath);
  check_keys(labels, lpath, {"reading", "traceMarker", "readingBrackets", "senseSeparator", "listSeparator"});
  for (const char* key : {"reading", "traceMarker", "senseSeparator", "listSeparator"}) {
    if (const Json* v = get(labels, key)) as_string(*v, member(lpath, key));
  }
  if (const Json* brackets = get(labels, "readingBrackets")) {
    if (string_array(*brackets, member(lpath, "readingBrackets")).size() != 2) {
      fail(member(lpath, "readingBrackets"), "must be [open, close]");
    }
  }
  const std::string dpath = "presentation.displayTransforms";
  for (const auto& [name, steps] : as_object(require(o, "displayTransforms", path), dpath)) {
    const std::string spath = member(dpath, name);
    parser.pack.display_transforms.emplace_back(name, parser.step_list(steps, spath, false, false, &parser.pack.class_fields));
    declared.display_transforms.emplace(name);
  }
}

[[gnu::noinline]] void check_host(const Object& o) {
  const std::string path = "host";
  check_keys(o, path, {"ttsLanguage", "audioLanguage", "anki", "frequencySamples", "recommendedDictionaries", "sample"});
  as_string(require(o, "ttsLanguage", path), "host.ttsLanguage");
  as_string(require(o, "audioLanguage", path), "host.audioLanguage");
  const std::string apath = "host.anki";
  const Object& anki = as_object(require(o, "anki", path), apath);
  check_keys(anki, apath, {"noteTypeFamilies", "fieldAliases", "partOfSpeechLabels"});
  string_array(require(anki, "noteTypeFamilies", apath), "host.anki.noteTypeFamilies");
  for (const auto& [k, v] : as_object(require(anki, "fieldAliases", apath), "host.anki.fieldAliases")) {
    string_array(v, member("host.anki.fieldAliases", k));
  }
  check_strings_object(require(anki, "partOfSpeechLabels", apath), "host.anki.partOfSpeechLabels");
  const Json& samples = require(o, "frequencySamples", path);
  if (!samples.is_null()) {
    const std::string fpath = "host.frequencySamples";
    const Object& f = as_object(samples, fpath);
    check_keys(f, fpath, {"common", "rare"});
    for (const char* key : {"common", "rare"}) {
      if (string_array(require(f, key, fpath), member(fpath, key)).size() != 10) fail(member(fpath, key), "must list 10 words");
    }
  }
  const std::string rpath = "host.recommendedDictionaries";
  const Array& recommended = as_array(require(o, "recommendedDictionaries", path), rpath);
  for (size_t i = 0; i < recommended.size(); ++i) {
    const std::string dpath = item(rpath, i);
    const Object& d = as_object(recommended[i], dpath);
    check_keys(d, dpath, {"name", "url", "description", "licence"});
    for (const char* key : {"name", "url", "description", "licence"}) as_string(require(d, key, dpath), member(dpath, key));
  }
  const std::string spath = "host.sample";
  const Object& sample = as_object(require(o, "sample", path), spath);
  check_keys(sample, spath, {"warmup", "practice", "entry", "character"});
  as_string(require(sample, "warmup", spath), "host.sample.warmup");
  const Object& practice = as_object(require(sample, "practice", spath), "host.sample.practice");
  check_keys(practice, "host.sample.practice", {"text", "lookup"});
  as_string(require(practice, "text", "host.sample.practice"), "host.sample.practice.text");
  as_string(require(practice, "lookup", "host.sample.practice"), "host.sample.practice.lookup");
  const std::string epath = "host.sample.entry";
  const Object& entry = as_object(require(sample, "entry", spath), epath);
  check_keys(entry, epath, {"expression", "reading", "glossary", "definitionTags", "matched", "trace"});
  for (const char* key : {"expression", "reading", "definitionTags", "matched"}) as_string(require(entry, key, epath), member(epath, key));
  string_array(require(entry, "glossary", epath), member(epath, "glossary"));
  string_array(require(entry, "trace", epath), member(epath, "trace"));
  const Json& character = require(sample, "character", spath);
  if (!character.is_null()) as_object(character, "host.sample.character");
}

// host.sample's strings in the order of tools/lib/pack.mjs sampleTexts().
[[gnu::noinline]] std::vector<std::string> sample_texts(const Object& host) {
  std::vector<std::string> texts;
  const Json* sample = get(host, "sample");
  if (sample == nullptr || !sample->is_object()) return texts;
  const Object& s = sample->get_object();
  const auto add = [&](const Json* v) {
    if (v != nullptr && v->is_string() && !v->get_string().empty()) texts.emplace_back(v->get_string());
  };
  add(get(s, "warmup"));
  const Json* practice = get(s, "practice");
  add(practice != nullptr && practice->is_object() ? get(practice->get_object(), "text") : nullptr);
  add(practice != nullptr && practice->is_object() ? get(practice->get_object(), "lookup") : nullptr);
  const Json* entry = get(s, "entry");
  for (const char* key : {"expression", "reading", "matched"}) {
    add(entry != nullptr && entry->is_object() ? get(entry->get_object(), key) : nullptr);
  }
  const Json* character = get(s, "character");
  if (character != nullptr && character->is_object()) {
    for (const auto& [k, v] : character->get_object()) add(&v);
  }
  return texts;
}

struct TransformsParser {
  PackParser& parser;
  TransformSet& set;
  std::vector<std::pair<std::string, CharClass>>& fields;
  std::vector<NamedSteps> then_steps;  // filled after rules are final

  uint32_t conditions_of(const Json* v, std::string_view key, const std::string& rule_path) {
    if (v == nullptr) fail(rule_path, "missing required key \"" + std::string(key) + "\"");
    if (!v->is_array()) fail(member(rule_path, key), std::string("must be an array, not ") + type_name(*v));
    uint32_t bits = 0;
    const Array& names = v->get_array();
    for (size_t i = 0; i < names.size(); ++i) {
      if (!names[i].is_string()) fail(item(member(rule_path, key), i), std::string("must be a string, not ") + type_name(names[i]));
      const std::string_view name = names[i].get_string();
      const uint32_t* found = find_condition(name);
      if (found == nullptr) fail(item(member(rule_path, key), i), "names no condition " + json_quote(name));
      bits |= *found;
    }
    return bits;
  }

  // Condition keys and bits, for the rules' condition names (at most 32
  // leaves and their unions, so a scan is as fast as a tree and adds no code).
  std::vector<std::pair<std::string_view, uint32_t>> condition_index;  // keys are never empty
  const uint32_t* find_condition(std::string_view name) const {
    if (name.empty()) return nullptr;
    for (const auto& [key, bits] : condition_index) {
      // Size and first byte reject almost every other key without a compare.
      if (key.size() == name.size() && key[0] == name[0] && key == name) return &bits;
    }
    return nullptr;
  }

  void parse_conditions(const Object& root) {
    const std::string path = "conditions";
    const Object& conditions = as_object(require(root, "conditions", ""), path);
    std::map<std::string, std::vector<std::string>, std::less<>> subs;
    for (const auto& [key, value] : conditions) {
      const std::string cpath = member(path, key);
      const Object& c = as_object(value, cpath);
      check_keys(c, cpath, {"name", "isDictionaryForm", "subConditions", "i18n"});
      Condition condition;
      condition.key = key;
      condition.name = as_string(require(c, "name", cpath), member(cpath, "name"));
      condition.dictionary_form = as_bool(require(c, "isDictionaryForm", cpath), member(cpath, "isDictionaryForm"));
      if (const Json* sub = get(c, "subConditions")) {
        subs[std::string(key)] = string_array(*sub, member(cpath, "subConditions"));
      } else {
        condition.leaf = true;
      }
      if (const Json* i18n = get(c, "i18n")) {
        const Array& list = as_array(*i18n, member(cpath, "i18n"));
        for (size_t i = 0; i < list.size(); ++i) {
          const std::string ipath = item(member(cpath, "i18n"), i);
          const Object& entry = as_object(list[i], ipath);
          check_keys(entry, ipath, {"language", "name"});
          as_string(require(entry, "language", ipath), member(ipath, "language"));
          as_string(require(entry, "name", ipath), member(ipath, "name"));
        }
      }
      set.conditions.push_back(std::move(condition));
    }
    size_t next_bit = 0;
    for (auto& condition : set.conditions) {
      if (!condition.leaf) continue;
      if (next_bit >= max_condition_bits) fail(member(path, condition.key), "more than 32 condition bits");
      condition.bits = 1u << next_bit++;
    }
    // Unions, with cycles refused.
    std::vector<std::string> stack;
    std::function<uint32_t(const std::string&)> resolve = [&](const std::string& key) -> uint32_t {
      auto it = std::ranges::find(set.conditions, key, &Condition::key);
      if (it == set.conditions.end()) fail(path, "subConditions name no condition " + json_quote(key));
      if (it->leaf || it->bits != 0) return it->bits;
      if (std::ranges::find(stack, key) != stack.end()) fail(member(path, key), "subConditions form a cycle");
      stack.push_back(key);
      uint32_t bits = 0;
      const auto& list = subs[key];
      for (size_t i = 0; i < list.size(); ++i) {
        if (std::ranges::find(set.conditions, list[i], &Condition::key) == set.conditions.end()) {
          fail(item(member(member(path, key), "subConditions"), i), "names no condition " + json_quote(list[i]));
        }
        bits |= resolve(list[i]);
      }
      stack.pop_back();
      auto again = std::ranges::find(set.conditions, key, &Condition::key);
      again->bits = bits;
      return bits;
    };
    for (const auto& condition : std::vector<Condition>(set.conditions)) resolve(condition.key);
    condition_index.reserve(set.conditions.size());
    for (const auto& condition : set.conditions) condition_index.emplace_back(condition.key, condition.bits);
  }

  void parse_word_lists(const Object& root) {
    const Json* lists = get(root, "wordLists");
    if (lists == nullptr) return;
    for (const auto& [name, words] : as_object(*lists, "wordLists")) {
      auto list = std::make_unique<WordList>();
      for (auto& word : string_array(words, member("wordLists", name))) {
        if (word.empty()) fail(member("wordLists", name), "a word may not be empty");
        list->insert(std::move(word));
      }
      set.word_lists.emplace(name, std::move(list));
    }
  }

  const WordList* word_list(const Json& v, const std::string& path) {
    const std::string_view name = as_string(v, path);
    const auto it = set.word_lists.find(name);
    if (it == set.word_lists.end()) fail(path, "names no word list " + json_quote(name));
    return it->second.get();
  }

  const CharClass* owned_class(const Json& v, const std::string& path) {
    set.owned_classes.push_back(std::make_unique<CharClass>(parser.class_field(v, path)));
    fields.emplace_back(path, *set.owned_classes.back());
    return set.owned_classes.back().get();
  }

  void affix(const std::string& s, const std::string& path) {
    if (s.size() > max_affix_code_points && code_point_count(s) > max_affix_code_points) {
      fail(path, "an affix is longer than 64 code points");
    }
  }
  void affix(const std::string& s, const std::string& rule_path, std::string_view key) {
    if (s.size() > max_affix_code_points && code_point_count(s) > max_affix_code_points) {
      fail(member(rule_path, key), "an affix is longer than 64 code points");
    }
  }

  // Stem constraints; returns whether there is one.
  bool stem_constraints(const Object& o, const std::string& path, Rule& rule) {
    bool any = false;
    if (const Json* v = get(o, "stemMinLength")) {
      const size_t minimum = as_count(*v, member(path, "stemMinLength"), 0);
      if (minimum > 0) {
        rule.more().stem_min_length = minimum;
        any = true;
      }
    }
    // Same order as tools/check-classes.mjs RULE_CLASS_KEYS.
    const std::pair<const char*, const CharClass* RuleExtra::*> classes[] = {
        {"stemCharacters", &RuleExtra::stem_characters},       {"stemContains", &RuleExtra::stem_contains},
        {"stemStartsWith", &RuleExtra::stem_starts_with},       {"stemEndsWith", &RuleExtra::stem_ends_with},
        {"stemNotStartsWith", &RuleExtra::stem_not_starts_with}, {"stemNotEndsWith", &RuleExtra::stem_not_ends_with},
    };
    for (const auto& [key, slot] : classes) {
      if (const Json* v = get(o, key)) {
        rule.more().*slot = owned_class(*v, member(path, key));
        any = true;
      }
    }
    if (const Json* v = get(o, "stemStartsWithText")) {
      rule.more().stem_starts_with_text = as_string(*v, member(path, "stemStartsWithText"));
      any = true;
    }
    if (const Json* v = get(o, "stemNotStartsWithText")) {
      rule.more().stem_not_starts_with_text = as_string(*v, member(path, "stemNotStartsWithText"));
      any = true;
    }
    rule.stem_checks = any;
    return any;
  }

  void stem_change(const Object& o, const std::string& path, Rule& rule) {
    const Json* v = get(o, "stemChange");
    if (v == nullptr) return;
    const std::string cpath = member(path, "stemChange");
    const Object& c = as_object(*v, cpath);
    check_keys(c, cpath, {"from", "to", "occurrence", "between", "betweenMinLength"});
    auto change = std::make_unique<StemChange>();
    change->from = string_array(require(c, "from", cpath), member(cpath, "from"));
    if (change->from.empty()) fail(member(cpath, "from"), "needs at least one string");
    for (size_t i = 0; i < change->from.size(); ++i) {
      if (change->from[i].empty()) fail(item(member(cpath, "from"), i), "may not be empty");
    }
    change->to = as_string(require(c, "to", cpath), member(cpath, "to"));
    if (const Json* occurrence = get(c, "occurrence")) {
      change->last = one_of(*occurrence, member(cpath, "occurrence"), {"first", "last"}) == "last";
    }
    if (const Json* between = get(c, "between")) change->between = owned_class(*between, member(cpath, "between"));
    if (const Json* minimum = get(c, "betweenMinLength")) {
      change->between_min_length = as_count(*minimum, member(cpath, "betweenMinLength"), 0);
    }
    rule.more().stem_change = std::move(change);
    rule.has_stem_change = true;
  }

  void parse_then(const Object& o, const std::string& path, Rule& rule) {
    const Json* v = get(o, "then");
    if (v == nullptr) return;
    rule.more().then = parser.step_list(*v, member(path, "then"), false, false, &fields);
    rule.has_then = true;
  }

  static const std::vector<std::string_view>& cached_keys_for(RuleType type) {
    static const std::array<std::vector<std::string_view>, 8> keys = {
        keys_for("suffix"),  keys_for("prefix"),  keys_for("wholeWord"),        keys_for("circumfix"),
        keys_for("replace"), keys_for("phrasal"), keys_for("interposedObject"), keys_for("pattern"),
    };
    return keys[static_cast<size_t>(type)];
  }

  static std::vector<std::string_view> keys_for(std::string_view type) {
    std::vector<std::string_view> keys = {"type", "conditionsIn", "conditionsOut", "source", "then"};
    const std::vector<std::string_view> stem = {"stemMinLength",     "stemCharacters",    "stemContains",
                                                "stemStartsWith",    "stemEndsWith",      "stemNotStartsWith",
                                                "stemNotEndsWith",   "stemStartsWithText", "stemNotStartsWithText"};
    const auto add = [&](std::initializer_list<std::string_view> more) { keys.insert(keys.end(), more); };
    if (type == "suffix") {
      add({"inflected", "deinflected", "stemChange"});
      keys.insert(keys.end(), stem.begin(), stem.end());
    } else if (type == "prefix") {
      add({"inflected", "deinflected"});
      keys.insert(keys.end(), stem.begin(), stem.end());
    } else if (type == "wholeWord") {
      add({"inflected", "deinflected"});
    } else if (type == "circumfix") {
      add({"inflectedPrefix", "deinflectedPrefix", "inflectedSuffix", "deinflectedSuffix", "prefixes", "suffixes", "stemChange"});
      keys.insert(keys.end(), stem.begin(), stem.end());
    } else if (type == "replace") {
      add({"inflected", "deinflected", "occurrence", "notAtStart"});
    } else if (type == "phrasal") {
      add({"inflected", "deinflected", "followedBy"});
    } else if (type == "interposedObject") {
      add({"particles", "guardWords"});
    } else if (type == "pattern") {
      add({"pattern", "replacement", "anchorSuffix", "anchorPrefix"});
    }
    return keys;
  }

  std::vector<std::pair<std::string, std::string>> pairs(const Json& v, const std::string& path) {
    std::vector<std::pair<std::string, std::string>> out;
    const Array& a = as_array(v, path);
    if (a.empty()) fail(path, "needs at least one [inflected, deinflected] pair");
    for (size_t i = 0; i < a.size(); ++i) {
      const auto p = string_array(a[i], item(path, i));
      if (p.size() != 2) fail(item(path, i), "must be [inflected, deinflected]");
      affix(p[0], item(path, i));
      out.emplace_back(p[0], p[1]);
    }
    return out;
  }

  // Plain suffix and whole-word rules (every Japanese rule) in one pass over
  // their members. Anything else, and any problem, returns false and goes
  // through parse_rule, which reports errors with their JSON paths; both
  // build the same Rule.
  bool parse_plain_rule(const Json& v, uint16_t transform_index, uint32_t rule_index) {
    if (!v.is_object()) return false;
    const Object o = v.get_object();
    if (o.size() > 6) return false;
    std::string_view type;
    std::string_view inflected;
    std::string_view deinflected;
    const Json* in = nullptr;
    const Json* out = nullptr;
    unsigned seen = 0;
    // The six keys have six lengths, so the length picks the key.
    for (const auto& [key, value] : o) {
      switch (key.size()) {
        case 4:
          if (key != "type" || !value.is_string()) return false;
          type = value.get_string();
          seen |= 1;
          break;
        case 9:
          if (key != "inflected" || !value.is_string()) return false;
          inflected = value.get_string();
          seen |= 2;
          break;
        case 11:
          if (key != "deinflected" || !value.is_string()) return false;
          deinflected = value.get_string();
          seen |= 4;
          break;
        case 6: {
          if (key != "source" || !value.is_string()) return false;
          const std::string_view text = value.get_string();
          if (text != "own" && text != "yomitan" && text != "both") return false;
          break;
        }
        case 12:
          if (key != "conditionsIn") return false;
          in = &value;
          break;
        case 13:
          if (key != "conditionsOut") return false;
          out = &value;
          break;
        default:
          return false;
      }
    }
    if (seen != 7 || in == nullptr || out == nullptr) return false;
    RuleType rule_type;
    if (type == "suffix") {
      rule_type = RuleType::Suffix;
    } else if (type == "wholeWord") {
      rule_type = RuleType::WholeWord;
    } else {
      return false;
    }
    // An empty or possibly over-long affix is decided by parse_rule.
    if (inflected.empty() || inflected.size() > max_affix_code_points) return false;
    uint32_t bits_in = 0;
    uint32_t bits_out = 0;
    if (!plain_conditions(*in, bits_in) || !plain_conditions(*out, bits_out)) return false;
    Rule& rule = set.rules.emplace_back();
    rule.type = rule_type;
    rule.transform = transform_index;
    rule.index_in_transform = rule_index;
    rule.conditions_in = bits_in;
    rule.conditions_out = bits_out;
    rule.a.assign(inflected);
    rule.b.assign(deinflected);
    return true;
  }

  bool plain_conditions(const Json& v, uint32_t& bits) {
    if (!v.is_array()) return false;
    for (const auto& name : v.get_array()) {
      if (!name.is_string()) return false;
      const uint32_t* found = find_condition(name.get_string());
      if (found == nullptr) return false;
      bits |= *found;
    }
    return true;
  }

  // Out of line: the plain path above handles every rule of the built-in
  // pack, so a WebAssembly engine compiles this only for packs that need it.
  [[gnu::noinline]] void parse_rule(const Json& v, const std::string& path, uint16_t transform_index,
                                    uint32_t rule_index, const std::string& transform_source) {
    const Object& o = as_object(v, path);
    const std::string_view type = string_field(get(o, "type"), "type", path);
    if (type == "todo") fail(path, "a todo rule remains; map it by hand (section 8.3)");
    static constexpr std::array<std::pair<std::string_view, RuleType>, 8> types = {{
        {"suffix", RuleType::Suffix},
        {"prefix", RuleType::Prefix},
        {"wholeWord", RuleType::WholeWord},
        {"circumfix", RuleType::Circumfix},
        {"replace", RuleType::Replace},
        {"phrasal", RuleType::Phrasal},
        {"interposedObject", RuleType::InterposedObject},
        {"pattern", RuleType::Pattern},
    }};
    const auto known = std::ranges::find(types, std::string_view(type), &std::pair<std::string_view, RuleType>::first);
    if (known == types.end()) fail(member(path, "type"), "unknown rule type " + json_quote(type));
    check_keys(o, path, cached_keys_for(known->second));

    Rule rule;
    rule.transform = transform_index;
    rule.index_in_transform = rule_index;
    rule.conditions_in = conditions_of(get(o, "conditionsIn"), "conditionsIn", path);
    rule.conditions_out = conditions_of(get(o, "conditionsOut"), "conditionsOut", path);
    (void)transform_source;
    if (const Json* source = get(o, "source")) one_of(*source, member(path, "source"), {"own", "yomitan", "both"});

    const auto literal = [&](const char* key) -> std::string_view { return string_field(get(o, key), key, path); };
    if (type == "suffix" || type == "prefix") {
      rule.type = type == "suffix" ? RuleType::Suffix : RuleType::Prefix;
      rule.a = literal("inflected");
      rule.b = literal("deinflected");
      affix(rule.a, path, "inflected");
      const bool constrained = stem_constraints(o, path, rule);
      if (rule.a.empty() && !constrained) fail(member(path, "inflected"), "may be empty only with a stem constraint");
      if (type == "suffix") stem_change(o, path, rule);
    } else if (type == "wholeWord") {
      rule.type = RuleType::WholeWord;
      rule.a = literal("inflected");
      rule.b = literal("deinflected");
      if (rule.a.empty()) fail(member(path, "inflected"), "may not be empty");
      affix(rule.a, path, "inflected");
    } else if (type == "circumfix") {
      rule.type = RuleType::Circumfix;
      stem_constraints(o, path, rule);
      stem_change(o, path, rule);
      parse_then(o, path, rule);
      const bool cross = get(o, "prefixes") != nullptr || get(o, "suffixes") != nullptr;
      if (cross) {
        for (const char* key : {"inflectedPrefix", "deinflectedPrefix", "inflectedSuffix", "deinflectedSuffix"}) {
          if (get(o, key) != nullptr) fail(member(path, key), "the cross-product form has prefixes and suffixes instead");
        }
        const auto prefixes = pairs(require(o, "prefixes", path), member(path, "prefixes"));
        const auto suffixes = pairs(require(o, "suffixes", path), member(path, "suffixes"));
        for (const auto& [ip, dp] : prefixes) {
          for (const auto& [is, ds] : suffixes) {
            Rule expanded;
            copy_rule(rule, expanded);
            expanded.a = ip;
            expanded.b = dp;
            expanded.c = is;
            expanded.d = ds;
            set.rules.push_back(std::move(expanded));
          }
        }
        return;
      }
      rule.a = literal("inflectedPrefix");
      rule.b = literal("deinflectedPrefix");
      rule.c = literal("inflectedSuffix");
      rule.d = literal("deinflectedSuffix");
      affix(rule.a, path, "inflectedPrefix");
      affix(rule.c, path, "inflectedSuffix");
      set.rules.push_back(std::move(rule));
      return;
    } else if (type == "replace") {
      rule.type = RuleType::Replace;
      rule.more();  // apply() reads occurrence and notAtStart
      rule.a = literal("inflected");
      rule.b = literal("deinflected");
      if (rule.a.empty()) fail(member(path, "inflected"), "may not be empty");
      affix(rule.a, path, "inflected");
      if (const Json* occurrence = get(o, "occurrence")) {
        const std::string_view which = one_of(*occurrence, member(path, "occurrence"), {"all", "first", "last"});
        rule.more().occurrence = which == "all" ? Occurrence::All : which == "first" ? Occurrence::First : Occurrence::Last;
      }
      if (const Json* not_at_start = get(o, "notAtStart")) rule.more().not_at_start = as_bool(*not_at_start, member(path, "notAtStart"));
    } else if (type == "phrasal") {
      rule.type = RuleType::Phrasal;
      rule.a = literal("inflected");
      rule.b = literal("deinflected");
      affix(rule.a, path, "inflected");
      rule.more().followed_by = word_list(require(o, "followedBy", path), member(path, "followedBy"));
    } else if (type == "interposedObject") {
      rule.type = RuleType::InterposedObject;
      rule.more().particles = word_list(require(o, "particles", path), member(path, "particles"));
      rule.more().guard_words = word_list(require(o, "guardWords", path), member(path, "guardWords"));
    } else {
      rule.type = RuleType::Pattern;
      const Json* suffix = get(o, "anchorSuffix");
      const Json* prefix = get(o, "anchorPrefix");
      if ((suffix == nullptr) == (prefix == nullptr)) fail(path, "a pattern rule names exactly one of anchorSuffix and anchorPrefix");
      rule.anchor_prefix = prefix != nullptr;
      const std::string anchor_key = rule.anchor_prefix ? "anchorPrefix" : "anchorSuffix";
      rule.a = as_string(rule.anchor_prefix ? *prefix : *suffix, member(path, anchor_key));
      if (rule.a.empty()) fail(member(path, anchor_key), "may not be empty");
      affix(rule.a, path, anchor_key);
      rule.more().pattern = parser.pattern(literal("pattern"), literal("replacement"), false, path);
    }
    parse_then(o, path, rule);
    set.rules.push_back(std::move(rule));
  }

  // A cross product's rules share everything but their affixes.
  static void copy_rule(const Rule& from, Rule& to) {
    to.type = from.type;
    to.stem_checks = from.stem_checks;
    to.has_stem_change = from.has_stem_change;
    to.has_then = from.has_then;
    to.transform = from.transform;
    to.conditions_in = from.conditions_in;
    to.conditions_out = from.conditions_out;
    to.index_in_transform = from.index_in_transform;
    if (from.extra) {
      RuleExtra& extra = to.more();
      const RuleExtra& source = *from.extra;
      extra.stem_min_length = source.stem_min_length;
      extra.stem_characters = source.stem_characters;
      extra.stem_contains = source.stem_contains;
      extra.stem_starts_with = source.stem_starts_with;
      extra.stem_ends_with = source.stem_ends_with;
      extra.stem_not_starts_with = source.stem_not_starts_with;
      extra.stem_not_ends_with = source.stem_not_ends_with;
      extra.stem_starts_with_text = source.stem_starts_with_text;
      extra.stem_not_starts_with_text = source.stem_not_starts_with_text;
      if (source.stem_change) extra.stem_change = std::make_unique<StemChange>(*source.stem_change);
      extra.then = source.then;
    }
  }

  void parse(const Object& root) {
    check_keys(root, "", {"schema", "conditions", "wordLists", "transforms"});
    const Json& schema = require(root, "schema", "");
    if (!schema.is_number() || schema.get_number() != 1) fail("schema", "must be 1");
    parse_conditions(root);
    parse_word_lists(root);
    const Array& transforms = as_array(require(root, "transforms", ""), "transforms");
    std::set<std::string, std::less<>> ids;
    // Storage for every rule up front: a cross product may add more.
    size_t rule_total = 0;
    for (const auto& t : transforms) {
      if (!t.is_object()) continue;
      if (const Json* r = t.get_object().find("rules"); r != nullptr && r->is_array()) rule_total += r->get_array().size();
    }
    set.rules.reserve(rule_total);
    set.transforms.reserve(transforms.size());
    for (size_t i = 0; i < transforms.size(); ++i) {
      const std::string tpath = item("transforms", i);
      const Object& t = as_object(transforms[i], tpath);
      check_keys(t, tpath, {"id", "name", "description", "source", "rules", "optional", "i18n"});
      Transform transform;
      transform.id = as_string(require(t, "id", tpath), member(tpath, "id"));
      if (transform.id.empty()) fail(member(tpath, "id"), "may not be empty");
      if (!ids.insert(transform.id).second) fail(member(tpath, "id"), "the id " + json_quote(transform.id) + " is used twice");
      transform.name = as_string(require(t, "name", tpath), member(tpath, "name"));
      if (const Json* d = get(t, "description")) transform.description = as_string(*d, member(tpath, "description"));
      transform.source = one_of(require(t, "source", tpath), member(tpath, "source"), {"own", "yomitan", "both"});
      if (const Json* optional = get(t, "optional")) transform.optional = as_bool(*optional, member(tpath, "optional"));
      if (const Json* i18n = get(t, "i18n")) as_array(*i18n, member(tpath, "i18n"));
      set.has_optional_transforms = set.has_optional_transforms || transform.optional;
      const std::string rpath = member(tpath, "rules");
      const Array& rules = as_array(require(t, "rules", tpath), rpath);
      if (transforms.size() > 0xFFFF) fail("transforms", "more than 65535 transforms");
      const uint16_t index = static_cast<uint16_t>(set.transforms.size());
      const std::string source = transform.source;
      set.transforms.push_back(std::move(transform));
      for (size_t j = 0; j < rules.size(); ++j) {
        if (parse_plain_rule(rules[j], index, static_cast<uint32_t>(j))) continue;
        parse_rule(rules[j], item(rpath, j), index, static_cast<uint32_t>(j), source);
      }
    }
    set.index();
  }
};

// `transform_ids`: whether a `transforms` effect must name optional transforms
// of `pack`. False only for rules that replace the pack's own for one run
// (parse_pack_with_rules), whose caller checks the effects against the pack's
// own rules.
[[gnu::noinline]] void parse_settings(const Json& v, const PackData& pack, const Declared& declared, bool transform_ids) {
  const std::string path = "settings";
  const Array& settings = as_array(v, path);
  std::set<std::string, std::less<>> ids;
  std::set<std::string, std::less<>> optional_transforms;
  if (pack.transforms) {
    for (const auto& t : pack.transforms->transforms) {
      if (t.optional) optional_transforms.insert(t.id);
    }
  }
  for (size_t i = 0; i < settings.size(); ++i) {
    const std::string spath = item(path, i);
    const Object& s = as_object(settings[i], spath);
    check_keys(s, spath, {"id", "type", "default", "values", "min", "max", "step", "label", "description", "group", "effect"});
    const std::string_view id = as_string(require(s, "id", spath), member(spath, "id"));
    if (!ids.emplace(id).second) fail(member(spath, "id"), "the setting id " + json_quote(id) + " is used twice");
    const std::string_view type = one_of(require(s, "type", spath), member(spath, "type"), {"boolean", "enum", "number"});
    as_string(require(s, "label", spath), member(spath, "label"));
    if (const Json* d = get(s, "description")) as_string(*d, member(spath, "description"));
    one_of(require(s, "group", spath), member(spath, "group"), {"lookup", "display"});
    std::set<std::string, std::less<>> values;
    double min = 0;
    double max = 0;
    if (type == "enum") {
      const std::string vpath = member(spath, "values");
      const Array& list = as_array(require(s, "values", spath), vpath);
      if (list.empty()) fail(vpath, "an enum setting needs values");
      for (size_t k = 0; k < list.size(); ++k) {
        const Object& value = as_object(list[k], item(vpath, k));
        check_keys(value, item(vpath, k), {"id", "label"});
        if (!values.emplace(as_string(require(value, "id", item(vpath, k)), item(vpath, k) + ".id")).second) {
          fail(item(vpath, k), "a value id is used twice");
        }
        as_string(require(value, "label", item(vpath, k)), item(vpath, k) + ".label");
      }
    } else if (get(s, "values") != nullptr) {
      fail(member(spath, "values"), "only enum settings have values");
    }
    if (type == "number") {
      min = as_number(require(s, "min", spath), member(spath, "min"));
      max = as_number(require(s, "max", spath), member(spath, "max"));
      if (as_number(require(s, "step", spath), member(spath, "step")) <= 0) fail(member(spath, "step"), "must be positive");
      if (max < min) fail(spath, "max is below min");
    } else {
      for (const char* key : {"min", "max", "step"}) {
        if (get(s, key) != nullptr) fail(member(spath, key), "only number settings have it");
      }
    }
    const auto check_value = [&](const Json& value, const std::string& vpath) {
      if (type == "boolean") {
        as_bool(value, vpath);
      } else if (type == "enum") {
        if (!values.contains(as_string(value, vpath))) fail(vpath, "is not one of the setting's values");
      } else {
        const double d = as_number(value, vpath);
        if (d < min || d > max) fail(vpath, "is outside min and max");
      }
    };
    check_value(require(s, "default", spath), member(spath, "default"));
    const std::string epath = member(spath, "effect");
    const Object& effect = as_object(require(s, "effect", spath), epath);
    if (effect.size() != 1) fail(epath, "has exactly one of preprocessor, transforms, variantPass, display, capability");
    const auto& [kind, target] = *effect.begin();
    const std::string tpath = member(epath, kind);
    const bool engine = kind == "preprocessor" || kind == "transforms" || kind == "variantPass" || kind == "capability";
    if (engine && type != "boolean") fail(epath, "a " + std::string(kind) + " effect needs a boolean setting");
    if (kind == "preprocessor") {
      const std::string_view name = as_string(target, tpath);
      if (!declared.optional_processors.contains(name)) fail(tpath, "names no optional processor " + json_quote(name));
    } else if (kind == "transforms") {
      const auto names = string_array(target, tpath);
      if (names.empty()) fail(tpath, "names no transform");
      for (size_t k = 0; transform_ids && k < names.size(); ++k) {
        if (!optional_transforms.contains(names[k])) fail(item(tpath, k), "names no optional transform " + json_quote(names[k]));
      }
    } else if (kind == "variantPass") {
      const std::string_view name = as_string(target, tpath);
      if (!declared.passes.contains(name)) fail(tpath, "names no variant pass " + json_quote(name));
    } else if (kind == "capability") {
      const std::string_view name = as_string(target, tpath);
      if (!declared.optional_capabilities.contains(name)) fail(tpath, "names no optional capability " + json_quote(name));
    } else if (kind == "display") {
      const Object& display = as_object(target, tpath);
      check_keys(display, tpath, {"fields", "when", "transform"});
      const auto fields = string_array(require(display, "fields", tpath), member(tpath, "fields"));
      if (fields.empty()) fail(member(tpath, "fields"), "names no field");
      for (size_t k = 0; k < fields.size(); ++k) {
        if (fields[k] != "expression" && fields[k] != "reading") fail(item(member(tpath, "fields"), k), "must be expression or reading");
      }
      check_value(require(display, "when", tpath), member(tpath, "when"));
      const std::string_view transform = as_string(require(display, "transform", tpath), member(tpath, "transform"));
      if (!declared.display_transforms.contains(transform)) fail(member(tpath, "transform"), "names no display transform " + json_quote(transform));
    } else {
      fail(tpath, "unknown effect");
    }
  }
}

}  // namespace

std::string transforms_file_name(std::string_view language_json) {
  json::Document document;
  if (!document.parse(language_json, nullptr) || !document.root().is_object()) return {};
  const Json* lookup = document.root().get_object().find("lookup");
  if (lookup == nullptr || !lookup->is_object()) return {};
  const Json* transforms = lookup->get_object().find("transforms");
  return transforms != nullptr && transforms->is_string() ? std::string(transforms->get_string()) : std::string{};
}

namespace {
// The shape of text's host-only members (section 4.3).
[[gnu::noinline]] void check_text_shape(const Object& text) {
  const std::string tpath = "text";
  {
    const std::string spath = "text.sentence";
    const Object& sentence = as_object(require(text, "sentence", tpath), spath);
    check_keys(sentence, spath, {"terminators", "quotePairs"});
    string_array(require(sentence, "terminators", spath), "text.sentence.terminators");
    const Array& pairs = as_array(require(sentence, "quotePairs", spath), "text.sentence.quotePairs");
    for (size_t i = 0; i < pairs.size(); ++i) {
      if (string_array(pairs[i], item("text.sentence.quotePairs", i)).size() != 2) {
        fail(item("text.sentence.quotePairs", i), "must be [open, close]");
      }
    }
  }
  if (const Json& breaks = require(text, "highlightBreaks", tpath); !breaks.is_null()) {
    const std::string bpath = "text.highlightBreaks";
    const Object& b = as_object(breaks, bpath);
    check_keys(b, bpath, {"sentenceEnd", "clauseEnd"});
    string_array(require(b, "sentenceEnd", bpath), "text.highlightBreaks.sentenceEnd");
    string_array(require(b, "clauseEnd", bpath), "text.highlightBreaks.clauseEnd");
  }
  as_string(require(text, "lineJoiner", tpath), "text.lineJoiner");
}

// capabilities (section 4.6); its characterView pattern is a class field.
[[gnu::noinline]] void check_capabilities(const Object& root, PackParser& parser, Declared& declared) {
  PackData* pack = &parser.pack;
  const std::string cpath = "capabilities";
  const Object& capabilities = as_object(require(root, "capabilities", ""), cpath);
    check_keys(capabilities, cpath, {"readings", "ruby", "pitchAccent", "characterView", "wordHighlighting"});
    one_of(require(capabilities, "readings", cpath), "capabilities.readings", {"required", "optional", "none"});
    if (const Json& ruby = require(capabilities, "ruby", cpath); !ruby.is_null()) {
      const Object& r = as_object(ruby, "capabilities.ruby");
      check_keys(r, "capabilities.ruby", {"alignment", "optional"});
      one_of(require(r, "alignment", "capabilities.ruby"), "capabilities.ruby.alignment", {"kana", "syllable", "word"});
      if (const Json* optional = get(r, "optional"); optional != nullptr && as_bool(*optional, "capabilities.ruby.optional")) {
        declared.optional_capabilities.insert("ruby");
      }
    }
    as_bool(require(capabilities, "pitchAccent", cpath), "capabilities.pitchAccent");
    if (const Json& view = require(capabilities, "characterView", cpath); !view.is_null()) {
      const std::string vpath = "capabilities.characterView";
      const Object& c = as_object(view, vpath);
      check_keys(c, vpath, {"name", "pattern", "readingLabels", "readingSeparator", "optional"});
      as_string(require(c, "name", vpath), member(vpath, "name"));
      pack->class_fields.emplace_back("capabilities.characterView.pattern",
                                      parser.class_field(require(c, "pattern", vpath), member(vpath, "pattern")));
      const Object& labels = as_object(require(c, "readingLabels", vpath), member(vpath, "readingLabels"));
      check_keys(labels, member(vpath, "readingLabels"), {"onyomi", "kunyomi"});
      as_string(require(labels, "onyomi", member(vpath, "readingLabels")), member(vpath, "readingLabels") + ".onyomi");
      as_string(require(labels, "kunyomi", member(vpath, "readingLabels")), member(vpath, "readingLabels") + ".kunyomi");
      as_string(require(c, "readingSeparator", vpath), member(vpath, "readingSeparator"));
      if (const Json* optional = get(c, "optional"); optional != nullptr && as_bool(*optional, member(vpath, "optional"))) {
        declared.optional_capabilities.insert("characterView");
      }
    }
    as_bool(require(capabilities, "wordHighlighting", cpath), "capabilities.wordHighlighting");

}
void build_named_steps(PackData& pack);

// parse_pack, and parse_pack_with_rules when `rules_name` is set: then
// `transforms_json` holds rules that replace the file lookup.transforms names,
// errors in them name `rules_name`, and settings' `transforms` effects are not
// looked up in them.
std::unique_ptr<PackData> parse(std::string_view language_json, std::string_view transforms_json, std::string* error,
                                bool trusted, std::optional<std::string_view> rules_name) {
  auto pack = std::make_unique<PackData>();
  PackParser parser{*pack};
  std::string file = "language.json";
  try {
    json::Document language_document;
    parse_json(language_json, language_document);
    const Object root = as_object(language_document.root(), "");
    check_keys(root, "", {"schema", "code", "iso639_3", "name", "nativeName", "bcp47", "scripts", "direction", "classes",
                          "text", "lookup", "capabilities", "presentation", "settings", "host"});
    check_identity(root, *pack);

    // classes
    const Object& classes = as_object(require(root, "classes", ""), "classes");
    parser.class_definitions = classes;
    for (const auto& [name, source] : classes) {
      if (!is_class_name(name)) fail(member("classes", name), "a class name is letters, digits and _, starting with a letter or _");
      std::string inner;
      const CharClass* parsed = parser.resolve(name, &inner);
      if (parsed == nullptr) fail("", inner);
      pack->classes.emplace_back(name, *parsed);
    }

    // text
    const std::string tpath = "text";
    const Object& text = as_object(require(root, "text", ""), tpath);
    check_keys(text, tpath, {"pattern", "scanStart", "segmentation", "wordCharacters", "wordInternal", "sentence",
                             "highlightBreaks", "lineJoiner"});
    pack->text_pattern = parser.class_field(require(text, "pattern", tpath), "text.pattern");
    pack->class_fields.emplace_back("text.pattern", pack->text_pattern);
    one_of(require(text, "scanStart", tpath), "text.scanStart", {"cursor", "word"});
    one_of(require(text, "segmentation", tpath), "text.segmentation", {"scan", "spaces"});
    pack->word_characters = parser.class_field(require(text, "wordCharacters", tpath), "text.wordCharacters");
    pack->class_fields.emplace_back("text.wordCharacters", pack->word_characters);
    if (const Json& internal = require(text, "wordInternal", tpath); !internal.is_null()) {
      pack->word_internal = parser.class_field(internal, "text.wordInternal");
      pack->class_fields.emplace_back("text.wordInternal", *pack->word_internal);
    }
    if (!trusted) check_text_shape(text);

    // capabilities (its characterView pattern is the next class field)
    Declared declared;
    if (!trusted) check_capabilities(root, parser, declared);

    // lookup
    const std::string lpath = "lookup";
    const Object& lookup = as_object(require(root, "lookup", ""), lpath);
    check_keys(lookup, lpath, {"searchResolution", "preprocessors", "postprocessors", "readingNormalizer", "transforms",
                               "traceSelection", "formOf", "functionWords", "variantPasses"});
    pack->resolution = one_of(require(lookup, "searchResolution", lpath), "lookup.searchResolution", {"character", "word"}) == "word"
                           ? Resolution::Word
                           : Resolution::Character;
    std::set<std::string, std::less<>> processor_ids;
    pack->preprocessors = parser.processors(require(lookup, "preprocessors", lpath), "lookup.preprocessors", processor_ids, pack->class_fields);
    if (const Json* post = get(lookup, "postprocessors")) {
      pack->postprocessors = parser.processors(*post, "lookup.postprocessors", processor_ids, pack->class_fields);
    }
    for (const auto* list : {&pack->preprocessors, &pack->postprocessors}) {
      for (const auto& p : *list) {
        if (p.optional) {
          declared.optional_processors.insert(p.id);
          pack->has_optional_processors = true;
        }
      }
    }
    if (const Json* normalizer = get(lookup, "readingNormalizer"); normalizer != nullptr && !normalizer->is_null()) {
      pack->reading_normalizer = parser.step_list(*normalizer, "lookup.readingNormalizer", true, true, &pack->class_fields);
    }
    if (const Json& transforms = require(lookup, "transforms", lpath); !transforms.is_null()) {
      pack->transforms_file = as_string(transforms, "lookup.transforms");
      if (pack->transforms_file.empty() || pack->transforms_file.find_first_of("/\\") != std::string::npos ||
          pack->transforms_file.starts_with(".")) {
        fail("lookup.transforms", "must name a file in the pack's directory");
      }
    }
    if (const Json* selection = get(lookup, "traceSelection")) {
      pack->trace_selection = one_of(*selection, "lookup.traceSelection", {"shortest", "first"}) == "first"
                                  ? TraceSelection::First
                                  : TraceSelection::Shortest;
    }
    if (const Json* form_of = get(lookup, "formOf")) {
      pack->form_of = one_of(*form_of, "lookup.formOf", {"follow", "asTerm"}) == "asTerm" ? FormOf::AsTerm : FormOf::Follow;
    }
    if (const Json* words = get(lookup, "functionWords")) pack->function_words = string_array(*words, "lookup.functionWords");
    if (const Json* passes = get(lookup, "variantPasses")) {
      const std::string ppath = "lookup.variantPasses";
      const Array& list = as_array(*passes, ppath);
      for (size_t i = 0; i < list.size(); ++i) {
        const std::string vpath = item(ppath, i);
        const Object& p = as_object(list[i], vpath);
        check_keys(p, vpath, {"id", "builtin", "optional"});
        VariantPass pass;
        pass.id = as_string(require(p, "id", vpath), member(vpath, "id"));
        if (pass.id.empty()) fail(member(vpath, "id"), "may not be empty");
        if (!declared.passes.insert(pass.id).second || processor_ids.contains(pass.id)) {
          fail(member(vpath, "id"), "the id " + json_quote(pass.id) + " is used twice");
        }
        const std::string_view builtin = as_string(require(p, "builtin", vpath), member(vpath, "builtin"));
        pass.builtin = find_pass_builtin(builtin);
        if (pass.builtin == nullptr) fail(member(vpath, "builtin"), "unknown variant pass builtin " + json_quote(builtin));
        if (const Json* optional = get(p, "optional"); optional != nullptr && !as_bool(*optional, member(vpath, "optional"))) {
          fail(member(vpath, "optional"), "variant passes are always optional");
        }
        pack->variant_passes.push_back(std::move(pass));
      }
    }

    // presentation (display transforms add class fields after the processors')
    // and host, which only hosts and tests/classes.json read.
    if (!trusted) {
      check_presentation(as_object(require(root, "presentation", ""), "presentation"), parser, declared);
      const Object& host = as_object(require(root, "host", ""), "host");
      check_host(host);
      pack->sample_texts = sample_texts(host);
    }

    // transforms.json, or the rules that replace it
    if (pack->transforms_file.empty() && !transforms_json.empty()) {
      pack->transforms_file = "transforms.json";
    }
    if (!pack->transforms_file.empty() || rules_name) {
      file = rules_name ? std::string(*rules_name) : pack->transforms_file;
      if (transforms_json.empty() && !rules_name) {
        fail("", "lookup.transforms names " + pack->transforms_file + " but no transforms were given");
      }
      json::Document transforms_document;
      parse_json(transforms_json, transforms_document);
      pack->transforms = std::make_unique<TransformSet>();
      pack->transforms->word_characters = &pack->word_characters;
      TransformsParser tp{parser, *pack->transforms, pack->class_fields, {}};
      tp.parse(as_object(transforms_document.root(), ""));
      file = "language.json";
    }

    // settings (after the transforms, whose optional ids they may name)
    if (!trusted) parse_settings(require(root, "settings", ""), *pack, declared, /*transform_ids=*/!rules_name);

    // Trace steps: the transforms, then the variant passes.
    if (pack->transforms) {
      for (const auto& t : pack->transforms->transforms) pack->trace_steps.push_back({t.id, t.name, t.description});
    }
    for (auto& pass : pack->variant_passes) {
      pass.step = static_cast<uint32_t>(pack->trace_steps.size());
      pack->trace_steps.push_back({pass.id, std::string(pass.builtin->trace_name), std::string(pass.builtin->trace_description)});
    }
  } catch (const Failure& failure) {
    if (error != nullptr) {
      *error = (pack->code.empty() ? std::string("?") : pack->code) + ": " + file + ": " + failure.what();
    }
    return nullptr;
  }

  // Named step lists for tests/classes.json (section 12.1), which only the
  // conformance test reads.
  if (!trusted) build_named_steps(*pack);
  return pack;
}
}  // namespace

std::unique_ptr<PackData> parse_pack(std::string_view language_json, std::string_view transforms_json,
                                     std::string* error, bool trusted) {
  return parse(language_json, transforms_json, error, trusted, std::nullopt);
}

std::unique_ptr<PackData> parse_pack_with_rules(std::string_view language_json, std::string_view rules_json,
                                                std::string_view rules_name, std::string* error) {
  return parse(language_json, rules_json, error, /*trusted=*/false, rules_name);
}

namespace {
[[gnu::noinline]] void build_named_steps(PackData& pack_data) {
  PackData* pack = &pack_data;
  for (const auto* list : {&pack->preprocessors, &pack->postprocessors}) {
    for (const auto& p : *list) {
      NamedSteps named{p.id, {}};
      for (const auto& variant : p.variants) {
        for (const auto& step : variant) named.steps.push_back(&step);
      }
      pack->named_steps.push_back(std::move(named));
    }
  }
  if (pack->reading_normalizer) {
    NamedSteps named{"lookup.readingNormalizer", {}};
    for (const auto& step : *pack->reading_normalizer) named.steps.push_back(&step);
    pack->named_steps.push_back(std::move(named));
  }
  for (const auto& [name, steps] : pack->display_transforms) {
    NamedSteps named{member("presentation.displayTransforms", name), {}};
    for (const auto& step : steps) named.steps.push_back(&step);
    pack->named_steps.push_back(std::move(named));
  }
  if (pack->transforms) {
    // One list per JSON rule with `then` (a cross product shares its first rule's).
    std::set<std::pair<uint32_t, uint32_t>> seen;
    for (const auto& rule : pack->transforms->rules) {
      if (!rule.has_then || !seen.insert({rule.transform, rule.index_in_transform}).second) continue;
      NamedSteps named{"transforms[" + std::to_string(rule.transform) + "].rules[" + std::to_string(rule.index_in_transform) + "].then", {}};
      for (const auto& step : rule.extra->then) named.steps.push_back(&step);
      pack->named_steps.push_back(std::move(named));
    }
  }
}
}  // namespace

HOSHIDICTS_LOAD_TIME_END

}  // namespace hoshidicts::lang
