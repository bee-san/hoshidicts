// SPDX-License-Identifier: GPL-3.0-or-later
// Builtins: the only code a language pack can name (docs/languages.md,
// section 6.3). Each is small, deterministic and tested in the engine
// (tests/builtins_test.cpp). A new builtin is a framework change: it needs an
// issue, a pull request to this directory with tests, and an entry in the
// contract's table.
#pragma once

#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace hoshidicts::lang {

// A text builtin, usable as a step: `out` receives the result for `in`.
using TextFunction = void (*)(const std::u32string& in, std::u32string& out);

struct TextBuiltin {
  std::string_view name;
  TextFunction apply;
};

// A variant pass (`lookup.variantPasses`): the texts a pass reads a text as,
// each deinflected with the pass as the first trace step.
struct PassBuiltin {
  std::string_view name;
  std::string_view trace_name;
  std::string_view trace_description;
  // Appends the readings of `text`, in order; none when the pass does not apply.
  void (*variants)(const std::string& text, std::vector<std::string>& out);
};

const TextBuiltin* find_text_builtin(std::string_view name);
const PassBuiltin* find_pass_builtin(std::string_view name);
std::span<const TextBuiltin> text_builtins();
std::span<const PassBuiltin> pass_builtins();

namespace builtins {
// Japanese (src/languages/builtins/japanese.cpp): today's text processors.
void ja_nfkc(const std::u32string& in, std::u32string& out);
void ja_katakana_to_hiragana(const std::u32string& in, std::u32string& out);
void ja_hiragana_to_katakana(const std::u32string& in, std::u32string& out);
void ja_collapse_emphatic(const std::u32string& in, std::u32string& out);
void ja_collapse_emphatic_full(const std::u32string& in, std::u32string& out);
void ja_fullwidth_alphanumeric(const std::u32string& in, std::u32string& out);
void ja_standardize_kanji(const std::u32string& in, std::u32string& out);
void ja_expand_iteration_marks(const std::u32string& in, std::u32string& out);
void ja_kanji_numbers(const std::u32string& in, std::u32string& out);
void ja_strip_middle_dots(const std::u32string& in, std::u32string& out);
void ja_neko_speech(const std::string& text, std::vector<std::string>& out);

// Korean (hangul.cpp): hangul-js 0.2.6's disassemble(str, false).join('')
// and assemble(str).
void hangul_disassemble(const std::u32string& in, std::u32string& out);
void hangul_assemble(const std::u32string& in, std::u32string& out);

// Vietnamese (vietnamese.cpp): Yomitan's normalizeDiacritics, old and new
// tone placement.
void vi_tone_marks_old(const std::u32string& in, std::u32string& out);
void vi_tone_marks_new(const std::u32string& in, std::u32string& out);
}  // namespace builtins

}  // namespace hoshidicts::lang
