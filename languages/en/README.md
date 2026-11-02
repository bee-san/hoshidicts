# Language pack template

Copy this directory to `languages/<code>/`, where `<code>` is Yomitan's code
for the language, and follow section 14 of
[`docs/languages.md`](../../docs/languages.md). The engine never loads this
directory: names starting with `_` are not packs.

Replace this README with one that has the sections below. The conformance
test checks that they exist.

## Sources and licences

For every file in `tests/` and every set of ported rules: where it came
from (URL and revision), its licence, and the attribution the licence
requires. Example:

- `tests/corpus.tsv`: 412 pairs sampled with seed 1 from
  [UniMorph eng](https://github.com/unimorph/eng) at `<commit>`, CC BY-SA
  3.0, by the UniMorph contributors.
- Rules with `source: "yomitan"`: ported from
  [Yomitan](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/xx/xx-transforms.js),
  GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan Authors.

## Rule provenance

How many transforms and rules are `own`, `yomitan` and `both`, and which
Yomitan rules were left out and why.

## Measurements

The output of `hoshidicts-cli eval-language` for your rules, Yomitan's rules
and the final set: cases, recall, false candidates per lookup, first-rank
rate, with the dictionary used (name, URL, version, licence), and lookup
p50/p95 for the word list you timed.

## Known gaps

Forms the rules do not reach, and why.
