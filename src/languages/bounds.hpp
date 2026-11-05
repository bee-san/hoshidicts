// SPDX-License-Identifier: GPL-3.0-or-later
// The bounds of the deinflection search and the work budget a lookup shares
// with its searches and processors (docs/languages.md, section 7.4).
#pragma once

#include <cstddef>
#include <cstdint>
#include <string_view>

namespace hoshidicts::lang {

// The bounds of one deinflection search. An output with more than
// `max_growth` code points beyond the text the search starts from, or one
// that would be rule `max_depth + 1` of its chain, is neither recorded nor
// expanded, and a search stops when it holds `max_results` deinflections, its
// text included.
//
// Work is counted in units of a SearchBudget of `max_work`:
// - a rule application tried costs a unit, plus one per `work_bytes` bytes it
//   writes (its output, and each step of its `then` list at 4 bytes a code
//   point) and one per code point a regular expression reads;
// - a step list or builtin a processor applies costs the same;
// - each variant a processor keeps, and each reading a variant pass makes,
//   costs text_units: a unit, plus one per `work_bytes` bytes of it (4 a
//   code point);
// - deciding whether an optional processor is on, on or off, counts as
//   operations: it looks the processor's id up in the request's options;
// - a text a lookup looks up in its dictionaries costs a unit;
// - everything else a search or a processor does in proportion to the size of
//   a text or of a pack (rules skipped by their conditions, trie edges, stem
//   change candidates, the cycle check, scans of a text, map keys tried)
//   counts as operations, `ops_per_unit` to a unit.
struct SearchBounds {
  static constexpr size_t max_growth = 32;
  static constexpr uint32_t max_depth = 128;
  static constexpr size_t max_results = 65536;
  static constexpr size_t max_work = size_t{1} << 20;
  static constexpr size_t work_bytes = 256;
  static constexpr size_t ops_per_unit = 64;
};

// The units a text of `code_points` costs when a processor keeps it or a
// variant pass makes it (section 7.4).
constexpr size_t text_units(size_t code_points) { return 1 + 4 * code_points / SearchBounds::work_bytes; }
// The same for a UTF-8 text.
inline size_t text_units(std::string_view utf8) {
  size_t n = 0;
  for (unsigned char c : utf8) n += (c & 0xC0) != 0x80;
  return text_units(n);
}

// The work left to what shares it (section 7.4). A lookup gives all of its
// searches, processors and variant passes one budget, so that it ends within
// SearchBounds::max_work units whatever number of prefixes, processed
// variants and variant pass readings it searches; a search given none has
// one of its own. A search that finds the budget spent records its text and
// nothing more, processors that find it spent stop, the variants they have
// being the result, and variant passes make no more readings.
struct SearchBudget {
  size_t work_left = SearchBounds::max_work;
  size_t ops = 0;  // operations not yet charged, fewer than ops_per_unit

  bool spent() const { return work_left == 0; }
  size_t used() const { return SearchBounds::max_work - work_left; }
  void spend(size_t units) { work_left -= units < work_left ? units : work_left; }
  // Counts `n` operations, charging a unit for every ops_per_unit of them;
  // returns the units it charged.
  size_t add_ops(size_t n) {
    ops += n;
    if (ops < SearchBounds::ops_per_unit) return 0;
    const size_t units = ops / SearchBounds::ops_per_unit;
    ops %= SearchBounds::ops_per_unit;
    spend(units);
    return units;
  }
};

}  // namespace hoshidicts::lang
