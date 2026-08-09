#include "hoshidicts_c.h"

#include <array>
#include <charconv>
#include <cstdint>
#include <limits>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>

#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"

// importer
struct hd_import_result {
  ImportResult result;
};

hd_import_result* hd_import(const char* zip_path, const char* output_dir, int low_ram) {
  try {
    return new hd_import_result{dictionary_importer::import(zip_path, output_dir, low_ram != 0)};
  } catch (...) {
    return nullptr;
  }
}

void hd_import_result_free(hd_import_result* r) { delete r; }

int hd_import_result_success(const hd_import_result* r) { return static_cast<int>(r->result.success); }

const char* hd_import_result_title(const hd_import_result* r) { return r->result.title.c_str(); }

static uint64_t meta_count(const SummaryMetaCount& counts, const std::string& mode) {
  auto it = counts.find(mode);
  return it == counts.end() ? 0 : it->second;
}

uint64_t hd_import_result_term_count(const hd_import_result* r) { return r->result.summary.counts.terms.total; }

uint64_t hd_import_result_meta_count(const hd_import_result* r) {
  return meta_count(r->result.summary.counts.termMeta, "total");
}

uint64_t hd_import_result_freq_count(const hd_import_result* r) {
  return meta_count(r->result.summary.counts.termMeta, "freq");
}

uint64_t hd_import_result_pitch_count(const hd_import_result* r) {
  return meta_count(r->result.summary.counts.termMeta, "pitch") + meta_count(r->result.summary.counts.termMeta, "ipa");
}

uint64_t hd_import_result_kanji_count(const hd_import_result* r) { return r->result.summary.counts.kanji.total; }

uint64_t hd_import_result_media_count(const hd_import_result* r) { return r->result.summary.counts.media.total; }

const char* hd_import_result_error(const hd_import_result* r) { return r->result.error.c_str(); }

// deinflector
struct hd_deinflector {
  Deinflector deinflector;
};

hd_deinflector* hd_deinflector_new(void) {
  try {
    return new hd_deinflector;
  } catch (...) {
    return nullptr;
  }
}

void hd_deinflector_free(hd_deinflector* d) { delete d; }

// query
struct hd_query {
  DictionaryQuery query;
};

struct TermMarshallingBuffers {
  std::vector<hd_glossary_entry> glossary_entries;
  std::vector<hd_frequency_entry> frequency_entries;
  std::vector<hd_frequency_entry_v2> frequency_entries_v2;
  std::vector<hd_pitch_entry> pitch_entries;
  std::vector<hd_frequency> frequencies;
  std::vector<hd_frequency_v2> frequencies_v2;
  std::vector<std::string> legacy_frequency_displays;
  std::vector<hd_pitch> pitches;
  std::vector<hd_str> transcriptions;
};

struct hd_results : TermMarshallingBuffers {
  std::vector<TermResult> res;
  std::vector<hd_term_result> term_results;
  std::vector<hd_term_result_v2> term_results_v2;
};

struct hd_kanji_results {
  KanjiResult res;
  std::vector<hd_kanji_entry> entries;
  std::vector<hd_str> definitions;
  std::vector<hd_kanji_stat> stats;
};

struct hd_styles {
  std::vector<DictionaryStyle> res;
  std::vector<hd_dictionary_style> styles;
};

hd_query* hd_query_new(void) {
  try {
    return new hd_query;
  } catch (...) {
    return nullptr;
  }
}

void hd_query_free(hd_query* q) { delete q; }

int hd_query_add_term_dict(hd_query* q, const char* path) {
  try {
    q->query.add_term_dict(path);
    return 0;
  } catch (...) {
    return 1;
  }
}

int hd_query_add_freq_dict(hd_query* q, const char* path) {
  try {
    q->query.add_freq_dict(path);
    return 0;
  } catch (...) {
    return 1;
  }
}

int hd_query_add_pitch_dict(hd_query* q, const char* path) {
  try {
    q->query.add_pitch_dict(path);
    return 0;
  } catch (...) {
    return 1;
  }
}

int hd_query_add_kanji_dict(hd_query* q, const char* path) {
  try {
    q->query.add_kanji_dict(path);
    return 0;
  } catch (...) {
    return 1;
  }
}

