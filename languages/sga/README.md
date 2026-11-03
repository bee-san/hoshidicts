# Old Irish (`sga`)

Deinflection rules, text processors and scanning settings for Old Irish
(about 700-900), as editions and Wiktionary normalise it. Lookups start at the
hovered word and try only prefixes that end at a word boundary (`word` /
`word` / `spaces`, docs/languages.md 14.1). The middle dot of a verbal complex
(`ní·carat`, `do·berat`) is `wordInternal`, so a lookup reads the whole
complex as one word.

The recommended dictionary, wty-sga-en, leaves the part-of-speech column
(`rules`) empty on all of its 19,891 rows, so the pack sets
`lookup.untaggedTerms` to `"pass"` (docs/languages.md 4.4). The rules keep
their conditions (`v`, `n`, `adj`, `fw` and the intermediate states below),
which bound their chains.

What the rules read:

- the initial mutations: lenition (`chenn` → cenn, `ḟer` → fer), nasalisation
  (`n-ech`, `nech` → ech, `mbó` → bó, `ṅdé` → dé) and h-prothesis (`hÉrinn`);
- the verbal complex: conjunct particles (`ní·`, `ro·`, `no·`, `nícon·`, …),
  infixed pronouns (`nom·`, `dom·`, `atom·`, …), mutations after the dot
  (`nom·charat`, `nod·n-ail`, `fod·era`), and compound verbs, whose headword is
  written without the dot (`do·berat` → dobeir);
- conjunct and absolute verb endings of the weak, strong and hiatus verbs and
  the deponents, with the palatal stem of the third singular (`·berat` →
  ·beir → beirid);
- the copula and the substantive verb (`níptar`, `bus` → is; `ní·fil`, `bái`
  → attá);
- noun and adjective endings with their palatal and u-infected stems (`fir`,
  `fiur` → fer), syncope (`bríathraib` → bríathar), the n-, dental and
  guttural stems, and a list of irregular nouns (`mná` → ben, `Dé` → día,
  `maigi` → mag);
- the conjugated prepositions (`lim`, `leis` → la, `ūad` → ó, `chucu` → co)
  and function words in spellings the dictionary does not list (Middle Irish
  `nocho` → nícon and `cena` → cene, `ossé` → os);
- comparison, emphasising suffixes (`labrad-sa`), and spelling variants (`cend`
  → cenn, `caraith` → caraid, `gabaal` → gabál, `ā` for á, `liaig` for
  líaig).

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
- `tests/cases.tsv`: written for this pack (GPL-3.0-or-later). Its rows are
  single word forms and short phrases: forms of the regular paradigms
  (Thurneysen, Stifter), forms checked against Wiktionary's inflection tables
  (kaikki.org, above), and words of the Táin and the Würzburg glosses (below)
  whose lookups the measurements showed to need a test. No sentence, gloss or
  dictionary entry is copied.
- `tests/text.tsv`, `tests/lookup.tsv`, `tests/dictionary/`,
  `sources/real-use.tsv` and the rest of `language.json`: written for this
  pack (GPL-3.0-or-later). `sources/benchmark-words.txt`: 80 short excerpts of
  *Táin Bó Cúailnge* (below, public domain). `sources/judged-tain.tsv`: the
  verdicts written for this pack, with the Táin word and up to 70 characters
  of its text.
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

`transforms.json` has 78 transforms and 1,277 rules: 1,217 `own`, 13 `both`
and 47 `yomitan`. `sources/build-final.mjs` writes it from the union of
`sources/own.json` (67 transforms, 1,230 rules) and `sources/yomitan.json` (15
transforms, 70 rules), and `sources/yomitan-provenance.tsv` lists what became
of each of Yomitan's 70 rules:

- **Repeated by an own rule (17 rules, kept as 13 own rules marked `both`)**:
  Yomitan's word-initial lenition (`ch`, `th`, `ph`), nasalisation (`ng`, `mb`,
  `nd`, `n-`), h-prothesis (`ha` … `hu`, `h-`) and the doubled initial `rr`,
  `ll`, `nn`, `mm` make the same deinflection as an own mutation rule.
