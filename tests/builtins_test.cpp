// SPDX-License-Identifier: GPL-3.0-or-later
// The builtins of docs/languages.md section 6.3 against the code they port.
// The Hangul and Vietnamese vectors were computed with that code: hangul-js
// 0.2.6 (Hangul.disassemble(s, false).join(''), Hangul.assemble(s) and
// Hangul.assemble of the disassembly) and Yomitan d3c54c1's
// normalizeDiacritics (ext/js/language/vi/viet-text-preprocessors.js: the
// old-style and new-style outputs). The Japanese builtins are proved against
// 35e2dab's processors by ja-process-parity; here each is checked on a few
// texts.
#include <cstdio>
#include <string>
#include <string_view>
#include <vector>

#include "languages/builtins/builtins.hpp"
#include "languages/classes.hpp"

namespace {
int failures = 0;

std::u32string decode(std::u8string_view s) {
  std::u32string out;
  hoshidicts::lang::decode_utf8(std::string_view(reinterpret_cast<const char*>(s.data()), s.size()), out);
  return out;
}

std::string encode(const std::u32string& s) { return hoshidicts::lang::to_utf8(s); }

void check(std::string_view builtin, std::u8string_view input, std::u8string_view expected) {
  const auto* b = hoshidicts::lang::find_text_builtin(builtin);
  if (b == nullptr) {
    ++failures;
    std::fprintf(stderr, "FAIL: no builtin %.*s\n", static_cast<int>(builtin.size()), builtin.data());
    return;
  }
  std::u32string out;
  b->apply(decode(input), out);
  if (out != decode(expected)) {
    ++failures;
    const std::string in8(reinterpret_cast<const char*>(input.data()), input.size());
    const std::string want(reinterpret_cast<const char*>(expected.data()), expected.size());
    std::fprintf(stderr, "FAIL %.*s(%s) = %s, expected %s\n", static_cast<int>(builtin.size()), builtin.data(),
                 in8.c_str(), encode(out).c_str(), want.c_str());
  }
}

struct HangulCase {
  std::u8string_view input, disassembled, assembled, reassembled;
};
const HangulCase hangul_cases[] = {
    {u8"\U0000D55C\U0000AD6D\U0000C5B4", u8"\U0000314E\U0000314F\U00003134\U00003131\U0000315C\U00003131\U00003147\U00003153", u8"\U0000D55C\U0000AD6D\U0000C5B4", u8"\U0000D55C\U0000AD6D\U0000C5B4"},
    {u8"\U0000D559\U0000AD50\U0000C5D0\U0000C11C", u8"\U0000314E\U0000314F\U00003131\U00003131\U0000315B\U00003147\U00003154\U00003145\U00003153", u8"\U0000D559\U0000AD50\U0000C5D0\U0000C11C", u8"\U0000D559\U0000AD50\U0000C5D0\U0000C11C"},
    {u8"\U0000B2ED", u8"\U00003137\U0000314F\U00003139\U00003131", u8"\U0000B2ED", u8"\U0000B2ED"},
    {u8"\U0000C77D\U0000C5C8\U0000B2E4", u8"\U00003147\U00003163\U00003139\U00003131\U00003147\U00003153\U00003146\U00003137\U0000314F", u8"\U0000C77D\U0000C5C8\U0000B2E4", u8"\U0000C77D\U0000C5C8\U0000B2E4"},
    {u8"\U00003131\U0000314F", u8"\U00003131\U0000314F", u8"\U0000AC00", u8"\U0000AC00"},
    {u8"\U00003158", u8"\U00003157\U0000314F", u8"\U00003158", u8"\U00003158"},
    {u8"\U0000C758\U0000C0AC", u8"\U00003147\U00003161\U00003163\U00003145\U0000314F", u8"\U0000C758\U0000C0AC", u8"\U0000C758\U0000C0AC"},
    {u8"\U0000AD1C\U0000CC2E\U0000C544", u8"\U00003131\U00003157\U00003150\U00003134\U0000314A\U0000314F\U00003134\U0000314E\U00003147\U0000314F", u8"\U0000AD1C\U0000CC2E\U0000C544", u8"\U0000AD1C\U0000CC2E\U0000C544"},
    {u8"\U0000AC12", u8"\U00003131\U0000314F\U00003142\U00003145", u8"\U0000AC12", u8"\U0000AC12"},
    {u8"\U0000C549\U0000B2E4", u8"\U00003147\U0000314F\U00003134\U00003148\U00003137\U0000314F", u8"\U0000C549\U0000B2E4", u8"\U0000C549\U0000B2E4"},
    {u8"abc\U0000D55C\U0000AE00", u8"abc\U0000314E\U0000314F\U00003134\U00003131\U00003161\U00003139", u8"abc\U0000D55C\U0000AE00", u8"abc\U0000D55C\U0000AE00"},
    {u8"\U00003133", u8"\U00003131\U00003145", u8"\U00003133", u8"\U00003133"},
    {u8"\U00003131\U00003145\U0000314F", u8"\U00003131\U00003145\U0000314F", u8"\U00003131\U0000C0AC", u8"\U00003131\U0000C0AC"},
    {u8"\U00003142\U00003145\U00003147\U00003163", u8"\U00003142\U00003145\U00003147\U00003163", u8"\U00003144\U0000C774", u8"\U00003144\U0000C774"},
    {u8"\U0000BDC1", u8"\U00003142\U0000315C\U00003154\U00003139\U00003131", u8"\U0000BDC1", u8"\U0000BDC1"},
    {u8"\U0000C00D", u8"\U00003143\U0000315C\U00003154\U00003139\U00003131", u8"\U0000C00D", u8"\U0000C00D"},
    {u8"\U00003147\U00003157\U0000314F\U00003147", u8"\U00003147\U00003157\U0000314F\U00003147", u8"\U0000C655", u8"\U0000C655"},
    {u8"\U00003139\U00003131\U00003131", u8"\U00003139\U00003131\U00003131", u8"\U0000313A\U00003131", u8"\U0000313A\U00003131"},
    {u8"\U0000AC00\U0000314F", u8"\U00003131\U0000314F\U0000314F", u8"\U0000AC00\U0000314F", u8"\U0000AC00\U0000314F"},
    {u8"\U0000314F\U0000314F", u8"\U0000314F\U0000314F", u8"\U0000314F\U0000314F", u8"\U0000314F\U0000314F"},
    {u8"\U00003157\U00003150\U00003157", u8"\U00003157\U00003150\U00003157", u8"\U00003159\U00003157", u8"\U00003159\U00003157"},
    {u8"\U0000C0B6\U0000C740", u8"\U00003145\U0000314F\U00003139\U00003141\U00003147\U00003161\U00003134", u8"\U0000C0B6\U0000C740", u8"\U0000C0B6\U0000C740"},
    {u8"\U0000D759\U0000D0D5\U0000BB3C", u8"\U0000314E\U00003161\U00003139\U00003131\U0000314C\U0000314F\U00003147\U00003141\U0000315C\U00003139", u8"\U0000D759\U0000D0D5\U0000BB3C", u8"\U0000D759\U0000D0D5\U0000BB3C"},
    {u8"\U0001F600\U0000D55C", u8"\U0001F600\U0000314E\U0000314F\U00003134", u8"\U0001F600\U0000D55C", u8"\U0001F600\U0000D55C"},
    {u8"\U00003132\U0000314F\U00003131\U00003131", u8"\U00003132\U0000314F\U00003131\U00003131", u8"\U0000AE4D\U00003131", u8"\U0000AE4D\U00003131"},
    {u8"\U0000AC02", u8"\U00003131\U0000314F\U00003132", u8"\U0000AC02", u8"\U0000AC02"},
    {u8"", u8"", u8"", u8""},
};

struct VietCase {
  std::u8string_view input, old_style, new_style;
};
const VietCase viet_cases[] = {
    {u8"ho\U000000E0", u8"h\U000000F2a", u8"ho\U000000E0"},
    {u8"h\U000000F2a", u8"h\U000000F2a", u8"ho\U000000E0"},
    {u8"thu\U00001EF7", u8"th\U00001EE7y", u8"thu\U00001EF7"},
    {u8"th\U00001EE7y", u8"th\U00001EE7y", u8"thu\U00001EF7"},
    {u8"qu\U00001EA3", u8"qu\U00001EA3", u8"qu\U00001EA3"},
    {u8"gi\U00001ECFi", u8"gi\U00001ECFi", u8"gi\U00001ECFi"},
    {u8"ng\U000001B0\U00001EDDi", u8"ng\U000001B0\U00001EDDi", u8"ng\U000001B0\U00001EDDi"},
    {u8"Ho\U000000E0", u8"H\U000000F2a", u8"Ho\U000000E0"},
    {u8"HO\U000000C0", u8"H\U000000D2A", u8"HO\U000000C0"},
    {u8"kho\U00001EBB", u8"kh\U00001ECFe", u8"kho\U00001EBB"},
    {u8"kh\U00001ECFe", u8"kh\U00001ECFe", u8"kho\U00001EBB"},
    {u8"c\U00001EE7a", u8"c\U00001EE7a", u8"c\U00001EE7a"},
    {u8"ti\U00001EBFng Vi\U00001EC7t", u8"ti\U00001EBFng Vi\U00001EC7t", u8"ti\U00001EBFng Vi\U00001EC7t"},
    {u8"l\U00001EF1a", u8"l\U00001EF1a", u8"l\U00001EF1a"},
    {u8"m\U000000F9a", u8"m\U000000F9a", u8"m\U000000F9a"},
    {u8"qu\U000000FD", u8"qu\U000000FD", u8"qu\U000000FD"},
    {u8"g\U000000EC", u8"g\U000000EC", u8"g\U000000EC"},
    {u8"o\U000000E0", u8"\U000000F2a", u8"o\U000000E0"},
    {u8"u\U00001EF7", u8"\U00001EE7y", u8"u\U00001EF7"},
    {u8"ho\U000000E1 h\U00001ECDc", u8"h\U000000F3a h\U00001ECDc", u8"ho\U000000E1 h\U00001ECDc"},
    {u8"Thu\U000000FD", u8"Th\U000000FAy", u8"Thu\U000000FD"},
    {u8"tu\U00001EF3", u8"t\U000000F9y", u8"tu\U00001EF3"},
    {u8"qu\U00001EA1", u8"qu\U00001EA1", u8"qu\U00001EA1"},
    {u8"q\U00001EE7a", u8"qu\U00001EA3", u8"qu\U00001EA3"},
    {u8"g\U00001EC9a", u8"gi\U00001EA3", u8"gi\U00001EA3"},
    {u8"n\U000001B0\U00001EDBc", u8"n\U000001B0\U00001EDBc", u8"n\U000001B0\U00001EDBc"},
    {u8"vi\U00001EBFt", u8"vi\U00001EBFt", u8"vi\U00001EBFt"},
    {u8"h\U00001ECFi", u8"h\U00001ECFi", u8"h\U00001ECFi"},
    {u8"abc", u8"abc", u8"abc"},
    {u8"o\U000000E11", u8"o\U000000E11", u8"o\U000000E11"},
    {u8"o\U000000E1_", u8"o\U000000E1_", u8"o\U000000E1_"},
    {u8"xo\U000000E8", u8"x\U000000F2e", u8"xo\U000000E8"},
};
}  // namespace

