// SPDX-License-Identifier: GPL-3.0-or-later
#include "transforms.hpp"

#include <utf8.h>

#include <algorithm>
#include <array>

namespace hoshidicts::lang {

namespace {
constexpr size_t max_matches = 64;  // the affix limit (section 7.5)

size_t code_points(std::string_view s) {
  size_t n = 0;
  for (unsigned char c : s) n += (c & 0xC0) != 0x80;
  return n;
}

char32_t first_code_point(std::string_view s) {
  auto it = s.begin();
  return utf8::unchecked::next(it);
}

char32_t last_code_point(std::string_view s) {
  auto it = s.end();
  return utf8::unchecked::prior(it);
}

bool all_in(std::string_view s, const CharClass& cls) {
  for (auto it = s.begin(); it != s.end();) {
    if (!cls.contains(utf8::unchecked::next(it))) return false;
  }
  return true;
}

bool any_in(std::string_view s, const CharClass& cls) {
  for (auto it = s.begin(); it != s.end();) {
    if (cls.contains(utf8::unchecked::next(it))) return true;
  }
  return false;
}

bool all_words(std::string_view s, const CharClass* words) {
  if (s.empty()) return false;
  if (words == nullptr) return true;
  return all_in(s, *words);
}
}  // namespace

struct TransformSet::Run {
  Deinflections& out;
  const std::vector<bool>* enabled;
  BoundHit* hit;
  SearchBudget& budget;
  uint32_t root;                       // the deinflection the search started from
  size_t root_code_points = SIZE_MAX;  // counted when first needed
  size_t then_written = 0;             // code points the `then` steps of the current application wrote
  size_t regex_read = 0;               // code points its regular expressions read
  size_t rule_ops = 0;                 // operations of the current application (section 7.4)
  bool spent = false;                  // next_output found the budget spent
  // The units each rule used, when the search reports its bound (BoundHit).
  ankerl::unordered_dense::map<uint32_t, size_t>* costs = nullptr;

  // Charges `units`, or `ops` operations, to the budget, and to `rule` (or
  // to no rule: Deinflection::none).
  void spend(uint32_t rule, size_t units) {
    budget.spend(units);
    if (costs != nullptr && rule != Deinflection::none && units != 0) (*costs)[rule] += units;
  }
  void add_ops(uint32_t rule, size_t ops) {
    const size_t units = budget.add_ops(ops);
    if (costs != nullptr && rule != Deinflection::none && units != 0) (*costs)[rule] += units;
  }

