# 0003: Yomitan's descriptor as JSON, with closed rule types and a small pattern dialect

Status: proposed (multi-language design, Phase 1, revision 6)

## Context

Yomitan describes deinflection as conditions plus transforms whose rules are
`suffixInflection`, `prefixInflection`, `wholeWordInflection`, or an arbitrary
`{isInflected: RegExp, deinflect: function}`. A census of every Yomitan file
at d3c54c1 found 18,361 rules: 10,946 literal suffix, prefix and whole-word
rules, and 7,415 others in a handful of recurring shapes (a stem constraint
before an affix, prefix plus suffix, a vowel change in the stem, a global
orthographic replacement, English phrasal verbs) plus a few regular
expressions (German separated prefixes, the Spanish reflexive pronoun,
Tagalog reduplication, the Ukrainian fleeting vowel).

## Decision

`transforms.json` keeps Yomitan's field names (`conditions` with
`isDictionaryForm` and `subConditions`; transforms with `id`, `name`,
`description`, `rules`; rules with `inflected`, `deinflected`,
`conditionsIn`, `conditionsOut`). Rule types are a closed list: `suffix`,
`prefix`, `wholeWord`, `circumfix` (with a cross-product form), `replace`,
`phrasal`, `interposedObject` and `pattern`, with stem constraints and a
`stemChange`. A `pattern` uses a whitelisted grammar that `std::wregex` (fed
UTF-16 code units, classic locale) and JavaScript read the same way, and must
declare a literal anchor so the engine indexes it like a suffix or prefix
rule. Transforms are an array, so order is explicit.

## Options rejected

- **Only literal rules, with the generators written out.** Covers the
  Japanese, French and Korean files, but not English phrasal verbs or Spanish
  stem changes without thousands of rows per verb.
- **English phrasal verbs as anchored patterns.** 38 rules, each with a
  78-word alternation and no anchor: written with `anchorSuffix` they become
  2,964 patterns, 31 MB of WebAssembly heap and 56 ms to compile. Two
  dedicated types (`phrasal`, `interposedObject`) with word lists cost a trie
  and a hash set.
- **Arbitrary regular expressions, as Yomitan allows.** The engine would try
  every pattern on every candidate of every prefix. JavaScript's regex engine
  makes that affordable in Yomitan; `std::regex` does not.
- **A full regex library (PCRE2, RE2).** A new submodule and build
  configuration for CMake, MSVC, Emscripten and Swift, for a few dozen rules;
  it would still need anchors for speed.

## Consequences

- `tools/port-yomitan-transforms.mjs` converts literal rules by probing each
  rule's behaviour (never its `type`), leaves `todo` placeholders that the
  conformance test rejects until a person maps them, and
  `tools/check-yomitan.mjs` compares the result with Yomitan's own transformer.
- Lookbehind, `\p{...}` and the shorthand classes are not in the dialect;
  ported rules use stem constraints, class references or dedicated types.
- `std::wregex` adds 60,106 bytes (2.1%) to Hachidori's single-thread
  WebAssembly bundle (measured with and without a function that compiles,
  searches and replaces), and about 11 KB of heap per compiled pattern with a
  long alternation. Packs report their patterns' heap.
