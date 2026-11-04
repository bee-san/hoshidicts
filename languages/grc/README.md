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
  pack (GPL-3.0-or-later). `sources/exceptions-accentless.txt` and
  `sources/exceptions-whole-word.txt`: the exceptions that keep their
  spelling without accents and those that stay wholeWord rules, written by
  `measure.py accentless` and `measure.py wholeword` (one by hand).
- `tests/cases.tsv`, `tests/defaults.tsv`, `tests/text.tsv`,
  `tests/lookup.tsv` and the dictionary of `tests/dictionary/` (its glosses
  too; a few one-word glosses such as "the", "year", "one" or "young" are
  also wty-grc-en's):
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

`transforms.json` has 244 transforms and 14,591 rules
(`sources/build-final.mjs`):

| source | transforms | rules |
| --- | ---: | ---: |
| `own` | 242 | 14,546 |
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
  without it (`eval-language` on every test file; `measure.py compare` on
  the 75,172 real-text lookups), at this head:
  - the genitive plural `ων` → `ον`, which an own rule makes on stems of two
    letters or more: Yomitan's reaches `ᾦων` → `ᾦον`, a corpus row (without
    it the corpus recall is 0.901); no real-text first result changes;
  - the vocative singular `η` → `η`, which no own rule makes: it recovers no
    row and adds no false candidate on any file, and without it no real-text
    first result changes.
