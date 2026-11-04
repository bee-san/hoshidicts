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
  negatives). A fresh port followed by `build-final.mjs` writes the file
  byte for byte. GPL-3.0-or-later, Copyright (C) 2025-2026 Yomitan Authors.
- `tests/corpus.tsv` (902 rows) and `tests/gaps.tsv` (98 rows): 1,000
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
- `sources/exceptions.tsv`: written by `sources/measure.py exceptions` from
  the treebank's forms and lemmas (CC BY-SA 3.0 US, as above) and the first
  results wty-grc-en gives for them (CC BY-SA 4.0, below): forms, terms,
  part-of-speech tags and token counts, no definitions.
- `tests/cases.tsv`, `tests/defaults.tsv`, `tests/text.tsv`,
  `tests/lookup.tsv` and the dictionary of `tests/dictionary/` (its glosses
  too): written for this pack (GPL-3.0-or-later). `language.json`'s sample is
  John 1:1 (public domain) with a gloss written for the pack.
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

`transforms.json` has 244 transforms and 14,497 rules
(`sources/build-final.mjs`):

| source | transforms | rules |
| --- | ---: | ---: |
| `own` | 242 | 14,451 |
| `both` (rules marked in own transforms) | 0 | 44 |
| `yomitan` | 2 | 2 |

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
- **Yomitan rules kept** (2), each measured in the final set with and
  without it (`eval-language --per-rule` on every test file; `measure.py
  compare` on the 75,172 real-text lookups):
  - the genitive plural `ων` → `ον`, which an own rule makes on stems of two
    letters or more: Yomitan's reaches `ᾦων` → `ᾦον`, a corpus row;
  - the vocative singular `η` → `η`, which no own rule makes: it recovers no
    row and adds no false candidate on any file, and without it no real-text
    first result changes.
- **Yomitan rules left out** (4):
  - nominalization `ος` → `εω` (verb), a derivation that reads every -ος
    noun and adjective as an -έω verb. In the union it breaks 4 negatives of
    `cases.tsv` (`φίλος` → `φιλέω`, `καλός` → `καλέω`, `λόγος` → `λογέω`,
    `οἶκος` → `οἰκέω`) and 2 of `yomitan.tsv`, adds 5 false candidates on
    `cases.tsv` and recovers nothing. In real text 328 lookups list a result
    through it, 1 of them first, and none is the treebank's lemma (`Κῦρος` →
    `κύρω`). Its two rows of `tests/yomitan.tsv` (`γεωργος` → `γεωργεω`,
    `πονος` → `πονεω`) are negatives;
  - the dative singular `ω` → `ον`: it recovers no row of any test file and
    adds a false candidate on the corpus; added to the final set it changes
    16 real-text first results, 15 to a wrong word (`μόρῳ` → `μόρον` ×5,
    `ἴτω` → `ἴτον` ×4, `ἴω` → `ἴον`, `κεφαλαίῳ`, `δημοσίῳ`, `μώρῳ`, `παλτῷ`,
    `δεινῷ`) and 1 to the treebank's lemma (`μαντηίῳ` → `μαντεῖον`);
  - the dative singular `ω` → `ος`: it recovers no row of any test file;
    added to the final set it makes 1 real-text first result wrong (`μάθω` →
    `μάθος`), changes 1 wrong one into another (`σθένω`) and makes none
    right;
  - the dative singular `α` → `ας`: in the final set it recovers no row of
    any test file and adds a false candidate on `cases.tsv`; with it no
    real-text first result changes. Its row of `yomitan.tsv` (`νεανια` →
    `νεανιας`) is the own vocative.

  `tests/defaults.tsv` pins the two datives in -ω: with the defaults,
  `ανθρωπω` and `δωρω` (Yomitan's datives without the iota subscript) do not
  reach `ανθρωπος` and `δωρον`; with every option on the dual reads them, so
  their rows of `yomitan.tsv` stay positive.
- **The 49 repeated rules and the four above, left out together** (union →
  final): corpus recall 0.902 in both, first rank 0.905 in both;
  `cases.tsv` negatives passed 63/73 → 73/73 (the union breaks the 4 above
  and 6 through repeated rules that have no stem minimum: `τοῦ` → `τός`,
  `ἄν` → `α`, `αἱ` → `η`, `ὧν` → `η`, `αἷς` → `η`, `ἅς` → `η`; Yomitan's
  genitive `ου` → `ας` adds a false candidate there); in real text 98 of the
  75,172 first results change, 57 becoming the treebank's lemma, 30 ceasing
  to be it and 11 neither; lookup p50 821-850 → 814-830 µs.

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
  without an accent takes one (the class `unaccented`), and only a stem of
  one letter or more (`cases.tsv` pins `ος` ↛ `ός`).
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
  καλός). The comparatives in -ίων and superlatives in -ιστος of ἐχθρός,
  αἰσχρός and οἰκτρός, which lose the ρ, are whole words too; generic rules
  read them as the noun of the bare stem (`ἔχθιστος` → ἔχθος "hatred",
  `αἴσχιστον` → αἶσχος "shame"), which now comes second.
