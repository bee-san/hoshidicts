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
- `tests/cases.tsv` (1,114 rows: 1,036 positive, 78 negative), `tests/text.tsv`
  (40 rows), `tests/lookup.tsv` (78 rows) and `tests/dictionary/` (a tiny
  dictionary of 110 rows for `lookup.tsv`, tagged as wty-la-en tags its rows,
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

`transforms.json` has 220 transforms and 3,205 rules, 5,324 with the circumfix
cross products expanded: 3,199 `own`, 6 `both` and no `yomitan` rule.
`sources/build-final.mjs` writes it: `sources/own.json` with the six own rules
that make the same deinflection as a Yomitan rule marked `both`.
`tools/merge-transforms.mjs` compares rules literally and marks none `both`;
its union of the two files has 224 transforms and 3,213 rules (3,205 `own`,
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
    `cases.tsv`, the constructed forms and `yomitan.tsv`, 1,901 rows):

    | Yomitan rule | Rows only it recovers | False candidates only it adds | Negatives broken |
    | --- | ---: | ---: | ---: |
    | `plural` `i` → `us` (noun) | 0 | 2 | 0 |
    | `plural` `i` → `us` (adjective) | 0 | 0 | 0 |
    | `plural` `e` → `""` | 1 | 2 | 0 |
    | `plural` `ae` → `a` | 0 | 3 | 2 |
    | `plural` `a` → `um` | 0 | 1 | 1 |
    | `feminine` | 0 | 0 | 0 |
    | `neuter` | 0 | 0 | 0 |
    | `ablative` | 2 | 0 | 0 |

  - The union reaches three sample rows more than the final set (661 against
    658): *Bagdadō* → Bagdadum and *Bēthlehēmō* → Bethlehemum (`ablative`)
    and *Solomōne* → Solomon (`plural` `e` → `""`). Those readings carry
    `n2s` or `n1s`, and wty-la-en gives names no part of speech, so the
    part-of-speech filter drops them: the lookups return the same results
    with both sets, the names through the dictionary's form-of rows. The
    union breaks 4 of the 78 negatives of `cases.tsv`: *patriae* → patrius,
    *līneae* → līneus, *bella* → bellus and *loca* → locum, through Yomitan's
    `plural`.
  - Constructed forms (`sources/yomitan-constructed.tsv`, 80 rows): the final
    set, Yomitan's rules and the union all reach 80 of 80, with first rank
    70.0%. False candidates per row are 2.075 for the final set and the union
    and 1.175 for Yomitan's rules.
  - Real text (judged as Measurements 2-4 judge it): the union shows a wrong
    first result for 38 of the 10,000 frequent words (6,230 tokens) against
    31 (5,571), at 825 book positions against 658 and at 3,321 Tatoeba
    positions against 3,219. Yomitan's `ablative` reads *summō* as the noun
    summum before the adjective summus, because the union puts Yomitan's
    transforms first and the final set puts its adjective transforms first.
  - Lookup speed (Measurements 5): union p50 55-59 µs against 53-55 µs.
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
    processor (`enclitics`), so every reading of the word before them stays;
  - noun forms that are also forms of a participle or adjective headword
    (`n-first`, three circumfix rules: *creātūram* → creātūra, *tēcta* →
    tēctum, *pluviae* → pluvia), and ordinals before the nouns of the same
    form (`ord`: *decimam* → decimus).
- **Constraints**. Each stem constraint, exclusion, order and processor, and the
  `untaggedTerms` setting, has a row that fails without it: `sources/mutate.py`
  makes 82 edits in a scratch copy (removes each constraint, exclusion,
  processor or `n-first` rule, moves transforms or rules, loosens conditions,
  sets `untaggedTerms` to `pass`), writes `tests/classes.json` and runs the
  conformance test, and all 82 fail it. The stems of `n-first` are tested as a
  group, by two rows (below). The -ūram esse choice (Known gaps) is the absence
  of a rule and has no row.
  - Noun and verb endings of three letters or fewer need a stem of two
    letters without a space or a capital (`stemCharacters "[^ A-Z]"`); other
    endings of two letters or fewer need one without a space. Without them
    *ad me* reads as *ad mus* and *Credis* as *Cres*.
  - Exclusions by stem: `dom-` (*domini* is not domo), `cet-` (*cetera* is
    not cetus), -inis → -o only after b, d, g, l and m (*vicini* is not vico),
    -uī → -ō only after l, m, p, r and x (*potui* is not poto), and the
    contracted perfects of -ōvī only after n (*nōrat* → novi) and of -ēvī only
    after l (*laborat* is not labovi, *adesse* not adevi).
- Before a form of esse a participle needs a lowercase stem (*Musa sum* is not
    Musus) of three letters (*ita est* is not itus), ending in d, s, t or x
    (*mala est* is not malus, *cura est* not curus). An accusative participle
    (-ōs, -ās, -am) is read only before esse, fuisse, fore and īrī (*vēritās
    est* is not vereor's; *amātās esse*, *amātās fuisse* and *amātam esse* are
    amō's). The stem table's `noesse` lines give no reading before esse: their
    participles are mostly nouns or adjectives (altus, mēnsa, falsum, rosa,
    fructus, nisi, fossa, lītus, obēsus, situs, rēctus), so *Rosa est* is
    rosa, not rōdō, and *sita est* is situs, not sinō's. The participle rules
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
    (canō, not caneō), *impetum*, *loca* (locus, not locum), *Itali* (Italus,
    not Italis), *existere* and *existit* (exsistō, not exeō through its
    *existī*), *jūre* and *jūris* (iūre and iūs, not iūrō), *CURTIUS*
    (Curtius, not the comparative of curtus), *coelīs* (caelum, not caelēs),
    *jūra* (iūs, not iūrō), *generum* and *generī* (genus, not gener), *putet*
    (putō, not puteō), *scrībam* (scrībō, not scrība), *canēbat* (canō, not
    caneō) and *pene* (paene, not penus). Those from *loca* on, except
    *putet* and *canēbat*, leave out the stem and every longer one. Each
    other rule leaves out a stem with
    `stemNotStartsWithText`, and a copy of it takes the longer stems that
    start the same way (`stemStartsWithText` and a longer minimum), so
    *perterritus* is still perterreō's and *bellica* bellicus'. Where one rule
    leaves out several stems (`adj-am`, `adj-ae`), it is split by the stem's
    first letter (`stemStartsWith`, `stemNotStartsWith`).
  - Nouns that a participle headword shadows come before the adjectives.
    wty-la-en has headwords for future participles (creātūrus) and for some
    perfect ones (tēctus, dictus), so on a tie the adjective rules read
    *creātūram* as creātūrus and *tēcta* as tēctus. The transform `n-first`,
    ordered with the names, reads the -tūra and -sūra nouns (*creātūram*,
    *Scrīptūrīs*, *mēnsūrae*; stems of three letters or more, not fac-, so
    *futūrīs*, *saturae* and *factūram* keep futūrus, satur and factūrus) and
    thirteen second-declension nouns first: tēctum, dictum, peccātum, fātum,
    arvum, vōtum, bellum, mandātum, prōmissum, praeceptum, pūnctum, īnstitūtum
    and iaculum. The participle comes second. Each of these stems was a noun in
    nearly every one of 10 to 14 sentences sampled from the frequency-list
    texts; *scrīpta*, *data*, *vīsa* and *prōposita* were mixed and keep their
    order (Known gaps). A third rule does the same for eight first-declension
    nouns whose adjective wty-la-en tags (the sixth audit found the noun needed
    in 36 of 40 sampled positions): pluvia, mūsica, iniūria, aquila, penna,
    vīnea, vespera and mathēmatica (*pluviae* is pluvia's, not pluvius'). `ord`
    reads decimam, sextam and proximam and their -ae, -ās and -ārum as the
    ordinal (or proximus) with no conditions, since wty-la-en tags no ordinal:
    before it, the noun rules made decima "tithe", sexta "noon" and proxima
    "wife" first. `lookup.tsv` rows *tēcta* → tēctum and *creātūram* → creātūra
    fail without the transform, *pluviae*, *mēnsūrae* and *decimam* fail without
    the -a rule, the -sūra endings and `ord`, and negative rows hold its whole
    stems (*bellica* is not bellicum through it), its minimum stem (*saturae*)
    and fac- (*factūram*). Other rows hold *līneae* (a negative: not līneus),
    *Iam* (a negative: not the name Ias, since the name rules need a stem of two
    letters), *media* → medius (a `lookup.tsv` row: adjectives before the neuter
    plural nouns), *armīs* → arma (the -īs → -a rule of `n-dat-pl` before -īs →
    -us) and *jura* → ius (a j-spelling row of the test dictionary, as wty-la-en
    has, would otherwise come first).
  - Transform order decides other ties: names come before adjectives
    (*Galliam* is Gallia's before Gallius'), adjectives before nouns
    (*summō* is summus before summum; nouns first gives 731 wrong first
    results in the books against 658, and 3,624 in Tatoeba against 3,219),
    among nouns the dative and ablative plural and the vocative come last
    (*maris* is mare's before marum's, *mēnse* mēnsis' before mēnsus'), and
    among verbs the perfect comes before the present (*dedit* is dō's before
    dēdō's, *tulit* ferō's before tulō's). The stem table therefore leaves out
    the -sīdī perfect of the -sīdō compounds (cōnsēdī only): with it,
    *dēsīderat* and *cōnsīderat* were read as the pluperfect of dēsīdō and
    cōnsīdō before the present of dēsīderō (`lookup.tsv` *desiderat*).
  - Name rules have no conditions (the dictionary tags no name), apply only to
    a capitalised word, and none outputs an ending another name rule removes:
    rules that fed each other made the engine loop and crash on *Romam*
    (reported to the framework).
- **How the rules changed**, with the wrong first results as the measurement
  of the time counted them:
  - c9e08ea: the own rules, written before Yomitan's file was ported.
  - 05315ad: the port; the own conditions became Yomitan's (`v` without
    parts, `n` and `adj` with declension and number parts), which the merge
    tool needs.
  - 97eb8ae: fixes the corpus showed: Greek nouns and names, -en stems,
    inchoative and -ssīvī perfects, contracted -ārit and -īrunt, reor and for,
    ea and id as headwords; constraints for sine, salvē, dominī, potuī, meam,
    labōrō and cētera; condition-free name rules after the *Rōmam* loop;
    families of compounds as circumfixes.
  - 41db5fa: name rules restricted, 271 → 106 wrong in the books;
  - 4d64139: adjective transforms before noun transforms on ties, 106 → 96;
  - c50a17f: capital guards, constraints on participles before esse,
    exclusions, 388 → 198 in Tatoeba;
  - c35d34e: the enclitics as a processor, plural names removed: 8 of the
    10,000 frequent words, 70 in the books and 152 in Tatoeba.
  - fa07b76 and 930c525, after the first audit: the esse constraints, the
    rare readings left to the dictionary and the transform order above, and
    a stricter judge. 3910b64 and 95fdfbf, after the second: exclusions of
    the exact stem, the split rules, the -ligō order and the judge's esse
    fix. c73659d, after the third: the eight exclusions of whole stem
    families (*loca* to *coelīs*) and rows for *mēnsae*, *amātās fuisse* and
    `untaggedTerms` (*sinis*). fefc21d, after the fourth: `n-first`, six
    more exclusions (*jūra* to *pene*), the `noesse` lines of sinō and regō,
    -am before esse, and rows for *līneae*, *Iam* and *media*. e98502a, after
    the fifth: own entries counted apart by the judge, the -tūra rule
    narrowed, and rows for *jura*, *bellica*, *saturae*, *factūram* and
    *armīs*. fa94455, after the sixth: the -a nouns and iaculum in `n-first`,
    `ord`, the -sīdī perfect removed, and the judge's sample of the ambiguous
    positions the rules change.
  - With the final judge, the head the first audit saw (29cb6f1; the audited
    heads are PR heads from before the rebases) shows a wrong first result
    for 50 of the 10,000 words (7,673 tokens), at 978 book and 4,044 Tatoeba
    positions; the head the second audit saw (43a09df) for 35 (6,167
    tokens), 668 and 3,254; the head the third audit saw (98bd0b6) for 34
    (6,047 tokens), 664 and 3,206; the head the fourth audit saw (3d21931)
    and the head the fifth saw (43690b0) for 29 (5,526 tokens), 646 and
    3,171, by the judge of that time. The words the fourth round changed
    (*tēcta*, *creātūram*, *putet*) are ambiguous to the judge, so its counts
    did not move; the hand samples of Measurements 2 and 4 did. The fifth
    round's judge gives these rules 31 (5,571 tokens), 658 and 3,219, and
    counts the own entries apart; the sixth round's rules change only words
    the judge counts ambiguous, so the counts stay.

## Measurements

The rules at fa94455 (this branch on 350d9e0; main has since added only other
packs' directories and changed an example in `docs/languages.md`), GCC 14.3,
Release; wty-la-en
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
frequent such words. Otherwise, a first result that is one of the word's
keys and a headword, its *own entry* (*modo* the adverb, also the ablative
of modus), is counted right but apart, because wty-la-en files some
unrelated words under the spelling of a common form (*esse* "state,
condition", *se* "without"). Most own entries have no rule step; 59 book and
376 Tatoeba ones do (*maius* → Maius "of May" through an "alternative"
reference, at 17 of them). The rest is counted as ambiguous. A random sample
of 60 own-entry and 60 ambiguous positions per text (seed 1) is judged by
hand, and so is a sample of 60 of the ambiguous positions where the rules
change the first result against a copy of the pack with no rules
(`--same-as`, `--sample-of changed`): both first results are judged, the
rules' and the copy's. A participle read
with esse (*laudāta est*, *eundum est*) is right for a verb the first word's
rows name, directly or through its participle, but ambiguous when that word
is also a noun or adjective (*nātus est*). Words with no
row in the dictionary cannot be judged by script; a sample of 60 of them is
judged by hand too.

1. **`eval-language --dictionary`**. The pack has no optional processor,
   transform or variant pass, so each file with `# options: default` added
   gives the same numbers as without it (16 pairs, all identical). Columns:
   recall (rows), false candidates per row, first rank.

   | Rule set | Sample (700) | `cases.tsv` positives (1,036) | `cases.tsv` negatives (78) | `yomitan.tsv` (7) | Constructed (80) |
   | --- | --- | --- | ---: | --- | --- |
   | Own (`sources/own.json`) | 94.00% (658), 1.200, 80.0% | 100% (1,036), 1.831, 68.3% | 78 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |
   | Yomitan (`sources/yomitan.json`) | 7.86% (55), 0.680, 79.9% | 4.44% (46), 1.042, 64.9% | 74 | 100% (7), 1.571, 85.7% | 100% (80), 1.175, 70.0% |
   | Union (merge tool) | 94.43% (661), 1.204, 80.1% | 100% (1,036), 1.835, 68.1% | 74 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |
   | Final (`transforms.json`) | 94.00% (658), 1.200, 80.0% | 100% (1,036), 1.831, 68.3% | 78 | 100% (7), 1.714, 85.7% | 100% (80), 2.075, 70.0% |
   | Final with `untaggedTerms: "pass"` | 94.00% (658), 1.261, 80.0% | 100% (1,036), 2.264, 68.3% | 78 | 100% (7), 2.000, 85.7% | 100% (80), 2.150, 70.0% |

   The final set is the own set with provenance marks, so its numbers are the
   own set's.
   - **`lookup.untaggedTerms`** (bee-san/hoshidicts#58) stays `filter`. With
     `pass`, false candidates rise (above) and real text gets worse: wrong
     first results for 46 of the 10,000 words (7,833 tokens) against 31, at
     926 book and 5,114 Tatoeba positions against 658 and 3,219, and the
     `lookup.tsv` row *sinis* (not sine) fails. The rules
     for the parts of speech wty-la-en leaves untagged (names, pronouns)
     already have no conditions.
   - **Per rule** (final set, sample and `cases.tsv`, 1,814 rows): 855 of the
     3,205 rules recover a row no other path reaches, and none breaks a
     negative. 87 rules add false candidates without recovering a row, 234 of
     the 1,059 false candidates a single rule adds. The largest are `qui` →
     `quis` (25; Known gaps), the third-conjugation present `is` → `o` (13),
     the third-declension genitive plural `um` → `is` (11), the imperative
     `e` → `o` (10), the third-declension dative and ablative `i` → `is` (9)
     and the first-conjugation subjunctive `em` → `o` (9). They are regular
     endings of whole classes, and they are kept. Without all 87 (a copy of
     `transforms.json` without the rules whose `--per-rule` entry has
     `recovers` 0 and `falseCandidates` above 0), the sample keeps its 658
     rows, `cases.tsv` loses one, and false candidates fall to 1.137 and
     1.642 per row; but real text has more wrong first results (books 680
     against 658, Tatoeba 3,288 against 3,219, 32 of the 10,000 words with
     5,767 tokens against 31 with 5,571) and finds nothing at 53 more book
     and 113 more Tatoeba positions.
   - **First rank** (the sample looked up whole, `measure.py first`): the
     lemma is first for 560 rows. For 82 it is not among the results, because
     the dictionary's form-of rows name another spelling of it (UniMorph keeps
     *inplicātiōnis* → inplicatio, wty-la-en has implicatio). For 51 another
     term comes first (*apiārium*: the noun apiarium before the adjective
     apiarius). 7 have no result for the whole source.
2. **Frequent forms**. Of the list's 10,000 most frequent words, a rule reaches
   the lemma of 7,846 (432,025 tokens): a form-of row of the word or a row of
   `corpus.tsv` or `cases.tsv` names a lemma among the deinflections of the
   word.
   - The first result with a definition is a wrong lemma for 27 of them, 5,191
     tokens: 0.70% of the 10,000 words' 743,438 tokens, 0.51% of the list's
     1,020,914. 23 of the 27 tie with a right lemma. They include *sibi* →
     sibus (1,067 tokens), *rei* → reus, *mīlia* → milium, *sōla* and *sōlis*
     → solum, *dīcam* → dica, *facis* → fax, *tria* → treuga and *longius* →
     longiter (Known gaps).
   - 6,389 are right, 1,277 of them (134,165 tokens) as own entries, and 3
     find nothing; `sources/homographs.tsv` decides 330 of these words. The
     other 1,427 (43,729 tokens) remain ambiguous. In a hand sample of 60 of
     the 1,427, 7 are wrong (*mentis* → menta, *mōris* → mora, *orbī* →
     orbus, *ēditō* → edō "to eat"), which puts about 170 more words, and
     about 5,100 tokens, wrong. The same 60 rows had 11 wrong before the
     fourth round's `n-first` (*vōta*, *arva*, *bellōrum*, *fātīs*,
     *mēnsūrae*).
   - The union reaches 7,848 words, 33 wrong (5,838 tokens). Yomitan's rules
     reach 1,942, 18 wrong (2,651 tokens).
   - Over all 10,000 words: 8,011 right, 31 wrong (5,571 tokens), 1,441
     ambiguous, 478 find nothing (26,905 tokens: the books' apparatus *EV*,
     *Sidenote*, *Mss*, *cf*, Roman numerals and English), 37 cannot be
     judged. 1,445 of the 8,011 right (152,946 tokens) are own entries. In a
     hand sample of 60 of them, 10 are wrong and 3 borderline (*sē* → se
     "without", *aliquid* → the adverb "somewhat", *spatiō* → the verb
     "to walk", *cibō* → "to feed", *hōc* → "for this reason"), about 240
     words. A sample of words gives no share of tokens; the 16 own-entry
     words of Known gaps alone hold 11,622 tokens, 1.6% of the 10,000 words'
     743,438, and most of their uses need the other lemma, so wrong own
     entries hold about that share, against the 0.75% (5,571 tokens) the
     script counts wrong.
3. **Enclitics, pronouns and the auxiliary** in Tatoeba (Latin has no
   articles). Positions by kind:

   | Kind | Positions | Right | Wrong | Ambiguous |
   | --- | ---: | ---: | ---: | ---: |
   | Word with -que, -ne or -ve that the dictionary lacks whole (*virumque*) | 4,311 | 3,695 | 3 | 611 |
   | Participle or gerundive with a form of esse, read as one verb | 4,822 | 3,135 | 34 | 1,635 |
   | Form of ego, tu, sui, nos, vos, is, hic, ille, iste, ipse, idem, qui or quis | 31,565 | 30,953 | 150 | 84 |
   | Form of esse | 22,523 | 21,982 | 5 | 183 |

   The rest find nothing, find a phrase entry first, or cannot be judged. The
   150 wrong pronoun forms include *sibi* → sibus (Known gaps), the letter *i*
   read as an abbreviation of iuvenis, and *Id.* The audit's list
   of 34 nouns and adjectives misread with esse (*Rosa est* → rōdō) counts 29
   such first results in Tatoeba (157 at 29cb6f1) and 4 in the books (5). In
   the books: 1,421 enclitic positions (2 wrong, 265 ambiguous), 639 esse
   readings (12 wrong, 257 ambiguous), 10,308 pronoun forms (188 wrong) and
   3,167 forms of esse (none wrong). The union gives the same numbers;
   Yomitan's rules have no esse rule.
4. **Real text** (*Insula thesauraria* and *De Bello Gallico* V-VIII, every
   word looked up with the rest of its sentence): 101,097 lookups.
   - By script: 89,566 right and 658 wrong; 534 of the 658 tie with a right
     lemma. 19,287 of the right are own entries; in a hand sample of 60 of
     them, 7 are wrong (*posse* → posse "power", *spatiō* → the verb "to
     walk", *officiō* → "to hinder", *datō* → "to give often", *quantōque*)
     and 1 borderline. 6,003 are ambiguous (6,740 more were decided by
     `sources/homographs.tsv`); in a hand sample of 60, 8 are wrong
     (*quiētī* → quiēs for quiētus, *perdere* → perdor, *adflīctās* →
     afflīctō, *lūdī* → the verb lūdō, *satyrās* → satyrus). The
     dictionary's phrase entries come first at 737 positions (*in medio*,
     *non modo*), 3,545 find nothing and 588 cannot be judged; in a hand
     sample of 60 of those, 11 are wrong, all of them English, names,
     abbreviations or misprints (*the*, *Attium*, *MARCVS*, *lobore*).
   - That puts about 3,800 wrong first results among the 101,097 lookups
     (3.8%): 658 by script, about 2,250 among the own entries, about 800
     among the ambiguous and about 110 among those the script cannot judge.
     A sample of 60 has a standard error of about 4 to 5.5 percentage points:
     about 750 positions for the own entries and 280 for the ambiguous ones.
     The fifth audit judged 120 own-entry positions of the books and found 25
     wrong. With both samples (32 of 180 wrong), the own entries hold about
     3,400 wrong first results and the books about 5,000 (4.9%).
   - The groups (first step of the trace): `adj-i` 204 (*reī* → reus, *sibi* →
     sibus), the word as written 62 (the letter *i* 52, *Prīma*, *Tertia*),
     `n-nom-pl+n-acc-pl` 54 (*sōla* → solum, *mīlia* → milium), `n-dat-pl` 42
     (*sōlīs* → solum), `comparative` 39 (*longius* → longiter).
   - Tatoeba, 307,656 lookups: 279,252 right, 61,129 of them own entries (17
     wrong and 1 borderline in a hand sample of 60: *esse* → esse "state",
     *sē* → se "without", *es* → the letter S, *bellō* → "to wage war",
     *multa* → "fine", *Ībis* → ibis), 3,219 wrong (2,209 tied with a right
     lemma), 16,716 ambiguous (10 wrong in a hand sample of 60: *Cave* →
     cavus, *Audī* → Audus, *animīs* → anima for animus, *veniam* → venia),
     4,948 find nothing, 2,858 phrase entries and 663 cannot be judged (25
     wrong in a sample of 60: Toki Pona's *Pona*, names, New Latin,
     misspellings). That is about 23,600 wrong (7.7%), about 17,300 of them
     own entries, give or take about 3,500 for that sample. The fifth audit's
     120 own-entry positions had 27 wrong; with both samples (44 of 180), the
     own entries hold about 14,900 and Tatoeba about 21,200 (6.9%). Groups
     (first step of the trace): the
     dictionary's "genitive singular" rows 1,001 (*Ubi* → the tribe's Ubus
     902), `adj-am` 379 and `adj-ae` 262 (*Mariam*, *Mariae* → Marius), the
     dictionary's alternative spellings 313 (*Scīsne* → scin, *stat* →
     statim), its "genitive/vocative singular" rows 246 (*Venī* → Venius,
     *Herī* → Herius 214).
   - Union: 825 wrong in the books and 3,321 in Tatoeba. Yomitan's rules: 942
     and 3,883 wrong, and 4,611 and 6,490 positions find nothing (3,545 and
     4,948 for the final set).
   - The samples come from `measure.py judge --sample 60 --seed 1` (with
     `--sample-of ambiguous` or `--sample-of own`); the hand judgements are
     listed in the pull request. Before this round the judge counted own
     entries as plain right and let them pass before `homographs.tsv`; four
     of its rows (*faciendum*, *factum*, *nāta*, *ubi*) now apply, and 12
     book and 48 Tatoeba positions with a capitalised own entry the list does
     not name (*Prīma*, *Piscēs*, *Tertia*) now count wrong.
5. **Performance** (section 13; budgets 1 ms p50, 50 ms load, 20 MB heap; the
   pack has no `pattern` rule).
   - Native `benchmark-lookup` (wty-la-en mapped, the 80 texts of
     `sources/benchmark-words.txt`, 6 passes with the first dropped, three
     runs at machine load 28). p50 and p95 are nearest-rank
     percentiles of the 400 times of passes 2-6 (the 200th and 380th
     smallest). The 20 slowest times are the four slowest texts' five passes,
     so the 381st is already one of the four slowest texts' times.

     | Rule set | p50 | p95 |
     | --- | ---: | ---: |
     | Final | 53-55 µs | 183-196 µs |
     | Union | 55-59 µs | 190-213 µs |
     | Yomitan's rules | 31-33 µs | 84-91 µs |

   - WebAssembly (`sources/wasm-measure.mjs`, Hachidori feat/multi-language
     803f7b6e prebuilt engines, Node 22.23.1, the same texts, wty-la-en mapped
     from MEMFS, two runs at load 27, nearest-rank percentiles):
     - `hdw_lookup`: p50 0.133-0.142 ms and p95 0.616-0.667 ms single-thread;
       p50 0.138-0.142 ms and p95 0.674-0.686 ms threaded.
     - `hdw_language_load`: median 12.2-12.3 ms single-thread and 13.6-13.7 ms
       threaded over 10 fresh engines, at most 18.3 ms.
     - Live heap after the load: +1,369,232 bytes single-thread, +1,369,576
       threaded (`hdw_memory_stats`).
   - Hachidori (`test/chrome-language-pack.mjs`, feat/multi-language 803f7b6e
     with this branch at fa94455 in `third_party/hoshidicts`, Chrome
     152.0.7977.75): 56 of 56 checks pass. Settings adds Latin beside Japanese
     and imports wty-la-en (1,977,517 terms, 2.0 s); 52 hovered words find
     their lemma first with their trace (*virumque* → vir, *dūxit* → duco,
     *laudātus est* → laudo, and the audits' *Rosa est* → rosa, *Mensa est* →
     mensa, *altus est* → altus, *Veritas est* → veritas, *peritus est* →
     peritus, *dedit* → do, *Galliam* → Gallia, *patriam* → patria, *electus
     est* → eligo, *nāvī* → navis, *cōpiās* → copia, *Fortēs* → fortis, *loca*
     → locus, *Itali* → italus, *jure* → iure, *existit* → exsisto, *coelīs* →
     caelum, *tēcta* → tectum, *creātūram* → creatura, *Scrīptūrīs* →
     scriptura, *dicta* → dictum, *putet* → puto, *scrībam* → scribo, *captam
     esse* → capio, *sita est* → situs, *peccātōrum* → peccatum, *Iūra* → ius,
     *Vōta* → votum, *praecepta* → praeceptum, *factūram esse* → facturus,
     *futūrīs* → futurus, *pluviae* → pluvia, *mūsicam* → musica,
     *dēsīderat* → desidero, *cōnsīderat* → considero, *decimam* → decimus,
     *proximam* → proximus); the Anki note and the switch to Japanese and back
     work.
6. **Commands**. From the repository root, with `D` the imported dictionary, `G`
   the Gutenberg texts and `W` a scratch directory:

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
   #    union, Yomitan's rules, "pass": a copy of languages/ with that la/transforms.json or language.json;
   #    no rules: a copy whose la/transforms.json has "transforms": [] (its lookups: $W/top10k.empty.jsonl, ...)
   python3 $M judge $W/headwords.pickle $W/top10k.txt $W/top10k.jsonl --transforms languages/la/transforms.json \
     --homographs $H --freq $W/freq.tsv --top 10000 --show 25 [--same-as $W/top10k.empty.jsonl] [--reach build/hoshidicts-cli \
     --languages languages --corpus languages/la/tests/corpus.tsv,languages/la/tests/cases.tsv]
   python3 $M judge $W/headwords.pickle $W/books.txt $W/books.jsonl --transforms languages/la/transforms.json \
     --homographs $H --kinds 1 --show 25 [--same-as $W/books.empty.jsonl]             # and tatoeba
   #    hand samples: add --sample 60 --seed 1 --sample-out <file> [--sample-of ambiguous|own|changed]

   # 5. Speed
   build/benchmark-lookup languages/la/sources/benchmark-words.txt 6 --languages languages --language la --term $D --json
   #    p50, p95: nearest rank over the times of passes 2-6 in the JSON
   node --max-old-space-size=8192 languages/la/sources/wasm-measure.mjs <hachidori> languages/la $D \
     languages/la/sources/benchmark-words.txt 10 6

   # Checks
   node tools/check-classes.mjs la && build/language-conformance-test languages/la
   node tools/check-yomitan.mjs <yomitan d3c54c1> la --cli build/hoshidicts-cli
   python3 languages/la/sources/mutate.py . $W/mutants
   ```

   - **Conformance** (`language-conformance-test`): `corpus.tsv` 658 / 658,
     `cases.tsv` 1,114 / 1,114, `yomitan.tsv` 7 / 7, `text.tsv` 40 / 40,
     `lookup.tsv` 78 / 78; `gaps.tsv` 0 / 42 (reported). `classes.json` agrees
     with the engine (3 classes, 815 fields, 2 steps). 1,265 of the 5,324
     rules are exercised by a passing row. `tests/` and `sources/` hold
     999,536 bytes.
   - **Differential check** (`tools/check-yomitan.mjs`): 2,862 inputs and
     4,272 Yomitan results with no difference; the four processors agree with
     Yomitan's on 1,903 to 2,690 inputs each.
   - **Tests and traces.** Rows of `cases.tsv` give traces for the perfect
     (`perf-stem|perf-3s`), esse (`ptc-perf|esse`), the genitive, the locative,
     the imperfect, the comparative and `n-first`, so renaming one of those ten
     transform ids fails the test; other ids are not traced. `lookup.tsv` has
     rows for each transform order (*summō*, *media*, *dedit*, *maris*, *mēnse*,
     *Galliam*, *tēcta*, *armīs*) and rows that need form-of following, word
     resolution and the part-of-speech filter, so `mutate.py` catches the
     orders, `formOf: "asTerm"`, `searchResolution: "character"`, verb rules
     without `v` and `untaggedTerms: "pass"` (*sinis*). No test format checks a
     transform's display name or description.

## Known gaps

Ties that the pack cannot break are a framework issue (section 9.6), which the
lead has accepted for a later framework change (hachi-lang-engine-l: the
reading key only for packs whose readings are `required`,
`lookup.confirmedOrder: "references"` and `lookup.ownEntry:
"afterReferences"`); this pack sets the two keys and measures again once that
is on main. Of the wrong first results counted in
Measurements 2-4, the copy of the pack with no rules (`"transforms": []`)
shows the same first result for 25 of the 31 frequent words (5,270 of 5,571
tokens), 566 of the 658 book and 3,100 of the 3,219 Tatoeba positions: those
are dictionary ties. The rules make the other 6 words (301 tokens), 92 book
and 119 Tatoeba positions (`measure.py judge --same-as`). These counts cover
only the results the script judges wrong. Among the positions it counts
ambiguous, the rules change the first result against that copy at 1,303
book and 4,130 Tatoeba positions; in hand samples of 60 of them, the rules'
result is worse at 18 and 17, better at 35 and 37 and equal at 7 and 6. So
the rules make about 390 book and 1,170 Tatoeba first results wrong (give or
take about 80 and 240) and about 760 and 2,550 right. The own entries below
are dictionary ties, and the largest group.

- **The word's own entry** (hachi-lang-engine-l's Addendum 4, `lookup.ownEntry:
  "afterReferences"`, accepted by the lead on 2026-11-03 for packs that follow
  form-of rows). When the word as written is a headword, its entry has no
  trace step, and the lemma its own form-of rows name needs one, so section
  9.6 puts the entry first. No rule can outrank it. wty-la-en files several
  unrelated words under the spelling of a common form. The judge counts these
  first results as own entries: 1,445 of the 10,000 words (152,946 tokens),
  19,287 book and 61,129 Tatoeba positions. Most are right (*modo*, *quod*,
  *atque*, *opus*). Hand samples of 60 find 7, 17 and 10 of them wrong, about
  2,250 book and 17,300 Tatoeba positions and 240 frequent words
  (Measurements 2 and 4). The 16 words below hold 11,622 tokens of the
  frequency list (1.6% of the 10,000 words'). The largest such words, with
  their tokens in the
  frequency list and the book and Tatoeba positions where the entry comes
  first:

  | Text | First result | Needed | Tokens | Books / Tatoeba |
  | --- | --- | --- | ---: | --- |
  | *esse* | esse "state, condition" | sum | 3,500 | 366 / 1,645 |
  | *sē*, *se* | se "without" | suī | 3,237 | 492 / 1,044 |
  | *posse* | posse "power" | possum | 593 | 72 / 116 |
  | *multa* | multa "fine" | multus | 500 | 15 / 164 |
  | *locō* | locō "to place" | locus | 490 | 145 / 80 |
  | *aliquid* | the adverb "somewhat" | aliquis | 470 | 45 / 206 |
  | *suō* | suō "to sew" | suus | 467 | 75 / 169 |
  | *re* | the adverb re | rēs | 430 | 97 / 98 |
  | *animō* | animō "to animate" | animus | 416 | 67 / 76 |
  | *meum* | meum, a plant | meus | 396 | 78 / 505 |
  | *es* | the letter S | sum | 331 | 64 / 649 |
  | *bellō* | bellō "to wage war" | bellum | 198 | 31 / 61 |
  | *numerō* | numerō "to count" | numerus | 181 | 63 / 13 |
  | *spatiō* | spatiō "to walk" | spatium | 156 | 18 / 7 |
  | *aurō* | aurō "to gild" | aurum | 142 | 1 / 43 |
  | *populō* | populō "to ravage" | populus | 115 | 4 / 49 |

  Not every position of these words is wrong (*locō* "I place", *aliquid*
  "somewhat"). *es* counts the word alone; *Esne* and other forms with an
  enclitic add more.
- **The reading key.** wty-la-en leaves the reading empty for headwords
  without long vowels, and the engine fills it with the expression, so on a
  tie the comparator's "written form equals reading" key ranks them first:
  *sibi* → sibus before suī (1,067 tokens of the list), *reī* → reus before
  rēs, *mīlia* → milium before mīlle, *facis* → fax before faciō, *dīcam* →
  dica before dīcō, *tria* → treuga before trēs, *sōla* and *sōlī* → solum
  before sōlus, and *Mariam*, *Mariae* → the adjective Marius before the
  name Maria (639 Tatoeba positions, 578 of them inside a sentence; the
  dictionary has rows for both, and Marius' reading equals its expression).
  Looked up with no rules at all, the dictionary's own form-of rows give the
  same first results. Counted as the first audit counts its 59 frequent
  homographs (the first result is the wrong lemma its table lists), 32 of
  the 10,000 words (*rei* and *reī* are two of them; 3,324 tokens), 345 book
  and 602 Tatoeba positions are still wrong (57, 601 and 1,187 at 29cb6f1);
  all but *argentī* and *mentis* (212 tokens, 6 book and 18 Tatoeba
  positions) are dictionary ties.
- **Other dictionary ties**: *Scīsne* → scin (154 Tatoeba positions), *stat* →
  statim (138 tokens, 41 Tatoeba), *carnem* → carnis (104 tokens, 72 Tatoeba),
  *Vidēsne* → viden (76), *putās* → putus (18 tokens, 4 book and 74 Tatoeba),
  *bibere* → biber (73), *velis* → vēla (58 tokens, 21 book and 22 Tatoeba),
  *inque* → inquam (57 tokens), *equitātū* → equitō (35 book), *Herus* → Hero
  (27 book), *OCTAVIUS* → octarius (204 tokens), *Ii* and *II* → Ios (677
  tokens) and the letter *i* (1,681 tokens).
- **Capitals at the start of a sentence.** A capitalised word is looked up as
  written before it is decapitalised, so the dictionary's rows for names win:
  in Tatoeba *Ubi* → the tribe's Ubus (902 positions), *Venī* → Venius and
  *Herī* → Herius (214), *Canem* → Canis (43), *Diē* → Zeus (37), *Iī* → Ios
  (23), *Virī* → Virus (22), *Magnum* → Magnus (20), *Vīdī* → Vidius (19),
  *Morī* → Morus (17), *Patris* → Patrae (14), *Magnī* → Magnus (14),
  *Equum* → Equus (14), *Novī* → Novius (13), *Servī* → Servius (12), *Equī*
  → Equus (11); in the hand samples *Audī* → Audus and *Collēgam* → Collega.
  Reading such capitals is a Hachidori follow-up. All-caps names in headers
  go through the common-noun and verb rules: *CAESAR* and *CAESARIS* →
  caesus, *CICERO* → cicer (1 Tatoeba position).
- **The form looked up.** The comparator's key "written form equals the form
  looked up" puts navō before navis for *nāvem* (96 tokens): the rule reads
  the macron text as *nāvis*, which matches navis only through its reading.
  The same key puts a first-conjugation subjunctive before a third-declension
  noun for *mīlitem* → mīlitō, *lēgem* → lēgō, *pācem* → pācō, *dōtem* →
  dōtō and *līmitem* → līmitō (2 Tatoeba positions; macron text is rare in
  the measured texts, but these are frequent words in any text with
  macrons), and *nēmo* with a short o reaches neō through `adj-o` with no
  processor step, before the pronoun with one. Neither change planned in
  hachi-lang-engine-l reaches this key.
- **Other wrong first results the rules make** (the copy with no rules shows
  another first result, or none): *quę* and *que* (for quae) → queō (122
  tokens, 4 book and 3 Tatoeba positions), *ārī* → aris (54 tokens, the ending
  in a reader's word list: *admīror, -ārī*), *MARONIS* → marum (16 tokens, the
  header *PUBLI VERGILI MARONIS*), *tubulōrum* → tubula (13 tokens); in the
  books *misellum* and its forms → miser (14), *diversoriī* and its forms →
  deversorius (12), *humerum* and *humerī* → humus (8); in Tatoeba *literās* →
  litus (7), *latīnam* → latīnō (5), *Manibus* → Mānēs (3), *Liberīs* → Liber
  (3), *non scientia* → nesciō (3); capitalised words read through the name
  rules, *Prae* → Pras (3 and 3), *Leōnem*, *Leōnī* → Leo (5), *Actiōnī* →
  Actium (3); single positions. The esse readings below are among them. These
  are counted ambiguous, because the word's rows name both lemmas or its
  spelling without macrons is both forms; the copy with no rules shows the
  needed one: the dative plural rule reads *lūdis* as lūdus (23 Tatoeba and 2
  book positions), *scrībis* as scrība (18) and *cupis* as cūpa (12 and 1),
  where the verb is needed; *laterī* and *laterum* → later "brick" for latus
  "side" (58 tokens; 2 book and 8 Tatoeba positions), *iuga* → iugus for iugum
  (69 tokens; 1 and 2), *hostī* → hostus (24 tokens), *plēbis* → pleō (18
  tokens; 3 and 1), *vōmere* → vomō (17 tokens), *mōlītur* → molō (18 tokens),
  *vīvam*, *vīvās* → vīvus for vīvō (15 tokens; 5 and 21), *fēriās* → feriō
  (13 Tatoeba); and the dative plural in -īs read as a feminine first,
  *fīliīs*, *discipulīs*, *nūntiīs*, *proximīs* → fīlia, discipula, nūntia,
  proxima (16 tokens; 22 and 60): the rules inside `n-dat-pl` give -īs → -a
  first, and putting -īs → -us first breaks *armīs* and *puellīs*. *argentī* →
  argentus (61 tokens, 12 positions: `adj-i` keeps one exclusion, for *nāvī*,
  to stay within the 1 MB of `tests/` and `sources/`) is counted wrong.
- **Sampled forms the rules do not reach** (`gaps.tsv`, 42 of 700):
  - proper nouns, 14 of 35: names declined like common nouns (*Cemenelī* →
    Cemenelium, *Bagdadō* → Bagdadum). The name rules are kept narrow (Rule
    provenance), so most names are found through the dictionary's form-of
    rows (*Herculis* → Hercules; *Latiō* reaches Latium second, after the
    adjective Latius), not through rules;
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
  (*necātus est* → necor: wty-la-en's passive first persons have no reading, so
  the reading key puts them first; *ignōta est* → ignōscō, *sēcrētum est* →
  sēcernō, *praeditus est* → praedor, *servitūs est* → serviō), and 1,635 and
  257 are ambiguous because the participle is also a noun or adjective (*nātus
  est*: nascor, right). Among the ambiguous ones, where the copy with no rules
  shows the adjective: *beātus est* and its forms → beō (29 Tatoeba positions),
  *contentus est* → contineō (18 and 4 in the books), *tūtus est* → tueor (9 and
  1). Fourth-declension nouns before esse are read as participles where the noun
  is meant (*cursus est* → currō, *magistrātus sum* → magistrō, *status erat* →
  sistō; 6 Tatoeba and 4 book positions for the common such nouns), and the
  rules do not check that the participle and the form of esse agree in number
  (*iactus sunt*, *introitus erant*, *nātī est*). A future participle in -ūram
  or -ūrās before esse, fuisse or fore is not read with esse: of 58 Tatoeba
  positions, 55 show the participle (*victūram esse* → victūrus), and none needs
  a noun. The rules do not read -ūram esse as a verb because in prose the -ūra
  nouns come before esse too: the fifth audit counts 9 of 20 such positions in
  the frequency-list texts as nouns or an adjective (*nātūram*, *creātūram*,
  *pūram*). A reading of both words would always come first, since it matches
  more text. Some readings the script counts wrong are right by the grammar:
  *tūta est* → tueor, *quiētus sīs* → quiēscō.
- **What the fourth round's changes get wrong**: *generum* and *generī* now
  show genus at 17 book and Tatoeba positions, where 3d21931 showed gener
  "son-in-law"; 6 of them need gener (*Generum meum amō*, *generum suum
  interfēcit*), the other 11 genus (*omnium generum*). Of the 16 *prōmiss-*
  positions that `n-first` reads as prōmissum, 6 need the participle
  prōmissus "long, hanging down" or "promised" (*Capillī meī sunt tam
  prōmissī quam Ioannae* 4 times, *prōmissō … capillō*, *prōmissa Lāvīnī
  moenia*). The copy with no rules shows the same first results.
- **Other groups the rules make wrong** (largest first; the copy with no
  rules shows the needed lemma): *dubiō*, *dubiī* → dubius for dubium (*sine
  dubiō*; 59 tokens, 9 book and 15 Tatoeba positions), *maledicta*,
  *maledictō* → the participle for maledictum "curse" (19 book), *satura*,
  *Satyra* → satur or satyrus for satura "satire" (13 book), *cōnsequī*,
  *vescī* → cōnsequus, vescus before the deponent infinitive (55 tokens; 3
  and 5), *rōbore*, *rōbora* → rōbus for rōbur (74 tokens; 5 Tatoeba),
  *Latiō* → Latius for Latium (42 tokens; 4 Tatoeba), *clāvem* → clāvō for
  clāvis (8 Tatoeba), *canet* → caneō for canō (8), *colōrum* → colus for
  color (20 tokens; 4), *praesidī* → praeses for praesidium (4 book), *orbī*
  → orbus for orbis (19 tokens), and single positions in the samples above
  (*dēfēnsōrum*, *aestīvīs*, *coquīnae*, *vōmerēs*, *fēriantur*).
- **Adjective and noun ties left in order.** Adjectives and participles come
  first on ties, which is right more often (above), and the noun is then
  second. `n-first` puts the noun first for the stems where the noun was
  right in nearly every sampled sentence; for the others the samples were
  mixed, and they keep the order: *scrīpta*, *scrīptīs* and its forms →
  scrīptus (239 tokens; 11 book and 9 Tatoeba positions), *data*, *datīs* →
  datus (73 tokens; 17 and 10), *vīsa* → vīsus (73 tokens; 8 and 10),
  *prōpositō* and its forms → prōpositus (92 tokens; 10 and 3), and *patriīs*
  → patrius (often the adjective: *patriīs mōribus*).
- **Spellings the dictionary does not name**: *literās* → litus, *sēculōrum*
  → sēcula and *que* (for quae) → queō. A processor step ranks after a
  reading without one, so the rules read such a spelling as written before
  the processed form is looked up (*jūre* needed an exclusion to be iūre).
  With u for consonantal u, the
  dictionary's reconstructed *uō* comes first for *uero* and *uita*
  (wty-la-en has form-of rows for them): in Caesar written with u, 75 of
  17,374 positions change.
- **Conjugation classes**: wty-la-en tags every verb `v`, so the endings of one
  conjugation also apply to verbs of the others: *iūre* also reaches iūrō,
  after iūre, through the third-conjugation imperative of a
  first-conjugation verb.
- **Intermediate forms the dictionary also has**: the perfect endings bring a
  form to its first person in -ī, and where wty-la-en lists that form as
  another person of another verb, the rules reach that verb. *existere* and
  *existit* reached exeō through *existī* until exist- was left out of those
  two endings.
- **Pronouns and names have no part of speech** in wty-la-en, so their rules
  have no conditions and their outputs feed the noun and verb rules: `qui` →
  `quis` → `qui` → `quo` gives 25 false candidates (Measurements 1).
  `untaggedTerms: "pass"` would let these rules carry a condition, but on its
  own it makes real text worse (Measurements 1).
- **WebAssembly with paged storage**: `hdw_add_dict` with paged entries and
  index returned no results in Node, so only mapped storage is timed. This was
  not investigated.