- **Yomitan rules left out** (4):
  - nominalization `ος` → `εω` (verb), a derivation that reads every -ος
    noun and adjective as an -έω verb. In the union it breaks 4 negatives of
    `cases.tsv` (`φίλος` → `φιλέω`, `καλός` → `καλέω`, `λόγος` → `λογέω`,
    `οἶκος` → `οἰκέω`) and 2 of `yomitan.tsv`, adds 6 false candidates on
    `cases.tsv` and recovers nothing. Added to the final set, 328 real-text
    lookups list a result through it, 1 of them first, and none is the
    treebank's lemma (`ξύνοικος` → `συνοικέω`). Its two rows of `tests/yomitan.tsv` (`γεωργος` → `γεωργεω`,
    `πονος` → `πονεω`) are negatives;
  - the dative singular `ω` → `ον`: it recovers no row of any test file and
    adds a false candidate on the corpus; added to the final set it changes
    18 real-text first results: 15 to a wrong word (`μόρῳ` → `μόρον`,
    `κεφαλαίῳ` → `κεφάλαιον`, `δημοσίῳ` → `δημόσιον`), 2 to the treebank's
    lemma (`μαντηίῳ` → `μαντεῖον`, `φαρμάκῳ` → `φάρμακον`) and 1 between
    two wrong words;
  - the dative singular `ω` → `ος`: it recovers no row of any test file;
    added to the final set it makes 2 real-text first results wrong (`μάθω`
    → `μάθος`, `ἥλω` → `ἧλος`), changes 1 wrong one into another (`σθένω`)
    and makes none right;
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
  final): corpus recall 0.902 in both, first rank 0.910 → 0.909;
  `cases.tsv` negatives passed 66/77 → 77/77. The union breaks nominalization's 4, 6
  through repeated rules without the own rule's stem minimum (`τοῦ` →
  `τός`, `ἄν` → `α`, `αἱ` → `η`, `ὧν` → `η`, `αἷς` → `η`, `ἅς` → `η`) and
  `χώρα` → `χώρας` through `α` → `ας`; Yomitan's genitive `ου` → `ας` and
  vocative `ε` → `ος` add a false candidate each there. In real text 166 of
  the 75,172 first results change: 120 become the treebank's lemma, 30
  stop being it, 16 neither. The lookup p50 goes from 841-923 to 810-876
  µs.

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
- **Exceptions** (the transform `exc`, 283 rules for 237 forms). Among
  equal readings the engine puts the term it found first first
  (`docs/languages.md` 9.6). It reads the text without diacritics and
  without accents before the text as written, and in each it finds a rule's
  term before the terms the dictionary's form-of rows name. So some common
  forms showed a rarer word first: ἔλεγε as ἔλεγος "song of mourning", ἐμοῦ
  as ἐμός, ἔτη as ἔτης "kinsman". An exception is a whole word as written,
  read as the term the dictionary alone puts first; `οὕτω` and `νηός`
  override the dictionary itself (below). The transform comes first, and
  its position matters: moved to the end, it makes 27 real-text first
  results wrong (`ἓν` → ἵημι, `τέ` → σύ), which `lookup.tsv` pins (`ἓν`).
  - **The spelling without accents** is the one found early, and 46 forms
    keep it (`sources/exceptions-accentless.txt`): those that, or whose
    treebank homographs, show another term first without it. `measure.py
    accentless` lists them from a build where every exception has it
    (`GRC_ALL_ACCENTLESS=1 node own-rules.mjs`); with every exception's
    spelling no real-text first result changes. `εἶπας` was added by hand:
    `corpus.tsv`'s `εἴπας` → εἶπον is read through it. `lookup.tsv` pins the
    spelling of `νεῶν`.
  - **wholeWord rules.** The other exceptions are suffix rules with an empty
    stem, which `sources/own.json` stores as one cross product. Four stay
    `wholeWord` rules (`sources/exceptions-whole-word.txt`): `θεῷ` → θεός,
    `πλέον` → πλείων, `σταθμῷ` → σταθμός, `νηός` → ναῦς. Since main's
    487a6fc7 a whole-word trace's term ranks before a dictionary-confirmed
    term at equal length, steps and trace (9.6); without it θεάομαι, which
    `θεῷ`'s own row names too and which has the higher score, comes first.
    `measure.py wholeword` lists them from a build where every exception is
    one (`GRC_ALL_WHOLE=1`), and `lookup.tsv` pins `θεῷ`. Checked against the
    words' own rows (section 14 step 5): `θεῷ`'s and `σταθμῷ`'s rows name the
    exception's term too; `πλέον`'s name only πλέω "sail", for a treebank
    whose 80 tokens of it are πλείων's 50 times; `νηός`'s name νεώς
    "temple" and ναός, while 98 of the 103 treebank tokens of νηός are
    ναῦς's "ship".
  - **A third spelling** without any diacritic changes none of the 760
    real-text lookups of these forms as printed, and 307 of them written
    without diacritics (264 to the treebank's lemma, 1 away from it). It
    would add 6,801 bytes to `sources/own.json`, which puts `tests/` and
    `sources/` over 1 MB, so it is left out.
  - **The list** (`sources/exceptions.tsv`, 86 rows, written by `measure.py
    exceptions`, which regenerates it byte for byte): from the frequency
    list of the 26 treebank files outside the real-text set, so that
    Measurements 4 is held out for them, the forms whose first result the
    rules (all but this transform) turn from right to wrong for at least 10
    tokens net, and the other forms with a net loss from the same collisions
    (`φίλας` beside `φίλην`). Half of those files' words are Homer's
    (Aeschylus 10%, Athenaeus 10%, Sophocles 9%, Polybius 6%, Diodorus 5%,
    Plutarch 5%). Six of its rows are left out (`EXCEPTIONS_LEFT_OUT` in
    `own-rules.mjs`), so it gives 80 forms, 65 of them with 10 tokens or
    more. `ἄκουσα` and `ἄκουσαν`, Homer's unaugmented aorist of ἀκούω, are
    in Attic the feminine of ἄκων "unwilling", which the rules read.
    `ἐχρήσατο`, `ἐχρῶντο`, `χρώμενος` and `χρησόμενος` are lemmatized as χράω
    by the treebank, but are middle forms of χράομαι "use"; wty-grc-en's
    χράω is "fall upon, attack", so the rules' χράομαι stays first.
  - **By hand** (`sources/exceptions-manual.tsv`, 157 forms, chosen from the
    audits and `measure.py rules --forms`, `--changed` and `--lemmas` on the
    whole treebank, so in-sample for Measurements 4):
    - the third audit's 53, with at least 2 treebank tokens: forms the judge
      cannot see because the treebank's lemma is another headword
      (`εἴρηται` → λέγω for the treebank's ἐρῶ, `πλεῖον` → πλείων, `οἰῶν` →
      οἶς, `μῆνα`, `μῆνας`, `μηνῶν` → μείς); forms under the list's
      threshold (`ἔλεγον`, `πείσας`, `χίλια`, `κοτε`, `σώσας`); ᾍδης with
      the iota adscript of capitals (`Ἅιδου`, `Ἅιδην`, `Ἅιδα`, `Ἅιδαν`);
      πυνθάνομαι's aorist πυθ-, which other rules read as the rare πύθω
      "rot" (`πυθόμενος`, `ἐπύθετο`, `πύθηται` and 8 more); and the largest
      unambiguous losses of `rules --forms` (`ἰχθύων`, `βαρεῖαν`, `τύχοι`,
      `νέμων`, `ἕλκων`, `τίσασθαι`, `πάθοι`, `ὄρουσαν`, `φανῇ`, `τυράννων`,
      `δικαίῳ`, `ἀξίους`, `δήσας`, `ἐτέων`, `ἔασε`, `λελύσθαι`, `δυῶν`,
      `Λυκίους`, `Ἶριν`, `ἴσθ’`, `ἵκεθ’`, `ἱκόμεθ’`, `τροπαῖον` and 4 more
      forms of them);
    - the fourth audit's 25: Ionic and Epic words other rules read as an
      unrelated word where the dictionary alone has nothing (`ἐπείτε` →
      ἐπεί, not ἔπειμι; `ἐπεάν` → ἐπήν, not ἔπος; `Ἀσίην`, `Ἀσίης` → Ἀσία;
      `Τροίην`, `Τροίης` → Τροία, not τρέω; `νέες` → ναῦς, not νέω; `ζῶσι`,
      `ζῶσιν` → ζῶ, not ζέω; `πλοῦν` → πλόος; `μέσσον` → μέσος; `Ἀθηναίης`,
      `Ἀθηναίην` → Ἀθηναία; `ἐπειρέσθαι` → ἐπέρομαι, not πείρω;
      `ἑσσωθέντες` → ἡσσάομαι; `Ἀΐδαο`, `Ἀίδαο` → ᾍδης; `Ὀδυσεῦ` →
      Ὀδυσσεύς; `ἐΐσην` → ἴσος) and cards in held-out Herodotus (`στάδιοι`
      → στάδιον, `μέσα`, `μέσας` → μέσος, `ἐπυθόμην`, `ἐπυθόμεθα`,
      `πυθομένους` → πυνθάνομαι);
    - the fifth audit's 49: forms of the lemmas whose tokens its per-lemma
      count found other rules reading as an unrelated word (ἔρδω's `ἔρξον`,
      `ἔρξω`, `ἔρξας`, `ἔρξῃς`, not ἔργω; δαμάζω's `δαμέντες`, `δαμέντα`,
      `δαμέντας`, not δέμω; Epic `μέσσῃ`, `μέσσην` → μέσος, not μέδω;
      `μέσαι`, not μέσης; Ionic `πρήσσειν` and 4 more → πράσσω, not πρήθω;
      `ἑσσώθησαν`, `ἑσσώθη`, `ἑσσωθῆναι` → ἡσσάομαι, not εἰμί or ἕννυμι;
      `τελεῖ`, `τελῶ` → τελέω, not τέλλω; `ἐφράσσατο`, `φράσσατο` → φράζω;
      `συμφορήν`, `συμφορῆς`, `συμφορέων` → συμφορά, not σύμφορος; `βορέω`,
      `Βορέω` → Βορέας, not βορά; `ἔταξαν` → τάσσω, not ἐτάζω; `κεφαλέων`,
      `σκιῇ`, `ἐπάν`, `τίσαιτο`, `τίσεσθαι`, `ἄραντες`, `πάθῃσι`, `πάθῃς`),
      and 10 names whose form-of row the common-noun rules came before
      (`Κύπρου` → Κύπρος, not κύπρος "henna"; `Φᾶσιν`, `Νίνον`, `Νίνου`,
      `Κρέοντα`, `Κρέοντι`, `Θήρας`, `Ἀκάνθου`, `Πάρον`, `Ἀθήνῃσι`);
    - 28 for main's tie-breaks (487a6fc7): the exceptions that lost the
      "written form equals reading" key before, which no longer counts in
      this pack (`νεῶν` → ναῦς, `δοῖεν` → δίδωμι, `πλέον` → πλείων, `ὀχέων`
      → ὄχεα, `ἆσαι` → ἄω, `σταθμῷ` → σταθμός), and forms whose rule-made
      reading that key used to put second (`Κύρου` → Κῦρος, not κύρω;
      `θεῖναι` → τίθημι, not θείνω; `πείσεις`, `πείσει`, `ἔπεισαν`, `πεῖσαι`
      → πείθω, not πεῖσις; `ἤρχετο` → ἄρχω, not ἔρχομαι; `ἴδῃ`, `ἴδῃς` →
      ὁράω, not ἴδη; `βάτην`, `εὐρέι`, `ὀπί`, `βουλῇσι`, `νίψασθαι`,
      `νεώμεθα`, `ξίφεσίν`, `ῥῖνάς`, `διαί`, `τεύχων`, `λέξεις`, `καθέξει`,
      `ἀτάσθαλα`);
    - 2 cards the dictionary itself orders: its adverbial reference puts
      οὗτος "this" first for `οὕτω` "thus" (the treebank's 283 tokens of it
      are οὕτως), and its Epic and Ionic rows put νεώς and ναός "temple"
      first for `νηός`.

    Main's engine shows the term first without 32 former exceptions, which
    are dropped: εἰμί's compound participles (`παρόντων`, `παρούσης`,
    `παρούσῃ`, `παρουσῶν`, `παρούσας`), `Ἅιδης`, `Ἅιδας`, `ἐπύθοντο`,
    `πυθέσθαι`, ὁρμάω's aorists `ὥρμησεν`, `ὥρμησε`, `ὁρμῆσαι`, `ὁρμήσας`
    (with the -άω order below), τάσσω's `τεταγμένοι`, `ταχθέντες` and 12
    more, `δεδμημένοι`, and `χρώμενοι`, `χρωμένους`, `χρωμένων`,
    `χρωμένῳ`. `καλῇ` moved to the list. The forms `πίθῃ` → πείθω and
    `ὄψει` → ὁράω were left out: `πίθῃ` is a row of `gaps.tsv`, which an
    exception would move to the corpus, and 9 of the 15 treebank tokens of
    `ὄψει` are ὄψις's or ὄψος's.

  Every exception shows its term first (237 of 237). The trace of such a
  result is the single step "common form". One transform per form label
  ("third-person singular imperfect active indicative") named the form, but
  its 83 transform headers took 31 KB and pushed `tests/` and `sources/` over
  1 MB. `cases.tsv` has one `exc` row per form, with the trace `exc`, and
  three negatives that keep the whole words whole, built from forms that
  keep the spelling without accents (`exception-cases.mjs` writes them;
  the exceptions made suffix rules fail all three).
