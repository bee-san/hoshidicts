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
};

void TransformSet::insert(Trie& trie, std::u32string_view key, std::vector<std::pair<uint32_t, uint32_t>>& pending,
                          uint32_t rule) {
  uint32_t node = 0;
  for (char32_t c : key) {
    auto& children = trie.nodes[node].children;
    auto child = std::ranges::find(children, c, &std::pair<char32_t, uint32_t>::first);
    if (child == children.end()) {
      const auto next = static_cast<uint32_t>(trie.nodes.size());
      trie.nodes.emplace_back();
      trie.nodes[node].children.emplace_back(c, next);
      node = next;
    } else {
      node = child->second;
    }
  }
  pending.emplace_back(node, rule);
}

void TransformSet::finish(Trie& trie, std::vector<std::pair<uint32_t, uint32_t>>& pending) {
  // Rules that match at one node apply in file order.
  std::ranges::stable_sort(pending, {}, &std::pair<uint32_t, uint32_t>::first);
  trie.node_rules.reserve(pending.size());
  for (size_t i = 0; i < pending.size();) {
    const uint32_t node = pending[i].first;
    trie.nodes[node].rules_begin = static_cast<uint32_t>(trie.node_rules.size());
    for (; i < pending.size() && pending[i].first == node; ++i) {
      const Rule& rule = rules[pending[i].second];
      unsigned char kind = 2;
      if (rule.type == RuleType::Suffix && !rule.stem_checks && !rule.has_stem_change && !rule.has_then) {
        kind = 0;
      } else if (rule.type == RuleType::WholeWord && !rule.has_then) {
        kind = 1;
      }
      trie.node_rules.push_back(NodeRule{.rule = pending[i].second,
                                         .conditions_in = rule.conditions_in,
                                         .conditions_out = rule.conditions_out,
                                         .transform = rule.transform,
                                         .kind = kind,
                                         .to = rule.b});
    }
    trie.nodes[node].rules_end = static_cast<uint32_t>(trie.node_rules.size());
  }
}

void TransformSet::index() {
  std::vector<std::pair<uint32_t, uint32_t>> suffix_pending;
  std::vector<std::pair<uint32_t, uint32_t>> prefix_pending;
  std::vector<std::pair<uint32_t, uint32_t>> phrasal_pending;
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
        insert(suffixes_, reversed(rule.a), suffix_pending, i);
        break;
      case RuleType::Circumfix:
        insert(suffixes_, reversed(rule.c), suffix_pending, i);
        break;
      case RuleType::Pattern:
        if (rule.anchor_prefix) {
          insert(prefixes_, forward(rule.a), prefix_pending, i);
        } else {
          insert(suffixes_, reversed(rule.a), suffix_pending, i);
        }
        break;
      case RuleType::Prefix:
        insert(prefixes_, forward(rule.a), prefix_pending, i);
        break;
      case RuleType::Phrasal:
        insert(phrasal_, reversed(rule.a), phrasal_pending, i);
        break;
      case RuleType::Replace:
      case RuleType::InterposedObject:
        unindexed_.push_back(i);
        break;
    }
  }
  finish(suffixes_, suffix_pending);
  finish(prefixes_, prefix_pending);
  finish(phrasal_, phrasal_pending);

  condition_bits_.clear();
  dictionary_forms_.clear();
  for (const auto& condition : conditions) {
    condition_bits_.emplace(condition.key, condition.bits);
    if (condition.dictionary_form) {
      dictionary_forms_.emplace_back(condition.key, condition.bits);
    }
  }
}

