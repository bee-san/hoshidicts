# Language pack template

Copy this directory to `languages/<code>/`, where `<code>` is Yomitan's code
for the language, and follow section 14 of
[`docs/languages.md`](../../docs/languages.md). The engine never loads this
directory: names starting with `_` are not packs.

Replace this README with one that has the sections below. The conformance
test checks that they exist. Section 14 ("What to measure and report") lists
what each one holds; the pull request body gives the same, in the same order,
with the commands that produced each number.

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

Then the same for each input you measured with and did not commit: the
recommended dictionary (name, URL, revision, sha256, licence), the frequency
list, the sentence corpus and the public-domain texts.

## Rule provenance

How many transforms and rules are `own`, `yomitan` and `both`, and which
Yomitan rules were left out, each with the numbers that justify it: its
`--per-rule` counts, and the constructed forms and real text looked up with
and without it (a rule is never removed only because no corpus row needs it).

## Measurements

Every number with the recommended dictionary as published, form-of rows
included (a number from a modified copy may follow, labelled):

1. `hoshidicts-cli eval-language --dictionary` on `corpus.tsv` with
   `gaps.tsv`, on `cases.tsv`, `defaults.tsv` and `yomitan.tsv`, for your
   rules, Yomitan's rules, their union and the final set (your rules alone
   where Yomitan has none): recall, negatives passed, false candidates and
   first rank, with every option on and with the defaults (each file as it
   is and a copy with its `# options: default` line added, or removed).
2. Frequent forms: of the 10,000 most frequent words of a frequency list,
   how many a rule reaches, and how many of those, and what share of the
   list's tokens, show a wrong lemma as the first result with a definition.
3. The same for those forms behind each clitic, pronoun, article and
   auxiliary, in a sentence corpus.
4. Real text: every word of a public-domain text looked up as a host does;
   the number of lookups, the wrong first results (count, rate, how they were
   judged) and the rules behind the largest groups.
5. The performance numbers of section 13: lookup p50/p95 for the word list
   you timed, load time and heap.
6. The commands, and the scripts in `sources/`, that produce every number
   above.

## Known gaps

Forms the rules do not reach, and wrong first results that remain, each with
its count and why.
