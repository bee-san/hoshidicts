# A test file that runs with the pack's defaults

A fixture for the conformance test and `hoshidicts-cli eval-language`
(docs/languages.md, section 12.2). The pack has an optional preprocessor,
`addMissingAccents`, which reads *estan* as *están*, as the Spanish pack's
does, and an optional transform, `archaic` (*walketh* → *walk*). The
transform `present` has a rule for *están* and one for *estan*.

With every option on, the processor reaches *estar* from *estan* through the
rule for *están*, so `tests/corpus.tsv`'s row *estan* → *estar* passes even
without the rule for *estan*. `tests/cases.tsv`, `tests/text.tsv` and
`tests/lookup.tsv` start with `# options: default` and run with no optional
processor or transform, so *estan* → *estar* there needs that rule, and their
negatives check that the processor and the transform are off.
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
