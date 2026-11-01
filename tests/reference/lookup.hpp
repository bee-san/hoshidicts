#pragma once

#include <optional>
#include <string>
#include <vector>

#include "deinflector.hpp"
#include "query.hpp"

namespace hoshidicts_legacy {

struct LookupResult {
  std::string matched;
  std::string deinflected;
  std::vector<TransformGroup> trace;
  TermResult term;
  int preprocessor_steps;
};

enum class LookupFrequencyOrder { Auto, Ascending, Descending, Disabled };

struct LookupOptions {
  std::optional<std::string> frequency_dictionary;
  LookupFrequencyOrder frequency_order = LookupFrequencyOrder::Auto;
  std::optional<std::string> primary_reading;
  // Also read NekoPara's cat speech (Deinflector::deinflect_neko_speech), only
  // where it reads more of the text than every ordinary reading. Off, the
  // results are exactly those without it.
  bool neko_speech = false;
  // Also return terms that only frequency and pitch dictionaries have, with no
  // glossaries, where they read more of the text than every term with
  // glossaries. lookup_dictionary never returns them. Off, the results are
  // exactly those without it.
  bool metadata_only_terms = false;
};

class Lookup {
 public:
  Lookup(DictionaryQuery& query, Deinflector& deinflector) : query_(query), deinflector_(deinflector) {};
  std::vector<LookupResult> lookup(const std::string& lookup_string, int max_results = 16, size_t scan_length = 16,
                                   const LookupOptions& options = {}) const;
  std::vector<LookupResult> lookup_dictionary(const std::string& lookup_string, const std::string& dictionary_path,
                                              int max_results = 16, size_t scan_length = 16,
                                              const LookupOptions& options = {}) const;

 private:
  std::vector<LookupResult> lookup_impl(const std::string& lookup_string, const std::string* dictionary_path,
                                        int max_results, size_t scan_length, const LookupOptions& options) const;
  static void filter_by_pos(RawTerms& terms, const DeinflectionResult& d);

  DictionaryQuery& query_;
  Deinflector& deinflector_;
};
}  // namespace hoshidicts_legacy
