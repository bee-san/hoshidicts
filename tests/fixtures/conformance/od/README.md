# Test files that run with the pack's defaults

A fixture for the conformance test and `hoshidicts-cli eval-language`
(docs/languages.md, section 12.2), laid out as 12.2 tells a pack to lay out
its tests. The pack has an optional preprocessor, `addMissingAccents`, which
reads *estan* as *están*, as the Spanish pack's does, and an optional
transform, `archaic` (*walketh* → *walk*). The transform `present` has a rule
for *están* and one for *estan*.

- `tests/corpus.tsv` stands in for the licensed sample and runs with every
  option on. Its row *estan* → *estar* also passes without the rule for
  *estan*, because the processor reaches *estar* through the rule for
  *están*.
- `tests/cases.tsv` holds the hand-written rows that need an optional
  feature (*estan* → *están*, *walketh* → *walk*) and runs with every option
  on; the coverage check needs its `archaic` row.
- `tests/defaults.tsv`, `tests/text.tsv` and `tests/lookup.tsv` start with
  `# options: default` and run with no optional processor or transform, so
  *estan* → *estar* there needs the rule for *estan*, and their negatives
  check that the processor and the transform are off.

`language-options-default` (`tests/conformance_options_test.cmake`) runs the
test on the pack and on edited copies; `cli-languages` runs `eval-language`
on it.

## Sources and licences

Hand-written for the test.

## Rule provenance

Three `own` rules: `present` (*están* and *estan*) and the optional
`archaic`.

## Measurements

None.

## Known gaps

None.
