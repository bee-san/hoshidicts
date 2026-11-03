# Latin (`la`)

Deinflection for Latin, written for wiktionary-to-yomitan's Latin
dictionaries, which spell headwords without macrons, with i for consonantal i
and v for consonantal u. The processors bring text to that spelling: they
remove macrons and other accents, write æ and œ out, read j as i, u as v and
a capital V as U, handle capitals, and take off the enclitics -que, -ne and
-ve. The rules are
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
  `jToI`, `vToU`, `uToV` and `enclitics` are this pack's.
- `tests/corpus.tsv` and `tests/gaps.tsv`: 700 form → lemma rows sampled with
  seed 1 by `sources/build-corpus.mjs`; the 658 rows the final rules reach are
  in `corpus.tsv`, the 42 others in `gaps.tsv`. (The sample was 1,000 rows and
  then 950; it shrank to keep `tests/` and `sources/` under 1 MB.) Terms are lemmas without
  macrons. Two sources, both from English Wiktionary:
  - [UniMorph lat](https://github.com/unimorph/lat/blob/050924c9f013e6aba4d7c87be243a1d79b6c5b10/lat)
    at 050924c (sha256
    7aed5a2fd17c29474e85e315d42654d1794a3d3efc956b387714ca601a608a2b),
    CC BY-SA 3.0, by the UniMorph contributors: 540 rows in seven strata, nouns
    165, proper nouns 35, adjectives 80, participles 65, active finite verbs
    110, passive finite verbs 55, and infinitives, gerunds and supines 30.
  - kaikki.org's Latin extract of English Wiktionary
    ([kaikki.org-dictionary-Latin.jsonl.gz](https://kaikki.org/dictionary/Latin/kaikki.org-dictionary-Latin.jsonl.gz),
    2026-10-30, sha256
    621efbea7ffcec747aa39d03fbf54eb316de47a9af9cf7fa5a0a95a9fbf19b1a),
    CC BY-SA 4.0 and GFDL, by the Wiktionary contributors, extracted by
    wiktextract (Tatu Ylonen): 160 rows, active perfect-system verbs 120
    (UniMorph lat has 13 perfect forms), comparatives and superlatives 20, and
    pronouns and determiners 20.
- `tests/cases.tsv` (1,089 rows: 1,032 positive, 57 negative), `tests/text.tsv`
  (40 rows), `tests/lookup.tsv` (67 rows) and `tests/dictionary/` (a tiny
  dictionary of 92 rows for `lookup.tsv`, tagged as wty-la-en tags its rows,
  with form-of rows): written for this pack, GPL-3.0-or-later, no third-party
  data.
- `tests/yomitan.tsv`: Yomitan's 7 Latin test cases from
  [test/language/latin-transforms.test.js](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/latin-transforms.test.js)
  at d3c54c1, ported by `tools/port-yomitan-tests.mjs`, GPL-3.0-or-later,
  Copyright (C) 2023-2026 Yomitan Authors and 2020-2022 Yomichan Authors.
  Their reasons are `*`, because the final rules reach the lemmas through own
  transforms.
- `tests/classes.json`: written by `tools/check-classes.mjs`.
- `sources/yomitan-constructed.tsv`: 80 forms, ten lemmas for each Yomitan
  rule, written for this pack.
- `sources/homographs.tsv`: 253 frequent words whose wty-la-en rows name
  several lemmas, each with the lemmas a reader of ordinary prose needs,
  judged by hand for this pack (Measurements).
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

`transforms.json` has 218 transforms and 3,199 rules, 5,195 with the circumfix
cross products expanded: 3,193 `own`, 6 `both` and no `yomitan` rule.
`sources/build-final.mjs` writes it: `sources/own.json` with the six own rules
that make the same deinflection as a Yomitan rule marked `both`.
`tools/merge-transforms.mjs` compares rules literally and marks none `both`;
its union of the two files has 222 transforms and 3,207 rules (3,199 `own`,
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
    `cases.tsv`, the constructed forms and `yomitan.tsv`, 1,876 rows):

    | Yomitan rule | Rows only it recovers | False candidates only it adds | Negatives broken |
    | --- | ---: | ---: | ---: |
    | `plural` `i` → `us` (noun) | 0 | 2 | 0 |
    | `plural` `i` → `us` (adjective) | 0 | 0 | 0 |
    | `plural` `e` → `""` | 1 | 2 | 0 |
    | `plural` `ae` → `a` | 0 | 3 | 1 |
    | `plural` `a` → `um` | 0 | 1 | 0 |
    | `feminine` | 0 | 0 | 0 |
    | `neuter` | 0 | 0 | 0 |
    | `ablative` | 2 | 0 | 0 |

  - The union reaches three sample rows more than the final set (661 against
    658): *Bagdadō* → Bagdadum and *Bēthlehēmō* → Bethlehemum (`ablative`)
    and *Solomōne* → Solomon (`plural` `e` → `""`). Those readings carry
    `n2s` or `n1s`, and wty-la-en gives names no part of speech, so the
    part-of-speech filter drops them: the lookups return the same results
    with both sets, the names through the dictionary's form-of rows. The
    union breaks 2 of the 57 negatives of `cases.tsv`: *patriae* → patrius
    and *bella* → bellus, through Yomitan's `plural` and `neuter`.
  - Constructed forms (`sources/yomitan-constructed.tsv`, 80 rows): the final
    set, Yomitan's rules and the union all reach 80 of 80, with first rank
    70.0%. False candidates per row are 2.075 for the final set and the union
    and 1.175 for Yomitan's rules.
  - Real text (judged as Measurements 2-4 judge it): the union shows a wrong
    first result for 41 of the 10,000 frequent words (6,706 tokens) against
    34 (6,047), at 831 book positions against 664 and at 3,308 Tatoeba
    positions against 3,206. Yomitan's `ablative` reads *summō* as the noun
    summum before the adjective summus, because the union puts Yomitan's
    transforms first and the final set puts its adjective transforms first.
  - Lookup speed (Measurements 5): union p50 69-74 µs against 64-70 µs.
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
- **Constraints**. Each stem constraint, exclusion, order and processor has a
  row that fails without it: `sources/mutate.py` makes 57 edits in a scratch
  copy (removes each constraint, exclusion or processor, moves transforms,
  loosens conditions), writes `tests/classes.json` and runs the conformance
  test, and all 57 fail it.
  - Noun and verb endings of three letters or fewer need a stem of two
    letters without a space or a capital (`stemCharacters "[^ A-Z]"`); other
    endings of two letters or fewer need one without a space. Without them
    *ad me* reads as *ad mus* and *Credis* as *Cres*.
  - Exclusions by stem: `dom-` (*domini* is not domo), `cet-` (*cetera* is
    not cetus), -inis → -o only after b, d, g, l and m (*vicini* is not vico),
    -uī → -ō only after l, m, p, r and x (*potui* is not poto), and the
    contracted perfects of -ōvī only after n (*nōrat* → novi) and of -ēvī only
    after l (*laborat* is not labovi, *adesse* not adevi).
  - Before a form of esse a participle needs a lowercase stem (*Musa sum* is
    not Musus) of three letters (*ita est* is not itus), ending in d, s, t or
    x (*mala est* is not malus, *cura est* not curus). An accusative
    participle (-ōs, -ās) is read only before esse, fuisse, fore and īrī
    (*vēritās est* is not vereor's; *amātās esse* is amo's). The stem table's
    `noesse` lines give no reading before esse: their participles are mostly
    nouns or adjectives (altus, mēnsa, falsum, rosa, fructus, nisi, fossa,
    lītus, obēsus), so *Rosa est* is rosa, not rōdō. The participle rules
    leave out advocātus, perītus and invītus, which are a noun and two
    adjectives. Compounds need a prefix of two letters (*legi* is not ligo),
    and the stem table lists the -ligō compounds of legō before legō itself,
    so *ēlēctus est* is ēligō's (not ēlēgō's) and *dēlēctī sunt* dēligō's.
  - Rare readings of frequent forms are left to the dictionary: when a rule
    reaches a rare lemma that the form's own form-of rows also name, the
    rule's reading ties with the common one and is found first (section
    9.6). These rules leave that one stem out, and the dictionary's rows
    still give the rare reading, after the common one: *nāvī* (nāvis, not
    nāvus), *argentō*, *mēnsam*, *mēnsae* and *mēnsās*, *patriam* and
    *patriae*, *līneam* and *līneae*, *bella*, *supplicia*, *cōpiās*,
    *acētō*, *lacum*, *armōrum*, the forms of *fortis* (not fors), *canere*
    (canō, not caneō) and *impetum*. A rule leaves out a stem with
    `stemNotStartsWithText`, and a copy of it takes the longer stems that
    start the same way (`stemStartsWithText` and a longer minimum), so
    *perterritus* is still perterreō's and *bellica* bellicus'. Where one rule
    leaves out several stems (`adj-am`, `adj-ae`), it is split by the stem's
    first letter (`stemStartsWith`, `stemNotStartsWith`).
  - Transform order decides other ties: names come before adjectives
    (*Galliam* is Gallia's before Gallius'), adjectives before nouns
    (*summō* is summus before summum; nouns first gives 737 wrong first
    results in the books against 664, and 3,611 in Tatoeba against 3,206),
    among nouns the dative and ablative
    plural and the vocative come last (*maris* is mare's before marum's,
    *mēnse* mēnsis' before mēnsus'), and among verbs the perfect comes
    before the present (*dedit* is dō's before dēdō's, *tulit* ferō's before
    tulō's).
  - Name rules have no conditions (the dictionary tags no name), apply only to
    a capitalised word, and none outputs an ending another name rule removes:
    rules that fed each other made the engine loop and crash on *Romam*
    (reported to the framework).
- **How the rules changed**, with the wrong first results as the measurement
  of the time counted them:
  - 784d9f4: the own rules, written before Yomitan's file was ported.
  - 441a9bb: the port; the own conditions became Yomitan's (`v` without
    parts, `n` and `adj` with declension and number parts), which the merge
    tool needs.
  - 563d26d: fixes the corpus showed: Greek nouns and names, -en stems,
    inchoative and -ssīvī perfects, contracted -ārit and -īrunt, reor and for,
    ea and id as headwords; constraints for sine, salvē, dominī, potuī, meam,
    labōrō and cētera; condition-free name rules after the *Rōmam* loop;
    families of compounds as circumfixes.
  - e60f59e: name rules restricted, 271 → 106 wrong in the books;
  - 07a690c: adjective transforms before noun transforms on ties, 106 → 96;
  - 83dae8e: capital guards, constraints on participles before esse,
    exclusions, 388 → 198 in Tatoeba;
  - f3e122e: the enclitics as a processor, plural names removed: 8 of the
    10,000 frequent words, 70 in the books and 152 in Tatoeba.
  - a5dd27b and d2c03ad, after the first audit: the esse constraints, the
    rare readings left to the dictionary and the transform order above, and
    a stricter judge. aed0cc7 and efa303c, after the second: exclusions of
    the exact stem, the split rules, the -ligō order and the judge's esse
    fix. With the final judge, the head the first audit saw (29cb6f1) shows a
    wrong first result for 50 of the 10,000 words (7,673 tokens), at 986
    book and 4,101 Tatoeba positions; the head the second audit saw
    (43a09df) for 35 (6,167 tokens), 676 and 3,311; this head for 34 (6,047
    tokens), 664 and 3,206.

