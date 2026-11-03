// SPDX-License-Identifier: GPL-3.0-or-later
// The `pattern` dialect of language packs (docs/languages.md, section 7.6):
// a small regular-expression grammar that std::wregex, fed one UTF-16 code
// unit per wchar_t, and JavaScript without the `u` flag read the same way.
// The checks are those of tools/lib/classes.mjs (parsePattern and
// checkReplacement), so a pattern either implementation accepts the other
// accepts too.
#pragma once

#include <memory>
#include <regex>
#include <string>
#include <string_view>
#include <vector>

#include "classes.hpp"

namespace hoshidicts::lang {

// Resolves a `{name}` reference of a pattern to the class it names, or
// nullptr when the pack has no such class.
using PatternClassLookup = std::function<const CharClass*(std::string_view name)>;

class Pattern {
 public:
  // Checks `pattern` against the dialect, expands its references, and
  // compiles it. `replacement` is checked against the pattern's groups.
  // Returns nullptr and sets `error` on any problem.
  static std::unique_ptr<Pattern> compile(std::string_view pattern, std::string_view replacement, bool global,
                                          const PatternClassLookup& classes, std::string* error);

  // Whether the pattern matches somewhere in `text` (UTF-8).
  bool search(std::string_view text) const;
  // `text` with the first match (every match when global) replaced. Returns
  // false when nothing matched.
  bool replace(std::string_view text, std::string& out) const;

  const std::string& source() const { return source_; }
  // The source with references expanded, as JavaScript reads it without `u`.
  const std::string& expanded() const { return expanded_; }

 private:
  std::string source_;
  std::string expanded_;
  std::wregex regex_;
  std::wstring replacement_;
  bool global_ = false;
};

// UTF-8 <-> one UTF-16 code unit per wchar_t. Lone surrogates, which a match
// can leave by splitting a pair, become U+FFFD.
std::wstring to_utf16_units(std::string_view utf8);
std::string from_utf16_units(std::wstring_view units);

}  // namespace hoshidicts::lang