- **Clitics and spelling**: elision (restored with and without accents;
  θ’, φ’, χ’, χθ’ and φθ’ before a rough breathing), elided prepositions and
  particles, crasis (κἀγώ, τοὔνομα, χὠ), the enclitic's second accent
  (`enclitic-accent`: ἄνθρωπός τις), `ποτε` → ποτέ, -περ, ξυ- for συ-
  (which covers ξυν-, ξυμ-, ξυγ-, ξυλ- and ξυσ-), -ττ-/-σσ-, γιν- for
  γιγν-, and the optional Doric ᾱ for η (setting `doricAlpha`).
- **Exceptions** (`exceptions`, the first transform, 202 rules for 77
  forms). Among equal readings the engine puts the term found first first
  (Measurements 4), and it reads a text without diacritics before the text
  as written; there the dictionary's form-of rows name both readings in
  their own order. So some common forms showed the rules' rarer reading
  first: ἔλεγε as ἔλεγος "song of mourning", ἐμοῦ as ἐμός, ἔτη as ἔτης
  "kinsman". Moving transforms does not change that; a whole word in the
  first transform, as written, without accents and without any diacritic,
  does. `sources/exceptions.tsv` is the list `measure.py exceptions` writes,
  and regenerates byte for byte:
  - from the frequency list of the 26 treebank files outside the real-text
    set (so Measurements 4 is held out), the 63 forms whose first result the
    rules (all but this transform) turn from right to wrong for at least 10
    tokens net, and 13 more forms with a net loss from the same collisions
    (the same first result with the rules and without them, as `φίλας`
    beside `φίλην`);
  - each read as the term the dictionary alone puts first, with that term's
    part-of-speech tag.

  One form is added by hand (`MANUAL_EXCEPTIONS` in `own-rules.mjs`):
  `ἔλεγον`, the other form of the `ἔλεγε` collision, which both audits
  named; the held-out list does not have it, and its 17 real-text lookups
  are in-sample. The trace of such a result is "common form".
- **Order.** Among equal readings the one a rule finds first comes first
  (Measurements 4), so the order of the rules is a choice: the second
  declension before the first (`φίλων` → φίλος, not φίλη) and a middle
  form's -ομαι lemma before its -ω lemma (`ἕποντο` → ἕπομαι), which
  `tests/lookup.tsv` pins. The accusative plural before the genitive
  singular gives `λόγους` the trace `acc-pl` instead of `gen-sg`; both reach
  λόγος, so no test format of the contract can pin it, and Measurements 4
  counts the traces.
