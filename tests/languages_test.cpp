// SPDX-License-Identifier: GPL-3.0-or-later
// The language pack model (docs/languages.md, sections 4-7 and 9): character
// classes, the pattern dialect, text steps and processors, every rule type,
// conditions, cycles, the search bounds, schema checks, rules that replace a
// pack's own (10.3), the registry, and word resolution in a lookup.
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <random>
#include <set>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#if defined(__unix__) || defined(__APPLE__)
#include <limits.h>
#include <pthread.h>
#endif

#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"
#include "languages/classes.hpp"
#include "languages/corpus.hpp"
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
        {"(a|b)*c", false},     {"(a)\\1", false},       {"(?:(a)\\1|b)", false}, {"(a)(?=b)\\1", false},
        {"(a)+\\1", false},     {"((a)|b)\\1", false},   {"(a)\\1|b", false},     {"(a)(?:b\\1)*", false},
        {"(a)(\\1)+", false},   {"(a)\\1*", false},      {"(?:ab?)?", false},     {"a*?", false},
        {"x*", false},          {"$", false},            {"a", true},             {"a*b", true},
        {"^a", true},           {"a(?=b$)", true},
        {"(l|dell|all)['\xE2\x80\x99]", true},
        // Lookaheads without a capturing group or a back-reference inside,
        // as Yomitan's ar (?!ل) and yi (?!.*[...]) rules.
        {"(?=(?:ab))a", false}, {"(?!(?:a|b)c)x", false}, {"(?=a)(a)\\1", false}, {"(?!\xD9\x84)", false},
        {"(?!.*[ab])x", false}, {"(?=[(])\\(", false},
        // What the nullable analysis must not refuse: a {m,n} minimum above 0
        // is not empty, and neither is a back-reference to a group that is not.
        {"a{2}", true},         {"a{2,}", true},         {"[a]{1,3}", true},      {".{2}", true},
        {"{letter}{2}", true},  {"(?:ab){2}", true},     {"(a{2})\\1", true},     {"(a)\\1", true},
        {"(?:b|(a))c", false},
    };
    for (const auto& s : same) {
      std::string error;
      check(pattern(s.source, "", s.global, &error) != nullptr,
            std::string("pattern accepts ") + s.source + (s.global ? " (global)" : "") + ": " + error);
    }
  }
  {
    // Refusals with the rule that must give them.
    constexpr const char* capture = "a capturing group inside a lookahead";
    constexpr const char* backref = "a back-reference inside a lookahead";
    constexpr const char* global_empty = "a global pattern may not match the empty text";
    constexpr const char* not_taking_part = "may not take part in the match";
    constexpr const char* repeat_empty = "a quantifier may not repeat a group that can match the empty text";
    const struct {
      const char* source;
      bool global;
      const char* reason;
    } refused[] = {
        // The re-audit's cases, then more forms. libstdc++ keeps a capture
        // made inside a lookahead on a path that then fails, where JavaScript
        // and libc++ clear it: (?=(a))ac|ab with [$1] on ab gives [] in
        // JavaScript and [a] in the engine. Some differ in no library today,
        // such as (?=(a)b)ab|a, (?=(a))\1 and the six from (b)(?=(a)) on; the
        // rule refuses every capture inside a lookahead.
        {"(?=(a))ac|ab", false, capture},
        {"(?=(a))ac|ab", true, capture},
        {"(?!(a)b)a|ab", false, capture},
        {"(?:(?=(a))b|a)", false, capture},
        {"(?=(ab))a(?=c)|a", false, capture},
        {"(?=(a))a+c|a", false, capture},
        {"x(?=(a))ac|xa", false, capture},
        {"(?=(a)b)ab|a", true, capture},
        {"(?=(.))..x|.", true, capture},
        {"(?!(a))b|a", false, capture},
        {"(?=(a))\\1", false, capture},
        {"(?=(a))\\1c|ab", false, capture},
        {"a(?=(b))c|ab", false, capture},
        {"(a)(?=(b))c|ab", false, capture},
        {"c|(?=(a))ab|a", true, capture},
        {"(b)(?=(a))", false, capture},
        {"(b)(?=(a)(x))", false, capture},
        {"(b)(?=(a))(a)", false, capture},
        {"(?=(a))(a)\\2", false, capture},
        {"(b)(?=(a))\\2", false, capture},
        {"(b)(?!(x))a", false, capture},
        {"(?!(a))\\1", false, capture},
        {"(?=(?=(a)))a", false, capture},
        {"(?=(?:(a)))a", false, capture},
        // A capture after a nested lookahead has closed, still inside the
        // outer one: on main (?=(?=a)(a))ac|ab with [$1] on ab gives [] in
        // JavaScript and libc++ and [a] in libstdc++.
        {"(?=(?=a)(a))ac|ab", false, capture},
        {"(?!(?=x)|(a)b)a|ab", false, capture},
        {"(?=(?!b)(a))a+c|a", false, capture},
        {"x(?=(?=a)(a))ac|xa", false, capture},
        // The ones of its random test that differ in libstdc++.
        {"[\xE3\x81\x82x]*(?=(a{1,2})?\?a?b+|(?=[a-c]{2}|(b){0,2}(a))(x){0,2}\xE3\x81\x82{2}|ab{0,2}?)|x{0,2}?bx(c)+?",
         false, capture},
        {"(?=(x)|(\xE3\x81\x82x?){0,2}?b)[^a]c\xE3\x81\x82{0,2}?|(?!a{2}?(\xE3\x81\x82){2}b{0,2})", false, capture},
        {"(?=a(\xE3\x81\x82+)+?)b|a", true, capture},
        {"(?!b\xE3\x81\x82|[ab](b*?(?:[^a])))[a-c]|(?!a)", false, capture},
        // libc++ numbers the groups of a lookahead from 1: (a)(?=\1) does not
        // compile there, and (a)(?=(b)\1) matches abb where JavaScript and
        // libstdc++ match aba.
        {"(a)(?=\\1)", false, backref},
        {"(a)(?!\\1)", false, backref},
        {"(a)(?=(b)\\1)", false, capture},
        {"(?=(a)\\1)", false, capture},
        {"(b)xx(?=(?:\\1+))", false, backref},
        {"(.)(?=.\\1)", true, backref},
        {"(a)(?!(?=\\1))", false, backref},
        {"(a)(?=(?=b)\\1)", false, backref},
        // The ones of its random test that libc++ alone refuses.
        {"(a){2}(\xE3\x81\x82*|\xE3\x81\x82{0,2}(x)|(.)?ba{2}?)(?=\\2)", true, backref},
        {"(a){2}?(?!\\1{0,2})|b|a$", true, backref},
        {"([ab]?\?(b))(?:(\xE3\x81\x82+?){0,2}$|\\2+x{0,2}?[^a]*|(a)?|(?!(b){1,2}?(?:\xE3\x81\x82{2}.b|a{1,2}a|\\2{1,2}\\2*)"
         "{0,2}(?:\xE3\x81\x82{2}?\\2[ab]{0,2})|(b)?\?.)^)",
         false, capture},
        {"(\xE3\x81\x82)+?(\xE3\x81\x82){1,2}?(?=(?=b)\\1{1,2}?)", false, backref},
        // The nullable analysis (section 7.6): a group in the last alternative
        // may not take part, and a class, `.`, a reference, a back-reference
        // to a group that can match the empty text, or a group, with a
        // quantifier whose minimum is 0, can match the empty text. Each shape
        // with a regex the engine and JavaScript read differently: (?:b|(a))\1
        // with - on b gives - in JavaScript and b in the engine; [a]*?, .*?,
        // {letter}*? and (a*?)\1 (global, -) on baaa give -b-a-a-a- in
        // JavaScript and -b------- or ---------, -b---a- in the engine.
        {"(?:b|(a))\\1", false, not_taking_part},
        {"(?:b|c|(a))\\1", false, not_taking_part},
        {"(?:b|(a)c)\\1", false, not_taking_part},
        {"[a]*?", true, global_empty},
        {"[^a]*", true, global_empty},
        {"[a]{0,3}", true, global_empty},
        {".*?", true, global_empty},
        {".?", true, global_empty},
        {"{letter}*?", true, global_empty},
        {"{letter}{0,2}", true, global_empty},
        {"(a*?)\\1", true, global_empty},
        {"(?:ab)?\?", true, global_empty},
        {"(?:ab)*", true, global_empty},
        {"(?:ab){0,2}", true, global_empty},
        {"(?:(?:ab)?)*", false, repeat_empty},
        {"(?:[a]*)+", false, repeat_empty},
        {"(?:.?)+", false, repeat_empty},
        {"(?:{letter}*)+", false, repeat_empty},
        {"(a)(?:\\1*)+", false, repeat_empty},
        {"(a*)(?:\\1)+", false, repeat_empty},
    };
    for (const auto& r : refused) {
      std::string error;
      check(pattern(r.source, "", r.global, &error) == nullptr && error.find(r.reason) != std::string::npos,
            std::string("pattern rejects ") + r.source + (r.global ? " (global)" : "") + " with \"" + r.reason +
                "\": " + error);
    }
    // Where the two rules point: the group's `(`, or the back-reference's `\`
    // (UTF-16 units, as JavaScript counts them).
    const struct {
      const char* source;
      size_t offset;
      const char* reason;
    } located[] = {
        {"(?=(a))ac|ab", 3, capture},       {"(?=(?=a)(a))ac|ab", 8, capture},
        {"x(?=(?=a)(a))ac|xa", 9, capture}, {"(?!(?=x)|(a)b)a|ab", 9, capture},
        {"(?=(?:b|(a)))a", 8, capture},     {"(a)(?=\\1)", 6, backref},
        {"(a)(?!(?=\\1))", 9, backref},     {"(a)(?=(?=b)\\1)", 11, backref},
        {"(\xE3\x81\x82)+?(\xE3\x81\x82){1,2}?(?=(?=b)\\1{1,2}?)", 22, backref},
    };
    for (const auto& l : located) {
      std::string error;
      const std::string at = " at offset " + std::to_string(l.offset);
      check(pattern(l.source, "", false, &error) == nullptr && error.find(l.reason) == 0 && error.ends_with(at),
            std::string("pattern rejects ") + l.source + " with \"" + l.reason + "\"" + at + ": " + error);
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
  {
    // A step list stops once its text passes step_limit(n) (section 6.2): a
    // pattern that doubles the text, repeated 16 times, stops after the round
    // that passes it, and the later steps do not run.
    lang::Step twice;
    twice.kind = lang::StepKind::Pattern;
    twice.pattern = pattern("([a-z])", "$1$1", true);
    twice.repeat = true;
    lang::Step upper = case_step(lang::CaseMode::Upper);
    std::u32string out;
    check(lang::step_limit(4) == 576, "step_limit(4)");
    lang::StepLimit limit{lang::step_limit(4)};
    check(!lang::apply_single({twice, upper}, u32("abcd"), out, limit) && out.size() == 1024 &&
              out.find(U'A') == std::u32string::npos,
          "a repeated doubling stops after the round that passes the limit: " + std::to_string(out.size()));
    check(limit.written == 8 + 16 + 32 + 64 + 128 + 256 + 512 + 1024,
          "every round counts as written: " + std::to_string(limit.written));
    lang::StepLimit wide{size_t{2} << 16};
    check(lang::apply_single({twice}, u32("ab"), out, wide) && out.size() == 2 << 16,
          "within the limit the 16 rounds all run: " + std::to_string(out.size()));
    // Unlimited, as tests/classes.json records a step alone (section 12.1).
    lang::apply_single({twice}, u32("abcd"), out);
    check(out.size() == 4 << 16, "without a limit: " + std::to_string(out.size()));
    // A processor's list that passes the limit leaves the text as it was,
    // with keepInput false too.
    for (const bool keep : {true, false}) {
      lang::Processor doubling{"double", "", keep, false, {{twice}}};
      const std::vector<lang::Processor> processors{doubling};
      const auto v = lang::process_text(processors, "abcd", {});
      check(v.size() == 1 && v[0].text == "abcd" && v[0].steps == 0,
            std::string("a processor past the limit keeps the text, keepInput ") + (keep ? "true" : "false"));
    }
    lang::Step alternatives;
    alternatives.kind = lang::StepKind::Alternatives;
    alternatives.alternatives.emplace_back(u32("a"), std::vector<std::u32string>{std::u32string(64, U'x')});
    lang::Processor wide_alternatives{"wide", "", true, false, {{alternatives}}};
    const std::vector<lang::Processor> processors{wide_alternatives};
    // 12 a: 2^12 combinations of 12 + 63 k code points, k the a replaced;
    // those with k = 11 or 12 pass step_limit(12) = 704 and are the text as
    // it was, so the longest variant has k = 10.
    const auto v = lang::process_text(processors, std::string(12, 'a'), {});
    size_t longest = 0;
    for (const auto& x : v) longest = std::max(longest, x.text.size());
    check(lang::step_limit(12) == 704 && longest == 2 + 10 * 64,
          "alternatives past the limit are the text as it was: " + std::to_string(longest));
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
    // verbGuardWords (7.3): the rule does not read a first word in the list,
    // English's auxiliaries, as the verb. The same rules with and without it;
    // `had` -> `have` stands for English's irregular past.
    const auto rules = [](const std::string& verb_guards) {
      return transforms_json(
          transform("past", R"({"type":"suffix","inflected":"ed","deinflected":"","conditionsIn":["v"],"conditionsOut":["v"]},
                               {"type":"phrasal","inflected":"ed","deinflected":"","followedBy":"particles","conditionsIn":["v"],"conditionsOut":["v_phr"]},
                               {"type":"phrasal","inflected":"had","deinflected":"have","followedBy":"particles","conditionsIn":["v"],"conditionsOut":["v_phr"]})") +
              "," +
              transform("interposed", R"({"type":"interposedObject","particles":"particles","guardWords":"guard",)" + verb_guards +
                                          R"("conditionsIn":[],"conditionsOut":["v_phr"]})"),
          R"({"particles":["up","on","out"],"guard":["the","to"],"none":[],
              "auxiliaries":["am","is","are","was","were","be","been","being","have","has","had","having","do","does","did","done","doing"]})");
    };
    const auto plain = load(rules(""), &error);
    check(plain != nullptr, "interposed pack without verbGuardWords loads: " + error);
    const auto guarded = load(rules(R"("verbGuardWords":"auxiliaries",)"), &error);
    check(guarded != nullptr, "interposed pack with verbGuardWords loads: " + error);
    if (plain && guarded) {
      using List = std::vector<std::string>;
      // Without the field an auxiliary is read as the verb, as before.
      auto r = deinflect(*plain, "had pointed out");
      check(r == List{"had pointed out::", "had out:v_phr:interposed", "have out:v_phr:interposed>past"},
            "without verbGuardWords: had pointed out -> have out: " + join(r));
      r = deinflect(*plain, "have turned out");
      check(r == List{"have turned out::", "have out:v_phr:interposed"},
            "without verbGuardWords: have turned out -> have out: " + join(r));
      // With it, not.
      r = deinflect(*guarded, "had pointed out");
      check(r == List{"had pointed out::"}, "verbGuardWords: had pointed out does not become have out: " + join(r));
      r = deinflect(*guarded, "have turned out");
      check(r == List{"have turned out::"}, "verbGuardWords: have turned out does not become have out: " + join(r));
      r = deinflect(*guarded, "did his coat up");
      check(r == List{"did his coat up::"}, "verbGuardWords: the reading it loses: " + join(r));
      // Any other verb is read as without the field.
      r = deinflect(*guarded, "pointed it out");
      check(r == List{"pointed it out::", "pointed out:v_phr:interposed", "point out:v_phr:interposed>past"},
            "verbGuardWords: pointed it out -> point out: " + join(r));
      for (const char* text :
           {"pointed it out", "put Mary's coat on", "put it on the table", "put the coat on", "turned the long one out"}) {
        check(deinflect(*guarded, text) == deinflect(*plain, text),
              std::string("verbGuardWords: other verbs unchanged: ") + text);
      }
      // A verb is compared whole and exactly, as guardWords compares a piece:
      // only a preprocessor's lower-case variant matches `had`.
      check(has(deinflect(*guarded, "Had pointed out"), "Had out:v_phr:interposed"), "verbGuardWords compares exactly");
      check(has(deinflect(*guarded, "haddock it out"), "haddock out:v_phr:interposed"),
            "verbGuardWords compares the whole verb");
      // Only the first word is the verb: an auxiliary later in the object is
      // a guard word only when guardWords lists it.
      check(has(deinflect(*guarded, "turned had out"), "turned out:v_phr:interposed"),
            "verbGuardWords checks the first word only");
      // An empty list guards no verb: the rule reads as without the field.
      const auto empty = load(rules(R"("verbGuardWords":"none",)"), &error);
      check(empty != nullptr, "interposed pack with an empty verbGuardWords list loads: " + error);
      if (empty) {
        for (const char* text :
             {"had pointed out", "have turned out", "did his coat up", "pointed it out", "put Mary's coat on"}) {
          check(deinflect(*empty, text) == deinflect(*plain, text),
                std::string("an empty verbGuardWords list changes nothing: ") + text);
        }
      }
      // The list is compared with the text the rule receives, not with its
      // output after `then`: Had is not listed, so Had it out gives Had out,
      // which `then` lowers to had out.
      const auto lowered = load(rules(R"("verbGuardWords":"auxiliaries","then":[{"case":"lower"}],)"), &error);
      check(lowered != nullptr, "interposed pack with verbGuardWords and then loads: " + error);
      if (lowered) {
        r = deinflect(*lowered, "Had it out");
        check(r == List{"Had it out::", "had out:v_phr:interposed", "have out:v_phr:interposed>past"},
              "verbGuardWords compares the rule's input, not its output after then: " + join(r));
        r = deinflect(*lowered, "had it out");
        check(r == List{"had it out::"}, "verbGuardWords with then: had it out is still guarded: " + join(r));
      }
    }
  }
  {
    // Two interposedObject rules: verbGuardWords guards only the rule that
    // names it, in either order (7.3).
    const auto two = [](bool guarded_first) {
      const std::string guarded = transform(
          "guarded", R"({"type":"interposedObject","particles":"particles","guardWords":"guard","verbGuardWords":"auxiliaries","conditionsIn":[],"conditionsOut":["v_phr"]})");
      const std::string unguarded = transform(
          "unguarded", R"({"type":"interposedObject","particles":"particles","guardWords":"guard","conditionsIn":[],"conditionsOut":["v_phr"]})");
      return transforms_json(guarded_first ? guarded + "," + unguarded : unguarded + "," + guarded,
                             R"({"particles":["out"],"guard":["the"],"auxiliaries":["had","have"]})");
    };
    for (const bool guarded_first : {true, false}) {
      using List = std::vector<std::string>;
      const std::string order = guarded_first ? "guarded rule first" : "guarded rule second";
      const auto pack = load(two(guarded_first), &error);
      check(pack != nullptr, "two interposed rules load (" + order + "): " + error);
      if (!pack) continue;
      auto r = deinflect(*pack, "had pointed out");
      check(r == List{"had pointed out::", "had out:v_phr:unguarded"},
            "the rule without verbGuardWords still reads had pointed out (" + order + "): " + join(r));
      r = deinflect(*pack, "pointed it out");
      check(r == (guarded_first ? List{"pointed it out::", "pointed out:v_phr:guarded", "pointed out:v_phr:unguarded"}
                                : List{"pointed it out::", "pointed out:v_phr:unguarded", "pointed out:v_phr:guarded"}),
            "both rules read an unlisted verb (" + order + "): " + join(r));
    }
  }
  {
    // verbGuardWords looks at the first word of the text the rule receives,
    // after earlier rules (7.3). English reaches the interposed rule through
    // its past prefix `had ` -> `have ` (conditions `x` here stand for its
    // v_fw), which keeps a listed verb listed: had pointed out gives no have
    // out. The prefix `x` makes an unlisted first word listed (xhad it out ->
    // had it out, which gives no had out), and the replacement `had` -> `hid`
    // makes a listed word unlisted (had it out -> hid it out -> hid out), as
    // English's `-s` rule turns was into wa.
    const auto pack = load(
        transforms_json(
            transform("past", R"({"type":"prefix","inflected":"had ","deinflected":"have ","conditionsIn":[],"conditionsOut":["x"]})") + "," +
                transform("x", R"({"type":"prefix","inflected":"x","deinflected":"","conditionsIn":[],"conditionsOut":[]})") + "," +
                transform("hid", R"({"type":"replace","inflected":"had","deinflected":"hid","conditionsIn":[],"conditionsOut":[]})") + "," +
                transform("interposed",
                          R"({"type":"interposedObject","particles":"particles","guardWords":"guard","verbGuardWords":"auxiliaries","conditionsIn":["x"],"conditionsOut":["v_phr"]})"),
            R"({"particles":["out"],"guard":["the"],"auxiliaries":["had","have"]})"),
        &error);
    check(pack != nullptr, "earlier-rule pack loads: " + error);
    if (pack) {
      using List = std::vector<std::string>;
      auto r = deinflect(*pack, "had pointed out");
      check(r == List{"had pointed out::", "have pointed out:x:past", "hid pointed out::hid",
                      "hid out:v_phr:hid>interposed"},
            "verbGuardWords after an earlier rule: had pointed out -> have pointed out gives no have out: " + join(r));
      r = deinflect(*pack, "xhad it out");
      check(!has(r, "had out:v_phr:x>interposed") && !has(r, "have out:v_phr:x>past>interposed"),
            "verbGuardWords after an earlier rule: xhad it out -> had it out gives no had out: " + join(r));
      check(has(r, "xhad out:v_phr:interposed") && has(r, "hid out:v_phr:x>hid>interposed"),
            "verbGuardWords after an earlier rule: the unlisted verbs of xhad it out are read: " + join(r));
      r = deinflect(*pack, "had it out");
      check(r == List{"had it out::", "have it out:x:past", "hid it out::hid", "hid out:v_phr:hid>interposed"},
            "verbGuardWords after an earlier rule: had it out -> hid it out gives hid out: " + join(r));
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

// Every deinflection of `text` with the pack's rules, and the first bound
// the search reached (section 7.4).
lang::Deinflections search(const hoshidicts::LanguagePack& pack, const std::string& text, lang::BoundHit* hit) {
  lang::Deinflections list;
  pack.data().transforms->deinflect(text, list, nullptr, hit);
  return list;
}

size_t code_points(const std::string& s) {
  size_t n = 0;
  for (unsigned char c : s) n += (c & 0xC0) != 0x80;
  return n;
}

size_t longest_chain(const lang::Deinflections& list) {
  size_t depth = 0;
  for (const auto& d : list) depth = std::max<size_t>(depth, d.depth);
  return depth;
}

// The binary counter: suffix rules a -> b, ab -> ba, abb -> baa, ... count
// "aaaaaaaa" up to "bbbbbbbb", 255 rules in one chain of texts that never
// repeat and never grow, so only the depth bound ends it.
std::string counter_rules() {
  std::string rules;
  for (int k = 0; k < 8; ++k) {
    rules += std::string(rules.empty() ? "" : ",") + R"({"type":"suffix","inflected":"a)" + std::string(k, 'b') +
             R"(","deinflected":"b)" + std::string(k, 'a') + R"(","conditionsIn":[],"conditionsOut":[]})";
  }
  return rules;
}

