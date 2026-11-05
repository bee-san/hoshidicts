// SPDX-License-Identifier: GPL-3.0-or-later
// Deinflection rules of a language pack and the generic deinflector that runs
// them (docs/languages.md, section 7).
#pragma once

#include <ankerl/unordered_dense.h>

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

#include "bounds.hpp"
#include "classes.hpp"
#include "regex.hpp"
#include "steps.hpp"

namespace hoshidicts::lang {

struct Condition {
  std::string key;
  std::string name;
  bool dictionary_form = false;
  bool leaf = false;  // owns a bit (has no subConditions)
  uint32_t bits = 0;
};

enum class RuleType : unsigned char { Suffix, Prefix, WholeWord, Circumfix, Replace, Phrasal, InterposedObject, Pattern };
enum class Occurrence : unsigned char { All, First, Last };

struct StringHash {
  using is_transparent = void;
  using is_avalanching = void;
  uint64_t operator()(std::string_view s) const noexcept { return ankerl::unordered_dense::hash<std::string_view>{}(s); }
};
using WordList = ankerl::unordered_dense::set<std::string, StringHash, std::equal_to<>>;

struct StemChange {
  std::vector<std::string> from;
  std::string to;
  bool last = false;
  const CharClass* between = nullptr;
  size_t between_min_length = 1;
};

// What a rule needs beyond its type, affixes and conditions: stem
// constraints, stem changes, word lists, a pattern and `then` steps. Plain
// suffix and whole-word rules, all of Japanese, have none, so a rule holds
// it by pointer.
struct RuleExtra {
  // Stem constraints (section 7.3).
  size_t stem_min_length = 0;
  const CharClass* stem_characters = nullptr;
  const CharClass* stem_contains = nullptr;
  const CharClass* stem_starts_with = nullptr;
  const CharClass* stem_ends_with = nullptr;
  const CharClass* stem_not_starts_with = nullptr;
  const CharClass* stem_not_ends_with = nullptr;
  std::optional<std::string> stem_starts_with_text;
  std::optional<std::string> stem_not_starts_with_text;
  std::unique_ptr<StemChange> stem_change;
  Occurrence occurrence = Occurrence::All;
  bool not_at_start = false;
  const WordList* followed_by = nullptr;
  const WordList* particles = nullptr;
  const WordList* guard_words = nullptr;
  const WordList* verb_guard_words = nullptr;  // interposedObject's optional verbGuardWords
  std::unique_ptr<Pattern> pattern;
  StepList then;
};

struct Rule {
  RuleType type = RuleType::Suffix;
  bool stem_checks = false;    // extra holds a stem constraint
  bool has_stem_change = false;
  bool has_then = false;
  bool anchor_prefix = false;  // a pattern anchored at the start
  uint16_t transform = 0;
  uint32_t conditions_in = 0;
  uint32_t conditions_out = 0;
  // Index of the rule in its transform (for error messages and per-rule reports).
  uint32_t index_in_transform = 0;
  // suffix, prefix, wholeWord, replace, phrasal: `inflected` in a and
  // `deinflected` in b. circumfix: the prefix pair in a and b, the suffix
  // pair in c and d. pattern: the anchor in a.
  std::string a;
  std::string b;
  std::string c;
  std::string d;
  std::unique_ptr<RuleExtra> extra;  // null when the rule needs none of it

  RuleExtra& more() {
    if (!extra) extra = std::make_unique<RuleExtra>();
    return *extra;
  }
};

struct Transform {
  std::string id;
  std::string name;
  std::string description;
  std::string source;
  bool optional = false;
};

// One deinflection: a text, its conditions, and how it was reached. The
// trace is the chain of `parent`s: `via` is the rule that produced the text
// from its parent's text, or a trace step without a rule (a variant pass
// that starts a chain), or none for the text itself.
struct Deinflection {
  std::string text;
  uint32_t conditions = 0;
  uint32_t parent = npos;
  uint32_t via = none;
  uint32_t depth = 0;  // trace length

  static constexpr uint32_t npos = UINT32_MAX;
  static constexpr uint32_t none = UINT32_MAX;
  // A `via` at or above this is trace step (via - step_base) with no rule.
  static constexpr uint32_t step_base = 0x80000000u;
};
using Deinflections = std::vector<Deinflection>;

// How a bound cut a search short: the bound that stopped it (results or
// work), or else the first that dropped an output; the output it dropped,
// which rule `rule` gave from deinflection `parent` (an index into the
// search's list). When the work budget ran out, `rule` is the rule the search
// could not try, `text` is empty, and `costliest` names the rules that used
// the most of the search's work, with the units each used, most first (at
// most three). The conformance test fails a pack whose inputs reach a bound
// (section 12.1).
struct BoundHit {
  enum class Bound : unsigned char { None, Growth, Depth, Results, Work };
  Bound bound = Bound::None;
  uint32_t parent = Deinflection::npos;
  uint32_t rule = 0;
  std::string text;
  std::vector<std::pair<uint32_t, size_t>> costliest;

  explicit operator bool() const { return bound != Bound::None; }
};

class TransformSet {
 public:
  // Built by the pack parser (pack.cpp).
  std::vector<Condition> conditions;
  std::vector<Transform> transforms;
  std::vector<Rule> rules;  // in file order, cross products expanded
  ankerl::unordered_dense::map<std::string, std::unique_ptr<WordList>, StringHash, std::equal_to<>> word_lists;
  std::vector<std::unique_ptr<CharClass>> owned_classes;
  const CharClass* word_characters = nullptr;
  bool has_optional_transforms = false;