- **Kept (47 rules)**: the doubled initials (`[IM] geminated`, 18: `cc`, `tt`,
  `c-c`, …), doubled vowels (5) and consonants (11), `nd for nn`, `cg for c`,
  `td for t`, `pb for p`, the Middle Irish lenition `gh`, `bh`, `dh` at the
  start and inside a word (3 and 3), the nasalisation `m-` and the Middle
  Irish `gc`, `bp`. Yomitan gives its replace rules no conditions; the final set gives
  them the own spelling rules' conditions (in: the headword forms `n_dict`,
  `adj_dict`, `v_dict`; out: `spelt`, which no rule takes), so a variant is
  made once, of the text or of a form an ending rule reached. With empty
  conditions they applied to each other's output: the union's lookups then
  ran out of memory on some texts of the Würzburg glosses (`ulimit -v` 8 GB),
  and a word with three spelling sites had hundreds of deinflections.
- **Left out (6 rules)**. The numbers are of the union with and without them
  (`sources/measure.py perrule`, `text` and `judge`; Measurements 1 and 4):
  - `lenited` (`ch`, `th`, `ph` → `c`, `t`, `p` anywhere but at the start).
    On the sample it recovers no row and adds 37 false candidates; on
    `cases.tsv` it recovers no row (the own `lenitionInCompound` reads the
    compounds: `focheird`, `dochuirethar`, `dothǽt`), adds 6 false candidates
    and breaks 3 negatives (`dochí` → docí, `focheird in` → foceird in,
    `in·samlathar` → samlaid). On the Táin, 111 first results of the union
    come through it (85 readings, all judged by hand): 10 lookups right
    (`cairpthib` → carpat, `adchī` → adcí, `brisfithir` → brisid), 82 wrong
    (`ndechaid` → doéccai, `Rōich` → roicc for the name Róech, `cōich` →
    cóic, `brath` → brat, `uilche` → olc for ulcha "beard") and 19 unsure.
    On the gold tokens (Measurements 4), 12 first results of the union come
    through it: 2 right, 10 wrong.
  - `ǽ/æ for é` (2 rules). On the sample it recovers no row and adds 2 false
    candidates; it breaks 3 negatives of `cases.tsv` (`ǣs` → és, `gǣ` → gé,
    `tǽt` → tétt). On the Táin, 41 first results of the union come through
    it; without it the first result is the dictionary's áes for `ǣs` and
    `ǽs` (10 lookups, where the union showed és) and gae for `gǣ`, `gæ`,
    `ṅgæ` (6, where it showed guidid), and nothing for the name `Lǽg` (7,
    légaid), while én for `ǣn`, fér for `fǣr` and nél for `nǣl` are lost
    (3). On the gold tokens, 14 first results of the union come through it,
    3 right and 11 wrong; without it 1 is right, 9 wrong and 4 have nothing.
  - `[IM] nasalized (Middle Irish)` `dt` → `d`: eclipsed t is t (`dtech` is
    tech, not wty-sga-en's dech "best"). It breaks that negative in
    `cases.tsv` and `lookup.tsv`, and no Táin or gold word is read through
    it.

  The union also breaks 2 negatives through Yomitan rules the final set keeps
  as own rules with stem constraints: `[IM] nasalized` `nd` → d and
  `[IM] lenited` `th` → t on a bare initial (`nd`, `th`).
- **Own rules**: written before Yomitan's file was read (commit "sga: own
  rules": 54 transforms, 1,043 rules, with the conditions `v_dict`, `n_dict`,
  `adj_dict`, `v_conj`, `v_conj3`, `nom_pal` and `nom_uinf`). The later
  commits changed them after measuring on the design half of Wiktionary's
  tables and on the texts above:
  - "sga: final rule set, corpus and tests" (62 transforms, 976 rules): the
    palatal stem as a step of its own (`conj-palatal`, `abs-palatal`, with
    the states `v_conj3u` and `v_absu`) instead of a copy of every ending
    rule (`conj-pres` went from 67 to 23 rules); `conj-1sg`, `conj-spelling`,
    `syncope` (108 rules), `emphaticAlone`; `mn-stem` and `aid-stem` split
    out of the n- and guttural stems; the forms of `cara`, `fili` and `tene`
    (14 rules) in `irregularNoun`; minimum and consonant-final stems for the
    noun endings (`naib` is not `na` + `-ib`); `ṅ`/`ṁ` for the nasal; the
    condition `spelt` for spelling variants;
  - "sga: untaggedTerms pass, …" (64 transforms, 1,075 rules):
    `lenitionInCompound` (90 rules) and `tet` (the forms of téit compounds,
    `dothéit`, `dothǽt` → dotét), `ṅ`/`ṁb` after the dot, `níth` (thou art
    not); the S-class conjunct endings and syncope no longer require a
    consonant-final stem (on Wiktionary's example sentences, dotted forms,
    13 of 16 changed first results right: `do·ṅgníat`, `ad·ciam`,
    `aras·celatais`; `ro·cloammar` → cloid, `ara·mbiat` → mbid and
    `im·biat` → imbe wrong), the passive keeps it (`in·samlathar` is not
    samlaid); redundant `stemEndsWith` constraints removed;
  - "sga: fixes from the first audit" (67 transforms, 1,230 rules):
    `prepositionalPronoun` (146 rules), `functionWord` and `unmarkedLength`,
    with the condition `fw` (a dictionary form that takes no further rule);
    `bus` (copula) and `bái`, `·bái` (substantive verb); a consonant-final
    stem for `pres-1sg`, `pres-3pl` and the comparative (`dōit` is not a verb
    in -id); the palatal route of the noun endings only after endings in e or
    i; `gilla` is not a plural of gell, `con` not a form of cú; `mag` ←
    maigi and `dead` ← díaid in `irregularNoun`; the -th spelling of -d only
    after a second syllable. That last rule is the pack's one `pattern` rule
    (anchored on `th`): as a suffix rule it read `tūaith` as túaid and
    `sceith` as sceid, turning 7 right first results of the Táin wrong, and no
    other rule type can ask for a second syllable.

