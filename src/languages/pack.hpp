// SPDX-License-Identifier: GPL-3.0-or-later
// A parsed language pack (docs/languages.md, sections 3-7): what the engine
// reads of language.json and transforms.json, checked against the contract's
// schema.
#pragma once

#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "builtins/builtins.hpp"
#include "classes.hpp"
#include "steps.hpp"
#include "transforms.hpp"

namespace hoshidicts::lang {

enum class Resolution : unsigned char { Character, Word };
enum class TraceSelection : unsigned char { Shortest, First };

// A trace step: a transform, or a variant pass.
struct TraceStep {
  std::string id;
  std::string name;
  std::string description;
};

struct VariantPass {
  std::string id;
  const PassBuiltin* builtin = nullptr;
  uint32_t step = 0;  // its trace step
};

// A list of steps by the name tests/classes.json gives it (section 12.1): a
// processor id, `lookup.readingNormalizer`, `presentation.displayTransforms.<name>`
// or `transforms[i].rules[j].then`; a processor's steps across its variants.
struct NamedSteps {
  std::string name;
  std::vector<const Step*> steps;
};

struct PackData {
  std::string code;
  std::string name;
  std::string transforms_file;  // lookup.transforms, or empty

  // `classes` in definition order, and every other field that holds a class,
  // by JSON path, in the order of section 12.1.
  std::vector<std::pair<std::string, CharClass>> classes;
  std::vector<std::pair<std::string, CharClass>> class_fields;

  CharClass text_pattern;
  CharClass word_characters;
  std::optional<CharClass> word_internal;
  Resolution resolution = Resolution::Character;
  std::vector<Processor> preprocessors;
  std::vector<Processor> postprocessors;
  std::optional<StepList> reading_normalizer;
  std::vector<std::pair<std::string, StepList>> display_transforms;
  TraceSelection trace_selection = TraceSelection::Shortest;
  std::vector<std::string> function_words;
  std::vector<VariantPass> variant_passes;
  std::unique_ptr<TransformSet> transforms;  // null when lookup.transforms is null
  std::vector<TraceStep> trace_steps;        // the transforms, then the variant passes
  std::vector<NamedSteps> named_steps;
  std::vector<std::string> sample_texts;     // host.sample's strings, in the order of section 12.1
  bool has_optional_processors = false;

  // Whether a request's language options name a processor, transform or
  // pass of this pack (unknown ids are ignored).
  const VariantPass* find_pass(std::string_view id) const {
    for (const auto& pass : variant_passes) {
      if (pass.id == id) return &pass;
    }
    return nullptr;
  }
};

// Parses and checks a pack. `transforms_json` is the file lookup.transforms
// names; it may be empty only when that is null. On a problem returns null
// and sets `error` to "<code>: <file>: <JSON path>: <reason>".
// `trusted` is for the packs built into the library, whose bytes the
// language conformance test checks against the full schema (they must equal
// languages/<code>/): it skips the shape checks of the host-only blocks
// (text's sentence, highlight and line-joining members, capabilities,
// presentation, settings and host) and leaves PackData's fields that only
// tests/classes.json reads (display transforms, sample texts, the
// characterView class field) empty. Everything a lookup uses is parsed and
// checked as always.
std::unique_ptr<PackData> parse_pack(std::string_view language_json, std::string_view transforms_json,
                                     std::string* error, bool trusted = false);

// A pack whose deinflection rules are replaced by another rule file for one
// run (`hoshidicts-cli --transforms`, section 10.3): parse_pack with
// `rules_json` in place of the file lookup.transforms names (also when that
// is null), except that a setting's `transforms` effect may name ids the
// rules lack, and errors in the rules name `rules_name`. The caller first
// checks the pack with its own rules file, as hosts load it (parse_pack).
std::unique_ptr<PackData> parse_pack_with_rules(std::string_view language_json, std::string_view rules_json,
                                                std::string_view rules_name, std::string* error);

// lookup.transforms of a descriptor, or empty when it is null, missing or the
// descriptor does not parse (parse_pack reports what is wrong with it).
std::string transforms_file_name(std::string_view language_json);

}  // namespace hoshidicts::lang