- **Order.** Among equal readings the one a rule finds first comes first
  (Measurements 4), so the order of the rules is a choice: a middle form's
  -ομαι lemma comes before its -ω lemma, for thematic and contract verbs
  (`ἕποντο`, `ἕπεται` → ἕπομαι; `μηχανῶνται` → μηχανάομαι, not μηχανάω),
  which `tests/lookup.tsv` pins for both. A stem in -η- of the future and
  aorist (-ησ-), the aorist passive (-ηθ-) and the perfect (-ηκ-, -ημαι)
  gives the -άω verb before the -έω verb (`ὁρμηθέντες` → ὁρμάω, not ὁρμέω;
  `lookup.tsv` pins it): measured before main's 487a6fc7, 9 real-text first
  results changed, all to the treebank's lemma, and `ὥρμησαν`, 22 of whose
  28 treebank tokens are ὁρμάω's and 6 ὁρμέω's, shows ὁρμάω. The second declension still comes
  before the first in each case transform, but since a noun's genitive plural -ων
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
  rank rises on the corpus only (0.909 → 0.912) and the false candidates
  rise on seven of the eight file and option pairs. In real text 1,170
  first results change: 280 become the treebank's lemma, 701 stop being it,
  189 neither. `pass` finds something for 283 more lookups (3,234 → 2,951 with
  nothing), mostly a wrong word, and puts untagged rows before tagged ones
  (`τούτοισι` → τοῦτος, `ἀπόρους` → ἀπόρως, `Φοινίκων` → Φοινίκη); the wrong
  first results rise from 7,418 to 8,285, and the frequent forms' wrong
  first words from 24,474 to 27,427. `tests/lookup.tsv` pins `filter`
  (`τούτοισι` → οὗτος).
- **Main's lookup options (487a6fc7) stay at their defaults**, each measured
  on a copy of the final pack whose descriptor sets it (Measurements 2 and 4;
  wrong first results in real text / frequent-form words, against 7,418 /
  24,474 with the defaults):
  - `confirmedOrder: "references"`: 7,882 / 26,221;
  - `ownEntry: "afterReferences"`: 6,994 / 25,625, and with both 7,526 /
    27,511. It puts the terms a word's own rows name before its own entry:
    `τῇ` → ὁ (904 frequent-form words), `οὔ` → οὐ (789), `μέγα` → μέγας
    (435), but also `εἰς` "into" → εἰμί (1,416), `ἦ` → εἰμί (684), `ἄρα` →
    ἄρον "arum" (665), `ὅς` → ἑός (868), `πῶς` → πούς "foot" (219). On
    the frequent forms 8,493 words turn right and 10,787 wrong;
  - `formOfNormalizer` that strips macrons and breves: 118,630 of
    wty-grc-en's 1,110,066 references name a text no row has, and for 3,095
    of the 8,058 texts the text without length marks is a headword (`φως` →
    φᾰ́ος); the normalizer changes 1 real-text lookup (7,418 / 24,481);
  - `formOfIgnore: ["adverbial"]`, the rule of the reference that put
    οὗτος first for `οὕτω` (5,017 rows): 7,423 / 24,544, with 22 more
    real-text lookups finding nothing (`δεύτερον`, `πάντως`); the exception
    for `οὕτω` fixes its 134 lookups without that loss. The other reference
    rules behind wrong first results mostly name the same word under another
    headword (`alt-of`: `Πηνελόπεια` → Πηνελόπη, `ἔσω` → εἴσω), so no rule
    name is ignored.
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
  615, real-text lookups 258;
- after the fifth audit (reports/audit-hachi-lang-grc-e.md), in `grc: fixes
  after the fifth audit`: the -άω verb before the -έω verb in the stems in
  -η-; exceptions for the lemmas of `measure.py rules --lemmas`, the
  per-lemma count that audit asked for, and for names; the spelling without
  accents only for the exceptions that need it (`measure.py accentless`),
  and the transform's id `exc`, for the 1 MB limit; `exc` negatives built
  from those forms; a `lookup.tsv` row for the -άω order; shorter comments
  in `own-rules.mjs`;
- then, in `grc: exceptions for main's tie-breaks`, on main's 487a6fc7,
  which changed the order of ties (9.6): the
  standing of whole-word traces and of dictionary-confirmed terms, and the
  "written form equals reading" key only for packs whose readings are
  required. The pack of the commit before, unchanged, gave 7,723 wrong
  first results in real text and 25,804 frequent-form words with it,
  against 9,444 and 33,442 before it: the article and pronoun ties are gone
  (`τοῦ`, `τοῖς`, `οἱ` → ὁ; `εἶναι` → εἰμί; `σε`, `σοι` → σύ). The
  exceptions were redone for it: the list regenerated, the treebank's χράω
  rows left out, 32 manual exceptions dropped and 30 added (Exceptions),
  four of them wholeWord rules with `measure.py wholeword`, and
  `lookup.tsv` rows for `θεῷ`, `ἓν` and `νεῶν`. Main's new lookup options
  were measured and stay at their defaults (Own rules). Against the same pack without rules:
  frequent-form tokens the rules turn from right to wrong 604, real-text
  lookups 274; treebank tokens the rules make wrong from right or from no
  result 8,663, against 9,757 for 95fb1f2's pack on main's engine.

## Measurements

