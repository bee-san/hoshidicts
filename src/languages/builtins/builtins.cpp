// SPDX-License-Identifier: GPL-3.0-or-later
// The table of builtins (docs/languages.md, section 6.3).
#include <algorithm>
#include <array>

#include "builtins.hpp"

namespace hoshidicts::lang {

namespace {
constexpr std::array<TextBuiltin, 14> text_table = {{
    {"ja.nfkc", builtins::ja_nfkc},
    {"ja.katakanaToHiragana", builtins::ja_katakana_to_hiragana},
    {"ja.hiraganaToKatakana", builtins::ja_hiragana_to_katakana},
    {"ja.collapseEmphatic", builtins::ja_collapse_emphatic},
    {"ja.collapseEmphaticFull", builtins::ja_collapse_emphatic_full},
    {"ja.fullwidthAlphanumeric", builtins::ja_fullwidth_alphanumeric},
    {"ja.standardizeKanji", builtins::ja_standardize_kanji},
    {"ja.expandIterationMarks", builtins::ja_expand_iteration_marks},
    {"ja.kanjiNumbers", builtins::ja_kanji_numbers},
    {"ja.stripMiddleDots", builtins::ja_strip_middle_dots},
    {"hangul.disassemble", builtins::hangul_disassemble},
    {"hangul.assemble", builtins::hangul_assemble},
    {"vi.toneMarksOld", builtins::vi_tone_marks_old},
    {"vi.toneMarksNew", builtins::vi_tone_marks_new},
}};

constexpr std::array<PassBuiltin, 1> pass_table = {{
    {"ja.nekoSpeech", "neko speech", "NekoPara-style にゃ substitution.", builtins::ja_neko_speech},
}};
}  // namespace

const TextBuiltin* find_text_builtin(std::string_view name) {
  const auto it = std::ranges::find(text_table, name, &TextBuiltin::name);
  return it == text_table.end() ? nullptr : &*it;
}

const PassBuiltin* find_pass_builtin(std::string_view name) {
  const auto it = std::ranges::find(pass_table, name, &PassBuiltin::name);
  return it == pass_table.end() ? nullptr : &*it;
}

std::span<const TextBuiltin> text_builtins() { return text_table; }
std::span<const PassBuiltin> pass_builtins() { return pass_table; }

}  // namespace hoshidicts::lang