## Measurements

All numbers with wty-sga-en as published, imported by `hoshidicts-cli
import`, measured on this branch rebased on main 5ac86a3 (GCC 14.3, Release),
unless a line says otherwise. The pack has no optional processor or
transform, so every file gives the same numbers with every option on and with
the defaults (`sources/measure.py eval` runs both; all 16 pairs below are
equal).

1. **`eval-language --dictionary`** (`sources/measure.py eval`). The sample is
   the 1,500 rows of `corpus.tsv` and `gaps.tsv`; recall over it is the final
   recall. `cases.tsv` has 213 positive rows and 169 negatives. Yomitan's
   rules give no conditions, so their run uses a copy of each file with `*`
   in the rule column, and both `untaggedTerms` values give the same numbers.
   `untaggedTerms` `"filter"` is Yomitan's behaviour with this dictionary:
   every rule output that has a condition finds nothing.

   | Rule set | untaggedTerms | Sample recall | False cand. | First rank | cases.tsv recall | cases.tsv negatives | cases.tsv false cand. | cases.tsv first rank |
   | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
   | Own | pass | 52.00% | 0.374 | 62.47% | 94.37% | 100% | 0.695 | 84.51% |
   | Yomitan | (no conditions) | 10.80% | 0.161 | 54.20% | 6.10% | 95.86% | 0.296 | 39.91% |
   | Union | pass | 52.67% | 0.439 | 62.60% | 100% | 94.67% | 0.817 | 89.67% |
   | **Final** | **pass** | **52.60%** | 0.413 | 62.47% | 100% | 100% | 0.793 | 89.67% |
   | Own | filter | 52.00% | 0.131 | 54.13% | 94.37% | 100% | 0.268 | 34.74% |
   | Union | filter | 52.67% | 0.162 | 54.20% | 100% | 94.67% | 0.362 | 40.85% |
   | Final | filter | 52.60% | 0.133 | 54.13% | 100% | 100% | 0.272 | 37.09% |

   The sample's strata (reached / sampled): noun 285 / 450, adjective 153 /
   200, verb 112 / 450, mutation 225 / 250, UniMorph verb 14 / 150. The union
   breaks 9 of the 169 negatives (Rule provenance). `--per-rule` on the final
   set and the sample (`sources/measure.py perrule`): 164 rules recover a row
   no other rule reaches, no rule breaks a negative, and the transforms that
   add the most false candidates are `nasalization` (84; it recovers 95
   rows), `depalatalization` (60; 106), `doubled consonant` (51; 6, Yomitan's),
   `dat-pl` (47; 101), `lenition` (27; 58) and `spelling` (27; 6). They are
   kept: among the Táin lookups judged by hand (Measurements 4) whose trace
   has them, `nasalization` is right at 43 and wrong at none,
   `depalatalization` 148 and 15, `doubled consonant` 82 and 4, `lenition`
   199 and 2, `spelling` 29 and none; `dat-pl` is right at 3 and wrong at 4
   there, and recovers 101 sample rows.
2. **Frequent forms** (`sources/measure.py frequent`). With no frequency list
   for Old Irish, the list is the 2,187 Old Irish word forms of the Würzburg
   glosses ranked by their count (10,082 tokens), each with its most
   frequent gold lemma. A word counts when its gold lemma is a headword and
   a rule or a form-of row reaches it, or the word is its lemma. Looked up
   as a host does:

   | Rule set | Words counted (tokens) | Wrong lemma first: words (tokens) |
   | --- | ---: | ---: |
   | No rules | 783 (7,569) | 82 (380) |
   | Own | 951 (7,856) | 106 (394) |
   | Yomitan | 832 (7,625) | 93 (392) |
   | Union | 997 (7,909) | 117 (408) |
   | Final | 989 (7,899) | 111 (400, 5.1%) |

   The most frequent wrong first results are words the dictionary lists as
   written with another sense, which no rule changes: `as` (50 tokens; the
   glosses' copula, where the dictionary shows as "milk" first and the
   copula second), `sa` (49; the emphatic -sa, the dictionary's so), `ind`
   (23), `tre` (19), `dom` (16), `dún` (13; do "to us", the dictionary's dún
   "fort" first).
3. **After articles, particles and prepositions** (`sources/measure.py
   contexts`; the Würzburg glosses and UD, at the token after one, gold
   lemma a headword):

   | Rule set | After an article (242): right / wrong / none | After a particle (591) | After a preposition (691) |
   | --- | ---: | ---: | ---: |
   | No rules | 162 / 27 / 53 | 98 / 113 / 380 | 401 / 91 / 199 |
   | Own | 195 / 28 / 19 | 140 / 142 / 309 | 482 / 111 / 98 |
   | Yomitan | 180 / 30 / 32 | 104 / 138 / 349 | 438 / 110 / 143 |
   | Union | 199 / 28 / 15 | 143 / 148 / 300 | 490 / 127 / 74 |
   | Final | 199 / 28 / 15 | 142 / 144 / 305 | 491 / 127 / 73 |

   The glosses' tokens split a verbal complex at the dot (`ní` + `carat`), so
   the forms after a particle are conjunct forms without their particle, which
   the dictionary lists less often than as complexes.
4. **Real text** (`sources/measure.py text`, `judge` and `tally`).
   - **Gold lemmas**: every Old Irish token of the Würzburg glosses and the
     two UD treebanks (10,910 tokens; for 9,920 the gold lemma is a
     headword), looked up from the token to the end of its gloss. First
     result right / wrong / nothing: no rules 3,356 / 1,006 / 5,558 (33.83%
     right); own 3,812 / 1,058 / 5,050 (38.43%); Yomitan 3,501 / 1,078 /
     5,341 (35.29%); union 3,850 / 1,092 / 4,978 (38.81%); **final 3,849 /
     1,082 / 4,989 (38.80%)**; final with `untaggedTerms` `"filter"` 3,521 /
     1,059 / 5,340 (35.49%). A first result counts as right when it equals
     the gold lemma without marks, dots and hyphens; the gold follows
     Kavanagh's and Bauer's lexicons, so some differences are names only (the
     glosses' `so` for the dictionary's -su, `tre` for tri). 209 of the final
     set's wrong first results come through a rule, most through
     `depalatalization` (31), `nasalization` (27), `nom-pl` (20), `copula`
     (18; `at` → is where the gloss splits `at·chiam`) and `emphaticAlone`
     (16; `su`, `sse`, `ssa` written apart).
   - ***Táin Bó Cúailnge***: 33,061 lookups, one per word, each first result
     classed against the first result of the dictionary alone (no rules).
     Final set: nothing 11,368 (no rules: 14,443); the dictionary's own
     reading (the text as written or a form-of row of it) 15,731; a rule's
     reading the dictionary alone also puts first 2,488; a rule's reading
     where the dictionary alone has nothing 3,075; a rule's reading in place
     of the dictionary's own first result 399. These two last classes were
     judged by hand, in `sources/judged-tain.tsv`, from the word and its
     context:
     - in place of the dictionary's first result: all 399 lookups (74
       readings). The rules' reading is right at 340, wrong at 25 and unsure
       at 34. Where the dictionary's own first result is wrong (314 lookups),
       the rules' is right at 312 (`ba` → is for fa "or", `Atā` → attá for
       the copula, `bāi` → attá for bó, `lim` → la). Where it is right (48),
       the rules keep a right reading at 26 and show a wrong one at 22
       (Known gaps);
     - where the dictionary alone has nothing: the 70 most frequent
       readings, 905 lookups (right 847, wrong 25, unsure 33), and a sample
       of 100 of the other 2,170 lookups (seed 20261103, by position; right
       59, wrong 14, unsure 27).

     That makes about 350 lookups (1.1%) with a wrong first result through a
     rule: 25 + 25 + 14% of 2,170, the sample's 95% interval giving 185 to
     480 for the last part, and up to about 650 more (2.0%) if every unsure
     one is wrong. The wrong ones are names read as words (`Fīacha` → fíach,
     `Mand` → mann, `Serthe` → sirid), homographs (`gairit` "short" →
     gairid, `luigi` "oath" → lugae, `formna` "shoulder" → for), and the
     replacements of Known gaps. The rules behind the 3,474 rule readings of
     the two judged classes, by the first deinflection step: `nom-pl` 543,
     `depalatalization` 506, `doubled consonant` 287, `substantive` 208,
     `copula` 178, `nasalizationNoHyphen` 173, `lenition` 173,
     `prepositionalPronoun` 151, `spelling` 145, `nasalization` 138.
   - **Real use** (`sources/real-use.tsv`, sentences written for the pack,
     looked up with `sources/lookup-batch.cpp`): 29 of the 30 words show the
     expected headword first, with the traces of the rules (`Ní·carat` →
     caraid [conjunct particle, present, absolute], `Do·berat` → dobeir
     [present, palatal stem, compound verb], `bríathra-sa` → bríathar
     [emphasising suffix, syncope]). `maccu` shows the dictionary's own
     `maccu` ("descendants of") before macc.