- **`lookup.untaggedTerms` stays `filter`**, the default (the descriptor
  leaves the key out, which Hachidori's shipped engines do not know yet).
  33,075 of wty-grc-en's 1,043,571 rows (3.17%) have no part-of-speech tag:
  27,088 form-of rows (`non-lemma`), 4,288 names, 740 adverbs, 206
  suffixes, 115 letters, 115 prepositions, 103 pronouns, 88 conjunctions and
  smaller groups. Its nouns, adjectives and verbs, the parts of speech the
  rules produce, are tagged, so section 14 step 5 keeps `filter`.
  Measurements 1 gives both values on every file: with `pass` the first
  rank rises on the corpus only (0.905 → 0.907) and the false candidates
  rise on seven of the eight file and option pairs. In real text 668 first
  results change: 318 become the treebank's lemma, 150 stop being it, 200
  neither. `pass` finds something for 283 more lookups (3,234 → 2,951 with
  nothing), mostly a wrong word, and puts untagged rows before tagged ones
  (`τούτοισι` → τοῦτος, `ἀπόρους` → ἀπόρως, `Φοινίκων` → Φοινίκη); the wrong
  first results rise from 9,812 to 10,090, and the frequent forms' wrong
  first words from 34,609 to 35,467. `tests/lookup.tsv` pins `filter`
  (`τούτοισι` → οὗτος).
- **Stem constraints.** `sources/mutate.py` removes each of the 57 stem
  constraints of the final set (a transform's `stemMinLength`,
  `stemCharacters`, `stemContains`, ...) in a copy; every removal breaks a
  row (`constraint` negatives of `cases.tsv`; `προκείμενα` ↛ `προκείμεἷς`
  for the exceptions' whole words). The stem minimums that only blocked
  right readings (`ξύν` → `σύν`, `κοὐ` → `οὐ`, `χὠ` → `ὁ`) or changed
  nothing (`unaugmented`) were removed, and that of -σπερ lowered to one
  letter (`ὅσπερ` → `ὅς`).

### History

The first commit, `grc: own rules`, has 237 transforms and 21,309 rules,
each its own row (5.0 MB). Then, measured on the corpus sample, real text
and the benchmark:

- suffix rules with the same conditions and constraints became cross
  products (section 7.3), and whole words became suffix rules with an empty
  stem; prefix rules stay single, because a cross product of prefixes is
  tried on every text (it made lookups 0.3 ms slower);
- the accent transform: an acute or circumflex for every vowel and
  consonant cluster (94 KB), then stem changes (0.42 ms slower per lookup),
  then one marked-ending rule per ending (20 KB); with single prefix rules
  the lookup p50 went from 1.65 to 0.72 ms;
- each rule's twin without any diacritic (for text without diacritics)
  became a twin without accents, in `grc: corpus, cases and the final rule
  set`. At this branch's head, the diacritic-free twins (`GRC_TWINS=1 node
  own-rules.mjs`) make `transforms.json` 8,568 bytes and 200 rules larger,
  fail 6 test rows (`Περίπλῳ` → περίπλους, the two Yomitan datives of
  `defaults.tsv`, `μάθω` in `lookup.tsv`, two constraint negatives) and change 152 of the
  75,172 real-text first results: 74 stop being the treebank's lemma, 11
  become it, 67 neither; wty-grc-en's form-of rows read diacritic-free text;
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
- after the first audit (reports/audit-hachi-lang-grc.md), in `grc: fixes
  after the first audit`, measured against the same pack without rules
  (`measure.py rules` with that audit's judge; frequent-form tokens the rules
  turn from right to wrong 3,290 → 2,333, real-text lookups 630 → 481): the
  second declension before the first; `ποτε` → ποτέ; δύναμαι's and
  ἐπίσταμαι's augmented forms with their accent (`ἐδύνατο`); the dual
  optional; no σ-stem accusative -η → -ης and the σ-stem neuter genitive
  plural only in -ῶν (neither changed `ἔτη` → ἔτης or `μένων` → μένος, which
  other rules make); `ὅ` and `ἥ` out of the article (they are the relative);
  no -γε after any word (`ἔφυγε` → φύω; ἔγωγε, σύγε stay pronoun forms); no
  -όω imperfect and imperative in -ου (`πολέμου` → πολεμόω); comparatives
  and superlatives to their own dictionary forms (`πλείους` → πλείων); the
  penult accent of -ος and -ον (two negatives of `cases.tsv`, `ἀλλά` → ἄλλος
  and `θεοῦ` → θέος, were deleted then: the rule reaches them through the
  variant without accents, and lookups still show ἀλλά and θεός first;
  `lookup.tsv` pins ἀλλά); -ομαι before -ω; the accusative plural before the
  genitive singular; χθ’ and φθ’; the forms of μέγας and πολύς in their own
  transform, `irregular-adjective`;
- after the second audit (reports/audit-hachi-lang-grc-b.md), in `grc:
  fixes after the second audit`: the exceptions; the comparison of ἐχθρός,
  αἰσχρός and οἰκτρός; Yomitan's dative `α` → `ας` left out; ξυ- alone for
  the ξυν- spellings; `tests/lookup.tsv` with `tests/dictionary/`; the rows
  that pin the rules left out and the stem minimum of `accent`; a judge that
  reads only the definitions and counts an accent homograph of a listed
  lemma as wrong (Measurements). Against the same pack without rules, with
  this judge: frequent-form tokens the rules turn from right to wrong 907,
  real-text lookups 354.

## Measurements

All with wty-grc-en as published (form-of rows included), on one machine
(GCC 14.3 Release, load average 35-44). `D` is the imported dictionary
(`build/hoshidicts-cli import wty-grc-en.zip`). A lookup is a host's hover:
the text from the word to the end of its sentence, 16 results, scan length
16, default options.

**The judge** (`sources/measure.py`). Every token is judged against its own
treebank lemma (sense digits removed). It reads a result's definitions, the
glosses wty-grc-en lists, without the grammar and etymology notes, example
sentences and related words (`lookup-batch`'s `gloss`):

- *right*: the first result is the lemma;
- *variant*: the same word written otherwise, with other accents,
  vowel-length marks or capitals (not another breathing, which makes another
  word: οἷος, οἶος), when the lemma as the treebank spells it is not among
  the results or the first result's definitions name it (`πέρι`
  "initial-stressed form of περί"); or the dictionary's own entry for the
  word as written whose definitions name the lemma or say it is the word
  elided or contracted (`δ'` "apocopic form of δέ", `ἐστιν` "third-person
  singular … of εἰμί");
- *wrong*: another lemma; an accent homograph of a lemma that is listed
  (`ἐτῶν` → ἐτός "in vain" for ἔτος "year", `Κύπρον` → κύπρος "henna"); or the
  word's own entry for another word (`τῷ` "then", `τῇ` "here" for the
  article; `τοι` "let me tell you" for σύ; `αὐτοῦ` "there" for αὐτός).
  "Listed" when the lemma is among the 16 results.

This judge is stricter than the one before the second audit, which credited
a definition that named the lemma in its etymology and any accent variant,
but did not read lemmas written with length marks (`εἰμῐ́`) or own entries
of a word written with a grave. With that judge (and its `lookup-batch`) the
final pack's wrong first results are 9,676 in real text (12.9%) and 33,407
frequent-form words (9.06%); with this one, 9,812 and 34,609.

### 1. Rule sets

`hoshidicts-cli eval-language grc <file> --transforms <set> --dictionary $D`.
`corpus+gaps` is `corpus.tsv` followed by the rows of `gaps.tsv`. "all" is
the file as it is (every option on), "default" a copy with
`# options: default` added (removed for `defaults.tsv`). Recall / negatives
passed / false candidates per positive row / first rank:

| file | options | own (`sources/own.json`) | Yomitan (`sources/yomitan.json`) | union | final |
| --- | --- | --- | --- | --- | --- |
| corpus+gaps (1,000) | all | 0.901 / – / 0.769 / 0.904 | 0.100 / – / 0.344 / 0.780 | 0.902 / – / 0.770 / 0.905 | **0.902** / – / 0.769 / 0.905 |
| corpus+gaps | default | 0.875 / – / 0.740 / 0.904 | 0.100 / – / 0.332 / 0.781 | 0.889 / – / 0.742 / 0.904 | 0.876 / – / 0.740 / 0.905 |
| cases (508) | all | 1.000 / 1.000 / 1.460 / 0.862 | 0.014 / 0.932 / 0.685 / 0.715 | 1.000 / 0.863 / 1.476 / 0.862 | 1.000 / 1.000 / 1.460 / 0.862 |
| cases | default | 0.984 / 1.000 / 1.379 / 0.862 | 0.014 / 0.932 / 0.646 / 0.715 | 0.984 / 0.863 / 1.400 / 0.862 | 0.984 / 1.000 / 1.379 / 0.862 |
| yomitan (59) | all | 1.000 / 1.000 / 2.491 / 0.088 | 1.000 / 0.000 / 1.895 / 0.088 | 1.000 / 0.000 / 2.491 / 0.088 | 1.000 / 1.000 / 2.491 / 0.088 |
| yomitan | default | 0.965 / 1.000 / 2.368 / 0.088 | 1.000 / 0.000 / 1.772 / 0.088 | 1.000 / 0.000 / 2.368 / 0.088 | 0.965 / 1.000 / 2.368 / 0.088 |
| defaults (8) | default | 1.000 / 1.000 / 2.667 / 1.000 | 0.333 / 0.600 / 2.000 / 1.000 | 1.000 / 0.600 / 2.667 / 1.000 | 1.000 / 1.000 / 2.667 / 1.000 |
| defaults | all | 1.000 / 0.000 / 3.333 / 1.000 | 0.333 / 0.600 / 2.667 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 |

The final recall over corpus and gaps is 902 / 1,000 = **0.902** with every
option on; with the defaults it is 0.876, because 26 UniMorph duals need the
optional `duals`. One corpus row, `εἴπας` → εἶπον, is reached through the
exception for `εἶπας` written without accents. Yomitan's test is mostly
written without diacritics, which wty-grc-en has only for form-of rows, so
its first rank is low for every set; two of its rows (`ανθρωπω`, `δωρω`)
are Yomitan's datives without the iota subscript, which this pack reads
only as duals, an option. `defaults.tsv` with every option on fails its
negatives by design: `doricAlpha` reads `δίκαν` as `δίκη`,
`capitalizedNames` reads `ἀθηναίων` as `Ἀθηναῖος`, and `duals` reads
`ἔλαβε` as `ἔλαψ` and the two datives.

The final set with `lookup.untaggedTerms` `pass` (`--languages` a copy whose
descriptor says so):

| file | all | default |
| --- | --- | --- |
| corpus+gaps | 0.902 / – / 0.976 / 0.907 | 0.876 / – / 0.848 / 0.907 |
| cases | 1.000 / 1.000 / 1.782 / 0.862 | 0.984 / 1.000 / 1.602 / 0.862 |
| yomitan | 1.000 / 1.000 / 2.614 / 0.088 | 0.965 / 1.000 / 2.368 / 0.088 |
| defaults | 1.000 / 0.000 / 5.000 / 1.000 | 1.000 / 1.000 / 4.333 / 1.000 |

### 2. Frequent forms

`python3 languages/grc/sources/measure.py frequent <treebank texts> --dictionary $D`.
Of the 10,000 most frequent forms of the treebank (368,718 words), a rule
reaches a treebank lemma of 8,730 (284,552 words, 77.2%). Their tokens,
each judged against its own lemma: right 215,673 (75.8%), variant 32,907
(11.6%), wrong with the lemma listed 27,341 (9.6%), wrong 7,268 (2.6%),
nothing 1,363 (0.5%). The wrong first results are 34,609 words, **9.39%** of
the list's words (35,666, 9.67%, without the exceptions, which were chosen
on 26 of these 33 files). The largest groups, by the first result's trace:
the word's own entry 14,620 (`τῷ` 1,349, `τῇ` 904, `τοι` 611), `pronoun`
4,318 (`οἱ` → `οὗ` 2,624), the dictionary's "genitive singular" 2,231
(`τοῦ` → `-κτόνος` 1,978), "dative plural" 1,570 (`τοῖς` 1,491), `εἶναι` →
`εἶμαι` 721; Known gaps has them.

