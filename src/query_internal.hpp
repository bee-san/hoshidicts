#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "blob_file.hpp"
#include "hoshidicts/query.hpp"

// The views below point into the dictionaries' blob files, and stay valid
// while the BlobPins their query read them with lives.
struct RawGlossary {
  const std::string* dict_name;
  std::string_view definition_tags;
  std::string_view term_tags;
  std::string_view rules;
  double score;
  // Where the compressed glossary is: read by build_term, so only the terms a
  // lookup keeps read it from a paged file.
  const BlobFile* blobs;
  uint64_t compressed_offset;
  uint32_t compressed_size;
  const ZSTD_DDict_s* zstd_dict;
  uint32_t next;
  // The row also has form-of references, which a pack that follows them
  // leaves out of the glossary (docs/languages.md, section 9.10).
  bool drop_form_of = false;
};

// A form-of reference of a row the query found, read only for a pack that
// follows them (docs/languages.md, section 9.10).
struct RawReference {
  std::string_view form_of;
  // Its rules: RawTerms::reference_rules[first_rule, first_rule + rule_count).
  uint32_t first_rule;
  uint32_t rule_count;
  // The row's dictionary and part-of-speech tags, for the filter (9.4).
  const std::string* dict_name;
  std::string_view row_rules;
};

struct RawTerm {
  std::string_view expression;
  std::string_view reading;
  double score;
  uint32_t first_glossary;
  uint32_t last_glossary;
  std::vector<FrequencyEntry> frequencies;
  std::vector<PitchEntry> pitches;
  // With a pack's readingNormalizer (docs/languages.md, section 9.6): the
  // index of this term's normalized reading and merged readings in RawTerms.
  uint32_t merged = UINT32_MAX;
};

// With a reading normalizer: per merged term, its normalized reading and
// every distinct reading it merged, first found first.
struct NormalizedReadings {
  std::vector<std::string> normalized;
  std::vector<std::vector<std::string_view>> merged_readings;
};

struct RawTerms {
  std::vector<RawTerm> terms;
  std::vector<RawGlossary> glossaries;
  std::unique_ptr<NormalizedReadings> normalized;  // only with a reading normalizer
  // The form-of references of every row found, in order, when the query
  // follows them; a row that is only references is here and not in `terms`.
  std::vector<RawReference> references;
  std::vector<std::string_view> reference_rules;
};

// The raw terms of every loaded term dictionary for `expression`, for the
// library's own tools (hoshidicts-cli eval-language), as a lookup reads them.
struct QueryAccess {
  static RawTerms query_raw(const DictionaryQuery& query, const std::string& expression, BlobPins& pins,
                            bool follow_form_of) {
    return query.query_raw(expression, pins, DictionaryQuery::Selection{}, false, nullptr, follow_form_of);
  }
};
