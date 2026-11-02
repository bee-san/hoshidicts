/* SPDX-License-Identifier: GPL-3.0-or-later */
/* The C API with languages (docs/languages.md, sections 9.7, 10.2 and 11.3),
 * compiled as C: an empty selection (a zero-length array whose pointer may be
 * NULL, as an empty vector's data() is) finds nothing; a zero-initialised
 * request keeps today's behaviour; an unknown language fails with a message.
 *
 *   c-smoke-test <small_dict.zip> <output dir>
 */
#include <stdio.h>
#include <string.h>

#include "hoshidicts_c.h"

static int failures = 0;

static void check(int ok, const char* what) {
  if (!ok) {
    ++failures;
    fprintf(stderr, "FAIL: %s\n", what);
  }
}

static int same_str(hd_str a, hd_str b) { return a.len == b.len && (a.len == 0 || memcmp(a.ptr, b.ptr, a.len) == 0); }

int main(int argc, char** argv) {
  if (argc != 3) {
    fprintf(stderr, "usage: c-smoke-test <small_dict.zip> <output dir>\n");
    return 2;
  }
  hd_import_result* imported = hd_import(argv[1], argv[2], 0);
  check(imported != NULL && hd_import_result_success(imported), "import the fixture");
  char path[4096];
  snprintf(path, sizeof path, "%s/%s", argv[2], imported ? hd_import_result_title(imported) : "");
  hd_import_result_free(imported);

  hd_query* q = hd_query_new();
  check(hd_query_add_term_dict(q, path) == 0, "add the term dictionary");
  check(hd_query_add_freq_dict(q, path) == 0, "add the frequency dictionary");
  check(hd_query_add_kanji_dict(q, path) == 0, "add the kanji dictionary");

  /* Today's API. */
  hd_deinflector* d = hd_deinflector_new();
  hd_lookup* old_lookup = hd_lookup_new(q, d);
  const hd_lookup_result* old_results = NULL;
  size_t old_count = 0;
  hd_lookup_results* old_r = hd_lookup_run(old_lookup, "走った", 16, 16, &old_results, &old_count);
  check(old_r != NULL && old_count > 0, "hd_lookup_run finds 走った");

  hd_languages* languages = hd_languages_new();
  check(languages != NULL, "hd_languages_new");
  hd_lookup* l = hd_lookup_new_with_languages(q, languages);
  check(l != NULL, "hd_lookup_new_with_languages");

  /* A zero-initialised request: every loaded dictionary, Japanese. */
  hd_language_request request;
  memset(&request, 0, sizeof request);
  request.struct_size = sizeof request;
  const hd_lookup_result* results = NULL;
  size_t count = 0;
  const char* error = "unset";
  hd_lookup_results* r = hd_lookup_run_with_language(l, "走った", 16, 16, NULL, &request, &results, &count, &error);
  check(r != NULL && error == NULL, "a zero-initialised request succeeds");
  check(count == old_count, "a zero-initialised request answers as hd_lookup_run");
  for (size_t i = 0; r != NULL && i < count && i < old_count; ++i) {
    check(same_str(results[i].term.expression, old_results[i].term.expression) &&
              same_str(results[i].matched, old_results[i].matched) && results[i].trace_count == old_results[i].trace_count,
          "the same results as hd_lookup_run");
    for (size_t j = 0; j < results[i].trace_count; ++j) {
      check(same_str(hd_lookup_results_trace_id(r, i, j), results[i].trace[j].name),
            "a Japanese trace id is its name");
    }
  }
  check(hd_lookup_results_trace_id(r, count, 0).len == 0, "trace id out of range is empty");
  hd_lookup_results_free(r);

  /* A NULL request is the same. */
  r = hd_lookup_run_with_language(l, "走った", 16, 16, NULL, NULL, &results, &count, &error);
  check(r != NULL && count == old_count, "a NULL request answers as hd_lookup_run");
  hd_lookup_results_free(r);

  /* An empty selection selects nothing, with a NULL or a non-NULL pointer. */
  const char* const* empty = NULL;
  request.select_dictionaries = 1;
  request.dictionaries = empty;
  request.dictionary_count = 0;
  r = hd_lookup_run_with_language(l, "走った", 16, 16, NULL, &request, &results, &count, &error);
  check(r != NULL && count == 0, "an empty selection (NULL data) finds nothing");
  hd_lookup_results_free(r);
  const char* unused[1] = {path};
  request.dictionaries = unused;
  request.dictionary_count = 0;
  r = hd_lookup_run_with_language(l, "走った", 16, 16, NULL, &request, &results, &count, &error);
  check(r != NULL && count == 0, "an empty selection (non-NULL data) finds nothing");
  hd_lookup_results_free(r);

  const hd_kanji_entry* entries = NULL;
  size_t entry_count = 0;
  hd_kanji_results* k = hd_query_run_kanji_with_request(q, "食", &request, &entries, &entry_count);
  check(k != NULL && entry_count == 0, "an empty kanji selection finds nothing");
  hd_kanji_results_free(k);
  request.dictionary_count = 1;
  r = hd_lookup_run_with_language(l, "走った", 16, 16, NULL, &request, &results, &count, &error);
  check(r != NULL && count == old_count, "selecting the dictionary finds what every dictionary finds");
  hd_lookup_results_free(r);
  k = hd_query_run_kanji_with_request(q, "食", &request, &entries, &entry_count);
  check(k != NULL && entry_count == 1, "selecting the dictionary finds its kanji");
  hd_kanji_results_free(k);
  k = hd_query_run_kanji_with_request(q, "食", NULL, &entries, &entry_count);
  check(k != NULL && entry_count == 1, "a NULL request finds every dictionary's kanji");
  hd_kanji_results_free(k);

  /* A request of an older, smaller layout: only struct_size and language. */
  hd_language_request small;
  memset(&small, 0, sizeof small);
  small.struct_size = sizeof(size_t) + sizeof(const char*);
  small.language = "ja";
  small.select_dictionaries = 1; /* beyond struct_size: ignored */
  r = hd_lookup_run_with_language(l, "走った", 16, 16, NULL, &small, &results, &count, &error);
  check(r != NULL && count == old_count, "fields beyond struct_size are ignored");
  hd_lookup_results_free(r);

  /* An unknown language. */
  memset(&request, 0, sizeof request);
  request.struct_size = sizeof request;
  request.language = "qq";
  r = hd_lookup_run_with_language(l, "走った", 16, 16, NULL, &request, &results, &count, &error);
  check(r == NULL && error != NULL && strstr(error, "qq") != NULL, "an unknown language fails with a message");

  /* Packs added at run time, and a bad one. */
  check(hd_languages_add(languages, "{}", NULL) == 1 && strlen(hd_languages_last_error(languages)) > 0,
        "a bad pack is refused with a message");
  check(hd_languages_add_directory(languages, "/no/such/directory") == 1, "a missing directory is refused");

  hd_lookup_results_free(old_r);
  hd_lookup_free(old_lookup);
  hd_deinflector_free(d);
  hd_lookup_free(l);
  hd_languages_free(languages);
  hd_query_free(q);
  printf("c-smoke: %d failures\n", failures);
  return failures == 0 ? 0 : 1;
}