## Measurements

The pack at efa303c (this branch on 39cebbe; the engine is the same since
0a73e5e), GCC 14.3, Release; wty-la-en
imported by `hoshidicts-cli import`, as published. The sample is the 700 rows
of `corpus.tsv` and `gaps.tsv` together. Section 6 gives the commands.

**How first results are judged** (`sources/measure.py judge`, Measurements
2-4). A word's own lemmas are the headwords its keys are (the word as written,
lowercased, without macrons, with j as i, without an enclitic) and the lemmas
the keys' form-of rows name. A first result is right when it is an own lemma,
another spelling of one, the verb of an own participle or the positive of an
own comparative, and the own lemmas are one word (lemmas joined by such a
reference count as one). It is wrong when it is none of those. When the own
lemmas are several words (*dedit*: dō and dēdō), the first result is judged
against `sources/homographs.tsv`, the lemmas a reader needs for the 253 most
frequent such words, and otherwise counted as ambiguous; a random sample of 60
ambiguous positions per text (seed 1) is judged by hand. A participle read
with esse (*laudāta est*, *eundum est*) is right for a verb the first word's
rows name, directly or through its participle, but ambiguous when that word
is also a noun or adjective (*nātus est*). Words with no
row in the dictionary cannot be judged by script; a sample of 60 of them is
judged by hand too.