template <typename TermResultC>
static void build_glossaries(std::vector<hd_glossary_entry>& entries, const TermResult& term_result, TermResultC& tr) {
  size_t glossaries_start = entries.size();
  for (const auto& gloss_entry : term_result.glossaries) {
    hd_glossary_entry gls;
    gls.dict_name = hd_str{gloss_entry.dict_name.c_str(), gloss_entry.dict_name.size()};
    gls.glossary = hd_str{gloss_entry.glossary.c_str(), gloss_entry.glossary.size()};
    gls.definition_tags = hd_str{gloss_entry.definition_tags.c_str(), gloss_entry.definition_tags.size()};
    gls.term_tags = hd_str{gloss_entry.term_tags.c_str(), gloss_entry.term_tags.size()};
    entries.push_back(gls);
  }
  tr.glossaries = entries.data() + glossaries_start;
  tr.glossaries_count = term_result.glossaries.size();
}

static int32_t legacy_frequency_value(double value) {
  if (value >= static_cast<double>(std::numeric_limits<int32_t>::max())) {
    return std::numeric_limits<int32_t>::max();
  }
  if (value <= static_cast<double>(std::numeric_limits<int32_t>::min())) {
    return std::numeric_limits<int32_t>::min();
  }
  return static_cast<int32_t>(value);
}

static std::string frequency_value_to_string(double value) {
  std::array<char, 64> buffer{};
  auto result = std::to_chars(buffer.data(), buffer.data() + buffer.size(), value, std::chars_format::general);
  return result.ec == std::errc{} ? std::string(buffer.data(), result.ptr) : std::string("0");
}

template <typename TermResultC>
static void build_frequencies_v1(std::vector<hd_frequency_entry>& entries, std::vector<hd_frequency>& frequencies,
                                 std::vector<std::string>& legacy_displays, const TermResult& term_result,
                                 TermResultC& tr) {
  size_t frequency_entry_start = entries.size();
  for (const auto& freq_entry : term_result.frequencies) {
    hd_frequency_entry frq;
    frq.dict_name = hd_str{freq_entry.dict_name.c_str(), freq_entry.dict_name.size()};

    size_t frequencies_start = frequencies.size();
    for (const auto& freq : freq_entry.frequencies) {
      const std::string* display = nullptr;
      if (freq.display_value.has_value()) {
        display = &*freq.display_value;
      } else {
        legacy_displays.push_back(frequency_value_to_string(freq.value));
        display = &legacy_displays.back();
      }
      frequencies.push_back(
          hd_frequency{legacy_frequency_value(freq.value), hd_str{display->c_str(), display->size()}});
    }
    frq.frequencies = frequencies.data() + frequencies_start;
    frq.frequencies_count = freq_entry.frequencies.size();

    entries.push_back(frq);
  }
  tr.frequencies = entries.data() + frequency_entry_start;
  tr.frequencies_count = term_result.frequencies.size();
}

template <typename TermResultC>
static void build_frequencies_v2(std::vector<hd_frequency_entry_v2>& entries, std::vector<hd_frequency_v2>& frequencies,
                                 const TermResult& term_result, TermResultC& tr) {
  size_t frequency_entry_start = entries.size();
  for (const auto& freq_entry : term_result.frequencies) {
    hd_frequency_entry_v2 frq;
    frq.dict_name = hd_str{freq_entry.dict_name.c_str(), freq_entry.dict_name.size()};

    size_t frequencies_start = frequencies.size();
    for (const auto& freq : freq_entry.frequencies) {
      const bool is_null = !freq.display_value.has_value();
      const hd_str display =
          is_null ? hd_str{nullptr, 0} : hd_str{freq.display_value->c_str(), freq.display_value->size()};
      frequencies.push_back(hd_frequency_v2{freq.value, display, static_cast<int>(is_null)});
    }
    frq.frequencies = frequencies.data() + frequencies_start;
    frq.frequencies_count = freq_entry.frequencies.size();

    entries.push_back(frq);
  }
  tr.frequencies = entries.data() + frequency_entry_start;
  tr.frequencies_count = term_result.frequencies.size();
}

