# Ancient Greek (`grc`)

Work in progress: this commit holds the pack's own rules, written before
Yomitan's Ancient Greek rules were read. `sources/own-rules.mjs` writes
`sources/own.json`; `transforms.json` is a copy of it until the Yomitan port
and the measurements choose the final set.

## Sources and licences

- `sources/own.json`, `sources/own-rules.mjs`, `sources/greek.mjs`: written for
  this pack (GPL-3.0-or-later) from the standard description of Ancient Greek
  (Smyth, *Greek Grammar*; Goodwin, *A Greek Grammar*) and Wiktionary's
  declension and conjugation tables. No table or text is copied.

- `sources/yomitan.json`: Yomitan's Ancient Greek rules,
  [`ext/js/language/grc/ancient-greek-transforms.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/grc/ancient-greek-transforms.js),
  ported by `tools/port-yomitan-transforms.mjs` (55 literal suffix rules, no
  `todo`). The processors `decapitalize`, `capitalizeFirstLetter`,
  `removeAlphabeticDiacritics` and `convertLatinToGreek` are Yomitan's
  (`ext/js/language/text-processors.js`,
  `ext/js/language/grc/ancient-greek-processors.js`). GPL-3.0-or-later,
  Copyright (C) 2024-2026 Yomitan Authors.
- `tests/yomitan.tsv`: Yomitan's
  [Ancient Greek transform test](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/ancient-greek-transforms.test.js),
  converted by `tools/port-yomitan-tests.mjs`. GPL-3.0-or-later, Copyright (C)
  2025-2026 Yomitan Authors.

## Rule provenance

Own rules only, so far.

## Measurements

To come.

## Known gaps

To come.