1. **`eval-language --dictionary`**. The pack has no optional processor,
   transform or variant pass, so each file with `# options: default` added
   gives the same numbers as without it (16 pairs, all identical). Columns:
   recall (rows), false candidates per row, first rank.

   | Rule set | Sample (700) | `cases.tsv` positives (1,032) | `cases.tsv` negatives (57) | `yomitan.tsv` (7) | Constructed (80) |
   | --- | --- | --- | ---: | --- | --- |
   | Own (`sources/own.json`) | 94.00% (658), 1.200, 80.0% | 100% (1,032), 1.828, 68.2% | 57 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |
   | Yomitan (`sources/yomitan.json`) | 7.86% (55), 0.680, 79.9% | 4.46% (46), 1.041, 64.9% | 55 | 100% (7), 1.571, 85.7% | 100% (80), 1.175, 70.0% |
   | Union (merge tool) | 94.43% (661), 1.204, 80.1% | 100% (1,032), 1.831, 67.9% | 55 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |
   | Final (`transforms.json`) | 94.00% (658), 1.200, 80.0% | 100% (1,032), 1.828, 68.2% | 57 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |
   | Final with `untaggedTerms: "pass"` | 94.00% (658), 1.261, 80.0% | 100% (1,032), 2.262, 68.2% | 57 | 100% (7), 2.000, 85.7% | 100% (80), 2.150, 70.0% |

   The final set is the own set with provenance marks, so its numbers are the
   own set's.
   - **`lookup.untaggedTerms`** (bee-san/hoshidicts#58) stays `filter`. With
     `pass`, false candidates rise (above) and real text gets worse: wrong
     first results for 49 of the 10,000 words (8,309 tokens) against 34, at
     932 book and 5,101 Tatoeba positions against 664 and 3,206. The rules
     for the parts of speech wty-la-en leaves untagged (names, pronouns)
     already have no conditions.
   - **Per rule** (final set, sample and `cases.tsv`, 1,789 rows): 852 of the
     3,199 rules recover a row no other path reaches, and none breaks a
     negative. 87 rules add false candidates without recovering a row, 234 of
     the 1,052 false candidates a single rule adds. The largest are `qui` →
     `quis` (25; Known gaps), the third-conjugation present `is` → `o` (13),
     the third-declension genitive plural `um` → `is` (11), the imperative
     `e` → `o` (10), the third-declension dative and ablative `i` → `is` (9)
     and the first-conjugation subjunctive `em` → `o` (9). They are regular
     endings of whole classes, and they are kept. Without all 87 (a copy of
     `transforms.json` without the rules whose `--per-rule` entry has
     `recovers` 0 and `falseCandidates` above 0), the sample keeps its 658
     rows, `cases.tsv` loses one, and false candidates fall to 1.137 and
     1.638 per row; but real text has more wrong first results (books 686
     against 664, Tatoeba 3,269 against 3,206, the same 34 of the 10,000
     words with 6,204 tokens against 6,047) and finds nothing at 53 more book
     and 113 more Tatoeba positions.
   - **First rank** (the sample looked up whole, `measure.py first`): the
     lemma is first for 560 rows. For 82 it is not among the results, because
     the dictionary's form-of rows name another spelling of it (UniMorph keeps
     *inplicātiōnis* → inplicatio, wty-la-en has implicatio). For 51 another
     term comes first (*apiārium*: the noun apiarium before the adjective
     apiarius). 7 have no result for the whole source.