  // Builds the tries; call once the rules are in place.
  void index();

  // Every deinflection of `text`, depth first within SearchBounds (section
  // 7.4), appended to `out` after a result for `text` itself. `enabled`
  // lists, by transform index, the optional transforms a request turned on
  // (null: none). `hit`, when given and still empty, receives how a bound cut
  // the search short (BoundHit). `budget`, when given, is the work budget the
  // search shares with others; otherwise it has one of its own.
  void deinflect(const std::string& text, Deinflections& out, const std::vector<bool>* enabled = nullptr,
                 BoundHit* hit = nullptr, SearchBudget* budget = nullptr) const;
  // The same for a text a variant pass produced: its first trace step is
  // `step` (a trace step index), with no rule.
  void deinflect_from_step(std::string text, uint32_t step, Deinflections& out,
                           const std::vector<bool>* enabled = nullptr, BoundHit* hit = nullptr,
                           SearchBudget* budget = nullptr) const;

  // The trace step (transform index, or a pass step) of a deinflection's `via`.
  uint32_t step_of(uint32_t via) const {
    return via >= Deinflection::step_base ? via - Deinflection::step_base : rules[via].transform;
  }

  uint32_t conditions_for_parts_of_speech(std::span<const std::string> tags) const;
  uint32_t conditions_for_parts_of_speech(std::span<const std::string_view> tags) const;
  uint32_t conditions_for_types(std::span<const std::string> names) const;
  uint32_t condition_bits(std::string_view name) const;  // 0 for an unknown name
  // A dictionary-form tag's bits, or 0.
  uint32_t dictionary_form_bits(std::string_view tag) const {
    for (const auto& [name, bits] : dictionary_forms_) {
      if (name == tag) return bits;
    }
    return 0;
  }
  // D: the bits of every condition with isDictionaryForm, expanded through
  // subConditions; a row without tags carries it under lookup.untaggedTerms
  // "pass" (docs/languages.md, sections 4.4 and 9.4).
  uint32_t dictionary_form_mask() const { return dictionary_form_mask_; }
  // The names of the leaf conditions set in `bits`, in declaration order.
  std::vector<std::string_view> condition_names(uint32_t bits) const;

 private:
  // A node's children are edges[child_begin, child_end), sorted by code point.
  struct TrieNode {
    uint32_t child_begin = 0;
    uint32_t child_end = 0;
    uint32_t rules_begin = 0;
    uint32_t rules_end = 0;
  };
  struct Edge {
    char32_t c;
    uint32_t child;
  };
  // A rule at a trie node: what the fast path of a plain suffix needs.
  struct NodeRule {
    uint32_t rule;
    uint32_t conditions_in;
    uint32_t conditions_out;
    uint16_t transform;
    // 0: a suffix without constraints, stem change or `then`; 1: a whole
    // word without `then`; 2: anything else (Rule decides).
    unsigned char kind;
    std::string_view to;
  };
  struct Trie {
    std::vector<TrieNode> nodes{1};
    std::vector<Edge> edges;
    std::vector<NodeRule> node_rules;
    bool empty() const { return node_rules.empty(); }
    // The child of `node` on `c`, or UINT32_MAX: a scan of a few edges, a
    // binary search of many.
    uint32_t child(uint32_t node, char32_t c) const {
      const TrieNode& n = nodes[node];
      uint32_t lo = n.child_begin;
      uint32_t hi = n.child_end;
      while (hi - lo > 8) {
        const uint32_t mid = lo + (hi - lo) / 2;
        if (edges[mid].c < c) {
          lo = mid + 1;
        } else if (edges[mid].c > c) {
          hi = mid;
        } else {
          return edges[mid].child;
        }
      }
      for (uint32_t e = lo; e < hi; ++e) {
        if (edges[e].c == c) return edges[e].child;
      }
      return UINT32_MAX;
    }
  };
  // A trie while it is built: each node's edges as a list through `next`.
  struct TrieBuilder {
    struct BuildEdge {
      char32_t c;
      uint32_t child;
      uint32_t next;
    };
    std::vector<uint32_t> first_edge{UINT32_MAX};  // per node
    std::vector<BuildEdge> edges;
    std::vector<std::pair<uint32_t, uint32_t>> pending;  // (node, rule)
  };
  static void insert(TrieBuilder& builder, std::u32string_view key, uint32_t rule);
  void finish(Trie& trie, TrieBuilder& builder);

  struct Run;
  struct Frame;
  struct Match;
  struct Stack;
  void search(Run& run) const;
  size_t push_frame(Stack& stack, const std::string& text, uint32_t index) const;
  bool next_output(Run& run, Stack& stack, Frame& frame, std::string& output, uint32_t& rule,
                   uint32_t& conditions_out) const;
  bool apply(Run& run, const Rule& rule, const std::string& text, size_t matched, std::string& out) const;
  bool stem_ok(Run& run, const Rule& rule, std::string_view stem) const;
  bool change_stem(Run& run, const Rule& rule, std::string_view stem, std::string& out) const;
  bool finish_then(Run& run, const Rule& rule, std::string& text) const;

  Trie suffixes_;
  Trie prefixes_;
  Trie phrasal_;
  std::vector<uint32_t> unindexed_;  // replace and interposedObject rules, in file order
  std::vector<std::pair<std::string, uint32_t>> dictionary_forms_;
  uint32_t dictionary_form_mask_ = 0;
};

}  // namespace hoshidicts::lang
