# Form-of fixture

Dictionaries and a probe pack for `form-of-test` (`tests/form_of_test.cpp`)
and `cli-form-of` (`tests/cli_form_of_test.cmake`), which check how lookups
read wiktionary-to-yomitan (kaikki) form-of references, the `[term, [rules]]`
definitions of a term bank row ([`docs/languages.md`](../../../docs/languages.md),
section 9.10). Written for hoshidicts (GPL-3.0-or-later). The tests zip each
dictionary directory and import it at run time.

`languages/fo` is a word-resolution pack with `formOf: "follow"` and rules
`past` (ed), `neg` (un-), `present-yo` (o → ar and o → er with ue → o), `dim`
(ts), `tie` (q → d, c, b, a), `tie2` (qv → b, a) and `plural` (s). The tests
add copies with `formOf: "asTerm"`, with `traceSelection: "first"` and with
character resolution.

`forms` (term, frequency and IPA rows):

| Rows | What they check |
| --- | --- |
| `walk`, `walked` → walk | A reference-only row the rule also reaches: one result, the rule's trace on a tie (both one step); the lemma's frequency (10, not walked's 99) and IPA |
| `unwalked` → walk [negative past] | The dictionary's one step beats the rules' two (`shortest`); `first` keeps the rules' |
| `walks` → walk twice | Two references to one lemma |
| `walkt` → walk | The same glossary as `walked`, which the importer compresses once: both rows are flagged |
| `left` (a definition and → leave [past, participle]) | A row with references and a definition stays, without the references; two rules are two steps |
| `leaves` → leave, leaf | Two references to two lemmas |
| `gone` → go | A reference to a missing lemma: nothing |
| `went` → wend → wander | One hop |
| `book` (a lemma row and → bake) | A reference is followed only where its row passes the part-of-speech filter (`booked`), or its dictionary is in `pos_filter_exempt` |
| `strode` → stride | The lemma is only in `lemmas`: a selection without it finds nothing; with `metadata_only_terms`, strode's own frequency row (5) is a term after stride |
| `caféd` | A reference with JSON escapes |
| `oddity` | Arrays that name no term: an ordinary row |
| `puedo` → poder, with `podar` and `poder` | Dictionary-confirmed: poder before podar on a tie (9.6) |
| `puedo ver`, `Podar` | A confirmed lemma never beats a longer match or fewer processor steps |
| `dogged` → dog [past, participle], `dogg` | ... nor a shorter trace |
| `kits` → kitten, `ki` → kit | Only a row of the matched text confirms; the row of a deinflected text does not |
| `zo` → zip (missing), zap | A false candidate a deinflected text's row names (`eval-language`) |
| `zd`, `zc`, `zb`, `za` | Four terms that tie on every key: discovery order (the rule order), not term order |
| `yq` → ya, `yb`, `ya` | With character resolution, a confirmation at a shorter match (`yq`) does not count where `yqv` reaches the term |

`lemmas` holds `stride`, `walk`, `podar` and `poder`. `japanese` holds
Japanese form-of rows (`食べた` → 食べる, `行った` → 行く and 言う, `食べ物` with a
definition and a reference, `見た` → 見る without 見る, `そんな` → そう, `こんにゃ` →
こんな): the Japanese pack (`asTerm`) must read them as the 35e2dab lookup in
`tests/reference/` does, and a copy that follows them shows where references
of the scan and of the cat-speech pass are followed.

`corpus.tsv` is the `eval-language` corpus for the pack and `forms`.
