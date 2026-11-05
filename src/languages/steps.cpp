// SPDX-License-Identifier: GPL-3.0-or-later
#include "steps.hpp"

#include <ankerl/unordered_dense.h>
#include <utf8.h>

#include <algorithm>
#include <iterator>

#include "case_mapping.hpp"

namespace hoshidicts::lang {

namespace {

constexpr size_t max_pattern_repeats = 16;

bool starts_with_at(const std::u32string& text, size_t at, const std::u32string& key) {
  return at + key.size() <= text.size() && std::equal(key.begin(), key.end(), text.begin() + static_cast<std::ptrdiff_t>(at));
}

// The first key (longest first) that matches at `at`, or nullptr; `ops`
// counts the keys tried.
template <typename Entry>
const Entry* key_at(const std::vector<Entry>& keys, const std::u32string& text, size_t at, size_t& ops) {
  for (const auto& entry : keys) {
    ++ops;
    if (starts_with_at(text, at, entry.first)) return &entry;
  }
  return nullptr;
}

struct MapMatch {
  size_t index;
  const std::pair<std::u32string, std::u32string>* entry;
};

// Non-overlapping matches, scanning left to right, longest key first.
void map_matches(const Step& step, const std::u32string& text, std::vector<MapMatch>& out, size_t& ops) {
  out.clear();
  size_t i = 0;
  while (i < text.size()) {
    if (const auto* entry = key_at(step.map, text, i, ops)) {
      out.push_back({i, entry});
      i += entry->first.size();
    } else {
      ++i;
    }
  }
}

void apply_map(const Step& step, const std::u32string& text, std::u32string& out, size_t& ops) {
  out.clear();
  switch (step.at) {
    case MapAt::Start: {
      const auto* entry = key_at(step.map, text, 0, ops);
      if (entry == nullptr) {
        out = text;
      } else {
        out = entry->second;
        out.append(text, entry->first.size());
      }
      return;
    }
    case MapAt::End: {
      for (const auto& entry : step.map) {
        ++ops;
        if (entry.first.size() <= text.size() && text.ends_with(entry.first)) {
          out.assign(text, 0, text.size() - entry.first.size());
          out += entry.second;
          return;
        }
      }
      out = text;
      return;
    }
    case MapAt::First:
    case MapAt::Last: {
      std::vector<MapMatch> matches;
      map_matches(step, text, matches, ops);
      if (matches.empty()) {
        out = text;
        return;
      }
      const MapMatch& m = step.at == MapAt::First ? matches.front() : matches.back();
      out.assign(text, 0, m.index);
      out += m.entry->second;
      out.append(text, m.index + m.entry->first.size());
      return;
    }
    case MapAt::All: {
      std::vector<MapMatch> matches;
      map_matches(step, text, matches, ops);
      size_t last = 0;
      for (const auto& m : matches) {
        out.append(text, last, m.index - last);
        out += m.entry->second;
        last = m.index + m.entry->first.size();
      }
      out.append(text, last);
      return;
    }
  }
}

size_t utf8_code_points(std::string_view s) {
  size_t n = 0;
  for (unsigned char c : s) n += (c & 0xC0) != 0x80;
  return n;
}

// A repeated pattern stops after the round whose text passes the limit, so a
// replacement that doubles the text runs at most until then (section 6.2).
// Every round but the last counts into `limit.written` here; the caller counts
// the last, which is `out`.
bool apply_pattern(const Step& step, const std::u32string& text, std::u32string& out, StepLimit& limit) {
  std::string current = to_utf8(text);
  const size_t times = step.repeat ? max_pattern_repeats : 1;
  std::string next;
  bool within = true;
  size_t previous = 0;
  size_t length = text.size();  // the round's text, in code points
  for (size_t n = 0; n < times; ++n) {
    limit.read += length;
    if (!step.pattern->replace(current, next) || next == current) break;
    current.swap(next);
    if (step.repeat) {
      limit.written += previous;
      previous = utf8_code_points(current);
      length = previous;
      if (previous > limit.max_code_points) {
        within = false;
        break;
      }
    }
  }
  if (!decode_utf8(current, out)) {
    out = text;
  }
  return within;
}

void apply_alternatives(const Step& step, const std::u32string& text, std::vector<std::u32string>& out, size_t& ops) {
  std::u32string source;
  normalize(text, NormalForm::NFC, source);
  std::vector<std::vector<const std::u32string*>> pieces;
  std::vector<std::u32string> literals;
  literals.reserve(source.size() + 1);
  std::u32string literal;
  const auto flush = [&] {
    if (!literal.empty()) {
      literals.push_back(literal);
      literal.clear();
    }
  };
  // Pieces refer to the literals by index until the vector stops growing.
  std::vector<std::pair<bool, size_t>> order;  // (is literal, index)
  size_t i = 0;
  while (i < source.size()) {
    const auto* entry = key_at(step.alternatives, source, i, ops);
    if (entry == nullptr) {
      literal.push_back(source[i]);
      ++i;
      continue;
    }
    if (!literal.empty()) {
      order.emplace_back(true, literals.size());
      flush();
    }
    order.emplace_back(false, static_cast<size_t>(entry - step.alternatives.data()));
    i += entry->first.size();
  }
  if (!literal.empty()) {
    order.emplace_back(true, literals.size());
    flush();
  }
  for (const auto& [is_literal, index] : order) {
    std::vector<const std::u32string*> choices;
    if (is_literal) {
      choices.push_back(&literals[index]);
    } else {
      const auto& entry = step.alternatives[index];
      choices.push_back(&entry.first);
      for (const auto& alternative : entry.second) choices.push_back(&alternative);
    }
    pieces.push_back(std::move(choices));
  }
  const size_t start = out.size();
  std::u32string prefix;
  const auto walk = [&](auto&& self, size_t index) -> void {
    if (out.size() - start >= step.limit) return;
    if (index == pieces.size()) {
      out.push_back(prefix);
      return;
    }
    for (const std::u32string* choice : pieces[index]) {
      const size_t mark = prefix.size();
      prefix += *choice;
      self(self, index + 1);
      prefix.resize(mark);
      if (out.size() - start >= step.limit) return;
    }
  };
  walk(walk, 0);
}

}  // namespace

void apply_step(const Step& step, const std::u32string& in, std::u32string& out) {
  StepLimit unlimited;
  apply_step(step, in, out, unlimited);
}

bool apply_step(const Step& step, const std::u32string& in, std::u32string& out, StepLimit& limit) {
  const auto within = [&] {
    limit.written += out.size();
    return out.size() <= limit.max_code_points;
  };
  switch (step.kind) {
    case StepKind::Builtin:
      step.builtin(in, out);
      return within();
    case StepKind::Case:
      switch (step.case_mode) {
        case CaseMode::Lower:
          to_lower(in, out);
          return within();
        case CaseMode::Upper:
          to_upper(in, out);
          return within();
        case CaseMode::UpperFirst:
          upper_first(in, out);
          return within();
        case CaseMode::LowerFirst:
          lower_first(in, out);
          return within();
      }
      return within();
    case StepKind::Normalize:
      if (!step.has_within) {
        normalize(in, step.form, out);
        return within();
      } else {
        out.clear();
        std::u32string run;
        std::u32string normalized;
        for (char32_t c : in) {
          if (step.chars.contains(c)) {
            run.push_back(c);
          } else {
            normalize(run, step.form, normalized);
            out += normalized;
            out.push_back(c);
            run.clear();
          }
        }
        normalize(run, step.form, normalized);
        out += normalized;
      }
      return within();
    case StepKind::Strip:
      out.clear();
      out.reserve(in.size());
      for (char32_t c : in) {
        if (!step.chars.contains(c)) out.push_back(c);
      }
      return within();
    case StepKind::Map:
      apply_map(step, in, out, limit.ops);
      return within();
    case StepKind::Pattern: {
      const bool rounds_within = apply_pattern(step, in, out, limit);
      return within() && rounds_within;
    }
    case StepKind::Alternatives: {
      std::vector<std::u32string> all;
      apply_alternatives(step, in, all, limit.ops);
      out = all.empty() ? in : all.front();
      return within();
    }
  }
  return within();
}

void apply_steps(const StepList& steps, const std::u32string& in, std::vector<std::u32string>& out, StepLimit& limit) {
  // An alternatives step is the only step of its list (the parser refuses
  // others).
  if (steps.size() == 1 && steps[0].kind == StepKind::Alternatives) {
    const size_t start = out.size();
    apply_alternatives(steps[0], in, out, limit.ops);
    for (size_t i = start; i < out.size(); ++i) {
      limit.written += out[i].size();
      if (out[i].size() > limit.max_code_points) out[i] = in;
    }
    return;
  }
  std::u32string result;
  if (!apply_single(steps, in, result, limit)) result = in;
  out.push_back(std::move(result));
}

void apply_steps(const StepList& steps, const std::u32string& in, std::vector<std::u32string>& out) {
  std::vector<std::u32string> texts{in};
  std::vector<std::u32string> next;
  for (const Step& step : steps) {
    next.clear();
    for (const auto& text : texts) {
      if (step.kind == StepKind::Alternatives) {
        size_t ops = 0;
        apply_alternatives(step, text, next, ops);
      } else {
        apply_step(step, text, next.emplace_back());
      }
    }
    texts.swap(next);
  }
  for (auto& text : texts) out.push_back(std::move(text));
}

void apply_single(const StepList& steps, const std::u32string& in, std::u32string& out) {
  StepLimit unlimited;
  apply_single(steps, in, out, unlimited);
}

std::string normalize_text(const StepList& steps, std::string_view text) {
  std::u32string in;
  if (!decode_utf8(text, in)) return std::string(text);
  std::vector<std::u32string> outputs;
  StepLimit limit{step_limit(in.size())};
  apply_steps(steps, in, outputs, limit);
  return outputs.empty() ? std::string(text) : to_utf8(outputs.front());
}

bool apply_single(const StepList& steps, const std::u32string& in, std::u32string& out, StepLimit& limit) {
  if (steps.empty()) {
    out = in;
    return true;
  }
  std::u32string a = in;
  for (const Step& step : steps) {
    const bool within = apply_step(step, a, out, limit);
    a.swap(out);
    if (!within) break;
  }
  out.swap(a);
  return out.size() <= limit.max_code_points;
}

namespace {
using Variant = std::pair<std::u32string, int>;

// Orders variants by code points (one comparator, so one sort instantiation).
struct ByText {
  bool operator()(const Variant& a, const Variant& b) const { return a.first < b.first; }
};

// The variants a processor has produced so far, with their positions in a
// hash map once there are many (alternatives can make thousands).
struct NextVariants {
  std::vector<Variant>& items;
  size_t count = 0;
  ankerl::unordered_dense::map<std::u32string, size_t>* positions = nullptr;