2. **Frequent forms**. Of the list's 10,000 most frequent words, a rule reaches
   the lemma of 7,847 (432,043 tokens): a form-of row of the word or a row of
   `corpus.tsv` or `cases.tsv` names a lemma among the deinflections of the
   word.
   - The first result with a definition is a wrong lemma for 29 of them, 5,424
     tokens: 0.73% of the 10,000 words' 743,438 tokens, 0.53% of the list's
     1,020,914. 25 of the 29 tie with a right lemma. They include *sibi* →
     sibus (1,067 tokens), *rei* → reus, *mīlia* → milium, *sōla* and *sōlis*
     → solum, *dīcam* → dica, *facis* → fax, *tria* → treuga, *longius* →
     longiter and *jure* → iuro (Known gaps).
   - 6,388 are right and 3 find nothing; `sources/homographs.tsv` decides 324
     of these words. The other 1,427 (43,729 tokens) remain ambiguous. In a
     hand sample of 60 of the 1,427, 11 are wrong (*vōta* → vōtus, *arva* →
     arvus, *bellōrum* → bellus, *mentis* → menta, *mōris* → mora), which puts
     about 260 more words, and about 8,000 tokens, wrong.
   - The union reaches 7,849 words, 35 wrong (6,071 tokens). Yomitan's rules
     reach 1,942, 17 wrong (2,631 tokens).
   - Over all 10,000 words: 8,008 right, 34 wrong (6,047 tokens), 1,441
     ambiguous, 478 find nothing (26,905 tokens: the books' apparatus *EV*,
     *Sidenote*, *Mss*, *cf*, Roman numerals and English), 37 cannot be
     judged.
