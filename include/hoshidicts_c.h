#ifndef HOSHIDICTS_C_H
#define HOSHIDICTS_C_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct hd_str {
  const char* ptr;
  size_t len;
} hd_str;

// importer
typedef struct hd_import_result hd_import_result;

hd_import_result* hd_import(const char* source_path, const char* output_dir, int low_ram);
void hd_import_result_free(hd_import_result* r);

int hd_import_result_success(const hd_import_result* r);
const char* hd_import_result_title(const hd_import_result* r);
uint64_t hd_import_result_term_count(const hd_import_result* r);
uint64_t hd_import_result_meta_count(const hd_import_result* r);
uint64_t hd_import_result_freq_count(const hd_import_result* r);
uint64_t hd_import_result_pitch_count(const hd_import_result* r);
uint64_t hd_import_result_kanji_count(const hd_import_result* r);
uint64_t hd_import_result_media_count(const hd_import_result* r);

const char* hd_import_result_error(const hd_import_result* r);

// deinflector
typedef struct hd_deinflector hd_deinflector;

hd_deinflector* hd_deinflector_new(void);
void hd_deinflector_free(hd_deinflector* d);

// query
typedef struct hd_query hd_query;
typedef struct hd_results hd_results;
typedef struct hd_kanji_results hd_kanji_results;
typedef struct hd_styles hd_styles;

typedef struct hd_frequency {
  int32_t value;
  hd_str display_value;
} hd_frequency;

typedef struct hd_dictionary_style {
  hd_str dict_name;
  hd_str styles;
} hd_dictionary_style;

typedef struct hd_media_file {
  const uint8_t* data;
  size_t size;
} hd_media_file;

typedef struct hd_glossary_entry {
  hd_str dict_name;
  hd_str glossary;
  hd_str definition_tags;
  hd_str term_tags;
} hd_glossary_entry;

typedef struct hd_frequency_entry {
  hd_str dict_name;
  const hd_frequency* frequencies;
  size_t frequencies_count;
} hd_frequency_entry;

typedef struct hd_pitch {
  int32_t position;
  hd_str pattern;
  const int32_t* nasal;
  size_t nasal_count;
  const int32_t* devoice;
  size_t devoice_count;
} hd_pitch;

typedef struct hd_pitch_entry {
  hd_str dict_name;
  const hd_pitch* pitches;
  size_t pitches_count;
  const hd_str* transcriptions;
  size_t transcriptions_count;
} hd_pitch_entry;

typedef struct hd_term_result {
  hd_str expression;
  hd_str reading;
  hd_str rules;
  double score;
  const hd_glossary_entry* glossaries;
  size_t glossaries_count;
  const hd_frequency_entry* frequencies;
  size_t frequencies_count;
  const hd_pitch_entry* pitches;
  size_t pitches_count;
} hd_term_result;

typedef struct hd_kanji_stat {
  hd_str key;
  hd_str value;
} hd_kanji_stat;

typedef struct hd_kanji_entry {
  hd_str dict_name;
  hd_str onyomi;
  hd_str kunyomi;
  hd_str tags;
  const hd_str* definitions;
  size_t definitions_count;
  const hd_kanji_stat* stats;
  size_t stats_count;
} hd_kanji_entry;

hd_query* hd_query_new(void);
void hd_query_free(hd_query* q);

int hd_query_add_term_dict(hd_query* q, const char* path);
int hd_query_add_freq_dict(hd_query* q, const char* path);
int hd_query_add_pitch_dict(hd_query* q, const char* path);
int hd_query_add_kanji_dict(hd_query* q, const char* path);
// Removes every loaded kind of the dictionary at path; returns the number removed.
size_t hd_query_remove_dict(hd_query* q, const char* path);
// Reorders the loaded dictionaries to follow paths (see DictionaryQuery::set_dict_order).
// Returns 0 on success, 1 when a listed path is not loaded.
int hd_query_set_dict_order(hd_query* q, const char* const* paths, size_t count);

// Longest term-dictionary key, in code points, recorded in the loaded
// dictionaries' long-key scan indexes (keys longer than 16 code points; 0 when
// none is loaded). A host should hand hd_lookup_run at least this many code
// points plus eight so that an extended scan can reach such a key.
size_t hd_query_max_long_key_length(const hd_query* q);

hd_results* hd_query_run(const hd_query* q, const char* expression, const hd_term_result** out_terms,
                         size_t* out_count);
void hd_results_free(hd_results* r);

hd_kanji_results* hd_query_run_kanji(const hd_query* q, const char* kanji, const hd_kanji_entry** out_entries,
                                     size_t* out_count);
void hd_kanji_results_free(hd_kanji_results* r);

