# Probe packs

Small language packs that pin the pipeline features the Japanese pack does
not use ([`docs/languages.md`](../../../docs/languages.md)). `languages-test`
(`tests/languages_test.cpp`) loads this directory with
`LanguageRegistry::add_directory`, and `cli-languages`
(`tests/cli_languages_test.cmake`) runs the real `hoshidicts-cli` with
`--languages` set to it. The packs are not under `languages/`, so they get no
conformance test and are never shipped.

| Pack | What it has | What the tests check (contract section) |
| --- | --- | --- |
| `trf`, `trs` | A `map` preprocessor (z → a at the first z), rules `P` (zb → zc), `Q` (c → ""), `R` (b → ""), `W` (whole word zb → a); `traceSelection` `first` and `shortest` | Which deinflection a result keeps at one matched length (9.6) |
| `rdn` | `readingNormalizer: [{"case": "lower"}]`, plural `s` | Readings that differ only in case merge into one result with both glossaries and both readings' frequencies; `primary_reading` is compared normalised (9.6) |
| `opt` | An optional preprocessor `up` (upper case), an optional transform `opt` (q → "") and a setting that turns `opt` on | Both are off by default and turned on by `LookupOptions::language_options` (4.7); the CLI's `--options` and `--all-options`, and `--transforms` with `languages-cli/opt-rules.json`, which lacks `opt` (10.3) |
| `pst` | A postprocessor `up` (upper case), character resolution | Postprocessed forms are looked up and add to the steps (9.3); the long-key check uses postprocessed prefixes (9.1) |
| `wrd`, `wdi` | Word resolution, rule `ing` (ing → e); `wdi` has `wordInternal: "[']"` | The window grows to the end of a word below the long-key length; a word-internal apostrophe keeps a word whole (9.2) |
| `stm` | Rules with `stemChange` (`occurrence` `last` and `first`), `stemNotStartsWithText`, a prefix and a suffix rule on the same letter, a plural with a union condition; a preprocessor with two `map` variants | Stem changes and stem constraints (7.3), suffix-indexed rules before prefix-indexed ones (7.4), variants sorted after a processor (6.1), the CLI's condition names and `eval-language` recall (10.3) with `tests/corpus.tsv`; a copy with `lookup.transforms` null, for `--transforms` on a pack without rules (10.3) |

The dictionary the lookups use is built by `languages-test` itself.
`tests/fixtures/languages-cli/invalid-utf8.txt` is an input with a line that
is not valid UTF-8, for the CLI's error report. `opt-rules.json` there is a
rule file for `opt` without the transform `opt` and with an optional
transform `z` of its own, and `opt-corpus.tsv` a corpus that tells the two
rule sets apart, for `--transforms`.