5. **Performance**.
   - Native `benchmark-lookup --languages <copy> --language sga` with
     wty-sga-en mapped, the 80 texts of `sources/benchmark-words.txt`, 6
     passes with the first dropped, three runs at machine load 57-60. The
     budget is 1 ms p50.

     | Rule set | p50 | p95 |
     | --- | ---: | ---: |
     | Final | 53-56 µs | 104-112 µs |
     | Union | 71-77 µs | 173-185 µs |
     | Own | 44-45 µs | 90-91 µs |
     | Yomitan's rules | 26-28 µs | 55-58 µs |

     The one `pattern` rule, in five runs of the final set with and without
     it: p50 51.6-53.3 µs and 51.0-52.8 µs, p95 101.8-105.2 µs and
     95.7-99.9 µs.
   - WebAssembly (Node 22.23.1, machine load 46): Hachidori
     feat/multi-language a2086ec2 with its three runtimes rebuilt by
     `wasm/build.sh` on this branch (the shipped ones predate
     `untaggedTerms`; Known gaps) and this pack copied by
     `scripts/sync-languages.mjs`. `sources/wasm-load.mjs`, median over 10
     fresh engines: `hdw_language_load` 6.6 ms single-thread and 7.0 ms
     threaded; live heap +661,032 and +660,168 bytes (`hdw_memory_stats`).
     The budgets are 50 ms and 20 MB. Hachidori's
     `benchmark/node-lookup.mjs` with `HACHIDORI_LOOKUP_LANGUAGE=sga` on the
     26 sentences of `sources/real-use.tsv` (140 hover positions, 6 passes):
     `hdw_lookup` p50 112 µs and p95 233 µs single-thread, p50 121 µs and p95
     253 µs threaded.
   - Hachidori in Chrome (`test/chrome-language-pack.mjs` with the same
     build, Chrome 152, wty-sga-en, the 30 cases of `sources/real-use.tsv`):
     33 checks pass and 1 fails, `maccu` (Measurements 4). Settings adds
     Old Irish beside Japanese and imports the dictionary (19,891 terms,
     0.5 s), 29 hovered words show their headword first, the Anki note's
     first field is `caraid`, and the toolbar switches to Japanese and back.
