# A setting that names a transform only another rule file has

A fixture for `tests/conformance_refuses_test.cmake`: everything conforms
except that the setting `archaicForms` turns on the optional transform
`archaic`, which `sources/own.json` declares and the pack's own rules file,
`transforms.json` (its `lookup.transforms`), does not. The conformance test
checks settings against `lookup.transforms` only (docs/languages.md, sections
4.7 and 12.1 step 1), as hosts load the pack; `hoshidicts-cli --transforms`
(section 10.3) does not change that.

## Sources and licences

Hand-written for the test.

## Rule provenance

One `own` rule in `transforms.json`; `sources/own.json` adds the optional
`archaic`.

## Measurements

None.

## Known gaps

None.
