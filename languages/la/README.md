# Latin (`la`)

Deinflection for Latin, written for wiktionary-to-yomitan's Latin
dictionaries, which spell headwords without macrons, with i for consonantal i
and v for consonantal u. The processors bring text to that spelling: they
remove macrons and other accents, write æ and œ out, read j as i and u as v,
handle capitals, and take off the enclitics -que, -ne and -ve. The rules are
this pack's own. Yomitan's eight Latin rules are left out; the six that an own
rule repeats are marked `both`.

## Sources and licences

Files in this directory:

- `sources/own.json` and `transforms.json`: written for this pack,
  GPL-3.0-or-later. `sources/build-own.mjs` writes `own.json` from paradigm
  tables that follow Allen and Greenough's *New Latin Grammar* (1903),
  Gildersleeve and Lodge's *Latin Grammar* (1895) and Wiktionary's Latin
  declension and conjugation tables; no text or table is copied from them.
  `sources/build-final.mjs` writes `transforms.json` and
  `sources/yomitan-provenance.tsv`.
- `sources/yomitan.json`: Yomitan's Latin rules, ported by
  `tools/port-yomitan-transforms.mjs` from
  [ext/js/language/la/latin-transforms.js](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/la/latin-transforms.js)
  at d3c54c1, GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan Authors.
- `language.json`: the processors `removeAlphabeticDiacritics`,
  `processDiphtongs`, `decapitalize` and `capitalizeFirstLetter` are ported,
  with Yomitan's ids, from
  [ext/js/language/la/latin-text-preprocessors.js](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/la/latin-text-preprocessors.js)
  and
  [ext/js/language/text-processors.js](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/text-processors.js)
  at d3c54c1, GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan Authors.
  `jToI`, `uToV` and `enclitics` are this pack's.
