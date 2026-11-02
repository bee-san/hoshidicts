// SPDX-License-Identifier: GPL-3.0-or-later
// The language pack model (docs/languages.md, sections 4-7 and 9): character
// classes, the pattern dialect, text steps and processors, every rule type,
// conditions, cycles, schema checks, the registry, and word resolution in a
// lookup.
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <random>
#include <string>
#include <utility>
#include <vector>

#include "hoshidicts/importer.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "languages/classes.hpp"
#include "languages/json.hpp"
#include "languages/pack.hpp"
#include "languages/regex.hpp"
#include "languages/steps.hpp"

namespace lang = hoshidicts::lang;

namespace {
int failures = 0;
size_t cases = 0;

void check(bool ok, const std::string& what) {
  ++cases;
  if (!ok) {
    ++failures;
    std::fprintf(stderr, "FAIL: %s\n", what.c_str());
  }
}

std::u32string u32(const std::string& s) {
  std::u32string out;
  lang::decode_utf8(s, out);
  return out;
}

// --- classes -----------------------------------------------------------------

const lang::CharClass* no_classes(std::string_view name, std::string* error) {
  *error = "{" + std::string(name) + "} names no class of this pack";
  return nullptr;
}

std::optional<lang::CharClass> parse(const std::string& source, std::string* error = nullptr) {
  std::string e;
  auto parsed = lang::parse_class(source, no_classes, &e);
  if (error != nullptr) *error = e;
  return parsed;
}

void test_classes() {
  for (const char* ok : {"[a-z]", "[^a]", "[]", "[^]", "[\\u0041-\\u005A]", "[\\u{1F600}]", "[\\-\\]\\^\\\\]", "[[]",
                         "[\\p{L}\\p{Nd}]", "[\\p{C}]", "[ab-d{]"}) {
    std::string error;
    const bool parsed = parse(ok, &error).has_value();
    // `{` always starts a reference: the last one is an error.
    if (std::string_view(ok) == "[ab-d{]") {
      check(!parsed, std::string("rejects ") + ok);
    } else {
      check(parsed, std::string("accepts ") + ok + ": " + error);
    }
  }
  for (const char* bad : {"[a-]", "[-a]", "[a^]", "[}]", "[\\p{Script=Latin}]", "[\\p{scx=Han}]", "[\\P{L}]",
                          "[\\uD800]", "[\\u{D800}]", "[\\p{LC}]", "[z-a]", "[\\p{L}-z]", "[a-\\p{L}]", "a", "[a]b",
                          "[a", "[\\w]", "[\\u12]", "[\\u{1234567}]", "[\\u{110000}]", "{1a}", "{a b}"}) {
    check(!parse(bad).has_value(), std::string("rejects ") + bad);
  }
  {
    const auto c = parse("[^a]");
    check(c && !c->contains('a') && c->contains('b') && c->contains(0x1F600) && !c->contains(0xD800), "[^a] members");
  }
  {
    const auto c = parse("[\\p{Lu}]");
    check(c && c->contains('A') && !c->contains('a') && c->contains(0x0391), "\\p{Lu} members");
  }
  {
    const auto c = parse("[]");
    check(c && c->empty(), "[] is empty");
  }
  {
    // References, forward and inside brackets, and a negated class referenced.
    std::vector<std::pair<std::string, lang::CharClass>> named;
    lang::ClassResolver resolve = [&](std::string_view name, std::string* error) -> const lang::CharClass* {
      static const lang::CharClass vowels = *parse("[aeiou]");
      static const lang::CharClass not_a = *parse("[^a]");
      if (name == "vowel") return &vowels;
      if (name == "notA") return &not_a;
      *error = "undefined";
      return nullptr;
    };
    std::string error;
    const auto c = lang::parse_class("[{vowel}y]", resolve, &error);
    check(c && c->contains('e') && c->contains('y') && !c->contains('b'), "reference inside brackets");
    const auto d = lang::parse_class("[^{notA}]", resolve, &error);
    check(d && d->contains('a') && !d->contains('b'), "negated reference inside a negated class");
    check(!lang::parse_class("{missing}", resolve, &error).has_value(), "undefined reference");
  }
}

// --- the pattern dialect -------------------------------------------------------

std::unique_ptr<lang::Pattern> pattern(const std::string& source, const std::string& replacement = "", bool global = false,
                                      std::string* error = nullptr) {
  static const lang::CharClass letters = *parse("[a-z]");
  static const lang::CharClass astral = *parse("[\\u{1F600}]");
  std::string e;
  auto p = lang::Pattern::compile(
      source, replacement, global,
      [](std::string_view name) -> const lang::CharClass* {
        if (name == "letter") return &letters;
        if (name == "emoji") return &astral;
        return nullptr;
      },
      &e);
  if (error != nullptr) *error = e;
  return p;
}

void test_patterns() {
  for (const char* ok : {"(l|dell|all)['\xE2\x80\x99]", "^ge([a-z]+)t$", "(?:ab)+?", "a{2,3}", "a{2}", "a{2,}", "(a)\\1",
                         "(?=a)a", "(?!b).", "[{letter}]+", "{letter}+", "\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\/\\^\\$",
                         "[\\[\\]\\-\\^\\\\]", "\\u0041", "^$"}) {
    std::string error;
    check(pattern(ok, "", false, &error) != nullptr, std::string("pattern accepts ") + ok + ": " + error);
  }
  for (const char* bad : {"(?<=a)b", "(?<!a)b", "\\p{L}", "\\w", "\\s", "\\d", "\\b", "(?<name>a)", "\\k<name>",
                          "[[:alpha:]]", "[]", "[^]", "a**", "(?=a)*", "^*", "\\1(a)", "(a)\\10", "\\u{41}", "{missing}",
                          "{emoji}", "a{3,2}", "[a-]", "[a[]", ")", "(a", "]", "}", "\xF0\x9F\x98\x80+", "*a",
                          "(?i)a", "\\x41"}) {
    check(pattern(bad) == nullptr, std::string("pattern rejects ") + bad);
  }
  check(pattern("(a)", "$1$&") != nullptr, "replacement $1 $&");
  for (const char* bad : {"$$", "$2", "$10", "$`", "$'", "$a", "$"}) {
    check(pattern("(a)", bad) == nullptr, std::string("replacement rejects ") + bad);
  }
  {
    // Constructs std::wregex and JavaScript read differently (section 7.6):
    // an empty match in a global replacement, a back-reference to a group
    // that may not take part, a capture inside a repeated group, and a
    // quantifier on a group that can match the empty text (exponential in
    // std::regex). The first cases are the audit's (JavaScript / engine):
    // a*? on baaa gives -b-a-a-a- / -b-------; (a)|b\1 on b gives X / no
    // match; (?:(x)|y)*z with [$1] on xyz gives [] / [x]; the last pattern
    // hung std::regex for minutes on a six-character text.
    const struct {
      const char* source;
      bool global;
    } different[] = {
        {"a*?", true},
        {"a{0,2}?", true},
        {"(a)|b\\1", false},
        {"(a)|b\\1", true},
        {"(?:(a)|b)+\\1", false},
        {"(?:(x)|y)*z", false},
        {"(a*)*b", false},
        {"(?:a|())*b", false},
        {"\xE3\x81\x84\\.*|.(((?=c{2}?a\xE3\x81\x84*?|\xE3\x81\x84" "a{0,2})|(\xE3\x81\x84{0,2}|c*a{0,2}){0,2}?)*?"
         "[\\u0061-\\u0062]\\)|\\.)",
         false},
        // The same reasons, more forms.
        {"a?|b", true},
        {"|a", true},
        {"x*", true},
        {"$", true},
        {"(?=a)", true},
        // libstdc++ reads ^ in a lookahead as the start of the lookahead:
        // [ab]+(?!^|^) on abbいいc (global, Z) gives Zいいc in JavaScript and
        // aZいいc in the engine.
        {"[ab]+(?!^|^)", true},
        {"(?=^a)a", false},
        {"\xE3\x81\x84{0,2}?", true},
        // The other differing patterns of the audit's random test.
        {R"p(((?=(a{2}c|aaい)|(?=c{0,2}a{2}?|aa*c)(ac*|c{0,2}a))|.{2}c*?((?=a{2}い*a*?|[^a]+)(?=.*.{2}.{0,2})|.*){1,3})a{0,2}(\()*?|.\.+?((?=cc|(?!c{2}い*|いac))|い{0,2}\.)\1)p",
         false},
        {R"p(.{0,2}?い(((?=[^a]{1,3}c*)c{0,2}.|\.)*?a*.*|(?=c*?a|c)(?:(a?a*い|[ab]{2}.{2}.)|a{2}い\({2}?){2})*?|.\1)p", false},
        {R"p(\.{2}(い{0,2}|.*(?=(い{0,2}?い{0,2}a{2}|い{0,2}c{0,2}))(?=\.{1,3}?(?:c{2}い{0,2}|a{0,2}?x){0,2}?|a*))|c.{2}?.{0,2}\1)p", true},
        {R"p(((?=.{0,2}?[a-c](c*|い)|(?=c{0,2}[a-c].{0,2}|.x?))(?=.{2}|x??(?=c*?))|((a)\.{2})*い{2}(?=.{1,3}\.{2})){0,2}\1)p", true},
        {"(a)?\\1", false},
        {"(a)*\\1", false},
        {"(?!(a))\\1", false},
        {"(?:(a)|c)\\1", false},
        {"((a)|b)\\2", false},
        {"((a)|b)*", false},
        {"(?:a?)+", false},
        {"(?:a|)*", false},
        {"(?:(?=a))+", false},
        {"()\\1*", false},
        {"a{70000}", false},
    };
    for (const auto& d : different) {
      std::string error;
      check(pattern(d.source, "", d.global, &error) == nullptr,
            std::string("pattern rejects ") + d.source + (d.global ? " (global)" : ""));
    }
    const struct {
      const char* source;
      bool global;
    } same[] = {
        {"(a|b)*c", false},     {"(a)\\1", false},       {"(?:(a)\\1|b)", false}, {"(?=(a))\\1", false},
        {"(a)+\\1", false},     {"((a)|b)\\1", false},   {"(a)\\1|b", false},     {"(a)(?:b\\1)*", false},
        {"(a)(\\1)+", false},   {"(a)\\1*", false},      {"(?:ab?)?", false},     {"a*?", false},
        {"x*", false},          {"$", false},            {"a", true},             {"a*b", true},
        {"^a", true},           {"a(?=b$)", true},
        {"(l|dell|all)['\xE2\x80\x99]", true},
    };
    for (const auto& s : same) {
      std::string error;
      check(pattern(s.source, "", s.global, &error) != nullptr,
            std::string("pattern accepts ") + s.source + (s.global ? " (global)" : "") + ": " + error);
    }
  }
  std::string out;
  {
    auto p = pattern("a", "b");
    check(p->replace("aaa", out) && out == "baa", "first match only: " + out);
  }
  {
    auto p = pattern("a", "b", true);
    check(p->replace("aaa", out) && out == "bbb", "global: " + out);
  }
  {
    // `.` is JavaScript's: not a line terminator, U+2028 or U+2029.
    auto p = pattern("^.$");
    check(p->search("x") && !p->search("\n") && !p->search("\xE2\x80\xA8") && !p->search("\xE2\x80\xA9"), "dot");
  }
  {
    // One UTF-16 unit per wchar_t: `.` matches half of a surrogate pair.
    auto p = pattern("^..$");
    check(p->search("\xF0\x9F\x98\x80"), "dot on UTF-16 units");
  }
  {
    auto p = pattern("^([a-z]+) .+ ab$", "$1 ab");
    check(p->replace("fahre morgen ab", out) && out == "fahre ab", "separated prefix: " + out);
  }
  {
    auto p = pattern("^ge({letter}+)t$", "$1en");
    check(p->replace("gemacht", out) && out == "machen", "class reference: " + out);
    check(p->expanded() == "^ge([\\u0061-\\u007A]+)t$", "expansion: " + p->expanded());
  }
}

// --- steps and processors ------------------------------------------------------

lang::Step case_step(lang::CaseMode mode) {
  lang::Step s;
  s.kind = lang::StepKind::Case;
  s.case_mode = mode;
  return s;
}

std::string apply(const lang::Step& step, const std::string& text) {
  std::u32string out;
  lang::apply_step(step, u32(text), out);
  return lang::to_utf8(out);
}

lang::Step map_step(std::vector<std::pair<std::string, std::string>> entries, lang::MapAt at) {
  lang::Step s;
  s.kind = lang::StepKind::Map;
  for (auto& [k, v] : entries) s.map.emplace_back(u32(k), u32(v));
  std::ranges::stable_sort(s.map, [](const auto& a, const auto& b) {
    return a.first.size() != b.first.size() ? a.first.size() > b.first.size() : a.first < b.first;
  });
  s.at = at;
  return s;
}

void test_steps() {
  check(apply(case_step(lang::CaseMode::Lower), "ΟΔΟΣ") == "οδος", "Final_Sigma");
  check(apply(case_step(lang::CaseMode::Lower), "ΣΑ Σ") == "σα σ", "sigma not final");
  check(apply(case_step(lang::CaseMode::Lower), "İ") == "i\xCC\x87", "U+0130 lowercase");
  check(apply(case_step(lang::CaseMode::Upper), "straße") == "STRASSE", "ß uppercase");
  check(apply(case_step(lang::CaseMode::UpperFirst), "ßa") == "SSa", "upperFirst expands");
  check(apply(case_step(lang::CaseMode::LowerFirst), "ΣΑ") == "σΑ", "lowerFirst alone");
  check(apply(case_step(lang::CaseMode::UpperFirst), "\xF0\x9F\x98\x80" "a") == "\xF0\x9F\x98\x80" "a", "upperFirst astral");

  check(apply(map_step({{"aa", "b"}}, lang::MapAt::All), "aaa") == "ba", "map all");
  check(apply(map_step({{"aa", "b"}}, lang::MapAt::Last), "aaa") == "ba", "map last is the last left-to-right match");
  check(apply(map_step({{"aa", "b"}}, lang::MapAt::Last), "aaaa") == "aab", "map last");
  check(apply(map_step({{"a", "x"}, {"ab", "y"}}, lang::MapAt::All), "abab") == "yy", "map longest key first");
  check(apply(map_step({{"a", "x"}}, lang::MapAt::First), "bab") == "bxb", "map first");
  check(apply(map_step({{"b", "x"}}, lang::MapAt::Start), "bab") == "xab", "map start");
  check(apply(map_step({{"a", "x"}}, lang::MapAt::Start), "bab") == "bab", "map start needs the key first");
  check(apply(map_step({{"b", "x"}, {"ab", "y"}}, lang::MapAt::End), "bab") == "by", "map end, longest");

  {
    lang::Step s;
    s.kind = lang::StepKind::Alternatives;
    s.alternatives.emplace_back(u32("c"), std::vector<std::u32string>{u32("č"), u32("ć")});
    std::vector<std::u32string> out;
    lang::apply_steps({s}, u32("cc"), out);
    std::vector<std::string> got;
    for (auto& o : out) got.push_back(lang::to_utf8(o));
    check(got == std::vector<std::string>{"cc", "cč", "cć", "čc", "čč", "čć", "ćc", "ćč", "ćć"}, "alternatives order");
    s.limit = 2;
    out.clear();
    lang::apply_steps({s}, u32("cc"), out);
    check(out.size() == 2 && lang::to_utf8(out[1]) == "cč", "alternatives limit");
  }
  {
    lang::Step s;
    s.kind = lang::StepKind::Normalize;
    s.form = lang::NormalForm::NFD;
    check(apply(s, "é") == "e\xCC\x81", "NFD");
    s.form = lang::NormalForm::NFKD;
    s.has_within = true;
    s.chars = *parse("[\\u3300-\\u33FF]");
    check(apply(s, "㌔ｱ") == "キロｱ", "NFKD within: " + apply(s, "㌔ｱ"));
  }
  {
    lang::Step s;
    s.kind = lang::StepKind::Strip;
    s.chars = *parse("[\\u0300-\\u036F]");
    check(apply(s, "e\xCC\x81te\xCC\x81") == "ete", "strip");
  }
  {
    // Greek removeDoubleAcuteAccents: NFD, then repeat the pattern, then NFC.
    lang::Step nfd;
    nfd.kind = lang::StepKind::Normalize;
    nfd.form = lang::NormalForm::NFD;
    lang::Step p;
    p.kind = lang::StepKind::Pattern;
    p.pattern = pattern("(\\u0301[^\\u0301]*)\\u0301", "$1");
    p.repeat = true;
    lang::Step nfc;
    nfc.kind = lang::StepKind::Normalize;
    nfc.form = lang::NormalForm::NFC;
    std::u32string out;
    lang::apply_single({nfd, p, nfc}, u32("άνθρωπός"), out);
    check(lang::to_utf8(out) == "άνθρωπος", "pattern with repeat: " + lang::to_utf8(out));
  }

  // Processors (section 6.1).
  {
    lang::Processor lower{"lower", "", true, false, {{case_step(lang::CaseMode::Lower)}}};
    lang::Processor upper_first{"upperFirst", "", true, false, {{case_step(lang::CaseMode::UpperFirst)}}};
    const std::vector<lang::Processor> processors{lower, upper_first};
    const auto v = lang::process_text(processors, "Walked", {});
    std::string got;
    for (const auto& x : v) got += x.text + ":" + std::to_string(x.steps) + " ";
    check(got == "Walked:0 walked:1 ", "processors keep the smallest steps, sorted: " + got);
  }
  {
    lang::Step strip;
    strip.kind = lang::StepKind::Strip;
    strip.chars = *parse("[x]");
    lang::Processor replace{"replace", "", false, false, {{strip}}};
    const std::vector<lang::Processor> processors{replace};
    auto v = lang::process_text(processors, "axb", {});
    check(v.size() == 1 && v[0].text == "ab" && v[0].steps == 1, "keepInput false replaces");
    v = lang::process_text(processors, "ab", {});
    check(v.size() == 1 && v[0].text == "ab" && v[0].steps == 0, "keepInput false keeps an unchanged text");
  }
  {
    lang::Processor optional{"opt", "", true, true, {{case_step(lang::CaseMode::Upper)}}};
    const std::vector<lang::Processor> processors{optional};
    check(lang::process_text(processors, "a", {}).size() == 1, "optional processor off");
    const std::vector<std::string> ids{"opt"};
    check(lang::process_text(processors, "a", lang::EnabledOptions{ids}).size() == 2, "optional processor on");
  }
  {
    lang::Step s;
    s.kind = lang::StepKind::Alternatives;
    s.alternatives.emplace_back(u32("a"), std::vector<std::u32string>{u32("b"), u32("c"), u32("d")});
    lang::Processor many{"many", "", true, false, {{s}}};
    const std::vector<lang::Processor> processors{many};
    bool limit = false;
    const auto v = lang::process_text(processors, "aaaaaaa", {}, &limit);  // 4^7 = 16384 combinations
    check(limit && v.size() == lang::max_text_variants, "variant limit");
  }
}

// --- packs -----------------------------------------------------------------------

std::string language_json(const std::string& lookup_extra = "", const std::string& code = "xx",
                          const std::string& settings = "[]", const std::string& word_chars = "[a-zA-Z']") {
  return R"({"schema":1,"code":")" + code + R"(","iso639_3":"xxx","name":"Test","nativeName":"Test","bcp47":"xx","scripts":["Latn"],"direction":"ltr",
"classes":{"letter":"[a-z]","vowel":"[aeiou]","consonant":"[b-df-hj-np-tv-z]"},
"text":{"pattern":"{letter}","scanStart":"word","segmentation":"spaces","wordCharacters":")" + word_chars + R"(","wordInternal":null,
"sentence":{"terminators":["."],"quotePairs":[]},"highlightBreaks":null,"lineJoiner":" "},
"lookup":{"searchResolution":"word","preprocessors":[{"id":"decapitalize","variants":[[{"case":"lower"}]]}],"transforms":"transforms.json")" +
         lookup_extra + R"(},
"capabilities":{"readings":"none","ruby":null,"pitchAccent":false,"characterView":null,"wordHighlighting":true},
"presentation":{"typography":{"fontFamily":null,"wordBreak":null,"lineBreak":null,"joinedScript":false},"labels":{},"displayTransforms":{"up":[{"case":"upper"}]}},
"settings":)" + settings + R"(,
"host":{"ttsLanguage":"xx","audioLanguage":"xx","anki":{"noteTypeFamilies":[],"fieldAliases":{},"partOfSpeechLabels":{}},"frequencySamples":null,
"recommendedDictionaries":[],"sample":{"warmup":"walked","practice":{"text":"a","lookup":"a"},
"entry":{"expression":"a","reading":"a","glossary":["a"],"definitionTags":"","matched":"a","trace":[]},"character":null}}})";
}

