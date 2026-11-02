# English (`en`)

English deinflection rules, text processors and scanning settings for
hoshidicts, following [`docs/languages.md`](../../docs/languages.md). The
rules are the union of rules written for this pack (`sources/own.json`) and
Yomitan's English rules (`sources/yomitan.json`), without the Yomitan rules
that measured worse (Rule provenance) and with Yomitan's derivational and
multiword transforms made optional.

## Sources and licences

- `sources/own.json` and every rule with `"source": "own"`: written for this
  pack (GPL-3.0-or-later) from English grammar before Yomitan's English file
  was read (commit "en: own rules"), then revised against the measurements
  below. `sources/own-rules.mjs` generates it: `node
  languages/en/sources/own-rules.mjs`.
- `sources/yomitan.json`, every rule with `"source": "yomitan"`, and the
  `decapitalize` and `capitalizeFirstLetter` processors: ported from
  [Yomitan](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/en/english-transforms.js)
  at d3c54c1 by `tools/port-yomitan-transforms.mjs`; `sources/map-yomitan.mjs`
  maps its 39 `todo` rules (38 phrasal-verb rules to `phrasal`, the
  interposed-object rule to `interposedObject`, with the word lists read from
  Yomitan's own regular expressions). GPL-3.0-or-later, Copyright (C)
  2024-2026 Yomitan Authors.
- `tests/yomitan.tsv`: Yomitan's
  [English transform tests](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/english-transforms.test.js),
  converted by `tools/port-yomitan-tests.mjs`. GPL-3.0-or-later, Copyright
  (C) 2023-2026 Yomitan Authors, 2020-2022 Yomichan Authors.
- `tests/corpus.tsv` and the three rows of `tests/gaps.tsv`: 1,600 inflected
  form → lemma pairs from
  [UniMorph eng](https://github.com/unimorph/eng/blob/66e0e9e8e2dcd196da081a25a48e5c1fe3d8b49b/eng)
  at 66e0e9e (file `eng`, sha256 `20a191ce…5c67`), CC BY-SA 3.0, by the
  UniMorph contributors. `sources/sample-corpus.py` drew them with seed 1:
  250 rows per stratum of `N;PL`, 125 of `V;PST` and `V;V.PTCP;PRS`, 100 of
  `V;PRS;3;SG` and `V;V.PTCP;PST`, 50 of `ADJ;CMPR` and `ADJ;SPRL`, half from
  forms with a [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 Zipf
  frequency of at least 2.5 (the "frequent" categories) and half from all
  forms ("any"). A UniMorph row is in the pool only when kty-en-en (below)
  lists its form as that inflection of that lemma, which drops UniMorph
  errors such as *gas* → *uncountable* (`ADJ;CMPR`). No wordfreq or
  kty-en-en data is committed. The 216,933 other pool rows (the "dev pool")
  are not committed; they are measured below.
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`, `tests/dictionary/`
  and `sources/sentences.tsv`: written for this pack (GPL-3.0-or-later).
- `host.recommendedDictionaries`: wty-en-en from
  [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan)
  (formerly kaikki-to-yomitan), Wiktionary content through kaikki.org, CC
  BY-SA 4.0.
- Dictionaries measured with, neither committed:
  - wty-en-en, index revision 2026.10.22, 110,539,099 bytes, sha256
    `0e62d0d3d6bf68c3f65906b5940601a375392f45d89a50e5dcb5068e1961436f`,
    downloaded from the index's `downloadUrl`
    (`https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/en/en/wty-en-en.zip`):
    1,630,668 terms, imported by `hoshidicts-cli import` in 2.6 s. Every
    measurement below uses it.
  - kty-en-en, release
    [v2025-04-08-10-54-36-00-00](https://github.com/yomidevs/wiktionary-to-yomitan/releases/download/v2025-04-08-10-54-36-00-00/kty-en-en.zip),
    index revision 2025.04.08, sha256
    `3cf1f90ea930cf890293085d990e55415236a92cf935b0df6081627369033219`:
    1,717,000 terms, imported in 2.9 s; used only to check the UniMorph rows.
  Both are Wiktionary content (CC BY-SA 4.0 and GFDL); the converters are
  MIT.
- The interposed-object counts below were made on 20 public-domain novels
  from Project Gutenberg (ebooks 11, 74, 76, 84, 98, 145, 174, 219, 345,
  1260, 1342, 1400, 1661, 1952, 2591, 2701, 4300, 16328, 25344, 64317); no
  text is committed.

## Text and scanning

- Scanning follows the contract's starting point for English (section 14.1):
  `scanStart` `word`, `searchResolution` `word`, `segmentation` `spaces`.
  Words are letters (ASCII, Latin-1, Latin Extended-A/B, Latin Extended
  Additional and the Latin ligatures U+FB00-FB06), combining marks and
  digits. Hyphens and apostrophes separate words, so *minute* in
  *five-minute* and *mother* in *mother’s* can be looked up, and whole
  entries such as *mother-in-law* still match because every prefix that ends
  at a word boundary is tried. The soft hyphen U+00AD is `wordInternal`.
- Preprocessors, in order: `decapitalize` and `capitalizeFirstLetter`
  (Yomitan's); `normalizeApostrophes` (’ ‘ ʼ ＇ to `'`, so the rules see one
  apostrophe); `normalizeHyphens` (U+2010 and U+2011 to `-`);
  `removeSoftHyphens` (`keepInput: false`); `removeDiacritics` (*naïve* →
  *naive*, *résumé* → *resume*, the input kept); `expandLigatures` (*æ*, *œ*
  and the U+FB00-FB06 ligatures; *encyclopædia* → *encyclopaedia*,
  *ﬁnding* → *finding*). `tests/text.tsv` checks each.
- One pack setting, `archaicForms` (boolean, off by default, group
  `lookup`), turns the optional own transforms `archaicSecondPerson` and
  `archaicThirdPerson` on (section 4.7, effect `transforms`). The optional
  Yomitan transforms (Rule provenance) have no setting: a request can enable
  them by id, and the test files and `eval-language` run every optional
  transform (section 12.2).

## Rule provenance

`transforms.json` is written by `node languages/en/sources/final.mjs`: the
union `tools/merge-transforms.mjs` makes of the two source files, without the
rules `REMOVED` lists, and with the transforms `OPTIONAL` lists off by
default.

- 24 transforms: 10 in both files (`plural`, `possessive`, `past`, `ing`,
  `3rd pers. sing. pres`, `interposed object`, `archaic`, `comparative`,
  `superlative`, `dropped g`; the own transforms use Yomitan's ids so the
  files merge, and their names and descriptions are this pack's), 7 own
  (`present`, `pastParticiple`, `contraction`, `negative`, `placeholder`,
  `archaicSecondPerson`, `archaicThirdPerson`) and 7 Yomitan (`adverb`, `-y`,
  `un-`, `going-to future`, `will future`, `imperative negative`, `-able`).
- 831 rules: 714 own, 117 Yomitan, 0 both. No own rule is identical to a
  Yomitan rule, which is what `both` means for a rule: the own rules carry
  stem minimums and other stem constraints, and take only the text as
  written (`conditionsIn: []`), so an English word gets one inflectional
  ending and clitics stack on top (*children's*, *doesn't*), where Yomitan's
  rules take a verb or adjective in and so also apply to each other's
  output (*settings* → *setting* → *set*). By type: 403 `suffix`, 278
  `phrasal`, 96 `wholeWord`, 28 `replace`, 25 `prefix`, 1
  `interposedObject`; no `pattern` rule.
- Own rules: regular endings with their spelling changes (doubled
  consonants, `-ied`, `-ies`, `-cked`, `-cced`, `-ying`, `-e` dropping),
  irregular past forms and participles of 150 verbs as suffix rules, so
  prefixed verbs are reached too (*understood*, *forgave*, *withheld*,
  *undergone*; forms that also end ordinary words, such as *ate*, *lay*,
  *lit*, *bit*, *hid*, *won* and *dove*, are whole words), `am`/`are`/`is`/
  `was`/`were`/`been`/`has`/`had` and the past modals, irregular and
  classical plurals (*men*, *children*, *feet*, *mice*, *people*, *data*,
  *criteria*, *cacti*, *indices*, *analyses*, *bureaux*, *mothers-in-law*,
  *passers-by*, *courts-martial*), irregular comparison (*better*, *worst*,
  *further*, *elder*), possessives (*teacher's*, *James'*), clitics (*'re*,
  *'ve*, *'ll*, *'d*, *'m*, and *'s* after *it*, *that*, *there*, *let* and the
  question words), negative contractions (*n't*, *can't*, *won't*, *ain't*),
  *-in'*, *-'d* for *-ed* in verse (*lov'd*), the first word of a multiword
  verb (a `phrasal` rule per ending, and `prefix` rules for whole-word forms:
  *had to* → *have to*), the interposed object with the particles that
  follow an object (below), the placeholders of dictionary entries (*lost
  his temper* → *lose one's temper*, *let him down* → *let someone down*,
  *enjoyed himself* → *enjoy oneself*), and, optional, Early Modern English
  *-est*, *-eth*, *art*, *hast*, *hath*, *doth*.
- Yomitan rules removed (20 of 137). Measured in the union, with wty-en-en:
  rows only the rule recovers in the dev pool, the sample, `cases.tsv` and
  `yomitan.tsv`; false candidates only it adds on the sample and
  `cases.tsv`; `cases.tsv` negatives it breaks; and of the 20,000 frequent
  words (Measurements), how many have a wrong candidate because of it.

  | Rule | dev | sample | cases | yomitan.tsv | false candidates | negatives broken | frequent words | Example |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | plural `s` → | 0 | 0 | 0 | 0 | 1 | 0 | 24 | *was* → *wa*, *class* → *clas* |
  | plural `es` → | 4 | 0 | 0 | 0 | 27 | 0 | 103 | *cares* → *car*, *rates* → *rat* |
  | plural `ves` → `fe` | 0 | 0 | 0 | 0 | 5 | 2 | 3 | *serves* → *serfe* |
  | plural `ves` → `f` | 0 | 0 | 0 | 0 | 0 | 4 | 5 | *serves* → *serf*, *proves* → *prof* |
  | past `ed` → `e` | 0 | 0 | 0 | 0 | 3 | 1 | 8 | *bed* → *be*, *red* → *re* |
  | past `ed` → | 0 | 0 | 0 | 0 | 3 | 2 | 5 | *bed* → *b*, *red* → *r* |
  | ing `ing` → `e` | 14 | 0 | 0 | 0 | 10 | 3 | 14 | *being* → *bee*, *dying* → *dye* |
  | ing `ing` → | 0 | 0 | 0 | 0 | 9 | 0 | 38 | *feelings* → *feel* (after `s`) |
  | ing `dding`, `gging`, `nning`, `tting`, `rring` | 0 | 0 | 0 | 0 | 2 | 2 | 5 | *weddings* → *wed*, *settings* → *set* |
  | 3rd pers. `s` → | 0 | 0 | 0 | 0 | 11 | 0 | 23 | *has* → *ha* |
  | 3rd pers. `es` → | 11 | 0 | 0 | 0 | 5 | 0 | 37 | *makes* → *mak*, *rates* → *rat* |
  | comparative `er` → | 0 | 0 | 0 | 0 | 0 | 1 | 6 | *her* → *h*, *trader* → *trad* |
  | superlative `est` → | 0 | 0 | 0 | 0 | 3 | 2 | 4 | *west* → *w*, *best* → *b* |
  | superlative `est` → `e` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | *semester* → *seme* |
  | archaic `'d` → `ed` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | *he'd* → *heed*, *we'd* → *weed* |
  | interposed object | 0 | 0 | 0 | 0 | 0 | 4 | 0 | *put her foot on* → *put on* |

  The 29 dev rows they recover are mostly obsolete spellings (*doing* →
  *doe*, *playing* → *playe*, *judges* → *judg*) and rare forms (*taxies*
  → *taxi*, *pies* → *pi*). The own rules cover every other row these
  rules reach, with stem minimums: `-s` after at least two letters that do
  not end in *s*, `-es` only after *s*, *x*, *z*, *ch*, *sh* and *o*, the
  `-f`/`-fe` plurals by their endings (*wolves*, *knives*, *wives*, *leaves*),
  `-ing` → `-e` not after a vowel or *y*.
- Interposed object: Yomitan's rule accepts 57 particles; the own rule
  accepts *up*, *out*, *down*, *off*, *away*, *back*, *aside*, *apart*,
  *home*, *together*, *forth* and *forward*. After an object, *in*, *on*,
  *over*, *by*, *through*, *round*, *around* and *about* mostly start a
  prepositional phrase, and a lookup sees only the text up to the particle.
  In the 20 novels, where *verb + particle* is a dictionary entry, *verb
  the/his/... noun particle* was followed by a determiner or a name (a
  prepositional phrase: *put her foot on the table*) 72% of the time for *in*
  (479 of 662), 81% for *on* (397 of 489), 75% for *over* (77 of 102) and 51-68% for
  *by*, *through*, *round*, *around* and *about*, against 0-10% for *up*,
  *out*, *down*, *away*, *back*, *aside*, *home* and *together* and 34% for
  *off*. With a pronoun object (*put it on the table*) the shares were 54%
  for *in*, 64% for *on*, 2-9% for *up*, *out*, *down*, *away* and *back*,
  and 13% for *off*. Contract section 14.1 suggests *put Mary’s coat on* →
  *put on* as a case; the pack reads it as *put*, and `cases.tsv` has *put
  Mary's coat away* → *put away* and the negatives *put her foot on* and
  *put the book on* instead.
- Optional Yomitan transforms (off unless a request enables them):
  - `adverb`, `-y`, `un-`, `-able` are derivation, not inflection, and
    wty-en-en lists the derived words. With the four on, 1,902 of the 20,000
    frequent words have a wrong candidate, against 607 with them off (*only*
    → *on*, *party* → *part*, *by* → *be*, *they* → *thee*, *under* → *der*,
    *capable* → *cap*).
  - `going-to future`, `will future` and `imperative negative` apply only
    when the scan starts at the auxiliary, and then put the next verb first
    (*will paint* → *paint*, *going to school* → *school*, *don't touch* →
    *touch*), so hovering the auxiliary never shows it first; hovering the
    verb finds it either way.
  `yomitan.tsv` passes with them on, as the test files run.

## Measurements

`hoshidicts-cli eval-language` (Release, GCC 14.3) on `main` e5751e8 plus
this pack (7e04ed5 gave the same numbers), `--dictionary` wty-en-en. The rule sets are `sources/own.json`,
`sources/yomitan.json`, their union (`tools/merge-transforms.mjs --out`) and
the final `transforms.json`; "final, options off" leaves out the optional
transforms, as a default lookup does. `eval-language` runs every option on.

| | Own | Yomitan | Union | Final | Final, options off |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sample recall (corpus.tsv + gaps.tsv, 1,600 rows) | 99.81% (1,597) | 97.81% (1,565) | 99.81% (1,597) | **99.81% (1,597)** | 99.81% (1,597) |
| Dev pool recall (216,933 rows) | 99.840% | 98.875% | 99.853% | 99.840% | 99.839% |
| False candidates per sample row | 0.224 | 0.335 | 0.359 | 0.317 | 0.222 |
| cases.tsv positives (465) | 465 | 134 | 465 | 465 | 450 |
| cases.tsv negatives (46) | 46 | 18 | 17 | 46 | 46 |
| yomitan.tsv positives (105), negatives (2) | 69, 2 | 105, 2 | 105, 2 | 105, 2 | 69, 2 |
| Frequent words with a wrong candidate, default lookup | 607 | 2,161 | 2,298 | 607 | 607 |
| The same with every option on | 623 | 2,161 | 2,311 | 1,917 | 607 |
| Expected one-step trace (sample rows reached) | 1,597 / 1,597 | 1,564 / 1,565 | 1,597 / 1,597 | 1,597 / 1,597 | |
| Lemma first among entries with definitions (sample, whole source) | 58.8% | 57.0% | 57.6% | 58.8% | |
| Lemma among the results (sample) | 99.8% | 97.8% | 99.8% | 99.8% | |
| Sentences: lemma first among entries with definitions (114 words) | 60 | 39 | 58 | 60 | |
| Sentences: lemma in the first three entries with definitions | 112 | 72 | 111 | 112 | |

- False candidates (`eval-language`): distinct deinflected texts per row that
  are wty-en-en headwords passing the part-of-speech filter, other than the
  source and the lemma. Many are obsolete spellings with their own entries
  (*walke*, *happie*).
- `firstRank` is 0 on the sample for every rule set and 0.028 on
  `cases.tsv` (final): wty-en-en has a form-of row for nearly every
  inflected form (*walked* → [*walk*, past]), which matches the source as
  written and ranks first (Known gaps). The two "entries with definitions"
  rows skip those rows.
- Frequent words: the 20,000 most frequent wordfreq 3.1.1 English words that
  are wty-en-en headwords (lowercase letters, apostrophes, hyphens). A wrong
  candidate is a deinflected text that is a headword passing the
  part-of-speech filter and is neither the word nor a lemma wty-en-en's
  form-of rows or UniMorph give for it (*was* → *wa*, *bed* → *b*).
- Trace: a deinflection reaching the lemma with exactly the transform the
  UniMorph category names (`plural`, `3rd pers. sing. pres`, `past`, `past`
  or `pastParticiple`, `ing`, `comparative`, `superlative`).
- Sentences: `sources/sentences.tsv`, 114 hovered words in sentences written
  for the pack, looked up as a host does (from the word to the end of the
  sentence, scan length 16, no options).
- The own rules were revised while reading the misses of the dev pool, and
  for four rows (*cc'ed*, *sicced*, *dx'ing*, *greenlit*) of the sample; the
  sample is otherwise held out.
- `language-conformance-test`: conforms; corpus.tsv 1,597/1,597,
  cases.tsv 511/511, yomitan.tsv 107/107, text.tsv 28/28, lookup.tsv
  34/34, gaps.tsv 0/3 (reported); 434 of the 831 rules are exercised by a
  passing row. `tools/check-yomitan.mjs`: 8,496 inputs, 33,982 Yomitan
  results, 1,214 listed differences (the two rows of
  `sources/yomitan-differences.tsv`: Yomitan matches a particle as a prefix
  of the next word), 0 unexplained; processors `decapitalize` and
  `capitalizeFirstLetter` agree on 2,238 inputs.

Real use with wty-en-en through `hoshidicts-cli lookup --language en`: *looked
the word up in her dictionary* → 1. *looked up* (form-of row), 2. *look up*
(matched *looked the word up*; interposed object → past); *teacher’s notes
were on the desk* → *teacher* (possessive); *lost his temper and shouted* →
*lose one's temper* (past → placeholder) after the form-of row *lost one's
temper*; *mothers-in-law live in Leeds* → *mother-in-law* (plural) after the
form-of row.

Hachidori: `test/chrome-language-pack.mjs` on bee-san/hachidori
feat/multi-language 1bd53232 with this pack synced in, Chrome 152, wty-en-en:
15 passed, 0 failed (adding the profile, the import, 11 cases, the Anki
note and the switch to Japanese and back), dictionary imported in 3.1 s. The cases are the words of
`sources/sentences.tsv` whose first result is the expected headword (form-of
rows come first for the others).

Performance (host load about 29 on 64 cores, so these are upper bounds):

- Native `benchmark-lookup --languages languages --language en` with
  wty-en-en on the 114 sentence texts of `sources/sentences.tsv` (each cut at
  its first comma, as the tool reads CSV), 21 passes, the first dropped:
  p50 65.7 µs, p95 200.2 µs (budget 1 ms p50).
- Hachidori's WebAssembly (feat/multi-language 1bd53232) in Node 22
  (`hdw_lookup`, the same texts, 10 passes after one): single-thread p50
  214 µs, p95 765 µs; threaded p50 230 µs, p95 828 µs.
- Pack load: natively `LanguageRegistry::add` takes 0.96 ms (median of 50)
  and the registry holds 322,240 bytes of heap. In WebAssembly the first
  `hdw_language_load` takes 13.3 ms (single-thread and threaded), later
  ones 2.4-2.5 ms, and the allocator's live bytes grow by 206,832 and
  206,784 bytes. Budgets 50 ms and 20 MB.
- No `pattern` rules, so no pattern heap.

## Known gaps

- **Form-of rows come first.** wty-en-en and kty-en-en have rows whose only
  glossary is a form-of redirect (*walked* → [*walk*, past]). The importer
  stores them as ordinary terms (section 16), so for an inflected word the
  form's own row matches with no transform and ranks before the lemma: of
  the 114 sentence words, the lemma is the first result for 17, the first
  entry with definitions for 60, and within the first three for 112. A pack
  cannot change this order today. A framework change that follows the
  references as Yomitan does, chosen by a pack field (`lookup.formOf`), is
  planned (hachi-lang-engine-f); this pack takes `"follow"` when it lands.
- **A trailing apostrophe never ends a scanned prefix.** Apostrophes separate
  words, and word resolution tries prefixes that end after a word
  character, so *goin'* and *dogs'* are looked up only where the apostrophe
  ends the scanned text. Inside a sentence the dropped-g and plural
  possessive rules do not apply: *goin' home* finds *goin*, *dogs' bowls*
  finds *dog* through *dogs*. Changing it is a framework change.
- **Prepositional particles after an object** are not read as an interposed
  object (*put Mary's coat on* gives *put*), by measurement (Rule provenance).
- **Multiword entries** are reached only when their second word is a particle,
  preposition, article, pronoun or possessive (95 words): *running late*
  finds *run*, not *run late* (wty-en-en has *running late* as a form-of row).
- **Capitalised headwords** at the start of a sentence come before the
  lowercase word, which needs a processor step: *It's* gives the noun *It*
  first, *She'd* the name *She*.
- **Clitics give the host word only**: *he's*, *she'd*, *we'll* give *he*,
  *she*, *we*, not *be*, *have*, *would* or *will*.
- **Phrasal copies drop stem constraints.** The `phrasal` rule type has none,
  so the multiword copy of a rule with a stem minimum applies without it
  (*being up* → *bee up*). Such texts are rarely headwords; the `-lit` →
  `-light` compound rule has no phrasal copy for this reason (*split up*).
- **gaps.tsv**: *red* → *rede* (archaic; *-d* after a two-letter stem would
  make *bed* and *wed* into *be* and *we*), *stolen* → *steale* (obsolete
  spelling; *steal* is found), *former* → *fore*.
