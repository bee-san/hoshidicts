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
  others (categories: `um-n`, `um-adj` for UniMorph, `tb-v`, `tb-ptc`, `tb-n`,
  `tb-adj` and smaller ones for the treebank):
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
  `sources/exceptions-manual.tsv`: forms, terms and tags written for this
  pack (GPL-3.0-or-later).
- `tests/cases.tsv`, `tests/defaults.tsv`, `tests/text.tsv`,
  `tests/lookup.tsv` and the dictionary of `tests/dictionary/` (its glosses
  too; a few one-word glosses such as "the" or "year" are also wty-grc-en's):
  written for this pack (GPL-3.0-or-later); the `exc` rows at the end
  of `cases.tsv` are written by `sources/exception-cases.mjs`.
  `language.json`'s sample is John 1:1 (public domain) with a gloss written
  for the pack.
- `tests/classes.json`: written by `tools/check-classes.mjs`.
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
  - **Benchmark texts**: 60 texts of at most six words from an inflected
    word of the real text, sampled with seed 1 by `sources/measure.py
    benchmark`; not committed, which keeps `tests/` and `sources/` under
    1 MB.
  - Hachidori feat/multi-language at 803f7b6e, for the WebAssembly numbers
    and the Chrome check.

## Rule provenance

`transforms.json` has 244 transforms and 14,639 rules
(`sources/build-final.mjs`):

| source | transforms | rules |
| --- | ---: | ---: |
| `own` | 242 | 14,594 |
| `both` (rules marked in own transforms) | 0 | 43 |
| `yomitan` | 2 | 2 |

- **`both`**: 50 of Yomitan's 55 rules make a deinflection an own rule makes:
  the same ending replaced by the same text, on a text without conditions,
  with a part of speech in common, in the own transform of the same form
  (`ind-act-2sg` for "2nd person singular present active indicative",
  `gen-sg` for "genitive singular"). The 43 own rules they repeat are marked
  `both` (several Yomitan rules repeat the same own rule: its vocative plural
  is its nominative plural), and 49 of the 50 Yomitan copies are left out:
  the own rule reads the same text, with a trace that names the form. Where
  the own rule has a constraint that Yomitan's lacks, the own rule is the
  measured choice: the first declension's genitive plural `ων` → `η`, `α`,
  `ης`, `ας` reads a noun only after a stem without an accent (Own rules),
  so the union's `ἀνέμων` → ἀνέμη is gone. `sources/yomitan-provenance.tsv`
  lists every Yomitan rule with the own transforms that repeat it.
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
    `οἶκος` → `οἰκέω`) and 2 of `yomitan.tsv`, adds 6 false candidates on
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
  their rows of `yomitan.tsv` stay positive. `cases.tsv` pins `α` → `ας`:
  `χώρα` does not reach `χώρας` with the trace `dative singular`.
- **The 49 repeated rules and the four above, left out together** (union →
  final): corpus recall 0.902 and first rank 0.907 in both; `cases.tsv`
  negatives passed 66/77 → 77/77. The union breaks nominalization's 4, 6
  through repeated rules without the own rule's stem minimum (`τοῦ` →
  `τός`, `ἄν` → `α`, `αἱ` → `η`, `ὧν` → `η`, `αἷς` → `η`, `ἅς` → `η`) and
  `χώρα` → `χώρας` through `α` → `ας`; Yomitan's genitive `ου` → `ας` and
  vocative `ε` → `ος` add a false candidate each there. In real text 125 of
  the 75,172 first results change: 79 become the treebank's lemma, 28 stop
  being it, 18 neither. The lookup p50 goes from 780-792 to 754-764 µs.

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
  τίθημι, ἵστημι, ἵημι, δείκνυμι and their compounds form by form. δύναμαι
  and ἐπίσταμαι have the recessive accent editions print (`δύνηται`,
  `δύνωνται`, `δύναιτο`, `ἐπίστηται`); written with the accent on the ending,
  the printed forms were read by the thematic subjunctive as δύνω, which
  wty-grc-en lists as an alternative of δύω "sink" (`lookup.tsv` pins
  `δύνηται`).
- **Nouns and adjectives**: case endings of the three declensions with Epic
  and Ionic forms, the feminine and neuter of adjectives, comparison, adverbs
  in -ως, and the irregular nouns. The nominative, accusative and vocative
  dual (`nav-du`) is optional (setting `duals`): its endings are those of
  common singular and verb forms (μάθω, ἔλαβε, which it read as μάθος and
  ἔλλοψ). A first-declension noun's genitive plural is always -ῶν (γνωμῶν,
  πολιτῶν), so `-ων` after an accented stem reads only as the feminine of an
  adjective (ἀξίων, φίλων); a noun's `-ων` needs a stem without an accent,
  as the removeAccents variant of `-ῶν` or a text without accents gives it.
  This keeps `ἀνέμων`, `Αἰγυπτίων` and `ἀδίκων` from ἀνέμη, Αἰγυπτία and
  ἀδίκη (`lookup.tsv` pins `ἀνέμων`). `οὖσα` is εἰμί's participle, not the
  plural of the rare οὖσον "ship's tackle": a stem constraint, which
  `lookup.tsv` pins.
- **Closed classes**: the article, pronouns, numerals and irregular
  adjectives as whole words; a form of four letters or more is a suffix rule,
  which also reads it after crasis. A comparative or superlative that is a
  dictionary form of its own reads as it (`ἀμείνονος` → ἀμείνων, `πλείους`
  → πλείων, `μεγίστη` → μέγιστος; `lookup.tsv` pins `πλείους`), another as
  its positive (`καλλίονα` → καλός). The comparatives in -ίων and
  superlatives in -ιστος of ἐχθρός, αἰσχρός and οἰκτρός, which lose the ρ,
  are whole words too; generic rules read them as the noun of the bare stem
  (`ἔχθιστος` → ἔχθος "hatred", `αἴσχιστον` → αἶσχος "shame"), which now
  comes second.
