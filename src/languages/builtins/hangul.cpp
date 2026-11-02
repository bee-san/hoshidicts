// SPDX-License-Identifier: GPL-3.0-or-later
// hangul.disassemble and hangul.assemble (docs/languages.md, section 6.3): a
// port of Hangul.disassemble(str, false).join('') and Hangul.assemble(str)
// from hangul-js 0.2.6 (https://github.com/e-/Hangul.js, MIT, Copyright 2017
// Jaemin Jo), which Yomitan's Korean processors call. The port keeps the
// library's quirks, so the results are the same for every input: its tables
// map code 0 as a jamo, and a pair it cannot join becomes U+0000.
#include <array>
#include <optional>
#include <string>

#include "builtins.hpp"

namespace hoshidicts::lang::builtins {

namespace {

constexpr std::array<char32_t, 19> CHO = {U'ㄱ', U'ㄲ', U'ㄴ', U'ㄷ', U'ㄸ', U'ㄹ', U'ㅁ', U'ㅂ', U'ㅃ', U'ㅅ',
                                           U'ㅆ', U'ㅇ', U'ㅈ', U'ㅉ', U'ㅊ', U'ㅋ', U'ㅌ', U'ㅍ', U'ㅎ'};

// JUNG and JONG: one or two jamo per entry.
struct Jamo {
  char32_t first;
  char32_t second;  // 0 when there is one
};

constexpr std::array<Jamo, 21> JUNG = {{{U'ㅏ', 0}, {U'ㅐ', 0}, {U'ㅑ', 0}, {U'ㅒ', 0}, {U'ㅓ', 0}, {U'ㅔ', 0},
                                        {U'ㅕ', 0}, {U'ㅖ', 0}, {U'ㅗ', 0}, {U'ㅗ', U'ㅏ'}, {U'ㅗ', U'ㅐ'},
                                        {U'ㅗ', U'ㅣ'}, {U'ㅛ', 0}, {U'ㅜ', 0}, {U'ㅜ', U'ㅓ'}, {U'ㅜ', U'ㅔ'},
                                        {U'ㅜ', U'ㅣ'}, {U'ㅠ', 0}, {U'ㅡ', 0}, {U'ㅡ', U'ㅣ'}, {U'ㅣ', 0}}};

constexpr std::array<Jamo, 28> JONG = {{{0, 0},        {U'ㄱ', 0},     {U'ㄲ', 0},     {U'ㄱ', U'ㅅ'}, {U'ㄴ', 0},
                                        {U'ㄴ', U'ㅈ'}, {U'ㄴ', U'ㅎ'}, {U'ㄷ', 0},     {U'ㄹ', 0},     {U'ㄹ', U'ㄱ'},
                                        {U'ㄹ', U'ㅁ'}, {U'ㄹ', U'ㅂ'}, {U'ㄹ', U'ㅅ'}, {U'ㄹ', U'ㅌ'}, {U'ㄹ', U'ㅍ'},
                                        {U'ㄹ', U'ㅎ'}, {U'ㅁ', 0},     {U'ㅂ', 0},     {U'ㅂ', U'ㅅ'}, {U'ㅅ', 0},
                                        {U'ㅆ', 0},     {U'ㅇ', 0},     {U'ㅈ', 0},     {U'ㅊ', 0},     {U'ㅋ', 0},
                                        {U'ㅌ', 0},     {U'ㅍ', 0},     {U'ㅎ', 0}}};

constexpr char32_t HANGUL_OFFSET = 0xAC00;

constexpr std::array<char32_t, 30> CONSONANTS = {U'ㄱ', U'ㄲ', U'ㄳ', U'ㄴ', U'ㄵ', U'ㄶ', U'ㄷ', U'ㄸ', U'ㄹ', U'ㄺ',
                                                  U'ㄻ', U'ㄼ', U'ㄽ', U'ㄾ', U'ㄿ', U'ㅀ', U'ㅁ', U'ㅂ', U'ㅃ', U'ㅄ',
                                                  U'ㅅ', U'ㅆ', U'ㅇ', U'ㅈ', U'ㅉ', U'ㅊ', U'ㅋ', U'ㅌ', U'ㅍ', U'ㅎ'};
constexpr std::array<char32_t, 21> COMPLETE_JUNG = {U'ㅏ', U'ㅐ', U'ㅑ', U'ㅒ', U'ㅓ', U'ㅔ', U'ㅕ', U'ㅖ', U'ㅗ', U'ㅘ', U'ㅙ',
                                                     U'ㅚ', U'ㅛ', U'ㅜ', U'ㅝ', U'ㅞ', U'ㅟ', U'ㅠ', U'ㅡ', U'ㅢ', U'ㅣ'};
constexpr std::array<char32_t, 28> COMPLETE_JONG = {0,     U'ㄱ', U'ㄲ', U'ㄳ', U'ㄴ', U'ㄵ', U'ㄶ', U'ㄷ', U'ㄹ', U'ㄺ',
                                                     U'ㄻ', U'ㄼ', U'ㄽ', U'ㄾ', U'ㄿ', U'ㅀ', U'ㅁ', U'ㅂ', U'ㅄ', U'ㅅ',
                                                     U'ㅆ', U'ㅇ', U'ㅈ', U'ㅊ', U'ㅋ', U'ㅌ', U'ㅍ', U'ㅎ'};

struct Triple {
  char32_t a;
  char32_t b;
  char32_t joined;
};
constexpr std::array<Triple, 11> COMPLEX_CONSONANTS = {{{U'ㄱ', U'ㅅ', U'ㄳ'},
                                                        {U'ㄴ', U'ㅈ', U'ㄵ'},
                                                        {U'ㄴ', U'ㅎ', U'ㄶ'},
                                                        {U'ㄹ', U'ㄱ', U'ㄺ'},
                                                        {U'ㄹ', U'ㅁ', U'ㄻ'},
                                                        {U'ㄹ', U'ㅂ', U'ㄼ'},
                                                        {U'ㄹ', U'ㅅ', U'ㄽ'},
                                                        {U'ㄹ', U'ㅌ', U'ㄾ'},
                                                        {U'ㄹ', U'ㅍ', U'ㄿ'},
                                                        {U'ㄹ', U'ㅎ', U'ㅀ'},
                                                        {U'ㅂ', U'ㅅ', U'ㅄ'}}};
constexpr std::array<Triple, 7> COMPLEX_VOWELS = {{{U'ㅗ', U'ㅏ', U'ㅘ'},
                                                   {U'ㅗ', U'ㅐ', U'ㅙ'},
                                                   {U'ㅗ', U'ㅣ', U'ㅚ'},
                                                   {U'ㅜ', U'ㅓ', U'ㅝ'},
                                                   {U'ㅜ', U'ㅔ', U'ㅞ'},
                                                   {U'ㅜ', U'ㅣ', U'ㅟ'},
                                                   {U'ㅡ', U'ㅣ', U'ㅢ'}}};

// _makeHash: the index of each entry by its code, plus {0: 0}.
template <size_t N>
std::optional<int> hash_index(const std::array<char32_t, N>& table, char32_t code) {
  if (code == 0) return 0;
  for (size_t i = 0; i < N; ++i) {
    if (table[i] != 0 && table[i] == code) return static_cast<int>(i);
  }
  return std::nullopt;
}

std::optional<int> consonant_index(char32_t c) { return hash_index(CONSONANTS, c); }
std::optional<int> cho_index(char32_t c) { return hash_index(CHO, c); }
std::optional<int> jung_index(char32_t c) { return hash_index(COMPLETE_JUNG, c); }
std::optional<int> jong_index(char32_t c) { return hash_index(COMPLETE_JONG, c); }

bool is_consonant(char32_t c) { return consonant_index(c).has_value(); }
bool is_cho(char32_t c) { return cho_index(c).has_value(); }
bool is_jung(char32_t c) { return jung_index(c).has_value(); }
bool is_jong(char32_t c) { return jong_index(c).has_value(); }
bool is_hangul(char32_t c) { return c >= 0xAC00 && c <= 0xD7A3; }

// A JavaScript value the library computes with: a code, or false/undefined
// (which String.fromCharCode turns into U+0000 and a table lookup misses).
using Value = std::optional<char32_t>;

template <size_t N>
Value joinable(const std::array<Triple, N>& table, Value a, Value b) {
  if (!a || !b) return std::nullopt;
  for (const auto& t : table) {
    if (t.a == *a && t.b == *b) return t.joined;
  }
  return std::nullopt;
}
Value jung_joinable(Value a, Value b) { return joinable(COMPLEX_VOWELS, a, b); }
Value jong_joinable(Value a, Value b) { return joinable(COMPLEX_CONSONANTS, a, b); }

char32_t from_char_code(Value v) { return v ? static_cast<char32_t>(*v & 0xFFFF) : 0; }

void push_jamo(const Jamo& j, std::u32string& out) {
  out.push_back(j.first);
  if (j.second != 0) out.push_back(j.second);
}

// Hangul.disassemble(string, false), flattened.
void disassemble(const std::u32string& text, std::u32string& out) {
  out.clear();
  out.reserve(text.size() * 3);
  for (char32_t code : text) {
    if (is_hangul(code)) {
      const char32_t c = code - HANGUL_OFFSET;
      const char32_t jong = c % 28;
      const char32_t jung = (c - jong) / 28 % 21;
      const char32_t cho = (c - jong) / 28 / 21;
      out.push_back(CHO[cho]);
      push_jamo(JUNG[jung], out);
      if (jong > 0) push_jamo(JONG[jong], out);
    } else if (is_consonant(code)) {
      if (is_cho(code)) {
        out.push_back(CHO[*cho_index(code)]);
      } else {
        push_jamo(JONG[*jong_index(code)], out);
      }
    } else if (is_jung(code)) {
      push_jamo(JUNG[*jung_index(code)], out);
    } else {
      out.push_back(code);
    }
  }
}

// The syllable (CHO_HASH[cho] * 21 + JUNG_HASH[jung]) * 28 + JONG_HASH[jong]
// + HANGUL_OFFSET, or U+0000 when a lookup misses (NaN in JavaScript).
char32_t syllable(Value cho, Value jung, Value jong) {
  const auto c = cho ? cho_index(*cho) : std::nullopt;
  const auto u = jung ? jung_index(*jung) : std::nullopt;
  const auto o = jong ? jong_index(*jong) : std::nullopt;
  if (!c || !u || !o) return 0;
  return static_cast<char32_t>(((*c * 21 + *u) * 28 + *o + HANGUL_OFFSET) & 0xFFFF);
}

struct Assembler {
  const std::u32string& array;
  std::u32string& result;
  long complete_index = -1;
  bool jong_joined = false;

