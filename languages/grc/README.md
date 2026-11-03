# Ancient Greek (`grc`)

Polytonic Ancient Greek: Attic prose, tragedy, Herodotus' Ionic and Homer's
and Hesiod's Epic. A lookup takes the word as an edition prints it (accents,
breathings, iota subscripts, grave for acute, an enclitic's second accent,
elision, crasis) and reaches the headword of the recommended dictionary,
wiktionary-to-yomitan's wty-grc-en. Text without diacritics is read through
Yomitan's rules and the dictionary's form-of rows, which wty-grc-en keys
without diacritics.

## Sources and licences

- **Own rules**: `sources/own-rules.mjs` and `sources/greek.mjs` write
  `sources/own.json`. They were written for this pack (GPL-3.0-or-later) from
  the standard description of the language (Smyth, *Greek Grammar*; Goodwin,
  *A Greek Grammar*) and the shape of Wiktionary's Ancient Greek declension
  and conjugation tables. No table or text is copied; the lists of irregular
  forms are the grammars' principal parts.
- **Yomitan's rules and processors**: `sources/yomitan.json`, Yomitan's
  [`ext/js/language/grc/ancient-greek-transforms.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/grc/ancient-greek-transforms.js)
  (21 transforms, 55 literal suffix rules, no `todo`), ported by
  `tools/port-yomitan-transforms.mjs`. The processors `decapitalize`,
  `capitalizeFirstLetter`, `removeAlphabeticDiacritics` and
  `convertLatinToGreek` are Yomitan's (`ext/js/language/text-processors.js`,
  `ext/js/language/grc/ancient-greek-processors.js`); the first two are
  written out as maps by `sources/case-maps.mjs`. GPL-3.0-or-later,
  Copyright (C) 2024-2026 Yomitan Authors.
- `tests/yomitan.tsv`: Yomitan's
  [Ancient Greek transform test](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/ancient-greek-transforms.test.js),
  converted by `tools/port-yomitan-tests.mjs`, then rewritten by
  `sources/build-final.mjs` (reasons `*`; the two nominalization rows are
  negatives). GPL-3.0-or-later, Copyright (C) 2025-2026 Yomitan Authors.
- `tests/corpus.tsv` (900 rows) and `tests/gaps.tsv` (100 rows): 1,000
  form → lemma pairs sampled with seed 1 by `sources/build-corpus.py`, split by
  `sources/split-corpus.py` into the rows the final rules reach and the
  others:
  - 300 from [UniMorph grc](https://github.com/unimorph/grc) at
    7f4a58df733726c75c1355dd3a038e950d5e308f (file `grc`, sha256
    `09ff9231…cadd9`, 44,026 lines, nouns and adjectives), CC BY-SA 3.0, the
    UniMorph contributors, from English Wiktionary;
  - 700 from the [Perseus Ancient Greek Dependency Treebank 2.1](https://github.com/PerseusDL/treebank_data)
    at bf4334f0af5e13d16b04c1cccd6237e683ac6f5f (`v2.1/Greek/texts`, 33
    files, 485,794 words), CC BY-SA 3.0 US, the Perseus Digital Library,
    Tufts University, with the annotators each file names.

  A row is kept only when its lemma is a wty-grc-en headword.
- `tests/cases.tsv` and `tests/defaults.tsv`: written for this pack
  (GPL-3.0-or-later). The sample text of `language.json` is John 1:1 (public
  domain).
- `tests/classes.json`: written by `tools/check-classes.mjs`.
- `sources/benchmark-words.txt`: 60 texts of at most six words from an
  inflected word of the treebank (CC BY-SA 3.0 US, as above), sampled with
  seed 1 by `sources/measure.py benchmark`.
- Measured with and not committed:
  - **wty-grc-en**, the recommended dictionary:
    [`wty-grc-en.zip`](https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/grc/en/wty-grc-en.zip)
    revision 2026.10.22 (wiktionary-to-yomitan
    61eaa08fa9ad2c6f5a5b49e13c5d9103d8730ee2), 15,176,889 bytes, sha256
    `955af2034dd0a9adc95da52fa03c21f57dde693aa8b6068ed9c82391ffb8e82f`,
    1,043,571 terms (23,268 lemma rows, 1,020,303 form-of rows). CC BY-SA
    4.0, the Wiktionary contributors through kaikki.org.
  - **Real text and sentences**: seven treebank texts (CC BY-SA 3.0 US):
    Thucydides 1 (`tlg0003.tlg001`), Lysias 1 and 14 (`tlg0540.tlg001`,
    `tlg0540.tlg014`), Plato's *Euthyphro* (`tlg0059.tlg001`), Herodotus 1
    (`tlg0016.tlg001`), Sophocles' *Antigone* (`tlg0011.tlg002`) and Hesiod's
    *Works and Days* (`tlg0020.tlg002`): 75,172 word lookups.
  - **Frequency list**: the 10,000 most frequent forms of the whole treebank
    (368,718 of its words), counted by `sources/measure.py frequent`.
  - Hachidori feat/multi-language at 803f7b6e, for the WebAssembly numbers
    and the Chrome check.

## Rule provenance

`transforms.json` has 243 transforms and 14,238 rules
(`sources/build-final.mjs`):

| source | transforms | rules |
| --- | ---: | ---: |
| `own` | 240 | 14,189 |
| `both` (rules marked in own transforms) | 0 | 44 |
| `yomitan` | 3 | 5 |

- **`both`**: 50 of Yomitan's 55 rules make a deinflection an own rule makes:
  the same ending replaced by the same text, on a text without conditions,
  with a part of speech in common, in the own transform of the same form
  (`ind-act-2sg` for "2nd person singular present active indicative",
  `gen-sg` for "genitive singular"). The 44 own rules they repeat are marked
  `both` (several Yomitan rules repeat the same own rule: its vocative plural
  is its nominative plural), and 49 of the 50 Yomitan copies are left out:
  the own rule reads the same text, with a trace that names the form. `sources/yomitan-provenance.tsv` lists every Yomitan
  rule with the own transforms that repeat it.
- **Yomitan rules kept** (5): the dative singular `ω` → `ος`, `α` → `ας` and
  `ω` → `ον` and the vocative singular `η` → `η`, which no own rule makes
  (the own rules write the iota subscript, `ῳ` → `ος`), and the genitive
  plural `ων` → `ον`, which an own rule makes on stems of two letters or more:
  Yomitan's reaches `ᾦων` → `ᾦον`, a corpus row. The dative `ω` → `ον` adds
  one false candidate on the corpus and recovers nothing, but without it one
  real-text first result stops being the treebank's lemma (`μαντηίῳ`:
  `μαντεῖον` becomes `μαντεῖος`), so it stays.
- **Yomitan rule left out** (1): nominalization `ος` → `εω` (verb), a
  derivation: it reads every -ος noun and adjective as an -έω verb. In the
  union it breaks 4 negatives of `cases.tsv` (`φίλος` → `φιλέω`, `καλός` →
  `καλέω`, `οἶκος` → `οἰκέω`, `λόγος` → `λογέω`) and adds 2 false
  candidates there; on the corpus it recovers nothing. In real text, 326 of
  the 75,172 lookups list a result through it, 1 of them first, and none is
  the treebank's lemma (`Κῦρος` → `κύρω`, `τέλος` → `τελέω`). Its two rows of
  `tests/yomitan.tsv` (`γεωργος` → `γεωργεω`, `πονος` → `πονεω`) are negatives.
- **Leaving out the 49 repeated rules and nominalization** (union →
  final): corpus first rank 0.901 → 0.899 (2 rows); `cases.tsv` negatives
  passed 60/70 → 70/70 (the union breaks the 4 above and 6 through repeated
  rules that have no stem minimum: `τοῦ` → `τός`, `ἄν` → `α`, `αἱ` → `η`,
  `ὧν` → `η`, `αἷς` → `η`, `ἅς` → `η`; Yomitan's genitive `ου` → `ας` adds a
  false candidate there); in real text 83 of the 75,172 first results change,
  43 becoming the treebank's lemma, 32 ceasing to be it and 8 neither; lookup
  p50 0.775 → 0.72 ms.

### Own rules

- **Text first.** `normalizeUnicode` (NFC), `normalizeLetterForms` (lunate
  sigma and letter symbols; σ at the end of a word → ς), `normalizeApostrophes`
  (U+2019 and ASCII, both kept as variants), `graveToAcute`, then the
  variants `decapitalize`, `capitalizeFirstLetter` (optional, setting
  `capitalizedNames`), `removeAccents` (acute, grave, circumflex, macron,
  breve; breathings and subscripts stay), `removeAlphabeticDiacritics` and
  `convertLatinToGreek`.
- **Endings as written and without accents.** Each ending is written with
  its accent (`-οῦ` → `-ός`) and once more without it, which reads the
  removeAccents variant; rules after it in a chain read unaccented stems
  (ἀγγελοῦσι → ἀγγελουσι → ἀγγελεω → ἀγγέλλω).
- **`accent`** puts the dictionary form's accent back on a text that has
  none: for verbs (`-ω`, `-ομαι`) one rule per ending marks the ending, puts
  an acute on the text's last vowel and writes the ending back (λυω → λύω,
  βουλομαι → βούλομαι); for nouns and adjectives the last syllable (θεός,
  ψυχή), the penult (χώρα, μοῖρα) and, for twelve endings, the antepenult
  (ἄνθρωπος, ὄνομα, ἀλήθεια; `pattern` rules).
- **Verbs**: thematic, contract and athematic endings by tense, mood and
  person; augment and reduplication as conditions (`aug`, `red`, `augred`)
  that the stem transforms (`augment`, `reduplication`, `aorist`, `future`,
  `perfect`, `aorist-passive`) take off, with preverbs; the principal parts of
  about 120 irregular verbs; εἰμί, εἶμι, φημί, οἶδα, κεῖμαι, δύναμαι,
  δίδωμι, τίθημι, ἵστημι, ἵημι, δείκνυμι and their compounds in full.
- **Nouns and adjectives**: case endings of the three declensions with Epic
  and Ionic forms, the feminine and neuter of adjectives, comparison, adverbs
  in -ως, and the irregular nouns.
- **Closed classes**: the article, pronouns, numerals and irregular
  adjectives as whole words; a form of four letters or more is a suffix rule,
  which also reads it after crasis.
- **Clitics and spelling**: elision (restored with and without accents),
  elided prepositions and particles, crasis (κἀγώ, τοὔνομα, χὠ), the
  enclitic's second accent (`enclitic-accent`: ἄνθρωπός τις), -γε and -περ,
  ξυν- for συν-, -ττ-/-σσ-, γιν- for γιγν-, and the optional Doric ᾱ for η
  (setting `doricAlpha`).
- **Stem constraints.** `sources/mutate.py` removes each of the 55 stem
  constraints of the final set (a transform's `stemMinLength`,
  `stemCharacters`, `stemContains`, ...) in a copy; every removal breaks a
  row (52 `constraint` negatives of `cases.tsv`). The check found three
  constraints that only blocked right readings (`ξύν` → `σύν`, `κοὐ` →
  `οὐ`, `χὠ` → `ὁ`) or changed nothing (`unaugmented`); they were removed.

### History

The first commit, `grc: own rules` (463f3e5), has 237 transforms and 21,309
rules, each its own row (5.0 MB). Then, measured on the corpus sample, real
text and the benchmark:

- suffix rules with the same conditions and constraints became cross
  products (section 7.3), and whole words became suffix rules with an empty
  stem; prefix rules stay single, because a cross product of prefixes is
  tried on every text (it made lookups 0.3 ms slower);
- the accent transform: an acute or circumflex for every vowel and
  consonant cluster (94 KB), then stem changes (0.42 ms slower per lookup),
  then one marked-ending rule per ending (20 KB); with single prefix rules
  the lookup p50 went from 1.65 to 0.72 ms;
- each rule's twin without any diacritic (for text without diacritics)
  became a twin without accents: dropping the diacritic-free twins changed
  the verdict of 71 of 32,637 real-text first results (36 became the
  treebank lemma, 28 stopped being it, 7 stayed wrong) and saved 47 KB; wty-grc-en's form-of rows
  read diacritic-free text;
- closed-class forms of four letters or more became suffix rules, except
  those that end another closed form (`κεῖνος` in `ἐκεῖνος`, a loop that
  crashed the deinflector);
- proper names have no rules: a productive rule with no conditions re-fed
  every rule (two minutes for one word);
- elision applies to U+2019 only (the processor gives it) and only after a
  stem with an accent or breathing, and once more with the accents taken
  off (γένοιτ’ → γενοιτο → γίγνομαι); elided prepositions and particles
  became whole words (`ἀπ’` → `ἀπό`: 260 tokens of the frequent forms had
  `ἀπών` first);
- the pattern processor `removeEncliticAccent` became the rule
  `enclitic-accent` (21 more first results right in real text, and
  `tests/classes.json` pins no step);
- additions from the corpus sample's misses: root and suppletive aorists
  (ἤνεγκ-), ἔοικα, δείδω, χρή, δεῖ, τοιόσδε, the antepenult of -εια,
  -οια, -υρα, -αινα, -σσα, -ττα, -σις, the comparative of -εις adjectives,
  plural lemmas (χίλιοι, τριακόσιοι), γίνομαι, -περ after a one-letter
  relative, πρου- without its coronis;
- the forms of μέγας and πολύς have their own transform,
  `irregular-adjective`, instead of `pronoun`.

## Measurements

All with wty-grc-en as published (form-of rows included), on one machine
(GCC 14.3 Release, load average about 42). `D` is the imported dictionary
(`build/hoshidicts-cli import wty-grc-en.zip`).

### 1. Rule sets

`hoshidicts-cli eval-language grc <file> --transforms <set> --dictionary $D`.
`corpus+gaps` is `corpus.tsv` followed by the rows of `gaps.tsv`. "all" is
the file as it is (every option on), "default" a copy with
`# options: default` added (removed for `defaults.tsv`). Recall / negatives
passed / false candidates per positive row / first rank:

| file | options | own (`sources/own.json`) | Yomitan (`sources/yomitan.json`) | union | final |
| --- | --- | --- | --- | --- | --- |
| corpus+gaps (1,000) | all | 0.899 / – / 0.768 / 0.898 | 0.100 / – / 0.344 / 0.780 | 0.900 / – / 0.769 / 0.901 | **0.900** / – / 0.769 / 0.899 |
| corpus+gaps | default | 0.899 / – / 0.751 / 0.898 | 0.100 / – / 0.332 / 0.781 | 0.900 / – / 0.752 / 0.901 | 0.900 / – / 0.752 / 0.899 |
| cases (463) | all | 1.000 / 1.000 / 1.394 / 0.850 | 0.015 / 0.929 / 0.631 / 0.697 | 1.000 / 0.857 / 1.405 / 0.850 | 1.000 / 1.000 / 1.397 / 0.850 |
| cases | default | 0.995 / 1.000 / 1.359 / 0.850 | 0.015 / 0.929 / 0.595 / 0.697 | 0.995 / 0.857 / 1.369 / 0.850 | 0.995 / 1.000 / 1.361 / 0.850 |
| yomitan (59) | all | 1.000 / 1.000 / 2.491 / 0.088 | 1.000 / 0.000 / 1.895 / 0.088 | 1.000 / 0.000 / 2.491 / 0.088 | 1.000 / 1.000 / 2.491 / 0.088 |
| yomitan | default | 1.000 / 1.000 / 2.368 / 0.088 | 1.000 / 0.000 / 1.772 / 0.088 | 1.000 / 0.000 / 2.368 / 0.088 | 1.000 / 1.000 / 2.368 / 0.088 |
| defaults (5) | default | 1.000 / 1.000 / 2.667 / 1.000 | 0.333 / 1.000 / 2.000 / 1.000 | 1.000 / 1.000 / 2.667 / 1.000 | 1.000 / 1.000 / 2.667 / 1.000 |
| defaults | all | 1.000 / 0.000 / 3.333 / 1.000 | 0.333 / 1.000 / 2.667 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 |

The final recall over corpus and gaps is 900 / 1,000 = **0.900**. Yomitan's
test is written without diacritics, which wty-grc-en has only for form-of
rows, so its first rank is low for every set. `defaults.tsv` with every
option on fails its negatives by design: the Doric option reads `δίκαν` as
`δίκη` and `capitalizedNames` reads `ἀθηναίων` as `Ἀθηναῖος`.

### 2. Frequent forms

`python3 languages/grc/sources/measure.py frequent <treebank texts> --dictionary $D`.
Of the 10,000 most frequent forms of the treebank (368,718 words), a rule
reaches a treebank lemma of 8,483 (276,856 words, 75.1%). Their first result
(16 results, scan length 16, default options, as a hover) is the treebank's
lemma for 7,161 forms, the same letters with other diacritics for 115, the
dictionary's own entry for the form for 557 (`ἐμέ`, `ὤν`, `οὐδέν`), another
lemma for 513 (6.05%; 355 of them list the treebank's lemma lower), and
nothing for 137. The 513 forms are 14,028 words, **3.80%** of the list's
words; the largest groups are in Known gaps.

### 3. Words after an article, pronoun, particle or εἰμί

`measure.py behind <hover.tsv>`, the real-text lookups whose previous word
the treebank tags as an article, a pronoun, a particle (or οὐ, μή, ἄν) or
a form of εἰμί:

| previous word | lookups | treebank lemma | other diacritics | own entry | wrong first | nothing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| article | 7,809 | 6,322 | 200 | 265 | 660 (8.5%) | 362 |
| pronoun | 5,263 | 4,038 | 67 | 501 | 428 (8.1%) | 229 |
| particle | 3,393 | 2,462 | 66 | 384 | 301 (8.9%) | 180 |
| εἰμί | 1,099 | 845 | 17 | 79 | 97 (8.8%) | 61 |

A lookup starts at the hovered word, so the word before it changes nothing;
the word after it can, through a phrase headword (`οὐχ ἥκιστα`), and the
rules never end a deinflection inside a phrase (`λόγος γε`, `λόγος δέῃ`
and `λόγος ’` are negatives of `cases.tsv`).

### 4. Real text

`python3 languages/grc/sources/make-hovers-agdt.py <out> <the seven files>`
writes 75,172 hovers (the text from each word to the end of its sentence)
with the treebank's lemma; `measure.py text <out>/hover.tsv --sample 60`
looks each up as a host does and judges the first result by script:

| first result | lookups | share |
| --- | ---: | ---: |
| the treebank's lemma | 58,248 | 77.5% |
| the same letters, other diacritics (`Ἀθηναῖος` / `ἀθηναῖος`) | 1,173 | 1.6% |
| the dictionary's entry for the word as written (`δ'`, `αὐτοῦ` the adverb, `ἐπειδή`) | 5,461 | 7.3% |
| another lemma, the treebank's lower in the list | 4,334 | 5.8% |
| another lemma, the treebank's not in the 16 | 2,710 | 3.6% |
| nothing | 3,246 | 4.3% |

The wrong first results, 7,044 (9.4%), by the trace of the first result:
`pronoun` 1,102 (`οἱ` → `οὗ` for the article, 542), the dictionary's
"genitive singular" 626 (`τοῦ` → `-κτόνος`, 557), `as written` 731,
"third-person plural future imperfective active" 256 (`εἶναι` → `εἶμαι`),
"dative plural" 240 (`τοῖς` → `-κτόνος`, 234), `article` 166 (`τὰ` → `ὁ`
where the treebank has the relative), `gen-pl` 161, the dictionary's
"vocative singular masculine" 113 (`σε` → `σός`), `gen-sg` 100, `nom-pl`
100, `acc-sg` 98 (`ἔλεγον` → `ἔλεγος`).

**By hand**, the 60 wrong first results the script samples with seed 1:

- 20 are the dictionary's lemma for the form under its own conventions
  (`μείζους` → `μείζων`, `ὑμῖν` → `ὑμεῖς`, `ἰδών` → `ὁράω`, `εἴρητο` →
  `λέγω`, `ἐμίσγετο` → `μίσγω`; the treebank's `δόξω` → `δοξόω` is an error,
  the pack's `δοκέω` right);
- 20 are a right reading of an ambiguous form, not the one in context (`οἱ`
  → `οὗ` ×5, `πολέμου` → `πολεμόω`, `ἱεροῦ` → `ἱερός`, `ἐμοῦ` → `ἐμός`,
  `χρυσῶν` → `χρυσός`, `παρείς` → `πείρω`);
- 14 are dictionary defects: form-of rows from the article column of
  adjective tables (`τοῦ`/`τοῖς` → `-κτόνος` ×8, `τὴν` → `παῖς`), Modern
  Greek rows (`εἶναι`, `ὄντας` → `εἶμαι` ×4) and one reference to another
  reference (`ἦρχε` → `ἦρχεν`);
- 6 are wrong readings the rules make (`ἰχθύων` → `ἰχθύα`, `ἀπεχθής` →
  `ἀπέχω`, `ζῶσαν` → `ζώννυμι`, `πλούτει` → `πλοῦτος`, `λήθοι` → `λῆθος`,
  `νῆ’` → `νέομαι`): about 10% of the wrong first results, 0.9% of the
  lookups.

### 5. Performance

- **Native lookups** (`build/benchmark-lookup languages/grc/sources/benchmark-words.txt 6 --languages languages --language grc --term $D --json`,
  the 60 texts in 6 passes, the first dropped, three runs): p50 708-733 µs,
  p95 2.42-2.48 ms. The budget is 1 ms p50. The union's p50 is 775 µs.
- **WebAssembly** (`node languages/grc/sources/wasm.mjs <hachidori> $D 10`,
  Hachidori feat/multi-language 803f7b6e's prebuilt engines, Node 22, the
  dictionary paged):
  - `hdw_language_load`: median 26.7 ms single-thread and 28.7 ms threaded
    over 10 fresh engines (budget 50 ms);
  - live heap after the load: +4,148,064 bytes (budget 20 MB);
  - `hdw_lookup` on the 60 texts: p50 1.22 ms and p95 4.33 ms
    single-thread, p50 1.37 ms and p95 4.88 ms threaded.
- **Patterns**: 18 `pattern` rules, 12 in `accent` (antepenult) and 6 in
  `reduplication-preverb`; they take 93,848 bytes of the heap (the load
  without them: +4,054,216 bytes). No processor has a pattern.
- `tests/` and `sources/` hold 942,225 bytes; the largest TSV is
  `corpus.tsv` with 900 rows.

### 6. Commands and checks

```sh
D=imported/wty-grc-en
# rules: own, case maps, final set
node languages/grc/sources/own-rules.mjs
node languages/grc/sources/case-maps.mjs
node languages/grc/sources/build-final.mjs
node tools/merge-transforms.mjs grc --out union.json
# corpus (inputs of Sources and licences)
python3 languages/grc/sources/build-corpus.py unimorph-grc agdt/ wty-grc-en/ > sample.tsv
python3 languages/grc/sources/split-corpus.py sample.tsv build/hoshidicts-cli
# rule sets, per rule
build/hoshidicts-cli eval-language grc <file> --transforms <set> --dictionary $D [--per-rule]
# real text (lookup-batch.cpp built as its header says)
python3 languages/grc/sources/make-hovers-agdt.py out agdt/tlg0003.tlg001.perseus-grc1.1.tb.xml \
  agdt/tlg0540.tlg001.perseus-grc1.tb.xml agdt/tlg0540.tlg014.perseus-grc1.tb.xml agdt/tlg0059.tlg001.perseus-grc1.tb.xml \
  agdt/tlg0016.tlg001.perseus-grc1.1.tb.xml agdt/tlg0011.tlg002.perseus-grc2.tb.xml agdt/tlg0020.tlg002.perseus-grc1.tb.xml
python3 languages/grc/sources/measure.py text out/hover.tsv --dictionary $D --sample 60
python3 languages/grc/sources/measure.py behind out/hover.tsv --dictionary $D
python3 languages/grc/sources/measure.py frequent agdt --dictionary $D
python3 languages/grc/sources/measure.py compare out/hover.tsv --dictionary $D --other <languages dir with union.json> --trace nominalization
python3 languages/grc/sources/measure.py benchmark out/hover.tsv --dictionary $D   # writes benchmark-words.txt
# speed
build/benchmark-lookup languages/grc/sources/benchmark-words.txt 6 --languages languages --language grc --term $D --json
node languages/grc/sources/wasm.mjs <hachidori checkout> $D 10
# checks
node tools/check-classes.mjs grc --write
ctest --test-dir build -j8 --output-on-failure
node tools/check-yomitan.mjs <yomitan checkout> grc
python3 languages/grc/sources/mutate.py <scratch dir>
```

- **Conformance** (`language-conformance-test languages/grc`): 243
  transforms, 14,238 rules, 9 preprocessors; `classes.json` agrees (6
  classes, 104 fields, no step); `yomitan.tsv` 59/59, `corpus.tsv` 900/900,
  `cases.tsv` 463/463, `defaults.tsv` 5/5 with the defaults, `gaps.tsv`
  0/100; every own and both transform has a passing row (1,843 of the 14,238
  rules are exercised). The full `ctest` passes, 40 of 40.
- **Differential check** (`tools/check-yomitan.mjs`): rules 2,596 inputs,
  5,855 Yomitan results, 0 differences; processors `decapitalize` (4,900
  inputs), `capitalizeFirstLetter` (5,295), `removeAlphabeticDiacritics`
  (2,005), `convertLatinToGreek` (2,537), 98 listed differences, 0
  unexplained. `sources/yomitan-differences.tsv` lists the listed ones: a
  capital sigma with no letter before it (`Σ.` gives `ς.` here, `σ.` in
  JavaScript, whose Final_Sigma also skips apostrophes and full stops).
- **Mutation check** (`sources/mutate.py`): 0 of 55 constraint removals
  pass every test.
- **Hachidori** (feat/multi-language 803f7b6e with this branch in
  `third_party/hoshidicts`, `node scripts/sync-languages.mjs`, then
  `node test/chrome-language-pack.mjs` with wty-grc-en.zip and 11 cases of
  real sentences): 15 checks pass, among them ξυνέγραψε → συγγράφω,
  ἄειδε → ἀείδω, ἔπεμψαν → πέμπω, γένοιτ’ → γίγνομαι, the Anki note and the
  switch to Japanese and back.

## Known gaps

- **Forms the rules do not reach**, the 100 rows of `gaps.tsv`:
  - 31 Epic and Ionic verb forms: unaugmented and thematic forms of
    irregular verbs (`δίδον`, `τίθεντο`, `ἴδεν`, `κίχον`, `λέκτο`, `ἤια`),
    iteratives in -σκε (`ἀποκρύπτασκε`), infinitives in -έμεν (`εἰπέμεν`),
    -μεσθα, -αται, apocope (`κάββαλε`), the digamma's augment (`ἑήνδανεν`);
  - 11 irregular stems of Attic verbs that the lists lack (`ὦπται`,
    `κεχολώσομαι`, `ἀπώσεσθε`, `ἐξευρεθῆναι`);
  - 3 verbs with two preverbs (`ἀποκατέστησαν`, `ὑπανεχώρουν`,
    `προκατειληφέναι`);
  - 27 participles: 11 of compounds with irregular aorists (`παραγαγών`,
    `ἀνενειχθέντων`, `καθελοῦσι`), 16 with Epic, Ionic or Doric stems
    (`ἀπικόμενον`, `ταφών`, `τακόμενοι`, `βεβρῶτες`); 2 more are written
    with a rough breathing the lemma lacks (`ἁθροίσαντες`);
  - 4 nouns whose accent goes back before a diphthong or -ζα, -τρια
    (`διαίτης` → `δίαιτα`, `χαλαζῶν` → `χάλαζα`) and 4 with irregular stems
    (`σκάτα` → `σκῶρ`, `ἅλα` → `ἅλς`);
  - 9 treebank nouns and 3 adjectives: Epic stems (`Θέμιστα`, `θώων`),
    crasis and elision the rules do not have (`ὦναξ`, `φῶθ’`), Doric
    `ματρόπολιν`, the dual `ἀμφοτέροιιν`, and spellings or lemmas of the
    treebank (`ἔθνἐ`, `Σαμίου` → `Σάμος`);
  - 2 UniMorph forms without their breathing (`ουτιδανόν`), 1 pronoun
    (`τοῦπερ` → `ὅσπερ`), 2 adverbs (`λέκτρονδ’`, `κεῖσ’`), 1 numeral
    (`τρισκαίδεκα` → `τρεισκαίδεκα`).
- **The article loses ties.** When two lemmas tie on matched length,
  processor steps, trace length and confirmation, the engine prefers a term
  whose reading is its expression. wty-grc-en gives ὁ the reading `ὁ •` and
  most lemmas with long vowels a reading with length marks (`εἰμῐ́`, `σῠ́`),
  while the targets of its defective form-of rows have no reading. So, with
  this pack's rules or without them, `τοῦ` and `τοῖς` show `-κτόνος` first
  (801 real-text lookups; 3,509 words of the frequent forms), `εἶναι` shows
  `εἶμαι` (256; 721 words), `σε` and `σοι` show the possessive `σός` (140;
  831 words) and `οἱ` shows the pronoun `οὗ` before the article (653, of
  which 542 are the article). A frequency dictionary would order them; the
  pack cannot.
- **Ambiguous forms** keep the engine's order: `πολέμου` is also πολεμόω's
  imperative and `ἐμοῦ` ἐμός's genitive; `φίλων` gives `φίλη` before
  `φίλος` (97 words of the frequent forms).
- **Rule errors** in real text, by the hand sample: about 6 of 60 wrong
  first results (0.9% of lookups), such as `πλούτει` → `πλοῦτος` (the
  dative -ει of neuter -ος nouns) and `ἰχθύων` → `ἰχθύα`.
- **Part of speech in the accent transform.** The accent rules give `n` and
  `adj` whatever they read, so a feminine adjective's form can reach a
  masculine noun: `ἀρχῇ` → `ἀρχός` (after `ἀρχή`, which comes first).
- **Text without diacritics** is read by the rules whose endings have none
  (most of them, Yomitan's among them) and by the dictionary's
  diacritic-free form-of rows; rules with a breathing or a subscript in the
  stem or ending do not read it, and the accent transform cannot restore a
  breathing. Text without accents but with breathings is read by every rule.
- **Options**: `capitalizedNames` (a name written in lower case) doubles a
  lookup's work and is off; `doricAlpha` (δίκα → δίκη) is off. Proper names
  have no rules; they are found when the dictionary lists the form.
- **Elision** is restored only after a stem with an accent or breathing, so
  an elided word without diacritics (`γενοιτ’`) is not read.