- **Clitics and spelling**: elision (restored with and without accents;
  θ’, φ’, χ’, χθ’ and φθ’ before a rough breathing), elided prepositions and
  particles, crasis (κἀγώ, τοὔνομα, χὠ), the enclitic's second accent
  (`enclitic-accent`: ἄνθρωπός τις), `ποτε` → ποτέ, -περ, ξυ- for συ-
  (which covers ξυν-, ξυμ-, ξυγ-, ξυλ- and ξυσ-; `cases.tsv` pins the
  capital Ξυ-), -ττ-/-σσ-, γιν- for γιγν-, and the optional Doric ᾱ for η
  (setting `doricAlpha`).
- **Exceptions** (the transform `exceptions`, 331 rules for 166 forms).
  Among equal readings the engine puts the term found first first. It reads
  the text without diacritics and without accents before the text as
  written, and in each it finds a rule's term before the terms the
  dictionary's form-of rows name. So some common forms showed a rarer word
  first: ἔλεγε as ἔλεγος "song of mourning", ἐμοῦ as ἐμός, ἔτη as ἔτης
  "kinsman". An exception is a whole word as written and without accents,
  read as the term the dictionary alone puts first; the spelling without
  accents is the one found early, and the transform's position does not
  matter (moving it to the end changes no real-text first result). A third
  spelling without any diacritic changes none of the 299 real-text lookups
  of these forms as printed, and 17 of them written without diacritics (13
  to the treebank's lemma); it is left out to keep `tests/` and `sources/`
  under 1 MB. An exception cannot
  win when the other word's reading equals its headword and its own term's
  does not (wty-grc-en writes length marks: ἄνεμος `ᾰ̓́νεμος`); `ὀχέων` →
  ὄχεα, `ἆσαι` → ἄω, `νεῶν` → ναῦς, `δοίη`, `δοῖεν`, `δοίης` → δίδωμι,
  `πλέον` → πλείων and, without the third spelling, `σταθμῷ` → σταθμός lost
  that way and are not in the lists. The forms:
  - **The list** (`sources/exceptions.tsv`, 76 rows, written by `measure.py
    exceptions`, which regenerates it byte for byte): from the frequency
    list of the 26 treebank files outside the real-text set, so that
    Measurements 4 is held out for them, the 62 forms whose first result the
    rules (all but this transform) turn from right to wrong for at least 10
    tokens net, and 14 more with a net loss from the same collisions
    (`φίλας` beside `φίλην`). Half of those files' words are Homer's
    (Aeschylus 10%, Athenaeus 10%, Sophocles 9%, Polybius 6%, Diodorus 5%,
    Plutarch 5%). Two forms of the list fit Homer only and are left out
    (`EXCEPTIONS_LEFT_OUT` in `own-rules.mjs`): `ἄκουσα` and `ἄκουσαν`,
    Homer's unaugmented aorist of ἀκούω, are in Attic the feminine of ἄκων
    "unwilling", which the rules read.
  - **By hand** (`sources/exceptions-manual.tsv`, 92 forms, chosen from the
    third and fourth audits and `measure.py rules --forms` and `--changed`
    on the whole treebank, so in-sample for Measurements 4). The third
    audit's 67 have at least 2 treebank tokens: forms the judge cannot see because the treebank's lemma
    is another headword (`εἴρηται` → λέγω for the treebank's ἐρῶ, `πλεῖον` →
    πλείων, `καλῇ` → καλός, `οἰῶν` → οἶς, `μῆνα`, `μῆνας`, `μηνῶν` → μείς);
    forms under the list's threshold (`ἔλεγον`, `πείσας`, `χίλια`, `κοτε`,
    `σώσας`); εἰμί's compound participles, which other rules read as πείρω
    (`παρόντων`, `παρούσης`, `παρούσῃ`, `παρουσῶν`, `παρούσας` → πάρειμι);
    ᾍδης with the iota adscript of capitals (`Ἅιδου`, `Ἅιδης`, `Ἅιδην`,
    `Ἅιδα`, `Ἅιδαν`, `Ἅιδας`); πυνθάνομαι's aorist πυθ-, which other rules
    read as the rare πύθω "rot" (`πυθόμενος`, `ἐπύθετο`, `πύθηται`,
    `πυθέσθαι` and 9 more); and the largest unambiguous losses of `rules
    --forms` (`ἰχθύων`, `βαρεῖαν`, `τύχοι`, `νέμων`, `ἕλκων`, `τίσασθαι`,
    `πάθοι`, `ὄρουσαν`, `φανῇ`, `τυράννων`, `δικαίῳ`, `ἀξίους`, `ὥρμησεν`,
    `δήσας`, `ἐτέων`, `ἔασε`, `λελύσθαι`, `δυῶν`, `Λυκίους`, `Ἶριν`, `ἴσθ’`,
    `ἵκεθ’`, `ἱκόμεθ’`, `τροπαῖον` and 7 more forms of them). The fourth
    audit's 25 are Ionic and Epic words other rules read as an unrelated
    word where the dictionary alone has nothing (`ἐπείτε` → ἐπεί, not
    ἔπειμι; `ἐπεάν` → ἐπήν, not ἔπος; `Ἀσίην`, `Ἀσίης` → Ἀσία; `Τροίην`,
    `Τροίης` → Τροία, not τρέω; `νέες` → ναῦς, not νέω; `ζῶσι`, `ζῶσιν` →
    ζῶ, not ζέω; `πλοῦν` → πλόος; `μέσσον` → μέσος; `Ἀθηναίης`, `Ἀθηναίην` →
    Ἀθηναία; `ἐπειρέσθαι` → ἐπέρομαι, not πείρω; `ἑσσωθέντες` → ἡσσάομαι;
    `Ἀΐδαο`, `Ἀίδαο` → ᾍδης; `Ὀδυσεῦ` → Ὀδυσσεύς; `ἐΐσην` → ἴσος) and
    cards in held-out Herodotus (`στάδιοι` → στάδιον, `μέσα`, `μέσας` →
    μέσος, `ἐπυθόμην`, `ἐπυθόμεθα`, `πυθομένους` → πυνθάνομαι).

  Every exception shows its term first (166 of 166). The trace of such a
  result is the single step "common form". One transform per form label
  ("third-person singular imperfect active indicative") named the form, but
  its 83 transform headers took 31 KB and pushed `tests/` and `sources/` over
  1 MB. `cases.tsv` has one `exc` row per form, with the trace `exceptions`,
  and three negatives that keep the whole words whole
  (`exception-cases.mjs` writes them).
