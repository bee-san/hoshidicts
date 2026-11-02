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
};
