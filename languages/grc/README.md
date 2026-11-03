# Ancient Greek (`grc`)

Polytonic Ancient Greek: Attic prose, tragedy, Herodotus' Ionic and Homer's
and Hesiod's Epic. A lookup takes the word as an edition prints it (accents,
breathings, iota subscripts, grave for acute, an enclitic's second accent,
elision, crasis) and reaches the headword of the recommended dictionary,
wiktionary-to-yomitan's wty-grc-en. Text without diacritics is read by the
rules whose endings carry none and by the dictionary's form-of rows, which
wty-grc-en keys without diacritics.

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
- `tests/corpus.tsv` (901 rows) and `tests/gaps.tsv` (99 rows): 1,000
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
- `tests/cases.tsv`, `tests/defaults.tsv` and `tests/text.tsv`: written for
  this pack (GPL-3.0-or-later). `language.json`'s sample is John 1:1 (public
  domain) with a gloss written for the pack.
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

`transforms.json` has 244 transforms and 14,224 rules
(`sources/build-final.mjs`):

| source | transforms | rules |
| --- | ---: | ---: |
| `own` | 241 | 14,177 |
| `both` (rules marked in own transforms) | 0 | 44 |
| `yomitan` | 3 | 3 |

- **`both`**: 50 of Yomitan's 55 rules make a deinflection an own rule makes:
  the same ending replaced by the same text, on a text without conditions,
  with a part of speech in common, in the own transform of the same form
  (`ind-act-2sg` for "2nd person singular present active indicative",
  `gen-sg` for "genitive singular"). The 44 own rules they repeat are marked
  `both` (several Yomitan rules repeat the same own rule: its vocative plural
  is its nominative plural), and 49 of the 50 Yomitan copies are left out:
  the own rule reads the same text, with a trace that names the form.
  `sources/yomitan-provenance.tsv` lists every Yomitan rule with the own
  transforms that repeat it.
- **Yomitan rules kept** (3), each measured in the final set with and
  without it (`eval-language --per-rule` on the corpus, `cases.tsv` and
  `yomitan.tsv`; `measure.py compare` on the 75,172 real-text lookups):
  - the genitive plural `ων` → `ον`, which an own rule makes on stems of two
    letters or more: Yomitan's reaches `ᾦων` → `ᾦον`, a corpus row;
  - the dative singular `α` → `ας` and the vocative singular `η` → `η`,
    which no own rule makes: they change no corpus row, no case and no
    real-text first result.
- **Yomitan rules left out** (3):
  - nominalization `ος` → `εω` (verb), a derivation that reads every -ος
    noun and adjective as an -έω verb. In the union it breaks 4 negatives of
    `cases.tsv` (`φίλος` → `φιλέω`, `καλός` → `καλέω`, `λόγος` → `λογέω`,
    `οἶκος` → `οἰκέω`), adds 5 false candidates there and recovers nothing.
    In real text 328 lookups list a result through it, 1 of them first, and
    none is the treebank's lemma (`Κῦρος` → `κύρω`). Its two rows of
    `tests/yomitan.tsv` (`γεωργος` → `γεωργεω`, `πονος` → `πονεω`) are
    negatives;
  - the dative singular `ω` → `ον`: it recovers no corpus row and adds a
    false candidate; added to the final set it makes 5 real-text first
    results wrong (`ἴτω` → `ἴτον`, `ἴω` → `ἴον`) and 1 right (`μαντηίῳ` →
    `μαντεῖον`);
  - the dative singular `ω` → `ος`: it recovers no corpus row; added to the
    final set it makes 1 real-text first result wrong (`μάθω` → `μάθος`) and
    none right.
- **The 49 repeated rules and the three above, left out together** (union →
  final): corpus recall 0.901 and first rank 0.901 in both; `cases.tsv`
  negatives passed 61/71 → 71/71 (the union breaks the 4 above and 6
  through repeated rules that have no stem minimum: `τοῦ` → `τός`, `ἄν` →
  `α`, `αἱ` → `η`, `ὧν` → `η`, `αἷς` → `η`, `ἅς` → `η`; Yomitan's genitive
  `ου` → `ας` adds a false candidate there); in real text 106 of the
  75,172 first results change, 58 becoming the treebank's lemma, 36 ceasing
  to be it and 12 neither; lookup p50 810-847 → 787-837 µs.

