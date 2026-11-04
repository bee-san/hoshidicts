// SPDX-License-Identifier: GPL-3.0-or-later
// Pack test files (docs/languages.md, section 12.2) and how a deinflection
// corpus row is decided, shared by language-conformance-test and
// `hoshidicts-cli eval-language`.
#pragma once

#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "pack.hpp"

namespace hoshidicts::lang {

struct CorpusRow {
  size_t line = 0;
  std::string category;
  bool valid = true;
  std::string source;
  std::string term;
  std::optional<std::string> rule;                  // nullopt for `*`
  std::optional<std::vector<std::string>> reasons;  // nullopt for `*`; forward order (newest first)
};

struct TextRow {
  size_t line = 0;
  std::string category;
  bool valid = true;
  std::string input;
  std::string variant;
};

struct LookupRow {
  size_t line = 0;
  std::string category;
  bool valid = true;
  std::string text;
  std::string expression;
  std::string matched;
};

// The options a test file runs with (section 12.2): every optional
// processor, transform and variant pass, or none of them, the pack's
// defaults, when the file's first line is `# options: default`.
enum class TestOptions { All, Default };
inline constexpr std::string_view default_options_line = "# options: default";

// Readers for the three formats; false with `error` (file:line: reason) on a
// malformed file. Lines starting with # are comments. With `options`, the
// first line is also read as the file's options: `options` receives
// TestOptions::Default for `# options: default`, and any other comment whose
// first word is `option` or `options`, in any case, is an error, so the usual
// misspellings never leave a file in the wrong mode.
bool read_corpus(const std::string& path, std::vector<CorpusRow>& rows, std::string* error,
                 TestOptions* options = nullptr);
bool read_text_tsv(const std::string& path, std::vector<TextRow>& rows, std::string* error,
                   TestOptions* options = nullptr);
bool read_lookup_tsv(const std::string& path, std::vector<LookupRow>& rows, std::string* error,
                     TestOptions* options = nullptr);

// One deinflection of a corpus source: its text (postprocessed), conditions,
// the rules on its path (indices into TransformSet::rules) and its trace ids
// in application order.
struct SourceDeinflection {
  std::string text;
  uint32_t conditions = 0;
  std::vector<uint32_t> rules;
  std::vector<std::string> trace;
};

// What the deinflection searches of a source or a lookup did (section 7.4).
// The first that a bound cut short: the bound, and the chain from the text it
// started from (a processed variant, or the variant a pass's reading came
// from) to the output the bound dropped: steps[k] (a transform id with the
// rule's index in it, `past[2]`, or a variant pass's id) gives texts[k + 1]
// from texts[k], and the last text is the dropped output, or empty for the
// rule the work budget left untried. For the results and work bounds,
// `busiest` names the rules that made the most of that search's
// deinflections, with how many each made, most first (at most three). When
// the searches of one lookup together need more work than its budget,
// though no single search does, the bound is Work with no chain. And over
// every search, how far they went: the most rules in a chain, the most code
// points an output added to the text its search started from, the most
// deinflections one search held, its text included; and the work the
// searches used together (units of SearchBounds), and how many they were.
struct SourceSearch {
  BoundHit::Bound bound = BoundHit::Bound::None;
  std::vector<std::string> steps;
  std::vector<std::string> texts;
  std::vector<std::pair<std::string, size_t>> busiest;
  size_t depth = 0;
  size_t growth = 0;
  size_t results = 0;
  size_t work = 0;
  size_t searches = 0;
};

// Adds one search to `search`: list[begin, end) is what TransformSet::deinflect
// or deinflect_from_step appended, `hit` what it reported (its first bound
// counts when `search` has none yet), `work` the units of its budget it used,
// and `from` the text a variant pass read when the search starts from its
// reading.
void add_search(const PackData& pack, const Deinflections& list, size_t begin, const BoundHit& hit, size_t work,
                const std::string& from, SourceSearch& search);

// The bound a search reached and its chain, "<bound>, after <n> steps:
// <chain> (dropped)", the chain abbreviated in its middle and each text
// longer than 48 code points shortened to its first 40, for the conformance
// test and the CLI.
std::string describe(const SourceSearch& search);

// Every deinflection of `source` as a corpus row sees it: through the
// preprocessors, the deinflector, every variant pass and the postprocessors,
// with every optional processor, transform and pass enabled (with
// TestOptions::Default, none of them), the whole source only (never shorter
// prefixes), the searches sharing one work budget as a lookup's do.
// `limit_reached` is set when a processor reached the variant limit.
// `search`, when given, is updated with what the searches did: its first
// bound is kept, and its counts become the larger of theirs and its.
std::vector<SourceDeinflection> deinflect_source(const PackData& pack, std::string_view source, bool* limit_reached,
                                                 TestOptions options = TestOptions::All,
                                                 SourceSearch* search = nullptr);

// What the searches of a text did, for lookup_search to reuse: the text's
// search with a budget of its own (a variant pass's reading counts as its
// text, since the bounds see the same search).
using SearchCache = std::map<std::string, SourceSearch, std::less<>>;

// The searches one lookup of `text` makes (src/lookup.cpp, section 9.1):
// every prefix of up to `scan` code points (only the whole text when `scan`
// is 0), each processed variant of it and each variant pass's readings of
// that, with every optional processor, transform and pass enabled (with
// TestOptions::Default, none of them), without their results. Word
// resolution searches only some of these prefixes, and a lookup reads a
// variant pass only where it can match more, so this is the most a lookup of
// `text` searches. Each searched text's search, with a budget of its own, is
// taken from `cache` when there and added to it otherwise. The result's work
// is the sum over the searches, which a lookup's one budget must cover; when
// it does not, though no search reached a bound, the result's bound is Work
// with no chain.
SourceSearch lookup_search(const PackData& pack, std::string_view text, size_t scan, TestOptions options,
                           SearchCache& cache);

// Inputs built from the affixes of every rule (the rules' half of
// tools/check-yomitan.mjs's ruleInputs, section 8.2) on stems of the pack's
// letters, which `words` (corpus strings) rank by use: each rule's inflected
// form on short stems and on the first short words, circumfix and phrasal
// frames, stemChange contexts and pattern anchors. In rule order, without
// repeats.
std::vector<std::string> affix_inputs(const PackData& pack, const std::vector<std::string>& words);

// Whether a corpus row passes (section 12.2). `matching`, when given,
// receives the deinflections that match the row's term, rule and reasons.
// Returns false with `error` for a row that names an unknown condition.
bool row_matches(const PackData& pack, const CorpusRow& row, const std::vector<SourceDeinflection>& deinflections,
                 std::vector<size_t>* matching, std::string* error);

}  // namespace hoshidicts::lang