3. **Enclitics, pronouns and the auxiliary** in Tatoeba (Latin has no
   articles). Positions by kind:

   | Kind | Positions | Right | Wrong | Ambiguous |
   | --- | ---: | ---: | ---: | ---: |
   | Word with -que, -ne or -ve that the dictionary lacks whole (*virumque*) | 4,311 | 3,694 | 4 | 611 |
   | Participle or gerundive with a form of esse, read as one verb | 4,819 | 3,110 | 34 | 1,657 |
   | Form of ego, tu, sui, nos, vos, is, hic, ille, iste, ipse, idem, qui or quis | 31,565 | 30,954 | 149 | 84 |
   | Form of esse | 22,523 | 21,982 | 5 | 183 |

   The rest find nothing, find a phrase entry first, or cannot be judged. The
   149 wrong pronoun forms include *sibi* → sibus (Known gaps), the letter *i*
   read as an abbreviation of iuvenis, and *Id.* The audit's list
   of 34 nouns and adjectives misread with esse (*Rosa est* → rōdō) counts 29
   such first results in Tatoeba (157 at 29cb6f1) and 4 in the books (5). In
   the books: 1,421 enclitic positions (2 wrong, 265 ambiguous), 635 esse
   readings (12 wrong, 257 ambiguous), 10,308 pronoun forms (184 wrong) and
   3,167 forms of esse (none wrong). The union gives the same numbers;
   Yomitan's rules have no esse rule.
4. **Real text** (*Insula thesauraria* and *De Bello Gallico* V-VIII, every
   word looked up with the rest of its sentence): 101,097 lookups.
   - By script: 89,559 right and 664 wrong; 545 of the 664 tie with a right
     lemma. 6,004 are ambiguous (6,557 more were decided by
     `sources/homographs.tsv`); in a hand sample of 60, 13 are wrong
     (*meritīs* → meritus, *tenērī* → tener, *cornuum* → cornus, *volātū* →
     volo, *Arte* → the place name Artahe). The
     dictionary's phrase entries come first at 737 positions (*in medio*,
     *non modo*), 3,545 find nothing and 588 cannot be judged; in a hand
     sample of 60 of those, 11 are wrong, all of them English, names,
     abbreviations or misprints (*the*, *Attium*, *MARCVS*, *lobore*).
   - That puts about 2,070 wrong first results among the 101,097 lookups
     (2.0%): 664 by script, about 1,300 among the ambiguous and about 110
     among those the script cannot judge.
   - The groups (first step of the trace): `adj-i` 204 (*reī* → reus, *sibi* →
     sibus), `n-nom-pl+n-acc-pl` 68 (*sōla* → solum, *mīlia* → milium), the
     letter *i* 52, `n-dat-pl` 42 (*sōlīs* → solum), `comparative` 39
     (*longius* → longiter).
   - Tatoeba, 307,656 lookups: 279,247 right, 3,206 wrong (2,228 tied with a
     right lemma), 16,734 ambiguous (12 wrong in a hand sample of 60), 4,948
     find nothing, 2,858 phrase entries and 663 cannot be judged (25 wrong in
     a sample of 60: Toki Pona's *Pona*, names, New Latin, misspellings).
     That is about 6,830 wrong (2.2%). Groups (first step of the trace): the
     dictionary's "genitive singular" rows 1,001 (*Ubi* → the tribe's Ubus
     902), `adj-am` 379 and `adj-ae` 262 (*Mariam*, *Mariae* → Marius), the
     dictionary's alternative spellings 313 (*Scīsne* → scin, *stat* →
     statim), its "genitive/vocative singular" rows 246 (*Venī* → Venius,
     *Herī* → Herius 214).
   - Union: 831 wrong in the books and 3,308 in Tatoeba. Yomitan's rules: 930
     and 3,835 wrong, and 4,611 and 6,490 positions find nothing (3,545 and
     4,948 for the final set).
   - The samples come from `measure.py judge --sample 60 --seed 1` (with
     `--sample-of ambiguous` for the ambiguous ones); the hand judgements are
     listed in the pull request.
