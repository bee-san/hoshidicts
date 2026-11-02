// SPDX-License-Identifier: GPL-3.0-or-later
// The Japanese builtins (docs/languages.md, section 6.3): hoshidicts' text
// processors and NekoPara cat speech, as src/text_processor/text_processor.cpp
// and src/deinflector.cpp had them at 35e2dab. They follow Yomitan's
// japanese.js and japanese-text-preprocessors.js (GPL-3.0-or-later).
#include "builtins.hpp"

#include <ankerl/unordered_dense.h>
#include <utf8.h>
#include <utf8proc.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <ranges>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

extern const char32_t kanji_variants[][2];
extern const unsigned kanji_variants_count;

namespace {
// https://github.com/yomidevs/yomitan/blob/81d17d877fb18c62ba826210bf6db2b7f4d4deed/ext/js/language/ja/japanese.js#L21
constexpr uint32_t KATAKANA_SMALL_KA = 0x30f5;
constexpr uint32_t KATAKANA_SMALL_KE = 0x30f6;
constexpr uint32_t KANA_PROLONGED_SOUND_MARK = 0x30fc;
constexpr uint32_t HIRAGANA_SMALL_TSU = 0x3063;
constexpr uint32_t KATAKANA_SMALL_TSU = 0x30c3;

constexpr char32_t KATAKANA_MIDDLE_DOT = 0x30fb;

constexpr uint32_t HIRAGANA_CONVERSION_RANGE_START = 0x3041;
constexpr uint32_t HIRAGANA_CONVERSION_RANGE_END = 0x3096;

constexpr uint32_t KATAKANA_CONVERSION_RANGE_START = 0x30a1;
constexpr uint32_t KATAKANA_CONVERSION_RANGE_END = 0x30f6;

constexpr char32_t KANJI_ITERATION_MARK = 0x3005;
constexpr char32_t HIRAGANA_ITERATION_MARK = 0x309d;
constexpr char32_t HIRAGANA_VOICED_ITERATION_MARK = 0x309e;
constexpr char32_t KATAKANA_ITERATION_MARK = 0x30fd;
constexpr char32_t KATAKANA_VOICED_ITERATION_MARK = 0x30fe;
constexpr char32_t DAKUTEN = 0x3099;

// https://github.com/yomidevs/yomitan/blob/81d17d877fb18c62ba826210bf6db2b7f4d4deed/ext/js/language/ja/japanese.js#L121
const std::unordered_map<char32_t, std::u32string> VOWEL_TO_KANA{
    {U'a', U"ぁあかがさざただなはばぱまゃやらゎわヵァアカガサザタダナハバパマャヤラヮワヵヷ"},
    {U'i', U"ぃいきぎしじちぢにひびぴみりゐィイキギシジチヂニヒビピミリヰヸ"},
    {U'u', U"ぅうくぐすずっつづぬふぶぷむゅゆるゥウクグスズッツヅヌフブプムュユルヴ"},
    {U'e', U"ぇえけげせぜてでねへべぺめれゑヶェエケゲセゼテデネヘベペメレヱヶヹ"},
    {U'o', U"ぉおこごそぞとどのほぼぽもょよろをォオコゴソゾトドノホボポモョヨロヲヺ"}};

// https://github.com/yomidevs/yomitan/blob/81d17d877fb18c62ba826210bf6db2b7f4d4deed/ext/js/language/ja/japanese.js#L131
std::unordered_map<char32_t, char32_t> build_kana_to_vowel_map() {
  std::unordered_map<char32_t, char32_t> map;
  for (const auto& [vowel, kana_string] : VOWEL_TO_KANA) {
    for (char32_t c : kana_string) {
      map.try_emplace(c, vowel);
    }
  }
  return map;
}

char32_t kana_to_vowel(char32_t kana) {
  static const auto KANA_TO_VOWEL = build_kana_to_vowel_map();
  auto it = KANA_TO_VOWEL.find(kana);
  if (it != KANA_TO_VOWEL.end()) {
    return it->second;
  }
  return 0;
}

// https://github.com/yomidevs/yomitan/blob/81d17d877fb18c62ba826210bf6db2b7f4d4deed/ext/js/language/ja/japanese.js#L155
char32_t get_prolonged_hiragana(char32_t prev) {
  switch (kana_to_vowel(prev)) {
    case U'a':
      return U'あ';
    case U'i':
      return U'い';
    case U'u':
      return U'う';
    case U'e':
      return U'え';
    case U'o':
      return U'う';
    default:
      return 0;
  }
}

bool is_in_range(uint32_t c, uint32_t range_start, uint32_t range_end) { return c >= range_start && c <= range_end; }

// https://github.com/yomidevs/yomitan/blob/81d17d877fb18c62ba826210bf6db2b7f4d4deed/ext/js/language/ja/japanese.js#L472
void hiragana_to_katakana(const std::u32string& text, std::u32string& result) {
  result.assign(text);
  const uint32_t offset = (KATAKANA_CONVERSION_RANGE_START - HIRAGANA_CONVERSION_RANGE_START);
  for (char32_t& c : result) {
    if (is_in_range(c, HIRAGANA_CONVERSION_RANGE_START, HIRAGANA_CONVERSION_RANGE_END)) {
      c = static_cast<char32_t>(c + offset);
    }
  }
}

// https://github.com/yomidevs/yomitan/blob/81d17d877fb18c62ba826210bf6db2b7f4d4deed/ext/js/language/ja/japanese.js#L441
void katakana_to_hiragana(const std::u32string& text, std::u32string& result) {
  result.assign(text);
  const uint32_t offset = (HIRAGANA_CONVERSION_RANGE_START - KATAKANA_CONVERSION_RANGE_START);
  for (size_t i = 0; i < result.size(); ++i) {
    char32_t c = result[i];
    switch (c) {
      case KATAKANA_SMALL_KA:
      case KATAKANA_SMALL_KE:
        break;
      case KANA_PROLONGED_SOUND_MARK:
        if (i > 0) {
          const auto prolonged = get_prolonged_hiragana(result[i - 1]);
          if (prolonged != 0) {
            c = prolonged;
          }
        }
        break;
      default:
        if (is_in_range(c, KATAKANA_CONVERSION_RANGE_START, KATAKANA_CONVERSION_RANGE_END)) {
          c = static_cast<char32_t>(c + offset);
        }
        break;
    }
    result[i] = c;
  }
}

bool is_emphatic(char32_t c) {
  return c == HIRAGANA_SMALL_TSU || c == KATAKANA_SMALL_TSU || c == KANA_PROLONGED_SOUND_MARK;
}

// https://github.com/yomidevs/yomitan/blob/81d17d877fb18c62ba826210bf6db2b7f4d4deed/ext/js/language/ja/japanese.js#L776
void collapse_emphatic_sequences(const std::u32string& text, bool full_collapse, std::u32string& result) {
  ptrdiff_t left = 0;
  while (left < static_cast<ptrdiff_t>(text.size()) && is_emphatic(text[left])) {
    ++left;
  }
  ptrdiff_t right = static_cast<ptrdiff_t>(text.size()) - 1;
  while (right >= 0 && is_emphatic(text[right])) {
    --right;
  }
  if (left > right) {
    result = text;
    return;
  }

  result.clear();
  result.reserve(text.size());
  result.append(text, 0, static_cast<size_t>(left));
  auto current_collapsed_code_point = static_cast<char32_t>(-1);

  for (ptrdiff_t i = left; i <= right; ++i) {
    char32_t c = text[i];
    if (is_emphatic(c)) {
      if (current_collapsed_code_point != c) {
        current_collapsed_code_point = c;
        if (!full_collapse) {
          result += c;
          continue;
        }
      }
    } else {
      current_collapsed_code_point = static_cast<char32_t>(-1);
      result += c;
    }
  }

  result.append(text, static_cast<size_t>(right + 1), std::u32string::npos);
}

void nfkc(const std::u32string& text, std::u32string& result) {
  constexpr auto options = static_cast<utf8proc_option_t>(UTF8PROC_STABLE | UTF8PROC_COMPOSE | UTF8PROC_COMPAT);
  static thread_local std::vector<utf8proc_int32_t> buffer;
  buffer.clear();
  int boundclass = UTF8PROC_BOUNDCLASS_START;
  for (char32_t c : text) {
    if (c == 0) {
      break;
    }
    utf8proc_int32_t tmp[32];
    utf8proc_ssize_t n = utf8proc_decompose_char(static_cast<utf8proc_int32_t>(c), tmp, 32, options, &boundclass);
    if (n < 0) {
      result = text;
      return;
    }
    if (n <= 32) {
      buffer.insert(buffer.end(), tmp, tmp + n);
    } else {
      const size_t pos = buffer.size();
      buffer.resize(pos + static_cast<size_t>(n));
      n = utf8proc_decompose_char(static_cast<utf8proc_int32_t>(c), buffer.data() + pos, n, options, &boundclass);
      if (n < 0) {
        result = text;
        return;
      }
    }
  }

  utf8proc_ssize_t len = static_cast<utf8proc_ssize_t>(buffer.size());
  for (utf8proc_ssize_t pos = 0; pos < len - 1;) {
    const utf8proc_int32_t uc1 = buffer[pos];
    const utf8proc_int32_t uc2 = buffer[pos + 1];
    const utf8proc_property_t* p1 = utf8proc_get_property(uc1);
    const utf8proc_property_t* p2 = utf8proc_get_property(uc2);
    if (p1->combining_class > p2->combining_class && p2->combining_class > 0) {
      buffer[pos] = uc2;
      buffer[pos + 1] = uc1;
      if (pos > 0) {
        pos--;
      } else {
        pos++;
      }
    } else {
      pos++;
    }
  }

  len = utf8proc_normalize_utf32(buffer.data(), len, options);
  if (len < 0) {
    result = text;
    return;
  }
  result.assign(buffer.begin(), buffer.begin() + len);
}

// https://github.com/yomidevs/yomitan/blob/3440451aecb23a43f308857969c890a55ce34a91/ext/js/language/ja/japanese.js#L489
void alphanumeric_to_fullwidth(const std::u32string& text, std::u32string& result) {
  result.assign(text);
  for (char32_t& c : result) {
    if (is_in_range(c, U'0', U'9')) {
      c = static_cast<char32_t>(c + (0xff10 - 0x30));
    } else if (is_in_range(c, U'A', U'Z')) {
      c = static_cast<char32_t>(c + (0xff21 - 0x41));
    } else if (is_in_range(c, U'a', U'z')) {
      c = static_cast<char32_t>(c + (0xff41 - 0x61));
    }
  }
}

struct KanjiVariantTable {
  ankerl::unordered_dense::map<char32_t, char32_t> map;
  std::vector<bool> blocks;
};

const KanjiVariantTable& kanji_variant_table() {
  static const KanjiVariantTable table = [] {
    KanjiVariantTable t;
    t.map.reserve(kanji_variants_count);
    t.blocks.assign(0x1100, false);
    for (unsigned i = 0; i < kanji_variants_count; ++i) {
      const char32_t from = kanji_variants[i][0];
      t.map[from] = kanji_variants[i][1];
      t.blocks[from >> 8] = true;
    }
    return t;
  }();
  return table;
}

void standardize_kanji(const std::u32string& text, std::u32string& result) {
  const auto& table = kanji_variant_table();
  result.assign(text);
  for (char32_t& c : result) {
    if (c >= 0x110000 || !table.blocks[c >> 8]) {
      continue;
    }
    auto it = table.map.find(c);
    if (it != table.map.end()) {
      c = it->second;
    }
  }
}

char32_t add_dakuten(char32_t kana) {
  std::u32string pair = {kana, DAKUTEN};
  std::string utf8 = utf8::utf32to8(pair);
  utf8proc_uint8_t* out = utf8proc_NFC(reinterpret_cast<const utf8proc_uint8_t*>(utf8.c_str()));
  if (!out) {
    return kana;
  }
  std::u32string composed = utf8::utf8to32(std::string(reinterpret_cast<char*>(out)));
  utf8proc_free(out);
  return composed.size() == 1 ? composed.front() : kana;
}

char32_t expand_mark(char32_t prev, char32_t mark) {
  switch (mark) {
    case KANJI_ITERATION_MARK:
    case HIRAGANA_ITERATION_MARK:
    case KATAKANA_ITERATION_MARK:
      return prev;
    case HIRAGANA_VOICED_ITERATION_MARK:
    case KATAKANA_VOICED_ITERATION_MARK:
      return add_dakuten(prev);
    default:
      return 0;
  }
}

void expand_iteration_marks(const std::u32string& text, std::u32string& result) {
  result.clear();
  result.reserve(text.size());
  for (size_t i = 0; i < text.size(); ++i) {
    result += text[i];
    if (i + 1 < text.size()) {
      char32_t expanded = expand_mark(text[i], text[i + 1]);
      if (expanded != 0) {
        result += expanded;
        ++i;
      }
    }
  }
}

constexpr std::u32string_view KANJI_NUMBERS = U"〇一二三四五六七八九";
void numbers_to_kanji(const std::u32string& text, std::u32string& result) {
  result.assign(text);
  for (char32_t& c : result) {
    if (is_in_range(c, 0xff10, 0xff19)) {
      c = KANJI_NUMBERS[c - 0xff10];
    }
  }
}

void strip_middle_dots(const std::u32string& text, std::u32string& result) {
  result.clear();
  result.reserve(text.size());
  for (char32_t c : text) {
    if (c != KATAKANA_MIDDLE_DOT) {
      result += c;
    }
  }
}

// The byte offset of the first にゃ (E3 81 AB E3 82 83) at or after pos, or npos.
// It searches from the third byte on: 0xE3 and 0x81 begin most hiragana, so a
// search keyed on them stops at almost every character, while 0xAB is rare.
size_t find_neko(const std::string& text, size_t pos) {
  constexpr std::string_view tail = "\xAB\xE3\x82\x83";
  for (size_t at = text.find(tail, pos + 2); at != std::string::npos; at = text.find(tail, at + 1)) {
    if (text[at - 2] == '\xE3' && text[at - 1] == '\x81') {
      return at - 2;
    }
  }
  return std::string::npos;
}
}  // namespace

