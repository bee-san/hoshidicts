// SPDX-License-Identifier: GPL-3.0-or-later
#include "case_mapping.hpp"

#include <utf8proc.h>

#include <algorithm>

namespace hoshidicts::lang {

namespace {
const case_tables::SpecialCase* find_special(const case_tables::SpecialCase* table, size_t count, char32_t c) {
  const auto* end = table + count;
  const auto* it = std::lower_bound(table, end, c, [](const case_tables::SpecialCase& s, char32_t v) { return s.cp < v; });
  return it != end && it->cp == c ? it : nullptr;
}

bool in_ranges(const case_tables::CaseRange* table, size_t count, char32_t c) {
  const auto* end = table + count;
  const auto* it = std::lower_bound(table, end, c, [](const case_tables::CaseRange& r, char32_t v) { return r.last < v; });
  return it != end && it->first <= c;
}

bool is_cased(char32_t c) { return in_ranges(case_tables::cased, case_tables::cased_count, c); }
bool is_case_ignorable(char32_t c) { return in_ranges(case_tables::case_ignorable, case_tables::case_ignorable_count, c); }

// Unicode's Final_Sigma condition for the Σ at `i`: a cased letter before it
// (case-ignorable characters between), and none after it.
bool final_sigma(const std::u32string& text, size_t i) {
  bool before = false;
  for (size_t k = i; k > 0; --k) {
    const char32_t c = text[k - 1];
    if (is_case_ignorable(c)) continue;
    before = is_cased(c);
    break;
  }
  if (!before) return false;
  for (size_t k = i + 1; k < text.size(); ++k) {
    const char32_t c = text[k];
    if (is_case_ignorable(c)) continue;
    return !is_cased(c);
  }
  return true;
}

void append_lower(char32_t c, std::u32string& out) {
  if (const auto* s = find_special(case_tables::lower_special, case_tables::lower_special_count, c)) {
    out.append(s->out, s->length);
    return;
  }
  out.push_back(static_cast<char32_t>(utf8proc_tolower(static_cast<utf8proc_int32_t>(c))));
}

void append_upper(char32_t c, std::u32string& out) {
  if (const auto* s = find_special(case_tables::upper_special, case_tables::upper_special_count, c)) {
    out.append(s->out, s->length);
    return;
  }
  out.push_back(static_cast<char32_t>(utf8proc_toupper(static_cast<utf8proc_int32_t>(c))));
}
}  // namespace

void to_lower(const std::u32string& text, std::u32string& out) {
  out.clear();
  out.reserve(text.size());
  for (size_t i = 0; i < text.size(); ++i) {
    const char32_t c = text[i];
    if (c == 0x03A3 && final_sigma(text, i)) {
      out.push_back(0x03C2);
    } else {
      append_lower(c, out);
    }
  }
}

void to_upper(const std::u32string& text, std::u32string& out) {
  out.clear();
  out.reserve(text.size());
  for (char32_t c : text) {
    append_upper(c, out);
  }
}

void lower_first(const std::u32string& text, std::u32string& out) {
  out.clear();
  if (text.empty()) return;
  append_lower(text[0], out);
  out.append(text, 1);
}

void upper_first(const std::u32string& text, std::u32string& out) {
  out.clear();
  if (text.empty()) return;
  append_upper(text[0], out);
  out.append(text, 1);
}

}  // namespace hoshidicts::lang
