// SPDX-License-Identifier: GPL-3.0-or-later
// Text processors and steps (docs/languages.md, section 6).
#pragma once

#include <cstddef>
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

// Applies one step that yields one text (every kind but alternatives).
void apply_step(const Step& step, const std::u32string& in, std::u32string& out);
// Applies a step list, appending its outputs (one unless it has alternatives).
void apply_steps(const StepList& steps, const std::u32string& in, std::vector<std::u32string>& out);
// Applies a step list that has no alternatives.
void apply_single(const StepList& steps, const std::u32string& in, std::u32string& out);

struct Processor {
  std::string id;
  std::string name;
  bool keep_input = true;
  bool optional = false;
  std::vector<StepList> variants;
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