void test_search_bounds() {
  using Bound = lang::BoundHit::Bound;
  constexpr size_t max_growth = lang::SearchBounds::max_growth;
  constexpr size_t max_depth = lang::SearchBounds::max_depth;
  constexpr size_t max_results = lang::SearchBounds::max_results;
  std::string error;
  {
    // hachi-lang-la's reproduction (reports/hachi-lang-questions.md): e -> is
    // and is -> ae without conditions apply to each other's outputs forever,
    // Rome -> Romis -> Romae -> Romais -> ..., which overflowed the stack
    // before the bound. Each rule adds a code point every second step, so the
    // growth margin ends the chain.
    const auto pack = load(
        R"({"schema": 1, "conditions": {"n": {"name": "Noun", "isDictionaryForm": true}}, "transforms": [{"id": "a", "name": "a", "description": "x", "source": "own", "rules": [{"type": "suffix", "inflected": "e", "deinflected": "is", "conditionsIn": [], "conditionsOut": []}, {"type": "suffix", "inflected": "is", "deinflected": "ae", "conditionsIn": [], "conditionsOut": []}]}]})",
        &error);
    check(pack != nullptr, "loop pack loads: " + error);
    if (pack) {
      lang::BoundHit hit;
      const auto list = search(*pack, "Rome", &hit);
      check(hit.bound == Bound::Growth, "Rome: the growth bound ends the loop");
      check(list.size() == 2 * max_growth + 1, "Rome: every output within the margin: " + std::to_string(list.size()));
      size_t longest = 0;
      for (const auto& d : list) longest = std::max(longest, code_points(d.text));
      check(longest == 4 + max_growth, "Rome: the longest output adds the margin: " + std::to_string(longest));
      check(code_points(hit.text) == 4 + max_growth + 1 && hit.parent == list.size() - 1,
            "Rome: the dropped output is one code point over, from the last result: " + hit.text);
      check(list[1].text == "Romis" && list[2].text == "Romae" && list[3].text == "Romais", "Rome: the chain");
      // Without the hit report, the same results.
      check(search(*pack, "Rome", nullptr).size() == list.size(), "Rome: the same results without a report");
      // Inputs the rules do not loop on are not cut.
      lang::BoundHit none;
      check(search(*pack, "Romam", &none).size() == 1 && !none, "Romam: no rule, no bound");
      // What the conformance test reports for it (deinflect_source).
      lang::SourceSearch source;
      bool limit = false;
      lang::deinflect_source(pack->data(), "Rome", &limit, lang::TestOptions::All, &source);
      check(source.bound == Bound::Growth && source.results == list.size() && source.depth == list.size() - 1 &&
                source.growth == max_growth && source.steps.size() == list.size() && source.texts.front() == "Rome" &&
                source.texts.back() == hit.text,
            "Rome: the search reported: " + std::to_string(source.results) + " results, depth " +
                std::to_string(source.depth) + ", growth " + std::to_string(source.growth));
      // Through the public Deinflector too: it terminates.
      check(Deinflector(pack).deinflect("Rome").size() == list.size(), "Rome: Deinflector terminates");
      // A lookup with the pack terminates.
      DictionaryQuery query;
      hoshidicts::LanguageRegistry registry;
      registry.add(pack);
      const Lookup lookup(query, registry);
      LookupOptions options;
      options.language = "xx";
      check(lookup.lookup("Rome Rome", 16, 16, options).empty(), "Rome: a lookup with no dictionary terminates");
    }
  }
  {
    // The depth bound: a chain of 255 rules that neither repeats nor grows.
    const auto pack = load(transforms_json(transform("count", counter_rules())), &error);
    check(pack != nullptr, "counter pack loads: " + error);
    if (pack) {
      lang::BoundHit hit;
      const auto list = search(*pack, "aaaaaaaa", &hit);
      check(hit.bound == Bound::Depth, "counter: the depth bound ends the chain");
      check(list.size() == max_depth + 1 && longest_chain(list) == max_depth,
            "counter: chains of max_depth rules are kept: " + std::to_string(list.size()));
      // The last text is 128 in binary (b = 1, the last letter the lowest
      // bit); rule max_depth + 1 would have given 129.
      check(list.back().text == "baaaaaaa" && hit.text == "baaaaaab", "counter: 128, then 129 dropped: " + hit.text);
      lang::BoundHit short_hit;
      check(search(*pack, "baaaaaaa", &short_hit).size() == 128 && !short_hit, "counter: 127 steps are no bound");
    }
  }
  {
    // The results bound: each step replaces the first a by b or by c, so
    // sixteen a give 2^17 - 1 texts within depth 16 and no growth.
    const auto pack = load(
        transforms_json(transform(
            "fan",
            R"({"type":"replace","inflected":"a","deinflected":"b","occurrence":"first","conditionsIn":[],"conditionsOut":[]},
                                         {"type":"replace","inflected":"a","deinflected":"c","occurrence":"first","conditionsIn":[],"conditionsOut":[]})")),
        &error);
    check(pack != nullptr, "fan-out pack loads: " + error);
    if (pack) {
      lang::BoundHit hit;
      const auto list = search(*pack, std::string(16, 'a'), &hit);
      check(hit.bound == Bound::Results && list.size() == max_results,
            "fan-out: the results bound stops the search: " + std::to_string(list.size()));
      lang::BoundHit small_hit;
      check(search(*pack, std::string(12, 'a'), &small_hit).size() == (1u << 13) - 1 && !small_hit,
            "fan-out: 2^13 - 1 results are no bound");
      // Deinflections a search appends to a list that already holds some.
      lang::Deinflections list2(3, lang::Deinflection{"x", 0, lang::Deinflection::npos, lang::Deinflection::none, 0});
      lang::BoundHit appended;
      pack->data().transforms->deinflect(std::string(16, 'a'), list2, nullptr, &appended);
      check(appended.bound == Bound::Results && list2.size() == 3 + max_results,
            "fan-out: the bound counts one search");
    }
  }
  {
    // Lengthening rules that fan out (a -> ab, a -> ac, b -> ba, c -> ca, ...):
    // 25^16 texts within the margin; the results bound ends the search.
    std::string rules;
    for (char c = 'b'; c <= 'z'; ++c) {
      rules += std::string(rules.empty() ? "" : ",") + R"({"type":"suffix","inflected":"a","deinflected":"a)" + c +
               R"(","conditionsIn":[],"conditionsOut":[]},{"type":"suffix","inflected":")" + c +
               R"(","deinflected":")" + c + R"(a","conditionsIn":[],"conditionsOut":[]})";
    }
    const auto pack = load(transforms_json(transform("grow", rules)), &error);
    check(pack != nullptr, "growing fan-out pack loads: " + error);
    if (pack) {
      lang::BoundHit hit;
      const auto list = search(*pack, "a", &hit);
      // The growth bound drops outputs on the way; the work bound stops the
      // search (each output's trie walk and cycle check add to its try)
      // before the results bound would, and the report names it.
      check(hit.bound == Bound::Work && list.size() < max_results && list.size() > max_results / 2,
            "growing fan-out: bounded: " + std::to_string(list.size()));
      size_t longest = 0;
      for (const auto& d : list) longest = std::max(longest, code_points(d.text));
      check(longest <= 1 + max_growth && longest_chain(list) <= max_growth, "growing fan-out: within the margin");
    }
  }
  {
    // A loop that only a variant pass's reading starts: the report's chain
    // begins with the pass step, from the text the pass read, as corpus rows
    // and the conformance test see it (deinflect_source, lookup_search).
    const auto pack =
        load(transforms_json(transform(
                 "loop", R"({"type":"suffix","inflected":"な","deinflected":"なe","conditionsIn":[],"conditionsOut":[]},
                                             {"type":"suffix","inflected":"e","deinflected":"is","conditionsIn":[],"conditionsOut":[]},
                                             {"type":"suffix","inflected":"is","deinflected":"ae","conditionsIn":[],"conditionsOut":[]})")),
             &error, R"(,"variantPasses":[{"id":"neko","builtin":"ja.nekoSpeech","optional":true}])");
    check(pack != nullptr, "pass loop pack loads: " + error);
    if (pack) {
      const auto& data = pack->data();
      lang::SourceSearch search;
      bool limit = false;
      lang::deinflect_source(data, "にゃ", &limit, lang::TestOptions::All, &search);
      const std::string described = lang::describe(search);
      check(search.bound == Bound::Growth && search.steps.size() >= 3 && search.steps[0] == "neko" &&
                search.texts[0] == "にゃ" && search.texts[1] == "な" && search.steps[1] == "loop[0]" &&
                search.texts[2] == "なe" && search.texts.size() == search.steps.size() + 1,
            "a bound in a variant pass's search: " + described);
      check(described.find("after " + std::to_string(search.steps.size()) +
                           " steps: にゃ -neko-> な -loop[0]-> なe -loop[1]-> なis") != std::string::npos &&
                described.ends_with(" (dropped)"),
            "the pass chain described: " + described);
      check(search.growth == max_growth, "the pass search grows by the margin");
      // lookup_search of the whole text (scan 0): the text and its five
      // readings (な, だ, ら, ま, じゃ), the same chain.
      lang::SearchCache cache;
      const auto again = lang::lookup_search(data, "にゃ", 0, lang::TestOptions::All, cache);
      check(again.bound == search.bound && again.steps == search.steps && again.texts == search.texts &&
                again.searches == 6 && cache.size() == 6 && cache.contains("な"),
            "lookup_search reports the same chain: " + std::to_string(again.searches) + " searches");
      const auto cached = lang::lookup_search(data, "にゃ", 0, lang::TestOptions::All, cache);
      check(cache.size() == 6 && cached.bound == again.bound && cached.steps == again.steps &&
                cached.work == again.work && cached.searches == again.searches,
            "a text searched before is taken from the cache");
      // With prefixes: に as well.
      lang::SearchCache prefixes;
      check(lang::lookup_search(data, "にゃ", 16, lang::TestOptions::All, prefixes).searches == 7 &&
                prefixes.contains("に"),
            "lookup_search searches every prefix");
      lang::SourceSearch defaults;
      lang::deinflect_source(data, "にゃ", &limit, lang::TestOptions::Default, &defaults);
      lang::SearchCache defaults_cache;
      check(defaults.bound == Bound::None &&
                lang::lookup_search(data, "にゃ", 16, lang::TestOptions::Default, defaults_cache).bound == Bound::None,
            "with the pack's defaults the pass is off: no bound");
    }
  }
  {
    // Texts a rule or a step writes are at most 64 code points (sections 6.2
    // and 7.3), as affixes are; 64 load.
    struct Case {
      std::string rule;  // with T for the text
      std::string field;
      std::string lists = "{}";
    };
    const std::vector<Case> cases = {
        {R"({"type":"suffix","inflected":"s","deinflected":"T","conditionsIn":[],"conditionsOut":[]})", "deinflected"},
        {R"({"type":"wholeWord","inflected":"go","deinflected":"T","conditionsIn":[],"conditionsOut":[]})",
         "deinflected"},
        {R"({"type":"replace","inflected":"a","deinflected":"T","conditionsIn":[],"conditionsOut":[]})", "deinflected"},
        {R"({"type":"phrasal","inflected":"ed","deinflected":"T","followedBy":"particles","conditionsIn":[],"conditionsOut":[]})",
         "deinflected", R"({"particles":["up"]})"},
        {R"({"type":"circumfix","inflectedPrefix":"ge","deinflectedPrefix":"T","inflectedSuffix":"t","deinflectedSuffix":"en","conditionsIn":[],"conditionsOut":[]})",
         "deinflectedPrefix"},
        {R"({"type":"circumfix","inflectedPrefix":"ge","deinflectedPrefix":"","inflectedSuffix":"t","deinflectedSuffix":"T","conditionsIn":[],"conditionsOut":[]})",
         "deinflectedSuffix"},
        {R"({"type":"circumfix","prefixes":[["ge","T"]],"suffixes":[["t","en"]],"conditionsIn":[],"conditionsOut":[]})",
         "prefixes[0]"},
        {R"({"type":"suffix","inflected":"o","deinflected":"ar","stemChange":{"from":["ie"],"to":"T"},"conditionsIn":[],"conditionsOut":[]})",
         "stemChange.to"},
        {R"J({"type":"pattern","pattern":"(a)$","replacement":"T","anchorSuffix":"a","conditionsIn":[],"conditionsOut":[]})J",
         "replacement"},
        {R"({"type":"suffix","inflected":"s","deinflected":"","then":[{"map":{"a":"T"}}],"conditionsIn":[],"conditionsOut":[]})",
         "then[0].map.a"},
        {R"J({"type":"suffix","inflected":"s","deinflected":"","then":[{"pattern":"(a)","replace":"T"}],"conditionsIn":[],"conditionsOut":[]})J",
         "then[0].replace"},
    };
    std::string kana64;
    for (int i = 0; i < 64; ++i) kana64 += "あ";
    for (const auto& c : cases) {
      const auto with = [&](const std::string& text) {
        std::string rule = c.rule;
        rule.replace(rule.find('T'), 1, text);
        std::string e;
        const bool loaded = load(transforms_json(transform("w", rule), c.lists), &e) != nullptr;
        return std::pair{loaded, e};
      };
      const auto [ok64, e64] = with(std::string(64, 'x'));
      const auto [ok_kana, e_kana] = with(kana64);
      const auto [ok65, e65] = with(std::string(65, 'x'));
      const auto [ok_kana65, e_kana65] = with(kana64 + "あ");
      const std::string writes = c.field.starts_with("then") ? "a text a step writes" : "a text a rule writes";
      check(ok64 && ok_kana && !ok65 && !ok_kana65 &&
                e65.find(c.field + ": " + writes + " is longer than 64 code points") != std::string::npos &&
                e_kana65.find(c.field + ": ") != std::string::npos,
            c.field + " is at most 64 code points: " + e64 + e_kana + " / " + e65);
    }
  }
  {
    // One rule application is bounded too (section 7.4): a `then` step that
    // makes 8 copies of each code point, repeated (8^16 copies) or written 12
    // times (8^12), stops at the round that passes step_limit(2) = 544 code
    // points, and the growth bound drops that output.
    const std::string eight = R"J({"pattern":"(.)","replace":"$1$1$1$1$1$1$1$1","global":true)J";
    std::string twelve;
    for (int k = 0; k < 12; ++k) twelve += (k ? "," : "") + eight + "}";
    for (const std::string& then : {eight + R"(,"repeat":true})", twelve}) {
      const auto pack = load(
          transforms_json(transform(
              "t",
              R"({"type":"suffix","inflected":"s","deinflected":"s","conditionsIn":[],"conditionsOut":[],"then":[)" +
                  then + "]}")),
          &error);
      check(pack != nullptr, "multiplying then pack loads: " + error);
      if (!pack) continue;
      lang::BoundHit hit;
      const auto list = search(*pack, "as", &hit);
      check(
          list.size() == 1 && hit.bound == Bound::Growth && code_points(hit.text) == 1024 && lang::step_limit(2) == 544,
          "a then list that multiplies the text stops at the round past the limit: " +
              std::to_string(code_points(hit.text)));
      lang::SourceSearch source;
      bool limit = false;
      lang::deinflect_source(pack->data(), "as", &limit, lang::TestOptions::All, &source);
      const std::string described = lang::describe(source);
      check(described.find(" -t[0]-> " + std::string(40, 'a') + "... (1024 code points) (dropped)") !=
                    std::string::npos &&
                described.size() < 300,
            "describe shortens a long dropped output: " + described);
      // Its work: 1 for the try, (1024 output bytes + 4 x (16 + 128 + 1024)
      // code points written) / 256 = 22, and 2 + 16 + 128 code points the
      // regular expression read: 169; as a corpus row also 1 for the
      // decapitalize preprocessor. An optional rule that is off is one
      // operation, a 64th of a unit.
      const auto with_optional = load(
          transforms_json(
              transform(
                  "t",
                  R"({"type":"suffix","inflected":"s","deinflected":"s","conditionsIn":[],"conditionsOut":[],"then":[)" +
                      then + "]}") +
              "," +
              transform("off",
                        R"({"type":"suffix","inflected":"s","deinflected":"z","conditionsIn":[],"conditionsOut":[]})",
                        R"(,"optional":true)")),
          &error);
      check(with_optional != nullptr, "the pack with an optional rule loads: " + error);
      if (with_optional) {
        lang::SearchBudget budget;
        lang::Deinflections list2;
        with_optional->data().transforms->deinflect("as", list2, nullptr, nullptr, &budget);
        check(source.work == 170 && budget.used() == 169 && list2.size() == 1,
              "the work of a multiplying then list: " + std::to_string(source.work) + " and " +
                  std::to_string(budget.used()));
      }
    }
  }
  {
    // Each output has a buffer of its own (section 7.5): the first rule's 60
    // code points, made by its `then` step, are dropped, and the second rule's
    // output, kept, does not inherit their buffer.
    const auto pack = load(
        transforms_json(transform(
            "t",
            R"J({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":[],"then":[{"pattern":"(.)","replace":"$1$1$1$1","global":true}]},
                    {"type":"suffix","inflected":"s","deinflected":"x","conditionsIn":[],"conditionsOut":[]})J")),
        &error);
    check(pack != nullptr, "buffer pack loads: " + error);
    if (pack) {
      lang::BoundHit hit;
      const auto list = search(*pack, std::string(15, 'a') + "s", &hit);
      check(list.size() == 2 && list[1].text == std::string(15, 'a') + "x" && hit.bound == Bound::Growth &&
                code_points(hit.text) == 60,
            "the then rule's output is dropped, the plain rule's kept");
      // Without a report, which would take the first dropped output away.
      const auto unreported = search(*pack, std::string(15, 'a') + "s", nullptr);
      check(unreported.size() == 2 && unreported[1].text.capacity() < 60,
            "a dropped output's buffer is not kept: capacity " +
                std::to_string(unreported.size() == 2 ? unreported[1].text.capacity() : 0));
    }
  }
  {
    // The work budget (section 7.4): 2,000 rules that each append to every
    // text cost a unit each, so the search stops at the work bound once it
    // has tried 2^20 rule applications, long before it holds 65,536
    // deinflections. A second search given the spent budget records its text
    // and nothing more; one with a budget of its own runs.
    std::string rules;
    for (int i = 0; i < 2000; ++i) {
      rules += std::string(i ? "," : "") + R"({"type":"suffix","inflected":"","deinflected":"x)" + std::to_string(i) +
               R"(","conditionsIn":[],"conditionsOut":[],"stemMinLength":1})";
    }
    const auto pack = load(transforms_json(transform("wide", rules)), &error);
    check(pack != nullptr, "wide pack loads: " + error);
    if (pack) {
      const auto& set = *pack->data().transforms;
      lang::SearchBudget budget;
      lang::BoundHit hit;
      lang::Deinflections list;
      set.deinflect("a", list, nullptr, &hit, &budget);
      check(hit.bound == Bound::Work && budget.spent() && hit.text.empty() && list.size() > 100 &&
                list.size() < lang::SearchBounds::max_work / 1000,
            "the work bound ends a wide search: " + std::to_string(list.size()) + " results");
      lang::BoundHit second;
      const size_t before = list.size();
      set.deinflect("b", list, nullptr, &second, &budget);
      check(list.size() == before + 1 && list.back().text == "b" && second.bound == Bound::Work,
            "a search with a spent budget records its text only");
      lang::Deinflections own;
      set.deinflect("b", own);
      check(own.size() == before, "a search with a budget of its own: " + std::to_string(own.size()));
      lang::SourceSearch source;
      bool limit = false;
      lang::deinflect_source(pack->data(), "a", &limit, lang::TestOptions::All, &source);
      const std::string described = lang::describe(source);
      check(source.bound == Bound::Work && source.work == lang::SearchBounds::max_work &&
                described.starts_with("more than 1048576 units of work, after ") &&
                described.find("-> (not tried); the rules that used the most of its work: wide[0] (") !=
                    std::string::npos,
            "the work bound described: " + described);
    }
  }
  {
    // A pattern rule that does not match still read the text: on aaaa its
    // anchor matches and its pattern reads 4 code points, so the try costs
    // 1 + 4 = 5 units.
    const auto pack = load(
        transforms_json(transform(
            "p",
            R"J({"type":"pattern","pattern":"(b)a$","replacement":"$1","anchorSuffix":"a","conditionsIn":[],"conditionsOut":[]})J")),
        &error);
    check(pack != nullptr, "pattern pack loads: " + error);
    if (pack) {
      lang::SearchBudget budget;
      lang::Deinflections list;
      pack->data().transforms->deinflect("aaaa", list, nullptr, nullptr, &budget);
      check(list.size() == 1 && budget.used() == 5,
            "a pattern that does not match costs what it read: " + std::to_string(budget.used()));
    }
  }
  {
    // A lookup's searches need one budget together (lookup_search): with a
    // cache that says the searches of a and ab use 600,000 units each, the
    // lookup of ab needs 1,200,002 (its two prefixes each cost a unit of
    // preprocessing), past the budget, though neither search reached a bound.
    const auto pack =
        load(transforms_json(transform(
                 "s", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":[]})")),
             &error);
    if (pack) {
      lang::SearchCache cache;
      cache["a"].work = 600000;
      cache["a"].searches = 1;
      cache["ab"].work = 600000;
      cache["ab"].searches = 1;
      const auto lookup = lang::lookup_search(pack->data(), "ab", 16, lang::TestOptions::All, cache);
      check(lookup.bound == Bound::Work && lookup.work == 1200002 && lookup.searches == 2 && lookup.steps.empty() &&
                lang::describe(lookup) ==
                    "more than 1048576 units of work in one lookup (1200002 counted, in 2 searches)",
            "a lookup that needs more than one budget: " + lang::describe(lookup));
      lang::SearchCache fresh;
      check(lang::lookup_search(pack->data(), "ab", 16, lang::TestOptions::All, fresh).bound == Bound::None,
            "the same lookup, searched: no bound");
    }
  }
  {
    // Deinflector::deinflect_neko_speech gives its readings one budget: with
    // 2,000 appending rules the first reading's search spends it, and the
    // other four readings record their texts only.
    std::string rules;
    for (int i = 0; i < 2000; ++i) {
      rules += std::string(i ? "," : "") + R"({"type":"suffix","inflected":"","deinflected":"x)" + std::to_string(i) +
               R"(","conditionsIn":[],"conditionsOut":[],"stemMinLength":1})";
    }
    const auto pack = load(transforms_json(transform("wide", rules)), &error,
                           R"(,"variantPasses":[{"id":"nekoSpeech","builtin":"ja.nekoSpeech","optional":true}])");
    check(pack != nullptr, "wide neko pack loads: " + error);
    if (pack) {
      const auto results = Deinflector(pack).deinflect_neko_speech("にゃ");
      lang::Deinflections one;
      pack->data().transforms->deinflect("な", one);
      check(results.size() == one.size() + 4, "the readings share one budget: " + std::to_string(results.size()) +
                                                  " results, one reading alone " + std::to_string(one.size()));
    }
  }
  {
    // The growth bound counts code points, also when outputs keep the bytes
    // of the text the search started from: 𝒜 (4 bytes) -> aaaa adds 3 code
    // points a step in the same 64 bytes, あ (3 bytes) -> aaa adds 2.
    const auto lc = load(
        transforms_json(transform(
            "lc",
            R"({"type":"replace","inflected":"𝒜","deinflected":"aaaa","occurrence":"first","conditionsIn":[],"conditionsOut":[]})")),
        &error);
    const auto ld = load(
        transforms_json(transform(
            "ld",
            R"({"type":"replace","inflected":"あ","deinflected":"aaa","occurrence":"first","conditionsIn":[],"conditionsOut":[]})")),
        &error);
    check(lc != nullptr && ld != nullptr, "multibyte packs load: " + error);
    if (lc && ld) {
      std::string script;
      std::string kana;
      for (int i = 0; i < 16; ++i) script += "𝒜";
      for (int i = 0; i < 40; ++i) kana += "あ";
      // 16 + 3k > 48 from k = 11, 40 + 2k > 72 from k = 17.
      check(search(*lc, script, nullptr).size() == 11 && search(*ld, kana, nullptr).size() == 17,
            "growth in code points from a multibyte text: " + std::to_string(search(*lc, script, nullptr).size()) +
                " and " + std::to_string(search(*ld, kana, nullptr).size()));
    }
  }
  {
    // Phrasal endings apply longest first (section 7.4): -ked before -ed.
    const auto pack = load(
        transforms_json(
            transform(
                "ked",
                R"({"type":"phrasal","inflected":"ked","deinflected":"kA","followedBy":"particles","conditionsIn":[],"conditionsOut":[]})") +
                "," +
                transform(
                    "ed",
                    R"({"type":"phrasal","inflected":"ed","deinflected":"B","followedBy":"particles","conditionsIn":[],"conditionsOut":[]})"),
            R"({"particles":["up"]})"),
        &error);
    check(pack != nullptr, "phrasal order pack loads: " + error);
    if (pack) {
      const auto r = deinflect(*pack, "looked up");
      check(r == std::vector<std::string>{"looked up::", "lookA up::ked", "lookB up::ed"}, "phrasal order: " + join(r));
    }
  }
  {
    // affix_inputs (section 12.1 step 7): a suffix alone, on stems of the
    // most used letters (a c d g o t, then b e from the class), and on the
    // first short words.
    const auto pack =
        load(transforms_json(transform(
                 "s", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":[]})")),
             &error);
    if (pack) {
      const auto inputs = lang::affix_inputs(pack->data(), {"cat", "dog"});
      check(inputs == std::vector<std::string>{"s", "as", "acds", "dgotbs", "cats", "dogs"},
            "affix inputs: " + join(inputs));
    }
  }