- `tests/corpus.tsv` and `tests/gaps.tsv`: 950 form → lemma rows sampled with
  seed 1 by `sources/build-corpus.mjs`; the 896 rows the final rules reach are
  in `corpus.tsv`, the 54 others in `gaps.tsv`. Terms are lemmas without
  macrons. Two sources, both from English Wiktionary:
  - [UniMorph lat](https://github.com/unimorph/lat/blob/050924c9f013e6aba4d7c87be243a1d79b6c5b10/lat)
    at 050924c (sha256
    7aed5a2fd17c29474e85e315d42654d1794a3d3efc956b387714ca601a608a2b),
    CC BY-SA 3.0, by the UniMorph contributors: 740 rows in seven strata, nouns
    230, proper nouns 50, adjectives 110, participles 90, active finite verbs
    150, passive finite verbs 70, and infinitives, gerunds and supines 40.
  - kaikki.org's Latin extract of English Wiktionary
    ([kaikki.org-dictionary-Latin.jsonl.gz](https://kaikki.org/dictionary/Latin/kaikki.org-dictionary-Latin.jsonl.gz),
    2026-10-30, sha256
    621efbea7ffcec747aa39d03fbf54eb316de47a9af9cf7fa5a0a95a9fbf19b1a),
    CC BY-SA 4.0 and GFDL, by the Wiktionary contributors, extracted by
    wiktextract (Tatu Ylonen): 210 rows, active perfect-system verbs 160
    (UniMorph lat has 13 perfect forms), comparatives and superlatives 25, and
    pronouns and determiners 25.
- `tests/cases.tsv` (1,046 rows: 1,014 positive, 32 negative), `tests/text.tsv`
  (38 rows), `tests/lookup.tsv` (41 rows) and `tests/dictionary/` (a tiny
  dictionary for `lookup.tsv`, tagged as wty-la-en tags its rows): written
  for this pack, GPL-3.0-or-later, no third-party data.
- `tests/yomitan.tsv`: Yomitan's 7 Latin test cases from
  [test/language/latin-transforms.test.js](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/latin-transforms.test.js)
  at d3c54c1, ported by `tools/port-yomitan-tests.mjs`, GPL-3.0-or-later,
  Copyright (C) 2023-2026 Yomitan Authors and 2020-2022 Yomichan Authors.
  Their reasons are `*`, because the final rules reach the lemmas through own
  transforms.
- `tests/classes.json`: written by `tools/check-classes.mjs`.
- `sources/yomitan-constructed.tsv`: 80 forms, ten lemmas for each Yomitan
  rule, written for this pack.
- `sources/benchmark-words.txt`: 80 texts, each the rest of a sentence from an
  inflected word, from Caesar's *Commentarii de Bello Gallico*, books V-VIII
  ([Project Gutenberg 18837](https://www.gutenberg.org/ebooks/18837)), public
  domain.
- `sources/build-corpus.mjs`, `sources/measure.py`, `sources/mutate.py` and
  `sources/wasm-measure.mjs`: written for this pack, GPL-3.0-or-later.

Inputs measured with and not committed:

- **Dictionary**: wty-la-en, revision 2026.10.22, from
  [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan)
  ([download](https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/la/en/wty-la-en.zip)),
  26,430,257 bytes, sha256
  f354bb2aeb57282e04ae3671f6c83772de51b7b410cfd5d872e1d1b239d881b0,
  CC BY-SA 4.0, by the Wiktionary contributors via kaikki.org. It has
  1,977,517 term rows: 59,990 with definitions and 1,917,527 that only hold
  form-of references. Its `rules` column tags verbs, nouns, adjectives and
  adverbs (`v`, `n`, `adj`, `adv`); names, pronouns, determiners,
  prepositions and conjunctions have none. Every number below uses it as
  published.
- **Frequency list**: `sources/measure.py freq` over 18 Project Gutenberg
  Latin ebooks (16439, 17859, 218, 226, 227, 231, 23294, 23306, 27219, 30345,
  33849, 48681, 50732, 51812, 56744, 57232, 57615, 73030), public domain in
  the United States: 1,020,914 tokens, 127,071 word forms (the list's sha256
  is 9b4ed8f428e8fd58ff1debacf7d45269e01282ee509b606d775ad7edab99b9e7). Its
  10,000 most frequent words cover 743,438 tokens.
- **Real text**, left out of the frequency list: *Insula thesauraria*, Arcadius
  Avellanus's Latin translation of Stevenson's *Treasure Island*
  ([PG 68935](https://www.gutenberg.org/ebooks/68935), sha256
  72e9e49672009ffdeffe129c1d33b28c383f82b7c8ed5038cdab06b2fae81af3), and
  Caesar's *Commentarii de Bello Gallico* V-VIII
  ([PG 18837](https://www.gutenberg.org/ebooks/18837), sha256
  8bae4d88747b318b58ea193f981766fed337ddf613df452c1a06d72c9af75ffd), public
  domain: 101,097 positions.
- **Sentence corpus**: Tatoeba's Latin sentences (`lat_sentences.tsv.bz2` from
  https://downloads.tatoeba.org/exports/per_language/lat/, downloaded
  2026-11-03, sha256
  5202171bc8f1aff83cf4cd1f1b75afeed0dd0b39eebc46f9e5496556c4435472),
  56,798 sentences, CC BY 2.0 FR, by the Tatoeba contributors: 307,656
  positions.

## Rule provenance

`transforms.json` has 218 transforms and 3,163 rules, 5,159 with the circumfix
cross products expanded: 3,157 `own`, 6 `both` and no `yomitan` rule.
`sources/build-final.mjs` writes it: `sources/own.json` with the six own rules
that make the same deinflection as a Yomitan rule marked `both`.
`tools/merge-transforms.mjs` compares rules literally and marks none `both`;
its union of the two files has 222 transforms and 3,171 rules (3,163 `own`,
8 `yomitan`).

- **`both`**. Each own rule has the stem constraints its Yomitan rule lacks:
  a stem of at least two letters, with no space in it (and, for noun
  endings, no capital letter).

  | Yomitan rule | Own rule |
  | --- | --- |
  | `plural` `i` → `us` (n2p → n2s) | `n-gen-sg+n-nom-pl` `i` → `us` |
  | `plural` `i` → `us` (adj12) | `adj-i` `i` → `us` |
  | `plural` `e` → `""` (n1p → n1s) | `n-gen-sg+n-dat-sg+n-nom-pl` `ae` → `a` |
  | `feminine` `a` → `us` | `adj-a` `a` → `us` |
  | `neuter` `um` → `us` | `adj-um` `um` → `us` |
  | `ablative` `o` → `um` | `n-dat-sg+n-abl-sg` `o` → `um` |

  Yomitan's other two rules, adjective `plural` `ae` → `a` and `a` → `um`,
  make an intermediate form that the own rules skip: they read *magnae* as
  *magna* and then *magnus*, the own rules read *magnae* as *magnus*.
  `sources/yomitan-provenance.tsv` lists each Yomitan rule with its own rule.
- **Yomitan rules left out**: all eight.
  - Per rule (`eval-language --per-rule` on the union, over the sample,
    `cases.tsv`, the constructed forms and `yomitan.tsv`, 2,083 rows):

    | Yomitan rule | Rows only it recovers | False candidates only it adds | Negatives broken |
    | --- | ---: | ---: | ---: |
    | `plural` `i` → `us` (noun) | 0 | 2 | 0 |
    | `plural` `i` → `us` (adjective) | 0 | 0 | 0 |
    | `plural` `e` → `""` | 1 | 2 | 0 |
    | `plural` `ae` → `a` | 0 | 3 | 0 |
    | `plural` `a` → `um` | 0 | 1 | 0 |
    | `feminine` | 0 | 0 | 0 |
    | `neuter` | 0 | 0 | 0 |
    | `ablative` | 2 | 0 | 0 |

  - The union reaches four sample rows more than the final set (900 against
    896), all names: *Bagdadō* → Bagdadum and *Bēthlehēmō* → Bethlehemum
    (`ablative`), *Solomōne* → Solomon (`plural` `e` → `""`) and *Brūnōnis
    vīcī* → Brunonis vicus (`plural` `i` → `us`). Those readings carry `n2s`
    or `n1s`, and wty-la-en gives names no part of speech, so the
    part-of-speech filter drops them: the four lookups return the same results
    with both sets, the names through the dictionary's form-of rows.
  - Constructed forms (`sources/yomitan-constructed.tsv`, 80 rows): the final
    set, Yomitan's rules and the union all reach 80 of 80, with first rank
    70.0%. False candidates per row are 2.075 for the final set and the union
    and 1.175 for Yomitan's rules.
  - Real text: the union changes the first result at 40 of the 10,000
    frequent words, 259 book positions and 383 Tatoeba positions. At 645 of
    those 682 places it puts another lemma first that the dictionary also
    names: Yomitan's `ablative` reads *summō* as the noun summum before the
    adjective summus, because the union puts Yomitan's transforms first and
    the final set puts its adjective transforms first. It adds wrong first
    results: 9 of the 10,000 words against 8, 80 in the books against 70 and
    155 in Tatoeba against 152 (*ti* → thus, *Re* → R, *Maiora* → Maius, *pi*
    → pus). It fixes three in Tatoeba (*ahena* → aenum twice, *foeno* →
    faenum).
  - Lookup speed (Measurements 5): union p50 61-72 µs against 54-67 µs.
- **Own rules**: one transform per case and number or per tense, mood, voice
  and person, so a trace names the form (`present, 3rd pl`, `accusative
  singular`). Identical rules from several forms are one transform whose id
  joins the ids with `+` (`n-gen-sg+n-nom-pl`, named "genitive singular /
  nominative plural"). They cover:
  - the five declensions, including Greek nouns and plural-only nouns;
  - adjectives of the first/second and third declensions, comparatives,
    superlatives and adverbs;
  - the four conjugations and the -iō verbs of the third, in every tense, mood
    and voice, with deponent verbs;
  - perfects in two steps: the ending to the first person in -ī, then
    `perf-stem` (292 rules: the regular stems and a table of irregular ones,
    with their compounds) to the lemma (*dūxit* → *dūxī* → duco, *attulit* →
    affero, *trānsiistī* → transeo);
  - participles, gerunds, gerundives, supines and infinitives, and a
    participle or gerundive with a form of esse read as one verb (`esse`:
    *laudātus est* → laudo);
  - sum, possum, eō, ferō, volō, nōlō, mālō, fīō, dō and their compounds,
    written as whole words or circumfixes;
  - pronouns and determiners; names of the first and third declensions, with
    the Greek -ās, -ēs and -ōn, and Iuppiter, Iesus and Iuno (second-declension
    names are left to the dictionary's form-of rows);
  - the enclitics -cum (`mēcum` → ego), -met and -nam; -que, -ne and -ve are a
    processor (`enclitics`), so every reading of the word before them stays.
- **Constraints**. Each stem constraint, exclusion and processor has a row
  that fails without it: `sources/mutate.py` removes each in a scratch copy,
  writes `tests/classes.json` and runs the conformance test, and all 29 edits
  fail it.
  - Noun and verb endings of three letters or fewer need a stem of two
    letters without a space or a capital (`stemCharacters "[^ A-Z]"`); other
    endings of two letters or fewer need one without a space. Without them
    *ad me* reads as *ad mus* and *Credis* as *Cres*.
  - Exclusions by stem: `dom-` (*domini* is not domo), `cet-` (*cetera* is
    not cetus), -inis → -o only after b, d, g, l and m (*vicini* is not vico),
    -uī → -ō only after l, m, p, r and x (*potui* is not poto), and the
    contracted perfects of -ōvī only after n (*nōrat* → novi) and of -ēvī only
    after l (*laborat* is not labovi, *adesse* not adevi).
  - A participle before esse needs a lowercase stem (*Musa sum* is not
    Musus); compounds need a prefix of two letters (*legi* is not ligo).
  - Name rules have no conditions (the dictionary tags no name), apply only to
    a capitalised word, and none outputs an ending another name rule removes:
    rules that fed each other made the engine loop and crash on *Romam*
    (reported to the framework).
- **How the rules changed**, with the wrong first results as the judge of
  Measurements 4 counted them at each commit:
  - 6e9db52: name rules restricted, 271 → 106 in the books;
  - f00fd7b: adjective transforms before noun transforms on ties, 106 → 96;
  - c074378: capital guards, constraints on participles before esse,
    exclusions, 388 → 198 in Tatoeba;
  - ed1652f: the enclitics as a processor, plural names removed: 8 of the
    10,000 frequent words, 70 in the books and 152 in Tatoeba, the numbers
    below. Later commits change tests and scripts, not rules.

## Measurements

hoshidicts at 8d5c591 (this branch on b145feb), GCC 14.3, Release; wty-la-en
imported by `hoshidicts-cli import`, as published. The sample is the 950 rows
of `corpus.tsv` and `gaps.tsv` together. Section 6 gives the commands.

1. **`eval-language --dictionary`**. The pack has no optional processor,
   transform or variant pass, so each file with `# options: default` added
   gives the same numbers as without it (16 pairs, all identical). Columns:
   recall (rows), false candidates per row, first rank.

   | Rule set | Sample (950) | `cases.tsv` positives (1,014) | `cases.tsv` negatives (32) | `yomitan.tsv` (7) | Constructed (80) |
   | --- | --- | --- | ---: | --- | --- |
   | Own (`sources/own.json`) | 94.32% (896), 1.213, 80.0% | 100% (1,014), 1.837, 66.6% | 32 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |
   | Yomitan (`sources/yomitan.json`) | 7.79% (74), 0.682, 79.9% | 4.54% (46), 1.044, 64.5% | 32 | 100% (7), 1.571, 85.7% | 100% (80), 1.175, 70.0% |
   | Union (merge tool) | 94.74% (900), 1.216, 80.1% | 100% (1,014), 1.841, 66.5% | 32 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |
   | Final (`transforms.json`) | 94.32% (896), 1.213, 80.0% | 100% (1,014), 1.837, 66.6% | 32 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |

   The final set is the own set with provenance marks, so its numbers are the
   own set's.
   - **Per rule** (final set, sample and `cases.tsv`, 1,996 rows): 876 of the
     3,163 rules recover a row no other path reaches, and none breaks a
     negative. 90 rules add false candidates without recovering a row, 241 of
     the 1,165 false candidates a single rule adds. The largest are `qui` →
     `quis` (25; Known gaps), the third-conjugation present `is` → `o` (12),
     the third-declension genitive plural `um` → `is` (11), the
     fourth-declension neuter genitive `us` → `u` (10) and the
     first-conjugation subjunctive `em` → `o` (10). They are regular endings
     of whole classes, and they are kept. Without all 90 (a copy of
     `transforms.json` without the rules whose `--per-rule` entry has
     `recovers` 0 and `falseCandidates` above 0), recall falls to 895 and
     1,013 rows and false candidates to 1.155 and 1.650 per row. Real text
     has 11 fewer wrong first results in the books (70 → 59) and in Tatoeba
     (152 → 141) and one fewer among the 10,000 words (8 → 7), but 50 more
     book positions and 100 more Tatoeba positions find nothing, and 26
     fewer Tatoeba positions find the right lemma first.
   - **First rank** (the sample looked up whole, `measure.py first`): the
     lemma is first for 760 rows. For 115 it is not among the results, because
     the dictionary's form-of rows name another spelling of it (UniMorph keeps
     *inplicātiōnis* → inplicatio, wty-la-en has implicatio). For 67 another
     term comes first (*apiārium*: the noun apiarium before the adjective
     apiarius). 8 have no result for the whole source.
2. **Frequent forms**. Of the list's 10,000 most frequent words, a rule reaches
   the lemma of 7,847 (432,043 tokens): a form-of row of the word or a row of
   `corpus.tsv` or `cases.tsv` names a lemma among the deinflections of the
   word. The first result with a definition is a wrong lemma for 4 of them,
   121 tokens: 0.016% of the 10,000 words' tokens, 0.012% of the list's.
   They are *existere* → exeo (53), *jure* → iuro (39), *MARONIS* → marum (16)
   and *tubulorum* → tubula (13). 3 find nothing (44 tokens). The union reaches
   7,849 words and has the same 4 wrong; Yomitan's rules reach 1,942 and have
   none wrong.

   Over all 10,000 words, the first result is wrong for 8 (540 tokens): the
   four above, *quę* and *que* → queo (122), *CURTIUS* → curtus (243) and
   *ārī* → aris (54). 482 words (28,051 tokens) find nothing; they are the
   books' apparatus (*EV*, *Sidenote*, *Mss*, *cf*), Roman numerals and
   English. 33 cannot be judged by script.
3. **Enclitics, pronouns and the auxiliary** in Tatoeba (Latin has no
   articles). Positions by kind, with their right and wrong first results:

   | Kind | Positions | Right | Wrong |
   | --- | ---: | ---: | ---: |
   | Word with -que, -ne or -ve that the dictionary lacks whole (*virumque*) | 4,311 | 4,305 | 4 |
   | Participle or gerundive with a form of esse, read as one verb | 4,957 | 4,892 | 47 |
   | Form of ego, tu, sui, nos, vos, is, hic, ille, iste, ipse, idem, qui or quis | 31,565 | 31,187 | 0 |
   | Form of esse | 22,523 | 22,170 | 0 |

   The rest find nothing, find a phrase entry first, or cannot be judged. In
   the books: 1,421 enclitic positions (2 wrong), 639 esse readings (14
   wrong), 10,308 pronoun forms and 3,167 forms of esse (none wrong). The
   union gives the same numbers. Yomitan's rules have no esse rule and find
   4,299 of the enclitic positions right, 0 wrong.
4. **Real text** (*Insula thesauraria* and *De Bello Gallico* V-VIII, every
   word looked up with the rest of its sentence): 101,097 lookups.
   - By script, 96,228 first results are judged, because a form-of row or a
     definition row of the word names its lemma: 96,158 are right and 70 wrong
     (0.073%). For 34 of the 70 a right lemma ties with the wrong one. The
     dictionary's own phrase entries come first at 736 positions (*in medio*,
     *non modo*), and 3,596 find nothing.
   - By hand, a random sample of 60 (seed 1) of the 537 the script cannot
     judge: 42 right, 18 wrong. 10 of the wrong ones are not Latin words
     (fragments such as *mationem*, English *the*, abbreviations, the
     numeral *VII*), 8 are names, late spellings or New Latin (*Attium* →
     atta, *querit* → queror, *fumam* → fumo). That puts about 161 wrong among
     the 537 and about 231 among all lookups (0.23%).
   - The groups (first step of the trace): esse 14, `n-gen-pl` 11
     (*charum* → chara, *humerum* → humus), `adj-i` 7 (*diversorii* →
     deversorius), `imp-2s` 6 (*que* → queo, *coe* → coeo).
   - Tatoeba, 307,656 lookups: 299,187 judged, 299,035 right and 152 wrong
     (0.051%), 82 of them with a right lemma tied; 2,857 phrase entries;
     4,977 find nothing; 635 not judged. Groups: esse 47, `name-acc-sg` 10
     (*Leonem* → Leo), `imp-2s` 9, `adj3-i` 9 (*Itali* → italis),
     `name-dat-sg` 7, `plupf-2s` 7 (*literas* → litus), `adj-a` 7, `perf-3s` 7
     (*existit* → exeo).
   - Union: 80 wrong in the books, 155 in Tatoeba. Yomitan's rules: 24 and
     17 wrong, but 4,660 and 6,519 positions find nothing (3,596 and 4,977 for
     the final set), and 598 and 819 fewer are right.
5. **Performance** (section 13; budgets 1 ms p50, 50 ms load, 20 MB heap; the
   pack has no `pattern` rule).
   - Native `benchmark-lookup` (wty-la-en mapped, the 80 texts of
     `sources/benchmark-words.txt`, 6 passes with the first dropped, three
     runs at machine load 32 to 46):

     | Rule set | p50 | p95 |
     | --- | ---: | ---: |
     | Final | 54-67 µs | 309-386 µs |
     | Union | 61-72 µs | 348-378 µs |
     | Yomitan's rules | 32-33 µs | 173-180 µs |

   - WebAssembly (`sources/wasm-measure.mjs`, Hachidori feat/multi-language
     803f7b6e prebuilt engines, Node 22.23.1, the same texts, wty-la-en mapped
     from MEMFS, two runs at load 33):
     - `hdw_lookup`: p50 0.143-0.149 ms and p95 0.722-0.761 ms single-thread;
       p50 0.149-0.157 ms and p95 0.732-0.843 ms threaded.
     - `hdw_language_load`: median 12.9-13.0 ms single-thread and 13.8-14.0 ms
       threaded over 10 fresh engines, at most 19.4 ms.
     - Live heap after the load: +1,337,416 bytes single-thread, +1,337,256
       threaded (`hdw_memory_stats`).
   - Hachidori (`test/chrome-language-pack.mjs`, feat/multi-language 803f7b6e
     with this branch in `third_party/hoshidicts` at 07db33f, before the
     rebase onto b145feb, whose `language.json` and `transforms.json` are this
     head's; Chrome 152.0.7977.75): 19 of 19 checks pass. Settings adds
     Latin beside Japanese and imports wty-la-en (1,977,517 terms, 2.3 s);
     15 hovered words find their lemma first with their trace
     (*virumque* → vir, *dūxit* → duco, *vīcērunt* → vinco); the Anki note and
     the switch to Japanese and back work.
6. **Commands**. From the repository root, with `D` the imported dictionary,
   `G` the Gutenberg texts and `W` a scratch directory:

   ```sh
   cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DHOSHIDICTS_TESTS=ON \
     -DHOSHIDICTS_LANGUAGE_TESTS=ON -DHOSHIDICTS_CLI=ON -DHOSHIDICTS_BENCHMARK=ON
   cmake --build build --parallel 8
   build/hoshidicts-cli import wty-la-en.zip $W/dicts            # D=$W/dicts/wty-la-en
   # lookup-batch: build as its header says (languages/en/sources/lookup-batch.cpp)

   # Rule sets and corpus
   node languages/la/sources/build-own.mjs && node languages/la/sources/build-final.mjs
   node languages/la/sources/build-corpus.mjs unimorph-lat/lat kaikki.org-dictionary-Latin.jsonl.gz
   node tools/merge-transforms.mjs la --out $W/union.json

   # 1. Each set (own.json, yomitan.json, union.json, transforms.json) on each file
   (cat languages/la/tests/corpus.tsv; grep -v '^#' languages/la/tests/gaps.tsv) > $W/sample.tsv
   build/hoshidicts-cli eval-language la $W/sample.tsv --transforms <set> --dictionary $D
   #    the same for tests/cases.tsv, tests/yomitan.tsv and sources/yomitan-constructed.tsv,
   #    and for a copy of each with '# options: default' as its first line; --per-rule on
   #    sample + cases (final) and sample + cases + constructed + yomitan.tsv (union)
   grep -v '^#' $W/sample.tsv | cut -f3 | build/lookup-batch languages la $D 16 64 > $W/sample.jsonl
   python3 languages/la/sources/measure.py first $W/sample.tsv $W/sample.jsonl

   # 2-4. Inputs, lookups and judgement
   M=languages/la/sources/measure.py
   python3 $M headwords wty-la-en.zip $W/headwords.pickle
   python3 $M freq $W/freq.tsv $G/pg{16439,17859,218,226,227,231,23294,23306,27219,30345,33849,48681,50732,51812,56744,57232,57615,73030}.txt
   head -10000 $W/freq.tsv | cut -f1 > $W/top10k.txt
   python3 $M hovers $W/books.txt $G/pg68935.txt $G/pg18837.txt
   python3 $M hovers $W/tatoeba.txt --tatoeba lat_sentences.tsv
   build/lookup-batch languages la $D 16 16 < $W/top10k.txt > $W/top10k.jsonl      # and books, tatoeba
   #    union and Yomitan's rules: a copy of languages/ whose la/transforms.json is that set
   python3 $M judge $W/headwords.pickle $W/top10k.txt $W/top10k.jsonl --transforms languages/la/transforms.json \
     --freq $W/freq.tsv --top 10000 --show 20 [--reach build/hoshidicts-cli --languages languages \
     --corpus languages/la/tests/corpus.tsv,languages/la/tests/cases.tsv]
   python3 $M judge $W/headwords.pickle $W/books.txt $W/books.jsonl --transforms languages/la/transforms.json \
     --kinds 1 --show 20 [--sample 60 --sample-out $W/unjudged.jsonl --seed 1]   # and tatoeba

   # 5. Speed
   build/benchmark-lookup languages/la/sources/benchmark-words.txt 6 --languages languages --language la --term $D --json
   node --max-old-space-size=8192 languages/la/sources/wasm-measure.mjs <hachidori> languages/la $D \
     languages/la/sources/benchmark-words.txt 10 6

   # Checks
   node tools/check-classes.mjs la && build/language-conformance-test languages/la
   node tools/check-yomitan.mjs <yomitan d3c54c1> la --cli build/hoshidicts-cli
   python3 languages/la/sources/mutate.py . $W/mutants
   ```

   - **Conformance** (`language-conformance-test`): `corpus.tsv` 896 / 896,
     `cases.tsv` 1,046 / 1,046, `yomitan.tsv` 7 / 7, `text.tsv` 38 / 38,
     `lookup.tsv` 41 / 41; `gaps.tsv` 0 / 54 (reported). `classes.json` agrees
     with the engine (3 classes, 785 fields, 2 steps). 1,299 of the 5,159
     rules are exercised by a passing row. `tests/` and `sources/` hold
     997,979 bytes.
   - **Differential check** (`tools/check-yomitan.mjs`): 3,200 inputs and
     4,740 Yomitan results with no difference; the four processors agree with
     Yomitan's on 2,069 to 2,856 inputs each.

## Known gaps

- **Sampled forms the rules do not reach** (`gaps.tsv`, 54 of 950):
  - proper nouns, 21 of 50: names declined like common nouns (*Cemenelī* →
    Cemenelium, *Agathoclī* → Agathocles, *Pallēnēn* → Pallene). The name rules
    are kept narrow (Rule provenance), so most names are found through the
    dictionary's form-of rows (*Latiō* → Latium, *Herculis* → Hercules,
    *Achillī* → Achilles), not through rules;
  - pronouns and determiners, 12 of 25: rare compounds (*ipsamet*, *seipsum*,
    *quamcumque*, *nesciōquōs*, *hunce*, *illucce*, *sibimet*, *nēcui*);
  - nouns, 8 of 230: entries of two words (*fasciculī arcuātī*, *accentibus
    gravibus*), Greek nouns (*galaxiārum* → galaxias, *neī* → neon), *pūrum* →
    pus and *Mārpōrēs* → Marpor;
  - perfects, 5 of 160: *internecuissem* → interneco, *adolēram* → adolesco,
    *ēmulserat* → emulgeo, *quaesieram* → quaeso, *Sūtrium iēre* → Sutrium eo;
  - comparison, 4 of 25: *medioximus* → medius, *dulcissimus* → dulcior (whose
    lemma is the comparative), *summē pius* → pius, *benedīcentior* →
    benedicus;
  - passive and non-finite verbs, 4 of 110: *excalfīat* and *excalfītō* →
    excalfacio, *connītundus* → connitor, *obsolefactum* → obsolefio.
- **Ties** decide 82 of Tatoeba's 152 wrong first results and 34 of the
  books' 70: a right lemma has the same matched length, processor steps and
  trace length. The engine then ranks first a row whose reading equals its
  expression (section 9.6). wty-la-en's entries for passive first persons
  (*necor*, *capior*, *toleror*, *maneor*, *demonstror*) have no reading, so a
  participle with esse reads as them before the active verb: *necatus est* →
  necor before neco. Other ties keep discovery order: *electus est* → elego
  before eligo, *Leonem* → Leo before leo.
- **Esse readings of adjectives and nouns**: *invitus sum* → invio,
  *servitus est* → servio, *simplicitas est* → simplico. Some esse readings the
  script counts wrong are right by the grammar, where wty-la-en names an
  adjective or another verb as the lemma: *tuta est* → tueor, *quietus sis* →
  quiesco, *eventus fuisset* → evenio, *occasus erit* → occido.
- **Spellings the dictionary does not name**: *literas* → litus (7 in
  Tatoeba), *seculorum* → secula, *que* (for quae) → queo, and *jure* → iuro:
  the rules read *jure* as written before the processed *iure* is looked up,
  because a processor step ranks after a reading without one.
- **Capitals**: a capitalised word is also read as a name, and the name can
  come first. Most of Tatoeba's `name-acc-sg` (10) and `name-dat-sg` (7) wrong
  first results are words capitalised at the start of a sentence (*Leonem* →
  Leo, *Cantabam* → Cantabas, *Actioni* → Actium). Reading such capitals is a
  Hachidori follow-up.
- **Conjugation classes**: wty-la-en tags every verb `v`, so the endings of one
  conjugation also apply to verbs of the others: *jure* → *juro* (above) uses
  the third-conjugation imperative of a first-conjugation verb.
- **Intermediate forms the dictionary also has**: the perfect endings make
  *existi* of *existere* and *existit*, and wty-la-en lists *existi* as a
  perfect of exeo, so both read as exeo: *existere* (53 tokens of the list)
  and *existit* (7 in Tatoeba).
- **Pronouns and names have no part of speech** in wty-la-en, so their rules
  have no conditions and their outputs feed the noun and verb rules: `qui` →
  `quis` → `qui` → `quo` gives 25 false candidates (Measurements 1).
  `lookup.untaggedTerms: "pass"` (bee-san/hoshidicts#58, not on main) would
  let these rules carry a condition.
- **WebAssembly with paged storage**: `hdw_add_dict` with paged entries and
  index returned no results in Node, so only mapped storage is timed. This was
  not investigated.