- **Order.** Among equal readings the one a rule finds first comes first
  (Measurements 4), so the order of the rules is a choice: a middle form's
  -ομαι lemma comes before its -ω lemma, for thematic and contract verbs
  (`ἕποντο`, `ἕπεται` → ἕπομαι; `μηχανῶνται` → μηχανάομαι, not μηχανάω),
  which `tests/lookup.tsv` pins for both. The second declension still comes before
  the first in each case transform, but since a noun's genitive plural -ων
  needs an unaccented stem, putting the first declension first changes no
  real-text first result. The accusative plural before the genitive
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
  rank rises on the corpus only (0.907 → 0.909) and the false candidates
  rise on seven of the eight file and option pairs. In real text 616 first
  results change: 295 become the treebank's lemma, 148 stop being it, 173
  neither. `pass` finds something for 283 more lookups (3,234 → 2,951 with
  nothing), mostly a wrong word, and puts untagged rows before tagged ones
  (`τούτοισι` → τοῦτος, `ἀπόρους` → ἀπόρως, `Φοινίκων` → Φοινίκη); the wrong
  first results rise from 9,485 to 9,784, and the frequent forms' wrong
  first words from 33,698 to 34,655. `tests/lookup.tsv` pins `filter`
  (`τούτοισι` → οὗτος).
- **Stem constraints.** `sources/mutate.py` removes each of the 59 stem
  constraints of the final set (a transform's `stemMinLength`,
  `stemCharacters`, `stemContains`, `stemNotStartsWithText`, ...) in a copy;
  every removal breaks a row (`constraint` negatives of `cases.tsv`, the
  `exc` negatives for the exceptions' whole words, `lookup.tsv` for the
  unaccented stem of the genitive plural and for `οὖσα`). The stem minimums
  that only blocked right readings (`ξύν` → `σύν`, `κοὐ` → `οὐ`, `χὠ` →
  `ὁ`) or changed nothing (`unaugmented`) were removed, and that of -σπερ
  lowered to one letter (`ὅσπερ` → `ὅς`).

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
  `defaults.tsv`, `μάθω` in `lookup.tsv`, two constraint negatives) and
  change 150 of the 75,172 real-text first results: 74 stop being the
  treebank's lemma, 9 become it, 67 neither; wty-grc-en's form-of rows read
  diacritic-free text;
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
  lemma as wrong. Against the same pack without rules, with this judge:
  frequent-form tokens the rules turn from right to wrong 907, real-text
  lookups 354;
- after the third audit (reports/audit-hachi-lang-grc-c.md), in `grc: fixes
  after the third audit`: δύναμαι's and ἐπίσταμαι's recessive subjunctive
  and optative; the first declension's genitive plural; `οὖσα`; -ομαι first
  for contract middles; the exceptions chosen by hand, and `ἄκουσα` and
  `ἄκουσαν` out of the list; `lookup.tsv` rows for the orders, `πλείους`,
  `δύνηται`, `οὖσα` and `ἀνέμων`; a judge that also ignores the iota
  subscript and reads a word's own entry after grave to acute; `measure.py
  rules --changed` for the forms the judge cannot see; shorter corpus
  category names and the benchmark texts generated, not committed, for the
  1 MB limit. Against the same pack without rules: frequent-form tokens the
  rules turn from right to wrong 619, real-text lookups 262;
- after the fourth audit (reports/audit-hachi-lang-grc-d.md), in `grc: fixes
  after the fourth audit`: 25 exceptions for Ionic and Epic words the rules
  turned from no result into an unrelated word; a `lookup.tsv` row for the
  contract middles' order; `measure.py rules --changed` counts the lookups
  the rules turn from no result into a wrong word (1,065 real-text lookups
  before these fixes, 996 after); one copied gloss of the test dictionary
  reworded; shorter script headers for the 1 MB limit. Against the same pack
  without rules: frequent-form tokens the rules turn from right to wrong
  615, real-text lookups 258.

## Measurements

All with wty-grc-en as published (form-of rows included), on one machine
(GCC 14.3 Release, load average 17-36). `D` is the imported dictionary
(`build/hoshidicts-cli import wty-grc-en.zip`). A lookup is a host's hover:
the text from the word to the end of its sentence, 16 results, scan length
16, default options.

**The judge** (`sources/measure.py`). Every token is judged against its own
treebank lemma (sense digits removed). It reads a result's definitions, the
glosses wty-grc-en lists, without the grammar and etymology notes, example
sentences and related words (`lookup-batch`'s `gloss`):

- *right*: the first result is the lemma;
- *variant*: the same word written otherwise, with other accents,
  vowel-length marks, an iota subscript (σῴζω, σώζω) or capitals (not
  another breathing, which makes another word: οἷος, οἶος), when the lemma
  as the treebank spells it is not among the results or the first result's
  definitions name it (`πέρι` "initial-stressed form of περί"); or the
  dictionary's own entry for the word as written (after grave to acute)
  whose definitions name the lemma or say it is the word elided or
  contracted (`δ'` "apocopic form of δέ", `ἐστιν` "third-person singular …
  of εἰμί");
- *wrong*: another lemma; an accent homograph of a lemma that is listed
  (`ἐτῶν` → ἐτός "in vain" for ἔτος "year", `Κύπρον` → κύπρος "henna"); or the
  word's own entry for another word (`τῷ` "then", `τῇ` "here" for the
  article; `τοι` "let me tell you" for σύ; `αὐτοῦ` "there" for αὐτός).
  "Listed" when the lemma is among the 16 results.