All with wty-grc-en as published (form-of rows included), on one machine
(GCC 14.3 Release; load average 50-52 during the timing runs), with this
branch rebased on main 9c4ccdf5, whose 487a6fc7 changed the order of
ties. `D` is the imported dictionary
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
final pack's wrong first results are 7,431 in real text (9.9%) and 23,738
frequent-form words (6.44%); with this one, 7,418 and 24,474. The judge has
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
| corpus+gaps (1,000) | all | 0.901 / – / 0.769 / 0.908 | 0.100 / – / 0.344 / 0.781 | 0.902 / – / 0.770 / 0.910 | **0.902** / – / 0.769 / 0.909 |
| corpus+gaps | default | 0.875 / – / 0.740 / 0.909 | 0.100 / – / 0.332 / 0.782 | 0.889 / – / 0.742 / 0.910 | 0.876 / – / 0.740 / 0.910 |
| cases (751) | all | 1.000 / 1.000 / 2.021 / 0.932 | 0.009 / 0.922 / 0.970 / 0.708 | 1.000 / 0.857 / 2.033 / 0.929 | 1.000 / 1.000 / 2.021 / 0.932 |
| cases | default | 0.990 / 1.000 / 1.939 / 0.933 | 0.009 / 0.922 / 0.921 / 0.708 | 0.990 / 0.857 / 1.955 / 0.930 | 0.990 / 1.000 / 1.939 / 0.933 |
| yomitan (59) | all | 1.000 / 1.000 / 2.491 / 0.088 | 1.000 / 0.000 / 1.895 / 0.088 | 1.000 / 0.000 / 2.491 / 0.088 | 1.000 / 1.000 / 2.491 / 0.088 |
| yomitan | default | 0.965 / 1.000 / 2.368 / 0.088 | 1.000 / 0.000 / 1.772 / 0.088 | 1.000 / 0.000 / 2.368 / 0.088 | 0.965 / 1.000 / 2.368 / 0.088 |
| defaults (8) | default | 1.000 / 1.000 / 2.667 / 1.000 | 0.333 / 0.600 / 2.000 / 1.000 | 1.000 / 0.600 / 2.667 / 1.000 | 1.000 / 1.000 / 2.667 / 1.000 |
| defaults | all | 1.000 / 0.000 / 3.333 / 1.000 | 0.333 / 0.600 / 2.667 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 | 1.000 / 0.000 / 3.333 / 1.000 |

The final recall over corpus and gaps is 902 / 1,000 = **0.902** with every
option on; with the defaults it is 0.876, because 26 UniMorph duals need the
optional `duals`. One corpus row, `εἴπας` → εἶπον, is reached through the
exception for `εἶπας` written without accents. `cases.tsv` has 674 positive
and 77 negative rows, 237 of the positives `exc` rows. Yomitan's test is
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
| corpus+gaps | 0.902 / – / 0.976 / 0.912 | 0.876 / – / 0.848 / 0.913 |
| cases | 1.000 / 1.000 / 2.488 / 0.929 | 0.990 / 1.000 / 2.251 / 0.930 |
| yomitan | 1.000 / 1.000 / 2.614 / 0.088 | 0.965 / 1.000 / 2.368 / 0.088 |
| defaults | 1.000 / 0.000 / 5.000 / 1.000 | 1.000 / 1.000 / 4.333 / 1.000 |

### 2. Frequent forms