int main() {
  size_t cases = 0;
  for (const auto& c : hangul_cases) {
    check("hangul.disassemble", c.input, c.disassembled);
    check("hangul.assemble", c.input, c.assembled);
    check("hangul.assemble", c.disassembled, c.reassembled);
    cases += 3;
  }
  for (const auto& c : viet_cases) {
    check("vi.toneMarksOld", c.input, c.old_style);
    check("vi.toneMarksNew", c.input, c.new_style);
    cases += 2;
  }
  // Japanese: one or two texts each (ja-process-parity runs them on the corpus).
  const struct {
    std::string_view builtin;
    std::u8string_view input, expected;
  } japanese[] = {
      {"ja.nfkc", u8"ｶﾀｶﾅ①", u8"カタカナ1"},
      {"ja.katakanaToHiragana", u8"カーテン", u8"かあてん"},
      {"ja.hiraganaToKatakana", u8"たべる", u8"タベル"},
      {"ja.collapseEmphatic", u8"すっっごい", u8"すっごい"},
      {"ja.collapseEmphaticFull", u8"すっっごい", u8"すごい"},
      {"ja.fullwidthAlphanumeric", u8"abc123", u8"ａｂｃ１２３"},
      {"ja.standardizeKanji", u8"\u2F49", u8"月"},
      {"ja.expandIterationMarks", u8"時々", u8"時時"},
      {"ja.expandIterationMarks", u8"いすゞ", u8"いすず"},
      {"ja.kanjiNumbers", u8"１２", u8"一二"},
      {"ja.stripMiddleDots", u8"ア・イ", u8"アイ"},
  };
  for (const auto& c : japanese) {
    check(c.builtin, c.input, c.expected);
    ++cases;
  }
  // The variant pass: each にゃ, one at a time, as な, だ, ら, ま, じゃ.
  {
    const auto* pass = hoshidicts::lang::find_pass_builtin("ja.nekoSpeech");
    std::vector<std::string> readings;
    pass->variants("にゃにゃ", readings);
    const std::vector<std::string> expected = {"なにゃ", "だにゃ", "らにゃ", "まにゃ", "じゃにゃ",
                                               "にゃな", "にゃだ", "にゃら", "にゃま", "にゃじゃ"};
    ++cases;
    if (readings != expected) {
      ++failures;
      std::fprintf(stderr, "FAIL ja.nekoSpeech(にゃにゃ)\n");
    }
    readings.clear();
    pass->variants("カゃ", readings);
    ++cases;
    if (!readings.empty()) {
      ++failures;
      std::fprintf(stderr, "FAIL ja.nekoSpeech(カゃ) is not empty\n");
    }
  }
  // Every builtin of the table is known.
  for (const char* name : {"ja.nfkc", "ja.katakanaToHiragana", "ja.hiraganaToKatakana", "ja.collapseEmphatic",
                           "ja.collapseEmphaticFull", "ja.fullwidthAlphanumeric", "ja.standardizeKanji",
                           "ja.expandIterationMarks", "ja.kanjiNumbers", "ja.stripMiddleDots", "hangul.disassemble",
                           "hangul.assemble", "vi.toneMarksOld", "vi.toneMarksNew"}) {
    ++cases;
    if (hoshidicts::lang::find_text_builtin(name) == nullptr) {
      ++failures;
      std::fprintf(stderr, "FAIL: %s is missing\n", name);
    }
  }
  std::printf("%zu cases, %d failures\n", cases, failures);
  return failures == 0 ? 0 : 1;
}