This judge is stricter than the one before the second audit, which credited
a definition that named the lemma in its etymology and any accent variant,
but did not read lemmas written with length marks (`εἰμῐ́`) or own entries
of a word written with a grave. With that judge (and its `lookup-batch`) the
final pack's wrong first results are 9,492 in real text (12.6%) and 32,978
frequent-form words (8.94%); with this one, 9,485 and 33,698. The judge has
two blind spots. When the treebank's lemma is a headword other than the one
the dictionary alone shows (εἰμί for `οὖσα`, where wty-grc-en shows the
participle ὤν), both cards count as wrong; and when the dictionary alone
shows nothing, a rule's wrong card counts as no loss. So a rule can make
such forms worse without `measure.py rules` counting it; `measure.py rules
--changed` lists both kinds for judging by hand (Known gaps).

### 1. Rule sets

`hoshidicts-cli eval-language grc <file> --transforms <set> --dictionary $D`.
`corpus+gaps` is `corpus.tsv` followed by the rows of `gaps.tsv`. "all" is
the file as it is (every option on), "default" a copy with
`# options: default` added (removed for `defaults.tsv`). Recall / negatives
passed / false candidates per positive row / first rank:

| file | options | own (`sources/own.json`) | Yomitan (`sources/yomitan.json`) | union | final |
| --- | --- | --- | --- | --- | --- |
| corpus+gaps (1,000) | all | 0.901 / – / 0.769 / 0.906 | 0.100 / – / 0.344 / 0.780 | 0.902 / – / 0.770 / 0.907 | **0.902** / – / 0.769 / 0.907 |
| corpus+gaps | default | 0.875 / – / 0.740 / 0.906 | 0.100 / – / 0.332 / 0.781 | 0.889 / – / 0.742 / 0.906 | 0.876 / – / 0.740 / 0.907 |
| cases (680) | all | 1.000 / 1.000 / 1.882 / 0.902 | 0.010 / 0.922 / 0.907 / 0.701 | 1.000 / 0.857 / 1.897 / 0.902 | 1.000 / 1.000 / 1.882 / 0.902 |
| cases | default | 0.988 / 1.000 / 1.799 / 0.902 | 0.010 / 0.922 / 0.861 / 0.701 | 0.988 / 0.857 / 1.819 / 0.902 | 0.988 / 1.000 / 1.799 / 0.902 |
| yomitan (59) | all | 1.000 / 1.000 / 2.491 / 0.088 | 1.000 / 0.000 / 1.895 / 0.088 | 1.000 / 0.000 / 2.491 / 0.088 | 1.000 / 1.000 / 2.491 / 0.088 |
| yomitan | default | 0.965 / 1.000 / 2.368 / 0.088 | 1.000 / 0.000 / 1.772 / 0.088 | 1.000 / 0.000 / 2.368 / 0.088 | 0.965 / 1.000 / 2.368 / 0.088 |
| defaults (8) | default | 1.000 / 1.000 / 2.667 / 1.000 | 0.333 / 0.600 / 2.000 / 1.000 | 1.000 / 0.600 / 2.667 / 1.000 | 1.000 / 1.000 / 2.667 / 1.000 |
| defaults | all | 1.000 / 0.000 / 3.333 / 1.000 | 0.333 / 0.600 / 2.667 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 |

The final recall over corpus and gaps is 902 / 1,000 = **0.902** with every
option on; with the defaults it is 0.876, because 26 UniMorph duals need the
optional `duals`. One corpus row, `εἴπας` → εἶπον, is reached through the
exception for `εἶπας` written without accents. `cases.tsv` has 603 positive
and 77 negative rows, 166 of the positives `exc` rows. Yomitan's test is
mostly written without diacritics, which wty-grc-en has only for form-of
rows, so its first rank is low for every set; two of its rows (`ανθρωπω`,
`δωρω`) are Yomitan's datives without the iota subscript, which this pack
reads only as duals, an option. `defaults.tsv` with every option on fails
its negatives by design: `doricAlpha` reads `δίκαν` as `δίκη`,
`capitalizedNames` reads `ἀθηναίων` as `Ἀθηναῖος`, and `duals` reads
`ἔλαβε` as `ἔλαψ` and the two datives.

The final set with `lookup.untaggedTerms` `pass` (`--languages` a copy whose
descriptor says so):

| file | all | default |
| --- | --- | --- |
| corpus+gaps | 0.902 / – / 0.976 / 0.909 | 0.876 / – / 0.848 / 0.909 |
| cases | 1.000 / 1.000 / 2.307 / 0.902 | 0.988 / 1.000 / 2.070 / 0.902 |
| yomitan | 1.000 / 1.000 / 2.614 / 0.088 | 0.965 / 1.000 / 2.368 / 0.088 |
| defaults | 1.000 / 0.000 / 5.000 / 1.000 | 1.000 / 1.000 / 4.333 / 1.000 |

### 2. Frequent forms

`python3 languages/grc/sources/measure.py frequent <treebank texts> --dictionary $D`.
Of the 10,000 most frequent forms of the treebank (368,718 words), a rule
reaches a treebank lemma of 8,742 (284,736 words, 77.2%). Their tokens,
each judged against its own lemma: right 216,289 (76.0%), variant 33,386
(11.7%), wrong with the lemma listed 26,994 (9.5%), wrong 6,704 (2.4%),
nothing 1,363 (0.5%). The wrong first results are 33,698 words, **9.14%** of
the list's words (35,120, 9.52%, without the exceptions, whose list was
chosen on 26 of these 33 files). The largest groups, by the first result's
trace: the word's own entry 14,522 (`τῷ` 1,349, `τῇ` 904, `τοι` 611),
`pronoun` 4,318 (`οἱ` → `οὗ` 2,624), the dictionary's "genitive singular"
2,231 (`τοῦ` → `-κτόνος` 1,978), "dative plural" 1,570 (`τοῖς` 1,491),
`εἶναι` → `εἶμαι` 721; Known gaps has them. Forms whose treebank lemma no
rule reaches are not counted here, also when a rule shows a wrong word for
them (`διόπερ` → διό, 75 tokens; Known gaps).