bool TransformSet::stem_ok(const Rule& rule, std::string_view stem) const {
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

bool TransformSet::change_stem(const Rule& rule, std::string_view stem, std::string& out) const {
  const StemChange& change = *rule.extra->stem_change;
  size_t chosen_at = std::string_view::npos;
  size_t chosen_length = 0;
  for (size_t i = 0; i < stem.size(); ++i) {
    if ((static_cast<unsigned char>(stem[i]) & 0xC0) == 0x80) continue;
    size_t best = 0;
    bool found = false;
    for (const auto& from : change.from) {
      if (from.size() <= best && found) continue;
      if (stem.substr(i).starts_with(from)) {
        const std::string_view after = stem.substr(i + from.size());
        if (change.between != nullptr) {
          if (code_points(after) < change.between_min_length || !all_in(after, *change.between)) continue;
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
  if (chosen_at == std::string_view::npos) return false;
  out.assign(stem.substr(0, chosen_at));
  out += change.to;
  out.append(stem.substr(chosen_at + chosen_length));
  return true;
}

bool TransformSet::finish_then(const Rule& rule, std::string& text) const {
  if (!rule.has_then) return true;
  std::u32string in;
  if (!decode_utf8(text, in)) return false;
  std::u32string result;
  apply_single(rule.extra->then, in, result);
  text = to_utf8(result);
  return true;
}

// Applies a rule found through a trie: `matched` is where the matched affix
// starts (suffixes, circumfix suffixes, suffix anchors, phrasal endings) or
// ends (prefixes, prefix anchors).
bool TransformSet::apply(const Rule& rule, const std::string& text, size_t matched, std::string& out) const {
  std::string changed;
  switch (rule.type) {
    case RuleType::Suffix: {
      std::string_view stem(text.data(), matched);
      if (rule.stem_checks && !stem_ok(rule, stem)) return false;
      if (rule.has_stem_change) {
        if (!change_stem(rule, stem, changed)) return false;
        stem = changed;
      }
      out.reserve(stem.size() + rule.b.size());
      out.assign(stem);
      out += rule.b;
      return finish_then(rule, out);
    }
    case RuleType::WholeWord:
      if (matched != 0) return false;
      out = rule.b;
      return finish_then(rule, out);
    case RuleType::Circumfix: {
      if (rule.a.size() > matched || !std::string_view(text).starts_with(rule.a)) return false;
      std::string_view stem(text.data() + rule.a.size(), matched - rule.a.size());
      if (rule.stem_checks && !stem_ok(rule, stem)) return false;
      if (rule.has_stem_change) {
        if (!change_stem(rule, stem, changed)) return false;
        stem = changed;
      }
      out.reserve(rule.b.size() + stem.size() + rule.d.size());
      out.assign(rule.b);
      out += stem;
      out += rule.d;
      return finish_then(rule, out);
    }
    case RuleType::Prefix: {
      const std::string_view stem(text.data() + matched, text.size() - matched);
      if (rule.stem_checks && !stem_ok(rule, stem)) return false;
      out.reserve(rule.b.size() + stem.size());
      out.assign(rule.b);
      out += stem;
      return finish_then(rule, out);
    }
    case RuleType::Pattern:
      if (!rule.extra->pattern->replace(text, out)) return false;
      return finish_then(rule, out);
    case RuleType::Replace: {
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
      return finish_then(rule, out);
    }
    case RuleType::InterposedObject: {
      // A verb, then runs of anything but a space whose pieces are not guard
      // words, then a particle; the runs are removed.
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
      for (size_t k = 1; k < pieces.size(); ++k) {
        const std::string_view piece = pieces[k];
        if (k >= 2 && all_words(piece, word_characters) && rule.extra->particles->contains(piece)) {
          out.assign(pieces[0]);
          out.append(text, static_cast<size_t>(piece.data() - text.data()) - 1);
          return finish_then(rule, out);
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
      return false;  // applied in visit()
  }
  return false;
}

void TransformSet::visit(Run& run, uint32_t index) const {
  Deinflections& out = run.out;
  std::array<std::pair<uint32_t, uint32_t>, max_matches> suffix_matches;
  size_t suffix_count = 0;
  std::array<std::pair<uint32_t, uint32_t>, max_matches> prefix_matches;
  size_t prefix_count = 0;
  std::array<std::pair<uint32_t, uint32_t>, max_matches> phrasal_matches;
  size_t phrasal_count = 0;
  size_t space = std::string::npos;
  std::string_view second_word;
  {
    const std::string& text = out[index].text;
    uint32_t node = 0;
    auto it = text.end();
    while (it != text.begin() && suffix_count < max_matches) {
      const char32_t c = utf8::prior(it, text.begin());
      const auto& children = suffixes_.nodes[node].children;
      auto child = std::ranges::find(children, c, &std::pair<char32_t, uint32_t>::first);
      if (child == children.end()) {
        break;
      }
      node = child->second;
      if (suffixes_.nodes[node].rules_begin != suffixes_.nodes[node].rules_end) {
        suffix_matches[suffix_count++] = {node, static_cast<uint32_t>(it - text.begin())};
      }
    }
    if (!prefixes_.empty()) {
      node = 0;
      auto p = text.begin();
      while (p != text.end() && prefix_count < max_matches) {
        const char32_t c = utf8::next(p, text.end());
        const auto& children = prefixes_.nodes[node].children;
        auto child = std::ranges::find(children, c, &std::pair<char32_t, uint32_t>::first);
        if (child == children.end()) break;
        node = child->second;
        if (prefixes_.nodes[node].rules_begin != prefixes_.nodes[node].rules_end) {
          prefix_matches[prefix_count++] = {node, static_cast<uint32_t>(p - text.begin())};
        }
      }
    }
    if (!phrasal_.empty()) {
      space = text.find(' ');
      if (space != std::string::npos && space > 0) {
        const size_t next = text.find(' ', space + 1);
        second_word = std::string_view(text).substr(space + 1, (next == std::string::npos ? text.size() : next) - space - 1);
        if (all_words(std::string_view(text.data(), space), word_characters) && all_words(second_word, word_characters)) {
          node = 0;
          auto q = text.begin() + static_cast<std::ptrdiff_t>(space);
          if (phrasal_.nodes[0].rules_begin != phrasal_.nodes[0].rules_end) {
            // An empty ending matches every first word; it is the shortest.
          }
          while (q != text.begin() && phrasal_count < max_matches) {
            const char32_t c = utf8::prior(q, text.begin());
            const auto& children = phrasal_.nodes[node].children;
            auto child = std::ranges::find(children, c, &std::pair<char32_t, uint32_t>::first);
            if (child == children.end()) break;
            node = child->second;
            if (phrasal_.nodes[node].rules_begin != phrasal_.nodes[node].rules_end) {
              phrasal_matches[phrasal_count++] = {node, static_cast<uint32_t>(q - text.begin())};
            }
          }
        } else {
          space = std::string::npos;
        }
      } else {
        space = std::string::npos;
      }
    }
  }

  const uint32_t conditions = out[index].conditions;
  const uint32_t depth = out[index].depth + 1;
  const auto allowed = [&](const NodeRule& nr) {
    if (conditions != 0 && !(conditions & nr.conditions_in)) return false;
    if (has_optional_transforms && transforms[nr.transform].optional &&
        (run.enabled == nullptr || nr.transform >= run.enabled->size() || !(*run.enabled)[nr.transform])) {
      return false;
    }
    return true;
  };
  const auto is_cycle = [&](uint32_t rule) {
    const std::string& text = out[index].text;
    for (uint32_t n = index; out[n].parent != Deinflection::npos; n = out[n].parent) {
      if (out[n].via == rule && out[out[n].parent].text == text) return true;
    }
    return false;
  };
  const auto record = [&](std::string&& output, const NodeRule& nr) {
    if (output.empty()) return;
    if (output.size() >= out[index].text.size() && is_cycle(nr.rule)) return;
    out.push_back(Deinflection{std::move(output), nr.conditions_out, index, nr.rule, depth});
    visit(run, static_cast<uint32_t>(out.size() - 1));
  };
  const auto apply_node = [&](const Trie& trie, uint32_t node, size_t matched) {
    const TrieNode& n = trie.nodes[node];
    for (uint32_t r = n.rules_begin; r < n.rules_end; ++r) {
      const NodeRule& nr = trie.node_rules[r];
      if (!allowed(nr)) continue;
      std::string output;
      const std::string& text = out[index].text;
      switch (nr.kind) {
        case 0:
          output.reserve(matched + nr.to.size());
          output.append(text, 0, matched);
          output.append(nr.to);
          break;
        case 1:
          if (matched != 0) continue;
          output.assign(nr.to);
          break;
        default:
          if (!apply(rules[nr.rule], text, matched, output)) continue;
          break;
      }
      record(std::move(output), nr);
    }
  };

  while (suffix_count > 0) {
    const auto [node, matched] = suffix_matches[--suffix_count];
    apply_node(suffixes_, node, matched);
  }
  if (suffixes_.nodes[0].rules_begin != suffixes_.nodes[0].rules_end) {
    apply_node(suffixes_, 0, out[index].text.size());
  }
  while (prefix_count > 0) {
    const auto [node, matched] = prefix_matches[--prefix_count];
    apply_node(prefixes_, node, matched);
  }
  if (!prefixes_.empty() && prefixes_.nodes[0].rules_begin != prefixes_.nodes[0].rules_end) {
    apply_node(prefixes_, 0, 0);
  }
  if (space != std::string::npos) {
    const auto apply_phrasal = [&](uint32_t node, size_t matched) {
      const TrieNode& n = phrasal_.nodes[node];
      for (uint32_t r = n.rules_begin; r < n.rules_end; ++r) {
        const NodeRule& nr = phrasal_.node_rules[r];
        if (!allowed(nr)) continue;
        const Rule& rule = rules[nr.rule];
        const std::string& text = out[index].text;
        const size_t next = text.find(' ', space + 1);
        const std::string_view second =
            std::string_view(text).substr(space + 1, (next == std::string::npos ? text.size() : next) - space - 1);
        if (!rule.extra->followed_by->contains(second)) continue;
        std::string output;
        output.reserve(text.size() + rule.b.size());
        output.append(text, 0, matched);
        output += rule.b;
        output.append(text, space);
        if (!finish_then(rule, output)) continue;
        record(std::move(output), nr);
      }
    };
    while (phrasal_count > 0) {
      const auto [node, matched] = phrasal_matches[--phrasal_count];
      apply_phrasal(node, matched);
    }
    if (phrasal_.nodes[0].rules_begin != phrasal_.nodes[0].rules_end) {
      apply_phrasal(0, space);
    }
  }
  for (const uint32_t r : unindexed_) {
    const Rule& rule = rules[r];
    const NodeRule nr{.rule = r,
                      .conditions_in = rule.conditions_in,
                      .conditions_out = rule.conditions_out,
                      .transform = rule.transform,
                      .kind = 2,
                      .to = rule.b};
    if (!allowed(nr)) continue;
    std::string output;
    if (!apply(rule, out[index].text, 0, output)) continue;
    record(std::move(output), nr);
  }
}

void TransformSet::deinflect(const std::string& text, Deinflections& out, const std::vector<bool>* enabled) const {
  const auto index = static_cast<uint32_t>(out.size());
  out.push_back(Deinflection{text, 0, Deinflection::npos, Deinflection::none, 0});
  if (text.empty()) {
    return;
  }
  Run run{out, enabled};
  visit(run, index);
}

void TransformSet::deinflect_from_step(std::string text, uint32_t step, Deinflections& out,
                                       const std::vector<bool>* enabled) const {
  if (text.empty()) {
    return;
  }
  const auto index = static_cast<uint32_t>(out.size());
  out.push_back(Deinflection{std::move(text), 0, Deinflection::npos, Deinflection::step_base + step, 1});
  Run run{out, enabled};
  visit(run, index);
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
  const auto it = condition_bits_.find(name);
  return it == condition_bits_.end() ? 0 : it->second;
}

std::vector<std::string_view> TransformSet::condition_names(uint32_t bits) const {
  std::vector<std::string_view> names;
  for (const auto& condition : conditions) {
    if (condition.leaf && (condition.bits & bits) != 0) names.push_back(condition.key);
  }
  return names;
}

}  // namespace hoshidicts::lang