### Own rules

- **Text first.** `normalizeUnicode` (NFC), `normalizeLetterForms` (lunate
  sigma and letter symbols; a final σ → ς), `normalizeApostrophes` (U+2019
  and ASCII, both kept as variants), `graveToAcute`, then the variants
  `decapitalize`, `capitalizeFirstLetter` (optional, setting
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
  ψυχή), the penult (λόγος, χώρα, δῶρον, μοῖρα) and, for twelve endings,
  the antepenult (ἄνθρωπος, ὄνομα, ἀλήθεια; `pattern` rules). Only a stem
  without an accent takes one (the class `unaccented`).
- **Verbs**: thematic, contract and athematic endings by tense, mood and
  person; augment and reduplication as conditions (`aug`, `red`, `augred`)
  that the stem transforms (`augment`, `reduplication`, `aorist`, `future`,
  `perfect`, `aorist-passive`) take off, with preverbs; the principal parts of
  122 irregular verbs; εἰμί, εἶμι, φημί, οἶδα, κεῖμαι, δύναμαι, δίδωμι,
  τίθημι, ἵστημι, ἵημι, δείκνυμι and their compounds form by form.
- **Nouns and adjectives**: case endings of the three declensions with Epic
  and Ionic forms, the feminine and neuter of adjectives, comparison, adverbs
  in -ως, and the irregular nouns. The nominative, accusative and vocative
  dual (`nav-du`) is optional (setting `duals`): its endings are those of
  common singular and verb forms (μάθω, ἔλαβε, which it read as μάθος and
  ἔλλοψ).
- **Closed classes**: the article, pronouns, numerals and irregular
  adjectives as whole words; a form of four letters or more is a suffix rule,
  which also reads it after crasis. A comparative or superlative that is a
  dictionary form of its own reads as it (`ἀμείνονος` → ἀμείνων, `πλείους`
  → πλείων, `μεγίστη` → μέγιστος), another as its positive (`καλλίονα` →
  καλός).
- **Clitics and spelling**: elision (restored with and without accents;
  θ’, φ’, χ’, χθ’ and φθ’ before a rough breathing), elided prepositions and
  particles, crasis (κἀγώ, τοὔνομα, χὠ), the enclitic's second accent
  (`enclitic-accent`: ἄνθρωπός τις), `ποτε` → ποτέ, -περ, ξυν- for συν-,
  -ττ-/-σσ-, γιν- for γιγν-, and the optional Doric ᾱ for η (setting
  `doricAlpha`).
- **Order.** Among equal readings the one a rule finds first comes first
  (Measurements 4), so the order of the rules is a choice: the second
  declension before the first (`φίλων` → φίλος, not φίλη), the accusative
  plural before the genitive singular (the trace of `λόγους` is `acc-pl`),
  and a middle form's -ομαι lemma before its -ω lemma (`ἕποντο` → ἕπομαι).