### 3. Words after an article, pronoun, particle or εἰμί

`measure.py behind <hover.tsv>`, the real-text lookups whose previous word
the treebank tags as an article, a pronoun, a particle (or οὐ, μή, ἄν) or
a form of εἰμί:

| previous word | lookups | right | variant | wrong first | nothing |
| --- | ---: | ---: | ---: | ---: | ---: |
| article | 7,809 | 6,393 | 300 | 760 (9.7%) | 356 |
| pronoun | 5,263 | 4,073 | 399 | 563 (10.7%) | 228 |
| particle | 3,393 | 2,482 | 273 | 459 (13.5%) | 179 |
| εἰμί | 1,099 | 850 | 54 | 134 (12.2%) | 61 |

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
| right | 58,726 | 78.1% |
| variant | 3,727 | 5.0% |
| wrong, the treebank's lemma lower in the list | 6,252 | 8.3% |
| wrong, the treebank's lemma not in the 16 | 3,233 | 4.3% |
| nothing | 3,234 | 4.3% |

The wrong first results, 9,485 (12.6%), by the trace of the first result:
the word's own entry (`as written`) 3,443 (`τῷ` 344, `τῇ` 283 for the
article; `ἐν` 159, which the treebank's Herodotus lemmatizes as εἰς),
`pronoun` 1,130 (`οἱ` → `οὗ` 653), the dictionary's "genitive singular"
640 (`τοῦ` → `-κτόνος` 567), "third-person plural future imperfective
active" 256 (`εἶναι` → `εἶμαι`), "dative plural" 239 (`τοῖς` → `-κτόνος`
234), `article` 148 (`τὰ` → `ὁ` where the treebank has the relative),
"nominative/vocative plural masculine" 99 (`σοι` → `σός`), "vocative
singular masculine" 94 (`σε` → `σός`), `nom-pl` 88, `acc-pl` 74 and
"genitive plural" 78 (mostly the treebank's plural lemmas `Ἴωνες`,
`Δελφοί`), `gen-pl` 84 (`Μήδων` → Μῆδος, `Κερκυραίων` for the treebank's
Κερυκυραῖος), `acc-sg` 73, `exceptions` 72 (the treebank's ἐπειδάν for
`ἐπεάν` → ἐπήν ×14, its `̓Ασία` with a stray breathing for `Ἀσίης` ×8,
its ἐρῶ for `εἴρηται` → λέγω ×7).

**The exceptions** (`measure.py compare <hover.tsv> --other <the pack
without the transform exceptions>`): 409 first results change. 322 become
the treebank's lemma, 17 stop being it, 70 change between two wrong words.

- The 74 forms of the list, chosen without these seven files: 148 changes,
  139 to the treebank's lemma, 3 away from it (`ἐμοῦ` ×2, where the treebank
  has the possessive, and `βοῶν`), 6 neither.