6. **Commands and scripts**: `sources/measure.py` (`scratch`, `eval`,
   `text`, `perrule`, `frequent`, `contexts`, `judge`, `tally`; its
   docstring gives the order), `sources/mutate.py` (the mutation check of
   section 14 step 7), `sources/lookup-batch.cpp`, `sources/build-own.mjs`,
   `sources/build-final.mjs`, `sources/build-corpus.mjs` and
   `sources/wasm-load.mjs`; the hand judgments are `sources/judged-tain.tsv`
   (`judge` lists the readings, `tally` counts the verdicts). Conformance:
   corpus.tsv 789 / 789, cases.tsv 382 / 382, text.tsv 24 / 24, lookup.tsv
   53 / 53; gaps.tsv 0 / 711 (reported). `tools/check-yomitan.mjs`: 2,296
   inputs, 3,685 Yomitan results, one listed difference (a text that starts
   with a tripled letter, `oook`), and the three processors agree on 1,935
   to 2,721 inputs. `sources/mutate.py`: 240 mutations of stem constraints,
   transforms and settings; 231 fail a test, and the 9 that do not are
   listed under Known gaps.

## Known gaps

- **Verbs.** The rules reach 112 of the 450 sampled verb forms of Wiktionary
  and 14 of the 150 of UniMorph (most of `gaps.tsv`). Old Irish verbs change
  their stem from tense to tense: reduplicated and suffixless preterites
  (`·cechain`), perfects with ro- (`ro·uccus`), s- and reduplicated futures
  and subjunctives (`·gigius`, `·tías`), suppletion (`luid`, `lotar` for téit,
  but these the dictionary lists), prototonic compounds (`·tabair`, `·epir`)
  and the passive preterite participles. The rules read endings, mutations
  and the verbal complex; the dictionary's form-of rows list many of the stem
  forms.
