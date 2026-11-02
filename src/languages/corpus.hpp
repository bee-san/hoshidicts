// SPDX-License-Identifier: GPL-3.0-or-later
// Pack test files (docs/languages.md, section 12.2) and how a deinflection
// corpus row is decided, shared by language-conformance-test and
// `hoshidicts-cli eval-language`.
#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "pack.hpp"

namespace hoshidicts::lang {

struct CorpusRow {
  size_t line = 0;
  std::string category;
  bool valid = true;
  std::string source;
  std::string term;
  std::optional<std::string> rule;                  // nullopt for `*`
  std::optional<std::vector<std::string>> reasons;  // nullopt for `*`; forward order (newest first)
};

struct TextRow {
  size_t line = 0;
  std::string category;
  bool valid = true;
  std::string input;
  std::string variant;
};

struct LookupRow {
  size_t line = 0;
  std::string category;
  bool valid = true;
  std::string text;
  std::string expression;
  std::string matched;
};

// Readers for the three formats; false with `error` (file:line: reason) on a
// malformed file. Lines starting with # are comments.
bool read_corpus(const std::string& path, std::vector<CorpusRow>& rows, std::string* error);
bool read_text_tsv(const std::string& path, std::vector<TextRow>& rows, std::string* error);
bool read_lookup_tsv(const std::string& path, std::vector<LookupRow>& rows, std::string* error);

// One deinflection of a corpus source: its text (postprocessed), conditions,
// the rules on its path (indices into TransformSet::rules) and its trace ids
// in application order.
struct SourceDeinflection {
  std::string text;
  uint32_t conditions = 0;
  std::vector<uint32_t> rules;
  std::vector<std::string> trace;
};

// Every deinflection of `source` as a corpus row sees it: through the
// preprocessors, the deinflector, every variant pass and the postprocessors,
// with every optional processor, transform and pass enabled, the whole
// source only (never shorter prefixes). `limit_reached` is set when a
// processor reached the variant limit.
std::vector<SourceDeinflection> deinflect_source(const PackData& pack, std::string_view source, bool* limit_reached);

// Whether a corpus row passes (section 12.2). `matching`, when given,
// receives the deinflections that match the row's term, rule and reasons.
// Returns false with `error` for a row that names an unknown condition.
bool row_matches(const PackData& pack, const CorpusRow& row, const std::vector<SourceDeinflection>& deinflections,
                 std::vector<size_t>* matching, std::string* error);

}  // namespace hoshidicts::lang