template <typename TermResultC>
static void build_pitches(std::vector<hd_pitch_entry>& entries, std::vector<hd_pitch>& pitches,
                          std::vector<hd_str>& transcriptions, const TermResult& term_result, TermResultC& tr) {
  size_t pitch_entry_start = entries.size();
  for (const auto& pitch_entry : term_result.pitches) {
    hd_pitch_entry p;
    p.dict_name = hd_str{pitch_entry.dict_name.c_str(), pitch_entry.dict_name.size()};

    size_t pitches_start = pitches.size();
    for (const auto& pitch : pitch_entry.pitches) {
      pitches.push_back(hd_pitch{pitch.position, hd_str{pitch.pattern.c_str(), pitch.pattern.size()},
                                 pitch.nasal.data(), pitch.nasal.size(), pitch.devoice.data(), pitch.devoice.size()});
    }
    p.pitches = pitches.data() + pitches_start;
    p.pitches_count = pitch_entry.pitches.size();

    size_t transcription_start = transcriptions.size();
    for (const auto& transcription : pitch_entry.transcriptions) {
      transcriptions.push_back(hd_str{transcription.c_str(), transcription.size()});
    }
    p.transcriptions = transcriptions.data() + transcription_start;
    p.transcriptions_count = pitch_entry.transcriptions.size();

    entries.push_back(p);
  }
  tr.pitches = entries.data() + pitch_entry_start;
  tr.pitches_count = term_result.pitches.size();
}

struct TermMarshallingCounts {
  size_t glossaries = 0;
  size_t frequency_entries = 0;
  size_t frequencies = 0;
  size_t pitch_entries = 0;
  size_t pitches = 0;
  size_t transcriptions = 0;

  void add(const TermResult& term) {
    glossaries += term.glossaries.size();
    frequency_entries += term.frequencies.size();
    pitch_entries += term.pitches.size();
    for (const auto& entry : term.frequencies) {
      frequencies += entry.frequencies.size();
    }
    for (const auto& entry : term.pitches) {
      pitches += entry.pitches.size();
      transcriptions += entry.transcriptions.size();
    }
  }
};

static void reserve_common_buffers(TermMarshallingBuffers& buffers, const TermMarshallingCounts& counts) {
  buffers.glossary_entries.reserve(counts.glossaries);
  buffers.pitch_entries.reserve(counts.pitch_entries);
  buffers.pitches.reserve(counts.pitches);
  buffers.transcriptions.reserve(counts.transcriptions);
}

static void reserve_frequency_buffers(TermMarshallingBuffers& buffers, const TermMarshallingCounts& counts,
                                      const hd_term_result&) {
  buffers.frequency_entries.reserve(counts.frequency_entries);
  buffers.frequencies.reserve(counts.frequencies);
  buffers.legacy_frequency_displays.reserve(counts.frequencies);
}

static void reserve_frequency_buffers(TermMarshallingBuffers& buffers, const TermMarshallingCounts& counts,
                                      const hd_term_result_v2&) {
  buffers.frequency_entries_v2.reserve(counts.frequency_entries);
  buffers.frequencies_v2.reserve(counts.frequencies);
}

static void build_frequencies(TermMarshallingBuffers& buffers, const TermResult& term, hd_term_result& result) {
  build_frequencies_v1(buffers.frequency_entries, buffers.frequencies, buffers.legacy_frequency_displays, term, result);
}

static void build_frequencies(TermMarshallingBuffers& buffers, const TermResult& term, hd_term_result_v2& result) {
  build_frequencies_v2(buffers.frequency_entries_v2, buffers.frequencies_v2, term, result);
}

template <typename TermResultC>
static void marshal_term(TermMarshallingBuffers& buffers, const TermResult& term, TermResultC& result) {
  result.expression = hd_str{term.expression.c_str(), term.expression.size()};
  result.reading = hd_str{term.reading.c_str(), term.reading.size()};
  result.rules = hd_str{term.rules.c_str(), term.rules.size()};
  result.score = term.score;
  build_glossaries(buffers.glossary_entries, term, result);
  build_frequencies(buffers, term, result);
  build_pitches(buffers.pitch_entries, buffers.pitches, buffers.transcriptions, term, result);
}

template <typename TermResultC>
static void marshal_terms(TermMarshallingBuffers& buffers, const std::vector<TermResult>& terms,
                          std::vector<TermResultC>& results) {
  TermMarshallingCounts counts;
  for (const auto& term : terms) {
    counts.add(term);
  }
  reserve_common_buffers(buffers, counts);
  reserve_frequency_buffers(buffers, counts, TermResultC{});
  results.reserve(terms.size());

  for (const auto& term : terms) {
    TermResultC result{};
    marshal_term(buffers, term, result);
    results.push_back(result);
  }
}

hd_results* hd_query_run(const hd_query* q, const char* expression, const hd_term_result** out_terms,
                         size_t* out_count) {
  try {
    auto r = std::make_unique<hd_results>();
    r->res = q->query.query(expression);
    marshal_terms(*r, r->res, r->term_results);

    *out_terms = r->term_results.data();
    *out_count = r->term_results.size();
    return r.release();
  } catch (...) {
    return nullptr;
  }
}

