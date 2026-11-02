#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "blob_file.hpp"
#include "hoshidicts/query.hpp"
#include "json/form_of.hpp"

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

// A row the query found whose definitions hold form-of references, read
// only for a pack that follows them (docs/languages.md, section 9.10). The
// references stay in its glossary; DictionaryQuery::read_form_of reads them.
struct RawFormOfRow {
  const std::string* dict_name;
  // The row's part-of-speech tags, for the filter (9.4).
  std::string_view rules;
  const BlobFile* blobs;
  uint64_t compressed_offset;
  uint32_t compressed_size;
  const ZSTD_DDict_s* zstd_dict;
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
  // The rows found whose definitions hold form-of references, in order, when
  // the query follows them; a row that is only references is here and not
  // in `terms`.
  std::vector<RawFormOfRow> form_of_rows;
};

// The raw terms of every loaded term dictionary for `expression`, and the
// form-of references of a row, for the library's own tools (hoshidicts-cli
// eval-language), as a lookup reads them.
struct QueryAccess {
  static RawTerms query_raw(const DictionaryQuery& query, const std::string& expression, BlobPins& pins,
                            bool follow_form_of) {
    return query.query_raw(expression, pins, DictionaryQuery::Selection{}, false, nullptr, follow_form_of);
  }
  static void read_form_of(const RawFormOfRow& row, BlobPins& pins, std::vector<FormOfReference>& out) {
    DictionaryQuery::read_form_of(row, pins, out);
  }
};