`python3 languages/grc/sources/measure.py frequent <treebank texts> --dictionary $D`.
Of the 10,000 most frequent forms of the treebank (368,718 words), a rule
reaches a treebank lemma of 8,741 (284,333 words, 77.1%). Their tokens,
each judged against its own lemma: right 225,160 (79.2%), variant 33,336
(11.7%), wrong with the lemma listed 17,854 (6.3%), wrong 6,620 (2.3%),
nothing 1,363 (0.5%). The wrong first results are 24,474 words, **6.64%** of
the list's words (27,341, 7.42%, without the exceptions, whose list was
chosen on 26 of these 33 files). The largest groups, by the first result's
trace: the word's own entry 14,403 (`τῷ` 1,349, `τῇ` 904, `τοι` 611),
`pronoun` 1,718 (`οἳ` → ὅς 392 and `ἣ` → ὅς 163 for Homer's article),
`article` 1,317 (`οἱ` → ὁ 974 for Homer's dative of ἕ), `exc` 313 (`ὀχέων`
→ ὄχεα 31 for the treebank's ὄχος, the same word; `πλέον` → πλείων 30 for
πλέος), `acc-sg` 258 (`πρῶτον` → πρῶτος 52 for the treebank's πρότερος),
`alt-of` 250 (`Πηνελόπεια` → Πηνελόπη 58); Known gaps has them. Forms whose
treebank lemma no rule reaches are not counted here, also when a rule
shows a wrong word for them (`διόπερ` → διό, 75 tokens; Known gaps).

### 3. Words after an article, pronoun, particle or εἰμί

`measure.py behind <hover.tsv>`, the real-text lookups whose previous word
the treebank tags as an article, a pronoun, a particle (or οὐ, μή, ἄν) or
a form of εἰμί:

| previous word | lookups | right | variant | wrong first | nothing |
| --- | ---: | ---: | ---: | ---: | ---: |
| article | 7,809 | 6,456 | 301 | 696 (8.9%) | 356 |
| pronoun | 5,263 | 4,200 | 399 | 436 (8.3%) | 228 |
| particle | 3,393 | 2,555 | 273 | 386 (11.4%) | 179 |
| εἰμί | 1,099 | 888 | 54 | 96 (8.7%) | 61 |

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
| right | 60,790 | 80.9% |
| variant | 3,730 | 5.0% |
| wrong, the treebank's lemma lower in the list | 4,195 | 5.6% |
| wrong, the treebank's lemma not in the 16 | 3,223 | 4.3% |
| nothing | 3,234 | 4.3% |

The wrong first results, 7,418 (9.9%), by the trace of the first result:
the word's own entry (`as written`) 3,439 (`τῷ` 344, `τῇ` 283 for the
article; `ἐν` 159, which the treebank's Herodotus lemmatizes as εἰς),
`pronoun` 487 (`ἡμῖν` → ἡμεῖς 60 and `ὑμῖν` → ὑμεῖς 52 for the treebank's
ἐγώ and σύ, `οἳ` → ὅς 50 for Homer's article), `article` 283 (`οἱ` → ὁ 111
for the dative of ἕ, `τὰ` and `τῶν` → ὁ 59 for the relative), `exc` 102
(`πλέον` → πλείων 16 for the treebank's πλέος, its ἐπειδάν for `ἐπεάν` →
ἐπήν 14 and its `̓Ασία` with a stray breathing for `Ἀσίης` 8), `nom-pl`
90, `gen-pl` 78, `acc-pl` 74, "genitive plural" 63 and `dat-pl` 50 (mostly
the treebank's plural lemmas `Ἴωνες`, `Δελφοί` and its Κερυκυραῖος for
Κερκυραῖος), `acc-sg` 72 (`πρῶτον` → πρῶτος for πρότερος), `dat-sg` 63
(`μέλει` → μέλος, `τύχῃ` → τύχη), `comparison` 61 (`μεγίστη` → μέγιστος for
μέγας), `gen-sg` 59, "genitive singular" 57 and `alternative` 49 (`μή` →
μήτι 8).

**The exceptions** (`measure.py compare <hover.tsv> --other <the pack
without the transform exc>`): 769 first results change. 645 become the
treebank's lemma, 22 stop being it, 102 change between two wrong words. By
the list that has the hovered word:

- The 80 forms of the list, chosen without these seven files: 247 changes,
  236 to the treebank's lemma, 4 away from it (`ἐμοῦ` ×2, where the
  treebank has the possessive, `ἧκε` as ἥκω and `βοῶν`), 7 neither.
- The third audit's 53 forms, in-sample: 128 changes, 92 to the treebank's
  lemma, 10 away from it, 26 neither. The 10 are treebank lemmas the forms
  rarely have: 5 πυθ- forms lemmatized as πύθω, 4 of which mean "learn" in
  Herodotus (`πυθόμενος τὸν Κροῖσον εἶναι θεοσεβέα`) while Hesiod's `πύθῃ
  Διὸς ὄμβρος` is πύθω; `εἴρηται` as εἴρω ×2; `τροπαῖον` as τροπαῖος ×2;
  `μηνῶν` as μήνη. The 26 are conventions: the treebank's ἐρῶ for `εἴρηται`
  ×8 and τροπαῖον for wty-grc-en's τρόπαιον ×7, σώζω for σῴζω, the elided
  `ἴσθ’` as εἰμί or οἶδα, Ionic `δυῶν` as δυό.
- The fourth audit's 25 forms, in-sample (with the grave `ἐπεὰν`): 114
  changes, 75 to the treebank's lemma (`ἐπείτε` ×45), 3 away from it
  (`Ἀθηναίης` ×2, where the treebank has the adjective, and `στάδιοι` as
  στάδιος), 36 neither: the treebank's ἐπειδάν for `ἐπεάν` → ἐπήν (×14), its
  `̓Ασία` with a stray breathing (×13), Ἀθήνη for `Ἀθηναίης` (×5) and like
  conventions.
- The fifth audit's 39 forms of lemmas, in-sample: 20 changes, 16 to the
  treebank's lemma, 4 neither (`ἄραντες` → ἀείρω ×2 for αἴρω, `βορέω` →
  Βορέας for the treebank's lower-case βορέας, `ἑσσώθη` → ἡσσάομαι for
  ἑσσόομαι). Its 10 names: 15 changes, 13 to the treebank's lemma, 2 away
  from it (`Νίνον`, `Κύπρου`, which the treebank once each writes as the
  lower-case νίνον and κύπρος).
- The 28 for main's tie-breaks: 98 changes, 73 to the treebank's lemma, 1
  away from it, 24 neither, most of them `πλέον` → πλείων for the treebank's
  πλέος (×16).
- `οὕτω` and `νηός`: 139 changes, 135 to the treebank's lemma, 4 neither
  (`νηός` → ναῦς for the treebank's ναός).
- Forms other rules bring to an exception (`θεῖναὶ` with an enclitic's
  accent, `εἴρηταί`, the name `Ἴδῃ`, which `decapitalize` brings to ἴδῃ →
  ὁράω): 8 changes, 5 to the treebank's lemma, 2 away from it, 1 neither.

Without the exceptions the wrong first results are 8,061 (10.7%).

**Rules against the dictionary alone** (`measure.py rules`: the same pack
without rules, its processors and wty-grc-en's form-of rows only). The rules
make 5,393 real-text lookups right that the dictionary alone gets wrong, and
274 (0.36%) wrong that it gets right; for the frequent forms 12,209 and 604
words (0.16%). They also turn 948 real-text lookups (683 forms) and 1,828
frequent-form words (237 forms) from no result into a card the judge counts
wrong, many of them fair readings (Known gaps). Over every treebank token
(477,031), `--lemmas 40` counts by treebank lemma the tokens the rules make
wrong from right or from no result: 8,663 in 2,448 lemmas, against 9,757
for the pack of 95fb1f2, the head the fifth audit read, on the same
engine. Among equal readings the
engine puts the term found first first, and a rule finds its term before the dictionary's references are
followed (`docs/languages.md` 9.6, 9.10), so a rule that reaches a rarer
word reorders the dictionary's equals. `measure.py rules --forms 60` lists
the forms, and `--changed 40` the forms turned from no result into a wrong
card and the changes both of whose cards the judge counts wrong; Known gaps
has them.

**Traces** (`measure.py traces`): of the 8,146 right first results whose
first step is a case, the case and number agree with the treebank's tag for
7,608; the 538 others are mostly neuter nominatives labelled accusative
(`ὅσιον` 30, `δίκαιον` 12) and ambiguous forms.

**By hand**, the 60 wrong first results the script samples with seed 1:

- 12 are own entries of homographs (`τῇ` "here; there" ×3, `τῷ` "then"
  ×2, `αὐτοῦ` "here, there" ×2, `τάδε` "on this account" ×2, `ἢν` "see
  there!" for ἐάν, `ᾗ` "which way", `τοι` "let me tell you");
- 13 are the dictionary's own entry or headword for the form under its
  conventions (`δεινόν` "danger" ×2, `εἰσιν` → εἰσί, `βίᾳ`, `φαίνεται`,
  `ἐπειδὴ`, `ῥᾷον`, `ὄντα`, `οἷόν` → οἷον, `ὅσον`, `οὐδέν`, `ἡμεῖς`, `ὑμῶν`
  → ὑμεῖς);
- 4 are the dictionary's form-of rows, the rules aside (`ὅ` → ὅστις,
  `κυκλῶν` → κυκλόω, `εὖ` → εὖγε, `μῆνες` → the particle μήν);
- 12 are treebank conventions or errors where the pack is right (its
  plural lemma `Πελοποννήσιοι`, its Κερυκυραῖος, `ἐπί-ἐπικουρέω`, ὁρμάζω
  for `ὁρμώμενος`, ἐφορμάω for the -έω participle `ἐφορμούσας`, εἰς for
  `ἐν`, εἴρω for `εἴρετο` "asked", ἀφεστήξω for `ἀποστάντες`, πρότερος for
  `πρῶτος`, οὔτε for `οὔ`, οὐδέ for `δὲ`, `Ἀντιγόνην` as its own lemma);
- 11 are the same word under another headword or spelling (`αὑτῶν` →
  αὑτοῦ, `Εἱλώτων` → Εἱλώτης, `τἆλλ’` → τἆλλα, `ὃ` → ὅ, `νεηνίαι` →
  νεανίας, `ἀέκων` → ἄκων, `χαλκήιον` → χάλκεος, `νηοὺς` → νεώς,
  `συμμίσγουσα` → συμμείγνυμι, `ἀέξει` → αὐξάνω, `μετόπισθεν`);
- 5 are a right reading of an ambiguous form, not the one in context (`τὸν`,
  `τὰ` → ὁ for the relative, `οἱ` → ὁ for the dative of ἕ, `ὧν` → ὅς for
  Ionic οὖν, `Πακτύην` → the place Πακτύη for the man Πακτύης);
- 3 are wrong readings the rules make (`κοινὰς` → κοινά for κοινός,
  `μάθε` → μάθος for μανθάνω, and `φάτις` → φατός, a word wty-grc-en
  lacks).

### 5. Performance

- **Native lookups** (`build/benchmark-lookup <words> 6 --languages
  languages --language grc --term $D --json`, the 60 benchmark texts in 6
  passes, the first dropped, three runs): p50 810-876 µs, p95 2.42-2.49 ms.
  The budget is 1 ms p50. The union's p50 is 841-923 µs.
- **WebAssembly** (`node languages/grc/sources/wasm.mjs <hachidori> $D
  <words> 10`, Hachidori feat/multi-language 803f7b6e's prebuilt engines,
  Node 22, the dictionary paged):
  - `hdw_language_load`: median 30.2 ms single-thread and 32.8 ms threaded
    over 10 fresh engines (budget 50 ms);
  - live heap after the load: +4,246,776 bytes (budget 20 MB);
  - `hdw_lookup` on the 60 texts: p50 1.44 ms and p95 4.21 ms
    single-thread, p50 1.75 ms and p95 5.39 ms threaded. These engines
    predate main's 487a6fc7, so they rank ties as before it.
- **Patterns**: 18 `pattern` rules, 12 in `accent` (antepenult) and 6 in
  `reduplication-preverb`; they take 94,544 bytes of the heap (the load
  without them: +4,152,232 bytes). No processor has a pattern.
- `tests/` and `sources/` hold 998,548 bytes; the largest TSV is
  `corpus.tsv` with 902 rows.

### 6. Commands and checks

```sh
D=imported/wty-grc-en
A=<treebank texts>
REAL=tlg0003.tlg001.perseus-grc1.1,tlg0540.tlg001.perseus-grc1,tlg0540.tlg014.perseus-grc1,tlg0059.tlg001.perseus-grc1,tlg0016.tlg001.perseus-grc1.1,tlg0011.tlg002.perseus-grc2,tlg0020.tlg002.perseus-grc1
# rules: exceptions, which of them stay whole words and keep a spelling without accents (each in a copy of the pack),
# own, case maps, final set, the exception rows of cases.tsv
python3 languages/grc/sources/measure.py exceptions $A --exclude $REAL --min 10 --dictionary $D > languages/grc/sources/exceptions.tsv
GRC_ALL_WHOLE=1 node <copy>/grc/sources/own-rules.mjs && node <copy>/grc/sources/build-final.mjs
python3 languages/grc/sources/measure.py wholeword x --languages <copy> --dictionary $D   # sources/exceptions-whole-word.txt
GRC_ALL_ACCENTLESS=1 node <copy>/grc/sources/own-rules.mjs && node <copy>/grc/sources/build-final.mjs
python3 languages/grc/sources/measure.py accentless $A --languages <copy> --dictionary $D   # exceptions-accentless.txt, and εἶπας
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
python3 languages/grc/sources/measure.py rules $A --dictionary $D --lemmas 40
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
  transforms, 14,591 rules, 9 preprocessors; `classes.json` agrees (7
  classes, 117 fields, no step); `yomitan.tsv` 59/59, `corpus.tsv` 902/902,
  `cases.tsv` 751/751, `defaults.tsv` 8/8 with the defaults, `text.tsv`
  18/18, `lookup.tsv` 29/29 with the defaults, `gaps.tsv` 0/98; every own
  and both transform has a passing row. The full `ctest` passes, 74 of 74,
  on main 9c4ccdf5.
- **Traces in the tests.** The 42 `trace` rows of `cases.tsv` give their
  reasons (`λόγους` → λόγος `acc-pl`, `ἔλυσα` → λύω
  `accent|augment|aorist|ind-act-1sg`, `δίκα` → δίκη `doric-alpha`,
  `δύνηται` → δύναμαι `ath-mid`), and the 237 `exc` rows the trace `exc`,
  so a renamed transform, a lost path or a lost exception fails a test.
- **Lookups in the tests.** `tests/lookup.tsv` looks 29 texts up in
  `tests/dictionary/` (57 rows written for the pack, tagged as wty-grc-en
  tags them, some with its readings with length marks and its form-of rows)
  and pins first results: -ομαι before -ω (`ἕποντο`, `ἕπεται`,
  `μηχανῶνται`), δύναμαι's
  accents (`ἐδύνατο`, `δύνηται`), the relative `ἥ`, `πολέμου` → πόλεμος,
  `untaggedTerms` (`τούτοισι`), `μόρῳ`, `μάθω`, `ἀλλά`, `νύχθ’`, `φίλων`,
  `οὖσα` → εἰμί, `ἀνέμων` → ἄνεμος, `πλείους` → πλείων, `ὁρμηθέντες` →
  ὁρμάω (the -άω stems first), the comparison of ἐχθρός and αἰσχρός, and
  nine exceptions: `ἔλεγον`, `ἔλεγε`, `ἐμοῦ`, `ἕνα`, `ἔτη`, `μένων`, `θεῷ`
  (a wholeWord rule, against a dictionary-confirmed θεάομαι of higher
  score), `ἓν` (the transform's position) and `νεῶν` (its spelling without
  accents, against the form-of row's νέος).
- **Differential check** (`tools/check-yomitan.mjs`): rules 2,942 inputs,
  6,642 Yomitan results, 0 differences; processors `decapitalize` (5,186
  inputs), `capitalizeFirstLetter` (5,581), `removeAlphabeticDiacritics`
  (2,293), `convertLatinToGreek` (2,825), 98 listed differences, 0
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
    pass, `acc-pl` after `gen-sg` and the σ-stem accusative `η` → `ης`
    (which makes the deinflection the first-declension vocative makes,
    `ἔτη` → ἔτης) change no real-text first result, and the first
    declension before the second changes 4 (1 to the treebank's lemma,
    `οἰκιῶν` → οἰκία, 3 between wrong words).
  - The third, fourth and fifth audits' scripts (`mymutate3.mjs`,
    `mymutate4.mjs`, `mymutate5.mjs`) run on copies with the transform id
    `exc` for `exceptions` and with the four wholeWord rules read as rules
    of one pair; their lists of manual exceptions now run to the end of
    `exceptions-manual.tsv`. The third audit's 14: 11 fail a test, 2 change
    nothing (the spellings without diacritics and the εἶδον group they
    remove are not exceptions now), and 1 passes, changing no real-text
    first result: the exceptions without their part-of-speech conditions.
    The fourth audit's 6 and its contract -ω order: 5 of 7 fail a test; the
    exceptions for εἰμί's compound participles it drops are gone (the
    engine reads them right), and the feminine adjective's -ων after an
    accented stem dropped (3 pairs) passes and changes no real-text first
    result. The fifth audit's 7: 6 fail a test; the later groups'
    part-of-speech tags dropped passes and changes no real-text first
    result.
  - This round's: the exceptions made suffix rules fail the three `exc`
    negatives, the four wholeWord rules made suffix rules fail
    `lookup.tsv`'s `θεῷ`, and the -άω order reverted fails its
    `ὁρμηθέντες`.