#if defined(__unix__) || defined(__APPLE__)
  {
    // The search keeps its own stack: a 128-rule chain runs on a thread with
    // a 256 KiB native stack. The recursion it replaced took about 2 KiB of
    // stack per rule (1,952 bytes for one call with GCC 14 at -O3), so the
    // counter's 255 rules overflowed such a thread.
    const auto pack = load(transforms_json(transform("count", counter_rules())), &error);
    struct Job {
      const hoshidicts::LanguagePack* pack;
      size_t results = 0;
    } job{pack.get()};
    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setstacksize(&attr, std::max<size_t>(PTHREAD_STACK_MIN, 256 * 1024));
    pthread_t thread;
    const int started = pthread_create(
        &thread, &attr,
        [](void* p) -> void* {
          auto* j = static_cast<Job*>(p);
          lang::Deinflections list;
          j->pack->data().transforms->deinflect("aaaaaaaa", list);
          j->results = list.size();
          return nullptr;
        },
        &job);
    pthread_attr_destroy(&attr);
    check(started == 0, "a thread with a small stack starts");
    if (started == 0) pthread_join(thread, nullptr);
    check(job.results == max_depth + 1, "counter on a small stack: " + std::to_string(job.results));
  }
#endif
  {
    // Japanese: deep chains are far within the bounds. 食べ + させ × n + る
    // reaches 食べる through n causative steps, here 100 (the parity test's
    // deepest is 44 rules); at 200 the depth bound cuts the search, which
    // still ends.
    const auto ja = hoshidicts::builtin_language_pack("ja");
    const auto chain = [](int n) {
      std::string s = "食べ";
      for (int i = 0; i < n; ++i) s += "させ";
      return s + "る";
    };
    lang::BoundHit hit;
    const auto list = search(*ja, chain(100), &hit);
    const bool found =
        std::ranges::any_of(list, [](const lang::Deinflection& d) { return d.text == "食べる" && d.depth == 100; });
    check(found && !hit, "食べ + させ × 100 + る: 食べる after 100 steps, no bound");
    lang::BoundHit deep;
    const auto cut = search(*ja, chain(200), &deep);
    check(deep.bound == Bound::Depth && longest_chain(cut) == max_depth &&
              std::ranges::none_of(cut, [](const lang::Deinflection& d) { return d.text == "食べる"; }),
          "食べ + させ × 200 + る: the depth bound");
  }
}