hd_results* hd_query_run_v2(const hd_query* q, const char* expression, const hd_term_result_v2** out_terms,
                            size_t* out_count) {
  try {
    auto r = std::make_unique<hd_results>();
    r->res = q->query.query(expression);
    marshal_terms(*r, r->res, r->term_results_v2);

    *out_terms = r->term_results_v2.data();
    *out_count = r->term_results_v2.size();
    return r.release();
  } catch (...) {
    return nullptr;
  }
}

void hd_results_free(hd_results* r) { delete r; }

hd_kanji_results* hd_query_run_kanji(const hd_query* q, const char* kanji, const hd_kanji_entry** out_entries,
                                     size_t* out_count) {
  try {
    auto r = std::make_unique<hd_kanji_results>();
    r->res = q->query.query_kanji(kanji);

    size_t definitions_count = 0;
    size_t stats_count = 0;
    for (const auto& entry : r->res.entries) {
      definitions_count += entry.definitions.size();
      stats_count += entry.stats.size();
    }
    r->definitions.reserve(definitions_count);
    r->stats.reserve(stats_count);

    for (const auto& entry : r->res.entries) {
      hd_kanji_entry ke;
      ke.dict_name = hd_str{entry.dict_name.c_str(), entry.dict_name.size()};
      ke.onyomi = hd_str{entry.onyomi.c_str(), entry.onyomi.size()};
      ke.kunyomi = hd_str{entry.kunyomi.c_str(), entry.kunyomi.size()};
      ke.tags = hd_str{entry.tags.c_str(), entry.tags.size()};

      size_t definitions_start = r->definitions.size();
      for (const auto& definition : entry.definitions) {
        r->definitions.push_back(hd_str{definition.c_str(), definition.size()});
      }
      ke.definitions = r->definitions.data() + definitions_start;
      ke.definitions_count = entry.definitions.size();

      size_t stats_start = r->stats.size();
      for (const auto& [key, value] : entry.stats) {
        r->stats.push_back(hd_kanji_stat{hd_str{key.c_str(), key.size()}, hd_str{value.c_str(), value.size()}});
      }
      ke.stats = r->stats.data() + stats_start;
      ke.stats_count = entry.stats.size();

      r->entries.push_back(ke);
    }

    *out_entries = r->entries.data();
    *out_count = r->entries.size();
    return r.release();
  } catch (...) {
    return nullptr;
  }
}

void hd_kanji_results_free(hd_kanji_results* r) { delete r; }

hd_media_file hd_query_get_media_file(const hd_query* q, const char* dict_name, const char* media_path) {
  try {
    auto view = q->query.get_media_file_view(dict_name, media_path);
    return hd_media_file{reinterpret_cast<const uint8_t*>(view.data), view.size};
  } catch (...) {
    return hd_media_file{nullptr, 0};
  }
}

hd_styles* hd_query_get_styles(const hd_query* q, const hd_dictionary_style** out_styles, size_t* out_count) {
  try {
    auto s = std::make_unique<hd_styles>();
    s->res = q->query.get_styles();

    s->styles.reserve(s->res.size());
    for (const auto& style : s->res) {
      s->styles.push_back(hd_dictionary_style{hd_str{style.dict_name.c_str(), style.dict_name.size()},
                                              hd_str{style.styles.c_str(), style.styles.size()}});
    }

    *out_styles = s->styles.data();
    *out_count = s->styles.size();
    return s.release();
  } catch (...) {
    return nullptr;
  }
}

void hd_styles_free(hd_styles* s) { delete s; }

// lookup
struct hd_lookup {
  Lookup lookup;
};

struct hd_lookup_results : TermMarshallingBuffers {
  std::vector<LookupResult> res;
  std::vector<hd_lookup_result> results;
  std::vector<hd_lookup_result_v2> results_v2;
  std::vector<hd_transform_group> trace;
};

hd_lookup* hd_lookup_new(hd_query* q, hd_deinflector* d) {
  try {
    return new hd_lookup{Lookup(q->query, d->deinflector)};
  } catch (...) {
    return nullptr;
  }
}

void hd_lookup_free(hd_lookup* l) { delete l; }

template <typename LookupResultC>
static void marshal_lookup_header(std::vector<hd_transform_group>& traces, const LookupResult& lookup,
                                  LookupResultC& result) {
  result.matched = hd_str{lookup.matched.c_str(), lookup.matched.size()};
  result.deinflected = hd_str{lookup.deinflected.c_str(), lookup.deinflected.size()};
  result.preprocessor_steps = lookup.preprocessor_steps;

  const size_t trace_start = traces.size();
  for (const auto& group : lookup.trace) {
    traces.push_back(hd_transform_group{hd_str{group.name.c_str(), group.name.size()},
                                        hd_str{group.description.c_str(), group.description.size()}});
  }
  result.trace = traces.data() + trace_start;
  result.trace_count = lookup.trace.size();
}

