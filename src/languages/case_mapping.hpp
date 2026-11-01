// SPDX-License-Identifier: GPL-3.0-or-later
// The `case` step (docs/languages.md, section 6.2): JavaScript's toLowerCase
// and toUpperCase, as utf8proc's simple mappings plus the entries of
// case_tables.cpp (generated from Node by generate_case_tables.mjs).
#pragma once

#include <cstddef>
#include <string>

namespace hoshidicts::lang {

namespace case_tables {
struct SpecialCase {
  char32_t cp;
  char32_t out[3];
  unsigned char length;
};
struct CaseRange {
  char32_t first;
  char32_t last;
};
extern const SpecialCase lower_special[];
extern const size_t lower_special_count;
extern const SpecialCase upper_special[];
extern const size_t upper_special_count;
extern const CaseRange cased[];
extern const size_t cased_count;
extern const CaseRange case_ignorable[];
extern const size_t case_ignorable_count;
}  // namespace case_tables

// Appends c's full lowercase (uppercase) mapping to out. `lower_case` applies
// Final_Sigma with the context of `text` at `index`.
void to_lower(const std::u32string& text, std::u32string& out);
void to_upper(const std::u32string& text, std::u32string& out);
// The first code point alone, as String.fromCodePoint(cp).toLowerCase() gives it.
void lower_first(const std::u32string& text, std::u32string& out);
void upper_first(const std::u32string& text, std::u32string& out);

}  // namespace hoshidicts::lang