// What the work budget counts besides rule applications (section 7.4), the
// load-time limits that keep each count small, and the processors' share.
void test_work_accounting() {
  using Bound = lang::BoundHit::Bound;
  std::string error;
  {
    // The budget clamps at zero, and operations go in 64 to a unit.
    lang::SearchBudget budget;
    budget.work_left = 5;
    budget.spend(10);
    check(budget.spent() && budget.work_left == 0 && budget.used() == lang::SearchBounds::max_work,
          "spending more than is left empties the budget");
    lang::SearchBudget ops;
    check(ops.add_ops(63) == 0 && ops.used() == 0 && ops.add_ops(1) == 1 && ops.used() == 1 && ops.add_ops(130) == 2 &&
              ops.ops == 2,
          "64 operations to a unit");
  }
  {
    // Rules their conditions skip are operations: from a, the rule a -> b
    // gives b, whose node holds 640 rules for a condition b never has. 1 unit
    // for the try, and 642 operations (640 skips, 2 code points the trie
    // walks read): 11 units.
    std::string dead;
    for (int i = 0; i < 640; ++i) {
      dead += R"(,{"type":"suffix","inflected":"b","deinflected":"z","conditionsIn":["n"],"conditionsOut":["n"]})";
    }
    const auto pack =
        load(transforms_json(transform(
                 "t", R"({"type":"suffix","inflected":"a","deinflected":"b","conditionsIn":[],"conditionsOut":["x"]})" +
                          dead)),
             &error);
    check(pack != nullptr, "skip pack loads: " + error);
    if (pack) {
      lang::SearchBudget budget;
      lang::Deinflections list;
      pack->data().transforms->deinflect("a", list, nullptr, nullptr, &budget);
      check(list.size() == 2 && budget.used() == 11 && budget.ops == 2,
            "skipped rules are charged: " + std::to_string(budget.used()) + " units, " + std::to_string(budget.ops) +
                " ops");
    }
  }
  {
    // Searching a text for a replace rule's occurrences reads it: 128 bytes,
    // twice (the root, and the output the rule made, where it finds none), and
    // 2 code points the trie walks read; with the two tries, 2 + 258 / 64 = 6.
    const auto pack = load(
        transforms_json(transform(
            "r",
            R"({"type":"replace","inflected":"x","deinflected":"y","occurrence":"first","conditionsIn":[],"conditionsOut":[]})")),
        &error);
    check(pack != nullptr, "replace pack loads: " + error);
    if (pack) {
      lang::SearchBudget budget;
      lang::Deinflections list;
      pack->data().transforms->deinflect(std::string(127, 'a') + "x", list, nullptr, nullptr, &budget);
      check(list.size() == 2 && budget.used() == 6,
            "a replace rule's scan is charged: " + std::to_string(budget.used()));
    }
  }
  {
    // A trie node with many children is searched by code point: 1,000 suffix
    // rules on 1,000 code points, each found.
    std::string rules;
    for (int i = 0; i < 1000; ++i) {
      std::string c;
      lang::append_utf8(c, static_cast<char32_t>(0x4E00 + i));
      rules += std::string(i ? "," : "") + R"({"type":"suffix","inflected":")" + c + R"(","deinflected":"x)" +
               std::to_string(i) + R"(","conditionsIn":[],"conditionsOut":[]})";
    }
    const auto pack = load(transforms_json(transform("wide", rules)), &error);
    check(pack != nullptr, "wide trie pack loads: " + error);
    if (pack) {
      bool all = true;
      for (int i : {0, 7, 8, 500, 777, 999}) {
        std::string text = "a";
        lang::append_utf8(text, static_cast<char32_t>(0x4E00 + i));
        const auto r = deinflect(*pack, text);
        all = all && r.size() == 2 && r[1] == "ax" + std::to_string(i) + "::wide";
      }
      std::string miss = "a";
      lang::append_utf8(miss, static_cast<char32_t>(0x4E00 + 1000));
      check(all && deinflect(*pack, miss).size() == 1, "children found among 1,000");
    }
  }
  {
    // A stem change tries at most 64 strings of at most 64 code points.
    const auto with_from = [&](const std::string& from) {
      std::string e;
      const bool ok = load(transforms_json(transform(
                               "s", R"({"type":"suffix","inflected":"o","deinflected":"ar","stemChange":{"from":[)" +
                                        from + R"(],"to":"e"},"conditionsIn":[],"conditionsOut":[]})")),
                           &e) != nullptr;
      return std::pair{ok, e};
    };
    std::string many;
    for (int i = 0; i < 65; ++i) many += std::string(i ? "," : "") + "\"a" + std::to_string(i) + "\"";
    std::string sixty_four;
    for (int i = 0; i < 64; ++i) sixty_four += std::string(i ? "," : "") + "\"a" + std::to_string(i) + "\"";
    const auto [ok64, e64] = with_from(sixty_four);
    const auto [ok65, e65] = with_from(many);
    const auto [ok_long, e_long] = with_from("\"" + std::string(65, 'a') + "\"");
    check(ok64 && !ok65 && e65.find("stemChange.from: has more than 64 strings") != std::string::npos && !ok_long &&
              e_long.find("stemChange.from[0]: an affix is longer than 64 code points") != std::string::npos,
          "stemChange.from limits: " + e64 + " / " + e65 + " / " + e_long);
  }
  {
    // A stem change's candidates are operations: 64 strings tried at each of
    // the 64 code points of the stem, 4,096, plus the 2 code points the trie
    // walk reads (x, then a miss on a), and 1 unit for the try:
    // 1 + (4,096 + 2) / 64 = 65 units.
    std::string from;
    for (int i = 0; i < 64; ++i) from += std::string(i ? "," : "") + "\"q" + std::to_string(i) + "\"";
    const auto pack = load(
        transforms_json(transform("s", R"({"type":"suffix","inflected":"x","deinflected":"","stemChange":{"from":[)" +
                                           from + R"(],"to":"e"},"conditionsIn":[],"conditionsOut":[]})")),
        &error);
    check(pack != nullptr, "candidate pack loads: " + error);
    if (pack) {
      lang::SearchBudget budget;
      lang::Deinflections list;
      pack->data().transforms->deinflect(std::string(64, 'a') + "x", list, nullptr, nullptr, &budget);
      check(list.size() == 1 && budget.used() == 65,
            "stem change candidates are charged: " + std::to_string(budget.used()));
    }
  }
  {
    // A stem change with `between`: the last match whose rest of the stem is
    // all in the class, at least betweenMinLength long.
    const auto pack = load(
        transforms_json(transform(
            "s",
            R"({"type":"suffix","inflected":"x","deinflected":"","stemChange":{"from":["o","e"],"to":"i","occurrence":"last","between":"[b-df-hj-np-tv-z]","betweenMinLength":2},"conditionsIn":[],"conditionsOut":[]})")),
        &error);
    check(pack != nullptr, "between pack loads: " + error);
    if (pack) {
      // kotebd: o has e after it, e has bd (2): e -> i. kobtd: o has btd.
      // koteb, kotbe: no match has 2 consonants after it.
      const auto r = deinflect(*pack, "kotebdx");
      const auto r1 = deinflect(*pack, "kobtdx");
      const auto r2 = deinflect(*pack, "kotebx");
      const auto r3 = deinflect(*pack, "kotbex");
      check(r.size() == 2 && r[1] == "kotibd::s" && r1.size() == 2 && r1[1] == "kibtd::s" && r2.size() == 1 &&
                r3.size() == 1,
            "stemChange between: " + join(r) + " / " + join(r1) + " / " + join(r2) + " / " + join(r3));
    }
  }
  {
    // The texts steps write and their counts are limited too: an
    // alternative of 65 code points, and an alternatives limit over 4,096.
    std::string language = language_json();
    const std::string decapitalize = R"({"id":"decapitalize","variants":[[{"case":"lower"}]]})";
    const auto with = [&](const std::string& processor) {
      std::string l = language;
      l.replace(l.find(decapitalize), decapitalize.size(), processor);
      std::string e;
      const bool ok =
          hoshidicts::parse_language_pack(
              l,
              transforms_json(transform(
                  "s", R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":[]})")),
              &e) != nullptr;
      return std::pair{ok, e};
    };
    const auto [ok64, e64] =
        with(R"({"id":"a","variants":[[{"alternatives":{"a":[")" + std::string(64, 'x') + R"("]}}]]})");
    const auto [ok65, e65] =
        with(R"({"id":"a","variants":[[{"alternatives":{"a":[")" + std::string(65, 'x') + R"("]}}]]})");
    const auto [okl, el] = with(R"({"id":"a","variants":[[{"alternatives":{"a":["b"]},"limit":4097}]]})");
    check(ok64 && !ok65 &&
              e65.find("alternatives.a: a text a step writes is longer than 64 code points") != std::string::npos &&
              !okl && el.find("limit: may be at most 4096") != std::string::npos,
          "alternatives limits: " + e64 + " / " + e65 + " / " + el);
  }
  {
    // Processors take the step limit from the text process_text was given,
    // not from each variant, so a chain of six that each double the text
    // stops at step_limit(16) = 768 code points.
    lang::Step twice;
    twice.kind = lang::StepKind::Pattern;
    twice.pattern = pattern("([a-z])", "$1$1", true);
    std::vector<lang::Processor> chain;
    for (int i = 0; i < 6; ++i) chain.push_back(lang::Processor{"d" + std::to_string(i), "", false, false, {{twice}}});
    const auto v = lang::process_text(chain, std::string(16, 'a'), {});
    check(v.size() == 1 && v[0].text.size() == 512,
          "a chain of doubling processors: " + std::to_string(v[0].text.size()));
  }
  {
    // Processors given a budget charge it, and stop when it is spent: each
    // keeps the variants made before.
    lang::Step twice;
    twice.kind = lang::StepKind::Pattern;
    twice.pattern = pattern("([a-z])", "$1$1", true);
    lang::Processor doubling{"double", "", true, false, {{twice}}};
    const std::vector<lang::Processor> processors{doubling};
    lang::SearchBudget budget;
    const auto v = lang::process_text(processors, "abcd", {}, nullptr, &budget);
    // 1, (4 x 8 written) / 256 = 0, and 4 code points read.
    check(v.size() == 2 && budget.used() == 5, "a processor's work: " + std::to_string(budget.used()));
    lang::SearchBudget spent;
    spent.work_left = 0;
    const auto w = lang::process_text(processors, "abcd", {}, nullptr, &spent);
    check(w.size() == 1 && w[0].text == "abcd", "a spent budget leaves the text as it is");
    lang::Processor replacing{"double", "", false, false, {{twice}}};
    const std::vector<lang::Processor> replace{replacing};
    lang::SearchBudget spent2;
    spent2.work_left = 0;
    const auto x = lang::process_text(replace, "abcd", {}, nullptr, &spent2);
    check(x.size() == 1 && x[0].text == "abcd" && x[0].steps == 0,
          "a spent budget keeps the text with keepInput false");
  }
  {
    // normalize_text (readingNormalizer, formOfNormalizer) stays within the
    // step limit: a pattern that doubles a run of a up to 600 reaches 1,024
    // without the limit, and is left as it was within step_limit(1) = 528.
    lang::Step grow;
    grow.kind = lang::StepKind::Pattern;
    grow.pattern = pattern("^(a{1,600})$", "$1$1");
    grow.repeat = true;
    const lang::StepList steps{grow};
    std::u32string unlimited;
    lang::apply_single(steps, u32("a"), unlimited);
    check(unlimited.size() == 1024 && lang::normalize_text(steps, "a") == "a" &&
              lang::normalize_text(steps, "aa") == "aa",
          "normalize_text within the limit");
    lang::Step lower = case_step(lang::CaseMode::Lower);
    check(lang::normalize_text({lower}, "AbC") == "abc" && lang::normalize_text({lower}, "\xFF") == "\xFF",
          "normalize_text applies the steps, and leaves invalid UTF-8 alone");
  }
  {
    // A Work bound names the rules that used the most of the work: the
    // doubling `then` rule, not the fan-out that made the most deinflections.
    const auto pack = load(
        transforms_json(transform(
            "f",
            R"J({"type":"replace","inflected":"a","deinflected":"b","occurrence":"first","conditionsIn":[],"conditionsOut":[]},
                     {"type":"replace","inflected":"a","deinflected":"c","occurrence":"first","conditionsIn":[],"conditionsOut":[]},
                     {"type":"suffix","inflected":"s","deinflected":"s","conditionsIn":[],"conditionsOut":[],"then":[{"pattern":"(.)","replace":"$1$1","global":true,"repeat":true}]})J")),
        &error);
    check(pack != nullptr, "costly pack loads: " + error);
    if (pack) {
      lang::SourceSearch source;
      bool limit = false;
      lang::deinflect_source(pack->data(), std::string(16, 'a') + "s", &limit, lang::TestOptions::All, &source);
      const std::string described = lang::describe(source);
      check(source.bound == Bound::Work && !source.costliest.empty() && source.costliest[0].first == "f[2]" &&
                described.find("; the rules that used the most of its work: f[2] (") != std::string::npos,
            "the costliest rule is named: " + described);
    }
  }
  {
    // A corpus row's variant pass readings share its budget (deinflect_source),
    // as Deinflector::deinflect_neko_speech's do: with 2,000 appending rules
    // the search of にゃ spends it, and each reading records its text only.
    std::string rules;
    for (int i = 0; i < 2000; ++i) {
      rules += std::string(i ? "," : "") + R"({"type":"suffix","inflected":"","deinflected":"x)" + std::to_string(i) +
               R"(","conditionsIn":[],"conditionsOut":[],"stemMinLength":1})";
    }
    const auto pack = load(transforms_json(transform("wide", rules)), &error,
                           R"(,"variantPasses":[{"id":"nekoSpeech","builtin":"ja.nekoSpeech","optional":true}])");
    if (pack) {
      bool limit = false;
      const auto all = lang::deinflect_source(pack->data(), "にゃ", &limit, lang::TestOptions::All);
      const auto defaults = lang::deinflect_source(pack->data(), "にゃ", &limit, lang::TestOptions::Default);
      check(all.size() == defaults.size() + 5,
            "a corpus row's readings share its budget: " + std::to_string(all.size()) + " and " +
                std::to_string(defaults.size()));
    }
  }
  {
    // Searches on several threads at once give what one thread gives: each
    // thread has a search stack of its own. The fan-out keeps hundreds of
    // frames and matches on the stack, so a shared one would mix them up.
    const auto pack = load(
        transforms_json(transform(
            "f",
            R"({"type":"replace","inflected":"a","deinflected":"b","occurrence":"first","conditionsIn":[],"conditionsOut":[]},
                                       {"type":"replace","inflected":"a","deinflected":"c","occurrence":"first","conditionsIn":[],"conditionsOut":[]})")),
        &error);
    if (pack) {
      const std::vector<std::string> texts = {std::string(10, 'a'), std::string(9, 'a') + "x",
                                              "xa" + std::string(8, 'a')};
      std::vector<lang::Deinflections> reference(texts.size());
      for (size_t t = 0; t < texts.size(); ++t) pack->data().transforms->deinflect(texts[t], reference[t]);
      std::atomic<int> mismatches = 0;
      std::vector<std::thread> threads;
      for (int t = 0; t < 8; ++t) {
        threads.emplace_back([&, t] {
          for (int k = 0; k < 40; ++k) {
            const size_t which = static_cast<size_t>(t + k) % texts.size();
            lang::Deinflections list;
            pack->data().transforms->deinflect(texts[which], list);
            bool same = list.size() == reference[which].size();
            for (size_t i = 0; same && i < list.size(); ++i) {
              same = list[i].text == reference[which][i].text && list[i].parent == reference[which][i].parent;
            }
            if (!same) ++mismatches;
          }
        });
      }
      for (auto& thread : threads) thread.join();
      check(mismatches == 0, "searches on 8 threads: " + std::to_string(mismatches.load()) + " mismatches");
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
      {"verbGuardWords names no word list", language_json(),
       transforms_json(transform("t", R"({"type":"interposedObject","particles":"p","guardWords":"p","verbGuardWords":"auxiliaries","conditionsIn":[],"conditionsOut":["v"]})"),
                       R"({"p":["up"]})"),
       R"(xx: transforms.json: transforms[0].rules[0].verbGuardWords: names no word list "auxiliaries")"},
      {"verbGuardWords names a list", language_json(),
       transforms_json(transform("t", R"({"type":"interposedObject","particles":"p","guardWords":"p","verbGuardWords":["had"],"conditionsIn":[],"conditionsOut":["v"]})"),
                       R"({"p":["up"]})"),
       "transforms[0].rules[0].verbGuardWords: must be a string, not an array"},
      {"verbGuardWords on a phrasal rule", language_json(),
       transforms_json(transform("t", R"({"type":"phrasal","inflected":"ed","deinflected":"","followedBy":"p","verbGuardWords":"p","conditionsIn":[],"conditionsOut":["v"]})"),
                       R"({"p":["up"]})"),
       "transforms[0].rules[0].verbGuardWords: unknown key"},
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

// Rules that replace a pack's own for one run (`hoshidicts-cli --transforms`,
// section 10.3): a setting may name an optional transform they lack. Hosts
// and lookups check settings against the rules they load, as before.
void test_replaced_rules() {
  const std::string plural = R"({"type":"suffix","inflected":"s","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})";
  const std::string own = transforms_json(
      transform("t", plural) + "," +
      transform("archaic", R"({"type":"suffix","inflected":"eth","deinflected":"","conditionsIn":[],"conditionsOut":["v"]})",
                R"(,"optional":true)"));
  const std::string rules = transforms_json(
      transform("t", plural) + "," +
      transform("z", R"({"type":"suffix","inflected":"z","deinflected":"","conditionsIn":[],"conditionsOut":["n"]})",
                R"(,"optional":true)"));
  const std::string setting =
      R"([{"id":"archaicForms","type":"boolean","default":false,"label":"A","group":"lookup","effect":{"transforms":["archaic"]}}])";
  const std::string language = language_json("", "xx", setting);
  std::string e;
  check(hoshidicts::parse_language_pack(language, own, &e) != nullptr, "a setting names an optional transform of the pack: " + e);
  const std::string refused = R"(xx: language.json: settings[0].effect.transforms[0]: names no optional transform "archaic")";
  check(hoshidicts::parse_language_pack(language, rules, &e) == nullptr && e == refused, "parse_language_pack still refuses: " + e);
  hoshidicts::LanguageRegistry registry;
  check(!registry.add(language, rules, &e) && e == refused && registry.codes().empty(), "LanguageRegistry::add still refuses: " + e);
  {
    // So does LanguageRegistry::add_directory (the CLI's registry,
    // benchmark-lookup, hd_languages_add_directory): it reads the pack's own
    // lookup.transforms file, whatever other rule files the pack has.
    const auto root =
        std::filesystem::temp_directory_path() / ("hoshidicts-replaced-rules-" + std::to_string(std::random_device{}()));
    std::filesystem::create_directories(root / "xx" / "sources");
    const auto write = [](const std::filesystem::path& path, const std::string& text) {
      std::ofstream(path, std::ios::binary) << text;
    };
    write(root / "xx" / "language.json", language);
    write(root / "xx" / "transforms.json", own);
    write(root / "xx" / "sources" / "yomitan.json", rules);
    hoshidicts::LanguageRegistry accepting;
    e.clear();
    check(accepting.add_directory(root.string(), &e) && accepting.codes() == std::vector<std::string>{"xx"},
          "add_directory: the setting names an optional transform of transforms.json: " + e);
    write(root / "xx" / "transforms.json", rules);
    write(root / "xx" / "sources" / "own.json", own);
    hoshidicts::LanguageRegistry refusing;
    check(!refusing.add_directory(root.string(), &e) && e == refused && refusing.codes().empty(),
          "LanguageRegistry::add_directory still refuses: " + e);
    std::filesystem::remove_all(root);
  }

  auto data = lang::parse_pack_with_rules(language, rules, "sources/yomitan.json", &e);
  check(data != nullptr, "replacement rules without the setting's transform: " + e);
  if (data) {
    std::vector<std::string> ids;
    for (const auto& t : data->transforms->transforms) ids.push_back(t.id);
    check(ids == std::vector<std::string>{"t", "z"}, "the pack has the replacement's transforms only: " + join(ids));
    const hoshidicts::LanguagePack pack(std::move(data));
    const std::vector<bool> on{false, true};
    check(deinflect(pack, "walketh", &on) == std::vector<std::string>{"walketh::"}, "the pack's own rules are not used");
    check(deinflect(pack, "xz") == std::vector<std::string>{"xz::"} &&
              deinflect(pack, "xz", &on) == std::vector<std::string>{"xz::", "x:n:z"},
          "the replacement's optional transform is off unless enabled");
  }

  // Errors in the rules name their file.
  check(lang::parse_pack_with_rules(language, "", "sources/yomitan.json", &e) == nullptr &&
            e.starts_with("xx: sources/yomitan.json: not valid JSON"),
        "empty rules: " + e);
  const std::string todo = transforms_json(transform("t", R"({"type":"todo","isInflected":"x$","conditionsIn":[],"conditionsOut":[]})"));
  check(lang::parse_pack_with_rules(language, todo, "sources/yomitan.json", &e) == nullptr &&
            e.starts_with("xx: sources/yomitan.json: transforms[0].rules[0]: a todo rule remains"),
        "a todo rule in the replacement: " + e);

  // The rest of language.json is checked as parse_pack checks it.
  const auto refuses = [&](const std::string& settings, const std::string& expect) {
    std::string error;
    const bool refused_here = lang::parse_pack_with_rules(language_json("", "xx", settings), rules, "r.json", &error) == nullptr;
    check(refused_here && error == expect, "replacement rules, settings " + settings + ": " + error);
  };
  refuses(R"([{"id":"a","type":"boolean","default":false,"label":"A","group":"lookup","effect":{"transforms":[]}}])",
          "xx: language.json: settings[0].effect.transforms: names no transform");
  refuses(R"([{"id":"a","type":"enum","default":"x","values":[{"id":"x","label":"X"}],"label":"A","group":"lookup","effect":{"transforms":["z"]}}])",
          "xx: language.json: settings[0].effect: a transforms effect needs a boolean setting");
  refuses(R"([{"id":"a","type":"boolean","default":false,"label":"A","group":"lookup","effect":{"preprocessor":"decapitalize"}}])",
          R"(xx: language.json: settings[0].effect.preprocessor: names no optional processor "decapitalize")");

  // A pack whose lookup.transforms is null takes the replacement too, and an
  // empty replacement is an error there as well.
  std::string no_rules = language;
  const std::string named = R"("transforms":"transforms.json")";
  no_rules.replace(no_rules.find(named), named.size(), R"("transforms":null)");
  const auto replaced = lang::parse_pack_with_rules(no_rules, rules, "r.json", &e);
  check(replaced != nullptr && replaced->transforms && replaced->transforms->transforms.size() == 2,
        "lookup.transforms null with replacement rules: " + e);
  check(lang::parse_pack_with_rules(no_rules, "", "r.json", &e) == nullptr && e.starts_with("xx: r.json: not valid JSON"),
        "lookup.transforms null with empty replacement rules: " + e);
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

// A lookup's searches share one work budget (section 7.4). With 2,000 rules
// that append to every text, the search of the longest prefix, walkedqq,
// spends it, so the search of walked records only its text and its -ed rule
// is never tried: walk is found only as the prefix walk. A lookup of walked
// itself tries -ed first, and a pack without the 2,000 rules finds walk from
// walked within walkedqq.
void test_lookup_budget() {
  const auto root =
      std::filesystem::temp_directory_path() / ("hoshidicts-lookup-budget-" + std::to_string(std::random_device{}()));
  std::filesystem::create_directories(root);
  const std::string index = R"({"title":"budget","format":3,"revision":"1"})";
  const std::string bank = R"([["walk","","v","v",0,["to walk"],0,""],["a","","","",0,["the letter"],0,""]])";
  {
    std::ofstream(root / "budget.zip", std::ios::binary)
        << build_zip({{"index.json", index}, {"term_bank_1.json", bank}});
  }
  const auto imported = dictionary_importer::import((root / "budget.zip").string(), root.string());
  check(imported.success, "import the budget dictionary: " + imported.error);
  DictionaryQuery query;
  check(query.add_term_dict((root / "budget").string()), "load the budget dictionary");
  std::string language = language_json();
  language.replace(language.find(R"("searchResolution":"word")"), std::strlen(R"("searchResolution":"word")"),
                   R"("searchResolution":"character")");
  const std::string past = transform(
      "past", R"({"type":"suffix","inflected":"ed","deinflected":"","conditionsIn":[],"conditionsOut":["v"]})");
  std::string wide;
  for (int i = 0; i < 2000; ++i) {
    wide += std::string(i ? "," : "") + R"({"type":"suffix","inflected":"","deinflected":"x)" + std::to_string(i) +
            R"(","conditionsIn":[],"conditionsOut":[],"stemMinLength":1})";
  }
  hoshidicts::LanguageRegistry registry;
  std::string error;
  check(registry.add(language, transforms_json(past + "," + transform("wide", wide)), &error),
        "add the wide pack: " + error);
  std::string plain = language;
  plain.replace(plain.find(R"("code":"xx")"), std::strlen(R"("code":"xx")"), R"("code":"yy")");
  check(registry.add(plain, transforms_json(past), &error), "add the plain pack: " + error);
  const Lookup lookup(query, registry);
  const auto first = [&](const std::string& text, const std::string& code) {
    LookupOptions options;
    options.language = code;
    const auto results = lookup.lookup(text, 16, 16, options);
    return results.empty() ? std::string("(none)") : results.front().term.expression + "|" + results.front().matched;
  };
  check(first("walked", "xx") == "walk|walked",
        "a lookup tries -ed before the budget is spent: " + first("walked", "xx"));
  check(first("walkedqq", "yy") == "walk|walked",
        "without the wide rules walkedqq finds walk: " + first("walkedqq", "yy"));
  check(first("walkedqq", "xx") == "walk|walk", "the lookup's searches share one budget: " + first("walkedqq", "xx"));
  // A variant pass's readings share the budget too: with the wide rules and
  // the nekoSpeech pass, the search of aにゃ spends it, so the reading aな
  // records its text only and its rule な -> "" is never tried; a is found
  // as the prefix a. With a budget of its own the reading would give a for
  // the whole of aにゃ.
  {
    const std::string pass = R"(,"variantPasses":[{"id":"nekoSpeech","builtin":"ja.nekoSpeech","optional":true}])";
    std::string with_pass = language;
    with_pass.replace(with_pass.find(R"("transforms":"transforms.json")"),
                      std::strlen(R"("transforms":"transforms.json")"), R"("transforms":"transforms.json")" + pass);
    const std::string na =
        transform("na", R"({"type":"suffix","inflected":"な","deinflected":"","conditionsIn":[],"conditionsOut":[]})");
    std::string wide_pass = with_pass;
    wide_pass.replace(wide_pass.find(R"("code":"xx")"), std::strlen(R"("code":"xx")"), R"("code":"zw")");
    std::string plain_pass = with_pass;
    plain_pass.replace(plain_pass.find(R"("code":"xx")"), std::strlen(R"("code":"xx")"), R"("code":"zp")");
    check(registry.add(wide_pass, transforms_json(na + "," + transform("wide", wide)), &error),
          "add the wide pass pack: " + error);
    check(registry.add(plain_pass, transforms_json(na), &error), "add the plain pass pack: " + error);
    const Lookup pass_lookup(query, registry);
    const auto first_pass = [&](const std::string& code) {
      LookupOptions options;
      options.language = code;
      options.language_options = {"nekoSpeech"};
      const auto results = pass_lookup.lookup("aにゃ", 16, 16, options);
      return results.empty() ? std::string("(none)") : results.front().term.expression + "|" + results.front().matched;
    };
    check(first_pass("zp") == "a|aにゃ", "a pass reading finds a: " + first_pass("zp"));
    check(first_pass("zw") == "a|a", "a pass reading shares the lookup's budget: " + first_pass("zw"));
  }
  // Postprocessors are charged to the budget (section 7.4): the 2-rule
  // fan-out with a postprocessor that writes B for b and C for c makes 2^17
  // deinflections from a x 16, each with up to 2^16 forms. The lookup's
  // budget stops it; conformance (lookup_search) sees the work bound.
  {
    std::string fan = language;
    fan.replace(fan.find(R"("code":"xx")"), std::strlen(R"("code":"xx")"), R"("code":"zf")");
    fan.replace(
        fan.find(R"("transforms":"transforms.json")"), std::strlen(R"("transforms":"transforms.json")"),
        R"("transforms":"transforms.json","postprocessors":[{"id":"cap","variants":[[{"alternatives":{"b":["B"],"c":["C"]},"limit":4096}]]}])");
    const std::string fan_rules = transforms_json(transform(
        "f",
        R"({"type":"replace","inflected":"a","deinflected":"b","occurrence":"first","conditionsIn":[],"conditionsOut":[]},
               {"type":"replace","inflected":"a","deinflected":"c","occurrence":"first","conditionsIn":[],"conditionsOut":[]})"));
    check(registry.add(fan, fan_rules, &error), "add the fan-out pack: " + error);
    const Lookup fan_lookup(query, registry);
    LookupOptions options;
    options.language = "zf";
    const auto start = std::chrono::steady_clock::now();
    const auto results = fan_lookup.lookup(std::string(16, 'a'), 16, 16, options);
    const double seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
    check(seconds < 30, "the postprocessor fan-out lookup ends: " + std::to_string(seconds) + " s");
    lang::SearchCache cache;
    const auto simulated =
        lang::lookup_search(registry.find("zf")->data(), std::string(16, 'a'), 16, lang::TestOptions::All, cache);
    check(simulated.bound != lang::BoundHit::Bound::None && simulated.work > lang::SearchBounds::max_work,
          "lookup_search counts the postprocessors' work: " + std::to_string(simulated.work));
  }
  // Lookup charges a unit for each text it looks up (section 7.4). With -ed
  // and the 2-rule fan-out on a, the prefixes a lookup of walked + a x 17
  // scans before walked use 944,086 units without that unit and 1,271,744
  // with it (327,658 forms), so only with it is the budget spent when
  // walked is searched: walk is then found as the prefix walk, not from
  // walked. With a x 10 (29,519 units) the budget lasts either way.
  {
    std::string fan_language = language;
    fan_language.replace(fan_language.find(R"("code":"xx")"), std::strlen(R"("code":"xx")"), R"("code":"zm")");
    const std::string fan_rules = transforms_json(
        past + "," +
        transform(
            "f",
            R"({"type":"replace","inflected":"a","deinflected":"b","occurrence":"first","conditionsIn":["x"],"conditionsOut":["x"]},
                        {"type":"replace","inflected":"a","deinflected":"c","occurrence":"first","conditionsIn":["x"],"conditionsOut":["x"]})"));
    check(registry.add(fan_language, fan_rules, &error), "add the forms pack: " + error);
    const Lookup forms_lookup(query, registry);
    LookupOptions options;
    options.language = "zm";
    const auto first_of = [&](size_t k) {
      const std::string text = "walked" + std::string(k, 'a');
      const auto results = forms_lookup.lookup(text, 16, text.size(), options);
      return results.empty() ? std::string("(none)") : results.front().term.expression + "|" + results.front().matched;
    };
    check(first_of(10) == "walk|walked", "the budget lasts for walked + a x 10: " + first_of(10));
    check(first_of(17) == "walk|walk", "each form looked up is charged: " + first_of(17));
  }
  // lookup_search, as Lookup, charges a unit for each text looked up: a
  // lookup of walked alone (scan 0) costs 1 for decapitalize, 1 for the -ed
  // try and 2 for the forms walked and walk.
  {
    std::string language2 = language;
    language2.replace(language2.find(R"("code":"xx")"), std::strlen(R"("code":"xx")"), R"("code":"zl")");
    check(registry.add(language2, transforms_json(past), &error), "add the looked-up forms pack: " + error);
    lang::SearchCache cache;
    const auto one = lang::lookup_search(registry.find("zl")->data(), "walked", 0, lang::TestOptions::All, cache);
    check(one.work == 1 + 1 + 2, "a lookup's forms are charged: " + std::to_string(one.work));
  }
  std::filesystem::remove_all(root);
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
  test_search_bounds();
  test_work_accounting();
  test_schema();
  test_replaced_rules();
  test_registry();
  test_word_lookup();
  test_lookup_budget();
  test_probe_packs(argv[1]);
  std::printf("%zu cases, %d failures\n", cases, failures);
  return failures == 0 ? 0 : 1;
}
