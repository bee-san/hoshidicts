#include "hoshidicts/lookup.hpp"

#include <ankerl/unordered_dense.h>
#include <utf8.h>
#include <xxh3.h>

#include <algorithm>
#include <climits>
#include <deque>
#include <iterator>
#include <numeric>
#include <optional>
#include <ranges>
#include <span>
#include <stdexcept>
#include <string_view>
#include <vector>

#include "languages/pack.hpp"
#include "query_internal.hpp"
#include "scan_index.hpp"

namespace {
using hoshidicts::lang::Deinflection;
using hoshidicts::lang::Deinflections;

bool is_space(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\v' || c == '\f' || c == '\r'; }

// Calls f with each whitespace-separated token of str.
template <typename F>
void each_token(std::string_view str, F&& f) {
  size_t i = 0;
  const size_t n = str.size();
  while (i < n) {
    while (i < n && is_space(str[i])) {
      ++i;
    }
    const size_t begin = i;
    while (i < n && !is_space(str[i])) {
      ++i;
    }
    if (i > begin) {
      f(str.substr(begin, i - begin));
    }
  }
}

// A form-of reference of a row a deinflection found, followed as a
// deinflection of its own (docs/languages.md, section 9.10): the
// deinflection's matched text, processor steps and trace, then one step per
// rule of the reference, reaching the term `text`.
struct Followed {
  size_t matched_len;
  const Deinflection* base;
  uint32_t index;
  int steps;
  std::string text;
  // The reference's rules: the lookup's followed_rules[first_rule, first_rule + rule_count).
  uint32_t first_rule;
  uint32_t rule_count;
  // A row of the matched text itself names the term (the deinflection has no
  // trace), so it is dictionary-confirmed (section 9.6).
  bool confirms;
};

struct Candidate {
  size_t matched_len;
  // The deinflection: element `index` of the list whose data is `base`
  // (parents are elements of the same list).
  const Deinflection* base;
  uint32_t index;
  // The text looked up: the deinflection's text, or a postprocessed form of it.
  const std::string* form;
  RawTerm* term;
  uint32_t store_index;
  int steps;
  // The best (smallest) rank, in the caller's dictionary order, of the term
  // dictionaries this candidate's glossaries come from. SIZE_MAX until it is
  // computed from the glossary chain just before sorting. It breaks ties the
  // frequency comparison leaves, so the reading the user ranked highest wins.
  // A metadata-only term (LookupOptions::metadata_only_terms) has no glossary
  // chain and starts after every term dictionary, in the order its reading was
  // found (DictionaryQuery::metadata_readings).
  size_t dict_rank = SIZE_MAX;
  // The form-of reference that reached the term after the deinflection (then
  // `form` is its text), or null.
  const Followed* reference = nullptr;
  // The longest matched length at which a form-of reference of a row of the
  // matched text itself reached the term, whichever trace the candidate
  // keeps, or 0.
  size_t confirmed_len = 0;

  const Deinflection& deinflection() const { return base[index]; }
  // The trace length: the deinflection's, plus the reference's rules.
  uint32_t depth() const { return deinflection().depth + (reference != nullptr ? reference->rule_count : 0); }
  // Dictionary-confirmed (section 9.6): a form-of reference of a row of the
  // matched text reached the term.
  bool confirmed() const { return confirmed_len == matched_len; }
};

uint64_t key_hash(std::string_view expression, std::string_view reading) {
  return XXH3_64bits_withSeed(reading.data(), reading.size(), XXH3_64bits(expression.data(), expression.size()));
}

bool key_less(const RawTerm& a, const RawTerm& b) {
  const int c = a.expression.compare(b.expression);
  return c != 0 ? c < 0 : a.reading < b.reading;
}

std::optional<int> get_freq_value_for_dict(const RawTerm& term, std::string_view dictionary_name, bool descending) {
  std::optional<int> frequency;
  for (const auto& frequency_entry : term.frequencies) {
    if (frequency_entry.dict_name != dictionary_name || frequency_entry.frequencies.empty()) {
      continue;
    }

    for (const auto& candidate : frequency_entry.frequencies) {
      if (candidate.value < 0) {
        continue;
      }
      frequency = frequency.has_value() ? std::optional<int>(descending ? std::max(*frequency, candidate.value)
                                                                        : std::min(*frequency, candidate.value))
                                        : std::optional<int>(candidate.value);
    }
  }

  return frequency;
}
}  // namespace

std::shared_ptr<const hoshidicts::LanguagePack> Lookup::pack_for(const std::string& code) const {
  if (languages_ != nullptr) {
    auto pack = languages_->find(code);
    if (!pack) {
      throw std::invalid_argument("no language pack \"" + code + "\" is loaded");
    }
    return pack;
  }
  const auto& pack = deinflector_->pack();
  if (pack->code() != code) {
    throw std::invalid_argument("no language pack \"" + code + "\" is loaded (this Lookup has only \"" + pack->code() +
                                "\")");
  }
  return pack;
}

std::vector<LookupResult> Lookup::lookup(const std::string& lookup_string, int max_results, size_t scan_length,
                                         const LookupOptions& options) const {
  return lookup_impl(lookup_string, nullptr, max_results, scan_length, options);
}

std::vector<LookupResult> Lookup::lookup_dictionary(const std::string& lookup_string,
                                                    const std::string& dictionary_path, int max_results,
                                                    size_t scan_length, const LookupOptions& options) const {
  return lookup_impl(lookup_string, &dictionary_path, max_results, scan_length, options);
}

std::vector<LookupResult> Lookup::lookup_impl(const std::string& lookup_string, const std::string* dictionary_path,
                                              int max_results, size_t scan_length,
                                              const LookupOptions& options) const {
  namespace lang = hoshidicts::lang;
  // Held for the whole lookup, so replacing the pack in the registry never
  // frees it under us.
  const std::shared_ptr<const hoshidicts::LanguagePack> pack_holder = pack_for(options.language);
  const lang::PackData& pack = pack_holder->data();
  const lang::TransformSet* transforms = pack.transforms.get();

  // The request's language options (section 4.7); neko_speech means the
  // Japanese pack's nekoSpeech pass.
  std::vector<std::string> option_storage;
  std::span<const std::string> option_ids = options.language_options;
  if (options.neko_speech) {
    option_storage = options.language_options;
    option_storage.emplace_back("nekoSpeech");
    option_ids = option_storage;
  }
  const lang::EnabledOptions enabled{option_ids};
  std::vector<bool> enabled_transforms;
  const std::vector<bool>* enabled_transforms_ptr = nullptr;
  if (transforms != nullptr && transforms->has_optional_transforms) {
    enabled_transforms.resize(transforms->transforms.size());
    for (size_t i = 0; i < transforms->transforms.size(); ++i) {
      enabled_transforms[i] = transforms->transforms[i].optional && enabled.contains(transforms->transforms[i].id);
    }
    enabled_transforms_ptr = &enabled_transforms;
  }
  std::vector<const lang::VariantPass*> passes;
  for (const auto& pass : pack.variant_passes) {
    if (enabled.contains(pass.id)) {
      passes.push_back(&pass);
    }
  }

  // The dictionaries this request uses (section 9.7), resolved once.
  const DictionaryQuery::Selection selection = query_.select(options.dictionaries, dictionary_path);
  const std::span<const DictionaryQuery::Dictionary* const> selected_terms = selection.term;
  const size_t term_dictionary_count = selection.all ? query_.term_dicts_.size() : selection.term.size();
  std::vector<const std::string*> exempt;
  for (const auto& path : options.pos_filter_exempt) {
    for (const auto& dict : query_.term_dicts_) {
      if (dict.path == path) {
        exempt.push_back(&dict.name);
      }
    }
  }

  // The pack's readingNormalizer (section 9.6).
  struct Normalizer : DictionaryQuery::ReadingNormalizer {
    const lang::StepList* steps = nullptr;
    std::string normalize(std::string_view reading) const override {
      std::u32string in;
      if (!lang::decode_utf8(reading, in)) {
        return std::string(reading);
      }
      std::u32string out;
      std::vector<std::u32string> outputs;
      lang::apply_steps(*steps, in, outputs);
      return outputs.empty() ? std::string(reading) : lang::to_utf8(outputs.front());
    }
  };
  std::optional<Normalizer> normalizer_storage;
  if (pack.reading_normalizer) {
    normalizer_storage.emplace();
    normalizer_storage->steps = &*pack.reading_normalizer;
  }
  const DictionaryQuery::ReadingNormalizer* normalizer = normalizer_storage ? &*normalizer_storage : nullptr;
  const bool shortest = pack.trace_selection == lang::TraceSelection::Shortest;
  // lookup.formOf (section 9.10): the rows' form-of references are followed,
  // and a row that is only references is never a term.
  const bool follow = pack.form_of == lang::FormOf::Follow;

  // Holds what the raw terms below read of paged dictionaries until the kept
  // results are materialized, so it outlives term_store.
  BlobPins pins;
  std::vector<Candidate> candidates;
  ankerl::unordered_dense::map<uint64_t, uint32_t> index;
  std::vector<Deinflections> deinflection_store;
  std::vector<RawTerms> term_store;
  // Postprocessed forms the candidates look at (only with postprocessors;
  // a deque allocates even when empty, so it is made on first use).
  std::unique_ptr<std::deque<std::string>> forms;
  // The form-of references to follow, in the order the rows naming them were
  // found (made on first use, as `forms`), and their rules.
  std::unique_ptr<std::deque<Followed>> followed;
  size_t followed_done = 0;
  std::vector<std::string> followed_rules;
  std::vector<FormOfReference> references;
  // The form-of rows of the query running now (reused).
  std::vector<RawFormOfRow> form_of_rows;
  std::vector<RawFormOfRow>* const form_of_out = follow ? &form_of_rows : nullptr;

  size_t text_len = utf8::distance(lookup_string.begin(), lookup_string.end());

  // The reading a candidate is keyed by: the normalized one with a normalizer.
  const auto reading_key = [](const RawTerms& terms, const RawTerm& term) -> std::string_view {
    return term.merged == UINT32_MAX ? term.reading : std::string_view(terms.normalized->normalized[term.merged]);
  };

  auto find_candidate = [&](uint64_t h, const RawTerm& term, std::string_view key) -> Candidate* {
    auto it = index.find(h);
    if (it == index.end()) {
      return nullptr;
    }
    const auto same = [&](const Candidate& c) {
      if (c.term->expression != term.expression) return false;
      if (normalizer == nullptr) return c.term->reading == term.reading;
      return reading_key(term_store[c.store_index], *c.term) == key;
    };
    Candidate& hit = candidates[it->second];
    if (same(hit)) {
      return &hit;
    }
    for (auto& c : candidates) {
      if (same(c)) {
        return &c;
      }
    }
    return nullptr;
  };

  // The processed variants of the input's first eight code points, through
  // the pre- and postprocessors, for the long-key check below.
  std::vector<std::string> prefix_variants;

  // Every scanned prefix's byte length and processed variants, kept only for
  // the variant passes below.
  struct ScannedPrefix {
    size_t length;
    std::vector<lang::TextVariant> variants;
  };
  std::vector<ScannedPrefix> scanned;

  // Every scanned prefix's deinflections that need no part of speech, kept
  // only for the metadata-only pass below, and the readings of the terms that
  // pass adds.
  struct MetadataProbe {
    size_t length;
    const Deinflection* base;
    uint32_t index;
    const std::string* form;
    int steps;
  };
  const bool metadata_only = options.metadata_only_terms && dictionary_path == nullptr;
  std::vector<MetadataProbe> metadata_probes;
  std::vector<std::vector<std::string>> metadata_reading_store;
  bool metadata_added = false;

  // Merges the terms of one deinflection of a prefix's variant into the
  // candidates, keeping each term's longest matched form (and, with the
  // `shortest` trace selection, its fewest steps and shortest trace there).
  // A new candidate's dict_rank starts at `rank`. `reference` is the form-of
  // reference that reached the terms after the deinflection, or null.
  auto add_terms = [&](size_t matched_len, const Deinflection* base, uint32_t di, const std::string* form, int steps,
                       RawTerms&& terms, size_t rank, const Followed* reference = nullptr) {
    const auto store_index = static_cast<uint32_t>(term_store.size());
    for (auto& term : terms.terms) {
      const std::string_view key = reading_key(terms, term);
      const uint64_t h = key_hash(term.expression, key);
      Candidate* existing = find_candidate(h, term, key);
      if (existing != nullptr) {
        bool better = matched_len > existing->matched_len;
        if (!better && shortest && matched_len == existing->matched_len) {
          const uint32_t depth = base[di].depth + (reference != nullptr ? reference->rule_count : 0);
          better = steps < existing->steps || (steps == existing->steps && depth < existing->depth());
        }
        if (reference != nullptr && reference->confirms) {
          existing->confirmed_len = std::max(existing->confirmed_len, matched_len);
        }
        if (better) {
          existing->matched_len = matched_len;
          existing->base = base;
          existing->index = di;
          existing->form = form;
          existing->term = &term;
          existing->store_index = store_index;
          existing->steps = steps;
          existing->reference = reference;
        }
      } else {
        index.try_emplace(h, static_cast<uint32_t>(candidates.size()));
        candidates.push_back(Candidate{.matched_len = matched_len,
                                       .base = base,
                                       .index = di,
                                       .form = form,
                                       .term = &term,
                                       .store_index = store_index,
                                       .steps = steps,
                                       .dict_rank = rank,
                                       .reference = reference,
                                       .confirmed_len = reference != nullptr && reference->confirms ? matched_len : 0});
      }
    }
    term_store.push_back(std::move(terms));
  };

  // A term is kept when the form's conditions are 0 or overlap the conditions
  // of its rows' `rules` tags under this pack's conditions (section 9.4), or
  // when it comes from a dictionary in pos_filter_exempt. With untaggedTerms
  // "pass", a row without tags carries D, the bits of every dictionary-form
  // condition, so it matches every form but one that holds only
  // intermediate conditions.
  const bool pass_untagged = pack.untagged_terms == lang::UntaggedTerms::Pass;
  const uint32_t untagged_mask = pass_untagged && transforms != nullptr ? transforms->dictionary_form_mask() : 0;
  const auto row_conditions = [&](std::string_view rules) {
    if (pass_untagged && lang::untagged(rules)) {
      return untagged_mask;
    }
    uint32_t bits = 0;
    each_token(rules, [&](std::string_view tag) { bits |= transforms->dictionary_form_bits(tag); });
    return bits;
  };
  const auto filter_by_pos = [&](RawTerms& terms, uint32_t conditions) {
    if (conditions == 0 || transforms == nullptr) {
      return;
    }
    std::erase_if(terms.terms, [&](const RawTerm& term) {
      uint32_t dict_conditions = 0;
      for (uint32_t i = term.first_glossary; i != UINT32_MAX; i = terms.glossaries[i].next) {
        if (!exempt.empty() && std::ranges::find(exempt, terms.glossaries[i].dict_name) != exempt.end()) {
          return false;
        }
        dict_conditions |= row_conditions(terms.glossaries[i].rules);
      }
      return (dict_conditions & conditions) == 0;
    });
  };

  // The filter for one row: a form-of reference is followed only when the
  // row naming it passes for the deinflection that found it, as Yomitan
  // follows the references of the entries its filter kept.
  const auto row_passes = [&](uint32_t conditions, const std::string* dict_name, std::string_view rules) {
    if (conditions == 0 || transforms == nullptr) {
      return true;
    }
    if (!exempt.empty() && std::ranges::find(exempt, dict_name) != exempt.end()) {
      return true;
    }
    return (row_conditions(rules) & conditions) != 0;
  };

  const auto note_references = [&](size_t matched_len, const Deinflection* base, uint32_t di, int steps) {
    for (const RawFormOfRow& row : form_of_rows) {
      if (!row_passes(base[di].conditions, row.dict_name, row.rules)) {
        continue;
      }
      references.clear();
      DictionaryQuery::read_form_of(row, pins, references);
      for (auto& reference : references) {
        if (!followed) {
          followed = std::make_unique<std::deque<Followed>>();
        }
        followed->push_back(Followed{.matched_len = matched_len,
                                     .base = base,
                                     .index = di,
                                     .steps = steps,
                                     .text = std::move(reference.form_of),
                                     .first_rule = static_cast<uint32_t>(followed_rules.size()),
                                     .rule_count = static_cast<uint32_t>(reference.rules.size()),
                                     .confirms = base[di].depth == 0});
        std::ranges::move(reference.rules, std::back_inserter(followed_rules));
      }
    }
  };

  const auto collect_metadata = [&](RawTerms& terms) {
    for (auto& term : terms.terms) {
      if (term.merged != UINT32_MAX) {
        query_.collect_frequencies(term.expression, terms.normalized->merged_readings[term.merged], term.frequencies, pins,
                                   selection);
        query_.collect_pitches(term.expression, terms.normalized->merged_readings[term.merged], term.pitches, pins,
                               selection);
      } else if (selection.all) {
        query_.collect_frequencies(term.expression, term.reading, term.frequencies, pins);
        query_.collect_pitches(term.expression, term.reading, term.pitches, pins);
      } else {
        const std::string_view reading = term.reading;
        query_.collect_frequencies(term.expression, std::span(&reading, 1), term.frequencies, pins, selection);
        query_.collect_pitches(term.expression, std::span(&reading, 1), term.pitches, pins, selection);
      }
    }
  };

  // Looks up one form of a deinflection of a prefix's variant and merges its
  // terms into the candidates.
  auto merge = [&](size_t matched_len, const Deinflection* base, uint32_t di, const std::string& form, int steps) {
    // Most deinflected forms name no entry of their part of speech; read
    // the frequencies and pitches of only the terms the filter keeps.
    form_of_rows.clear();
    auto terms = query_.query_raw(form, pins, selection, false, normalizer, form_of_out);
    if (!form_of_rows.empty()) {
      note_references(matched_len, base, di, steps);
    }
    filter_by_pos(terms, base[di].conditions);
    collect_metadata(terms);
    add_terms(matched_len, base, di, &form, steps, std::move(terms), SIZE_MAX);
  };

  // Follows the form-of references noted since the last call, each as a
  // deinflection to its text with no conditions (Yomitan's
  // _getDictionaryDeinflections). One hop: the references of the rows they
  // reach are not followed.
  const auto follow_noted = [&]() {
    if (!followed) {
      return;
    }
    for (; followed_done < followed->size(); ++followed_done) {
      const Followed& reference = (*followed)[followed_done];
      form_of_rows.clear();
      auto terms = query_.query_raw(reference.text, pins, selection, false, normalizer, &form_of_rows);
      collect_metadata(terms);
      add_terms(reference.matched_len, reference.base, reference.index, &reference.text, reference.steps,
                std::move(terms), SIZE_MAX, &reference);
    }
  };

  // Merges a deinflection, through the pack's postprocessors when it has any
  // (section 9.3), and records the forms that need no part of speech for the
  // metadata-only pass.
  auto merge_deinflection = [&](size_t matched_len, const Deinflection* base, uint32_t di, int steps, bool probe) {
    if (pack.postprocessors.empty()) {
      merge(matched_len, base, di, base[di].text, steps);
      if (probe && metadata_only && base[di].conditions == 0) {
        metadata_probes.push_back(
            {.length = matched_len, .base = base, .index = di, .form = &base[di].text, .steps = steps});
      }
      return;
    }
    if (!forms) {
      forms = std::make_unique<std::deque<std::string>>();
    }
    for (auto& variant : lang::process_text(pack.postprocessors, base[di].text, enabled)) {
      forms->push_back(std::move(variant.text));
      const std::string& form = forms->back();
      merge(matched_len, base, di, form, steps + variant.steps);
      if (probe && metadata_only && base[di].conditions == 0) {
        metadata_probes.push_back(
            {.length = matched_len, .base = base, .index = di, .form = &form, .steps = steps + variant.steps});
      }
    }
  };

  // The texts long keys are recognised by: processed variants of the first
  // eight code points, written as dictionaries write keys (section 9.1).
  const auto add_prefix_variants = [&](const std::vector<lang::TextVariant>& variants) {
    prefix_variants.reserve(variants.size());
    for (const auto& variant : variants) {
      if (pack.postprocessors.empty()) {
        prefix_variants.push_back(variant.text);
      } else {
        for (auto& post : lang::process_text(pack.postprocessors, variant.text, enabled)) {
          prefix_variants.push_back(std::move(post.text));
        }
      }
    }
  };

  const bool word_resolution = pack.resolution == lang::Resolution::Word;

  // Scans one prefix of the input: every processed variant, deinflected, looked
  // up, and merged into the candidates keeping the longest matched form.
  auto scan_prefix = [&](std::string_view search_str, size_t codepoints) {
    auto processor_results = lang::process_text(pack.preprocessors, search_str, enabled);
    if (!word_resolution && codepoints == scan_index::long_key_prefix_codepoints) {
      add_prefix_variants(processor_results);
    }
    for (auto& variant : processor_results) {
      Deinflections deinflection_results;
      if (transforms != nullptr) {
        transforms->deinflect(variant.text, deinflection_results, enabled_transforms_ptr);
      } else {
        deinflection_results.push_back(Deinflection{variant.text, 0, Deinflection::npos, Deinflection::none, 0});
      }
      const Deinflection* base = deinflection_results.data();
      for (uint32_t di = 0; di < deinflection_results.size(); ++di) {
        merge_deinflection(search_str.size(), base, di, variant.steps, true);
      }
      deinflection_store.push_back(std::move(deinflection_results));
    }
    if (!passes.empty()) {
      scanned.push_back({.length = search_str.size(), .variants = std::move(processor_results)});
    }
  };

  if (!word_resolution) {
    size_t start = std::min(scan_length, text_len);
    auto search_str_it = lookup_string.begin();
    utf8::advance(search_str_it, start, lookup_string.end());
    for (size_t i = start; i > 0; i--) {
      scan_prefix(std::string_view(lookup_string.begin(), search_str_it), i);
      if (i > 1) {
        utf8::prior(search_str_it, lookup_string.begin());
      }
    }

    // Long keys (see src/scan_index.hpp): when the input begins like a key that
    // is longer than the scan just done, scan the longer prefixes too, up to that
    // key's length plus room for an inflected ending. A scan shorter than eight
    // code points never produced the variants, so it never extends -- a caller
    // asking for one character wants one character.
    if (!prefix_variants.empty() && text_len > scan_length) {
      size_t long_key = 0;
      for (const auto& variant : prefix_variants) {
        long_key = std::max(long_key, query_.long_key_length(variant, selection));
      }
      if (long_key > scan_length) {
        const size_t extended = std::min(long_key + scan_index::inflection_slack_codepoints, text_len);
        auto extended_it = lookup_string.begin();
        utf8::advance(extended_it, extended, lookup_string.end());
        for (size_t i = extended; i > scan_length; i--) {
          scan_prefix(std::string_view(lookup_string.begin(), extended_it), i);
          utf8::prior(extended_it, lookup_string.begin());
        }
      }
    }
  } else {
    // Word resolution (section 9.2): only prefixes that end at a word
    // boundary, and a window that grows to the end of the word scan_length
    // ends in.
    std::vector<char32_t> cps;
    std::vector<size_t> offsets;
    cps.reserve(text_len);
    offsets.reserve(text_len + 1);
    for (auto it = lookup_string.begin(); it != lookup_string.end();) {
      offsets.push_back(static_cast<size_t>(it - lookup_string.begin()));
      cps.push_back(utf8::next(it, lookup_string.end()));
    }
    offsets.push_back(lookup_string.size());
    const auto word_char = [&](size_t k) { return pack.word_characters.contains(cps[k]); };
    const auto is_word = [&](size_t k) {
      if (word_char(k)) return true;
      return pack.word_internal && pack.word_internal->contains(cps[k]) && k > 0 && k + 1 < cps.size() &&
             word_char(k - 1) && word_char(k + 1);
    };
    const auto boundary = [&](size_t p) { return p == text_len || (p > 0 && is_word(p - 1) && !is_word(p)); };
    size_t window = std::min(scan_length, text_len);
    if (window > 0 && window < text_len && is_word(window - 1) && is_word(window)) {
      while (window < text_len && is_word(window)) {
        ++window;
      }
    }
    if (window >= scan_index::long_key_prefix_codepoints) {
      add_prefix_variants(lang::process_text(
          pack.preprocessors, std::string_view(lookup_string.data(), offsets[scan_index::long_key_prefix_codepoints]),
          enabled));
    }
    for (size_t p = window; p > 0; --p) {
      if (boundary(p)) {
        scan_prefix(std::string_view(lookup_string.data(), offsets[p]), p);
      }
    }
    if (!prefix_variants.empty() && text_len > scan_length) {
      size_t long_key = 0;
      for (const auto& variant : prefix_variants) {
        long_key = std::max(long_key, query_.long_key_length(variant, selection));
      }
      if (long_key > scan_length) {
        const size_t extended = std::min(long_key + scan_index::inflection_slack_codepoints, text_len);
        for (size_t p = extended; p > window; --p) {
          if (boundary(p)) {
            scan_prefix(std::string_view(lookup_string.data(), offsets[p]), p);
          }
        }
      }
    }
  }

  // The references the rows of the scan named, followed after every
  // deinflection of the scan, as Yomitan adds its dictionary deinflections
  // after the algorithm's (section 9.10).
  follow_noted();

  // Variant passes (NekoPara's cat speech, LookupOptions::neko_speech): a
  // pass's reading counts only for a prefix longer than every ordinary match,
  // long keys included, so it can only add a term or lengthen one; every
  // ordinary result above is otherwise kept as it is.
  if (!passes.empty()) {
    size_t ordinary_len = 0;
    for (const auto& candidate : candidates) {
      ordinary_len = std::max(ordinary_len, candidate.matched_len);
    }
    for (auto& prefix : scanned) {
      if (prefix.length <= ordinary_len) {
        continue;
      }
      for (const auto& variant : prefix.variants) {
        for (const lang::VariantPass* pass : passes) {
          std::vector<std::string> readings;
          pass->builtin->variants(variant.text, readings);
          if (readings.empty()) {
            continue;
          }
          Deinflections deinflection_results;
          for (auto& reading : readings) {
            if (transforms != nullptr) {
              transforms->deinflect_from_step(std::move(reading), pass->step, deinflection_results,
                                              enabled_transforms_ptr);
            } else if (!reading.empty()) {
              deinflection_results.push_back(Deinflection{std::move(reading), 0, Deinflection::npos,
                                                          Deinflection::step_base + pass->step, 1});
            }
          }
          if (deinflection_results.empty()) {
            continue;
          }
          const Deinflection* base = deinflection_results.data();
          for (uint32_t di = 0; di < deinflection_results.size(); ++di) {
            merge_deinflection(prefix.length, base, di, variant.steps, false);
          }
          deinflection_store.push_back(std::move(deinflection_results));
        }
      }
    }
  }

  // The references the rows the passes found named.
  follow_noted();

  // Terms only frequency and pitch dictionaries have
  // (LookupOptions::metadata_only_terms). A frequency or pitch row has no part
  // of speech, so, whatever the pack's untaggedTerms, it answers only the
  // deinflections that need none: the text as it is written, after
  // preprocessing, and the few rules that carry none, such as kansai-ben -うたら
  // for -ったら. Each reading the rows name is one term, with the rows for that
  // reading and those without one, unless a term with glossaries is that text
  // with that reading: it has those rows already. Rows without a reading are a
  // term of the text read as itself only when they name none and no term with
  // glossaries is written that way, for the same reason. These terms are ranked
  // after the terms with glossaries that read as far (the merge below).
  if (metadata_only) {
    const auto has_glossaries = [](const Candidate& c) { return c.term->first_glossary != UINT32_MAX; };
    const auto defined_as = [&](std::string_view text) {
      return std::ranges::any_of(candidates,
                                 [&](const Candidate& c) { return has_glossaries(c) && c.term->expression == text; });
    };
    for (const auto& probe : metadata_probes) {
      const std::string& text = *probe.form;
      bool reading_less = false;
      // The terms view these strings, which stay where they are when the
      // store grows.
      auto& readings =
          metadata_reading_store.emplace_back(query_.metadata_readings(text, pins, selection, reading_less));
      if (readings.empty() && reading_less && !defined_as(text)) {
        readings.emplace_back(text);
      }
      for (size_t i = 0; i < readings.size(); ++i) {
        RawTerm term{.expression = text,
                     .reading = readings[i],
                     .score = 0,
                     .first_glossary = UINT32_MAX,
                     .last_glossary = UINT32_MAX,
                     .frequencies = {},
                     .pitches = {}};
        RawTerms terms;
        if (normalizer != nullptr) {
          term.merged = 0;
          terms.normalized = std::make_unique<NormalizedReadings>();
          terms.normalized->normalized.push_back(normalizer->normalize(readings[i]));
          terms.normalized->merged_readings.push_back({term.reading});
        }
        terms.terms.push_back(std::move(term));
        const RawTerm& entry = terms.terms.front();
        const std::string_view key = reading_key(terms, entry);
        const Candidate* existing = find_candidate(key_hash(entry.expression, key), entry, key);
        if (existing != nullptr && has_glossaries(*existing)) {
          continue;
        }
        collect_metadata(terms);
        if (terms.terms.front().frequencies.empty() && terms.terms.front().pitches.empty()) {
          continue;
        }
        add_terms(probe.length, probe.base, probe.index, probe.form, probe.steps, std::move(terms),
                  term_dictionary_count + i);
        metadata_added = true;
      }
    }
  }

  std::optional<std::string_view> frequency_dictionary;
  bool frequency_descending = false;
  switch (options.frequency_order) {
    case LookupFrequencyOrder::Auto:
      // No single sort dictionary is chosen, so no frequency separates the
      // candidates: go straight to the caller's dictionary order below, as
      // Yomitan does when its sort frequency dictionary is unset. Its
      // _sortTermDictionaryEntries then leaves frequencyOrder tied for every
      // entry and dictionaryIndex (the enabled-dictionary order) decides
      // (yomidevs/yomitan@67db60d). Consulting every frequency dictionary here
      // instead let a surface-form corpus value a name shares across its
      // readings mask that order; see bee-san/hachidori#575.
      break;
    case LookupFrequencyOrder::Ascending:
    case LookupFrequencyOrder::Descending:
      if (options.frequency_dictionary.has_value()) {
        const DictionaryQuery::Dictionary* selected = nullptr;
        if (selection.all) {
          const auto it = std::ranges::find(query_.freq_dicts_, *options.frequency_dictionary,
                                            &DictionaryQuery::Dictionary::name);
          selected = it == query_.freq_dicts_.end() ? nullptr : &*it;
        } else {
          for (const auto* dict : selection.freq) {
            if (dict->name == *options.frequency_dictionary) {
              selected = dict;
              break;
            }
          }
        }
        if (selected != nullptr) {
          frequency_dictionary = selected->name;
          frequency_descending = options.frequency_order == LookupFrequencyOrder::Descending;
        }
      }
      break;
    case LookupFrequencyOrder::Disabled:
      break;
  }
  std::string_view primary_reading;
  std::string primary_key;
  if (options.primary_reading.has_value()) {
    primary_reading = *options.primary_reading;
    if (normalizer != nullptr) {
      primary_key = normalizer->normalize(primary_reading);
      primary_reading = primary_key;
    }
  }
  // Each term dictionary's rank in the caller's order, keyed by the address of
  // its name (RawGlossary::dict_name points at the Dictionary::name the term
  // was read from). term_dicts_ is already in the order set_dict_order last
  // applied, and a selection lists its dictionaries in the request's order,
  // so the index is the caller's priority.
  ankerl::unordered_dense::map<const std::string*, size_t> dict_rank_by_name;
  dict_rank_by_name.reserve(term_dictionary_count);
  if (selection.all) {
    for (size_t rank = 0; rank < query_.term_dicts_.size(); ++rank) {
      dict_rank_by_name.try_emplace(&query_.term_dicts_[rank].name, rank);
    }
  } else {
    for (size_t rank = 0; rank < selected_terms.size(); ++rank) {
      dict_rank_by_name.try_emplace(&selected_terms[rank]->name, rank);
    }
  }
  for (auto& candidate : candidates) {
    const RawTerms& terms = term_store[candidate.store_index];
    for (uint32_t i = candidate.term->first_glossary; i != UINT32_MAX; i = terms.glossaries[i].next) {
      const auto it = dict_rank_by_name.find(terms.glossaries[i].dict_name);
      if (it != dict_rank_by_name.end()) {
        candidate.dict_rank = std::min(candidate.dict_rank, it->second);
      }
    }
  }

  const auto matches_primary_reading = [&](const Candidate& c) {
    if (normalizer == nullptr) {
      return c.term->reading == primary_reading;
    }
    return reading_key(term_store[c.store_index], *c.term) == primary_reading;
  };

  const size_t retained_count = std::min(candidates.size(), static_cast<size_t>(max_results));
  // Ties every key leaves go to the candidate found first (section 9.6),
  // except for a pack that reads form-of rows as terms (Japanese), whose ties
  // keep the order they have always had (the parity tests pin it).
  const bool discovery_order = follow;
  auto less = [frequency_dictionary, frequency_descending, primary_reading, discovery_order, &matches_primary_reading](
                  const Candidate& a, const Candidate& b) {
    if (!primary_reading.empty()) {
      const bool primary_a = matches_primary_reading(a);
      const bool primary_b = matches_primary_reading(b);
      if (primary_a != primary_b) {
        return primary_a;
      }
    }

    if (a.matched_len != b.matched_len) {
      return a.matched_len > b.matched_len;
    }

    auto steps_a = a.steps;
    auto steps_b = b.steps;
    if (steps_a != steps_b) {
      return steps_a < steps_b;
    }

    auto trace_len_a = a.depth();
    auto trace_len_b = b.depth();
    if (trace_len_a != trace_len_b) {
      return trace_len_a < trace_len_b;
    }

    // A lemma the dictionary itself names as a form of the matched text comes
    // before one only the rules propose (puedo: poder before podar).
    if (a.confirmed() != b.confirmed()) {
      return a.confirmed();
    }

    auto match_a = a.term->expression == *a.form;
    auto match_b = b.term->expression == *b.form;
    if (match_a != match_b) {
      return match_a > match_b;
    }

    if (frequency_dictionary.has_value()) {
      const auto freq_a = get_freq_value_for_dict(*a.term, *frequency_dictionary, frequency_descending);
      const auto freq_b = get_freq_value_for_dict(*b.term, *frequency_dictionary, frequency_descending);
      if (freq_a.has_value() != freq_b.has_value()) {
        return freq_a.has_value();
      }
      if (freq_a.has_value() && *freq_a != *freq_b) {
        return frequency_descending ? *freq_a > *freq_b : *freq_a < *freq_b;
      }
    }

    // The caller's dictionary order breaks a tie the frequencies left, as
    // Yomitan ranks dictionaryIndex after frequencyOrder and before score.
    // When the active frequency ranking does not separate two readings (it
    // is equal, or neither reading is in it, as a surface frequency leaves
    // the readings of a name), the reading from the dictionary the user
    // ranked highest comes first instead of an arbitrary one.
    if (a.dict_rank != b.dict_rank) {
      return a.dict_rank < b.dict_rank;
    }

    if (a.term->score != b.term->score) {
      return a.term->score > b.term->score;
    }

    auto a_reading_expr_match = a.term->expression == a.term->reading;
    auto b_reading_expr_match = b.term->expression == b.term->reading;
    if (a_reading_expr_match != b_reading_expr_match) {
      return a_reading_expr_match > b_reading_expr_match;
    }
    // Candidates are elements of one vector, in the order they were found.
    return discovery_order && &a < &b;
  };

  const auto by_key = [&](uint32_t ia, uint32_t ib) { return key_less(*candidates[ia].term, *candidates[ib].term); };
  const auto by_rank = [&](uint32_t ia, uint32_t ib) { return less(candidates[ia], candidates[ib]); };
  std::vector<uint32_t> order(candidates.size());
  std::iota(order.begin(), order.end(), uint32_t{0});
  // Metadata-only terms are ranked apart and merged in, so the terms with
  // glossaries keep exactly the order they have without them.
  auto metadata = std::ranges::subrange(order.end(), order.end());
  if (metadata_added) {
    metadata = std::ranges::stable_partition(
        order, [&](uint32_t i) { return candidates[i].term->first_glossary != UINT32_MAX; });
  }
  const auto ordinary_end = metadata.begin();
  std::ranges::sort(order.begin(), ordinary_end, by_key);
  const auto ordinary_middle = std::ranges::next(
      order.begin(),
      static_cast<std::ptrdiff_t>(std::min(retained_count, static_cast<size_t>(ordinary_end - order.begin()))));
  std::ranges::partial_sort(order.begin(), ordinary_middle, ordinary_end, by_rank);
  std::span<const uint32_t> kept(order.begin(), ordinary_middle);
  std::vector<uint32_t> merged;
  if (!metadata.empty()) {
    std::ranges::sort(metadata, by_key);
    std::ranges::stable_sort(metadata, by_rank);
    // A metadata-only term goes after the terms with glossaries that read as
    // far and before those that read less, so it moves none of them: it comes
    // first only where it reads further than all of them, or has the primary
    // reading they lack. Both lists are sorted by `less`, whose first keys
    // these are, and a merge keeps the first list's terms first on a tie.
    const auto by_length = [&](uint32_t ia, uint32_t ib) {
      const Candidate& a = candidates[ia];
      const Candidate& b = candidates[ib];
      if (!primary_reading.empty()) {
        const bool primary_a = matches_primary_reading(a);
        const bool primary_b = matches_primary_reading(b);
        if (primary_a != primary_b) {
          return primary_a;
        }
      }
      return a.matched_len > b.matched_len;
    };
    merged.reserve(metadata.size() + kept.size());
    std::ranges::merge(kept, metadata, std::back_inserter(merged), by_length);
    merged.resize(std::min(merged.size(), retained_count));
    kept = merged;
  }

  // The trace of a kept result, in application order, with its pack's ids,
  // names and descriptions.
  std::vector<uint32_t> steps;
  const auto trace_of = [&](const Candidate& c) {
    steps.clear();
    for (const Deinflection* n = &c.deinflection();; n = &c.base[n->parent]) {
      if (n->via != Deinflection::none) {
        steps.push_back(transforms != nullptr ? transforms->step_of(n->via) : n->via - Deinflection::step_base);
      }
      if (n->parent == Deinflection::npos) {
        break;
      }
    }
    std::vector<TransformGroup> trace;
    trace.reserve(steps.size() + (c.reference != nullptr ? c.reference->rule_count : 0));
    for (auto it = steps.rbegin(); it != steps.rend(); ++it) {
      const auto& step = pack.trace_steps[*it];
      trace.push_back(TransformGroup{.name = step.name, .description = step.description, .id = step.id});
    }
    // A form-of reference's rules follow, as the dictionary names them.
    if (c.reference != nullptr) {
      for (uint32_t k = 0; k < c.reference->rule_count; ++k) {
        const std::string& rule = followed_rules[c.reference->first_rule + k];
        trace.push_back(TransformGroup{.name = rule, .description = {}, .id = rule, .from_dictionary = true});
      }
    }
    return trace;
  };

  std::vector<LookupResult> retained;
  retained.reserve(kept.size());
  for (const uint32_t i : kept) {
    Candidate& c = candidates[i];
    retained.push_back(LookupResult{.matched = lookup_string.substr(0, c.matched_len),
                                    .deinflected = *c.form,
                                    .trace = trace_of(c),
                                    .term = query_.build_term(term_store[c.store_index], *c.term, pins),
                                    .preprocessor_steps = c.steps});
  }

  for (auto& r : retained) {
    query_.materialize(r.term);
  }

  return retained;
}