- The third audit's 67 forms, in-sample: 138 changes, 102 to the treebank's
  lemma, 10 away from it, 26 neither. The 10 are treebank lemmas the forms
  rarely have: 5 πυθ- forms lemmatized as πύθω, 4 of which mean "learn" in
  Herodotus (`πυθόμενος τὸν Κροῖσον εἶναι θεοσεβέα`) while Hesiod's `πύθῃ
  Διὸς ὄμβρος` is πύθω; `εἴρηται` as εἴρω ×2; `τροπαῖον` as τροπαῖος ×2;
  `μηνῶν` as μήνη. The 26 are conventions: the treebank's ἐρῶ for `εἴρηται`
  ×8 and τροπαῖον for wty-grc-en's τρόπαιον ×7, σώζω for σῴζω, the elided
  `ἴσθ’` as εἰμί or οἶδα, Ionic `δυῶν` as δυό.
- The fourth audit's 25 forms, in-sample, and the forms other rules bring
  to an exception (the grave `ἐπεὰν`, `ἔλεγέ` with an enclitic's accent,
  crasis `κἀμοῦ`): 123 changes, 81 to the treebank's lemma (`ἐπείτε` ×45),
  4 away from it (`Ἀθηναίης` ×2, where the treebank has the adjective,
  `στάδιοι` as στάδιος, and one `ἐμοῦ` through crasis), 38 neither: the
  treebank's ἐπειδάν for `ἐπεάν` → ἐπήν (×14), its `̓Ασία` with a stray
  breathing (×13), Ἀθήνη for `Ἀθηναίης` (×5) and like conventions.

Without the exceptions the wrong first results are 9,806 (13.0%).

**Rules against the dictionary alone** (`measure.py rules`: the same pack
without rules, its processors and wty-grc-en's form-of rows only). The rules
make 5,963 real-text lookups right that the dictionary alone gets wrong, and
258 (0.34%) wrong that it gets right; for the frequent forms 14,546 and 615
words (0.17%). They also turn 996 real-text lookups (714 forms) and 1,907
frequent-form words (247 forms) from no result into a card the judge counts
wrong, many of them fair readings (Known gaps). Among equal readings the engine puts the term found first
first, and a rule finds its term before the dictionary's references are
followed (`docs/languages.md` 9.6, 9.10), so a rule that reaches a rarer
word reorders the dictionary's equals. `measure.py rules --forms 60` lists
the forms, and `--changed 40` the forms turned from no result into a wrong
card and the changes both of whose cards the judge counts wrong; Known gaps
has them.

**Traces** (`measure.py traces`): of the 8,091 right first results whose
first step is a case, the case and number agree with the treebank's tag for
7,561; the 530 others are mostly neuter nominatives labelled accusative
(`ὅσιον` 30, `δίκαιον` 12) and ambiguous forms.

**By hand**, the 60 wrong first results the script samples with seed 1:

- 15 are the article and pronoun ties (`οἱ` → `οὗ` ×6, `τοῦ` and `τοῖς` →
  `-κτόνος` ×7, `σοὶ` → `σός`, `εἶναι` → `εἶμαι`);
- 6 are own entries of homographs (`τῷ` "then" ×3, `τῇ`, `αὐτοῦ`, `τάδε`);
- 14 are the dictionary's own entry or headword for the form under its
  conventions (`ὕστερον`, `μεῖζον`, `ἡμέρας` as adverbs, `ὅσα`, `ὄντα`,
  `ὃ` → ὅ ×2, `οὐδέν` ×2, `ἤν` ×2 for ἐάν, `ἡμεῖς`, `ἰδών` → ὁράω,
  `ξυνέμεινεν`);
- 4 are the dictionary's form-of rows, the rules aside (`τώ` → τῷ "then",
  `γεγονός` → γέγονεν, `μή` → μήτι, `ὀργίων` → ὀργίζω);
- 8 are treebank conventions or errors where the pack is right
  (`ποιούμενοι` → ποιέω for ποιόω, `ἐγγύτατα` → ἐγγύς, `Κερκυραίων`,
  `μέγισται` → μέγιστος, `Κυψέλου` → Κύψελος, `ἕλκων` → ἕλκω for ἑλκόω,
  `ἀπορέοντος` → ἀπορέω for ἀπορρέω, `ἐδέξαντο` → δέχομαι for δείκνυμι);
- 7 are the same word under another headword (`ἱκετείαν` → ἱκεσία,
  `ἐστρωμένη` → στόρνυμι, `ὑπέροισι` → ὕπερος, `Δίκη`, `κἄξεστιν` →
  ἔξεστιν, `ἱέρ’` → ἱερά, `θυίουσιν` → θύω);
- 3 are a right reading of an ambiguous form, not the one in context
  (`Ἀττικήν` → Ἀττικός, `θεῶν` → θεός for θέα, `νεικέων` → νεικέω);
- 3 are wrong readings the rules make (`Μυσίῳ` → Μυσός, `παρήσομεν` →
  πείρω, `ὦτ’` → ὦτος).

### 5. Performance

- **Native lookups** (`build/benchmark-lookup <words> 6 --languages
  languages --language grc --term $D --json`, the 60 benchmark texts in 6
  passes, the first dropped, three runs): p50 754-764 µs, p95 2.25-2.29 ms.
  The budget is 1 ms p50. The union's p50 is 780-792 µs.
- **WebAssembly** (`node languages/grc/sources/wasm.mjs <hachidori> $D
  <words> 10`, Hachidori feat/multi-language 803f7b6e's prebuilt engines,
  Node 22, the dictionary paged):
  - `hdw_language_load`: median 26.2 ms single-thread and 29.1 ms threaded
    over 10 fresh engines (budget 50 ms);
  - live heap after the load: +4,253,312 bytes (budget 20 MB);
  - `hdw_lookup` on the 60 texts: p50 1.34 ms and p95 3.92 ms
    single-thread, p50 1.53 ms and p95 4.55 ms threaded.
- **Patterns**: 18 `pattern` rules, 12 in `accent` (antepenult) and 6 in
  `reduplication-preverb`; they take 94,120 bytes of the heap (the load
  without them: +4,159,192 bytes). No processor has a pattern.
- `tests/` and `sources/` hold 998,276 bytes; the largest TSV is
  `corpus.tsv` with 902 rows.

### 6. Commands and checks

```sh
D=imported/wty-grc-en
A=<treebank texts>
REAL=tlg0003.tlg001.perseus-grc1.1,tlg0540.tlg001.perseus-grc1,tlg0540.tlg014.perseus-grc1,tlg0059.tlg001.perseus-grc1,tlg0016.tlg001.perseus-grc1.1,tlg0011.tlg002.perseus-grc2,tlg0020.tlg002.perseus-grc1
# rules: exceptions, own, case maps, final set, the exception rows of cases.tsv
python3 languages/grc/sources/measure.py exceptions $A --exclude $REAL --min 10 --dictionary $D > languages/grc/sources/exceptions.tsv
node languages/grc/sources/own-rules.mjs
node languages/grc/sources/case-maps.mjs
node languages/grc/sources/build-final.mjs
node languages/grc/sources/exception-cases.mjs
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
python3 languages/grc/sources/measure.py rules out/hover.tsv --dictionary $D --forms 60 --changed 40   # and with $A
python3 languages/grc/sources/measure.py traces out/hover.tsv --dictionary $D
python3 languages/grc/sources/measure.py compare out/hover.tsv --dictionary $D --other <languages dir with another pack> [--trace nominalization]
python3 languages/grc/sources/measure.py benchmark out/hover.tsv --dictionary $D > words.txt
# speed
build/benchmark-lookup words.txt 6 --languages languages --language grc --term $D --json
node languages/grc/sources/wasm.mjs <hachidori checkout> $D words.txt 10
# checks
node tools/check-classes.mjs grc --write
ctest --test-dir build -j8 --output-on-failure
node tools/check-yomitan.mjs <yomitan checkout> grc
python3 languages/grc/sources/mutate.py <scratch dir>
```

- **Conformance** (`language-conformance-test languages/grc`): 244
  transforms, 14,639 rules, 9 preprocessors; `classes.json` agrees (7
  classes, 117 fields, no step); `yomitan.tsv` 59/59, `corpus.tsv` 902/902,
  `cases.tsv` 680/680, `defaults.tsv` 8/8 with the defaults, `text.tsv`
  18/18, `lookup.tsv` 25/25 with the defaults, `gaps.tsv` 0/98; every own
  and both transform has a passing row. The full `ctest` passes, 61 of 61,
  on main 78f0cee.
- **Traces in the tests.** The 42 `trace` rows of `cases.tsv` give their
  reasons (`λόγους` → λόγος `acc-pl`, `ἔλυσα` → λύω
  `accent|augment|aorist|ind-act-1sg`, `δίκα` → δίκη `doric-alpha`,
  `δύνηται` → δύναμαι `ath-mid`), and the 166 `exc` rows the trace
  `exceptions`, so a renamed transform, a lost path or a lost exception
  fails a test.
- **Lookups in the tests.** `tests/lookup.tsv` looks 25 texts up in
  `tests/dictionary/` (47 rows written for the pack, tagged as wty-grc-en
  tags them, some with its readings with length marks and its form-of rows)
  and pins first results: -ομαι before -ω (`ἕποντο`, `ἕπεται`,
  `μηχανῶνται`), δύναμαι's
  accents (`ἐδύνατο`, `δύνηται`), the relative `ἥ`, `πολέμου` → πόλεμος,
  `untaggedTerms` (`τούτοισι`), `μόρῳ`, `μάθω`, `ἀλλά`, `νύχθ’`, `φίλων`,
  `οὖσα` → εἰμί, `ἀνέμων` → ἄνεμος, `πλείους` → πλείων, six exceptions and
  the comparison of ἐχθρός and αἰσχρός.
- **Differential check** (`tools/check-yomitan.mjs`): rules 2,852 inputs,
  6,426 Yomitan results, 0 differences; processors `decapitalize` (5,119
  inputs), `capitalizeFirstLetter` (5,514), `removeAlphabeticDiacritics`
  (2,224), `convertLatinToGreek` (2,756), 98 listed differences, 0
  unexplained. `sources/yomitan-differences.tsv` lists the listed ones: a
  capital sigma with no letter before it (`Σ.` gives `ς.` here, `σ.` in
  JavaScript, whose Final_Sigma also skips apostrophes and full stops).
- **Mutation checks.**
  - `sources/mutate.py`: 0 of 59 constraint removals pass every test.
  - The first audit's 53 mutations (its `mymutate.mjs`): 48 fail a test,
    2 change nothing (the ξυν- and -γε rules they remove no longer exist),
    and 3 pass: two remove a processor step that a later processor repeats
    (NFC and the diacritic strip, which `convertLatinToGreek` also does;
    `check-yomitan` catches the second), and one the `θω` → `ω` pair of
    `aorist-passive`, which the pairs for -ηθ-, -υθ-, -σθ- and the other
    stems repeat for every verb of the tests.
  - The second audit's 14 mutations (its `mymutate2.mjs`; its Yomitan
    dative mutation adds the transform back): 11 fail a test. Of the 3 that
    pass, `acc-pl` after `gen-sg` changes only traces; the first declension
    before the second changes no real-text first result now; and the σ-stem
    accusative `η` → `ης` makes the deinflection the first-declension
    vocative makes (`ἔτη` → ἔτης).
  - The third audit's 14 mutations (its `mymutate3.mjs`): 11 fail a test, 1
    changes nothing (the spellings without diacritics it removes no longer
    exist), and 2 pass, each changing no real-text first result: the
    exceptions moved to the end, and the exceptions without their
    part-of-speech conditions.
  - The fourth audit's (its `mymutate4.mjs` and the contract -ω order): 6
    of 7 fail a test; the feminine adjective's -ων after an accented stem
    dropped (3 pairs) passes and changes no real-text first result.
- **Hachidori** (feat/multi-language 803f7b6e with this branch in
  `third_party/hoshidicts`, `node scripts/sync-languages.mjs`, then
  `node test/chrome-language-pack.mjs` with wty-grc-en.zip and 11 cases of
  real sentences), at HACHIDORI_HEAD: 15 checks pass and none fails, among them
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
- **First results the rules change for the worse** (`measure.py rules
  --forms 60`: frequent-form words / real-text lookups where the dictionary
  alone puts the treebank's lemma first; 615 words in 125 forms, 258
  lookups in 168 forms), largest first, judged by hand:
  - treebank lemmas where the pack's reading is as good: the plural name
    Δελφοί read as Δελφός, "a Delphian" (`Δελφοὺς` 23 / 19, `Δελφοῖσι` 10 /
    10), the accented interrogative `τίνα`, `τίνες`, `τίνος` → τίς for the
    treebank's τις (39 / 7), `ὑστεραίᾳ` → ὑστεραία "next day" 11, `ἄριστα` →
    ἄριστος 9, `ἀνδρὶ` → ἀνήρ 8 / 4, the elided `ἄγ’` → ἄγε and `μάλιστ’` →
    μάλιστα (6 each), `εἴρετο` → ἔρομαι (3 lookups), `εἴπας` and `εἶπαν` →
    λέγω for εἶπον (7 lookups);
  - ambiguous forms: Epic `ὅττι` and `ὅττί` → ὅστις for ὅτι (40 / 3), `τύχῃ`
    → τύχη for τυγχάνω (13 / 3), `θύων`, `ποίας`, `ἀξίαν`, `ὄψει`,
    `ἀμβροσίην`, `ἱερὰς`, `κοινὰς`, `ἴσης`, `δόξας` (6 to 9 each);
  - wrong readings: `ἄκουσα` → ἄκων 11 (Homer's aorist, left out of the
    exceptions for Attic), `ἆσαι` → ἄση 8 and `σταθμῷ` → σταθμάω 7 (their
    exceptions lose the reading tie-break), `κρατέρ’` → καρτερός 7, `ἤια` →
    ἠώς, `ἅδε` → ἅδος, `ὤτων` → ὦτος, `Καλλίου` → καλλίας, `μάθε` → μάθος (6
    each), `Εἱλώτων` → Εἱλώτης (3 lookups);
  - two words read as one through a form-of row that has the article or a
    particle: `τὴν παῖδ’` → παῖς and `τὴν φυλακὴν` → φύλαξ (7 lookups), `μή
    τινα` → μήτις (3);
  - in held-out prose (the fourth audit's Herodotus 2-9 and *Anabasis*):
    `αἰδοῖα` → αἰδοῖος "modest" for αἰδοῖον, `ἐπῆσαν` → παίω, `μετάλλων` →
    μεταλλάω, `φθίσει` → φθίσις, `ἄρχον` → ἄρχων for the participle,
    `Ξενίᾳ` → ξενία for the name.

  Each needs the right word to be found by a rule first, a constraint that
  tells the forms apart, or another exception.
- **Wrong cards where the dictionary alone has nothing** (`measure.py rules
  --changed 40`: 1,907 frequent-form words in 247 forms, 996 real-text
  lookups in 714 forms), by hand. Many are the right word under another
  headword or spelling (`ἠελίοιο`, `ἠέλιον` → ἥλιος; `κρατερόν` and its
  cases → καρτερός; `νηοῦ`, `νηόν` → νεώς; `Ποτείδαιαν` → Ποτίδαια;
  `χρέωνται` → χράομαι; `τεόν` → σός; `ἔρον` → ἔρως; `διόπερ` → διό, 75
  words) or the exceptions' own conventions (`ἐπεάν` → ἐπήν for the
  treebank's ἐπειδάν). Wrong cards: proper names read as other words
  (`Τίμαιος` → τιμή 14, `Καδμείων` → καδμεία 13, `Ἀθήνῃσι` → Ἀθηναία, Herodotus'
  `Θήρας` → θήρ, `Ἀκάνθου` → ἄκανθος, `Πάρον` → πάρειμι), `φάτις` → φατός
  19, `ἀπίθησε` → ἀπειθέω 24 for ἀπιθέω, `προειρημένων` → προλέγω 13,
  `πεπνυμένα` → πνέω 12, `δηΐων` → δῃόω 12, `Φωκαίην` → Φωκαῖος. Two-syllable
  -έω verbs contract only ε + ε and ε + ει, but the contract rules apply to
  any stem (`δῶσιν`, `δοῦσα` → δέω for δίδωμι); a stem constraint for that
  costs 54 KB of `tests/classes.json`, over the 1 MB limit.
- **Forms the judge cannot see** (`measure.py rules --changed 40`: the rules
  change the first result and the judge counts both wrong; 3,247 words in
  87 forms, 792 lookups in 75 forms). `οἱ` → οὗ (2,647 words) is the article
  tie below. Of the other largest, by hand, the pack's card is the same word
  under another headword or a fair reading for most: `γαίῃ` and `αἴης` → γῆ
  for the treebank's γαῖα and αἶα (68), `τὰ` → ὁ where the treebank has the
  relative (42), `οἷόν` → wty-grc-en's adverb οἷον (32), `φαεινῷ` → φανός
  (27), `κἀμὲ` → ἐμέ (16), `ἐπίπλουν` → ἐπίπλοον (15), `ἀϋτῆς`, `ἀμβροσίην`,
  `ἐπαΐξας`, `χώρης`, `κεῖνός`, `ἔχθραν` (6 to 10 each). Wrong cards the rules
  make: `οὔτοι` → οὐτάω "wound" (36; wty-grc-en has no οὔτοι), `ὀχέων` →
  ὀχεύς (31; its exception to ὄχεα loses the reading tie-break), `τἂν` → ἔν
  (13), `ἐρέει` and `ἐρέων` → ἐρέω "ask" for ἐρῶ (14), `ἤρα` → ἔαρ (8),
  `σφῷν` → σφεῖς for σύ (6), `βράχε`, `ἰὴ` (6 each).
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
  lookups; 1,349 frequent-form words), `ὃ`, `ὅ` "who; which; that" (1,201
  words, 896 of them the article or Homer's demonstrative), `τῇ` "here;
  there" (283; 904), `τοι` "let me tell you" for σύ (611 words), `βῆ` "baa"
  for Homer's βῆ "went" (141), `αὐτοῦ` "here, there" for αὐτός, `τάδε` "on
  this account" and `τόδε` "hither" for ὅδε, `οἷα` and `οἵα` → οἶος
  "alone" for οἷος, `εἶ` the letter epsilon, `θεῖον` "sulphur", `δύναιτο`
  as an optative of δύνω.
- **The dictionary's order**, rules aside, where an exception loses the
  reading tie-break: `νεῶν` → νέος "young" for ναῦς (113 words, 110 of them
  ναῦς), `πλέον` → πλέω "sail" for πλείων (50) or πλέος (30), `δοίη`,
  `δοῖεν`, `δοίης` → δέω "bind" for δίδωμι (40), `χρώμενοι`, `χρῆσθαι` and
  the other forms of χράομαι "use" → χράω.
- **Ambiguous forms** keep the engine's order: `τύχῃ` is τύχη's dative and
  τυγχάνω's subjunctive; `ἐμοῦ` is also ἐμός's genitive (the exception puts
  ἐγώ first, so 2 real-text lookups of the possessive are wrong now).
- **Traces.** An exception's trace is "common form", not the form's name. A
  result can have the right headword with the trace of another form, when
  the rules' text without accents equals the key of another form-of row:
  `ξυνέγραψε` (3rd singular aorist) shows συγγράφω with the trace "spelling,
  imperative active 2nd singular, second-person singular indicative
  middle", through the row of συνεγράψω. Among equal terms the shortest
  trace wins (`traceSelection: shortest`), and the path through that row is
  shorter than the right one (accent, augment, aorist, indicative active 3rd
  singular, spelling).
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
  breathing. The exceptions have no spelling without diacritics (with one,
  13 of the 299 real-text lookups of their forms written without diacritics
  would show the treebank's lemma first). Text
  without accents but with breathings is read by the rules and the accent
  transform, the penult of -ος and -ον included (`ἐργου` → ἔργον).
- **Iota adscript** (`λόγωι`, `τιμῆι`, capitals `ΤΩΙ`) is not read as the
  subscript, except the forms of ᾍδης, which are exceptions (`Ἅιδου`).
- **A closing single quotation mark** U+2019 after a word (‘λόγος’) is read
  as an elision mark, so the word finds nothing.
- **Options**: `capitalizedNames` (a name written in lower case) doubles a
  lookup's work and is off; `doricAlpha` (δίκα → δίκη) and `duals` are off.
  Proper names have no rules of their own; the rules for common nouns read
  them lowercased, so a name whose form the dictionary does not list can
  show a common noun (`Κύπρου` → κύπρος "henna", `Φᾶσιν` → φάσις, `Νίνου` →
  νίνον, `Κρέοντι` → κρέων, `Ἀΐδαο` → ἀϊδής before its exception).
- **Elision** is restored only after a stem with an accent or breathing, so
  an elided word without diacritics (`γενοιτ’`) is not read.
