// SPDX-License-Identifier: GPL-3.0-or-later
// vi.toneMarksOld and vi.toneMarksNew (docs/languages.md, section 6.3):
// Yomitan's normalizeDiacriticsImpl(str, 'old' | 'new')
// (ext/js/language/vi/viet-text-preprocessors.js at d3c54c1, GPL-3.0-or-later,
// Copyright (C) 2024-2026 Yomitan Authors). Its regular expressions use
// lookbehind and case-insensitive matching, which the pattern dialect
// excludes, so each is written out here as the matcher it is:
//
//   TONE = [\u0300\u0309\u0303\u0301\u0323], DIACRITICS = \u0306\u0302\u031B
//   re1 = /TONE([aeiouyDIACRITICS]+)/i        -> $2$1
//   re2 = /(?<=[DIACRITICS])(.)TONE/i         -> $2$1
//   re3 = /(?<=[ae])([iouy])TONE/i            -> $2$1
//   re4 = /(?<=[oy])([iuy])TONE/i             -> $2$1
//   re5 = /(?<!q)(u)([aeiou])TONE/i           -> $1$3$2
//   re6 = /(?<!g)(i)([aeiouy])TONE/i          -> $1$3$2
//   re7 = /(?<!q)([ou])([aeoy])TONE(?!\w)/i   -> $1$3$2 (old style only)
//
// each replacing its first match, between an NFD and an NFC normalisation.
// Without the `u` flag, `i` folds only ASCII letters here, `.` is any UTF-16
// unit but a line terminator, and \w is [A-Za-z0-9_].
#include <string>
#include <string_view>

#include "../unicode.hpp"
#include "builtins.hpp"

namespace hoshidicts::lang::builtins {

namespace {

bool is_tone(char32_t c) { return c == 0x0300 || c == 0x0309 || c == 0x0303 || c == 0x0301 || c == 0x0323; }
bool is_diacritic(char32_t c) { return c == 0x0306 || c == 0x0302 || c == 0x031B; }

// Membership of an ASCII letter set, case-insensitively.
bool in_letters(char32_t c, std::string_view letters) {
  if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
  return c < 0x80 && letters.find(static_cast<char>(c)) != std::string_view::npos;
}

bool is_word(char32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_';
}

// JavaScript's `.` without the `u` flag, on a code point: an astral code
// point's first unit could match it, but then never what follows.
bool is_any(char32_t c) { return c <= 0xFFFF && c != '\n' && c != '\r' && c != 0x2028 && c != 0x2029; }

// re1: the leftmost tone followed by a run of vowels and diacritics moves to
// the end of the run.
void move_tone_after_vowels(std::u32string& s) {
  const auto vowel = [](char32_t c) { return in_letters(c, "aeiouy") || is_diacritic(c); };
  for (size_t p = 0; p + 1 < s.size(); ++p) {
    if (!is_tone(s[p]) || !vowel(s[p + 1])) continue;
    size_t end = p + 1;
    while (end < s.size() && vowel(s[end])) ++end;
    const char32_t tone = s[p];
    s.erase(p, 1);
    s.insert(s.begin() + static_cast<std::ptrdiff_t>(end - 1), tone);
    return;
  }
}

// re2-re4: (?<=[before])([letter])TONE -> TONE letter, at the leftmost match.
template <typename Before, typename Letter>
void swap_after(std::u32string& s, Before before, Letter letter) {
  for (size_t p = 1; p + 1 < s.size(); ++p) {
    if (before(s[p - 1]) && letter(s[p]) && is_tone(s[p + 1])) {
      std::swap(s[p], s[p + 1]);
      return;
    }
  }
}

// re5-re7: (?<!not)([first])([second])TONE -> first TONE second.
template <typename First, typename Second>
void tone_between(std::u32string& s, std::string_view not_before, First first, Second second, bool not_word_after) {
  for (size_t p = 0; p + 2 < s.size(); ++p) {
    if (p > 0 && in_letters(s[p - 1], not_before)) continue;
    if (!first(s[p]) || !second(s[p + 1]) || !is_tone(s[p + 2])) continue;
    if (not_word_after && p + 3 < s.size() && is_word(s[p + 3])) continue;
    std::swap(s[p + 1], s[p + 2]);
    return;
  }
}

void normalize_diacritics(const std::u32string& in, bool old_style, std::u32string& out) {
  std::u32string s;
  normalize(in, NormalForm::NFD, s);
  move_tone_after_vowels(s);
  swap_after(s, is_diacritic, is_any);
  swap_after(s, [](char32_t c) { return in_letters(c, "ae"); }, [](char32_t c) { return in_letters(c, "iouy"); });
  swap_after(s, [](char32_t c) { return in_letters(c, "oy"); }, [](char32_t c) { return in_letters(c, "iuy"); });
  tone_between(s, "q", [](char32_t c) { return in_letters(c, "u"); }, [](char32_t c) { return in_letters(c, "aeiou"); },
               false);
  tone_between(s, "g", [](char32_t c) { return in_letters(c, "i"); }, [](char32_t c) { return in_letters(c, "aeiouy"); },
               false);
  if (old_style) {
    tone_between(s, "q", [](char32_t c) { return in_letters(c, "ou"); }, [](char32_t c) { return in_letters(c, "aeoy"); },
                 true);
  }
  normalize(s, NormalForm::NFC, out);
}

}  // namespace

void vi_tone_marks_old(const std::u32string& in, std::u32string& out) { normalize_diacritics(in, true, out); }
void vi_tone_marks_new(const std::u32string& in, std::u32string& out) { normalize_diacritics(in, false, out); }

}  // namespace hoshidicts::lang::builtins