  Variant* find(const std::u32string& text) {
    if (positions != nullptr) {
      const auto it = positions->find(text);
      return it == positions->end() ? nullptr : &items[it->second];
    }
    for (size_t k = 0; k < count; ++k) {
      if (items[k].first == text) return &items[k];
    }
    return nullptr;
  }
};

constexpr size_t index_from = 32;

// Adds a text (moved from `text` when `move`) unless it is there, keeping the
// smallest steps.
[[gnu::always_inline]] inline void add_variant(NextVariants& next, std::u32string& text, bool move, int steps,
                                               bool* limit_reached) {
  if (Variant* existing = next.find(text)) {
    if (steps < existing->second) existing->second = steps;
    return;
  }
  if (next.count >= max_text_variants) {
    if (limit_reached != nullptr) *limit_reached = true;
    return;
  }
  if (next.count < next.items.size()) {
    if (move) {
      std::swap(next.items[next.count].first, text);
    } else {
      next.items[next.count].first.assign(text);
    }
    next.items[next.count].second = steps;
  } else if (move) {
    next.items.emplace_back(std::move(text), steps);
  } else {
    next.items.emplace_back(text, steps);
  }
  if (next.positions != nullptr) {
    next.positions->emplace(next.items[next.count].first, next.count);
  }
  ++next.count;
  if (next.count == max_text_variants && limit_reached != nullptr) *limit_reached = true;
  if (next.positions == nullptr && next.count > index_from) {
    static thread_local ankerl::unordered_dense::map<std::u32string, size_t> positions;
    positions.clear();
    for (size_t k = 0; k < next.count; ++k) positions.emplace(next.items[k].first, k);
    next.positions = &positions;
  }
}

// Runs the processors of section 6.1 over `variants` (count in `count`).
void run_processors(std::span<const Processor> processors, const EnabledOptions& enabled,
                    std::vector<Variant>& variants, size_t& count, std::vector<Variant>& next_items,
                    bool* limit_reached, SearchBudget* budget) {
  // With a budget (section 7.4), each builtin or step list applied costs its
  // work, and each variant a processor keeps costs a unit plus a unit per
  // SearchBounds::work_bytes bytes (4 a code point), for the hashing, copying
  // and sorting that keep it. Once the budget is spent, a variant is kept as
  // it is, as if the processor's remaining lists had not changed it, and the
  // remaining processors do not run: the variants are the result.
  const auto spent = [budget] { return budget != nullptr && budget->spent(); };
  const auto charge_builtin = [budget](const std::u32string& output) {
    if (budget != nullptr) budget->spend(1 + 4 * output.size() / SearchBounds::work_bytes);
  };
  const auto charge_kept = [budget, &variants, &count] {
    if (budget == nullptr) return;
    size_t units = 0;
    for (size_t k = 0; k < count; ++k) units += 1 + 4 * variants[k].first.size() / SearchBounds::work_bytes;
    budget->spend(units);
  };
  static thread_local std::u32string scratch;
  static thread_local std::vector<std::u32string> outputs;
  // A step list may make at most step_limit(n) code points from the n of the
  // text given to the processors (section 6.2); a longer output is the text
  // it was given, as if the list had not changed it.
  const size_t max_code_points = step_limit(count == 0 ? 0 : variants[0].first.size());
  for (const auto& processor : processors) {
    if (spent()) return;
    if (processor.optional && !enabled.contains(processor.id)) {
      continue;
    }
    NextVariants next{next_items};
    if (!processor.builtins.empty() && count * (processor.builtins.size() + 1) <= index_from) {
      // At most index_from variants can come out: no hash index and no
      // limit to check, as text_processor::process did for Japanese.
      size_t next_count = 0;
      const auto find = [&](const std::u32string& text) -> Variant* {
        for (size_t k = 0; k < next_count; ++k) {
          if (next_items[k].first == text) return &next_items[k];
        }
        return nullptr;
      };
      for (size_t vi = 0; vi < count; ++vi) {
        std::u32string& variant = variants[vi].first;
        const int steps = variants[vi].second;
        bool stopped = false;
        for (const TextFunction builtin : processor.builtins) {
          if (spent()) {
            stopped = true;
            break;
          }
          builtin(variant, scratch);
          charge_builtin(scratch);
          const bool same = scratch == variant;
          if (same && processor.keep_input) continue;
          const int new_steps = same ? steps : steps + 1;
          if (Variant* existing = find(scratch)) {
            if (new_steps < existing->second) existing->second = new_steps;
          } else if (next_count < next_items.size()) {
            next_items[next_count].first.assign(scratch);
            next_items[next_count++].second = new_steps;
          } else {
            next_items.emplace_back(scratch, new_steps);
            ++next_count;
          }
        }
        if (processor.keep_input || stopped) {
          if (Variant* existing = find(variant)) {
            if (steps < existing->second) existing->second = steps;
          } else if (next_count < next_items.size()) {
            std::swap(next_items[next_count].first, variant);
            next_items[next_count++].second = steps;
          } else {
            next_items.emplace_back(std::move(variant), steps);
            ++next_count;
          }
        }
      }
      std::sort(next_items.begin(), next_items.begin() + static_cast<std::ptrdiff_t>(next_count),
                ByText{});
      std::swap(variants, next_items);
      count = next_count;
      charge_kept();
      continue;
    }
    if (!processor.builtins.empty()) {
      for (size_t vi = 0; vi < count; ++vi) {
        std::u32string& variant = variants[vi].first;
        const int steps = variants[vi].second;
        bool stopped = false;
        for (const TextFunction builtin : processor.builtins) {
          if (spent()) {
            stopped = true;
            break;
          }
          builtin(variant, scratch);
          charge_builtin(scratch);
          if (scratch == variant) {
            if (!processor.keep_input) add_variant(next, variant, false, steps, limit_reached);
          } else {
            add_variant(next, scratch, false, steps + 1, limit_reached);
          }
        }
        if (processor.keep_input || stopped) {
          add_variant(next, variant, true, steps, limit_reached);
        }
      }
      std::sort(next_items.begin(), next_items.begin() + static_cast<std::ptrdiff_t>(next.count),
                ByText{});
      std::swap(variants, next_items);
      count = next.count;
      charge_kept();
      continue;
    }
    for (size_t vi = 0; vi < count; ++vi) {
      std::u32string& variant = variants[vi].first;
      const int steps = variants[vi].second;
      bool stopped = false;
      for (const StepList& steps_list : processor.variants) {
        if (spent()) {
          stopped = true;
          break;
        }
        if (steps_list.size() == 1 && steps_list[0].kind == StepKind::Builtin) {
          steps_list[0].builtin(variant, scratch);
          charge_builtin(scratch);
          if (scratch == variant) {
            if (!processor.keep_input) add_variant(next, variant, false, steps, limit_reached);
          } else {
            add_variant(next, scratch, false, steps + 1, limit_reached);
          }
          continue;
        }
        outputs.clear();
        StepLimit limit{max_code_points};
        apply_steps(steps_list, variant, outputs, limit);
        if (budget != nullptr) charge_steps(*budget, limit);
        for (auto& output : outputs) {
          if (output == variant) {
            if (!processor.keep_input) add_variant(next, variant, false, steps, limit_reached);
          } else {
            add_variant(next, output, true, steps + 1, limit_reached);
          }
        }
      }
      if (processor.keep_input || stopped) {
        add_variant(next, variant, true, steps, limit_reached);
      }
    }
    std::sort(next_items.begin(), next_items.begin() + static_cast<std::ptrdiff_t>(next.count),
              ByText{});
    std::swap(variants, next_items);
    count = next.count;
    charge_kept();
  }
}
}  // namespace

// https://github.com/yomidevs/yomitan/blob/81d17d877fb18c62ba826210bf6db2b7f4d4deed/ext/js/language/translator.js#L564
std::vector<TextVariant> process_text(std::span<const Processor> processors, std::string_view input,
                                      const EnabledOptions& enabled, bool* limit_reached, SearchBudget* budget) {
  static thread_local std::vector<Variant> variants_pool;
  static thread_local std::vector<Variant> next_pool;
  std::vector<Variant>& variants = variants_pool;
  std::vector<Variant>& next = next_pool;
  if (variants.empty()) {
    variants.emplace_back();
  }
  variants[0].first.clear();
  utf8::utf8to32(input.begin(), input.end(), std::back_inserter(variants[0].first));
  variants[0].second = 0;
  size_t count = 1;
  run_processors(processors, enabled, variants, count, next, limit_reached, budget);

  std::vector<TextVariant> result;
  result.reserve(count);
  for (size_t vi = 0; vi < count; ++vi) {
    const std::u32string& variant = variants[vi].first;
    size_t bytes = 0;
    for (char32_t c : variant) {
      bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    std::string utf8;
    utf8.resize_and_overwrite(bytes, [&](char* out, size_t) {
      char* end = utf8::utf32to8(variant.begin(), variant.end(), out);
      return static_cast<size_t>(end - out);
    });
    result.emplace_back(std::move(utf8), variants[vi].second);
  }
  return result;
}

void process_text32(std::span<const Processor> processors, const std::u32string& input, const EnabledOptions& enabled,
                    std::vector<std::pair<std::u32string, int>>& out, bool* limit_reached, SearchBudget* budget) {
  std::vector<Variant> variants{{input, 0}};
  std::vector<Variant> next;
  size_t count = 1;
  run_processors(processors, enabled, variants, count, next, limit_reached, budget);
  out.assign(std::make_move_iterator(variants.begin()), std::make_move_iterator(variants.begin() + static_cast<std::ptrdiff_t>(count)));
}

}  // namespace hoshidicts::lang
