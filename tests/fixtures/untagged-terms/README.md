# Untagged-terms fixture

A probe pack and a dictionary for `untagged-terms-test`
(`tests/untagged_terms_test.cpp`) and `cli-untagged-terms`
(`tests/cli_untagged_terms_test.cmake`), which check how the part-of-speech
filter treats dictionary rows whose `rules` name no tag, as
wiktionary-to-yomitan writes them for languages without Yomitan transforms
(`lookup.untaggedTerms`, [`docs/languages.md`](../../../docs/languages.md),
sections 4.4, 9.4 and 9.10). Written for hoshidicts (GPL-3.0-or-later). The
tests zip `dictionary/` and import it at run time.

`languages/ut` is a word-resolution pack with `untaggedTerms: "filter"`,
`formOf: "follow"` and the hyphen as a word-internal character. Its
conditions are `v` (a dictionary form, with the subConditions `v_ar` and
`v_other`), `n` (a dictionary form) and `vf` (a verb form whose pronoun was
removed, no dictionary form), so D, the conditions an untagged row carries
under `"pass"`, is `v_ar | v_other | n`. Its rules are `past` (`-ed`, and
`-ed` → `-e`; out `v`), `neg` (`un-`; in and out `v`), `plural` (`-s`; out
`n`), `enclitic` (`a-se` → `a`; out `vf`) and `infinitive` (`a` → `ar`; in
`vf`, out `v_ar`), the last two after hachi-lang-pt's Portuguese case, and
`progressive` (`-ing`; out `v` and `vf`, conditions that overlap D without
being inside it). The tests add copies with `"pass"`, with `formOf: "asTerm"`,
with both, and one with `"pass"` and `"transforms": null`, whose D is 0.

`dictionary` (title `untagged`):

| Rows | `rules` | What they check |
| --- | --- | --- |
| `walk` | `v` | A tagged term of the rule's part of speech: `walked` finds it in both modes |
| `book` | `n` | A tagged term of another part of speech: `booked` finds nothing in both modes; `books` finds it |
| `talk` | empty | An untagged term: `talked` finds it only with `"pass"` |
| `casa`, `casar` | empty | `casas` finds `casa` only with `"pass"`; `casa-se` gives `casa` with `vf` and `casar` with `v_ar`: `"pass"` finds only `casar` (D has no `vf` and holds `v_ar` through `v`) |
| `lift` | one space | Whitespace names no tag: `lifted` as `talked` |
| `pick` | `zz` | A tag the pack does not know is a tag: `picked` finds nothing in both modes |
| `use` (score 5), `us` | empty | `"pass"` finds every untagged term a rule reaches: `used` gives `use`, then the pronoun `us`; `us` is `eval-language`'s false candidate |
| `sail` | `v`, and a second row with none | `sails` (noun rule) finds the term, with both rows, only with `"pass"` |
| `park` | none, and a second row with `v` | The same with the untagged row first (a term's rows count together): `parks` only with `"pass"`, `parked` in both modes |
| `spoke` → speak, `speak` | empty | An untagged form-of row: followed for `spoke` in both modes, for `unspoke` (`neg`, `v`) only with `"pass"` |
| `mata` → mato, `mato` | empty | ... and never from a form with only intermediate conditions: `mata-se` gives `mata` with `vf`, and nothing in both modes; `mata` gives `mato` |
| `bake` (score 3), `bak` → bark, `bark` | empty | `baked` reaches `bake` and `bak` (the two past rules): with `"pass"`, `bake`, then `bark` through the reference, `eval-language`'s false candidate; with `"asTerm"` the row `bak` is the false candidate, and the score puts `bake` first |
| `ran` → run, `run` | `v` | A tagged form-of row: `unran` gives `run` in both modes |
| `dice` → die, `die` | `n` | A tagged form-of row of another part of speech: `undice` gives nothing in both modes |

The tests also look up:
- `talking` and `walking` (`progressive`, out `v` and `vf`): `talk` only with `"pass"`, because the output overlaps D; `walk` in both modes.
- `booked` and `undice` with the dictionary in `pos_filter_exempt`: `book` and `die` in both modes.
- `talk`, `talked` and `spoke` with the pack that has no transforms: as with `"filter"`.

`frequencies` (title `untagged-frequencies`) holds frequency rows for `jog`
and `zork`, which no term bank has. With `metadata_only_terms`, `jog` is
found as written in both modes, and `jogs` and `zorked` give nothing in both:
frequency rows answer only forms with conditions 0.

`corpus.tsv` is the `eval-language` corpus for the pack and the dictionary;
`tests/cli_untagged_terms_test.cmake` explains its numbers. `mixed.tsv` has
one row, `sails` → `sailx` (no dictionary has `sailx`). There `sail`, with a
`v` row and an untagged row, is a false candidate only with `"pass"`, in both
`formOf` branches.