template <typename LookupResultC>
static void marshal_lookup_results(TermMarshallingBuffers& buffers, std::vector<hd_transform_group>& traces,
                                   const std::vector<LookupResult>& lookups, std::vector<LookupResultC>& results) {
  TermMarshallingCounts counts;
  size_t trace_count = 0;
  for (const auto& lookup : lookups) {
    counts.add(lookup.term);
    trace_count += lookup.trace.size();
  }
  reserve_common_buffers(buffers, counts);
  reserve_frequency_buffers(buffers, counts, LookupResultC{}.term);
  traces.reserve(trace_count);
  results.reserve(lookups.size());

  for (const auto& lookup : lookups) {
    LookupResultC result{};
    marshal_lookup_header(traces, lookup, result);
    marshal_term(buffers, lookup.term, result.term);
    results.push_back(result);
  }
}

hd_lookup_results* hd_lookup_run(const hd_lookup* l, const char* lookup_string, int max_results, size_t scan_length,
                                 const hd_lookup_result** out_results, size_t* out_count) {
  try {
    auto r = std::make_unique<hd_lookup_results>();
    r->res = l->lookup.lookup(lookup_string, max_results, scan_length);
    marshal_lookup_results(*r, r->trace, r->res, r->results);

    *out_results = r->results.data();
    *out_count = r->results.size();
    return r.release();
  } catch (...) {
    return nullptr;
  }
}

hd_lookup_results* hd_lookup_run_v2(const hd_lookup* l, const char* lookup_string, int max_results, size_t scan_length,
                                    const hd_lookup_result_v2** out_results, size_t* out_count) {
  try {
    auto r = std::make_unique<hd_lookup_results>();
    r->res = l->lookup.lookup(lookup_string, max_results, scan_length);
    marshal_lookup_results(*r, r->trace, r->res, r->results_v2);

    *out_results = r->results_v2.data();
    *out_count = r->results_v2.size();
    return r.release();
  } catch (...) {
    return nullptr;
  }
}

static std::optional<std::string_view> optional_string_view(hd_str value) {
  if (value.len == 0) {
    return std::nullopt;
  }
  if (value.ptr == nullptr) {
    throw std::invalid_argument("non-empty lookup option has a null pointer");
  }
  return std::string_view(value.ptr, value.len);
}

hd_lookup_results* hd_lookup_run_v3(const hd_lookup* l, const char* lookup_string, int max_results, size_t scan_length,
                                    const hd_lookup_options_v3* options, const hd_lookup_result_v2** out_results,
                                    size_t* out_count) {
  if (l == nullptr || lookup_string == nullptr || out_results == nullptr || out_count == nullptr || max_results <= 0 ||
      scan_length == 0) {
    return nullptr;
  }
  *out_results = nullptr;
  *out_count = 0;

  try {
    LookupOptions native_options;
    if (options != nullptr) {
      native_options.primary_reading = optional_string_view(options->primary_reading);
      native_options.frequency_dictionary = optional_string_view(options->frequency_dictionary);
      switch (options->frequency_order) {
        case HD_LOOKUP_FREQUENCY_ORDER_AUTO:
          native_options.frequency_order = LookupFrequencyOrder::Auto;
          break;
        case HD_LOOKUP_FREQUENCY_ORDER_ASCENDING:
          native_options.frequency_order = LookupFrequencyOrder::Ascending;
          break;
        case HD_LOOKUP_FREQUENCY_ORDER_DESCENDING:
          native_options.frequency_order = LookupFrequencyOrder::Descending;
          break;
        case HD_LOOKUP_FREQUENCY_ORDER_DISABLED:
          native_options.frequency_order = LookupFrequencyOrder::Disabled;
          break;
        default:
          return nullptr;
      }
    }

    auto r = std::make_unique<hd_lookup_results>();
    r->res = l->lookup.lookup(lookup_string, max_results, scan_length, native_options);
    marshal_lookup_results(*r, r->trace, r->res, r->results_v2);

    *out_results = r->results_v2.data();
    *out_count = r->results_v2.size();
    return r.release();
  } catch (...) {
    return nullptr;
  }
}

void hd_lookup_results_free(hd_lookup_results* r) { delete r; }
