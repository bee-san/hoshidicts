// SPDX-License-Identifier: GPL-3.0-or-later
// Text processors and steps (docs/languages.md, section 6).
#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "builtins/builtins.hpp"
#include "classes.hpp"
#include "regex.hpp"
#include "unicode.hpp"

namespace hoshidicts::lang {

enum class StepKind : unsigned char { Case, Normalize, Strip, Map, Pattern, Alternatives, Builtin };
enum class CaseMode : unsigned char { Lower, Upper, UpperFirst, LowerFirst };
enum class MapAt : unsigned char { All, First, Last, Start, End };

struct Step {
  StepKind kind = StepKind::Builtin;
  CaseMode case_mode = CaseMode::Lower;
  NormalForm form = NormalForm::NFC;
  bool has_within = false;
  CharClass chars;  // normalize's `within`, strip's class
  // map and alternatives keys, longest first (then in code point order)
  std::vector<std::pair<std::u32string, std::u32string>> map;
  MapAt at = MapAt::All;
  std::vector<std::pair<std::u32string, std::vector<std::u32string>>> alternatives;
  size_t limit = 4096;
  std::shared_ptr<const Pattern> pattern;
  bool repeat = false;
  TextFunction builtin = nullptr;
};

using StepList = std::vector<Step>;

// The longest text a pack writes literally (sections 6.2 and 7.3): a rule's
// affixes and the texts that replace them, a map value, an alternative, a
// pattern's replacement. The parser refuses longer ones.
inline constexpr size_t max_literal_code_points = 64;

// What a step list may write (sections 6.2 and 7.4): a list stops once its
// text has more than `max_code_points`; `written` adds up the code points of
// every step's output (of every round of a repeated pattern), and `read` the
// code points every `pattern` step's regular expression read (every round).
struct StepLimit {
  size_t max_code_points = SIZE_MAX;
  size_t written = 0;
  size_t read = 0;
};

// The longest text a step list may make from a text of `n` code points.
constexpr size_t step_limit(size_t n) { return 16 * (n + 32); }

// Applies one step that yields one text (every kind but alternatives).
void apply_step(const Step& step, const std::u32string& in, std::u32string& out);
// The same within `limit`: false when the output has more code points than
// it allows (for a repeated pattern, the text of the round that passed it).
bool apply_step(const Step& step, const std::u32string& in, std::u32string& out, StepLimit& limit);
// Applies a step list, appending its outputs (one unless it has alternatives).
void apply_steps(const StepList& steps, const std::u32string& in, std::vector<std::u32string>& out);
// The same within `limit`: an output that would pass it is `in` instead, as
// if the list had not changed the text.
void apply_steps(const StepList& steps, const std::u32string& in, std::vector<std::u32string>& out, StepLimit& limit);
// Applies a step list that has no alternatives.
void apply_single(const StepList& steps, const std::u32string& in, std::u32string& out);
// The same within `limit`: false when a step's output passes it, with `out`
// that output; the later steps do not run.
bool apply_single(const StepList& steps, const std::u32string& in, std::u32string& out, StepLimit& limit);

struct Processor {
  std::string id;
  std::string name;
  bool keep_input = true;
  bool optional = false;
  std::vector<StepList> variants;
  // When every variant is one builtin step (the Japanese processors), those
  // builtins, so process_text calls them directly; empty otherwise. Set by
  // finish().
  std::vector<TextFunction> builtins;

  void finish() {
    builtins.clear();
    for (const auto& steps : variants) {
      if (steps.size() != 1 || steps[0].kind != StepKind::Builtin) {
        builtins.clear();
        return;
      }
      builtins.push_back(steps[0].builtin);
    }
  }
};

// A processed text and the number of processors that changed it.
struct TextVariant {
  std::string text;
  int steps;
};

inline constexpr size_t max_text_variants = 4096;

// Ids a request enabled (optional processors, transforms, variant passes).
struct EnabledOptions {
  std::span<const std::string> ids;
  bool contains(std::string_view id) const {
    for (const auto& x : ids) {
      if (x == id) return true;
    }
    return false;
  }
};

// The variants of section 6.1, sorted by code points. `limit_reached` is set
// when an input reached max_text_variants.
std::vector<TextVariant> process_text(std::span<const Processor> processors, std::string_view input,
                                      const EnabledOptions& enabled, bool* limit_reached = nullptr);
// The same on code points, for chaining (postprocessors).
void process_text32(std::span<const Processor> processors, const std::u32string& input, const EnabledOptions& enabled,
                    std::vector<std::pair<std::u32string, int>>& out, bool* limit_reached = nullptr);

}  // namespace hoshidicts::lang