  void make_hangul(long index) {
    Value cho;
    Value jung1;
    Value jung2;
    Value jong1 = char32_t{0};
    Value jong2;
    char32_t hangul = 0;
    jong_joined = false;
    if (complete_index + 1 > index) return;
    for (long step = 1;; ++step) {
      if (step == 1) {
        cho = array[complete_index + step];
        if (is_jung(*cho)) {
          if (complete_index + step + 1 <= index && is_jung(*(jung1 = array[complete_index + step + 1]))) {
            result.push_back(from_char_code(jung_joinable(cho, jung1)));
          } else {
            result.push_back(array[complete_index + step]);
          }
          complete_index = index;
          return;
        }
        if (!is_cho(*cho)) {
          result.push_back(array[complete_index + step]);
          complete_index = index;
          return;
        }
        hangul = array[complete_index + step];
      } else if (step == 2) {
        jung1 = array[complete_index + step];
        if (is_cho(*jung1)) {
          cho = jong_joinable(cho, jung1);
          result.push_back(from_char_code(cho));
          complete_index = index;
          return;
        }
        hangul = syllable(cho, jung1, jong1);
      } else if (step == 3) {
        jung2 = array[complete_index + step];
        if (const Value joined = jung_joinable(jung1, jung2)) {
          jung1 = joined;
        } else {
          jong1 = jung2;
        }
        hangul = syllable(cho, jung1, jong1);
      } else if (step == 4) {
        jong2 = array[complete_index + step];
        if (const Value joined = jong_joinable(jong1, jong2)) {
          jong1 = joined;
        } else {
          jong1 = jong2;
        }
        hangul = syllable(cho, jung1, jong1);
      } else if (step == 5) {
        jong2 = array[complete_index + step];
        jong1 = jong_joinable(jong1, jong2);
        hangul = syllable(cho, jung1, jong1);
      }
      if (complete_index + step >= index) {
        result.push_back(hangul);
        complete_index = index;
        return;
      }
    }
  }

