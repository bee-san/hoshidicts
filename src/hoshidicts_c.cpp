#include "hoshidicts_c.h"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"

// importer
struct hd_import_result {
  ImportResult result;
};

hd_import_result* hd_import(const char* source_path, const char* output_dir, int low_ram) {
  try {
    return new hd_import_result{dictionary_importer::import(source_path, output_dir, low_ram != 0)};
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

struct hd_results {
  std::vector<TermResult> res;
  std::vector<hd_term_result> term_results;
  std::vector<hd_glossary_entry> glossary_entries;
  std::vector<hd_frequency_entry> frequency_entries;
  std::vector<hd_pitch_entry> pitch_entries;
  std::vector<hd_frequency> frequencies;
  std::vector<hd_pitch> pitches;
  std::vector<hd_str> transcriptions;
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

size_t hd_query_max_long_key_length(const hd_query* q) { return q->query.max_long_key_length(); }

int hd_query_add_term_dict(hd_query* q, const char* path) {
  try {
    return q->query.add_term_dict(path) ? 0 : 1;
  } catch (...) {
    return 1;
  }
}

int hd_query_add_freq_dict(hd_query* q, const char* path) {
  try {
    return q->query.add_freq_dict(path) ? 0 : 1;
  } catch (...) {
    return 1;
  }
}

int hd_query_add_pitch_dict(hd_query* q, const char* path) {
  try {
    return q->query.add_pitch_dict(path) ? 0 : 1;
  } catch (...) {
    return 1;
  }
}

int hd_query_add_kanji_dict(hd_query* q, const char* path) {
  try {
    return q->query.add_kanji_dict(path) ? 0 : 1;
  } catch (...) {
    return 1;
  }
}

size_t hd_query_remove_dict(hd_query* q, const char* path) {
  try {
    return q->query.remove_dict(path);
  } catch (...) {
    return 0;
  }
}

int hd_query_set_dict_order(hd_query* q, const char* const* paths, size_t count) {
  try {
    std::vector<std::string> order;
    order.reserve(count);
    for (size_t i = 0; i < count; i++) {
      order.emplace_back(paths[i]);
    }
    return q->query.set_dict_order(order) ? 0 : 1;
  } catch (...) {
    return 1;
  }
}

static void build_glossaries(std::vector<hd_glossary_entry>& entries, const TermResult& term_result,
                             hd_term_result& tr) {
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

static void build_frequencies(std::vector<hd_frequency_entry>& entries, std::vector<hd_frequency>& frequencies,
                              const TermResult& term_result, hd_term_result& tr) {
  size_t frequency_entry_start = entries.size();
  for (const auto& freq_entry : term_result.frequencies) {
    hd_frequency_entry frq;
    frq.dict_name = hd_str{freq_entry.dict_name.c_str(), freq_entry.dict_name.size()};

    size_t frequencies_start = frequencies.size();
    for (const auto& freq : freq_entry.frequencies) {
      frequencies.push_back(hd_frequency{freq.value, hd_str{freq.display_value.c_str(), freq.display_value.size()}});
    }
    frq.frequencies = frequencies.data() + frequencies_start;
    frq.frequencies_count = freq_entry.frequencies.size();

    entries.push_back(frq);
  }
  tr.frequencies = entries.data() + frequency_entry_start;
  tr.frequencies_count = term_result.frequencies.size();
}

static void build_pitches(std::vector<hd_pitch_entry>& entries, std::vector<hd_pitch>& pitches,
                          std::vector<hd_str>& transcriptions, const TermResult& term_result, hd_term_result& tr) {
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

hd_results* hd_query_run(const hd_query* q, const char* expression, const hd_term_result** out_terms,
                         size_t* out_count) {
  try {
    auto r = std::make_unique<hd_results>();
    r->res = q->query.query(expression);

    size_t glossaries_count = 0;
    size_t freq_entry_count = 0;
    size_t freq_count = 0;
    size_t pitch_entry_count = 0;
    size_t pitch_count = 0;
    size_t transcription_count = 0;
    for (const auto& term_result : r->res) {
      glossaries_count += term_result.glossaries.size();
      freq_entry_count += term_result.frequencies.size();
      pitch_entry_count += term_result.pitches.size();
      for (const auto& freq_entry : term_result.frequencies) {
        freq_count += freq_entry.frequencies.size();
      }
      for (const auto& pitch_entry : term_result.pitches) {
        pitch_count += pitch_entry.pitches.size();
        transcription_count += pitch_entry.transcriptions.size();
      }
    }
    r->glossary_entries.reserve(glossaries_count);
    r->frequency_entries.reserve(freq_entry_count);
    r->frequencies.reserve(freq_count);
    r->pitch_entries.reserve(pitch_entry_count);
    r->pitches.reserve(pitch_count);
    r->transcriptions.reserve(transcription_count);

    for (const auto& term_result : r->res) {
      hd_term_result tr;
      tr.expression = hd_str{term_result.expression.c_str(), term_result.expression.size()};
      tr.reading = hd_str{term_result.reading.c_str(), term_result.reading.size()};
      tr.rules = hd_str{term_result.rules.c_str(), term_result.rules.size()};
      tr.score = term_result.score;

      build_glossaries(r->glossary_entries, term_result, tr);
      build_frequencies(r->frequency_entries, r->frequencies, term_result, tr);
      build_pitches(r->pitch_entries, r->pitches, r->transcriptions, term_result, tr);

      r->term_results.push_back(tr);
    }

    *out_terms = r->term_results.data();
    *out_count = r->term_results.size();
    return r.release();
  } catch (...) {
    return nullptr;
  }
}

void hd_results_free(hd_results* r) { delete r; }

static hd_kanji_results* marshal_kanji(std::unique_ptr<hd_kanji_results> r, const hd_kanji_entry** out_entries,
                                       size_t* out_count);

hd_kanji_results* hd_query_run_kanji(const hd_query* q, const char* kanji, const hd_kanji_entry** out_entries,
                                     size_t* out_count) {
  try {
    auto r = std::make_unique<hd_kanji_results>();
    r->res = q->query.query_kanji(kanji);
    return marshal_kanji(std::move(r), out_entries, out_count);
  } catch (...) {
    return nullptr;
  }
}

static hd_kanji_results* marshal_kanji(std::unique_ptr<hd_kanji_results> r, const hd_kanji_entry** out_entries,
                                       size_t* out_count) {
  {

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

struct hd_lookup_results {
  std::vector<LookupResult> res;
  std::vector<hd_lookup_result> results;
  std::vector<hd_transform_group> trace;
  std::vector<hd_glossary_entry> glossary_entries;
  std::vector<hd_frequency_entry> frequency_entries;
  std::vector<hd_pitch_entry> pitch_entries;
  std::vector<hd_frequency> frequencies;
  std::vector<hd_pitch> pitches;
  std::vector<hd_str> transcriptions;
};

hd_lookup* hd_lookup_new(hd_query* q, hd_deinflector* d) {
  try {
    return new hd_lookup{Lookup(q->query, d->deinflector)};
  } catch (...) {
    return nullptr;
  }
}

void hd_lookup_free(hd_lookup* l) { delete l; }

static void marshal_lookup_results(hd_lookup_results* r) {
  size_t trace_count = 0;
  size_t glossaries_count = 0;
  size_t freq_entry_count = 0;
  size_t freq_count = 0;
  size_t pitch_entry_count = 0;
  size_t pitch_count = 0;
  size_t transcription_count = 0;
  for (const auto& lookup_result : r->res) {
    trace_count += lookup_result.trace.size();
    glossaries_count += lookup_result.term.glossaries.size();
    freq_entry_count += lookup_result.term.frequencies.size();
    pitch_entry_count += lookup_result.term.pitches.size();
    for (const auto& freq_entry : lookup_result.term.frequencies) {
      freq_count += freq_entry.frequencies.size();
    }
    for (const auto& pitch_entry : lookup_result.term.pitches) {
      pitch_count += pitch_entry.pitches.size();
      transcription_count += pitch_entry.transcriptions.size();
    }
  }
  r->trace.reserve(trace_count);
  r->glossary_entries.reserve(glossaries_count);
  r->frequency_entries.reserve(freq_entry_count);
  r->frequencies.reserve(freq_count);
  r->pitch_entries.reserve(pitch_entry_count);
  r->pitches.reserve(pitch_count);
  r->transcriptions.reserve(transcription_count);

  for (const auto& lookup_result : r->res) {
    const auto& term_result = lookup_result.term;
    hd_lookup_result lr;
    lr.matched = hd_str{lookup_result.matched.c_str(), lookup_result.matched.size()};
    lr.deinflected = hd_str{lookup_result.deinflected.c_str(), lookup_result.deinflected.size()};
    lr.preprocessor_steps = lookup_result.preprocessor_steps;

    size_t trace_start = r->trace.size();
    for (const auto& group : lookup_result.trace) {
      r->trace.push_back(hd_transform_group{hd_str{group.name.c_str(), group.name.size()},
                                            hd_str{group.description.c_str(), group.description.size()}});
    }
    lr.trace = r->trace.data() + trace_start;
    lr.trace_count = lookup_result.trace.size();

    lr.term.expression = hd_str{term_result.expression.c_str(), term_result.expression.size()};
    lr.term.reading = hd_str{term_result.reading.c_str(), term_result.reading.size()};
    lr.term.rules = hd_str{term_result.rules.c_str(), term_result.rules.size()};
    lr.term.score = term_result.score;

    build_glossaries(r->glossary_entries, term_result, lr.term);
    build_frequencies(r->frequency_entries, r->frequencies, term_result, lr.term);
    build_pitches(r->pitch_entries, r->pitches, r->transcriptions, term_result, lr.term);

    r->results.push_back(lr);
  }
}

hd_lookup_results* hd_lookup_run(const hd_lookup* l, const char* lookup_string, int max_results, size_t scan_length,
                                 const hd_lookup_result** out_results, size_t* out_count) {
  try {
    auto r = std::make_unique<hd_lookup_results>();
    r->res = l->lookup.lookup(lookup_string, max_results, scan_length);
    marshal_lookup_results(r.get());

    *out_results = r->results.data();
    *out_count = r->results.size();
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

// Reads hd_lookup_options; false for an unknown frequency order.
static bool read_options(const hd_lookup_options* options, LookupOptions& native_options) {
  if (options == nullptr) {
    return true;
  }
  native_options.frequency_dictionary = optional_string_view(options->frequency_dictionary);
  native_options.primary_reading = optional_string_view(options->primary_reading);
  switch (options->frequency_order) {
    case HD_LOOKUP_FREQUENCY_ORDER_AUTO:
      native_options.frequency_order = LookupFrequencyOrder::Auto;
      return true;
    case HD_LOOKUP_FREQUENCY_ORDER_ASCENDING:
      native_options.frequency_order = LookupFrequencyOrder::Ascending;
      return true;
    case HD_LOOKUP_FREQUENCY_ORDER_DESCENDING:
      native_options.frequency_order = LookupFrequencyOrder::Descending;
      return true;
    case HD_LOOKUP_FREQUENCY_ORDER_DISABLED:
      native_options.frequency_order = LookupFrequencyOrder::Disabled;
      return true;
    default:
      return false;
  }
}

hd_lookup_results* hd_lookup_run_with_options(const hd_lookup* l, const char* lookup_string, int max_results,
                                              size_t scan_length, const hd_lookup_options* options,
                                              const hd_lookup_result** out_results, size_t* out_count) {
  try {
    LookupOptions native_options;
    if (!read_options(options, native_options)) {
      return nullptr;
    }

    auto r = std::make_unique<hd_lookup_results>();
    r->res = l->lookup.lookup(lookup_string, max_results, scan_length, native_options);
    marshal_lookup_results(r.get());

    *out_results = r->results.data();
    *out_count = r->results.size();
    return r.release();
  } catch (...) {
    return nullptr;
  }
}

void hd_lookup_results_free(hd_lookup_results* r) { delete r; }

// languages
struct hd_languages {
  hoshidicts::LanguageRegistry registry = hoshidicts::LanguageRegistry::with_builtin();
  std::string error;
};

hd_languages* hd_languages_new(void) {
  try {
    return new hd_languages;
  } catch (...) {
    return nullptr;
  }
}

void hd_languages_free(hd_languages* languages) { delete languages; }

int hd_languages_add(hd_languages* languages, const char* language_json, const char* transforms_json) {
  try {
    languages->error.clear();
    if (language_json == nullptr) {
      languages->error = "no language.json given";
      return 1;
    }
    return languages->registry.add(language_json, transforms_json == nullptr ? "" : transforms_json, &languages->error)
               ? 0
               : 1;
  } catch (const std::exception& error) {
    languages->error = error.what();
    return 1;
  } catch (...) {
    languages->error = "unknown error";
    return 1;
  }
}

int hd_languages_add_directory(hd_languages* languages, const char* path) {
  try {
    languages->error.clear();
    if (path == nullptr) {
      languages->error = "no directory given";
      return 1;
    }
    return languages->registry.add_directory(path, &languages->error) ? 0 : 1;
  } catch (const std::exception& error) {
    languages->error = error.what();
    return 1;
  } catch (...) {
    languages->error = "unknown error";
    return 1;
  }
}

const char* hd_languages_last_error(const hd_languages* languages) { return languages->error.c_str(); }

hd_lookup* hd_lookup_new_with_languages(hd_query* q, const hd_languages* languages) {
  try {
    return new hd_lookup{Lookup(q->query, languages->registry)};
  } catch (...) {
    return nullptr;
  }
}

namespace {
// Whether a request of `struct_size` bytes has the field at `offset`.
bool has_field(const hd_language_request* request, size_t offset, size_t size) {
  return request != nullptr && request->struct_size >= offset + size;
}

#define HD_REQUEST_HAS(request, field) \
  has_field(request, offsetof(hd_language_request, field), sizeof(static_cast<hd_language_request*>(nullptr)->field))

std::vector<std::string> strings(const char* const* list, size_t count) {
  std::vector<std::string> out;
  if (list == nullptr) {
    return out;
  }
  out.reserve(count);
  for (size_t i = 0; i < count; ++i) {
    if (list[i] != nullptr) {
      out.emplace_back(list[i]);
    }
  }
  return out;
}

// The dictionary selection of a request, or nullopt for every loaded one.
std::optional<std::vector<std::string>> selection(const hd_language_request* request) {
  if (!HD_REQUEST_HAS(request, select_dictionaries) || request->select_dictionaries == 0) {
    return std::nullopt;
  }
  if (!HD_REQUEST_HAS(request, dictionaries) || !HD_REQUEST_HAS(request, dictionary_count)) {
    return std::vector<std::string>{};
  }
  return strings(request->dictionaries, request->dictionary_count);
}

void read_request(const hd_language_request* request, LookupOptions& options) {
  if (HD_REQUEST_HAS(request, language) && request->language != nullptr) {
    options.language = request->language;
  }
  options.dictionaries = selection(request);
  if (HD_REQUEST_HAS(request, language_options) && HD_REQUEST_HAS(request, language_option_count)) {
    options.language_options = strings(request->language_options, request->language_option_count);
  }
  if (HD_REQUEST_HAS(request, pos_filter_exempt) && HD_REQUEST_HAS(request, pos_filter_exempt_count)) {
    options.pos_filter_exempt = strings(request->pos_filter_exempt, request->pos_filter_exempt_count);
  }
}

thread_local std::string last_lookup_error;
}  // namespace

hd_lookup_results* hd_lookup_run_with_language(const hd_lookup* l, const char* lookup_string, int max_results,
                                               size_t scan_length, const hd_lookup_options* options,
                                               const hd_language_request* request,
                                               const hd_lookup_result** out_results, size_t* out_count,
                                               const char** out_error) {
  const auto fail = [out_error](std::string message) -> hd_lookup_results* {
    last_lookup_error = std::move(message);
    if (out_error != nullptr) {
      *out_error = last_lookup_error.c_str();
    }
    return nullptr;
  };
  if (out_error != nullptr) {
    *out_error = nullptr;
  }
  try {
    LookupOptions native_options;
    if (!read_options(options, native_options)) {
      return fail("unknown frequency order");
    }
    read_request(request, native_options);
    auto r = std::make_unique<hd_lookup_results>();
    r->res = l->lookup.lookup(lookup_string, max_results, scan_length, native_options);
    marshal_lookup_results(r.get());

    *out_results = r->results.data();
    *out_count = r->results.size();
    return r.release();
  } catch (const std::exception& error) {
    return fail(error.what());
  } catch (...) {
    return fail("unknown error");
  }
}

hd_str hd_lookup_results_trace_id(const hd_lookup_results* r, size_t i, size_t j) {
  if (r == nullptr || i >= r->res.size() || j >= r->res[i].trace.size()) {
    return hd_str{"", 0};
  }
  const std::string& id = r->res[i].trace[j].id;
  return hd_str{id.c_str(), id.size()};
}

int hd_lookup_results_trace_from_dictionary(const hd_lookup_results* r, size_t i, size_t j) {
  if (r == nullptr || i >= r->res.size() || j >= r->res[i].trace.size()) {
    return 0;
  }
  return r->res[i].trace[j].from_dictionary ? 1 : 0;
}

hd_kanji_results* hd_query_run_kanji_with_request(const hd_query* q, const char* kanji,
                                                  const hd_language_request* request,
                                                  const hd_kanji_entry** out_entries, size_t* out_count) {
  try {
    auto r = std::make_unique<hd_kanji_results>();
    const auto chosen = selection(request);
    r->res = chosen ? q->query.query_kanji(kanji, *chosen) : q->query.query_kanji(kanji);
    return marshal_kanji(std::move(r), out_entries, out_count);
  } catch (...) {
    return nullptr;
  }
}
