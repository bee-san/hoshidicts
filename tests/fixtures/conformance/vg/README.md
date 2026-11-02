# An interposed object rule with verb guard words

A fixture for the conformance test (docs/languages.md, sections 7.3 and
12.1). The `interposedObject` rule names `verbGuardWords`, English's
auxiliaries, so *had pointed out* and *have turned out* do not become *have
out*, while *pointed it out* still becomes *point out*; `tests/corpus.tsv`
checks both. The pack conforms (`language-verb-guards`).
`language-verb-guards-undefined` runs the test on a copy whose word list is
renamed, which must fail for exactly that reason: the list `verbGuardWords`
names must be defined (12.1 step 1).

## Sources and licences

Hand-written for the test.

## Rule provenance

Three `own` rules: two `phrasal` past rules (`-ed`, and `had` → `have` for the
irregular past) and the `interposedObject` rule.

## Measurements

None.

## Known gaps

The readings whose verb is an auxiliary, such as *had it out* and *did his
coat up*, are not found.