- **Hachidori** (feat/multi-language 803f7b6e with this branch in
  `third_party/hoshidicts`, `node scripts/sync-languages.mjs`, then
  `node test/chrome-language-pack.mjs` with wty-grc-en.zip and 11 cases of
  real sentences), at 35d5910: 15 checks pass and none fails, among them
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
  alone puts the treebank's lemma first; 604 words in 129 forms, 274
  lookups in 183 forms), largest first, judged by hand:
  - treebank lemmas where the pack's reading is as good: the plural name
    Δελφοί read as Δελφός, "a Delphian" (`Δελφοὺς` 23 / 19, `Δελφοῖσι` 10 /
    10), the accented interrogative `τίνα`, `τίνες`, `τίνος` → τίς for the
    treebank's τις (39 / 6), `ὑστεραίᾳ` → ὑστεραία "next day" 11, χράομαι
    "use" for the treebank's χράω (`ἐχρήσατο` 11, `ἐχρῆτο`, `χρώμενος` 5
    each; wty-grc-en's χράω is "attack"), `ἄριστα` → ἄριστος 9, `βίηφι` →
    βίᾳ 9, the elided `ἄγ’` → ἄγε, `μάλιστ’` → μάλιστα, `πάντ’` → πᾶς (5
    or 6 each), `εἴρετο` → ἔρομαι "ask" (5 / 3), `εἴπας` and `εἶπαν` → λέγω
    for εἶπον (5 / 7), and the -άω order's `ὥρμησαν` → ὁρμάω for the
    treebank's ὁρμέω (6; its other 22 tokens are ὁρμάω's);
  - ambiguous forms: Epic `ὅττι` and `ὅττί` → ὅστις for ὅτι (40 / 3), `τοί`
    and `τοὶ` → the article for the particle τοι (29 / 2), `τύχῃ` → τύχη for
    τυγχάνω (13 / 3), `θύων`, `ποίας`, `ἀξίαν`, `ὄψει`, `ἀμβροσίην`,
    `ἱερὰς`, `κοινὰς`, `ἴσης`, `ἴσην`, `πλέων` (5 to 9 each);
  - wrong readings: `ἄκουσα`, `ἄκουσαν` → ἄκων 16 (Homer's aorist, left out
    of the exceptions for Attic), `κάλ’` → καλός 8 and `κρατέρ’` → κρατήρ 7
    (elided), `ἤια` → ἠώς, `ὤτων` → ὦτος, `Καλλίου` → καλλίας, `μάθε` →
    μάθος, `ἵστατ’` → ἵστωρ (6 each), `ἐσχάτην` → σχάζω, `φορεῖ` → φορεύς,
    `νέμει` → νέμος (5 each), `Εἱλώτων` → Εἱλώτης (5 / 3);
  - two words read as one through a form-of row that has the article or a
    particle: `τὴν παῖδ’` → παῖς (7 lookups), `μή τινα` → μήτις (3);
  - in held-out prose (the fourth audit's Herodotus 2-9 and *Anabasis*):
    `αἰδοῖα` → αἰδοῖος "modest" for αἰδοῖον, `ἐπῆσαν` → παίω, `μετάλλων` →
    μεταλλάω, `φθίσει` → φθίσις, `ἄρχον` → ἄρχων for the participle,
    `Ξενίᾳ` → ξενία for the name.

  Each needs the right word to be found by a rule first, a constraint that
  tells the forms apart, or another exception.
- **Lemmas the rules make wrong** (`measure.py rules <treebank texts>
  --lemmas 40`, every treebank token): 8,663 tokens in 2,448 lemmas, from
  right or from no result, 1,783 of them in the 40 largest lemmas. By hand,
  most of those 40 are the same word under another headword or spelling, or
  a suppletive verb's other headword: κρατερός → καρτερός 139, Epic ἠέλιος
  → ἥλιος 90, διόπερ → διό 77, προερέω → προλέγω 62, εἶδον's `ἰδόντες` →
  ὁράω 58, εἶπον → λέγω 55, πολεμίζω → πολεμέω 51, ζάω and ζώω → ζῶ 95,
  δάιος → δάϊος 48, ναός → νεώς 40, τεός → σός 36, χάλκειος → χάλκεος
  36, ἀέξω → αὐξάνω 35, ἀέκων → ἄκων 34, κεῖνος → ἐκεῖνος 33, ἱρός →
  ἱερός 31; or the treebank's lemma is another word's: χράω for the
  middle forms of χράομαι 124, Ποσειδεών, a month, for Ποσειδῶν 30.
  Wrong cards among them: `φίλτατ’` → φίλως (11), `ἄκουσα` → ἄκων (25 for
  ἀκούω, left out of the exceptions for Attic), `χρυσοῦν` → the noun χρυσός
  (33 for χρύσεος), `ἤρατ’`, `ἦραν` → ἦρα (6), `τοί` → ὁ for the particle
  (29). On main's engine, 95fb1f2's pack gave 9,757 such tokens; the
  lemmas the fifth audit named fell from 340 to 171: ὁρμάω 52 → 5, ἔρδω 32
  → 19 (`ἔοργας` → ὀργάω, `ἔρξαιμι`, `ἔρξαι`, `ἔρξαντα` → ἔργω remain),
  δαμάζω 26 → 8 (`δαμέντε`, `δαμέντι`, `δαμέντων` → δέμω), μέσος 28 → 6,
  τελέω 24 → 15 (`τελεῖσθαι`, `τελεῖς` → τέλλω), φράζω 23 → 17, τίνω 25 →
  18, πάσχω 21 → 14, Ionic πρήσσω 16 → 14 (`πρήσσωμεν`, `πρήσσει` →
  πρήθω), τάσσω 4 → 1, and ἡσσάομαι 4 → 4 (`ἡττημένος` → ἕννυμι).
- **Wrong cards where the dictionary alone has nothing** (`measure.py rules
  --changed 40`: 1,828 frequent-form words in 237 forms, 948 real-text
  lookups in 683 forms), by hand. Many are the right word under another
  headword or spelling (`ἠελίοιο`, `ἠέλιον` → ἥλιος; `κρατερόν` and its
  cases → καρτερός; `νηοῦ`, `νηόν` → νεώς; `Ποτείδαιαν` → Ποτίδαια;
  `χρέωνται` → χράομαι; `τεόν` → σός; `ἔρον` → ἔρως; `διόπερ` → διό, 75
  words) or the exceptions' own conventions (`ἐπεάν` → ἐπήν for the
  treebank's ἐπειδάν). Wrong cards: names wty-grc-en lacks, read as other
  words (`Τίμαιος` → τιμή 14, Herodotus' `Φωκαίην` → Φωκαῖος), `φάτις` →
  φατός 19, `ἀπίθησε` → ἀπειθέω 24 for ἀπιθέω, `προειρημένων` → προλέγω 13,
  `πεπνυμένα` → πνέω 12; and words wty-grc-en does not have, which an
  exception cannot fix because it needs a headword: `ὕπαρχος` → ὑπάρχω,
  `ἀνέκαθεν` → ἀνακαίω, `ἐπεξῆς` → πέκω, `ἔσωθεν` → σῴζω, `εὔνους` → εὐνή,
  `ἀριστήσαντες` → ἀριστεύω (15, 12, 10, 9, 7 and 4 times in the audits'
  held-out Perseus texts). Two-syllable -έω verbs contract only ε + ε and ε
  + ει, but the contract rules apply to any stem (`δῶσιν`, `δοῦσα` → δέω
  for δίδωμι); a stem constraint for that costs 54 KB of
  `tests/classes.json`, over the 1 MB limit.
- **Forms the judge cannot see** (`measure.py rules --changed 40`: the rules
  change the first result and the judge counts both wrong; 575 words in 86
  forms, 130 lookups in 81 forms). By hand, the pack's card is the same
  word under another headword or a fair reading for most: `οἷόν` →
  wty-grc-en's adverb οἷον (32), `πλέον` → πλείων for the treebank's πλέος
  (31), `φαεινῷ` → φανός (27), `αἴης` → γῆ for the treebank's αἶα (19),
  `ἦέ` → ἦ (18), `ἧς`, `ᾗσι` and `ἃ` → the relative for Homer's ἑός (42),
  `κἀμὲ` → ἐμέ (16), `ἐπίπλουν` → ἐπίπλοον (15), `δακρύων` → δακρύω (11),
  `ἀϋτῆς`, `ἀμβροσίην`, `ἐπαΐξας`, `ὅσσά`, `ἐρέει` (8 to 10 each). Wrong
  cards the rules make: `οὔτοι` → οὐτάω "wound" (36; wty-grc-en has no
  οὔτοι), `ἰῷ` → εἷς for ἰός "arrow" (17), `ἄμμε` → ἄμμος "sand" for ἐγώ
  (13), `ἤρα` → ἔαρ (8), `μάρτυροι` → μάρτυς (8).
- **Homer's article and the dative ἕ.** Main's 487a6fc7 ended the ties the
  article and the pronouns lost (`τοῦ`, `τοῖς`, `οἱ` → ὁ, `εἶναι` → εἰμί,
  `σε`, `σοι` → σύ, each once wrong for hundreds of lookups). What remains
  is ambiguous: `οἱ` → ὁ where the treebank has Homer's and Herodotus'
  dative of ἕ "to him" (974 frequent-form words, 111 real-text lookups),
  and `οἳ`, `ἣ`, `οἵ` → the relative ὅς where it has Homer's article (644
  words).
- **The word's own entry for another word** comes first, with no rule and
  no processor step, which no rule can outrank: `τῷ` "then" (344 real-text
  lookups; 1,349 frequent-form words), `ὃ`, `ὅ` "who; which; that" (1,201
  words, 896 of them the article or Homer's demonstrative), `τῇ` "here;
  there" (283; 904), `τοι` "let me tell you" for σύ (611 words), `βῆ` "baa"
  for Homer's βῆ "went" (141), `αὐτοῦ` "here, there" for αὐτός, `τάδε` "on
  this account" and `τόδε` "hither" for ὅδε, `οἷα` and `οἵα` → οἶος
  "alone" for οἷος, `εἶ` the letter epsilon, `θεῖον` "sulphur", `δύναιτο`
  as an optative of δύνω. `ownEntry: "afterReferences"` would put the
  references first, and was measured (Own rules): it also gives `εἰς` "into"
  as εἰμί and `ἄρα` as ἄρον.
- **The dictionary's order**, rules aside: its own form-of rows give
  χράω "attack" before χράομαι "use" for `χρῆσθαι` and `ἐχρήσαντο` (the
  rules read `χρῶνται`, `ἐχρῶντο`, `χρᾶσθαι` and the other middle forms as
  χράομαι), and καδμεία for `Καδμείων`, the adjective Καδμεῖος (13 treebank
  tokens). The exceptions `οὕτω` and `νηός` override the dictionary itself
  (Own rules).
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
  breathing. The exceptions have no spelling without diacritics: with one,
  307 of the 760 real-text lookups of their forms written without
  diacritics would change, 264 to the treebank's lemma and 1 away from it,
  and `sources/own.json` would grow by 6,801 bytes, over the 1 MB limit. Text
  without accents but with breathings is read by the rules and the accent
  transform, the penult of -ος and -ον included (`ἐργου` → ἔργον).
- **Iota adscript** (`λόγωι`, `τιμῆι`, capitals `ΤΩΙ`) is not read as the
  subscript, except the forms of ᾍδης, which are exceptions (`Ἅιδου`).
- **A closing single quotation mark** U+2019 after a word (‘λόγος’) is read
  as an elision mark, so the word finds nothing.
- **Options**: `capitalizedNames` (a name written in lower case) doubles a
  lookup's work and is off; `doricAlpha` (δίκα → δίκη) and `duals` are off.
- **Names** have no rules of their own. The rules for common nouns read a
  capitalised word through `decapitalize`, and where wty-grc-en has a
  common word of the same letters a rule finds it before the name's
  form-of row is followed. The two then tie on every other key, so the
  common word came first though the dictionary alone shows the name:
  `Κύπρου` → κύπρος "henna", `Φᾶσιν` → φάσις, `Νίνου` → νίνον, `Κρέοντι` →
  κρέων, `Θήρας` → θήρ, `Ἀκάνθου` → ἄκανθος, `Πάρον` → πάρειμι, `Ἀθήνῃσι`
  → Ἀθηναία. These, with `Νίνον` and `Κρέοντα`, are now exceptions, and so
  is `Κύρου` → Κῦρος, which main's tie-breaks put after κύρω; other names
  are not (`Πακτύην` → the place Πακτύη, in the sample of Measurements 4).
- **Elision** is restored only after a stem with an accent or breathing, so
  an elided word without diacritics (`γενοιτ’`) is not read.