std::string transforms_json(const std::string& transforms, const std::string& word_lists = "{}") {
  return R"({"schema":1,
"conditions":{"v":{"name":"Verb","isDictionaryForm":true,"subConditions":["v_phr","v_plain"]},"v_phr":{"name":"Phrasal","isDictionaryForm":true},
"v_plain":{"name":"Plain verb","isDictionaryForm":true},"n":{"name":"Noun","isDictionaryForm":true},"x":{"name":"Other","isDictionaryForm":false}},
"wordLists":)" + word_lists + R"(,"transforms":[)" + transforms + "]}";
}

std::string transform(const std::string& id, const std::string& rules, const std::string& extra = "") {
  return R"({"id":")" + id + R"(","name":")" + id + R"(","description":"d","source":"own")" + extra + R"(,"rules":[)" + rules + "]}";
}

std::shared_ptr<const hoshidicts::LanguagePack> load(const std::string& transforms, std::string* error = nullptr,
                                                    const std::string& lookup_extra = "",
                                                    const std::string& settings = "[]") {
  std::string e;
  auto pack = hoshidicts::parse_language_pack(language_json(lookup_extra, "xx", settings), transforms, &e);
  if (error != nullptr) *error = e;
  return pack;
}

// "text:conditions:trace" for every deinflection of `text`, trace in
// application order.
std::vector<std::string> deinflect(const hoshidicts::LanguagePack& pack, const std::string& text,
                                   const std::vector<bool>* enabled = nullptr) {
  const auto& data = pack.data();
  lang::Deinflections list;
  data.transforms->deinflect(text, list, enabled);
  std::vector<std::string> out;
  for (const auto& d : list) {
    std::string trace;
    std::vector<std::string> steps;
    for (const auto* n = &d;; n = &list[n->parent]) {
      if (n->via != lang::Deinflection::none) steps.push_back(data.trace_steps[data.transforms->step_of(n->via)].id);
      if (n->parent == lang::Deinflection::npos) break;
    }
    for (auto it = steps.rbegin(); it != steps.rend(); ++it) trace += (trace.empty() ? "" : ">") + *it;
    std::string conditions;
    for (auto name : data.transforms->condition_names(d.conditions)) conditions += (conditions.empty() ? "" : ",") + std::string(name);
    out.push_back(d.text + ":" + conditions + ":" + trace);
  }
  return out;
}

