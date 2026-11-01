// SPDX-License-Identifier: GPL-3.0-or-later
#include "corpus.hpp"

#include <algorithm>
#include <fstream>

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

template <typename Row, typename Parse>
bool read_rows(const std::string& path, size_t columns, std::vector<Row>& rows, std::string* error, Parse parse) {
  std::ifstream file(path, std::ios::binary);
  if (!file) {
    if (error != nullptr) *error = path + ": cannot be read";
    return false;
  }
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

bool read_corpus(const std::string& path, std::vector<CorpusRow>& rows, std::string* error) {
  return read_rows(path, 6, rows, error, [](CorpusRow& row, std::vector<std::string>& cells) {
    row.source = cells[2];
    row.term = cells[3];
    if (cells[4] != "*") row.rule = cells[4];
    if (cells[5] != "*") row.reasons = cells[5].empty() ? std::vector<std::string>{} : split(cells[5], '|');
  });
}

bool read_text_tsv(const std::string& path, std::vector<TextRow>& rows, std::string* error) {
  return read_rows(path, 4, rows, error, [](TextRow& row, std::vector<std::string>& cells) {
    row.input = cells[2];
    row.variant = cells[3];
  });
}

bool read_lookup_tsv(const std::string& path, std::vector<LookupRow>& rows, std::string* error) {
  return read_rows(path, 5, rows, error, [](LookupRow& row, std::vector<std::string>& cells) {
    row.text = cells[2];
    row.expression = cells[3];
    row.matched = cells[4];
  });
}

std::vector<SourceDeinflection> deinflect_source(const PackData& pack, std::string_view source, bool* limit_reached) {
  // Every optional processor, transform and pass.
  std::vector<std::string> ids;
  for (const auto* list : {&pack.preprocessors, &pack.postprocessors}) {
    for (const auto& p : *list) ids.push_back(p.id);
  }
  for (const auto& pass : pack.variant_passes) ids.push_back(pass.id);
  std::vector<bool> enabled_transforms;
  if (pack.transforms) {
    for (const auto& t : pack.transforms->transforms) {
      ids.push_back(t.id);
      enabled_transforms.push_back(t.optional);
    }
  }
  const EnabledOptions enabled{ids};

  std::vector<SourceDeinflection> out;
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
      pack.transforms->deinflect(variant.text, list, &enabled_transforms);
    } else {
      list.push_back(Deinflection{variant.text, 0, Deinflection::npos, Deinflection::none, 0});
    }
    emit(list);
    for (const auto& pass : pack.variant_passes) {
      std::vector<std::string> readings;
      pass.builtin->variants(variant.text, readings);
      Deinflections pass_list;
      for (auto& reading : readings) {
        if (pack.transforms) {
          pack.transforms->deinflect_from_step(std::move(reading), pass.step, pass_list, &enabled_transforms);
        } else if (!reading.empty()) {
          pass_list.push_back(Deinflection{std::move(reading), 0, Deinflection::npos, Deinflection::step_base + pass.step, 1});
        }
      }
      emit(pass_list);
    }
  }
  return out;
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

}  // namespace hoshidicts::lang