namespace hoshidicts::lang::builtins {

void ja_nfkc(const std::u32string& in, std::u32string& out) { nfkc(in, out); }
void ja_katakana_to_hiragana(const std::u32string& in, std::u32string& out) { katakana_to_hiragana(in, out); }
void ja_hiragana_to_katakana(const std::u32string& in, std::u32string& out) { hiragana_to_katakana(in, out); }
void ja_collapse_emphatic(const std::u32string& in, std::u32string& out) { collapse_emphatic_sequences(in, false, out); }
void ja_collapse_emphatic_full(const std::u32string& in, std::u32string& out) { collapse_emphatic_sequences(in, true, out); }
void ja_fullwidth_alphanumeric(const std::u32string& in, std::u32string& out) { alphanumeric_to_fullwidth(in, out); }
void ja_standardize_kanji(const std::u32string& in, std::u32string& out) { standardize_kanji(in, out); }
void ja_expand_iteration_marks(const std::u32string& in, std::u32string& out) { expand_iteration_marks(in, out); }
void ja_kanji_numbers(const std::u32string& in, std::u32string& out) { numbers_to_kanji(in, out); }
void ja_strip_middle_dots(const std::u32string& in, std::u32string& out) { strip_middle_dots(in, out); }

// NekoPara's cat speech says にゃ for な (できにゃい), and also for だ, ら, ま and
// じゃ (ダメにゃって, いにゃっしゃい, わかりにゃした, いいにゃない). Each にゃ is
// replaced, one at a time, by each of them, in that order, as
// Deinflector::deinflect_neko_speech did at 35e2dab.
void ja_neko_speech(const std::string& text, std::vector<std::string>& out) {
  constexpr std::string_view neko = "にゃ";
  constexpr std::array<std::string_view, 5> neko_replacements = {"な", "だ", "ら", "ま", "じゃ"};
  for (size_t pos = find_neko(text, 0); pos != std::string::npos; pos = find_neko(text, pos + neko.size())) {
    for (const auto replacement : neko_replacements) {
      std::string normalized;
      normalized.reserve(text.size() - neko.size() + replacement.size());
      normalized.append(text, 0, pos).append(replacement).append(text, pos + neko.size());
      out.push_back(std::move(normalized));
    }
  }
}

}  // namespace hoshidicts::lang::builtins
