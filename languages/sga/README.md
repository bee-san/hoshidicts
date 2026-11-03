# Old Irish (`sga`)

Deinflection rules, text processors and scanning settings for Old Irish
(about 700-900), as editions and Wiktionary normalise it. Lookups start at the
hovered word and try only prefixes that end at a word boundary (`word` /
`word` / `spaces`, docs/languages.md 14.1). The middle dot of a verbal complex
(`ní·charat`, `do·berat`) is `wordInternal`, so a lookup reads the whole
complex as one word.

The recommended dictionary, wty-sga-en, leaves the part-of-speech column
(`rules`) empty on all of its 19,891 rows, so the pack sets
`lookup.untaggedTerms` to `"pass"` (docs/languages.md 4.4). The rules keep
their conditions (`v`, `n`, `adj` and the intermediate states below), which
bound their chains.

What the rules read:

- the initial mutations: lenition (`chenn` → cenn, `ḟer` → fer), nasalisation
  (`n-ech`, `nech` → ech, `mbó` → bó, `ṅdé` → dé) and h-prothesis (`hÉrinn`);
- the verbal complex: conjunct particles (`ní·`, `ro·`, `no·`, `nícon·`, …),
  infixed pronouns (`nom·`, `dom·`, `atom·`, …), mutations after the dot
  (`ní·charat`, `nod·n-ail`, `fod·era`), and compound verbs, whose headword is
  written without the dot (`do·berat` → dobeir);
- conjunct and absolute verb endings of the weak, strong and hiatus verbs and
  the deponents, with the palatal stem of the third singular (`·berat` →
  ·beir → beirid);
- the copula and the substantive verb (`níptar` → is, `ní·fil` → attá);
- noun and adjective endings with their palatal and u-infected stems (`fir`,
  `fiur` → fer), syncope (`bríathraib` → bríathar), the n-, dental and
  guttural stems, and a list of irregular nouns (`mná` → ben, `Dé` → día);
- comparison, emphasising suffixes (`labrad-sa`), and spelling variants (`cend`
  → cenn, `caraith` → caraid, `gabaal` → gabál, `ā` for á).

## Sources and licences

- `sources/own.json` and every rule of `transforms.json` with source `own` or
  `both`: written for this pack (GPL-3.0-or-later). `sources/build-own.mjs`
  generates them from the paradigm tables in it. The tables follow the
  standard description of Old Irish (R. Thurneysen, *A Grammar of Old Irish*,
  1946; D. Stifter, *Sengoídelc*, 2006; J. Strachan, *Old-Irish Paradigms*) and
  Wiktionary's Old Irish tables. No text or table is copied from them.