// A view into the dictionary's mapped media.bin, valid while the query holds
// the dictionary. Empty where media is read on demand (Emscripten builds; see
// DictionaryStorage in hoshidicts/query.hpp).
hd_media_file hd_query_get_media_file(const hd_query* q, const char* dict_name, const char* media_path);

hd_styles* hd_query_get_styles(const hd_query* q, const hd_dictionary_style** out_styles, size_t* out_count);
void hd_styles_free(hd_styles* s);

// lookup
typedef struct hd_lookup hd_lookup;
typedef struct hd_lookup_results hd_lookup_results;

typedef struct hd_transform_group {
  hd_str name;
  hd_str description;
} hd_transform_group;

typedef struct hd_lookup_result {
  hd_str matched;
  hd_str deinflected;
  const hd_transform_group* trace;
  size_t trace_count;
  hd_term_result term;
  int32_t preprocessor_steps;
} hd_lookup_result;

typedef enum hd_lookup_frequency_order {
  HD_LOOKUP_FREQUENCY_ORDER_AUTO = 0,
  HD_LOOKUP_FREQUENCY_ORDER_ASCENDING = 1,
  HD_LOOKUP_FREQUENCY_ORDER_DESCENDING = 2,
  HD_LOOKUP_FREQUENCY_ORDER_DISABLED = 3,
} hd_lookup_frequency_order;

typedef struct hd_lookup_options {
  hd_str frequency_dictionary;
  int32_t frequency_order;
  hd_str primary_reading;
} hd_lookup_options;

hd_lookup* hd_lookup_new(hd_query* q, hd_deinflector* d);
void hd_lookup_free(hd_lookup* l);

hd_lookup_results* hd_lookup_run(const hd_lookup* l, const char* lookup_string, int max_results, size_t scan_length,
                                 const hd_lookup_result** out_results, size_t* out_count);
hd_lookup_results* hd_lookup_run_with_options(const hd_lookup* l, const char* lookup_string, int max_results,
                                              size_t scan_length, const hd_lookup_options* options,
                                              const hd_lookup_result** out_results, size_t* out_count);
void hd_lookup_results_free(hd_lookup_results* r);

// languages (docs/languages.md, sections 9 and 10.2)
typedef struct hd_languages hd_languages;

// A registry that starts with the built-in packs (Japanese).
hd_languages* hd_languages_new(void);
void hd_languages_free(hd_languages* languages);
// Parses a pack and adds it, replacing one with the same code; transforms_json
// may be NULL or "" for a pack without transforms. Returns 0 on success, 1 on
// failure (see hd_languages_last_error).
int hd_languages_add(hd_languages* languages, const char* language_json, const char* transforms_json);
// Loads every <path>/<code>/language.json whose directory name does not start
// with '_'. Returns 0 when every pack loaded, 1 otherwise (the others still
// load; see hd_languages_last_error).
int hd_languages_add_directory(hd_languages* languages, const char* path);
// The last add's error ("" after a success), valid until the next add.
const char* hd_languages_last_error(const hd_languages* languages);

typedef struct hd_language_request {
  size_t struct_size;                   // sizeof(hd_language_request), so fields can be added
  const char* language;                 // NULL means "ja"
  int select_dictionaries;              // 0: every loaded dictionary; 1: exactly the dictionary_count entries
  const char* const* dictionaries;      // may be NULL when dictionary_count is 0
  size_t dictionary_count;
  const char* const* language_options;
  size_t language_option_count;
  const char* const* pos_filter_exempt;
  size_t pos_filter_exempt_count;
} hd_language_request;

// A lookup over every pack `languages` holds; `languages` must outlive it.
hd_lookup* hd_lookup_new_with_languages(hd_query* q, const hd_languages* languages);
// Like hd_lookup_run_with_options, for one language and dictionary selection.
// Returns NULL and points *out_error at a message (valid until the next call
// on this thread) on an unknown language.
hd_lookup_results* hd_lookup_run_with_language(const hd_lookup* l, const char* lookup_string, int max_results,
                                               size_t scan_length, const hd_lookup_options* options,
                                               const hd_language_request* request,
                                               const hd_lookup_result** out_results, size_t* out_count,
                                               const char** out_error);
// The transform id of each trace step of result i, step j; hd_transform_group
// keeps its layout for callers built against the existing header. An empty
// string out of range.
hd_str hd_lookup_results_trace_id(const hd_lookup_results* r, size_t i, size_t j);
// hd_query_run_kanji with the request's dictionary selection (its
// select_dictionaries, dictionaries and dictionary_count; a NULL request
// selects every loaded dictionary).
hd_kanji_results* hd_query_run_kanji_with_request(const hd_query* q, const char* kanji,
                                                  const hd_language_request* request,
                                                  const hd_kanji_entry** out_entries, size_t* out_count);

#ifdef __cplusplus
}
#endif

#endif
