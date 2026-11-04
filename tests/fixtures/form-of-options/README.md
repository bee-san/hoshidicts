# Form-of options fixture

A probe pack and a dictionary for `form-of-options-test`
(`tests/form_of_options_test.cpp`), which checks how a pack that follows
form-of references refines them ([`docs/languages.md`](../../../docs/languages.md),
sections 4.4, 9.6 and 9.10). Written for hoshidicts (GPL-3.0-or-later). The
test zips `dictionary/` and imports it at run time. The rows imitate the
dictionaries the fields were made for (kty-ko-en, wty-vi-en, wty-sh-en,
wty-la-en, wty-yi-en); their glosses are short stand-ins.

`languages/fx` is a word-resolution pack with `formOf: "follow"`,
`formOfIgnore: ["eumhun", "classifier"]`, a `formOfNormalizer` that removes
the accent marks after a vowel or `r` (NFD, a pattern, NFC), readings `none`
and the rules `topic` (는), `polite` (요), `particle` (the whole word 그는 → 그),
`acc` and `pl` (the whole words ciujn → ciuj → ciu), `pres-3s` (it → o),
`fem` (o → a), `wyw` (the whole word wyx → wyz) and `yx` (yx → y). The test
adds copies without `formOfIgnore` (`fi`), without
`formOfNormalizer` (`fn`), with the particle rule as a `suffix` rule (`fw`),
with `confirmedOrder: "references"` (`fr`), with readings `required` (`fq`)
and with `ownEntry: "afterReferences"` (`fe`).

| Rows | What they check |
| --- | --- |
| `줄 수` → 수 [eumhun], 수 [hanja form]; `줄`, `수` | One listed rule: neither reference is followed, so `줄 수 있어` gives 줄, not 수 over two words |
| `cái` (an entry and two rows → bàn, ghế [classifier]) | Rows that are only listed references give nothing |
| `chiếc` (a definition and → thuyền [classifier]) | A row with a definition stays a term, without the reference |
| `xe` → 車 [Hán-Nôm] | A rule the pack does not list is followed |
| `davati` → dȁti; `dati` | A reference to a text no row has is followed after `formOfNormalizer` |
| `pokušavati` → pòkušati; `pokušati` | The steps keep š (its mark follows a consonant) |
| `vraćati` → vrátiti; `vrátiti`, `vratiti` | A text a row has is not normalized |
| `dvije` → dvȃ → dva | Nor is a text whose only row is a reference (one hop): nothing |
| `그는` → 글다; `그`, `그는 것` | The whole-word rule's 그 before the confirmed 글다; with a suffix rule (`fw`) 글다 first; a longer match first |
| `그는요` → 글다 [polite, formal present determiner] | A trace whose first rule is not the whole-word rule (polite, then particle) does not count |
| `ciujn` → ciu; `ciu`, `ciuj` | A term both a whole-word trace and a reference reach before one only a whole-word trace reaches |
| `wyx` → wyc; `wyz` → wy; `wy` | A whole-word trace counts when it reaches the term through a reference, whichever trace the term keeps |
| `sibi` → sui (read suī), sibus (no reading) | "Written form equals reading" only with readings `required` (`fq`) |
| `日本` read にほん and without a reading | The built-in Japanese pack (readings `required`) keeps the key |
| `dedit` → do, dedo; frequencies dedo 1, do 2 | Discovery order (the rule's dedo) against the references' order (`fr`: do); a frequency decides before either |
| `tulit` → fero, tulo, fero | A term named twice goes by its first reference |
| `געווען` (an entry and → זײַן), `געווען אַמאָל` | `ownEntry`: the own entry first by default, after זײַן with `fe`; a longer match first |
| `bilo` (an entry and → biti), `bila` (score 5) | With `fe` the own entry goes right after biti and before the `fem` rule's bila, whatever bila's score |
| `dobro` (an entry and → dobar [neuter, singular]), `dobra` | ... at the trace length of dobar (two steps), so the `fem` rule's dobra (one step) comes first |
| `zeta` (an entry and → zetan in two steps, zetin in one) | ... the shortest of the confirmed terms' traces |
| `Dobro`, `Dobra` (names) | Only terms with the own entry's processor steps count: Dobro as written keeps its place |
| `Zeta` (a name and → zetan [capitalized, form]) | Each step count has its own shortest trace: two steps for Zeta, one for the decapitalized zeta |

`corpus.tsv` is the `eval-language` corpus of `cli-form-of-options`
(`tests/cli_form_of_options_test.cmake`), which runs the pack with and
without `formOfIgnore` and `formOfNormalizer`.
