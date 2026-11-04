// SPDX-License-Identifier: GPL-3.0-or-later
#include "corpus.hpp"

#include <utf8proc.h>

#include <algorithm>
#include <fstream>
#include <map>
#include <set>
#include <string>

namespace hoshidicts::lang {

namespace {
std::vector<std::string> split(const std::string& text, char separator) {
  std::vector<std::string> fields;
  size_t begin = 0;
  while (true) {
    const size_t end = text.find(separator, begin);
    fields.push_back(text.substr(begin, end == std::string::npos ? end : end - begin));
    if (end == std::string::npos) return fields;
    begin = end + 1;
  }
}

// A comment whose first word is `option` or `options`, in any case: what a
// misspelt options line looks like (`# option: default`, `# options default`,
// `#Options: default`).
bool looks_like_options(std::string_view line) {
  size_t i = 1;
  while (i < line.size() && (line[i] == ' ' || line[i] == '\t')) ++i;
  const auto lower = [](char c) { return c >= 'A' && c <= 'Z' ? static_cast<char>(c - 'A' + 'a') : c; };
  size_t end = i;
  while (end < line.size() && lower(line[end]) >= 'a' && lower(line[end]) <= 'z') ++end;
  std::string word;
  for (size_t k = i; k < end; ++k) word += lower(line[k]);
  return word == "option" || word == "options";
}

template <typename Row, typename Parse>
bool read_rows(const std::string& path, size_t columns, std::vector<Row>& rows, std::string* error,
               TestOptions* options, Parse parse) {
  std::ifstream file(path, std::ios::binary);
  if (!file) {
    if (error != nullptr) *error = path + ": cannot be read";
    return false;
  }
  if (options != nullptr) *options = TestOptions::All;
  std::string line;
  size_t number = 0;
  while (std::getline(file, line)) {
    ++number;
    if (number == 1 && line.starts_with("\xEF\xBB\xBF")) {
      if (error != nullptr) *error = path + ":1: pack files are UTF-8 without a byte-order mark";
      return false;
    }
    if (!line.empty() && line.back() == '\r') {
      if (error != nullptr) *error = path + ":" + std::to_string(number) + ": lines end with LF, not CRLF";
      return false;
    }
    if (options != nullptr && !line.empty() && line[0] == '#') {
      if (number == 1 && line == default_options_line) {
        *options = TestOptions::Default;
        continue;
      }
      if (looks_like_options(line)) {
        if (error != nullptr) {
          *error = path + ":" + std::to_string(number) + ": an options line is \"" + std::string(default_options_line) +
                   "\", and only on the first line";
        }
        return false;
      }
    }
    if (line.empty() || line[0] == '#') continue;
    auto cells = split(line, '\t');
    if (cells.size() != columns) {
      if (error != nullptr) {
        *error = path + ":" + std::to_string(number) + ": " + std::to_string(cells.size()) + " columns, expected " +
                 std::to_string(columns);
      }
      return false;
    }
    if (cells[1] != "0" && cells[1] != "1") {
      if (error != nullptr) *error = path + ":" + std::to_string(number) + ": valid is 0 or 1";
      return false;
    }
    Row row;
    row.line = number;
    row.category = cells[0];
    row.valid = cells[1] == "1";
    parse(row, cells);
    rows.push_back(std::move(row));
  }
  return true;
}
}  // namespace

bool read_corpus(const std::string& path, std::vector<CorpusRow>& rows, std::string* error, TestOptions* options) {
  return read_rows(path, 6, rows, error, options, [](CorpusRow& row, std::vector<std::string>& cells) {
    row.source = cells[2];
    row.term = cells[3];
    if (cells[4] != "*") row.rule = cells[4];
    if (cells[5] != "*") row.reasons = cells[5].empty() ? std::vector<std::string>{} : split(cells[5], '|');
  });
}

bool read_text_tsv(const std::string& path, std::vector<TextRow>& rows, std::string* error, TestOptions* options) {
  return read_rows(path, 4, rows, error, options, [](TextRow& row, std::vector<std::string>& cells) {
    row.input = cells[2];
    row.variant = cells[3];
  });
}

bool read_lookup_tsv(const std::string& path, std::vector<LookupRow>& rows, std::string* error, TestOptions* options) {
  return read_rows(path, 5, rows, error, options, [](LookupRow& row, std::vector<std::string>& cells) {
    row.text = cells[2];
    row.expression = cells[3];
    row.matched = cells[4];
  });
}

namespace {
// The options a corpus row runs with (section 12.2): every optional
// processor, transform and pass, or none.
struct RowOptions {
  bool all;
  std::vector<std::string> ids;
  std::vector<bool> enabled_transforms;
};

RowOptions row_options(const PackData& pack, TestOptions options) {
  RowOptions o{options == TestOptions::All, {}, {}};
  if (o.all) {
    for (const auto* list : {&pack.preprocessors, &pack.postprocessors}) {
      for (const auto& p : *list) o.ids.push_back(p.id);
    }
    for (const auto& pass : pack.variant_passes) o.ids.push_back(pass.id);
  }
  if (pack.transforms) {
    for (const auto& t : pack.transforms->transforms) {
      if (o.all) o.ids.push_back(t.id);
      o.enabled_transforms.push_back(o.all && t.optional);
    }
  }
  return o;
}
}  // namespace

std::vector<SourceDeinflection> deinflect_source(const PackData& pack, std::string_view source, bool* limit_reached,
                                                 TestOptions options, SourceSearch* search) {
  const RowOptions o = row_options(pack, options);
  const bool all = o.all;
  const std::vector<bool>& enabled_transforms = o.enabled_transforms;
  const EnabledOptions enabled{o.ids};

  std::vector<SourceDeinflection> out;
  BoundHit hit;
  BoundHit* const hit_ptr = search != nullptr ? &hit : nullptr;
  const auto searched = [&](const Deinflections& list, size_t begin, const std::string& from) {
    if (search != nullptr) add_search(pack, list, begin, hit, from, *search);
  };
  const auto emit = [&](const Deinflections& list) {
    for (const auto& d : list) {
      SourceDeinflection base;
      base.conditions = d.conditions;
      for (const Deinflection* n = &d;; n = &list[n->parent]) {
        if (n->via != Deinflection::none) {
          if (n->via < Deinflection::step_base) base.rules.push_back(n->via);
          const uint32_t step = pack.transforms ? pack.transforms->step_of(n->via) : n->via - Deinflection::step_base;
          base.trace.push_back(pack.trace_steps[step].id);
        }
        if (n->parent == Deinflection::npos) break;
      }
      std::ranges::reverse(base.trace);
      std::ranges::sort(base.rules);
      base.rules.erase(std::unique(base.rules.begin(), base.rules.end()), base.rules.end());
      if (pack.postprocessors.empty()) {
        base.text = d.text;
        out.push_back(std::move(base));
        continue;
      }
      for (auto& variant : process_text(pack.postprocessors, d.text, enabled, limit_reached)) {
        SourceDeinflection post = base;
        post.text = std::move(variant.text);
        out.push_back(std::move(post));
      }
    }
  };
  for (const auto& variant : process_text(pack.preprocessors, source, enabled, limit_reached)) {
    Deinflections list;
    if (pack.transforms) {
      pack.transforms->deinflect(variant.text, list, &enabled_transforms, hit_ptr);
      searched(list, 0, variant.text);
    } else {
      list.push_back(Deinflection{variant.text, 0, Deinflection::npos, Deinflection::none, 0});
    }
    emit(list);
    if (!all) continue;  // every variant pass is optional (section 4.4)
    for (const auto& pass : pack.variant_passes) {
      std::vector<std::string> readings;
      pass.builtin->variants(variant.text, readings);
      Deinflections pass_list;
      for (auto& reading : readings) {
        if (pack.transforms) {
          // Each reading is its own search, in the same list.
          const size_t begin = pass_list.size();
          pack.transforms->deinflect_from_step(std::move(reading), pass.step, pass_list, &enabled_transforms, hit_ptr);
          if (pass_list.size() > begin) searched(pass_list, begin, variant.text);
        } else if (!reading.empty()) {
          pass_list.push_back(Deinflection{std::move(reading), 0, Deinflection::npos, Deinflection::step_base + pass.step, 1});
        }
      }
      emit(pass_list);
    }
  }
  return out;
}

SourceSearch search_source(const PackData& pack, std::string_view source, TestOptions options,
                           std::set<std::string>* searched) {
  SourceSearch search;
  if (!pack.transforms) return search;
  const RowOptions o = row_options(pack, options);
  const EnabledOptions enabled{o.ids};
  const auto& set = *pack.transforms;
  BoundHit hit;
  Deinflections list;
  for (const auto& variant : process_text(pack.preprocessors, source, enabled)) {
    if (!variant.text.empty() && (searched == nullptr || searched->insert(variant.text).second)) {
      list.clear();
      set.deinflect(variant.text, list, &o.enabled_transforms, &hit);
      add_search(pack, list, 0, hit, variant.text, search);
    }
    if (!o.all) continue;  // every variant pass is optional (section 4.4)
    for (const auto& pass : pack.variant_passes) {
      std::vector<std::string> readings;
      pass.builtin->variants(variant.text, readings);
      for (auto& reading : readings) {
        // A reading's search is the search of its text, after the pass step.
        if (reading.empty() || (searched != nullptr && !searched->insert(reading).second)) continue;
        list.clear();
        set.deinflect_from_step(std::move(reading), pass.step, list, &o.enabled_transforms, &hit);
        add_search(pack, list, 0, hit, variant.text, search);
      }
    }
  }
  return search;
}

bool row_matches(const PackData& pack, const CorpusRow& row, const std::vector<SourceDeinflection>& deinflections,
                 std::vector<size_t>* matching, std::string* error) {
  uint32_t wanted = 0;
  if (row.rule) {
    bool known = false;
    if (pack.transforms) {
      for (const auto& condition : pack.transforms->conditions) {
        if (condition.key == *row.rule) {
          wanted = condition.bits;
          known = true;
          break;
        }
      }
    }
    if (!known) {
      if (error != nullptr) *error = "line " + std::to_string(row.line) + ": rule names no condition \"" + *row.rule + "\"";
      return false;
    }
  }
  bool found = false;
  for (size_t i = 0; i < deinflections.size(); ++i) {
    const auto& d = deinflections[i];
    if (d.text != row.term) continue;
    if (row.rule && d.conditions != 0 && (d.conditions & wanted) == 0) continue;
    if (row.reasons) {
      // Reasons are newest first; the trace is in application order.
      if (d.trace.size() != row.reasons->size()) continue;
      if (!std::equal(d.trace.rbegin(), d.trace.rend(), row.reasons->begin())) continue;
    }
    found = true;
    if (matching == nullptr) break;
    matching->push_back(i);
  }
  return found;
}

void add_search(const PackData& pack, const Deinflections& list, size_t begin, const BoundHit& hit,
                const std::string& from, SourceSearch& search) {
  const auto code_points = [](const std::string& text) {
    size_t n = 0;
    for (unsigned char c : text) n += (c & 0xC0) != 0x80;
    return n;
  };
  if (begin >= list.size()) return;
  const size_t root_length = code_points(list[begin].text);
  for (size_t i = begin; i < list.size(); ++i) {
    search.depth = std::max<size_t>(search.depth, list[i].depth - list[begin].depth);
    const size_t length = code_points(list[i].text);
    if (length > root_length) search.growth = std::max(search.growth, length - root_length);
  }
  search.results = std::max(search.results, list.size() - begin);
  if (!hit || search.bound != BoundHit::Bound::None || !pack.transforms) return;
  const auto& set = *pack.transforms;
  const auto rule_name = [&](uint32_t rule) {
    return set.transforms[set.rules[rule].transform].id + "[" + std::to_string(set.rules[rule].index_in_transform) +
           "]";
  };
  std::vector<uint32_t> chain;
  for (uint32_t n = hit.parent;; n = list[n].parent) {
    chain.push_back(n);
    if (list[n].parent == Deinflection::npos) break;
  }
  std::ranges::reverse(chain);
  search.bound = hit.bound;
  const Deinflection& root = list[chain.front()];
  if (root.via != Deinflection::none) {
    search.texts.push_back(from);
    search.steps.push_back(pack.trace_steps[set.step_of(root.via)].id);
  }
  search.texts.push_back(root.text);
  for (size_t k = 1; k < chain.size(); ++k) {
    search.steps.push_back(rule_name(list[chain[k]].via));
    search.texts.push_back(list[chain[k]].text);
  }
  search.steps.push_back(rule_name(hit.rule));
  search.texts.push_back(hit.text);
}

std::string describe(const SourceSearch& hit) {
  std::string out;
  switch (hit.bound) {
    case BoundHit::Bound::None:
      return "no bound";
    case BoundHit::Bound::Growth:
      out = "an output more than " + std::to_string(SearchBounds::max_growth) +
            " code points longer than the text the search started from";
      break;
    case BoundHit::Bound::Depth:
      out = "a chain of more than " + std::to_string(SearchBounds::max_depth) + " rules";
      break;
    case BoundHit::Bound::Results:
      out = "more than " + std::to_string(SearchBounds::max_results) + " deinflections in one search";
      break;
  }
  const size_t n = hit.steps.size();
  out += ", after " + std::to_string(n) + (n == 1 ? " step: " : " steps: ") + (hit.texts.empty() ? "" : hit.texts[0]);
  const auto step = [&](size_t k) { out += " -" + hit.steps[k] + "-> " + hit.texts[k + 1]; };
  if (n <= 10) {
    for (size_t k = 0; k < n; ++k) step(k);
  } else {
    for (size_t k = 0; k < 5; ++k) step(k);
    out += " ... (" + std::to_string(n - 10) + " more) ...";
    for (size_t k = n - 5; k < n; ++k) step(k);
  }
  return out + " (dropped)";
}

namespace {
// The letters stems are made of (tools/check-yomitan.mjs stemLetters): the
// code points of the pack's `letter` class, else of text.wordCharacters, that
// `words` use most (ties by code point), then the class's first letters.
std::vector<std::string> stem_letters(const PackData& pack, const std::vector<std::string>& words, size_t count) {
  const CharClass* letter = &pack.word_characters;
  for (const auto& [name, cls] : pack.classes) {
    if (name == "letter") letter = &cls;
  }
  std::map<char32_t, size_t> frequency;
  for (const auto& word : words) {
    std::u32string cps;
    if (!decode_utf8(word, cps)) continue;
    for (const char32_t c : cps) {
      if (letter->contains(c)) ++frequency[c];
    }
  }
  std::vector<std::pair<char32_t, size_t>> ranked(frequency.begin(), frequency.end());
  std::ranges::stable_sort(ranked, [](const auto& a, const auto& b) { return a.second > b.second; });
  std::vector<std::string> out;
  for (const auto& [c, n] : ranked) {
    if (out.size() == count) break;
    out.push_back(to_utf8(std::u32string(1, c)));
  }
  for (const auto& range : letter->ranges()) {
    for (char32_t c = range.first; c <= range.last && out.size() < count; ++c) {
      const auto category = utf8proc_category(static_cast<utf8proc_int32_t>(c));
      if (category < UTF8PROC_CATEGORY_LU || category > UTF8PROC_CATEGORY_LO || frequency.contains(c)) continue;
      out.push_back(to_utf8(std::u32string(1, c)));
    }
    if (out.size() >= count) break;
  }
  if (out.empty()) out = {"a", "b", "c", "d"};
  return out;
}
}  // namespace

std::vector<std::string> affix_inputs(const PackData& pack, const std::vector<std::string>& words) {
  std::vector<std::string> out;
  if (!pack.transforms) return out;
  std::set<std::string> seen;
  const auto add = [&](const std::string& text) {
    if (!text.empty() && text.find_first_of("\n\r") == std::string::npos && seen.insert(text).second)
      out.push_back(text);
  };
  const auto letters = stem_letters(pack, words, 8);
  const auto l = [&](size_t i) -> const std::string& { return letters[i % letters.size()]; };
  const auto stem = [&](size_t n, size_t offset = 0) {
    std::string s;
    for (size_t i = 0; i < n; ++i) s += l(i + offset);
    return s;
  };
  std::vector<std::string> stems = {stem(1), stem(3), stem(5, 2)};
  {
    std::vector<std::string> short_words;
    for (const auto& word : words) {
      std::u32string cps;
      if (short_words.size() == 3) break;
      if (word.find(' ') != std::string::npos || !decode_utf8(word, cps) || cps.size() > 8) continue;
      if (std::ranges::find(short_words, word) == short_words.end()) short_words.push_back(word);
    }
    stems.insert(stems.end(), short_words.begin(), short_words.end());
  }
  for (const auto& rule : pack.transforms->rules) {
    const RuleExtra* extra = rule.extra.get();
    std::vector<std::string> local = stems;
    if (extra != nullptr && extra->stem_min_length > 1) {
      local.push_back(stem(extra->stem_min_length - 1, 1));
      local.push_back(stem(extra->stem_min_length, 1));
    }
    std::vector<std::string> change;
    if (extra != nullptr && extra->stem_change) {
      for (const auto& from : extra->stem_change->from) {
        change.push_back(l(0) + from + l(1));
        change.push_back(l(2) + from + l(1) + l(3));
        change.push_back(from + l(1));
      }
    }
    switch (rule.type) {
      case RuleType::Suffix:
        add(rule.a);
        for (const auto* list : {&local, &change}) {
          for (const auto& s : *list) add(s + rule.a);
        }
        break;
      case RuleType::Prefix:
        add(rule.a);
        for (const auto* list : {&local, &change}) {
          for (const auto& s : *list) add(rule.a + s);
        }
        break;
      case RuleType::WholeWord:
        add(rule.a);
        add(l(0) + rule.a);
        break;
      case RuleType::Circumfix:
        add(rule.a + rule.c);
        add(rule.a + stem(1) + rule.c);
        add(rule.a + stem(3) + rule.c);
        for (const auto& middle : change) add(rule.a + middle + rule.c);
        break;
      case RuleType::Replace:
        add(rule.a);
        add(l(0) + rule.a + l(1));
        add(rule.a + stem(2));
        break;
      case RuleType::Pattern:
        for (const auto& s : stems) add(rule.anchor_prefix ? rule.a + s : s + rule.a);
        break;
      case RuleType::Phrasal: {
        if (extra == nullptr || extra->followed_by == nullptr) break;
        size_t k = 0;
        for (const auto& word : *extra->followed_by) {
          add(stem(3) + rule.a + " " + word);
          if (k++ < 8) {
            add(stem(3) + rule.a + " " + word + l(1));
            add(stem(3) + rule.a + " " + word + " " + stem(2));
          }
        }
        break;
      }
      case RuleType::InterposedObject: {
        if (extra == nullptr || extra->particles == nullptr) break;
        std::string first;
        for (const auto& particle : *extra->particles) {
          if (first.empty()) first = particle;
          add(stem(3) + " " + stem(2, 1) + " " + particle);
          add(stem(3) + " " + stem(3, 2) + " " + stem(4, 1) + " " + particle + " " + stem(2));
        }
        if (extra->guard_words != nullptr) {
          size_t k = 0;
          for (const auto& guard : *extra->guard_words) {
            if (k++ == 12) break;
            add(stem(3) + " " + guard + " " + stem(2, 1) + " " + first);
          }
        }
        break;
      }
    }
  }
  return out;
}

}  // namespace hoshidicts::lang
