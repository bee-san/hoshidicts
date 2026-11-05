// The Deinflector of existing callers, now a view of a language pack's rules
// (docs/languages.md, sections 7 and 10.1). The Japanese rules and their
// descriptions, adopted from Yomitan (GPL-3.0-or-later, Copyright (C)
// 2024-2026 Yomitan Authors), live in languages/ja/transforms.json; see
// languages/ja/README.md.
#include "hoshidicts/deinflector.hpp"

#include <utf8.h>

#include <stdexcept>

#include "hoshidicts/languages.hpp"
#include "languages/pack.hpp"

namespace {
std::vector<DeinflectionResult> convert(const hoshidicts::lang::PackData& pack,
                                        const hoshidicts::lang::Deinflections& deinflections) {
  std::vector<DeinflectionResult> results;
  results.reserve(deinflections.size());
  std::vector<uint32_t> steps;
  for (const auto& d : deinflections) {
    steps.clear();
    for (const auto* n = &d;; n = &deinflections[n->parent]) {
      if (n->via != hoshidicts::lang::Deinflection::none) {
        steps.push_back(pack.transforms->step_of(n->via));
      }
      if (n->parent == hoshidicts::lang::Deinflection::npos) break;
    }
    std::vector<TransformGroup> trace;
    trace.reserve(steps.size());
    for (auto it = steps.rbegin(); it != steps.rend(); ++it) {
      const auto& step = pack.trace_steps[*it];
      trace.push_back(TransformGroup{.name = step.name, .description = step.description, .id = step.id});
    }
    results.push_back(DeinflectionResult{.text = d.text, .conditions = d.conditions, .trace = std::move(trace)});
  }
  return results;
}
}  // namespace

Deinflector::Deinflector() : pack_(hoshidicts::builtin_language_pack("ja")) {}

Deinflector::Deinflector(std::shared_ptr<const hoshidicts::LanguagePack> pack) : pack_(std::move(pack)) {
  if (!pack_) {
    throw std::invalid_argument("a Deinflector needs a language pack");
  }
}

std::vector<DeinflectionResult> Deinflector::deinflect(const std::string& text) const {
  // As before: invalid UTF-8 throws utf8::invalid_utf8.
  (void)utf8::distance(text.begin(), text.end());
  const auto& pack = pack_->data();
  if (!pack.transforms) {
    return {DeinflectionResult{.text = text, .conditions = 0, .trace = {}}};
  }
  hoshidicts::lang::Deinflections deinflections;
  pack.transforms->deinflect(text, deinflections);
  return convert(pack, deinflections);
}

std::vector<DeinflectionResult> Deinflector::deinflect_neko_speech(const std::string& text) const {
  const auto& pack = pack_->data();
  const hoshidicts::lang::VariantPass* pass = nullptr;
  for (const auto& p : pack.variant_passes) {
    if (p.builtin->name == "ja.nekoSpeech") {
      pass = &p;
      break;
    }
  }
  if (pass == nullptr || !pack.transforms) {
    return {};
  }
  hoshidicts::lang::Deinflections deinflections;
  // The readings and their searches share one work budget, as a lookup's do.
  hoshidicts::lang::SearchBudget budget;
  hoshidicts::lang::read_pass(*pass, text, budget, [&](std::string reading) {
    pack.transforms->deinflect_from_step(std::move(reading), pass->step, deinflections, nullptr, nullptr, &budget);
  });
  return convert(pack, deinflections);
}

uint32_t Deinflector::conditions_for_parts_of_speech(std::span<const std::string> tags) const {
  const auto& pack = pack_->data();
  return pack.transforms ? pack.transforms->conditions_for_parts_of_speech(tags) : 0;
}

uint32_t Deinflector::conditions_for_types(std::span<const std::string> names) const {
  const auto& pack = pack_->data();
  return pack.transforms ? pack.transforms->conditions_for_types(names) : 0;
}

uint32_t Deinflector::pos_to_conditions(const std::vector<std::string>& part_of_speech) {
  static const auto japanese = hoshidicts::builtin_language_pack("ja");
  return japanese->data().transforms->conditions_for_parts_of_speech(part_of_speech);
}