- **`lookup.untaggedTerms` stays `filter`**, the default (the descriptor
  leaves the key out, which Hachidori's shipped engines do not know yet).
  wty-grc-en tags its nouns,
  adjectives and verbs and leaves names, pronouns and particles untagged, as
  wty-en-en and wty-es-en do. With `pass` the corpus's false candidates go
  from 0.769 to 0.974 per row and its first rank from 0.901 to 0.903; in real
  text 682 first results change (326 become the treebank's lemma, 150 stop
  being it, 206 neither), the wrong first results go from 9,832 to 9,959 and
  the lookups with nothing from 3,234 to 2,951; the frequent forms' wrong
  first words go from 34,299 to 34,579.
- **Stem constraints.** `sources/mutate.py` removes each of the 56 stem
  constraints of the final set (a transform's `stemMinLength`,
  `stemCharacters`, `stemContains`, ...) in a copy; every removal breaks a
  row (`constraint` negatives of `cases.tsv`). The stem minimums that only
  blocked right readings (`ξύν` → `σύν`, `κοὐ` → `οὐ`, `χὠ` → `ὁ`) or changed
  nothing (`unaugmented`) were removed, and that of -σπερ lowered to one
  letter (`ὅσπερ` → `ὅς`).

### History

The first commit, `grc: own rules` (661cc35), has 237 transforms and 21,309
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
  became a twin without accents. Before 5c2f04b, on the 32,637 hovers of
  Thucydides 1, Lysias 1 and 14 and the *Euthyphro*, dropping the
  diacritic-free twins changed the verdict of 71 first results (36 became the
  treebank lemma, 28 stopped being it, 7 stayed wrong) and saved 47 KB;
  wty-grc-en's form-of rows read diacritic-free text;
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
- after the first audit (reports/audit-hachi-lang-grc.md, db93a6a), against
  the same pack without rules (`measure.py rules`; frequent-form tokens the
  rules turn from right to wrong 3,290 → 2,333, real-text lookups 630 →
  481): the second declension before the first; `ποτε` → ποτέ; δύναμαι's
  and ἐπίσταμαι's augmented forms with their accent (`ἐδύνατο`); the dual
  optional; no σ-stem accusative -η → -ης (`ἔτη` → ἔτης) and only -ῶν for the
  σ-stem genitive plural (`μένων` → μένος); `ὅ` and `ἥ` out of the article
  (they are the relative); no -γε after any word (`ἔφυγε` → φύω; ἔγωγε,
  σύγε stay pronoun forms); no -όω imperfect and imperative in -ου
  (`πολέμου` → πολεμόω); comparatives and superlatives to their own
  dictionary forms (`πλείους` → πλείων); the penult accent of -ος and -ον;
  -ομαι before -ω; the accusative plural before the genitive singular;
  χθ’ and φθ’; the forms of μέγας and πολύς in their own transform,
  `irregular-adjective`.

## Measurements

All with wty-grc-en as published (form-of rows included), on one machine
(GCC 14.3 Release, load average 42-47). `D` is the imported dictionary
(`build/hoshidicts-cli import wty-grc-en.zip`). A lookup is a host's hover:
the text from the word to the end of its sentence, 16 results, scan length
16, default options.

**The judge** (`sources/measure.py`). Every token is judged against its own
treebank lemma (sense digits removed):

- *right*: the first result is the lemma;
- *variant*: the same word written otherwise (accents, vowel-length marks
  or capitals; not another breathing, which makes another word: οἷος,
  οἶος), or the dictionary's entry for the word as written whose
  definition names the lemma or says it is the word elided (`δ'` "apocopic
  form of δέ");
- *wrong*: another lemma, or the word's own entry for another word (`τῷ`
  "then", `τῇ` "here" for the article; `αὐτοῦ` "there" for αὐτός); "listed"
  when the lemma is among the 16 results.

### 1. Rule sets

`hoshidicts-cli eval-language grc <file> --transforms <set> --dictionary $D`.
`corpus+gaps` is `corpus.tsv` followed by the rows of `gaps.tsv`. "all" is
the file as it is (every option on), "default" a copy with
`# options: default` added (removed for `defaults.tsv`). Recall / negatives
passed / false candidates per positive row / first rank:

| file | options | own (`sources/own.json`) | Yomitan (`sources/yomitan.json`) | union | final |
| --- | --- | --- | --- | --- | --- |
| corpus+gaps (1,000) | all | 0.900 / – / 0.769 / 0.900 | 0.100 / – / 0.344 / 0.780 | 0.901 / – / 0.770 / 0.901 | **0.901** / – / 0.769 / 0.901 |
| corpus+gaps | default | 0.874 / – / 0.740 / 0.900 | 0.100 / – / 0.332 / 0.781 | 0.888 / – / 0.742 / 0.900 | 0.875 / – / 0.740 / 0.901 |
| cases (503) | all | 1.000 / 1.000 / 1.458 / 0.861 | 0.014 / 0.930 / 0.681 / 0.715 | 1.000 / 0.859 / 1.475 / 0.861 | 1.000 / 1.000 / 1.461 / 0.861 |
| cases | default | 0.984 / 1.000 / 1.377 / 0.861 | 0.014 / 0.930 / 0.641 / 0.715 | 0.984 / 0.859 / 1.398 / 0.861 | 0.984 / 1.000 / 1.380 / 0.861 |
| yomitan (59) | all | 1.000 / 1.000 / 2.491 / 0.088 | 1.000 / 0.000 / 1.895 / 0.088 | 1.000 / 0.000 / 2.491 / 0.088 | 1.000 / 1.000 / 2.491 / 0.088 |
| yomitan | default | 0.965 / 1.000 / 2.368 / 0.088 | 1.000 / 0.000 / 1.772 / 0.088 | 1.000 / 0.000 / 2.368 / 0.088 | 0.965 / 1.000 / 2.368 / 0.088 |
| defaults (6) | default | 1.000 / 1.000 / 2.667 / 1.000 | 0.333 / 1.000 / 2.000 / 1.000 | 1.000 / 1.000 / 2.667 / 1.000 | 1.000 / 1.000 / 2.667 / 1.000 |
| defaults | all | 1.000 / 0.000 / 3.333 / 1.000 | 0.333 / 1.000 / 2.667 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 |

The final recall over corpus and gaps is 901 / 1,000 = **0.901** with every
option on; with the defaults it is 0.875, because 26 UniMorph duals need the
optional `duals`. Yomitan's test is written without diacritics, which
wty-grc-en has only for form-of rows, so its first rank is low for every set;
two of its rows are duals. `defaults.tsv` with every option on fails its
negatives by design: `doricAlpha` reads `δίκαν` as `δίκη`, `capitalizedNames`
reads `ἀθηναίων` as `Ἀθηναῖος`, and `duals` reads `ἔλαβε` as `ἔλαψ`.

### 2. Frequent forms

`python3 languages/grc/sources/measure.py frequent <treebank texts> --dictionary $D`.
Of the 10,000 most frequent forms of the treebank (368,718 words), a rule
reaches a treebank lemma of 8,705 (283,843 words, 77.0%). Their tokens,
each judged against its own lemma: right 214,031 (75.4%), variant 34,150
(12.0%), wrong with the lemma listed 27,113 (9.6%), wrong 7,186 (2.5%),
nothing 1,363 (0.5%). The wrong first results are 34,299 words, **9.30%** of
the list's words; the largest groups are in Known gaps.

### 3. Words after an article, pronoun, particle or εἰμί

`measure.py behind <hover.tsv>`, the real-text lookups whose previous word
the treebank tags as an article, a pronoun, a particle (or οὐ, μή, ἄν) or
a form of εἰμί:

| previous word | lookups | right | variant | wrong first | nothing |
| --- | ---: | ---: | ---: | ---: | ---: |
| article | 7,809 | 6,357 | 290 | 806 (10.3%) | 356 |
| pronoun | 5,263 | 4,048 | 400 | 587 (11.2%) | 228 |
| particle | 3,393 | 2,473 | 298 | 443 (13.1%) | 179 |
| εἰμί | 1,099 | 847 | 41 | 150 (13.6%) | 61 |

A lookup starts at the hovered word, so the word before it changes nothing;
the word after it can, through a phrase headword (`οὐχ ἥκιστα`). The
clitic, elision and whole-word rules do not fire after a space (`λόγος
περ`, `λόγος δέῃ` and `λόγος ’` are negatives of `cases.tsv`).

### 4. Real text

`python3 languages/grc/sources/make-hovers-agdt.py <out> <the seven files>`
writes 75,172 hovers with the treebank's lemma; `measure.py text
<out>/hover.tsv --sample 60` looks each up and judges the first result:

| first result | lookups | share |
| --- | ---: | ---: |
| right | 58,388 | 77.7% |
| variant | 3,718 | 4.9% |
| wrong, the treebank's lemma lower in the list | 6,367 | 8.5% |
| wrong, the treebank's lemma not in the 16 | 3,465 | 4.6% |
| nothing | 3,234 | 4.3% |

The wrong first results, 9,832 (13.1%), by the trace of the first result:
the word's own entry (`as written`) 3,399 (`τῷ` 344, `τῇ` 283 for the
article; `ἐν` 159, which the treebank's Herodotus lemmatizes as εἰς),
`pronoun` 1,120 (`οἱ` → `οὗ` for the article, 542), the dictionary's
"genitive singular" 638 (`τοῦ` → `-κτόνος`, 557), "third-person plural
future imperfective active" 256 (`εἶναι` → `εἶμαι`), "dative plural" 241
(`τοῖς` → `-κτόνος`, 234), `gen-pl` 158, `article` 148 (`τὰ` → `ὁ` where the
treebank has the relative), "nominative/vocative plural masculine" 99 (`σοι`
→ `σός`), `acc-sg` 95 (`ἔλεγον` → `ἔλεγος`).

**Rules against the dictionary alone** (`measure.py rules`: the same pack
without rules, its processors and wty-grc-en's form-of rows only). The rules
make 5,817 real-text lookups right that the dictionary alone gets wrong, and
481 (0.64%) wrong that it gets right; for the frequent forms 13,937 and 2,333
words (0.63%). Among equal readings the engine puts the term found first
first, and a rule finds its term before the dictionary's references are
followed (`docs/languages.md` 9.6, 9.10), so a rule that reaches a rarer
word reorders the dictionary's equals. The largest groups are in Known gaps.

**Traces** (`measure.py traces`): of the 8,101 right first results whose
first step is a case, the case and number agree with the treebank's tag for
7,571; the 530 others are mostly neuter nominatives labelled accusative
(`ὅσιον`, `δίκαιον`) and ambiguous forms.

**By hand**, the 60 wrong first results the script samples with seed 1:

- 23 are the dictionary's lemma or entry for the form under its own
  conventions, or treebank conventions and errors (`ἡμᾶς`, `ὅσα`, `οὐδέν`
  as entries of their own; `βιασθῶσι` → βιάζομαι, `ἐκτῆσθαι` → κτάομαι,
  `ἐν` → εἰς, `δὲ` → οὐδέ);
- 3 are the same word spelled otherwise (`πλώϊμος`, `ληΐζομαι`);
- 17 are the dictionary's order: the article and pronoun ties (`τοῦ`,
  `τοῖς` → `-κτόνος` ×7, `οἱ` → `οὗ` ×6, `εἶναι` → `εἶμαι`, `σε`, `σοῦ` →
  `σός`) and own entries of homographs (`τῷ` "then", `τῇ` "here");
- 10 are a right reading of an ambiguous form, not the one in context
  (`ἐμοῦ` → ἐμός, `πλέον` → πλέω, `αὐτοῦ` the adverb, `χαλκῷ` → χαλκός,
  `ἴσθ’` → ἴστε);
- 7 are wrong readings the rules make (`τυράννων` → τυραννέω, `ἀφίῃ` →
  ἀφία, `ἀδίκων` → ἀδίκη, `Τέλλον` → τέλλω, `Κολοφωνίους` → κολοφών,
  `Ἅιδου` → Αἰδώς, `σκοτόεν` → σκοτόω).

### 5. Performance

- **Native lookups** (`build/benchmark-lookup languages/grc/sources/benchmark-words.txt 6 --languages languages --language grc --term $D --json`,
  the 60 texts in 6 passes, the first dropped, three runs): p50 787-837 µs,
  p95 2.36-2.44 ms. The budget is 1 ms p50. The union's p50 is 810-847 µs.
- **WebAssembly** (`node languages/grc/sources/wasm.mjs <hachidori> $D 10`,
  Hachidori feat/multi-language 803f7b6e's prebuilt engines, Node 22, the
  dictionary paged):
  - `hdw_language_load`: median 27.8 ms single-thread and 29.4 ms threaded
    over 10 fresh engines (budget 50 ms);
  - live heap after the load: +4,166,712 bytes (budget 20 MB);
  - `hdw_lookup` on the 60 texts: p50 1.46 ms and p95 4.47 ms
    single-thread, p50 1.58 ms and p95 4.73 ms threaded.
- **Patterns**: 18 `pattern` rules, 12 in `accent` (antepenult) and 6 in
  `reduplication-preverb`; they take 94,424 bytes of the heap (the load
  without them: +4,072,288 bytes). No processor has a pattern.
- `tests/` and `sources/` hold 955,752 bytes; the largest TSV is
  `corpus.tsv` with 901 rows.

### 6. Commands and checks

```sh
D=imported/wty-grc-en
# rules: own, case maps, final set
node languages/grc/sources/own-rules.mjs
node languages/grc/sources/case-maps.mjs
node languages/grc/sources/build-final.mjs
node tools/merge-transforms.mjs grc --out union.json
# corpus (inputs of Sources and licences)
python3 languages/grc/sources/build-corpus.py unimorph-grc agdt/ <unzipped wty-grc-en> > sample.tsv
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
python3 languages/grc/sources/measure.py rules out/hover.tsv --dictionary $D     # and with agdt for the frequent forms
python3 languages/grc/sources/measure.py traces out/hover.tsv --dictionary $D
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

- **Conformance** (`language-conformance-test languages/grc`): 244
  transforms, 14,224 rules, 9 preprocessors; `classes.json` agrees (7
  classes, 109 fields, no step); `yomitan.tsv` 59/59, `corpus.tsv` 901/901,
  `cases.tsv` 503/503, `defaults.tsv` 6/6 with the defaults, `text.tsv`
  17/17, `gaps.tsv` 0/99; every own and both transform has a passing row
  (1,848 of the 14,224 rules are exercised). The full `ctest` passes, 52 of
  52, on main 39cebbe.
- **Traces in the tests.** The 37 `trace` rows of `cases.tsv` give their
  reasons (`λόγους` → λόγος `acc-pl`, `ἔλυσα` → λύω
  `accent|augment|aorist|ind-act-1sg`, `δίκα` → δίκη `doric-alpha`), so a
  renamed transform or a lost path fails a test.
- **Differential check** (`tools/check-yomitan.mjs`): rules 2,621 inputs,
  5,902 Yomitan results, 0 differences; processors `decapitalize` (4,928
  inputs), `capitalizeFirstLetter` (5,323), `removeAlphabeticDiacritics`
  (2,033), `convertLatinToGreek` (2,565), 98 listed differences, 0
  unexplained. `sources/yomitan-differences.tsv` lists the listed ones: a
  capital sigma with no letter before it (`Σ.` gives `ς.` here, `σ.` in
  JavaScript, whose Final_Sigma also skips apostrophes and full stops).
- **Mutation checks.** `sources/mutate.py`: 0 of 56 constraint removals
  pass every test. The first audit's 53 mutations (its `mymutate.mjs`):
  47 fail a test; of the 6 that pass, three change a processor step that
  another processor repeats (NFC, the final-sigma map, the diacritic strip,
  which `check-yomitan` also catches), two remove a pair another pair
  repeats (`θω` → `ω` of `aorist-passive`, `ξυν` → `συν` beside `ξυ` →
  `συ`), and one removes the -γε rule, which no longer exists.
- **Hachidori** (feat/multi-language 803f7b6e with this branch in
  `third_party/hoshidicts`, `node scripts/sync-languages.mjs`, then
  `node test/chrome-language-pack.mjs` with wty-grc-en.zip and 11 cases of
  real sentences): 15 checks pass and none fails, among them ξυνέγραψε →
  συγγράφω, ἄειδε → ἀείδω, ἔπεμψαν → πέμπω, γένοιτ’ → γίγνομαι, the Anki
  note and the switch to Japanese and back.

## Known gaps

- **Forms the rules do not reach**, the 99 rows of `gaps.tsv`:
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
  - 9 treebank nouns and 2 adjectives: Epic stems (`Θέμιστα`, `θώων`),
    crasis the rules do not have (`ὦναξ`), Doric `ματρόπολιν`, the dual
    `ἀμφοτέροιιν`, and spellings or lemmas of the treebank (`ἔθνἐ`, `Σαμίου`
    → `Σάμος`);
  - 2 UniMorph forms without their breathing (`ουτιδανόν`), 1 pronoun
    (`τοῦπερ` → `ὅσπερ`), 2 adverbs (`λέκτρονδ’`, `κεῖσ’`), 1 numeral
    (`τρισκαίδεκα` → `τρεισκαίδεκα`).
- **Wrong first results the rules cause** (`measure.py rules`, frequent-form
  words / real-text lookups where the dictionary alone puts the right lemma
  first): genitive plurals read as another word (`ἄγων` → ἄγος 55 / 6,
  `βοῶν` → βοή 45, `ἀνέμων` → ἀνέμη 36, `ὀρέων` → ὀρεύς 28 / 7, `ἀδίκων` →
  ἀδίκη 4), the feminine of an adjective read as a noun (`φίλην`, `φίλῃ`,
  `φίλαι`, `φίλας` → φίλη 106, `ἰδίαν`, `ἰδίας` → ἰδία 48), augmented and
  third-person verb forms read as nouns (`ἔλεγον`, `ἔλεγε` → ἔλεγος 45 / 32,
  `μένει` → μένος 32, `ἄγει` → ἄγος 23 / 5, `μάθε` → μάθος 6), `ἐμοῦ` →
  ἐμός 102 / 25, `ἕνα` → ἕνος 49, `ἔτη` → ἔτης (vocative) 32 / 7, `Δελφούς`
  and its cases → Δελφός 23 / 43, the aorist of ὁράω as ὁράω where wty-grc-en
  has εἶδον (`ἴδον`, `ἰδεῖν`, `ἰδέσθαι` 171), `ἵκοντο`, `ἵκετο` → ἵκω 91,
  and the enclitic accent reaching a variant entry (`φώνησέν` → φώνησεν 35).
  Each needs the right word to be found by a rule before the other or a
  constraint that tells the forms apart; the rules have neither.
- **The article loses ties.** When two lemmas tie on matched length,
  processor steps, trace length and confirmation, the engine prefers a term
  whose reading is its expression. wty-grc-en gives ὁ the reading `ὁ •` and
  most lemmas with long vowels a reading with length marks (`εἰμῐ́`, `σῠ́`),
  while the targets of its defective form-of rows have no reading. So, with
  this pack's rules or without them, `τοῦ` and `τοῖς` show `-κτόνος` first
  (801 real-text lookups; 3,469 words of the frequent forms), `εἶναι` shows
  `εἶμαι` (256; 721 words), `σε` and `σοι` show the possessive `σός` (168;
  1,152 words) and `οἱ` shows the pronoun `οὗ` before the article (653, of
  which 542 are the article). Other rows of wty-grc-en win the same way:
  `εἶσι` → εἶμαι, `εἶεν` → φοβέω, `ἧς` → εἷς, `ἰών` → ἐγώ. A frequency
  dictionary would order them; the pack cannot.
- **The word's own entry for another word** comes first, with no rule and
  no processor step, which no rule can outrank: `τῷ` "then" (344 real-text
  lookups; 1,349 frequent-form words), `τῇ` "here; there" (283; 904),
  `αὐτοῦ` "here, there" for αὐτός, `τάδε` "on this account" and `τόδε`
  "hither" for ὅδε, `οἷα` and `οἵα` → οἶος "alone" for οἷος.
- **Ambiguous forms** keep the engine's order: `πολέμου` is also πολεμόω's
  imperative and `ἐμοῦ` ἐμός's genitive; `τύχῃ` is τύχη's dative and
  τυγχάνω's subjunctive.
- **Part of speech.** The accent rules give `n` and `adj` whatever they
  read, so a feminine adjective's form can reach a masculine noun: `ἀρχῇ` →
  `ἀρχός` (after `ἀρχή`, which comes first). Words that wty-grc-en lists with
  no part of speech (οἷος) are not reached by the case rules, whose outputs
  carry `n` or `adj`.
- **Text without diacritics** is read by the rules whose endings have none
  (most of them, Yomitan's among them) and by the dictionary's
  diacritic-free form-of rows; rules with a breathing or a subscript in the
  stem or ending do not read it, and the accent transform cannot restore a
  breathing. Text without accents but with breathings is read by the rules
  and the accent transform, the penult of -ος and -ον included (`ἐργου` →
  ἔργον).
- **Iota adscript** (`λόγωι`, `τιμῆι`, capitals `ΤΩΙ`) is not read as the
  subscript.
- **A closing single quotation mark** U+2019 after a word (‘λόγος’) is read
  as an elision mark, so the word finds nothing.
- **Options**: `capitalizedNames` (a name written in lower case) doubles a
  lookup's work and is off; `doricAlpha` (δίκα → δίκη) and `duals` are off.
  Proper names have no rules; they are found when the dictionary lists the
  form.
- **Elision** is restored only after a stem with an accent or breathing, so
  an elided word without diacritics (`γενοιτ’`) is not read.