### 3. Words after an article, pronoun, particle or εἰμί

`measure.py behind <hover.tsv>`, the real-text lookups whose previous word
the treebank tags as an article, a pronoun, a particle (or οὐ, μή, ἄν) or
a form of εἰμί:

| previous word | lookups | right | variant | wrong first | nothing |
| --- | ---: | ---: | ---: | ---: | ---: |
| article | 7,809 | 6,369 | 281 | 803 (10.3%) | 356 |
| pronoun | 5,263 | 4,061 | 388 | 586 (11.1%) | 228 |
| particle | 3,393 | 2,481 | 261 | 472 (13.9%) | 179 |
| εἰμί | 1,099 | 848 | 49 | 141 (12.8%) | 61 |

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
| right | 58,551 | 77.9% |
| variant | 3,575 | 4.8% |
| wrong, the treebank's lemma lower in the list | 6,355 | 8.5% |
| wrong, the treebank's lemma not in the 16 | 3,457 | 4.6% |
| nothing | 3,234 | 4.3% |

The wrong first results, 9,812 (13.1%), by the trace of the first result:
the word's own entry (`as written`) 3,465 (`τῷ` 344, `τῇ` 283 for the
article; `ἐν` 159, which the treebank's Herodotus lemmatizes as εἰς),
`pronoun` 1,130 (`οἱ` → `οὗ` 653), the dictionary's "genitive singular"
641 (`τοῦ` → `-κτόνος` 567), "third-person plural future imperfective
active" 256 (`εἶναι` → `εἶμαι`), "dative plural" 240 (`τοῖς` → `-κτόνος`
234), `article` 148 (`τὰ` → `ὁ` where the treebank has the relative),
`gen-pl` 129 (`Μήδων` → Μῆδος, `βαρβάρων` → βαρβάρα), "nominative/vocative
plural masculine" 99 (`σοι` → `σός`), "vocative singular masculine" 94 (`σε`
→ `σός`), `nom-pl` 92 and `acc-pl` 80 (the treebank's plural lemmas
`Ἴωνες`, `Δελφοί`), `acc-sg` 82.