  size_t root_length() {
    if (root_code_points == SIZE_MAX) root_code_points = code_points(out[root].text);
    return root_code_points;
  }
};

// The search keeps its own stack (section 7.4), so a long chain needs no more
// native or WebAssembly stack than a short one. A frame is a deinflection
// being expanded: the rules of its matches, then the rules no trie indexes.
struct TransformSet::Frame {
  uint32_t index;  // the deinflection
  uint32_t first;  // its matches are Stack::matches[first, end)
  uint32_t next;   // the match being applied, or end once only unindexed rules remain
  uint32_t end;
  uint32_t rule;   // the next rule: of matches[next] (into its trie's node_rules), or of unindexed_
  uint32_t space;  // the text's first space, for phrasal matches
};

// A trie node whose rules apply to a frame's text, and where the matched
// affix starts (suffixes, suffix anchors, phrasal endings) or ends (prefixes,
// prefix anchors).
struct TransformSet::Match {
  uint32_t node;
  uint32_t matched;
  uint32_t trie;  // 0: suffixes_, 1: prefixes_, 2: phrasal_
};

// Each thread reuses one Stack, so a search allocates nothing but its outputs
// (section 7.5). No rule application searches, but a search that started
// while the thread's Stack is in use would take a Stack of its own.
struct TransformSet::Stack {
  std::vector<Frame> frames;
  std::vector<Match> matches;
  bool busy = false;
};

void TransformSet::insert(TrieBuilder& builder, std::u32string_view key, uint32_t rule) {
  uint32_t node = 0;
  for (char32_t c : key) {
    uint32_t e = builder.first_edge[node];
    while (e != UINT32_MAX && builder.edges[e].c != c) e = builder.edges[e].next;
    if (e == UINT32_MAX) {
      const auto child = static_cast<uint32_t>(builder.first_edge.size());
      builder.first_edge.push_back(UINT32_MAX);
      builder.edges.push_back({c, child, builder.first_edge[node]});
      builder.first_edge[node] = static_cast<uint32_t>(builder.edges.size() - 1);
      node = child;
    } else {
      node = builder.edges[e].child;
    }
  }
  builder.pending.emplace_back(node, rule);
}

void TransformSet::finish(Trie& trie, TrieBuilder& builder) {
  const size_t node_count = builder.first_edge.size();
  trie.nodes.assign(node_count, TrieNode{});
  // Each node's edges, contiguous and sorted by code point, so a child is
  // found by binary search however many a node has (section 7.5).
  trie.edges.resize(builder.edges.size());
  uint32_t at = 0;
  for (size_t n = 0; n < node_count; ++n) {
    uint32_t count = 0;
    for (uint32_t e = builder.first_edge[n]; e != UINT32_MAX; e = builder.edges[e].next) ++count;
    trie.nodes[n].child_begin = at;
    trie.nodes[n].child_end = at + count;
    uint32_t slot = at + count;
    for (uint32_t e = builder.first_edge[n]; e != UINT32_MAX; e = builder.edges[e].next) {
      trie.edges[--slot] = Edge{builder.edges[e].c, builder.edges[e].child};
    }
    std::sort(trie.edges.begin() + at, trie.edges.begin() + at + count,
              [](const Edge& a, const Edge& b) { return a.c < b.c; });
    at += count;
  }
  // Each node's rules, in file order (pending is in rule order), placed by a
  // counting pass: node n's rules are node_rules[rules_begin, rules_end).
  std::vector<uint32_t> start(node_count + 1, 0);
  for (const auto& [node, rule] : builder.pending) ++start[node + 1];
  for (size_t n = 0; n < node_count; ++n) {
    start[n + 1] += start[n];
    trie.nodes[n].rules_begin = start[n];
    trie.nodes[n].rules_end = start[n];
  }
  trie.node_rules.resize(builder.pending.size());
  for (const auto& [node, index] : builder.pending) {
    const Rule& rule = rules[index];
    unsigned char kind = 2;
    if (rule.type == RuleType::Suffix && !rule.stem_checks && !rule.has_stem_change && !rule.has_then) {
      kind = 0;
    } else if (rule.type == RuleType::WholeWord && !rule.has_then) {
      kind = 1;
    }
    trie.node_rules[trie.nodes[node].rules_end++] = NodeRule{.rule = index,
                                                              .conditions_in = rule.conditions_in,
                                                              .conditions_out = rule.conditions_out,
                                                              .transform = rule.transform,
                                                              .kind = kind,
                                                              .to = rule.b};
  }
}

void TransformSet::index() {
  TrieBuilder suffix_builder;
  TrieBuilder prefix_builder;
  TrieBuilder phrasal_builder;
  // At most one node per affix code point.
  size_t affix_bytes = 1;
  for (const Rule& rule : rules) affix_bytes += rule.a.size() + rule.c.size();
  suffix_builder.first_edge.reserve(affix_bytes);
  suffix_builder.edges.reserve(affix_bytes);
  suffix_builder.pending.reserve(rules.size());
  std::u32string key;
  const auto reversed = [&key](std::string_view s) -> std::u32string_view {
    key.clear();
    utf8::utf8to32(s.begin(), s.end(), std::back_inserter(key));
    std::ranges::reverse(key);
    return key;
  };
  const auto forward = [&key](std::string_view s) -> std::u32string_view {
    key.clear();
    utf8::utf8to32(s.begin(), s.end(), std::back_inserter(key));
    return key;
  };
  for (uint32_t i = 0; i < rules.size(); ++i) {
    const Rule& rule = rules[i];
    switch (rule.type) {
      case RuleType::Suffix:
      case RuleType::WholeWord:
        insert(suffix_builder, reversed(rule.a), i);
        break;
      case RuleType::Circumfix:
        insert(suffix_builder, reversed(rule.c), i);
        break;
      case RuleType::Pattern:
        if (rule.anchor_prefix) {
          insert(prefix_builder, forward(rule.a), i);
        } else {
          insert(suffix_builder, reversed(rule.a), i);
        }
        break;
      case RuleType::Prefix:
        insert(prefix_builder, forward(rule.a), i);
        break;
      case RuleType::Phrasal:
        insert(phrasal_builder, reversed(rule.a), i);
        break;
      case RuleType::Replace:
      case RuleType::InterposedObject:
        unindexed_.push_back(i);
        break;
    }
  }
  finish(suffixes_, suffix_builder);
  finish(prefixes_, prefix_builder);
  finish(phrasal_, phrasal_builder);

  dictionary_forms_.clear();
  dictionary_form_mask_ = 0;
  for (const auto& condition : conditions) {
    if (condition.dictionary_form) {
      dictionary_forms_.emplace_back(condition.key, condition.bits);
      dictionary_form_mask_ |= condition.bits;
    }
  }
}

bool TransformSet::stem_ok(Run& run, const Rule& rule, std::string_view stem) const {
  run.rule_ops += stem.size();  // the checks read the stem (section 7.4)
  if (rule.extra->stem_min_length > 0 && code_points(stem) < rule.extra->stem_min_length) return false;
  if (rule.extra->stem_characters != nullptr && !all_in(stem, *rule.extra->stem_characters)) return false;
  if (rule.extra->stem_contains != nullptr && !any_in(stem, *rule.extra->stem_contains)) return false;
  if (rule.extra->stem_starts_with != nullptr && (stem.empty() || !rule.extra->stem_starts_with->contains(first_code_point(stem)))) {
    return false;
  }
  if (rule.extra->stem_ends_with != nullptr && (stem.empty() || !rule.extra->stem_ends_with->contains(last_code_point(stem)))) {
    return false;
  }
  if (rule.extra->stem_not_starts_with != nullptr && !stem.empty() && rule.extra->stem_not_starts_with->contains(first_code_point(stem))) {
    return false;
  }
  if (rule.extra->stem_not_ends_with != nullptr && !stem.empty() && rule.extra->stem_not_ends_with->contains(last_code_point(stem))) {
    return false;
  }
  if (rule.extra->stem_starts_with_text && !stem.starts_with(*rule.extra->stem_starts_with_text)) return false;
  if (rule.extra->stem_not_starts_with_text && stem.starts_with(*rule.extra->stem_not_starts_with_text)) return false;
  return true;
}

bool TransformSet::change_stem(Run& run, const Rule& rule, std::string_view stem, std::string& out) const {
  const StemChange& change = *rule.extra->stem_change;
  // With `between`, the code points from each offset of the stem to its end
  // when all are in the class, or UINT32_MAX, from one pass back to front, so
  // a candidate costs no more than its comparison.
  thread_local std::vector<uint32_t> tail;
  thread_local std::vector<size_t> starts;
  if (change.between != nullptr) {
    tail.assign(stem.size() + 1, UINT32_MAX);
    tail[stem.size()] = 0;
    starts.clear();
    for (auto it = stem.begin(); it != stem.end();) {
      starts.push_back(static_cast<size_t>(it - stem.begin()));
      utf8::unchecked::next(it);
    }
    size_t next = stem.size();
    for (size_t k = starts.size(); k-- > 0;) {
      const size_t at = starts[k];
      auto it = stem.begin() + static_cast<std::ptrdiff_t>(at);
      const char32_t c = utf8::unchecked::next(it);
      tail[at] = tail[next] != UINT32_MAX && change.between->contains(c) ? tail[next] + 1 : UINT32_MAX;
      next = at;
    }
  }
  size_t positions = 0;
  size_t chosen_at = std::string_view::npos;
  size_t chosen_length = 0;
  for (size_t i = 0; i < stem.size(); ++i) {
    if ((static_cast<unsigned char>(stem[i]) & 0xC0) == 0x80) continue;
    ++positions;
    size_t best = 0;
    bool found = false;
    for (const auto& from : change.from) {
      if (from.size() <= best && found) continue;
      if (stem.substr(i).starts_with(from)) {
        if (change.between != nullptr) {
          const uint32_t after = tail[i + from.size()];
          if (after == UINT32_MAX || after < change.between_min_length) continue;
        }
        best = from.size();
        found = true;
      }
    }
    if (found) {
      chosen_at = i;
      chosen_length = best;
      if (!change.last) break;
    }
  }
  // Every string at every position tried, and the pass over the stem.
  run.rule_ops += positions * change.from.size() + (change.between != nullptr ? stem.size() : 0);
  if (chosen_at == std::string_view::npos) return false;
  out.assign(stem.substr(0, chosen_at));
  out += change.to;
  out.append(stem.substr(chosen_at + chosen_length));
  return true;
}

// A rule's `then` steps may make at most step_limit(n) code points, n being
// the code points of the text the search started from (section 7.4). Past
// that they stop, and the text so far is the output, which the growth bound
// drops.
bool TransformSet::finish_then(Run& run, const Rule& rule, std::string& text) const {
  if (!rule.has_then) return true;
  std::u32string in;
  if (!decode_utf8(text, in)) return false;
  std::u32string result;
  StepLimit limit{step_limit(run.root_length())};
  apply_single(rule.extra->then, in, result, limit);
  run.then_written += limit.written;
  run.regex_read += limit.read;
  run.rule_ops += limit.ops;
  text = to_utf8(result);
  return true;
}

// Applies a rule found through a trie: `matched` is where the matched affix
// starts (suffixes, circumfix suffixes, suffix anchors, phrasal endings) or
// ends (prefixes, prefix anchors).
bool TransformSet::apply(Run& run, const Rule& rule, const std::string& text, size_t matched, std::string& out) const {
  std::string changed;
  switch (rule.type) {
    case RuleType::Suffix: {
      std::string_view stem(text.data(), matched);
      if (rule.stem_checks && !stem_ok(run, rule, stem)) return false;
      if (rule.has_stem_change) {
        if (!change_stem(run, rule, stem, changed)) return false;
        stem = changed;
      }
      out.reserve(stem.size() + rule.b.size());
      out.assign(stem);
      out += rule.b;
      return finish_then(run, rule, out);
    }
    case RuleType::WholeWord:
      if (matched != 0) return false;
      out = rule.b;
      return finish_then(run, rule, out);
    case RuleType::Circumfix: {
      if (rule.a.size() > matched || !std::string_view(text).starts_with(rule.a)) return false;
      std::string_view stem(text.data() + rule.a.size(), matched - rule.a.size());
      if (rule.stem_checks && !stem_ok(run, rule, stem)) return false;
      if (rule.has_stem_change) {
        if (!change_stem(run, rule, stem, changed)) return false;
        stem = changed;
      }
      out.reserve(rule.b.size() + stem.size() + rule.d.size());
      out.assign(rule.b);
      out += stem;
      out += rule.d;
      return finish_then(run, rule, out);
    }
    case RuleType::Prefix: {
      const std::string_view stem(text.data() + matched, text.size() - matched);
      if (rule.stem_checks && !stem_ok(run, rule, stem)) return false;
      out.reserve(rule.b.size() + stem.size());
      out.assign(rule.b);
      out += stem;
      return finish_then(run, rule, out);
    }
    case RuleType::Pattern:
      run.regex_read += code_points(text);
      if (!rule.extra->pattern->replace(text, out)) return false;
      return finish_then(run, rule, out);
    case RuleType::Replace: {
      run.rule_ops += text.size();  // the search for every occurrence
      std::vector<size_t> found;
      for (size_t i = text.find(rule.a); i != std::string::npos; i = text.find(rule.a, i + rule.a.size())) {
        if (!(rule.extra->not_at_start && i == 0)) found.push_back(i);
      }
      if (found.empty()) return false;
      if (rule.extra->occurrence == Occurrence::First) {
        found.resize(1);
      } else if (rule.extra->occurrence == Occurrence::Last) {
        found.erase(found.begin(), found.end() - 1);
      }
      out.clear();
      size_t last = 0;
      for (size_t index : found) {
        out.append(text, last, index - last);
        out += rule.b;
        last = index + rule.a.size();
      }
      out.append(text, last);
      return finish_then(run, rule, out);
    }
    case RuleType::InterposedObject: {
      // A verb that is not a verb guard word, then runs of anything but a
      // space whose pieces are not guard words, then a particle; the runs
      // are removed.
      run.rule_ops += text.size();  // the pieces and their parts are read once
      std::vector<std::string_view> pieces;
      for (size_t start = 0;;) {
        const size_t space = text.find(' ', start);
        pieces.emplace_back(text.data() + start, (space == std::string::npos ? text.size() : space) - start);
        if (space == std::string::npos) break;
        start = space + 1;
      }
      if (pieces.size() < 3) return false;
      for (const auto& piece : pieces) {
        if (piece.empty()) return false;
      }
      if (!all_words(pieces[0], word_characters)) return false;
      // The verb is one word, so it is compared whole, as a guard word is.
      if (rule.extra->verb_guard_words != nullptr && rule.extra->verb_guard_words->contains(pieces[0])) return false;
      for (size_t k = 1; k < pieces.size(); ++k) {
        const std::string_view piece = pieces[k];
        if (k >= 2 && all_words(piece, word_characters) && rule.extra->particles->contains(piece)) {
          out.assign(pieces[0]);
          out.append(text, static_cast<size_t>(piece.data() - text.data()) - 1);
          return finish_then(run, rule, out);
        }
        // The parts between non-word characters.
        size_t part_start = 0;
        size_t offset = 0;
        auto it = piece.begin();
        while (true) {
          const bool at_end = it == piece.end();
          bool word = false;
          auto before = it;
          if (!at_end) {
            const char32_t c = utf8::unchecked::next(it);
            word = word_characters == nullptr || word_characters->contains(c);
          }
          offset = static_cast<size_t>(before - piece.begin());
          if (at_end || !word) {
            if (offset > part_start && rule.extra->guard_words->contains(piece.substr(part_start, offset - part_start))) {
              return false;
            }
            if (at_end) break;
            part_start = static_cast<size_t>(it - piece.begin());
          }
        }
      }
      return false;
    }
    case RuleType::Phrasal:
      return false;  // applied in next_output()
  }
  return false;
}

// Pushes the frame of deinflection `index`, whose text is `text`, with its
// matches in the order they apply: suffix-indexed rules, longest matched
// suffix first, then those of the empty suffix; prefix-indexed rules the
// same way; then phrasal rules, longest first-word ending first.
size_t TransformSet::push_frame(Stack& stack, const std::string& text, uint32_t index) const {
  std::vector<Match>& matches = stack.matches;
  const auto first = static_cast<uint32_t>(matches.size());
  size_t walked = 0;  // code points the trie walks read
  {
    uint32_t node = 0;
    size_t count = 0;
    auto it = text.end();
    while (it != text.begin() && count < max_matches) {
      const char32_t c = utf8::prior(it, text.begin());
      ++walked;
      const uint32_t child = suffixes_.child(node, c);
      if (child == UINT32_MAX) break;
      node = child;
      if (suffixes_.nodes[node].rules_begin != suffixes_.nodes[node].rules_end) {
        matches.push_back({node, static_cast<uint32_t>(it - text.begin()), 0});
        ++count;
      }
    }
    std::reverse(matches.begin() + static_cast<std::ptrdiff_t>(first), matches.end());
    if (suffixes_.nodes[0].rules_begin != suffixes_.nodes[0].rules_end) {
      matches.push_back({0, static_cast<uint32_t>(text.size()), 0});
    }
  }
  if (!prefixes_.empty()) {
    const size_t start = matches.size();
    uint32_t node = 0;
    size_t count = 0;
    auto p = text.begin();
    while (p != text.end() && count < max_matches) {
      const char32_t c = utf8::next(p, text.end());
      ++walked;
      const uint32_t child = prefixes_.child(node, c);
      if (child == UINT32_MAX) break;
      node = child;
      if (prefixes_.nodes[node].rules_begin != prefixes_.nodes[node].rules_end) {
        matches.push_back({node, static_cast<uint32_t>(p - text.begin()), 1});
        ++count;
      }
    }
    std::reverse(matches.begin() + static_cast<std::ptrdiff_t>(start), matches.end());
    if (prefixes_.nodes[0].rules_begin != prefixes_.nodes[0].rules_end) matches.push_back({0, 0, 1});
  }
  uint32_t first_space = 0;
  if (!phrasal_.empty()) {
    const size_t space = text.find(' ');
    if (space != std::string::npos && space > 0) {
      const size_t next = text.find(' ', space + 1);
      const std::string_view second_word =
          std::string_view(text).substr(space + 1, (next == std::string::npos ? text.size() : next) - space - 1);
      if (all_words(std::string_view(text.data(), space), word_characters) && all_words(second_word, word_characters)) {
        const size_t start = matches.size();
        uint32_t node = 0;
        size_t count = 0;
        auto q = text.begin() + static_cast<std::ptrdiff_t>(space);
        while (q != text.begin() && count < max_matches) {
          const char32_t c = utf8::prior(q, text.begin());
          ++walked;
          const uint32_t child = phrasal_.child(node, c);
          if (child == UINT32_MAX) break;
          node = child;
          if (phrasal_.nodes[node].rules_begin != phrasal_.nodes[node].rules_end) {
            matches.push_back({node, static_cast<uint32_t>(q - text.begin()), 2});
            ++count;
          }
        }
        std::reverse(matches.begin() + static_cast<std::ptrdiff_t>(start), matches.end());
        // An empty ending matches every first word; it is the shortest.
        if (phrasal_.nodes[0].rules_begin != phrasal_.nodes[0].rules_end) {
          matches.push_back({0, static_cast<uint32_t>(space), 2});
        }
        first_space = static_cast<uint32_t>(space);
      }
    }
  }
  const auto end = static_cast<uint32_t>(matches.size());
  uint32_t rule = 0;
  if (first < end) {
    const Match& m = matches[first];
    rule = (m.trie == 0 ? suffixes_ : m.trie == 1 ? prefixes_ : phrasal_).nodes[m.node].rules_begin;
  }
  stack.frames.push_back(Frame{index, first, first, end, rule, first_space});
  return walked;
}

// The frame's next rule application that gives an output, in the order of
// section 7.4: its matches' rules, each node's in file order, then the
// interposedObject and replace rules in file order. False when none is left.
bool TransformSet::next_output(Run& run, Stack& stack, Frame& frame, std::string& output, uint32_t& rule_index,
                               uint32_t& conditions_out) const {
  const Deinflections& out = run.out;
  // The work budget (section 7.4): each rule tried costs a unit; then, output
  // or not, a unit per SearchBounds::work_bytes bytes it and its `then` steps
  // wrote, a unit per code point its regular expressions read, and its
  // operations (stem scans, stem change candidates, map keys tried, text
  // searched). A rule its conditions or options skip is an operation. With
  // the budget spent, the search stops before `rule_index`.
  const auto stop = [&](uint32_t rule) {
    run.spent = true;
    rule_index = rule;
    return false;
  };
  const auto try_rule = [&](uint32_t rule) {
    if (run.budget.spent()) return false;
    run.spend(rule, 1);
    run.then_written = 0;
    run.regex_read = 0;
    run.rule_ops = 0;
    return true;
  };
  const auto settle = [&](uint32_t rule) {
    run.spend(rule, (output.size() + 4 * run.then_written) / SearchBounds::work_bytes + run.regex_read);
    run.add_ops(rule, run.rule_ops);
  };
  const auto skip = [&](uint32_t rule) {
    run.add_ops(rule, 1);
    return !run.budget.spent();
  };
  const uint32_t conditions = out[frame.index].conditions;
  const auto allowed = [&](uint32_t conditions_in, uint16_t transform) {
    if (conditions != 0 && !(conditions & conditions_in)) return false;
    if (has_optional_transforms && transforms[transform].optional &&
        (run.enabled == nullptr || transform >= run.enabled->size() || !(*run.enabled)[transform])) {
      return false;
    }
    return true;
  };
  while (frame.next < frame.end) {
    const Match& m = stack.matches[frame.next];
    const Trie& trie = m.trie == 0 ? suffixes_ : m.trie == 1 ? prefixes_ : phrasal_;
    const uint32_t rules_end = trie.nodes[m.node].rules_end;
    while (frame.rule < rules_end) {
      const NodeRule& nr = trie.node_rules[frame.rule++];
      if (!allowed(nr.conditions_in, nr.transform)) {
        if (!skip(nr.rule)) return stop(nr.rule);
        continue;
      }
      if (!try_rule(nr.rule)) return stop(nr.rule);
      const std::string& text = out[frame.index].text;
      output.clear();
      bool made = true;
      if (m.trie == 2) {
        const Rule& rule = rules[nr.rule];
        const size_t space = frame.space;
        const size_t next = text.find(' ', space + 1);
        const std::string_view second =
            std::string_view(text).substr(space + 1, (next == std::string::npos ? text.size() : next) - space - 1);
        run.rule_ops += text.size();  // the second word, found and looked up
        if (!rule.extra->followed_by->contains(second)) {
          made = false;
        } else {
          output.reserve(text.size() + rule.b.size());
          output.append(text, 0, m.matched);
          output += rule.b;
          output.append(text, space);
          made = finish_then(run, rule, output);
        }
      } else {
        switch (nr.kind) {
          case 0:
            output.reserve(m.matched + nr.to.size());
            output.append(text, 0, m.matched);
            output.append(nr.to);
            break;
          case 1:
            made = m.matched == 0;
            if (made) output.assign(nr.to);
            break;
          default:
            made = apply(run, rules[nr.rule], text, m.matched, output);
            break;
        }
      }
      settle(nr.rule);
      if (!made) continue;
      rule_index = nr.rule;
      conditions_out = nr.conditions_out;
      return true;
    }
    if (++frame.next < frame.end) {
      const Match& n = stack.matches[frame.next];
      frame.rule = (n.trie == 0 ? suffixes_ : n.trie == 1 ? prefixes_ : phrasal_).nodes[n.node].rules_begin;
    } else {
      frame.rule = 0;
    }
  }
  while (frame.rule < unindexed_.size()) {
    const uint32_t r = unindexed_[frame.rule++];
    const Rule& rule = rules[r];
    if (!allowed(rule.conditions_in, rule.transform)) {
      if (!skip(r)) return stop(r);
      continue;
    }
    if (!try_rule(r)) return stop(r);
    output.clear();
    const bool made = apply(run, rule, out[frame.index].text, 0, output);
    settle(r);
    if (!made) continue;
    rule_index = r;
    conditions_out = rule.conditions_out;
    return true;
  }
  return false;
}

// The depth-first search of section 7.4 from deinflection `root`: each output
// is recorded and expanded before the next rule applies to its parent, as a
// recursion would, within SearchBounds.
void TransformSet::search(Run& run) const {
  Deinflections& out = run.out;
  const uint32_t root = run.root;
  thread_local Stack shared;
  Stack own;
  Stack& stack = shared.busy ? own : shared;
  struct Release {
    Stack& stack;
    ~Release() { stack.busy = false; }
  } release{stack};
  stack.busy = true;
  stack.frames.clear();
  stack.matches.clear();
  // The longest output allowed, in code points: the root's length plus the
  // margin. A code point takes at most 4 bytes, so until an output is longer
  // than root bytes / 4 + margin bytes, the root needs no counting.
  size_t max_length = out[root].text.size() / 4 + SearchBounds::max_growth;
  bool counted = false;
  const auto is_cycle = [&](uint32_t index, uint32_t rule) {
    const std::string& text = out[index].text;
    size_t steps = 0;
    bool cycle = false;
    for (uint32_t n = index; out[n].parent != Deinflection::npos; n = out[n].parent) {
      ++steps;
      if (out[n].via == rule && out[out[n].parent].text == text) {
        cycle = true;
        break;
      }
    }
    run.add_ops(rule, steps);
    return cycle;
  };
  // What this search reports: the bound that stopped it (results or work),
  // or else the first that dropped an output; and, for the work bound, the
  // rules that used the most of it.
  BoundHit hit;
  ankerl::unordered_dense::map<uint32_t, size_t> costs;
  if (run.hit != nullptr) run.costs = &costs;
  const auto costliest = [&] {
    std::vector<std::pair<uint32_t, size_t>> ranked(costs.begin(), costs.end());
    std::ranges::sort(ranked, [](const auto& a, const auto& b) {
      return a.second != b.second ? a.second > b.second : a.first < b.first;
    });
    if (ranked.size() > 3) ranked.resize(3);
    return ranked;
  };
  // A search that finds the budget spent records its text and nothing more.
  if (run.budget.spent()) {
    if (run.hit != nullptr && !*run.hit) *run.hit = BoundHit{BoundHit::Bound::Work, root, Deinflection::none, {}, {}};
    return;
  }
  run.add_ops(Deinflection::none, push_frame(stack, out[root].text, root));
  while (!stack.frames.empty()) {
    Frame& frame = stack.frames.back();
    // Each output has a buffer of its own, so that a long one a bound drops
    // never goes into a later result.
    std::string output;
    uint32_t rule = 0;
    uint32_t conditions_out = 0;
    if (!next_output(run, stack, frame, output, rule, conditions_out)) {
      if (run.spent) {
        if (run.hit != nullptr) hit = BoundHit{BoundHit::Bound::Work, frame.index, rule, {}, costliest()};
        break;
      }
      stack.matches.resize(frame.first);
      stack.frames.pop_back();
      continue;
    }
    const uint32_t index = frame.index;
    // An empty text is never a headword; a repeat of a rule on a text it
    // already applied to in this chain is a cycle (section 7.4).
    if (output.empty()) continue;
    if (output.size() >= out[index].text.size() && is_cycle(index, rule)) continue;
    BoundHit::Bound bound = BoundHit::Bound::None;
    if (output.size() > max_length && !counted) {
      max_length = run.root_length() + SearchBounds::max_growth;
      counted = true;
    }
    if (output.size() > max_length && code_points(output) > max_length) {
      bound = BoundHit::Bound::Growth;
    } else if (stack.frames.size() > SearchBounds::max_depth) {
      // The output would be rule frames.size() of its chain.
      bound = BoundHit::Bound::Depth;
    } else if (out.size() - root >= SearchBounds::max_results) {
      bound = BoundHit::Bound::Results;
    }
    if (bound != BoundHit::Bound::None) {
      if (run.hit != nullptr && (!hit || bound == BoundHit::Bound::Results)) {
        hit = BoundHit{bound, index, rule, std::move(output), {}};
      }
      if (bound == BoundHit::Bound::Results) break;
      continue;
    }
    const uint32_t depth = out[index].depth + 1;
    out.push_back(Deinflection{std::move(output), conditions_out, index, rule, depth});
    run.add_ops(rule, push_frame(stack, out.back().text, static_cast<uint32_t>(out.size() - 1)));
  }
  if (run.hit != nullptr && !*run.hit) *run.hit = std::move(hit);
  // A search that went far keeps no large stack for the thread's next one.
  if (stack.matches.capacity() > 4096) std::vector<Match>().swap(stack.matches);
}

void TransformSet::deinflect(const std::string& text, Deinflections& out, const std::vector<bool>* enabled,
                             BoundHit* hit, SearchBudget* budget) const {
  const auto index = static_cast<uint32_t>(out.size());
  out.push_back(Deinflection{text, 0, Deinflection::npos, Deinflection::none, 0});
  if (text.empty()) {
    return;
  }
  SearchBudget own;
  Run run{out, enabled, hit, budget != nullptr ? *budget : own, index};
  search(run);
}

void TransformSet::deinflect_from_step(std::string text, uint32_t step, Deinflections& out,
                                       const std::vector<bool>* enabled, BoundHit* hit, SearchBudget* budget) const {
  if (text.empty()) {
    return;
  }
  const auto index = static_cast<uint32_t>(out.size());
  out.push_back(Deinflection{std::move(text), 0, Deinflection::npos, Deinflection::step_base + step, 1});
  SearchBudget own;
  Run run{out, enabled, hit, budget != nullptr ? *budget : own, index};
  search(run);
}

uint32_t TransformSet::conditions_for_parts_of_speech(std::span<const std::string> tags) const {
  uint32_t result = 0;
  for (const auto& tag : tags) result |= dictionary_form_bits(tag);
  return result;
}

uint32_t TransformSet::conditions_for_parts_of_speech(std::span<const std::string_view> tags) const {
  uint32_t result = 0;
  for (const auto tag : tags) result |= dictionary_form_bits(tag);
  return result;
}

uint32_t TransformSet::conditions_for_types(std::span<const std::string> names) const {
  uint32_t result = 0;
  for (const auto& name : names) result |= condition_bits(name);
  return result;
}

uint32_t TransformSet::condition_bits(std::string_view name) const {
  for (const auto& condition : conditions) {
    if (condition.key == name) return condition.bits;
  }
  return 0;
}

std::vector<std::string_view> TransformSet::condition_names(uint32_t bits) const {
  std::vector<std::string_view> names;
  for (const auto& condition : conditions) {
    if (condition.leaf && (condition.bits & bits) != 0) names.push_back(condition.key);
  }
  return names;
}

}  // namespace hoshidicts::lang