5. **Performance** (section 13; budgets 1 ms p50, 50 ms load, 20 MB heap; the
   pack has no `pattern` rule).
   - Native `benchmark-lookup` (wty-la-en mapped, the 80 texts of
     `sources/benchmark-words.txt`, 6 passes with the first dropped, three
     runs at machine load 50):

     | Rule set | p50 | p95 |
     | --- | ---: | ---: |
     | Final | 64-70 µs | 347-380 µs |
     | Union | 69-74 µs | 367-405 µs |
     | Yomitan's rules | 36-38 µs | 177-197 µs |

   - WebAssembly (`sources/wasm-measure.mjs`, Hachidori feat/multi-language
     803f7b6e prebuilt engines, Node 22.23.1, the same texts, wty-la-en mapped
     from MEMFS, two runs at load 48):
     - `hdw_lookup`: p50 0.149-0.153 ms and p95 0.713-0.752 ms single-thread;
       p50 0.159-0.160 ms and p95 0.806-0.810 ms threaded.
     - `hdw_language_load`: median 13.3 ms single-thread and 13.9-14.9 ms
       threaded over 10 fresh engines, at most 20.9 ms.
     - Live heap after the load: +1,350,544 bytes single-thread, +1,350,976
       threaded (`hdw_memory_stats`).
   - Hachidori (`test/chrome-language-pack.mjs`, feat/multi-language 803f7b6e
     with this branch at 1639239 (efa303c after the rebase onto 39cebbe) in
     `third_party/hoshidicts`, Chrome
     152.0.7977.75): 31 of 31 checks pass. Settings adds Latin beside Japanese
     and imports wty-la-en (1,977,517 terms, 2.5 s); 27 hovered words find
     their lemma first with their trace (*virumque* → vir, *dūxit* → duco,
     *laudātus est* → laudo, and the audits' *Rosa est* → rosa, *Mensa est* →
     mensa, *altus est* → altus, *Veritas est* → veritas, *peritus est* →
     peritus, *dedit* → do, *Galliam* → Gallia, *patriam* → patria, *electus
     est* → eligo, *nāvī* → navis, *cōpiās* → copia, *Fortēs* → fortis); the
     Anki note and the switch to Japanese and back work.
6. **Commands**. From the repository root, with `D` the imported dictionary,
   `G` the Gutenberg texts and `W` a scratch directory:

   ```sh
   cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DHOSHIDICTS_TESTS=ON \
     -DHOSHIDICTS_LANGUAGE_TESTS=ON -DHOSHIDICTS_CLI=ON -DHOSHIDICTS_BENCHMARK=ON
   cmake --build build --parallel 8
   mkdir -p $W/dicts && ln -s $PWD/wty-la-en.zip $W/dicts/   # import writes beside the zip
   build/hoshidicts-cli import $W/dicts/wty-la-en.zip          # D=$W/dicts/wty-la-en
   # lookup-batch: build as its header says (languages/en/sources/lookup-batch.cpp)

   # Rule sets and corpus
   node languages/la/sources/build-own.mjs && node languages/la/sources/build-final.mjs
   node languages/la/sources/build-corpus.mjs unimorph-lat/lat kaikki.org-dictionary-Latin.jsonl.gz
   node tools/merge-transforms.mjs la --out $W/union.json

   # 1. Each set (own.json, yomitan.json, union.json, transforms.json) on each file
   (cat languages/la/tests/corpus.tsv; grep -v '^#' languages/la/tests/gaps.tsv) > $W/sample.tsv
   build/hoshidicts-cli eval-language la $W/sample.tsv --transforms <set> --dictionary $D
   #    the same for tests/cases.tsv, tests/yomitan.tsv and sources/yomitan-constructed.tsv,
   #    for a copy of each with '# options: default' as its first line, with --languages <copy of
   #    languages/ whose la/language.json says "untaggedTerms": "pass">, and --per-rule on
   #    sample + cases (final) and sample + cases + constructed + yomitan.tsv (union)
   grep -v '^#' $W/sample.tsv | cut -f3 | build/lookup-batch languages la $D 16 64 > $W/sample.jsonl
   python3 languages/la/sources/measure.py first $W/sample.tsv $W/sample.jsonl

   # 2-4. Inputs, lookups and judgement
   M=languages/la/sources/measure.py; H=languages/la/sources/homographs.tsv
   python3 $M headwords wty-la-en.zip $W/headwords.pickle
   python3 $M freq $W/freq.tsv $G/pg{16439,17859,218,226,227,231,23294,23306,27219,30345,33849,48681,50732,51812,56744,57232,57615,73030}.txt
   head -10000 $W/freq.tsv | cut -f1 > $W/top10k.txt
   python3 $M hovers $W/books.txt $G/pg68935.txt $G/pg18837.txt
   python3 $M hovers $W/tatoeba.txt --tatoeba lat_sentences.tsv
   build/lookup-batch languages la $D 16 16 < $W/top10k.txt > $W/top10k.jsonl      # and books, tatoeba
   #    union, Yomitan's rules, "pass": a copy of languages/ with that la/transforms.json or language.json
   python3 $M judge $W/headwords.pickle $W/top10k.txt $W/top10k.jsonl --transforms languages/la/transforms.json \
     --homographs $H --freq $W/freq.tsv --top 10000 --show 25 [--reach build/hoshidicts-cli --languages languages \
     --corpus languages/la/tests/corpus.tsv,languages/la/tests/cases.tsv]
   python3 $M judge $W/headwords.pickle $W/books.txt $W/books.jsonl --transforms languages/la/transforms.json \
     --homographs $H --kinds 1 --show 25                                              # and tatoeba
   #    hand samples: add --sample 60 --seed 1 --sample-out <file> [--sample-of ambiguous]

   # 5. Speed
   build/benchmark-lookup languages/la/sources/benchmark-words.txt 6 --languages languages --language la --term $D --json
   node --max-old-space-size=8192 languages/la/sources/wasm-measure.mjs <hachidori> languages/la $D \
     languages/la/sources/benchmark-words.txt 10 6

   # Checks
   node tools/check-classes.mjs la && build/language-conformance-test languages/la
   node tools/check-yomitan.mjs <yomitan d3c54c1> la --cli build/hoshidicts-cli
   python3 languages/la/sources/mutate.py . $W/mutants
   ```

   - **Conformance** (`language-conformance-test`): `corpus.tsv` 658 / 658,
     `cases.tsv` 1,089 / 1,089, `yomitan.tsv` 7 / 7, `text.tsv` 40 / 40,
     `lookup.tsv` 67 / 67; `gaps.tsv` 0 / 42 (reported). `classes.json` agrees
     with the engine (3 classes, 809 fields, 2 steps). 1,260 of the 5,195
     rules are exercised by a passing row. `tests/` and `sources/` hold
     999,892 bytes.
   - **Differential check** (`tools/check-yomitan.mjs`): 2,820 inputs and
     4,195 Yomitan results with no difference; the four processors agree with
     Yomitan's on 1,870 to 2,657 inputs each.
   - **Tests and traces.** Rows of `cases.tsv` give traces for the perfect
     (`perf-stem|perf-3s`), esse (`ptc-perf|esse`), the genitive, the
     locative, the imperfect and the comparative, so renaming one of those
     nine transform ids fails the test; other ids are not traced. `lookup.tsv`
     has rows for each transform order (*summō*, *dedit*, *maris*, *mēnse*,
     *Galliam*) and rows that need form-of following, word resolution and the
     part-of-speech filter, so `mutate.py` catches the orders, `formOf:
     "asTerm"`, `searchResolution: "character"` and verb rules without `v`.
     No test format checks a transform's display name or description.