- `sources/yomitan.json`: Yomitan's Old Irish rules,
  [`ext/js/language/sga/old-irish-transforms.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/sga/old-irish-transforms.js),
  ported by `tools/port-yomitan-transforms.mjs`. `sources/map-yomitan.mjs` maps
  its 27 `todo` rules. GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan
  Authors. The processors `decapitalize`, `capitalizeFirstLetter` and
  `removeAlphabeticDiacritics` are Yomitan's
  (`ext/js/language/text-processors.js`, same licence). Yomitan has no Old
  Irish transform test, so the pack has no `tests/yomitan.tsv`.
- `tests/corpus.tsv` and the sampled rows of `tests/gaps.tsv`: 1,500 pairs
  sampled with seed 1 by `sources/build-corpus.mjs` from two sources, using
  only the lemmas the rules were not written on (odd MD5):
  - Wiktionary's Old Irish declension, conjugation and mutation tables as
    kaikki.org extracted them
    ([kaikki.org-dictionary-OldIrish.jsonl](https://kaikki.org/dictionary/Old%20Irish/),
    extracted 2026-10-30 from the English Wiktionary dump of 2026-10-01,
    sha256 `36236d1c…2a5e`), CC BY-SA 4.0 and GFDL, by the Wiktionary
    contributors, extraction by wiktextract (kaikki.org). 450 noun, 200
    adjective, 450 verb and 250 mutation rows.
  - [UniMorph sga](https://github.com/unimorph/sga/blob/de9858d9966879b78d44fcded5287858146a6e16/sga)
    at de9858d (sha256 `2234deee…67e6`), CC BY-SA 3.0, by the UniMorph
    contributors. 150 verb rows.

  Rows the final rules reach are in `corpus.tsv` (789), the others in
  `gaps.tsv` (711).
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`,
  `tests/dictionary/`, `sources/real-use.tsv` and the rest of `language.json`:
  written for this pack (GPL-3.0-or-later). `sources/benchmark-words.txt`: 80
  short excerpts of *Táin Bó Cúailnge* (below, public domain).
- Not committed, used for the measurements below. Each is downloaded once into
  the work cache, and `sources/measure.py` checks its sha256:
  - the dictionary
    [wty-sga-en](https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/sga/en/wty-sga-en.zip)
    from [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan),
    revision 2026.10.22 (wty commit 61eaa08, sha256 `92b53b71…b9fb`, 19,891
    term rows: 3,791 entries and 16,100 form-of rows), CC BY-SA 4.0;
  - the Würzburg glosses, text and lemmas, from
    [AdeDoyle/WurzburgSiteCode](https://github.com/AdeDoyle/WurzburgSiteCode)
    at fe6ab4a (`glosses.json`, sha256 `fbf6e70c…d786`), CC BY 4.0, Adrian
    Doyle (text from *Thesaurus Palaeohibernicus* I, Stokes and Strachan);
  - the treebanks [UD_Old_Irish-DipWBG](https://github.com/UniversalDependencies/UD_Old_Irish-DipWBG)
    at 03825e0 (CC BY-SA 4.0) and
    [UD_Old_Irish-DipSGG](https://github.com/UniversalDependencies/UD_Old_Irish-DipSGG)
    at e92ab88 (CC BY-NC-SA 4.0), Adrian Doyle;
  - *Táin Bó Cúailnge*, Recension I, ed. J. Strachan and J. G. O'Keeffe
    (1912), public domain, from
    [Wikisource](https://wikisource.org/wiki/T%C3%A1in_B%C3%B3_C%C3%BAailnge)
    (the transcribed pages 15-134 of `Tain Bo Cuailnge.djvu`, 126 page
    revisions saved as `pages.json`, sha256 `04d4283a…badd`), 33,061 words.

wiktionary-to-yomitan has the only Yomitan-format Old Irish dictionary; it is
the recommended one. Old Irish has no frequency list or sentence corpus of
the size section 14 assumes, so the measurements use the glosses (about
10,000 tokens with lemmas) and the Táin.

## Rule provenance

`transforms.json` has 76 transforms and 1,124 rules: 1,062 `own`, 13 `both`
and 49 `yomitan`. `sources/build-final.mjs` writes it from the union of
`sources/own.json` (64 transforms, 1,075 rules) and `sources/yomitan.json` (15
transforms, 70 rules), and `sources/yomitan-provenance.tsv` lists what became
of each Yomitan rule:

- **Repeated by an own rule (17 rules, kept as the own rule, marked `both`)**:
  Yomitan's word-initial lenition (`ch`, `th`, `ph`), nasalisation (`ng`, `mb`,
  `nd`, `n-`), h-prothesis (`ha` … `hu`, `h-`) and the doubled `rr`, `ll`, `nn`,
  `mm` make the same deinflection as an own mutation rule.
- **Kept (49 rules)**: the spelling replacements (`nd for nn`, `cg for c`, `td
  for t`, `pb for p`, `ǽ/æ for é`, doubled vowels and consonants, Middle Irish
  `gh`, `bh`, `dh`), the Middle Irish nasalisation `gc`, `bp` and lenition
  `gh`, `bh`, `dh` at the start, `m-` and the geminated initials. Yomitan gives
  its replace rules no conditions; the final set gives them the own spelling
  rules' conditions (in: the headword forms `n_dict`, `adj_dict`, `v_dict`;
  out: `spelt`, which no rule takes), so a variant is made once, of the text
  or of a form an ending rule reached. With empty conditions they applied to
  each other's output: before this change the union's lookups ran out of
  memory on some texts of the Würzburg glosses (`ulimit -v` 8 GB), and a
  word with three spelling sites had hundreds of deinflections.
- **Left out (4 rules)**:
  - `lenited` (`ch`, `th`, `ph` → `c`, `t`, `p` anywhere but at the start).
    `--per-rule` on the sample: 0 rows recovered, 35 false candidates. In the
    union, 104 first results on the Táin come through it (80 distinct
    readings, all judged by hand in `sources/judged-tain.tsv`): 16 positions
    are right (`adchīu` → adcí, `cairpthib` → carpat, `uilche` → olc), 73
    wrong (`Rōich` → roicc for the name Róech, `cōich` → cóic, `brath` →
    brat, `lathi` → lat) and 15 unsure. The own rule
    `lenitionInCompound` reads the lenition of a compound verb written
    without the dot (`focheird`, `dochuirethar`, `dothǽt`), the right
    readings' main group; 3 of 19 constructed compound forms it does not reach
    (`adchí`, `dochel`, `fritchuirethar`).
  - `[IM] nasalized (Middle Irish)` `dt` → `d`: eclipsed t is t (`dtech` is
    tech, not wty-sga-en's dech "best"); `cases.tsv` has the negative.
- **Own rules**: written before Yomitan's file was read (commit "sga: own
  rules", 54 transforms, 1,043 rules). The later commits changed them after
  measuring on the design half of Wiktionary's tables and on the texts above:
  - conditions for the verbal complex: `v_conj` (a particle, pronoun or
    mutation was removed), `v_conj3` and `v_conj3u` (a third singular
    conjunct, with or without its palatal stem), `v_absu` (an absolute form
    to palatalise), `nom_pal` and `nom_uinf` (a palatal or u-infected case
    stem), `spelt`;
  - the palatal stem as a step of its own (`conj-palatal`, `abs-palatal`)
    instead of a copy of every ending rule, which took the rules from 1,256
    to 1,124 and `tests/classes.json` from 567 KB to 362 KB;
  - minimum stems and consonant-final stems for the noun endings
    (`naib` is not `na` + `-ib`, `fria` is not `fri` + `-a`), syncope, the
    Táin's `ā` for á, `ṅ`/`ṁ` for the nasal, `lenitionInCompound`, the forms
    of téit compounds (`dothéit`, `dothǽt` → dotét), `níth` (thou art not);
  - the S-class conjunct endings and syncope no longer require a
    consonant-final stem: on the Wiktionary example sentences (dotted
    forms) that gives `do·ṅgníat`, `ad·ciam` and `aras·celatais` their verbs
    (14 of 16 changed first results right; `ro·cloammar` → cloid and
    `ara·mbiat` → mbid wrong), the passive keeps it (`in·samlathar` is not
    samlaid).

## Measurements

All numbers with wty-sga-en as published, imported by `hoshidicts-cli
import`, at hoshidicts 1fed676 (GCC 14.3, Release), unless a line says
otherwise. The pack has no optional processor or transform, so every file
gives the same numbers with every option on and with the defaults
(`sources/measure.py eval` runs both; each pair below is equal).

1. **`eval-language --dictionary`** (`sources/measure.py eval`). The sample is
   the 1,500 rows of `corpus.tsv` and `gaps.tsv`; recall over it is the final
   recall. Yomitan's rules give no conditions, so their run uses a copy of
   each file with `*` in the rule column. `untaggedTerms` `"filter"` is
   Yomitan's behaviour with this dictionary: every rule output that has a
   condition finds nothing.

   | Rule set | untaggedTerms | Sample recall | False cand. | First rank | cases.tsv recall | cases.tsv negatives | cases.tsv false cand. | cases.tsv first rank |
   | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
   | Own | pass | 52.00% | 0.383 | 62.47% | 92.13% | 100% | 0.528 | 82.58% |
   | Yomitan | (no conditions) | 10.80% | 0.161 | 54.20% | 7.87% | 96.6% | 0.264 | 46.63% |
   | Union | pass | 52.67% | 0.449 | 62.60% | 99.44% | 95.3% | 0.652 | 89.33% |
   | **Final** | **pass** | **52.60%** | 0.423 | 62.47% | 100% | 100% | 0.629 | 89.33% |
   | Own | filter | 52.00% | 0.131 | 54.13% | 92.13% | 100% | 0.225 | 38.76% |
   | Union | filter | 52.67% | 0.162 | 54.20% | 99.44% | 95.3% | 0.315 | 48.31% |
   | Final | filter | 52.60% | 0.133 | 54.13% | 100% | 100% | 0.230 | 42.13% |

   The sample's strata (reached / sampled): noun 285 / 450, adjective 153 /
   200, verb 112 / 450, mutation 225 / 250, UniMorph verb 14 / 150. The union
   breaks 7 of `cases.tsv`'s 148 negatives, through Yomitan's `lenited`, `dt`
   → `d` and the Middle Irish initials. `--per-rule` on the final set and the
   sample: 160 rules recover a row no other rule reaches, no rule breaks a
   negative, and the transforms that add the most false candidates are
   `nasalization` (86; it recovers 95 rows), `depalatalization` (66; 106),
   `doubled consonant` (51; 6, Yomitan's), `dat-pl` (47; 101) and `spelling`
   (31; 6). They are kept: the texts below show more right first results
   through them than wrong.
2. **Frequent forms** (`sources/measure.py frequent`). With no frequency list
   for Old Irish, the list is the 2,187 Old Irish word forms of the Würzburg
   glosses ranked by their count (10,082 tokens), each with its most
   frequent gold lemma. A word counts when its gold lemma is a headword and
   a rule or a form-of row reaches it, or the word is its lemma. Looked up
   as a host does:

   | Rule set | Words counted (tokens) | Wrong lemma first: words (tokens) |
   | --- | ---: | ---: |
   | No rules | 783 (7,569) | 82 (380) |
   | Own | 944 (7,836) | 108 (399) |
   | Yomitan | 832 (7,625) | 93 (392) |
   | Union | 984 (7,883) | 117 (412) |
   | Final | 986 (7,883) | 116 (409, 5.2%) |

   The most frequent wrong first results are words the dictionary lists as
   written with another sense, which no rule changes: `as` (50 tokens; the
   glosses' copula, the dictionary's preposition first), `sa` (49; the
   emphatic -sa, the dictionary's so), `ind` (23), `tre` (19), `dom` (16).
3. **After articles, particles and prepositions** (`sources/measure.py
   contexts`; the Würzburg glosses and UD, at the token after one, gold
   lemma a headword):

   | Rule set | After an article (242): right / wrong / none | After a particle (591) | After a preposition (691) |
   | --- | ---: | ---: | ---: |
   | No rules | 162 / 27 / 53 | 98 / 113 / 380 | 401 / 91 / 199 |
   | Own | 195 / 29 / 18 | 140 / 142 / 309 | 483 / 112 / 96 |
   | Union | 198 / 29 / 15 | 143 / 148 / 300 | 491 / 128 / 72 |
   | Final | 198 / 29 / 15 | 142 / 145 / 304 | 492 / 128 / 71 |

   The glosses' tokens split a verbal complex at the dot (`ní` + `charat`), so
   the forms after a particle are conjunct forms without their particle, which
   the dictionary lists less often than as complexes.
4. **Real text** (`sources/measure.py text`).
   - **Gold lemmas**: every Old Irish token of the Würzburg glosses and the
     two UD treebanks (10,910 tokens; for 9,920 the gold lemma is a
     headword), looked up from the token to the end of its gloss. First
     result right / wrong / nothing: no rules 3,356 / 1,006 / 5,558 (33.8%
     right); own 3,787 / 1,087 / 5,046 (38.2%); Yomitan 3,501 / 1,078 /
     5,341 (35.3%); union 3,822 / 1,122 / 4,976 (38.5%); **final 3,824 /
     1,114 / 4,982 (38.5%)**; final with `untaggedTerms` `"filter"` 3,585
     right (36.1%). A first result counts as right when it equals the gold
     lemma without marks, dots and hyphens; the gold follows Kavanagh's and
     Bauer's lexicons, so some differences are names only (the glosses'
     `so` for the dictionary's -su). The rules behind the most wrong first
     results: `depalatalization` 44 (`lim` → lem for la, `duib` → dub for
     do), `nasalization` 27 (`ndib` → di), `nom-pl` 20, `copula` 18 (`at` →
     is where the gloss splits `at·chiam`).
   - ***Táin Bó Cúailnge***: 33,061 lookups, one per word. With the final set
     the first result is the text as written at 12,902, a form-of row of the
     text at 3,144, a rule's reading that a form-of row of the text names at
     2,515 (right by script), a rule's reading no row names at 3,206, and
     nothing at 11,294 (no rules: nothing at 14,443). A random sample (seed
     20261103) of 80 of the 1,637 distinct readings of the 3,206 was judged
     by hand (`sources/judged-tain.tsv`): 41 right (76 positions), 24 wrong
     (39) and 15 unsure (20). At
     that rate between about 930 and 1,400 of the 3,206 positions, 2.8% to
     4.2% of the lookups, show a wrong first result through a rule. The
     wrong ones are names read as words (`nDelbaith` → delbaid, `Manes` →
     manid, `mBreg` → brí), and homographs of a case form (`naill` → all for
     aile, `fichti` → fecht for fichit, `géisi` → géiss for géis,
     `chlaidib` → claide for claideb). The rules behind the 3,206 readings:
     `nom-pl` 574, `depalatalization` 567, `doubled consonant` 298,
     `nasalizationNoHyphen` 191, `lenition` 180.
   - **Real use** (`sources/real-use.tsv`, sentences written for the pack,
     looked up with `sources/lookup-batch.cpp`): 29 of the 30 words show the
     expected headword first, with the traces of the rules (`Ní·charat` →
     caraid [particle, lenition, present, absolute], `Do·berat` → dobeir
     [present, palatal stem, compound verb], `bríathra-sa` → bríathar
     [emphatic, syncope]). `maccu` shows the dictionary's own `maccu`
     ("descendants of") before macc.
5. **Performance**.
   - Native `benchmark-lookup --languages languages --language sga` with
     wty-sga-en mapped, the 80 texts of `sources/benchmark-words.txt`, 6
     passes with the first dropped, three runs at machine load 38-46. The
     budget is 1 ms p50.

     | Rule set | p50 | p95 |
     | --- | ---: | ---: |
     | Final | 51-52 µs | 104-106 µs |
     | Union | 70-71 µs | 172-173 µs |
     | Own | 42-43 µs | 88-90 µs |
     | Yomitan's rules | 25-26 µs | 54-55 µs |

     The pack has no `pattern` rule.
   - WebAssembly (Node 22.23.1, machine load 36-41): Hachidori
     feat/multi-language a2086ec2 with its three runtimes rebuilt by
     `wasm/build.sh` on this branch (the shipped ones predate
     `untaggedTerms`; Known gaps). `hdw_language_load` of this pack, median
     over 10 fresh engines: 5.8 ms single-thread and 6.2 ms threaded; live
     heap +636,512 and +635,696 bytes (`hdw_memory_stats`). The budgets are
     50 ms and 20 MB. `benchmark/node-lookup.mjs` with
     `HACHIDORI_LOOKUP_LANGUAGE=sga` on the 26 sentences of
     `sources/real-use.tsv` (140 hover positions, 6 passes): `hdw_lookup`
     p50 102 µs and p95 211 µs single-thread, p50 108 µs and p95 215 µs
     threaded.
   - Hachidori in Chrome (`test/chrome-language-pack.mjs` with the same
     build, Chrome 152, wty-sga-en, the 30 cases of `sources/real-use.tsv`):
     33 checks pass and 1 fails, `maccu` (Measurements 4). Settings adds
     Old Irish beside Japanese and imports the dictionary (19,891 terms,
     0.7 s), 29 hovered words show their headword first, the Anki note's
     first field is `caraid`, and the toolbar switches to Japanese and back.
6. **Commands and scripts**: `sources/measure.py` (`scratch`, `eval`,
   `text`, `frequent`, `contexts`), `sources/mutate.py` (the mutation check of
   section 14 step 7), `sources/lookup-batch.cpp`, `sources/build-corpus.mjs`
   and `sources/build-final.mjs`; the hand judgments are
   `sources/judged-tain.tsv` (`sources/measure.py judge` lists the readings).
   Conformance: corpus.tsv 789 / 789, cases.tsv 326 / 326, text.tsv 21 / 21,
   lookup.tsv 45 / 45; gaps.tsv 0 / 711 (reported). `tools/check-yomitan.mjs`:
   2,214 inputs, 3,579 Yomitan results, one listed difference (a text that
   starts with a tripled letter, `oook`), and the three processors agree on
   1,872 to 2,658 inputs. `sources/mutate.py`: 233 mutations of stem
   constraints, transforms and settings; 222 fail a test, and the 11 that
   do not are listed under Known gaps.

## Known gaps

- **Verbs.** The rules reach 112 of the 450 sampled verb forms of Wiktionary
  and 14 of the 150 of UniMorph (most of `gaps.tsv`). Old Irish verbs change
  their stem from tense to tense: reduplicated and suffixless preterites
  (`·cechain`), perfects with ro- (`ro·uccus`), s- and reduplicated futures
  and subjunctives (`·gigius`, `·tías`), suppletion (`luid`, `lotar` for téit,
  but these the dictionary lists), prototonic compounds (`·tabair`, `·epir`)
  and the passive preterite participles. The rules read endings, mutations
  and the verbal complex; the dictionary's form-of rows cover many stem
  forms (3,319 of the 11,318 verb forms of the tables are keys).
- **Nouns and adjectives.** 165 of 450 noun and 47 of 200 adjective forms are
  not reached: vowel alternations of the stem (`lia`, `lïac`), irregular and
  consonant stems outside the list (`athair`, `bráthair` have a rule; others
  do not), and spelling of the tables (`*bindem`).
- **Wrong first results on real text**, about 2.8-4.2% of the Táin's lookups
  (Measurements 4): names read as common words, case forms of one word read
  as another (`naill`, `fichti`, `géisi`, `chlaidib`), and in the glosses
  `lim`, `duib` (the conjugated prepositions la and do, which the dictionary
  lists under other spellings).
- **Function words as written.** `as`, `sa`, `ind`, `tre`, `dom` and `inna`
  show the dictionary's entry for the written form first (Measurements 2);
  no rule changes a word the dictionary lists.
- **Yomitan's `lenited` left out**: the right readings it gave on the Táin
  (16 positions, Rule provenance) are lost where `lenitionInCompound` does not
  reach them (`cairpthib`, `uilche`, `brisfithir`; `adchí`).
- **The dictionary.** The preposition i is keyed `i/languages M to Z`; 2,016
  keys are form-of rows whose every reference names a row that is itself only
  references, which one hop (docs/languages.md 16) does not follow.
- **Mutation check survivors** (`sources/mutate.py`): no text or table word
  differs with or without these, and no constructed text was found:
  `notAtStart` on Yomitan's doubled vowel, doubled consonant and Middle Irish
  lenition rules (the extra readings at the start, `ii` → í and `mmruig` →
  mruig, are right); `stemMinLength` of the dotted conjunct rules `conj-pres`,
  `conj-1sg`, `conj-pret3sg`, `conj-palatal`, `abs-palatal` and `emphatic`,
  and `conj-1sg`'s `stemEndsWith`; the abbreviation signs in the word class,
  which only a host's choice of where a word starts shows.
- **Hachidori.** Hachidori's shipped runtimes predate `untaggedTerms` and
  refuse the pack ("lookup.untaggedTerms: unknown key"); shipping the pack
  needs the submodule bump to a hoshidicts main with #58 and the runtime
  rebuild.
- **Not pinned by a test**: `traceSelection: "shortest"`, which no lookup row
  can observe.