**The exceptions**, chosen without these seven files (`measure.py compare
<hover.tsv> --other <the pack without the transform exceptions>`): 173 first
results change. 163 become the treebank's lemma, 17 of them `ἔλεγον`, the
form added by hand; 3 stop being it (`ἐμοῦ` ×2, where the treebank has the
possessive, and `βοῶν`); 7 change between two wrong words. Without them the
wrong first results are 9,973 (13.3%).

**Rules against the dictionary alone** (`measure.py rules`: the same pack
without rules, its processors and wty-grc-en's form-of rows only). The rules
make 5,836 real-text lookups right that the dictionary alone gets wrong, and
354 (0.47%) wrong that it gets right; for the frequent forms 14,106 and 907
words (0.25%). Among equal readings the engine puts the term found first
first, and a rule finds its term before the dictionary's references are
followed (`docs/languages.md` 9.6, 9.10), so a rule that reaches a rarer
word reorders the dictionary's equals. `measure.py rules --forms 60` lists
the forms; the largest are in Known gaps.

**Traces** (`measure.py traces`): of the 8,098 right first results whose
first step is a case, the case and number agree with the treebank's tag for
7,568; the 530 others are mostly neuter nominatives labelled accusative
(`ὅσιον` 30, `δίκαιον` 12) and ambiguous forms.

**By hand**, the 60 wrong first results the script samples with seed 1:

- 16 are the article and pronoun ties (`τοῦ` → `-κτόνος` ×8, `οἱ` → `οὗ`
  ×3, `σοὶ` and `σε` → `σός` ×3, `εἶναι` → `εἶμαι` ×2);
- 13 are own entries of homographs (`τῷ` "then" ×4, `εἶ` "the letter
  epsilon" ×2, `αὐτοῦ`, `χρόνῳ` "eventually", `ὃ`, `τοι`, `δύναιτο` of δύνω,
  `ταύτῃ`, `μόρον` "mulberry");
- 13 are the dictionary's own entry or headword for the form under its
  conventions: `μέγιστα`, `ὅπερ`, `τί`, `οὐδέν`, `ἀτρεκέως`, `δεῖ`, the
  participle ὤν (`ὄντες`, `ἐόντα`), the plural pronoun ὑμεῖς (`ὑμᾶς`), οὗ
  for ἕ (`οἱ`), `ὃ` → ὅ, `ἐρασθείς` → ἐράω, `ἴτ’` → ἴτε (whose definition
  names εἶμι);
- 3 are treebank conventions or errors where the pack is right
  (`Κερκυραίους` → Κερκυραῖος for Κερυκυραῖος, `ἐν` → εἰς, `εἴρετο` →
  ἔρομαι);
- 2 are the same word written otherwise (`θανεῖν` → θνῄσκω, `οὔ`);
- 4 are a right reading of an ambiguous form, not the one in context
  (`Ἀττικήν` → Ἀττικός, `εὐθύνας` → εὐθύνω, `Περσικῆς` → Περσικός, `ὅττι` →
  ὅστις);
- 9 are wrong readings or orders the rules make (`χρῶνται` → χράω before
  χράομαι, `βαρβάρων` → βαρβάρα, `σφᾶς` → οὗ before σφεῖς, `γεγενημένους` →
  γέγονεν, `Φυλήν` → φυλή before the name, `Ἀσίης` → Ἄσιος, `Φωκαίης` →
  Φωκαῖος, `ἐπεάν` → ἔπος, `ἥτ’` → ἧτα).

### 5. Performance

- **Native lookups** (`build/benchmark-lookup languages/grc/sources/benchmark-words.txt 6 --languages languages --language grc --term $D --json`,
  the 60 texts in 6 passes, the first dropped, three runs at load average
  43): p50 814-830 µs, p95 2.36-2.44 ms. The budget is 1 ms p50. The union's
  p50 is 821-850 µs.
- **WebAssembly** (`node languages/grc/sources/wasm.mjs <hachidori> $D 10`,
  Hachidori feat/multi-language 803f7b6e's prebuilt engines, Node 22, the
  dictionary paged):
  - `hdw_language_load`: median 27.5 ms single-thread and 30.6 ms threaded
    over 10 fresh engines (budget 50 ms);
  - live heap after the load: +4,215,544 bytes (budget 20 MB);
  - `hdw_lookup` on the 60 texts: p50 1.50 ms and p95 4.37 ms
    single-thread, p50 1.58 ms and p95 4.75 ms threaded.
- **Patterns**: 18 `pattern` rules, 12 in `accent` (antepenult) and 6 in
  `reduplication-preverb`; they take 93,336 bytes of the heap (the load
  without them: +4,122,208 bytes). No processor has a pattern.
- `tests/` and `sources/` hold 984,399 bytes; the largest TSV is
  `corpus.tsv` with 902 rows.

### 6. Commands and checks

```sh
D=imported/wty-grc-en
A=<treebank texts>
REAL=tlg0003.tlg001.perseus-grc1.1,tlg0540.tlg001.perseus-grc1,tlg0540.tlg014.perseus-grc1,tlg0059.tlg001.perseus-grc1,tlg0016.tlg001.perseus-grc1.1,tlg0011.tlg002.perseus-grc2,tlg0020.tlg002.perseus-grc1
# rules: exceptions, own, case maps, final set
python3 languages/grc/sources/measure.py exceptions $A --exclude $REAL --min 10 --dictionary $D > languages/grc/sources/exceptions.tsv
node languages/grc/sources/own-rules.mjs
node languages/grc/sources/case-maps.mjs
node languages/grc/sources/build-final.mjs
node tools/merge-transforms.mjs grc --out union.json
# corpus (inputs of Sources and licences)
python3 languages/grc/sources/build-corpus.py unimorph-grc $A <unzipped wty-grc-en> > sample.tsv
python3 languages/grc/sources/split-corpus.py sample.tsv build/hoshidicts-cli
# rule sets, per rule, untaggedTerms pass
build/hoshidicts-cli [--languages <copy>] eval-language grc <file> --transforms <set> --dictionary $D [--per-rule]
# real text (lookup-batch.cpp built as its header says)
python3 languages/grc/sources/make-hovers-agdt.py out $A/tlg0003.tlg001.perseus-grc1.1.tb.xml \
  $A/tlg0540.tlg001.perseus-grc1.tb.xml $A/tlg0540.tlg014.perseus-grc1.tb.xml $A/tlg0059.tlg001.perseus-grc1.tb.xml \
  $A/tlg0016.tlg001.perseus-grc1.1.tb.xml $A/tlg0011.tlg002.perseus-grc2.tb.xml $A/tlg0020.tlg002.perseus-grc1.tb.xml
python3 languages/grc/sources/measure.py text out/hover.tsv --dictionary $D --sample 60
python3 languages/grc/sources/measure.py behind out/hover.tsv --dictionary $D
python3 languages/grc/sources/measure.py frequent $A --dictionary $D
python3 languages/grc/sources/measure.py rules out/hover.tsv --dictionary $D --forms 60   # and with $A for the frequent forms
python3 languages/grc/sources/measure.py traces out/hover.tsv --dictionary $D
python3 languages/grc/sources/measure.py compare out/hover.tsv --dictionary $D --other <languages dir with another pack> [--trace nominalization]
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
  transforms, 14,497 rules, 9 preprocessors; `classes.json` agrees (7
  classes, 113 fields, no step); `yomitan.tsv` 59/59, `corpus.tsv` 902/902,
  `cases.tsv` 508/508, `defaults.tsv` 8/8 with the defaults, `text.tsv`
  18/18, `lookup.tsv` 19/19 with the defaults, `gaps.tsv` 0/98; every own
  and both transform has a passing row. The full `ctest` passes, 55 of 55,
  on main 5ac86a3.
- **Traces in the tests.** The 40 `trace` rows of `cases.tsv` give their
  reasons (`λόγους` → λόγος `acc-pl`, `ἔλυσα` → λύω
  `accent|augment|aorist|ind-act-1sg`, `δίκα` → δίκη `doric-alpha`,
  `ἔλεγον` → λέγω `exceptions`), so a renamed transform or a lost path
  fails a test.
- **Lookups in the tests.** `tests/lookup.tsv` looks 19 texts up in
  `tests/dictionary/` (34 rows written for the pack, tagged as wty-grc-en
  tags them) and pins first results: the declension order (`φίλων`), -ομαι
  before -ω (`ἕποντο`), δύναμαι's accented augment (`ἐδύνατο`, beside a
  form-of row δύνω → δύω), the relative `ἥ`, `πολέμου` → πόλεμος,
  `untaggedTerms` (`τούτοισι`), `μόρῳ`, `μάθω`, `ἀλλά`, `νύχθ’`, the
  exceptions and the comparison of ἐχθρός and αἰσχρός.
- **Differential check** (`tools/check-yomitan.mjs`): rules 2,631 inputs,
  5,924 Yomitan results, 0 differences; processors `decapitalize` (4,951
  inputs), `capitalizeFirstLetter` (5,346), `removeAlphabeticDiacritics`
  (2,056), `convertLatinToGreek` (2,588), 98 listed differences, 0
  unexplained. `sources/yomitan-differences.tsv` lists the listed ones: a
  capital sigma with no letter before it (`Σ.` gives `ς.` here, `σ.` in
  JavaScript, whose Final_Sigma also skips apostrophes and full stops).
- **Mutation checks.**
  - `sources/mutate.py`: 0 of 57 constraint removals pass every test.
  - The first audit's 53 mutations (its `mymutate.mjs`): 48 fail a test,
    2 change nothing (the ξυν- and -γε rules they remove no longer exist),
    and 3 pass: two remove a processor step that a later processor repeats
    (NFC and the diacritic strip, which `convertLatinToGreek` also does;
    `check-yomitan` catches the second), and one the `θω` → `ω` pair of
    `aorist-passive`, which the pairs for -ηθ-, -υθ-, -σθ- and the other
    stems repeat for every verb of the tests.
  - The second audit's 14 mutations (its `mymutate2.mjs`; its Yomitan
    dative mutation adds the transform back): 10 fail a test. Of the 4 that
    pass, `acc-pl` after `gen-sg` changes only traces; the σ-stem accusative
    `η` → `ης` makes the deinflection the first-declension vocative makes
    (`ἔτη` → ἔτης); the comparatives read as their positives are reached by
    the generic comparison rules too; and the -ω/-ομαι mutation reverses
    rule rows, which leaves the order of the pairs inside each row: swapping
    the order in `own-rules.mjs` fails `lookup.tsv` (`ἕποντο` → ἕπω).
  - Removing the transform `exceptions` fails `cases.tsv` (`ἔλεγον`) and
    `lookup.tsv`.
- **Hachidori** (feat/multi-language 803f7b6e with this branch in
  `third_party/hoshidicts`, `node scripts/sync-languages.mjs`, then
  `node test/chrome-language-pack.mjs` with wty-grc-en.zip and 11 cases of
  real sentences), at 441dd82: 15 checks pass and none fails, among them
  ξυνέγραψε → συγγράφω (with the trace of Known gaps), ἄειδε → ἀείδω,
  ἔπεμψαν → πέμπω, γένοιτ’ → γίγνομαι, the Anki note and the switch to
  Japanese and back.

## Known gaps

- **Forms the rules do not reach**, the 98 rows of `gaps.tsv`:
  - 31 Epic and Ionic verb forms: unaugmented and thematic forms of
    irregular verbs (`δίδον`, `τίθεντο`, `ἴδεν`, `κίχον`, `λέκτο`, `ἤια`),
    iteratives in -σκε (`ἀποκρύπτασκε`), infinitives in -έμεν (`εἰπέμεν`),
    -μεσθα, -αται, apocope (`κάββαλε`), the digamma's augment (`ἑήνδανεν`);
  - 11 irregular stems of Attic verbs that the lists lack (`ὦπται`,
    `κεχολώσομαι`, `ἀπώσεσθε`, `ἐξευρεθῆναι`);
  - 3 verbs with two preverbs (`ἀποκατέστησαν`, `ὑπανεχώρουν`,
    `προκατειληφέναι`);
  - 28 participles: 11 of compounds with irregular aorists (`παραγαγών`,
    `ἀνενειχθέντων`, `καθελοῦσι`), 15 with Epic, Ionic or Doric stems
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
- **Wrong first results the rules cause**, largest first (`measure.py rules
  --forms 60`: frequent-form words / real-text lookups where the dictionary
  alone puts the treebank's lemma first; 907 words in 163 forms, 354 lookups
  in 207 forms):
  - genitive plurals of nouns and participles read as another noun's:
    `ἀνέμων` → ἀνέμη 36 / 4, `Αἰγυπτίων` → Αἰγυπτία 11 / 3, `ἰχθύων` 10,
    `θύων` → θύον 9, `νέμων` 9, `ἕλκων` 8, `πίνων` 8, `ἀδίκων` → ἀδίκη 4,
    `Εἱλώτων` 3;
  - the plural name Δελφοί read as Δελφός: `Δελφοὺς` 23 / 19, `Δελφοῖσι`
    10 / 10;
  - the treebank's τις for the interrogative and ὅτι for Epic ὅττι: `τίνα`
    and its cases → τίς 39 / 8, `ὅττι` → ὅστις 40 / 3;
  - neuters and feminines of adjectives read as nouns: `βαρεῖαν` → βαρεῖα
    10, `ὑστεραίᾳ` 11, `ἀξίαν` 7, `τροπαῖον` → τροπαῖος 8 / 7;
  - verb forms read as nouns or other verbs: `τύχῃ` → τύχη 13 / 3,
    `πυθόμενος` and `πύθηται` → πύθω 18 / 4, `τίσασθαι` and `ἐτίσατο` → τίω
    16, `πάθοι` → πάθος 8, `ἀξίους` → ἀξιόω 7 / 5, `λελύσθαι` → λύζω (6
    lookups);
  - elided forms restored to another word: `ἴσθ’` → ἴστε 11 / 3, `ἵκεθ’`
    and `ἱκόμεθ’` → ἵκω 17;
  - two words read as one through a form-of row that has the article:
    `τὴν παῖδ’` → παῖς, `τὴν φυλακὴν` → φύλαξ (13 lookups).

  Each needs the right word to be found by a rule first, a constraint that
  tells the forms apart, or another exception; the exceptions list stops at
  10 tokens net.
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
  lookups; 1,349 frequent-form words), `τῇ` "here; there" (283; 904), `τοι`
  "let me tell you" for σύ (611 frequent-form words), `αὐτοῦ` "here, there"
  for αὐτός, `τάδε` "on this account" and `τόδε` "hither" for ὅδε, `οἷα`
  and `οἵα` → οἶος "alone" for οἷος, `εἶ` the letter epsilon.
- **Ambiguous forms** keep the engine's order: `τύχῃ` is τύχη's dative and
  τυγχάνω's subjunctive; `ἐμοῦ` is also ἐμός's genitive (the exception puts
  ἐγώ first, so 2 real-text lookups of the possessive are wrong now).
- **Traces.** A result can have the right headword with the trace of another
  form, when the rules' text without accents equals the key of another
  form-of row: `ξυνέγραψε` (3rd singular aorist) shows συγγράφω with the
  trace "spelling, imperative active 2nd singular, second-person singular
  indicative middle", through the row of συνεγράψω.
  Among equal terms the shortest trace wins (`traceSelection: shortest`),
  and the path through that row is shorter than the right one (accent,
  augment, aorist, indicative active 3rd singular, spelling).
- **Part of speech.** The accent rules give `n` and `adj` whatever they
  read, so a feminine adjective's form can reach a masculine noun: `ἀρχῇ` →
  `ἀρχός` (after `ἀρχή`, which comes first), and a contract verb a noun:
  `θακεῖ` "sits" → θᾶκος "seat" (θακέω is not reached). Words that
  wty-grc-en lists with no part of speech (οἷος) are not reached by the
  case rules, whose outputs carry `n` or `adj`.
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