## Known gaps

Ties that the pack cannot break are a framework issue (section 9.6), which the
lead has accepted for a later framework change (hachi-lang-engine-l:
the reading key only for packs whose readings are `required`, and
`lookup.confirmedOrder: "references"`); this pack sets `confirmedOrder` and
measures again once that is on main.

- **The reading key.** wty-la-en leaves the reading empty for headwords
  without long vowels, and the engine fills it with the expression, so on a
  tie the comparator's "written form equals reading" key ranks them first:
  *sibi* → sibus before suī (1,067 tokens of the list), *reī* → reus before
  rēs, *mīlia* → milium before mīlle, *facis* → fax before faciō, *dīcam* →
  dica before dīcō, *tria* → treuga before trēs, *sōla* and *sōlī* → solum
  before sōlus, and *Mariam*, *Mariae* → the adjective Marius before the
  name Maria (638 Tatoeba positions, 577 of them inside a sentence; the
  dictionary has rows for both, and Marius' reading equals its expression).
  Looked up with no rules at all, the dictionary's own form-of rows give the
  same first results. Counted as the first audit counts its 59 frequent
  homographs (the first result is the wrong lemma its table lists), 31 of
  the 10,000 words (3,324 tokens), 345 book and 602 Tatoeba positions are
  still wrong (57, 601 and 1,187 at 29cb6f1); all but *argentī* and
  *mentis* are this key or other dictionary ties.
- **Capitals at the start of a sentence.** A capitalised word is looked up as
  written before it is decapitalised, so the dictionary's rows for names win:
  in Tatoeba *Ubi* → the tribe's Ubus (902 positions), *Venī* → Venius and
  *Herī* → Herius (214), *Iī* → Ios (23), *Virī* → Virus (21), *Morī* →
  Morus (17), *Magnī* → Magnus (14), *Novī* → Novius (13), *Servī* →
  Servius (12), *Equī* → Equus (11). Reading such capitals is a Hachidori
  follow-up.
- **The form looked up.** The comparator's key "written form equals the form
  looked up" puts navō before navis for *nāvem* (96 tokens): the rule reads
  the macron text as *nāvis*, which matches navis only through its reading.
  Neither change planned in hachi-lang-engine-l reaches this key.
- **Other wrong first results the rules make**: capitalised words read
  through the name rules, *Prae* → Pras (6 positions), *Leōnem*, *Leōnī* →
  Leo (5), *Actiōnī* → Actium (3), *Legam*, *Pythōnem*, *Cūriam* (1 each),
  *Cantābam* → Cantabas (1); *Manibus* → Mānēs (3); all-caps headers,
  *CURTIUS* → curtus (243 tokens) and *MARONIS* → marum (16); *non scientia*
  → nesciō (2); *argentī* → argentus (61 tokens, 12 positions: `adj-i` keeps
  one exclusion, for *nāvī*, to stay within the 1 MB of `tests/` and
  `sources/`).
- **Sampled forms the rules do not reach** (`gaps.tsv`, 42 of 700):
  - proper nouns, 14 of 35: names declined like common nouns (*Cemenelī* →
    Cemenelium, *Bagdadō* → Bagdadum). The name rules are kept narrow (Rule
    provenance), so most names are found through the dictionary's form-of
    rows (*Latiō* → Latium, *Herculis* → Hercules), not through rules;
  - pronouns and determiners, 11 of 20: rare compounds (*ipsamet*, *seipsum*,
    *quamcumque*, *nesciōquōs*, *hunce*, *illucce*, *sibimet*, *nēcui*);
  - nouns, 5 of 165: entries of two words (*fasciculī arcuātī*, *accentibus
    gravibus*, *firmam burgī*), *galaxiārum* → galaxias, *Mārpōrēs* → Marpor;
  - perfects, 5 of 120: *internecuissem* → interneco, *adolēram* → adolesco,
    *ēmulserat* → emulgeo, *quaesieram* → quaeso, *Sūtrium iēre* → Sutrium eo;
  - comparison, 3 of 20: *medioximus* → medius, *dulcissimus* → dulcior (whose
    lemma is the comparative), *summē pius* → pius;
  - passive and non-finite verbs, 4 of 85: *excalfīat* and *excalfītō* →
    excalfacio, *connītundus* → connitor, *obsolefactum* → obsolefio.
- **Esse readings.** 34 Tatoeba and 12 book esse readings are wrong by script
  (*necātus est* → necor: wty-la-en's passive first persons have no reading,
  so the reading key puts them first; *ignōta est* → ignōscō, *sēcrētum est*
  → sēcernō, *praeditus est* → praedor, *servitūs est* → serviō), and 1,657
  and 257 are ambiguous because the participle is also a noun or adjective
  (*nātus est*: nascor, right). Some readings the script counts wrong are right by the grammar:
  *tūta est* → tueor, *quiētus sīs* → quiēscō.
- **Adjective and noun ties left in order.** Adjectives come first on ties,
  which is right more often (above), but a noun is then second: *vōta* →
  vōtus, *arva* → arvus, *bellōrum* → bellus, *fātīs* → fātus, *patriīs* →
  patrius (often the adjective: *patriīs mōribus*).
- **Spellings the dictionary does not name**: *literās* → litus, *sēculōrum*
  → sēcula, *que* (for quae) → queō, and *jūre* → iūrō: the rules read *jūre*
  as written before the processed *iūre* is looked up, because a processor
  step ranks after a reading without one. With u for consonantal u, the
  dictionary's reconstructed *uō* comes first for *uero* and *uita*
  (wty-la-en has form-of rows for them): in Caesar written with u, 75 of
  17,374 positions change.
- **Conjugation classes**: wty-la-en tags every verb `v`, so the endings of one
  conjugation also apply to verbs of the others: *jure* → *juro* uses the
  third-conjugation imperative of a first-conjugation verb.
- **Intermediate forms the dictionary also has**: the perfect endings make
  *existi* of *existere* and *existit*, and wty-la-en lists *existi* as a
  perfect of exeo, so both read as exeo.
- **Pronouns and names have no part of speech** in wty-la-en, so their rules
  have no conditions and their outputs feed the noun and verb rules: `qui` →
  `quis` → `qui` → `quo` gives 25 false candidates (Measurements 1).
  `untaggedTerms: "pass"` would let these rules carry a condition, but on its
  own it makes real text worse (Measurements 1).
- **WebAssembly with paged storage**: `hdw_add_dict` with paged entries and
  index returned no results in Node, so only mapped storage is timed. This was
  not investigated.
