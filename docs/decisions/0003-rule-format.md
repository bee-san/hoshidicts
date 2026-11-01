# 0003: Yomitan's descriptor as JSON, with closed rule types and anchored patterns

Status: proposed (multi-language design, Phase 1)

## Context

Yomitan describes deinflection as conditions plus transforms whose rules are
`suffixInflection`, `prefixInflection`, `wholeWordInflection`, or an arbitrary
`{isInflected: RegExp, deinflect: function}`. A census of every Yomitan file
at d3c54c1 found that nine languages use only literal suffix, prefix and
whole-word rules, about ten more need a handful of recurring shapes (a stem
constraint before an affix, prefix plus suffix, a vowel change in the stem, a
global orthographic replacement), and four groups need a regular expression
(English phrasal verbs, German separated prefixes, the Spanish reflexive
pronoun, Tagalog reduplication).

## Decision

`transforms.json` keeps Yomitan's field names (`conditions` with
`isDictionaryForm` and `subConditions`; transforms with `name`, `description`,
`rules`; rules with `inflected`, `deinflected`, `conditionsIn`,
`conditionsOut`). Rule types are a closed list: `suffix`, `prefix`,
`wholeWord`, `circumfix`, `replace`, `pattern`, with optional stem
constraints and a `stemChange`. A `pattern` is a regular expression in a
dialect both `std::wregex` and JavaScript read the same way, and must declare
a literal anchor so the engine indexes it like a suffix or prefix rule.
Transforms are an array, so order is explicit.

## Options rejected

- **Only literal rules, with the generators written out.** Covers the
  Japanese, French and Korean files, but not English phrasal verbs or Spanish
  stem changes without thousands of rows per verb.
- **Arbitrary regular expressions, as Yomitan allows.** The engine would have
  to try every pattern on every candidate of every prefix, about ten thousand
  matches per lookup for German. JavaScript's regex engine makes that
  affordable in Yomitan; `std::regex` does not.
- **A full regex library (PCRE2, RE2).** A new submodule and build
  configuration for CMake, MSVC, Emscripten and Swift, for a few dozen rules;
  it would still need anchors for speed. `std::wregex` is part of the
  standard library every build already has.
- **Dedicated constructs per language (phrasal verb, separable particle).**
  More engine code for each new shape; `pattern` covers them with data.

## Consequences

- `tools/port-yomitan-transforms.mjs` converts literal rules automatically and
  leaves `todo` placeholders that the conformance test rejects until a person
  maps them.
- Lookbehind, `\p{...}` and `\w` are not in the dialect; ported rules use stem
  constraints or class references instead.
- `std::wregex` adds code to every build. The framework measures the
  WebAssembly growth; above 5% of a bundle, `pattern` is replaced by four
  dedicated rule types (separated particle, interposed object, pronoun
  clitic, reduplication) before any pack uses it.
