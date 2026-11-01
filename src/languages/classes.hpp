// SPDX-License-Identifier: GPL-3.0-or-later
// Character classes of language packs (docs/languages.md, section 5).
#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace hoshidicts::lang {

struct CodePointRange {
  char32_t first;
  char32_t last;
  bool operator==(const CodePointRange&) const = default;
};

// A set of code points, as sorted, merged ranges without surrogates.
class CharClass {
 public:
  CharClass() = default;
  // `ranges` in any order; they are sorted and merged, and surrogates removed.
  explicit CharClass(std::vector<CodePointRange> ranges);

  bool contains(char32_t c) const {
    if (c < 0x80) {
      return (ascii_[c >> 6] >> (c & 63)) & 1;
    }
    size_t lo = 0;
    size_t hi = ranges_.size();
    while (lo < hi) {
      const size_t mid = lo + (hi - lo) / 2;
      if (ranges_[mid].last < c) {
        lo = mid + 1;
      } else if (ranges_[mid].first > c) {
        hi = mid;
      } else {
        return true;
      }
    }
    return false;
  }
  const std::vector<CodePointRange>& ranges() const { return ranges_; }
  bool empty() const { return ranges_.empty(); }
  // The largest member, or 0 for an empty class.
  char32_t max() const { return ranges_.empty() ? 0 : ranges_.back().last; }

  // Everything but the members, over all code points without surrogates.
  CharClass complement() const;
  static CharClass unite(const std::vector<const CharClass*>& classes);

 private:
  std::vector<CodePointRange> ranges_;
  uint64_t ascii_[2] = {0, 0};
};

// The members of a Unicode general category (`L`, `Lu`, ...), from utf8proc;
// nullptr for a name that is not one of the 7 one-letter and 30 two-letter
// categories.
const CharClass* general_category(std::string_view name);

// Parses a class field: one bracket expression or one bare reference
// `{name}` (the exact syntax of tools/lib/classes.mjs). `resolve` returns the
// class a reference names, or nullptr after setting `error` (an undefined
// name, a cycle). On a syntax error sets `error` and returns nullopt.
using ClassResolver = std::function<const CharClass*(std::string_view name, std::string* error)>;
std::optional<CharClass> parse_class(std::string_view source, const ClassResolver& resolve, std::string* error);

// The names a class field refers to, in order (empty on a syntax error).
std::vector<std::string> class_references(std::string_view source);

bool is_class_name(std::string_view name);

// UTF-8 to code points; returns false on invalid UTF-8.
bool decode_utf8(std::string_view text, std::u32string& out);
void append_utf8(std::string& out, char32_t c);
std::string to_utf8(std::u32string_view text);

}  // namespace hoshidicts::lang