bool has(const std::vector<std::string>& results, const std::string& entry) {
  return std::ranges::find(results, entry) != results.end();
}

std::string join(const std::vector<std::string>& v) {
  std::string out;
  for (const auto& s : v) out += (out.empty() ? "" : " | ") + s;
  return out;
}

void test_rules() {
  std::string error;
  {
    const auto pack = load(transforms_json(transform(
        "past", R"({"type":"suffix","inflected":"ed","deinflected":"","conditionsIn":[],"conditionsOut":["v"]},
                   {"type":"suffix","inflected":"ed","deinflected":"e","conditionsIn":[],"conditionsOut":["v"],"stemMinLength":3},
                   {"type":"wholeWord","inflected":"went","deinflected":"go","conditionsIn":[],"conditionsOut":["v"]})")),
                           &error);
    check(pack != nullptr, "suffix pack loads: " + error);
    if (pack) {
      const auto r = deinflect(*pack, "walked");
      check(r == std::vector<std::string>{"walked::", "walk:v_phr,v_plain:past", "walke:v_phr,v_plain:past"},
            "suffix and stem length: " + join(r));
      check(deinflect(*pack, "bed") == std::vector<std::string>{"bed::", "b:v_phr,v_plain:past"}, "stemMinLength");
      check(has(deinflect(*pack, "went"), "go:v_phr,v_plain:past"), "wholeWord");
      check(!has(deinflect(*pack, "underwent"), "undergo:v_phr,v_plain:past"), "wholeWord only matches the whole text");
    }
  }
  {
    const auto pack = load(transforms_json(transform(
        "t", R"({"type":"suffix","inflected":"","deinflected":"e","conditionsIn":[],"conditionsOut":["v"],"stemEndsWith":"[t]"},
                {"type":"prefix","inflected":"un","deinflected":"","conditionsIn":[],"conditionsOut":["v"],"stemStartsWith":"{consonant}"},
                {"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"],"stemNotEndsWith":"[s]"},
                {"type":"suffix","inflected":"es","deinflected":"","conditionsIn":[],"conditionsOut":["n"],"stemCharacters":"[a-z]","stemContains":"{vowel}"},
                {"type":"suffix","inflected":"o","deinflected":"ar","conditionsIn":[],"conditionsOut":["v"],"stemStartsWithText":"jue","stemChange":{"from":["ue"],"to":"u","occurrence":"first"}},
                {"type":"suffix","inflected":"o","deinflected":"ar","conditionsIn":[],"conditionsOut":["v"],"stemNotStartsWithText":"jue","stemChange":{"from":["ie","ue"],"to":"e","occurrence":"first"}})")),
                           &error);
    check(pack != nullptr, "constraint pack loads: " + error);
    if (pack) {
      check(has(deinflect(*pack, "writ"), "write:v_phr,v_plain:t"), "empty suffix with stemEndsWith");
      check(has(deinflect(*pack, "undo"), "do:v_phr,v_plain:t"), "prefix with stemStartsWith");
      check(!has(deinflect(*pack, "unarm"), "arm:v_phr,v_plain:t"), "stemStartsWith refuses");
      check(!has(deinflect(*pack, "glasss"), "glass:n:t"), "stemNotEndsWith");
      check(has(deinflect(*pack, "boxes"), "box:n:t") && !has(deinflect(*pack, "xxes"), "xx:n:t"), "stemContains");
      check(has(deinflect(*pack, "juego"), "jugar:v_phr,v_plain:t"), "stemStartsWithText with a stem change");
      check(has(deinflect(*pack, "pienso"), "pensar:v_phr,v_plain:t"), "stem change ie -> e");
      check(!has(deinflect(*pack, "hablo"), "hablar:v_phr,v_plain:t"), "a stem change needs a match");
    }
  }
  {
    // stemChange with between and occurrence last (Ukrainian [ое] -> і before consonants).
    const auto pack = load(transforms_json(transform(
        "t", R"({"type":"suffix","inflected":"a","deinflected":"","conditionsIn":[],"conditionsOut":["n"],"stemChange":{"from":["o","e"],"to":"i","occurrence":"last","between":"{consonant}"}})")),
                           &error);
    check(pack != nullptr, "between pack loads: " + error);
    if (pack) {
      check(has(deinflect(*pack, "kota"), "kit:n:t"), "between: last vowel before consonants");
      check(has(deinflect(*pack, "kostra"), "kistr:n:t"), "between: several consonants");
      check(deinflect(*pack, "kotoa").size() == 1, "between refuses a vowel after the change");
    }
  }
  {
    const auto pack = load(transforms_json(
        transform("c", R"({"type":"circumfix","inflectedPrefix":"ge","deinflectedPrefix":"","inflectedSuffix":"t","deinflectedSuffix":"en","conditionsIn":[],"conditionsOut":["v"],"stemMinLength":1},
                          {"type":"circumfix","prefixes":[["ab",""],["an",""]],"suffixes":[["t","en"],["et","en"]],"conditionsIn":[],"conditionsOut":["v"]})")),
                           &error);
    check(pack != nullptr, "circumfix pack loads: " + error);
    if (pack) {
      check(has(deinflect(*pack, "gemacht"), "machen:v_phr,v_plain:c"), "circumfix");
      check(!has(deinflect(*pack, "get"), "en:v_phr,v_plain:c"), "circumfix parts may not overlap the stem limit");
      check(has(deinflect(*pack, "abholt"), "holen:v_phr,v_plain:c") && has(deinflect(*pack, "anredet"), "reden:v_phr,v_plain:c") &&
                has(deinflect(*pack, "anredet"), "redeen:v_phr,v_plain:c"),
            "cross product");
      check(pack->data().transforms->rules.size() == 5, "cross product expanded to 4 rules");
    }
  }
  {
    const auto pack = load(transforms_json(transform(
        "r", R"({"type":"replace","inflected":"x","deinflected":"y","conditionsIn":[],"conditionsOut":["x"]},
                {"type":"replace","inflected":"x","deinflected":"z","occurrence":"first","conditionsIn":[],"conditionsOut":["x"]},
                {"type":"replace","inflected":"x","deinflected":"w","occurrence":"last","notAtStart":true,"conditionsIn":[],"conditionsOut":["x"]})")),
                           &error);
    check(pack != nullptr, "replace pack loads: " + error);
    if (pack) {
      const auto r = deinflect(*pack, "xax");
      check(r == std::vector<std::string>{"xax::", "yay:x:r", "zax:x:r", "xaw:x:r"}, "replace all, first, last: " + join(r));
      check(deinflect(*pack, "xa").size() == 3, "notAtStart skips an occurrence at the start");
    }
  }
  {
    const auto pack = load(transforms_json(
        transform("past", R"({"type":"suffix","inflected":"ed","deinflected":"","conditionsIn":["v"],"conditionsOut":["v"]},
                             {"type":"phrasal","inflected":"ed","deinflected":"","followedBy":"particles","conditionsIn":["v"],"conditionsOut":["v_phr"]})") +
            "," +
            transform("interposed", R"({"type":"interposedObject","particles":"particles","guardWords":"guard","conditionsIn":[],"conditionsOut":["v_phr"]})"),
        R"({"particles":["up","on","down"],"guard":["up","on","down","the","to"]})"),
                           &error);
    check(pack != nullptr, "phrasal pack loads: " + error);
    if (pack) {
      check(has(deinflect(*pack, "looked up"), "look up:v_phr:past"), "phrasal");
      check(!has(deinflect(*pack, "looked uptown"), "look uptown:v_phr:past"), "a particle is a whole word");
      check(has(deinflect(*pack, "looked up to"), "look up to:v_phr:past"), "phrasal keeps the other words");
      check(has(deinflect(*pack, "put it on the table"), "put on the table:v_phr:interposed"), "interposed object");
      check(has(deinflect(*pack, "put Mary's coat on"), "put on:v_phr:interposed"), "interposed object of two runs");
      check(!has(deinflect(*pack, "put on it"), "put it:v_phr:interposed"), "the object comes before the particle");
      check(!has(deinflect(*pack, "put the up on"), "put on:v_phr:interposed"), "guard words stop an object");
    }
  }
  {
    const auto pack = load(transforms_json(transform(
        "p", R"({"type":"pattern","pattern":"^([a-z]+) .+ ab$","replacement":"$1 ab","anchorSuffix":" ab","conditionsIn":[],"conditionsOut":["v_phr"]},
                {"type":"pattern","pattern":"^(ba)\\1","replacement":"$1","anchorPrefix":"ba","conditionsIn":[],"conditionsOut":["v"]})")),
                           &error);
    check(pack != nullptr, "pattern pack loads: " + error);
    if (pack) {
      check(has(deinflect(*pack, "fahre morgen ab"), "fahre ab:v_phr:p"), "pattern with anchorSuffix");
      check(has(deinflect(*pack, "babasa"), "basa:v_phr,v_plain:p"), "pattern with anchorPrefix and a back-reference");
      check(deinflect(*pack, "basa").size() == 1, "pattern needs a match");
    }
  }
  {
    const auto pack = load(transforms_json(transform(
        "re", R"({"type":"prefix","inflected":"re","deinflected":"","conditionsIn":[],"conditionsOut":["v"],"then":[{"case":"upper"}]})")),
                           &error);
    check(pack != nullptr, "then pack loads: " + error);
    if (pack) check(has(deinflect(*pack, "redo"), "DO:v_phr,v_plain:re"), "then steps");
  }
  {
    // Conditions: an empty conditionsIn applies only to texts without
    // conditions; a union condition overlaps its parts.
    const auto pack = load(transforms_json(
        transform("a", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})") + "," +
        transform("b", R"({"type":"suffix","inflected":"x","deinflected":"","conditionsIn":["v"],"conditionsOut":["v_plain"]})") + "," +
        transform("c", R"({"type":"suffix","inflected":"y","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})")),
                           &error);
    check(pack != nullptr, "conditions pack loads: " + error);
    if (pack) {
      const auto r = deinflect(*pack, "abys");
      check(r == std::vector<std::string>{"abys::", "aby:n:a"}, "empty conditionsIn: " + join(r));
      const auto& t = *pack->data().transforms;
      check(t.condition_bits("v") == (t.condition_bits("v_phr") | t.condition_bits("v_plain")), "subConditions union");
      const std::vector<std::string> tags{"v", "x", "unknown"};
      check(t.conditions_for_parts_of_speech(tags) == t.condition_bits("v"), "isDictionaryForm tags only");
      check(t.conditions_for_types(tags) == (t.condition_bits("v") | t.condition_bits("x")), "condition types");
    }
  }
  {
    // A cycle is cut where the same rule would apply to the same text again.
    const auto pack = load(transforms_json(transform(
        "swap", R"({"type":"replace","inflected":"a","deinflected":"b","conditionsIn":["x"],"conditionsOut":["x"]},
                   {"type":"replace","inflected":"b","deinflected":"a","conditionsIn":["x"],"conditionsOut":["x"]})")),
                           &error);
    check(pack != nullptr, "cycle pack loads: " + error);
    if (pack) {
      const auto r = deinflect(*pack, "a");
      check(r == std::vector<std::string>{"a::", "b:x:swap", "a:x:swap>swap"}, "cycle: " + join(r));
    }
  }
  {
    // Optional transforms are off unless enabled.
    const auto pack = load(transforms_json(transform(
        "opt", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})", R"(,"optional":true)")),
                           &error);
    check(pack != nullptr, "optional pack loads: " + error);
    if (pack) {
      check(deinflect(*pack, "cats").size() == 1, "optional transform off");
      const std::vector<bool> on{true};
      check(deinflect(*pack, "cats", &on).size() == 2, "optional transform on");
    }
  }
  {
    // Japanese order: longest ending first, rules of one ending in file order,
    // results depth first.
    const auto pack = load(transforms_json(
        transform("t1", R"({"type":"suffix","inflected":"b","deinflected":"x","conditionsIn":[],"conditionsOut":["n"]})") + "," +
        transform("t2", R"({"type":"suffix","inflected":"ab","deinflected":"y","conditionsIn":[],"conditionsOut":["n"]},
                           {"type":"suffix","inflected":"b","deinflected":"z","conditionsIn":[],"conditionsOut":["n"]})")),
                           &error);
    check(pack != nullptr, "order pack loads: " + error);
    if (pack) {
      const auto r = deinflect(*pack, "ab");
      check(r == std::vector<std::string>{"ab::", "y:n:t2", "ax:n:t1", "az:n:t2"}, "match order: " + join(r));
    }
  }
}

void test_schema() {
  const std::string good = transforms_json(transform("t", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})"));
  std::string error;
  check(load(good, &error) != nullptr, "good pack: " + error);
  const struct {
    std::string name;
    std::string language;
    std::string transforms;
    std::string expect;  // a part of the error
  } bad[] = {
      {"unknown top-level key", language_json().substr(0, language_json().size() - 1) + R"(,"extra":1})", good, "extra: unknown key"},
      {"code", language_json("", "XX1"), good, "code"},
      {"missing transforms", language_json(), "", "no transforms were given"},
      {"unknown condition", language_json(), transforms_json(transform("t", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":["zz"],"conditionsOut":["n"]})")), "conditionsIn[0]: names no condition"},
      {"unknown rule key", language_json(), transforms_json(transform("t", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"],"extra":1})")), "extra: unknown key"},
      {"stemChange on a prefix", language_json(), transforms_json(transform("t", R"({"type":"prefix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"],"stemChange":{"from":["a"],"to":"b"}})")), "stemChange: unknown key"},
      {"todo", language_json(), transforms_json(transform("t", R"({"type":"todo","isInflected":"x$","conditionsIn":[],"conditionsOut":[]})")), "todo"},
      {"duplicate id", language_json(), transforms_json(transform("t", "") + "," + transform("t", "")), "used twice"},
      {"empty suffix", language_json(), transforms_json(transform("t", R"({"type":"suffix","inflected":"","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})")), "only with a stem constraint"},
      {"long affix", language_json(), transforms_json(transform("t", R"({"type":"suffix","inflected":")" + std::string(65, 'a') + R"(","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})")), "longer than 64"},
      {"builtin in then", language_json(), transforms_json(transform("t", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"],"then":[{"builtin":"ja.nfkc"}]})")), "builtins are not allowed"},
      {"pattern without anchor", language_json(), transforms_json(transform("t", R"({"type":"pattern","pattern":"a","replacement":"b","conditionsIn":[],"conditionsOut":["n"]})")), "exactly one of anchorSuffix"},
      {"lookbehind", language_json(), transforms_json(transform("t", R"({"type":"pattern","pattern":"(?<=a)b","replacement":"c","anchorSuffix":"b","conditionsIn":[],"conditionsOut":["n"]})")), "lookbehind"},
      {"word list", language_json(), transforms_json(transform("t", R"({"type":"phrasal","inflected":"s","deinflected":"","followedBy":"nope","conditionsIn":[],"conditionsOut":["n"]})")), "names no word list"},
      {"unknown builtin", language_json(R"(,"variantPasses":[{"id":"p","builtin":"xx.nope","optional":true}])"), good, "unknown variant pass builtin"},
      {"setting effect", language_json("", "xx", R"([{"id":"s","type":"boolean","default":false,"label":"S","group":"lookup","effect":{"preprocessor":"decapitalize"}}])"), good, "names no optional processor"},
      {"setting display", language_json("", "xx", R"([{"id":"s","type":"enum","default":"a","values":[{"id":"a","label":"A"}],"label":"S","group":"display","effect":{"display":{"fields":["expression"],"when":"b","transform":"up"}}}])"), good, "when: is not one of"},
      {"class cycle", [] {
         std::string l = language_json();
         const auto at = l.find(R"("letter":"[a-z]")");
         l.replace(at, std::strlen(R"("letter":"[a-z]")"), R"("letter":"[{vowel}]")");
         const auto v = l.find(R"("vowel":"[aeiou]")");
         l.replace(v, std::strlen(R"("vowel":"[aeiou]")"), R"("vowel":"[{letter}]")");
         return l;
       }(), good, "cycle"},
  };
  for (const auto& c : bad) {
    std::string e;
    auto pack = hoshidicts::parse_language_pack(c.language, c.transforms, &e);
    check(pack == nullptr && e.find(c.expect) != std::string::npos, "schema " + c.name + ": " + e);
  }
  {
    // Required keys (section 4 and 12.1 step 1), each refused by name when it
    // is left out; frequencySamples lists 10 words each (4.8).
    const auto without = [](std::string json, const std::string& part) {
      const auto at = json.find(part);
      if (at == std::string::npos) return std::string("(the test's descriptor has no ") + part + ")";
      return json.erase(at, part.size());
    };
    const auto with = [](std::string json, const std::string& part, const std::string& replacement) {
      const auto at = json.find(part);
      if (at == std::string::npos) return std::string("(the test's descriptor has no ") + part + ")";
      return json.replace(at, part.size(), replacement);
    };
    const std::string sample =
        R"(,"sample":{"warmup":"walked","practice":{"text":"a","lookup":"a"},
"entry":{"expression":"a","reading":"a","glossary":["a"],"definitionTags":"","matched":"a","trace":[]},"character":null})";
    const std::string ten = R"(["a","b","c","d","e","f","g","h","i","j"])";
    const std::string nine = R"(["a","b","c","d","e","f","g","h","i"])";
    const struct {
      std::string name;
      std::string language;
      std::string expect;
    } required[] = {
        {"text.wordInternal", without(language_json(), R"("wordInternal":null,)"), R"(text: missing required key "wordInternal")"},
        {"text.highlightBreaks", without(language_json(), R"("highlightBreaks":null,)"), R"(text: missing required key "highlightBreaks")"},
        {"lookup.transforms", without(language_json(), R"(,"transforms":"transforms.json")"), R"(lookup: missing required key "transforms")"},
        {"host.sample", without(language_json(), sample), R"(host: missing required key "sample")"},
        {"9 common words", with(language_json(), R"("frequencySamples":null)", R"("frequencySamples":{"common":)" + nine + R"(,"rare":)" + ten + "}"),
         "host.frequencySamples.common: must list 10 words"},
        {"11 rare words", with(language_json(), R"("frequencySamples":null)", R"("frequencySamples":{"common":)" + ten + R"(,"rare":["k",)" + ten.substr(1) + "}"),
         "host.frequencySamples.rare: must list 10 words"},
    };
    for (const auto& c : required) {
      std::string e;
      auto pack = hoshidicts::parse_language_pack(c.language, good, &e);
      check(pack == nullptr && e.find(c.expect) != std::string::npos, "schema refuses a pack without " + c.name + ": " + e);
    }
    std::string e;
    const std::string samples = with(language_json(), R"("frequencySamples":null)", R"("frequencySamples":{"common":)" + ten + R"(,"rare":)" + ten + "}");
    check(hoshidicts::parse_language_pack(samples, good, &e) != nullptr, "frequencySamples of 10 and 10 words: " + e);
    // The keys may be null, and a pack whose lookup.transforms is null has no rules.
    const std::string no_rules = with(language_json(), R"("transforms":"transforms.json")", R"("transforms":null)");
    auto pack = hoshidicts::parse_language_pack(no_rules, "", &e);
    check(pack != nullptr && pack->data().transforms == nullptr, "lookup.transforms may be null: " + e);
  }
  {
    // More than 32 condition bits.
    std::string conditions;
    for (int i = 0; i < 33; ++i) conditions += (i ? "," : "") + std::string(R"("c)") + std::to_string(i) + R"(":{"name":"c","isDictionaryForm":true})";
    const std::string t = R"({"schema":1,"conditions":{)" + conditions + R"(},"transforms":[]})";
    std::string e;
    check(hoshidicts::parse_language_pack(language_json(), t, &e) == nullptr && e.find("32") != std::string::npos, "33 bits: " + e);
  }
  {
    // A settings effect on an optional processor and a display transform pass.
    std::string e;
    const std::string language = language_json(
        R"(,"postprocessors":[{"id":"opt","optional":true,"variants":[[{"case":"upper"}]]}])", "xx",
        R"([{"id":"s","type":"boolean","default":false,"label":"S","group":"lookup","effect":{"preprocessor":"opt"}},
            {"id":"d","type":"enum","default":"a","values":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"label":"D","group":"display","effect":{"display":{"fields":["expression","reading"],"when":"b","transform":"up"}}}])");
    check(hoshidicts::parse_language_pack(language, good, &e) != nullptr, "settings with effects: " + e);
  }
}

void test_registry() {
  auto registry = hoshidicts::LanguageRegistry::with_builtin();
  check(registry.codes() == std::vector<std::string>{"ja"}, "with_builtin has ja");
  const auto ja = registry.find("ja");
  check(ja && ja->data().transforms && ja->data().transforms->rules.size() == 983, "the built-in Japanese pack");
  std::string error;
  const std::string good = transforms_json(transform("t", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})"));
  check(registry.add(language_json(), good, &error), "add: " + error);
  check(registry.codes() == std::vector<std::string>{"ja", "xx"}, "codes sorted");
  const auto first = registry.find("xx");
  check(registry.add(language_json(), good, &error) && registry.find("xx") != first, "a pack with the same code replaces");
  check(first->code() == "xx", "a replaced pack stays valid for its holders");
  check(!registry.add(language_json("", "zz1"), good, &error) && !error.empty(), "add reports an error");

  const auto root = std::filesystem::temp_directory_path() / ("hoshidicts-languages-test-" + std::to_string(std::random_device{}()));
  std::filesystem::create_directories(root / "aa");
  std::filesystem::create_directories(root / "bb");
  std::filesystem::create_directories(root / "_template");
  const auto write = [](const std::filesystem::path& path, const std::string& text) {
    std::ofstream(path, std::ios::binary) << text;
  };
  write(root / "aa" / "language.json", language_json("", "aa"));
  write(root / "aa" / "transforms.json", good);
  write(root / "bb" / "language.json", language_json("", "cc"));  // code is not the directory name
  write(root / "bb" / "transforms.json", good);
  write(root / "_template" / "language.json", "not even JSON");
  hoshidicts::LanguageRegistry directory;
  check(!directory.add_directory(root.string(), &error) && error.find("bb") != std::string::npos, "add_directory reports bb: " + error);
  check(directory.codes() == std::vector<std::string>{"aa"}, "add_directory adds aa and skips _template");
  std::filesystem::remove_all(root);
}

// --- word resolution in a lookup (section 9.2) -------------------------------------

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

std::string build_zip(const std::vector<std::pair<std::string, std::string>>& files) {
  std::string out;
  std::string central;
  for (const auto& [name, data] : files) {
    const auto offset = static_cast<uint32_t>(out.size());
    const uint32_t crc = crc32(data);
    const auto size = static_cast<uint32_t>(data.size());
    put<uint32_t>(out, 0x04034b50);
    put<uint16_t>(out, 20);
    put<uint16_t>(out, 0);
    put<uint16_t>(out, 0);
    put<uint16_t>(out, 0);
    put<uint16_t>(out, 0);
    put<uint32_t>(out, crc);
    put<uint32_t>(out, size);
    put<uint32_t>(out, size);
    put<uint16_t>(out, static_cast<uint16_t>(name.size()));
    put<uint16_t>(out, 0);
    out += name;
    out += data;
    put<uint32_t>(central, 0x02014b50);
    put<uint16_t>(central, 20);
    put<uint16_t>(central, 20);
    put<uint16_t>(central, 0);
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

void test_word_lookup() {
  const auto root = std::filesystem::temp_directory_path() / ("hoshidicts-word-lookup-" + std::to_string(std::random_device{}()));
  std::filesystem::create_directories(root);
  const std::string index = R"({"title":"words","format":3,"revision":"1"})";
  const std::string bank = R"([["read","","v_plain","v_plain",0,["to read"],0,""],["rea","","","",0,["not a word"],0,""],
    ["a","","","",0,["article"],0,""],["book","","n","",0,["a book"],0,""],["look up","","","v_phr",0,["to search"],0,""],
    ["minute","","n","",0,["a minute"],0,""],["desafortunadamente","","","",0,["unfortunately"],0,""],
    ["m'yaso","","n","",0,["meat"],0,""],["walk","","","",0,["to walk"],0,""]])";
  const std::string zip = build_zip({{"index.json", index}, {"term_bank_1.json", bank}});
  {
    std::ofstream(root / "words.zip", std::ios::binary) << zip;
  }
  const auto imported = dictionary_importer::import((root / "words.zip").string(), root.string());
  check(imported.success, "import the word dictionary: " + imported.error);
  DictionaryQuery query;
  check(query.add_term_dict((root / "words").string()), "load the word dictionary");

  hoshidicts::LanguageRegistry registry;
  std::string error;
  const std::string t = transforms_json(
      transform("ing", R"({"type":"suffix","inflected":"ing","deinflected":"","conditionsIn":[],"conditionsOut":["v"]})") + "," +
          transform("past", R"({"type":"phrasal","inflected":"ed","deinflected":"","followedBy":"particles","conditionsIn":[],"conditionsOut":["v_phr"]})"),
      R"({"particles":["up"]})");
  check(registry.add(language_json(), t, &error), "add the word pack: " + error);
  // wordInternal: the apostrophe between two letters.
  {
    std::string l = language_json("", "yy", "[]", "[a-z]");
    l.replace(l.find(R"("wordInternal":null)"), std::strlen(R"("wordInternal":null)"), R"("wordInternal":"[']")");
    check(registry.add(l, t, &error), "add the wordInternal pack: " + error);
  }
  Lookup lookup(query, registry);
  LookupOptions options;
  options.language = "xx";
  const auto first = [&](const std::string& text, size_t scan = 16, const std::string& language = "xx") {
    LookupOptions o = options;
    o.language = language;
    const auto results = lookup.lookup(text, 16, scan, o);
    return results.empty() ? std::string("(none)") : results.front().term.expression + "|" + results.front().matched;
  };
  const auto all = [&](const std::string& text, size_t scan = 16) {
    std::vector<std::string> out;
    for (const auto& r : lookup.lookup(text, 16, scan, options)) out.push_back(r.term.expression + "|" + r.matched);
    return out;
  };
  check(first("reading a book") == "read|reading", "word resolution: reading a book -> " + first("reading a book"));
  check(!has(all("reading a book"), "rea|rea"), "word resolution never looks up rea");
  check(first("looked up to") == "look up|looked up", "phrasal lookup: " + first("looked up to"));
  check(first("minute walk") == "minute|minute", "a word before a space: " + first("minute walk"));
  check(first("desafortunadamente", 16) == "desafortunadamente|desafortunadamente",
        "the window grows to the end of the word: " + first("desafortunadamente", 16));
  check(first("Book") == "book|Book", "the decapitalize processor");
  check(first("m'yaso tasty", 16, "yy") == "m'yaso|m'yaso", "wordInternal between letters: " + first("m'yaso tasty", 16, "yy"));
  check(first("m'yaso tasty", 16, "xx") == "m'yaso|m'yaso", "an apostrophe in wordCharacters");

  // Selection: an empty list selects nothing, an unknown language throws.
  LookupOptions none = options;
  none.dictionaries = std::vector<std::string>{};
  check(lookup.lookup("book", 16, 16, none).empty(), "an empty selection finds nothing");
  none.dictionaries = std::vector<std::string>{"/not/loaded"};
  check(lookup.lookup("book", 16, 16, none).empty(), "a path that is not loaded is ignored");
  none.dictionaries = std::vector<std::string>{(root / "words").string()};
  check(!lookup.lookup("book", 16, 16, none).empty(), "a selection of the loaded dictionary");
  bool threw = false;
  try {
    LookupOptions unknown = options;
    unknown.language = "qq";
    (void)lookup.lookup("book", 16, 16, unknown);
  } catch (const std::invalid_argument&) {
    threw = true;
  }
  check(threw, "an unknown language throws std::invalid_argument");
  // pos_filter_exempt: "walk" has no rules, so the verb deinflection of
  // "walking" drops it unless its dictionary skips the filter.
  check(first("walking") != "walk|walking", "a term without rules fails the filter: " + first("walking"));
  LookupOptions exempt = options;
  exempt.pos_filter_exempt = {(root / "words").string()};
  const auto exempted = lookup.lookup("walking", 16, 16, exempt);
  check(!exempted.empty() && exempted.front().term.expression == "walk" && exempted.front().matched == "walking",
        "pos_filter_exempt keeps it");
  std::filesystem::remove_all(root);
}

// --- the probe packs of tests/fixtures/languages/ ------------------------------------

std::string trace_ids(const LookupResult& r) {
  std::string out;
  for (const auto& t : r.trace) out += (out.empty() ? "" : ">") + t.id;
  return out;
}

const LookupResult* find_term(const std::vector<LookupResult>& results, const std::string& expression) {
  for (const auto& r : results) {
    if (r.term.expression == expression) return &r;
  }
  return nullptr;
}

std::string describe(const std::vector<LookupResult>& results) {
  std::string out;
  for (const auto& r : results) {
    out += r.term.expression + "/" + r.term.reading + "(" + r.matched + ", steps " + std::to_string(r.preprocessor_steps) +
           ", " + trace_ids(r) + ") ";
  }
  return out.empty() ? "(none)" : out;
}

// Pipeline features the Japanese pack does not use, so the parity tests do
// not pin them (sections 6.1, 7.3, 7.4, 9.1-9.3, 9.6).
void test_probe_packs(const std::string& fixtures) {
  hoshidicts::LanguageRegistry registry;
  std::string error;
  check(registry.add_directory(fixtures, &error), "the probe packs load: " + error);
  check(registry.codes() == std::vector<std::string>{"opt", "pst", "rdn", "stm", "trf", "trs", "wdi", "wrd"},
        "the probe packs");

  const auto root = std::filesystem::temp_directory_path() / ("hoshidicts-probe-packs-" + std::to_string(std::random_device{}()));
  std::filesystem::create_directories(root);
  const std::string index = R"({"title":"probes","format":3,"revision":"1"})";
  const std::string bank = R"([["a","","","",0,["a"],1,""],["z","","","",0,["z"],2,""],
    ["x","AB","","n",0,["x upper"],3,""],["x","ab","","n",0,["x lower"],4,""],
    ["y","q","","n",9,["y q"],5,""],["y","YY","","n",0,["y YY"],6,""],["CAT","","","n",0,["cat"],7,""],
    ["ABCDEFGHIJKLMNOPQRS","","","",0,["nineteen"],8,""],["ABCDEFGHIJKLMNOP","","","",0,["sixteen"],9,""],
    ["internationalize","","","v",0,["to internationalize"],10,""],["walke","","","v",0,["a probe verb"],11,""],
    ["m","","","",0,["m"],12,""],["m'yaso","","","",0,["meat"],13,""]])";
  const std::string meta = R"([["x","freq",{"reading":"AB","frequency":{"value":1,"displayValue":"upper"}}],
    ["x","freq",{"reading":"ab","frequency":{"value":2,"displayValue":"lower"}}]])";
  {
    std::ofstream(root / "probes.zip", std::ios::binary)
        << build_zip({{"index.json", index}, {"term_bank_1.json", bank}, {"term_meta_bank_1.json", meta}});
  }
  const auto imported = dictionary_importer::import((root / "probes.zip").string(), root.string());
  check(imported.success, "import the probe dictionary: " + imported.error);
  DictionaryQuery query;
  check(query.add_term_dict((root / "probes").string()) && query.add_freq_dict((root / "probes").string()),
        "load the probe dictionary");
  const Lookup lookup(query, registry);
  const auto run = [&](const std::string& code, const std::string& text, LookupOptions options = {}, size_t scan = 16) {
    options.language = code;
    return lookup.lookup(text, 16, scan, options);
  };

  // traceSelection (9.6). The variants of "zb" are "ab" (1 step) and "zb"
  // (0 steps). Term a is reached through R from "ab" first, then through W
  // from "zb"; term z through P and Q from "zb" first, then through R.
  {
    const auto first = run("trf", "zb");
    const auto shortest = run("trs", "zb");
    const auto* fa = find_term(first, "a");
    const auto* sa = find_term(shortest, "a");
    const auto* fz = find_term(first, "z");
    const auto* sz = find_term(shortest, "z");
    check(fa && fa->preprocessor_steps == 1 && trace_ids(*fa) == "R", "first keeps a's first deinflection: " + describe(first));
    check(sa && sa->preprocessor_steps == 0 && trace_ids(*sa) == "W", "shortest keeps a's fewest steps: " + describe(shortest));
    check(fz && trace_ids(*fz) == "P>Q", "first keeps z's first trace: " + describe(first));
    check(sz && trace_ids(*sz) == "R", "shortest keeps z's shortest trace: " + describe(shortest));
  }

  // readingNormalizer (9.6): x/AB and x/ab are one result with both
  // glossaries and both readings' frequencies; primary_reading is normalised.
  {
    const auto merged = run("rdn", "xs");
    const auto plain = run("opt", "xs");
    check(plain.size() == 2, "without a normalizer two readings are two results: " + describe(plain));
    check(merged.size() == 1, "a reading normalizer merges them: " + describe(merged));
    if (merged.size() == 1) {
      const auto& term = merged[0].term;
      check(term.reading == "AB", "the merged result shows the first term's reading: " + term.reading);
      check(term.glossaries.size() == 2, "the merged result has both glossaries");
      std::string frequencies;
      for (const auto& entry : term.frequencies) {
        for (const auto& f : entry.frequencies) frequencies += f.display_value + " ";
      }
      check(frequencies == "upper lower ", "the frequencies of both readings: " + frequencies);
    }
    LookupOptions primary;
    primary.primary_reading = std::string("Yy");
    const auto normalised = run("rdn", "ys", primary);
    check(!normalised.empty() && normalised.front().term.reading == "YY",
          "primary_reading Yy is compared normalised and puts YY first: " + describe(normalised));
    const auto unnormalised = run("opt", "ys", primary);
    check(!unnormalised.empty() && unnormalised.front().term.reading == "q",
          "without a normalizer Yy matches no reading and the score decides: " + describe(unnormalised));
  }

  // Postprocessors (9.3): the rules run on lower case, the dictionary writes CAT.
  {
    const auto results = run("pst", "cats");
    const auto* cat = find_term(results, "CAT");
    check(cat && cat->preprocessor_steps == 1 && cat->deinflected == "CAT" && cat->matched == "cats" && trace_ids(*cat) == "s",
          "a postprocessed form is looked up and adds a step: " + describe(results));
  }
  // Long keys through the postprocessors (9.1): the 19-code-point key is
  // upper case, the text lower case, the scan 16 code points.
  {
    const auto results = run("pst", "abcdefghijklmnopqrs", {}, 16);
    check(!results.empty() && results.front().term.expression == "ABCDEFGHIJKLMNOPQRS" &&
              results.front().matched == "abcdefghijklmnopqrs",
          "a long key is found through the postprocessor: " + describe(results));
  }

  // Optional processors and transforms, turned on by language_options (4.7).
  {
    check(find_term(run("opt", "cat"), "CAT") == nullptr, "an optional preprocessor is off by default");
    LookupOptions up;
    up.language_options = {"up"};
    const auto upper = run("opt", "cat", up);
    const auto* cat = find_term(upper, "CAT");
    check(cat && cat->preprocessor_steps == 1, "language_options turns an optional preprocessor on: " + describe(upper));
    const auto off = run("opt", "xq");
    check(!off.empty() && off.front().matched == "x", "an optional transform is off by default: " + describe(off));
    LookupOptions on;
    on.language_options = {"opt"};
    const auto enabled = run("opt", "xq", on);
    check(!enabled.empty() && enabled.front().matched == "xq" && trace_ids(enabled.front()) == "opt",
          "language_options turns an optional transform on: " + describe(enabled));
  }

  // Word resolution (9.2): the window grows to the end of the word the scan
  // length ends in, below the long-key length (internationalize has 16 code
  // points, so scan.idx does not list it).
  {
    const auto grown = run("wrd", "internationalizing now", {}, 16);
    check(!grown.empty() && grown.front().term.expression == "internationalize" && grown.front().matched == "internationalizing",
          "an 18-code-point word at scan 16: " + describe(grown));
    const auto short_scan = run("wrd", "walking fast", {}, 4);
    check(!short_scan.empty() && short_scan.front().term.expression == "walke" && short_scan.front().matched == "walking",
          "a scan of 4 grows to walking: " + describe(short_scan));
  }
  // wordInternal (9.2): m'yaso is one word, so m is never one of its prefixes.
  {
    const auto with = run("wdi", "m'yaso tasty");
    const auto without = run("wrd", "m'yaso tasty");
    check(find_term(with, "m'yaso") != nullptr && find_term(with, "m") == nullptr,
          "with wordInternal, m is not looked up inside m'yaso: " + describe(with));
    check(find_term(without, "m'yaso") != nullptr && find_term(without, "m") != nullptr,
          "without it the apostrophe ends the word m: " + describe(without));
  }
  std::filesystem::remove_all(root);

  // Rules (7.3, 7.4).
  const auto stm = registry.find("stm");
  if (stm) {
    check(has(deinflect(*stm, "kokox"), "koku:v:last") && !has(deinflect(*stm, "kokox"), "kuko:v:last"),
          "stemChange occurrence last changes the last of two matches: " + join(deinflect(*stm, "kokox")));
    check(has(deinflect(*stm, "kokoy"), "kuko:v:first"), "stemChange occurrence first: " + join(deinflect(*stm, "kokoy")));
    check(!has(deinflect(*stm, "juego"), "jogar:v:notjue"),
          "stemNotStartsWithText refuses a stem that starts with jue: " + join(deinflect(*stm, "juego")));
    check(has(deinflect(*stm, "puedo"), "podar:v:notjue"), "stemNotStartsWithText: " + join(deinflect(*stm, "puedo")));
    check(deinflect(*stm, "qaq") == std::vector<std::string>{"qaq::", "qa:v:suf", "aq:v:pre"},
          "suffix-indexed rules come before prefix-indexed ones: " + join(deinflect(*stm, "qaq")));
    check(deinflect(*stm, "cats") == std::vector<std::string>{"cats::", "cat:np,ns:plural"},
          "a union condition is its leaves: " + join(deinflect(*stm, "cats")));
    // Variants are sorted after every processor (6.1): the two map variants
    // come out as bb, aa, zz.
    std::string variants;
    for (const auto& v : lang::process_text(stm->data().preprocessors, "zz", {})) {
      variants += v.text + ":" + std::to_string(v.steps) + " ";
    }
    check(variants == "aa:1 bb:1 zz:0 ", "a processor's variants are sorted by code points: " + variants);
  }
}

// --- the JSON reader of packs ----------------------------------------------------

void test_json() {
  namespace json = hoshidicts::lang::json;
  {
    json::Document d;
    std::string error;
    const bool ok = d.parse(R"( {"a": [1, -2.5e3, true, false, null, "x"], "b": {"c": "\u00e9\ud83d\ude00\n\"\\\/"}, "e": {}, "f": []} )", &error);
    check(ok, "a document parses: " + error);
    if (ok) {
      const auto root = d.root().get_object();
      check(root.size() == 4 && root.begin() != root.end() && (*root.begin()).first == "a", "members in file order");
      const auto a = root.find("a")->get_array();
      check(a.size() == 6 && a[0].get_number() == 1 && a[1].get_number() == -2500 && a[2].get_boolean() &&
                !a[3].get_boolean() && a[4].is_null() && a[5].get_string() == "x",
            "array values");
      check(root.find("b")->get_object().find("c")->get_string() == "\xC3\xA9\xF0\x9F\x98\x80\n\"\\/", "escapes and a surrogate pair");
      check(root.find("e")->get_object().empty() && root.find("f")->get_array().empty(), "empty containers");
      check(root.find("zz") == nullptr, "a missing key");
    }
  }
  for (const char* bad : {"", "{", "{\"a\":1,}", "[1,]", "{\"a\":1 \"b\":2}", "{\"a\":1,\"a\":2}", "01", "1.", "-", "\"\\ud800\"",
                          "\"\\udc00\"", "\"\\x\"", "\"a\nb\"", "tru", "nul", "[1] 2", "\"\xC3\"", "\"\xED\xA0\x80\"", "{1:2}"}) {
    json::Document d;
    std::string error;
    check(!d.parse(bad, &error) && !error.empty(), std::string("JSON rejects ") + bad);
  }
  {
    std::string deep(200, '[');
    deep += std::string(200, ']');
    json::Document d;
    std::string error;
    check(!d.parse(deep, &error) && error.find("deeply") != std::string::npos, "nesting is limited");
  }
  {
    std::string error;
    check(hoshidicts::parse_language_pack("{\n  \"schema\": 1,\n  oops\n}", "", &error) == nullptr &&
              error.find("language.json") != std::string::npos && error.find("line 3") != std::string::npos,
          "a JSON error names the file and line: " + error);
  }
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: languages-test <tests/fixtures/languages>\n");
    return 2;
  }
  test_json();
  test_classes();
  test_patterns();
  test_steps();
  test_rules();
  test_schema();
  test_registry();
  test_word_lookup();
  test_probe_packs(argv[1]);
  std::printf("%zu cases, %d failures\n", cases, failures);
  return failures == 0 ? 0 : 1;
}