  void run() {
    int stage = 0;
    char32_t previous_code = 0;
    bool have_previous = false;
    long i = 0;
    const long length = static_cast<long>(array.size());
    for (; i < length; ++i) {
      const char32_t code = array[i];
      if (!is_cho(code) && !is_jung(code) && !is_jong(code)) {
        make_hangul(i - 1);
        make_hangul(i);
        stage = 0;
        continue;
      }
      const Value previous = have_previous ? Value(previous_code) : std::nullopt;
      if (stage == 0) {
        if (is_cho(code)) {
          stage = 1;
        } else if (is_jung(code)) {
          stage = 4;
        }
      } else if (stage == 1) {
        if (is_jung(code)) {
          stage = 2;
        } else if (jong_joinable(previous, code)) {
          stage = 5;
        } else {
          make_hangul(i - 1);
        }
      } else if (stage == 2) {
        if (is_jong(code)) {
          stage = 3;
        } else if (is_jung(code)) {
          if (!jung_joinable(previous, code)) {
            make_hangul(i - 1);
            stage = 4;
          }
        } else {
          make_hangul(i - 1);
          stage = 1;
        }
      } else if (stage == 3) {
        if (is_jong(code)) {
          if (!jong_joined && jong_joinable(previous, code)) {
            jong_joined = true;
          } else {
            make_hangul(i - 1);
            stage = 1;
          }
        } else if (is_cho(code)) {
          make_hangul(i - 1);
          stage = 1;
        } else if (is_jung(code)) {
          make_hangul(i - 2);
          stage = 2;
        }
      } else if (stage == 4) {
        if (is_jung(code)) {
          if (jung_joinable(previous, code)) {
            make_hangul(i);
            stage = 0;
          } else {
            make_hangul(i - 1);
          }
        } else {
          make_hangul(i - 1);
          stage = 1;
        }
      } else if (stage == 5) {
        if (is_jung(code)) {
          make_hangul(i - 2);
          stage = 2;
        } else {
          make_hangul(i - 1);
          stage = 1;
        }
      }
      previous_code = code;
      have_previous = true;
    }
    make_hangul(i - 1);
  }
};

}  // namespace

void hangul_disassemble(const std::u32string& in, std::u32string& out) { disassemble(in, out); }

void hangul_assemble(const std::u32string& in, std::u32string& out) {
  std::u32string array;
  disassemble(in, array);
  out.clear();
  out.reserve(array.size());
  Assembler assembler{array, out};
  assembler.run();
}

}  // namespace hoshidicts::lang::builtins