- **Nouns, adjectives and mutations.** 165 of 450 noun, 47 of 200 adjective
  and 25 of 250 mutation forms are not reached: vowel alternations of the
  stem (`lia`, `lïac`), irregular and consonant stems outside the list
  (`athair`, `bráthair` have a rule; others do not), and spelling of the
  tables (`*bindem`).
- **Wrong first results on the Táin** (Measurements 4), about 350 lookups:
  - where the dictionary alone has nothing: `Fīacha` → fíach (12, the name
    Fíacha), `leigi` → líach (7, léici of léicid), `anair` → anaid (6, anair
    "from the east"; the passive rule that reads it also reads `agair` →
    aigid in `corpus.tsv`), and about 14% of the rarer readings;
  - in place of a right first result of the dictionary, 22 lookups. 9 are
    ties between two terms the dictionary names (below): `claidib` → claide
    for claideb (4), `broit` → brot for brat (2), `gin` → gen for giun,
    `hūa` → úa for ó, `lugu` → lugae for bec. The other 13 come first because
    the dictionary's reading needs one more text processor step (case,
    marks), and processor steps rank before trace length (docs/languages.md
    9.6): `cāine`, `cāinem` → cáin for caín (4), `Cēin`, `Cēine` → Cían for
    céin (4), `ánd` → aigid for and (2), `cōicait` → cóiced, `sāiri` → sár,
    `Ēirgid` → atreig.
