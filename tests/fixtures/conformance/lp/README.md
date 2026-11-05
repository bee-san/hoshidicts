# A growing rule loop

A fixture for the conformance test (docs/languages.md, sections 7.4 and
12.1 step 7): hachi-lang-la's reproduction. The two rules have no conditions,
so each applies to the other's output, and the text grows by a code point
every second step: *Rome* → *Romis* → *Romae* → *Romais* → … Before the
search had bounds this overflowed the stack. Now the growth margin ends the
chain, and the conformance test fails the pack with the input and the chain
(`language-search-bounds`). With `conditionsOut: ["n"]` the second rule no
longer applies to the first rule's output and the pack conforms
(`language-search-bounds-conditions`). A copy with an optional preprocessor
that rewrites the final `e` and `is` loops only with the pack's defaults, and
fails as well (`language-search-bounds-defaults`); `tests/corpus.tsv` runs
with the defaults so that its rows pass in that copy too. A copy whose
optional preprocessor leaves the loop alone fails in both modes, and each
lookup counts once (`language-search-bounds-both-modes`).

## Sources and licences

Hand-written for the test.

## Rule provenance

Two `own` suffix rules, `e` → `is` and `is` → `ae`.

## Measurements

None.

## Known gaps

The rules loop on every text that ends in `e` or `is`.
