#pragma once

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "deinflector.hpp"
#include "languages.hpp"
#include "query.hpp"

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
  // results are exactly those without it. Means language_options =
  // {"nekoSpeech"}, the Japanese pack's variant pass.
  bool neko_speech = false;
  // Also return terms that only frequency and pitch dictionaries have, with no
  // glossaries: each text and reading their rows name that no term with
  // glossaries has. Each comes after the terms with glossaries that read as
  // much of the text, so it is first only where it reads more than all of
  // them. lookup_dictionary never returns them. Off, the results are exactly
  // those without it.
  bool metadata_only_terms = false;
  // The language pack (docs/languages.md, section 9). An unknown code throws
  // std::invalid_argument; there is no fallback.
  std::string language = "ja";
  // Ordered package paths (section 9.7): when present, only these loaded
  // dictionaries are used, ranked in this order, and an empty list selects
  // nothing. Absent, every loaded dictionary in load order, as before.
  std::optional<std::vector<std::string>> dictionaries;
  // Ids of optional preprocessors, optional transforms and variant passes to
  // enable for this request (pack settings with engine effects); ids the pack
  // does not know are ignored.
  std::vector<std::string> language_options;
  // Dictionaries (paths) whose terms skip the part-of-speech filter
  // (section 9.4), for dictionaries without `rules` such as MDX imports.
  std::vector<std::string> pos_filter_exempt;
};

class Lookup {
 public:
  // Looks up every language `languages` holds; it must outlive the Lookup,
  // and packs may be added to it between lookups.
  Lookup(DictionaryQuery& query, const hoshidicts::LanguageRegistry& languages)
      : query_(query), languages_(&languages) {}
  // Kept for existing callers: the deinflector's pack (the built-in Japanese
  // pack for Deinflector()) is the only language.
  Lookup(DictionaryQuery& query, Deinflector& deinflector) : query_(query), deinflector_(&deinflector) {}
  // lookup and lookup_dictionary as before; options.language selects the pack.
  std::vector<LookupResult> lookup(const std::string& lookup_string, int max_results = 16, size_t scan_length = 16,
                                   const LookupOptions& options = {}) const;
  std::vector<LookupResult> lookup_dictionary(const std::string& lookup_string, const std::string& dictionary_path,
                                              int max_results = 16, size_t scan_length = 16,
                                              const LookupOptions& options = {}) const;

 private:
  std::shared_ptr<const hoshidicts::LanguagePack> pack_for(const std::string& code) const;
  std::vector<LookupResult> lookup_impl(const std::string& lookup_string, const std::string* dictionary_path,
                                        int max_results, size_t scan_length, const LookupOptions& options) const;

  DictionaryQuery& query_;
  const hoshidicts::LanguageRegistry* languages_ = nullptr;
  Deinflector* deinflector_ = nullptr;
};