- **Discovery-order ties (framework).** At 221 Táin lookups (31 readings) a
  form-of row of the text names the rules' first result as well as the
  dictionary's own, so both terms are confirmed by the dictionary and their
  order is the order the lookup finds them. Ordering such ties is the lead's
  framework change (`lookup.confirmedOrder: "references"`, hachi-lang-engine-l),
  not on main when this was measured; the pack does not set it. Judged by
  hand, the rules' first result is right at 192 of these lookups and wrong
  at 10; the dictionary's own first result is right at 9 and wrong at 190
  (`ba` → fa 108, `lim` → lem 26, `aili` → ail 11). The field will be set
  only if a measurement shows it helps.
- **Function words as written.** `as`, `sa`, `ind`, `tre`, `dom`, `dún` and
  `inna` show the dictionary's entry for the written form first
  (Measurements 2); no rule changes a word the dictionary lists.
- **Yomitan's rules left out** (Rule provenance): the right readings
  `lenited` gave on the Táin are lost (10 lookups: `cairpthib` 2,
  `Gaisched`, `cōectha`, `agathar`, `nīchon`, `tara chend`, `adchī`,
  `thothim`, `brisfithir`), and so are those of `ǽ/æ for é` (`ǣn` → én,
  `fǣr` → fér, `nǣl` → nél on the Táin; `pæna` → pén, `ætach` → étach,
  `sǽt` → sét in the glosses).
- **The dictionary.** The preposition i is keyed `i/languages M to Z`. Some
  form-of rows name a row that is itself only references (`fo·daimid` →
  fodaimid → fo·daim, `ad·cigestar` → adcigestar → ad·cí), which one hop
  (docs/languages.md 16) does not follow.
- **Mutation check survivors** (`sources/mutate.py`). For each, the words of
  the Táin, the glosses, the treebanks and Wiktionary's tables were
  deinflected with and without the constraint:
  - `notAtStart` on Yomitan's doubled vowel rules: without it, nine words
    get a reading at their start, none judged wrong (`ii` → í, `hée` → é,
    `eigis` → éigid; `níi` and `aa` unsure). The constraint is Yomitan's and
    is kept as Yomitan wrote it.
  - `notAtStart` on Yomitan's Middle Irish lenition rules, `stemMinLength`
    of the dotted conjunct rules `conj-pres`, `conj-1sg`, `conj-pret3sg`,
    `conj-palatal`, `abs-palatal` and `emphatic`, and `conj-1sg`'s
    `stemEndsWith`: no word gives a different deinflection, and no
    constructed text was found.
- **Hachidori.** Hachidori's shipped runtimes predate `untaggedTerms` and
  refuse the pack ("lookup.untaggedTerms: unknown key"); shipping the pack
  needs the submodule bump to a hoshidicts main with #58 and the runtime
  rebuild.
- **Not pinned by a test**: `traceSelection: "shortest"`, which no lookup row
  can observe.
