# Assyrian Neo-Aramaic (`aii`)

Assyrian Neo-Aramaic (Sureth, ܣܘܪܝܬ) deinflection rules, text processors and
scanning settings for hoshidicts, following
[`docs/languages.md`](../../docs/languages.md). Yomitan has no deinflection
rules for the language (d3c54c1 has only a diacritics preprocessor in
`ext/js/language/aii/`), so every rule here was written for this pack; the
one Yomitan processor is ported.

The rules work on the consonantal skeleton. Wiktionary, and so the
recommended dictionary, writes every lemma headword without vowel points
(ܟܬܒܐ, ܦܬܚ), and much modern text is written without them. The
preprocessors remove the points, and the rules then map the unpointed form
to the unpointed lemma; a pointed word that the dictionary lists as an
inflected form (its form-of rows, such as ܦܬ݂ܝܼܚ ܠܝܼ → ܦܬܚ) is found as
written.

## Sources and licences

- `sources/own.json` and every rule (`"source": "own"`): written for this
  pack (GPL-3.0-or-later) from the grammar of the standard, Urmian-based
  literary language: Wiktionary's conjugation and declension templates
  (Template:aii-conj, aii-infl-noun, aii-infl-prep) and the descriptions of
  Tsereteli (1978), Odisho (1988) and Khan (2016, *The Neo-Aramaic Dialect
  of the Assyrian Christians of Urmi*). `sources/own-rules.mjs` generates it
  (`node languages/aii/sources/own-rules.mjs`); `transforms.json` is
  `node tools/merge-transforms.mjs aii --force` on it. The first version is
  commit 208a4b8 ("aii: own rules"); Rule provenance lists the revisions.
- The `removeSyriacScriptDiacritics` processor: ported from
  [Yomitan](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/aii/assyrian-neo-aramaic-text-preprocessors.js)
  at d3c54c1, GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan Authors
  (commit fcf428d). Yomitan has no `aii` transforms
  (`tools/port-yomitan-transforms.mjs`: "Yomitan has no
  ext/js/language/aii/*-transforms.js") and no transform tests
  (`tools/port-yomitan-tests.mjs`), so there is no `sources/yomitan.json`
  and no `tests/yomitan.tsv`.
- `tests/corpus.tsv` (1,642 rows) and `tests/gaps.tsv` (35 rows): a seed-1
  sample of 1,677 inflected form → lemma pairs from English Wiktionary's
  Assyrian Neo-Aramaic tables, by the Wiktionary contributors, CC BY-SA 4.0
  and GFDL, read through two extracts:
  - the form-of rows of wty-aii-en 2026.10.22 (below): possessed forms,
    plural and construct states, past, imperative, gerund, verbal noun,
    passive participles, adjective agreement, prepositions with suffixes;
  - kaikki.org's Assyrian Neo-Aramaic extract of English Wiktionary
    (`kaikki.org-dictionary-AssyrianNeoAramaic.jsonl`, dump 2026-10-01,
    47,244,729 bytes, sha256
    `5f35e0fe569b352291a4f9f58685916edbbfabdbafc503125540a09ddb7d09ed`): the
    active non-past and passive past forms of the conjugation tables, which
    wty-aii-en leaves out.

  `sources/build-corpus.py` draws them (per-category sizes in its `SAMPLE`
  table); `corpus.tsv` has 1,005 verb, 522 noun, 78 adjective and 37
  preposition rows. A
  lemma must be a headword of wty-aii-en with definitions; spelling
  variants, agent and instance nouns, and lemmas of several words (whose
  rows are the forms of their first word) are left out. The sources are
  pointed as Wiktionary writes them. Both files start with
  `# options: default`, so they are read with the pack's defaults; the rows
  the final rules do not reach with the defaults are in `gaps.tsv`. The
  script also writes the other 89,080 pool rows (the "dev pool", not
  committed).
- `tests/cases.tsv`, `tests/defaults.tsv`, `tests/text.tsv`,
  `tests/lookup.tsv`, `tests/dictionary/`, `sources/sentences.tsv` and
  `sources/benchmark-texts.txt`: written for this pack (GPL-3.0-or-later).
  The spellings of `cases.tsv` were checked against wty-aii-en's form-of
  rows and kaikki.org's tables; its constructed negatives at the end pin
  the stem constraints (Measurements, mutations).
- `sources/build-corpus.py`, `measure.py`, `measure-examples.py`,
  `measure-urmia.py`, `eval-table.py`, `mutations.py`, `tag-dictionary.py`,
  `lookup-batch.cpp`, `load-bench.cpp` and `wasm-load.mjs`: the
  measurements below, written for this pack.
- `host.recommendedDictionaries`: wty-aii-en from
  [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan)
  (wty), the only Yomitan-format Assyrian Neo-Aramaic dictionary there is
  (wty publishes no aii-aii or other aii pair).
- Measured with, not committed:
  - **wty-aii-en**, index revision 2026.10.22 (wty commit 61eaa08),
    1,725,959 bytes, sha256
    `3690c9374fabc3c5b008718cc11750cf04cfb9019ed2d13c9c025e477f519ca8`,
    from the index's `downloadUrl`
    (`https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/aii/en/wty-aii-en.zip`):
    82,731 terms, 6,842 with definitions and 75,889 whose definitions are
    only form-of references; imported by `hoshidicts-cli import` in 0.32 s.
    Wiktionary content, CC BY-SA 4.0; the converter is MIT. **Its `rules`
    (part-of-speech) column is empty on all 82,731 rows**: wty writes it only
    for the languages Yomitan has transforms for. Every number below is given
    for it as published.
  - **wty-aii-en (tagged)**, labelled so everywhere: a copy written by
    `sources/tag-dictionary.py` with `v n adj prep` in the `rules` column of
    every row (sha256 `a235f5b7…35fa`). Those four conditions cover every
    condition the rules give, so every deinflection passes the
    part-of-speech filter for every term: this is what
    `lookup.untaggedTerms: "pass"` (bee-san/hoshidicts#58, not on main yet)
    does with the published dictionary. The numbers with it show what users
    get once the pack sets that field.
  - The **Urmia Bible of 1893** in Unicode:
    [abrahameishow/assyrian-bible-api](https://github.com/abrahameishow/assyrian-bible-api)
    at b43160b (`books/*/<book>/<chapter>.json`); the text is public domain,
    the digital edition MIT-licensed. Genesis, Exodus, Ruth, Jonah, Malachi
    and parts of Psalms, Matthew, Philemon and Jude: 45,406 words, 10,410
    word types.
  - The usage examples of kaikki.org's extract above: 3,379 examples whose
    entry word is marked in bold, giving 3,217 hovers with a known lemma.
  - Tatoeba's Assyrian Neo-Aramaic sentences
    (`aii_sentences.tsv.bz2`, sha256 `147c248c…9c08`, CC BY 2.0 FR): only
    22 sentences, so not used for measurements.
  - For the Chrome screenshot only, Noto Sans Syriac and Noto Sans Syriac
    Eastern (google/fonts, OFL-1.1), given to that Chrome through a private
    `FONTCONFIG_FILE`: the test host has no Syriac font.

## Text and scanning

- Scanning follows the contract's starting point for aii (section 14.1):
  `scanStart` `word`, `searchResolution` `word`, `segmentation` `spaces`,
  `direction` `rtl`, `joinedScript` true. Words are Syriac letters (U+0710,
  U+0712-U+072F, U+074D-U+074F), combining marks, digits and the joiners
  (ZWNJ, ZWJ, tatweel, soft hyphen, word joiner); everything else separates
  words. Sentences end at `. ! ? ؟` and the Syriac full stops U+0700-U+0702;
  the Syriac colons and the Arabic comma are clause breaks.
- Preprocessors, in order:
  - `normalizeSyriac` (own, `keepInput: false`): NFC, which puts the marks
    of a letter in canonical order (rukkakha before zqapha), then removes
    the joiners and the superscript alaph (U+0711);
  - `removeSyriacScriptDiacritics` (Yomitan's): removes the vowel points,
    the Syriac and combining marks (seyame, rukkakha, qushshaya, talqana,
    the tilde and breve of ܓ̰ ܟ̰ ܦ̮), keeping the input.
  `tests/text.tsv` checks each.
- One pack setting, `olderSpellings` (boolean, off by default, group
  `lookup`), turns on the optional transforms `lJoined` and
  `pastBaseUrmia`: the L-suffix joined to the verb, as the Urmia Bible and
  some informal writing spell it (ܦܪܸܫܠܹܐ, he separated), and the Urmia
  Stem II past without ܡ (ܬܘܼܪܸܨܠܹܐ, he made). Off by default because many
  nouns end in the same letters (ܚܲܝܠܵܐ, strength, is not *ܚܝܐ* + ܠܐ).
- `presentation.typography.fontFamily` names Noto Sans Syriac Eastern, East
  Syriac Adiabene and Noto Sans Syriac, the East Syriac fonts the language
  is written in.

## Rule provenance

All 62 transforms and 1,350 rules are `own` (no `yomitan` or `both`
rules: Yomitan has none for the language). By type: 737 `suffix`, 538
`wholeWord`, 37 `pattern`, 29 `prefix`, 9 `circumfix` (cross products; the
pack loads them as 1,632 rules). Two transforms are optional (`lJoined`,
`pastBaseUrmia`).

- **Conditions.** `v` (with `v_l`, a verb without its L-suffix; `v_s`, a
  verb stem without its subject ending; `v_f`, a verb in its dictionary
  form), `n` (with `n_p`, without its possessive suffix; `n_f`), `adj`,
  `prep`. They keep the chains to the ones the grammar has: proclitics
  first, then an L-suffix, then one subject ending or one noun ending, then
  one stem alternation. wty-aii-en's empty `rules` column means a form with
  conditions finds no term of it today (section 7.2); hachi-lang-lead's
  answer (reports/hachi-lang-questions.md, 2026-11-03) keeps the conditions
  and adds `lookup.untaggedTerms: "pass"` to the engine (#58). The pack sets
  it once #58 is on main; Known gaps gives the cost until then.
- **Proclitics** (prefix rules on the text as written, so a pointed word
  after them can meet its form-of row): ܘ- (and), ܕ- (of, that), ܒ- (in),
  ܠ- (to), and ܟ- / ܒܕ- of the indicative and the future joined to a verb.
  The word left must start with a letter (not the proclitic's vowel) and
  keep two letters.
- **Verbs.** The L-suffixes as separate words (ܦܬ݂ܝܼܚ ܠܹܗ, he opened;
  ܦܵܬ݂ܚܵܐ ܠܹܗ, she opens it), the Stem I past in one step (`past1s` …
  `past3p`: past base and L-suffix, strong and hollow), the non-past
  subject endings (`3fs` … `1p`, also the passive past on the past base),
  with the ܐ → ܝ of verbs in -ē as patterns limited to verb-shaped stems
  (two letters, or ܡ and two to four), pointed patterns for the Stem I and
  hollow non-past (C ā C C + ending, read without removing the points), the
  past bases (Stem I ܝ before the last radical; hollow ܝ for ܐ; Stems II,
  III and quadriliterals ܘ after ܡ or after the first radical; ܡܬ- verbs ܘ
  before the last radical), passive participles, imperatives (Stem I and
  hollow; Stem III ܐ- as patterns; Stem II without ܡ, after the noun
  rules), infinitives and verbal nouns of Stems II and III, the gerund (ܒ +
  infinitive, patterns of a root's length), the past particle ܗ݇ܘܵܐ
  (habitual past and pluperfect), the copula (ܝܼܘܸܢ … ܝܼܢܵܐ) and the
  irregular ܝܵܗ݇ܒ݂ܹܠ, ܐܵܙܹܠ, ܐܵܬ݂ܹܐ, ܗܵܘܹܐ.
- **Nouns and adjectives.** The possessive suffixes (on singulars and
  plurals, and on consonant-final nouns), the plurals in -ānē, -wāṯā,
  -āṯā, -yāṯā and the absolute -īn, the feminine in -tā and -ānīṯā, the
  construct state, and 175 written-out forms of nouns with plural or
  possessive stems of their own (ܒܵܬܹ̈ܐ, ܒ̈ܢܵܬ݂ܵܐ, ܢܸܫܹ̈ܐ, ܐܸܒ̈ܢܹܐ, ܒܲܪ,
  ܐܲܒ݂ܘܼܢ, ܫܸܢܹ̈ܐ …). **Prepositions** with pronoun suffixes (303
  written-out forms of 37 prepositions, ܐܝܼܬ݂ ܒ-, ܠܲܝܬ ܒ-).
- **Revisions after the "own rules" commit**, each measured on the dev pool
  and the 3,217 example hovers (Measurements):
  - the Stem III imperative pattern takes a stem of two to four letters,
    lazily (ܐܲܡܪܸܥܝ); the Stem II imperative (ܡ added) became its own
    transform after the noun rules, because on a tie the reading found first
    comes first (section 9.6) and it read nouns as verbs (ܚܲܒ݂ܪܝܼ, my
    friend, as ܡܚܒܪ): with the -ānīṯā rule below, added at the same time,
    unpointed first results +0.4 points on the dev pool;
  - the -ē endings and the -ē participle limited to verb-shaped stems
    (ܐܵܬ݂ܘܿܪܵܝܵܐ, Assyrian, no longer gives ܐܬܘܪܐ, Assyria): false
    candidates 0.394 → 0.376 per dev row;
  - the feminine -ānīṯā (ܡܲܪܝܡܵܢܝܼܬ݂ܵܐ), verbal nouns of Stem II
    (ܦܘܼܚܵܠܵܐ) and of verbs in -ē (ܒܘܼܢܵܝܵܐ), the pluperfect with the
    L-suffix kept (ܦܬ݂ܝܼܚ ܗ݇ܘܵܐ ܠܹܗ), the Urmia ܠܘܿܢ (they), the Urmia Stem
    II past as one optional rule (so ܛܘܼܪܵܐ, mountain, is never ܡܛܪܐ, rain),
    the gerund limited to a root's length (ܒܡܲܕܢܚܵܐ, in the east, is not
    the gerund of ܡܕܢܚ);
  - `k-` no longer requires a letter after ܟܐ (the vowel there is the
    verb's) and the consonant-final possessive and plural take a stem in ܐ
    (ܦܪܸܙܠܵܐܗܘܿܢ); dev recall 96.88% → 97.02%.
- **Tried and rejected**, measured with the tagged copy:
  - possessive transforms before the subject endings (so a noun reading
    wins ties): dev unpointed first results +1.0 point, example hovers −0.6
    (−20 of 3,217);
  - proclitic rules that remove the points from their output (so ܕܐܵܢܵܐ,
    that I, finds ܐܢܐ before ܕܐܢ): example hovers −7, dev pointed first
    results −0.16 points, Urmia wrong first results 194 → 236; pointed words
    that start with a consonant cluster (ܠܒܵܒ݂ܵܐ, heart) then read as a
    proclitic and a word (ܒܒܐ, father).
- No Yomitan rule exists, so none was left out.

## Measurements

`hoshidicts-cli` (Release, GCC 14.3) on `main` b145feb plus this pack. "Tagged
copy" is the labelled copy above, which stands for `untaggedTerms: "pass"`.
The pack's own rules are also the union and the final set.

1. **`eval-language --dictionary`** (`sources/eval-table.py`; "flipped" is
   the file with its options line removed, or added):

   | File | Options | Rows | Recall | Negatives | False candidates (published / tagged) | First rank (published / tagged) |
   | --- | --- | ---: | ---: | ---: | ---: | ---: |
   | sample (corpus.tsv + gaps.tsv) | defaults (as is) | 1,677 | **97.91%** | | 0.076 / 0.389 | 71.6% / 97.7% |
   | sample | every option (flipped) | 1,677 | 97.91% | | 0.076 / 0.418 | 71.6% / 97.4% |
   | cases.tsv | every option (as is) | 364 | 100% (224) | 100% (140) | 0.402 / 1.013 | 63.0% / 88.0% |
   | cases.tsv | defaults (flipped) | 364 | 95.5% | 100% | 0.402 / 0.955 | 63.0% / 84.8% |
   | defaults.tsv | defaults (as is) | 14 | 100% | 100% | 0 / 0.2 | 100% / 100% |
   | defaults.tsv | every option (flipped) | 14 | 100% | 33.3% | 0 / 0.4 | 100% / 100% |

   With the published dictionary the false candidates are few and the first
   rank low for one reason: a rule's output has conditions, so no term of
   the untagged dictionary matches it. The 71.6% are the rows whose pointed
   form has a form-of row. With the defaults, `cases.tsv` loses its ten rows
   of the optional joined spellings, and `defaults.tsv` keeps its joined
   negatives only with the defaults, as intended.

   The **dev pool** (89,080 rows, `sources/measure.py`): recall 97.02% with
   the defaults and with every option; 0.380 (defaults) and 0.405 (every
   option) deinflected texts per row that are headwords of wty-aii-en other
   than the source and the lemma, before any part-of-speech filter. A
   lookup of each source as a host makes it (`measure.py firstrank`):

   | Dev pool, first result is the lemma (lemma among the results) | Published | Tagged copy |
   | --- | ---: | ---: |
   | pointed, as Wiktionary writes the forms | 79.7% (80.8%) | 97.6% (99.97%) |
   | the same forms unpointed | 5.4% (5.4%) | 88.0% (97.0%) |

2. **Frequent forms.** There is no published frequency list for the
   language; the list is the Urmia Bible's own (10,410 word types by
   frequency, `sources/measure-urmia.py`). A word is judged when wty-aii-en
   has a form-of row for it as the edition writes it (its dot below and
   above compared with Wiktionary's rukkakha and qushshaya): 740 types,
   7,619 tokens (16.8% of the text). Looked up alone, the first entry with
   definitions is not one of the lemmas those rows name for:

   | | Published | Tagged copy |
   | --- | ---: | ---: |
   | judged types with a wrong first entry | 88 (350 tokens, 0.77% of the text) | 30 (154 tokens, 0.34%) |

   With the tagged copy, 140 of the 154 tokens are words that are headwords
   themselves, mostly numerals, whose own entry comes first (ܚܲܡܫܵܐ →
   ܚܡܫܐ, five, where the form-of row names ܚܡܫ), which is right; the rest are 3p readings of possessed nouns
   (ܓܲܒ̣ܪܝܼ → ܓܒܪ for ܓܒܪܐ, 3 tokens). With the published dictionary, 208
   tokens find no entry: their reading needs a rule. A looser judge
   (`--loose`: the form-of rows of every form with the word's letters)
   judges 2,479 types and marks many right readings wrong (ܐܸܠܹܗ, to him, →
   ܠ- against ܐܲܠܵܗ, God, 222 tokens), so it is not used.

3. **Behind the proclitics.** The 595 judged frequent forms that do not
   start with ܘ, ܕ, ܒ or ܠ, each written after one: the first entry with
   definitions is one of the form's own lemmas for

   | | ܘ- | ܕ- | ܒ- | ܠ- |
   | --- | ---: | ---: | ---: | ---: |
   | published | 89.1% | 87.6% | 88.7% | 88.9% |
   | tagged copy | 95.6% | 93.8% | 94.0% | 94.8% |

   Of the wrong ones with the tagged copy, 14-16 per proclitic are the
   numerals above; the others are 3p or gerund readings that tie with the
   noun (ܒܙܲܒ̣ܢܵܐ, in a time, → ܙܒܢ, the gerund of to buy). The particles
   before verbs (ܟܹܐ, ܒܸܬ, ܠܵܐ) are separate words: a hover on the verb
   starts after them.

4. **Real text.**
   - *The usage examples of English Wiktionary* (3,217 hovers: the example
     from the bold word to the end of its sentence; `measure-examples.py`),
     first result right, and lemma among the results:

     | | Published | Tagged copy |
     | --- | ---: | ---: |
     | pointed, as written | 71.9% (79.6%), no result 491 | **84.2%** (93.2%), no result 53 |
     | unpointed | 56.4% (57.0%), no result 1,154 | **87.2%** (92.6%), no result 60 |

     With the tagged copy, of the 454 pointed hovers with a wrong first
     result, 274 show a form-of row of the dictionary first (ܛܵܒ݂ܵܐ → ܛܒܬܐ, goodness, where
     the example's entry is ܛܒܐ, good: both are right analyses of the
     letters), 96 the word as written (an idiom or multiword entry such as
     ܐܝܼܕ݂ܘܼ̈ܟ݂ ܠܵܐ ܡܵܪܥܝܼܢ݇, or the copula before a gerund) and the rest are
     one-step rule readings, none over 14 (`3fs`: ܒܓ̰ܵܪܹܐ → ܒܓܪ). Of the
     351 unpointed ones, 177 are the word as written (an unpointed word is
     often several words) and no rule has more than 12.
   - *The Urmia Bible* (every one of the 45,406 words hovered with the
     rest of its sentence): with the tagged copy, 8,966 hovers find no
     entry (the 1893 spelling, the joined L-suffix, names) and, of the
     7,619 judged by script, 194 (2.55%) have a wrong first entry: 164 the
     word as written (the numerals, and phrase entries such as ܪܘܼܚܵܐ
     ܕܩܘܼܕܫܵܐ, the Holy Spirit, which are right) and 12 the past particle
     (ܚܘܵܪܵܐ ܗ݇ܘܵܐ → ܚܘܪܐ, white, where the row names ܚܘܪ, to be white).
     With the published dictionary 18,643 find no entry and 379 of the
     judged (4.97%) are wrong. With `olderSpellings` on (tagged copy),
     6,097 find no entry and 198 of the judged are wrong.
     A seeded random sample of 60 of the hovers no form-of row judges,
     judged by hand (tagged copy, defaults): 32 right, 10 wrong, 18 with no
     entry. The wrong ones: the Urmia contracted past ܐ݇ܡܸܪܹܐ (he said,
     ×2) read as ܐܡܪܐ, lamb; ܐ݇ܬܹܠܘܿܢ (they came, ×2) and ܚܹܝܠܹܐ (he
     lived), Urmia joined L-suffixes, without the setting; a proclitic and
     a word read as one word (ܕܐܵܢܵܐ, that I, → ܕܐܢ, to judge; ܕܚܵܐ, that
     one, → ܕܚܐ; ܕܝܼܗ݇ܘܵܐ, that was, → ܕܝܗ); ܟܲܪܒܘܼܟ → ܟܪܒܐ (cabbage);
     ܠܛܵܝܸܦܝܼ → ܛܐܦ (to float). The 18 without an entry are Urmia spellings
     (ܘܨܠܹܠܹܐ, ܦܸܫܠܹܐ, ܫܩܸܠܘܿܢ), names and words wty-aii-en lacks.
   - *Sentences written for the pack* (`sources/sentences.tsv`, 60 hovered
     words in 26 sentences, `aii-lookup-batch`): first entry the expected
     headword for 54 pointed and 50 unpointed with the tagged copy, 44 and
     28 with the published dictionary. Four of the six pointed misses are
     the dictionary's own form-of rows (ܢܸܫܹ̈ܐ → ܢܫܐ, women, its own
     headword; ܡܲܠܟܬ݂ܵܐ → ܡܠܟܐ, as the feminine of king); unpointed misses
     include ܨܝܡܝ (they fast, or my fast) and ܐܪܝܡ (raise!, or ܐܪܡ).

5. **Performance** (host load 25 on 64 cores).
   - Native `benchmark-lookup --languages languages --language aii` on the
     120 texts of `sources/benchmark-texts.txt` (the 60 hovers of the
     sentences, pointed and unpointed), 21 passes, the first dropped, three
     runs: published p50 13.3-13.7 µs, p95 27.8-28.2 µs; tagged copy p50
     15.3-15.4 µs, p95 30.6-30.8 µs (budget 1 ms p50).
   - Hachidori's WebAssembly (`benchmark/node-lookup.mjs` of
     feat/multi-language d7e82b0, its vendored runtimes, Node 22,
     `HACHIDORI_LOOKUP_LANGUAGE=aii`, the 206 words of the 26 sentences,
     pointed and unpointed, 11 passes): threaded p50 53.5 µs, p95 134.1 µs
     (published), 83.7 / 180.7 µs (tagged); single-thread 50.8 / 127.3 µs
     and 71.7 / 167.6 µs. The dictionary imports in 0.23-0.28 s (threaded).
   - Pack load: natively `LanguageRegistry::add` takes 2.12-2.16 ms (median
     of 50; `sources/load-bench.cpp`) and the registry holds 1,156,000 bytes
     of heap. In WebAssembly (`sources/wasm-load.mjs`, 10 fresh engines)
     the first `hdw_language_load` takes 9.8-10.0 ms single-thread and
     10.3-10.8 ms threaded, a second one 5.2-5.9 ms, and the allocator's
     live bytes grow by 713,056 and 712,992 bytes. Budgets 50 ms and 20 MB.
   - 37 `pattern` rules (the pointed Stem I and hollow non-past, the -ē
     endings, the Stem III imperative, the gerund): without them the native
     load takes 1.30 ms and the registry 1,005,728 bytes, so they cost about
     0.85 ms and 150 KB.

6. **Hachidori in Chrome.** `test/chrome-language-pack.mjs` on
   bee-san/hachidori feat/multi-language d7e82b0 with
   `third_party/hoshidicts` at this branch and `scripts/sync-languages.mjs`
   run, Chrome 152, the 60 cases of `sources/sentences.tsv`:
   - wty-aii-en as published: 48 passed, 16 failed (the profile, the
     import in 0.5 s, 44 of 60 cases, the Anki note and the switch to
     Japanese and back passed). Of the 16 failed cases, 11 need a rule with
     conditions and 5 show a form-of row of the dictionary first.
   - the tagged copy: 59 passed, 5 failed, all five the dictionary's own
     form-of rows above (`ܟܬ݂ܵܒ݂ܵܐ` → ܟܬܒ, its verbal noun, before ܟܬܒܐ, book).
   No WebAssembly rebuild was needed. A Syriac font has to be on the
   system: without one the pages and the popup show no Syriac glyphs.

7. **Mutations** (section 14 step 7, `sources/mutations.py`): 180 edits of
   `transforms.json` in scratch copies (each stem constraint of each
   transform deleted, each minimum lowered, the patterns loosened, ܐ added
   back as a last radical, the conditions dropped or opened, the optional
   transforms made required, the Stem II imperative put before the nouns,
   the gerund of any length). Every one fails the conformance test except
   the identity and five: the minimums of `pastBaseMt` and `infinitiveM`
   (deleted or lowered), which change no deinflection of 166,222 words
   (the dev pool, the Urmia Bible and the examples, pointed and unpointed:
   other rules give the same texts), and `pointed:middleYod`, which lets
   the strong pointed pattern take ܝ as its middle radical. That one adds
   CܝC readings to 519 of those words (ܒܵܝܙܵܐ → ܒܝܙ), which only an
   untagged dictionary shows: with the tagged copy it costs 9 dev pointed
   first results and 3 example hovers, so it stays.

8. **Conformance and checks**: `language-conformance-test languages/aii`
   conforms: corpus.tsv 1,642/1,642 and defaults.tsv 14/14 with the pack's
   defaults, cases.tsv 364/364, text.tsv 22/22, lookup.tsv 35/35, gaps.tsv
   0/35 (reported); 415 of the 1,632 rules are exercised by a passing row.
   `tools/check-yomitan.mjs aii`: no `sources/yomitan.json`, rules not
   compared; `removeSyriacScriptDiacritics` agrees with Yomitan's on 2,142
   inputs, 0 differences. `tools/check-classes.mjs aii` matches.

Commands (from the repository root, `C` the directory with the downloads
above):

```sh
node languages/aii/sources/own-rules.mjs && node tools/merge-transforms.mjs aii --force
python3 languages/aii/sources/build-corpus.py $C/wty-aii-en.zip $C/kaikki-aii.jsonl --cli build/hoshidicts-cli --dev dev.tsv
python3 languages/aii/sources/tag-dictionary.py $C/wty-aii-en.zip $C/wty-aii-en-tagged.zip
build/hoshidicts-cli import $C/wty-aii-en.zip; build/hoshidicts-cli import $C/wty-aii-en-tagged.zip
python3 languages/aii/sources/eval-table.py "$C/wty-aii-en" "$C/wty-aii-en (tagged)"
python3 languages/aii/sources/measure.py candidates dev.tsv --headwords $C/wty-aii-en.zip --options default
python3 languages/aii/sources/measure.py firstrank dev.tsv --dictionary "$C/wty-aii-en (tagged)" [--unpointed]
python3 languages/aii/sources/measure-examples.py $C/kaikki-aii.jsonl "$C/wty-aii-en (tagged)" [--unpointed] --report 15
python3 languages/aii/sources/measure-urmia.py $C/urmia-1893 $C/wty-aii-en.zip "$C/wty-aii-en (tagged)" [--options lJoined,pastBaseUrmia] \
  --sample 60 --sample-out sample.jsonl
python3 languages/aii/sources/mutations.py /tmp/aii-mutations
build/benchmark-lookup languages/aii/sources/benchmark-texts.txt 21 --term "$C/wty-aii-en" --languages languages --language aii --json
build/aii-load-bench languages 50; node languages/aii/sources/wasm-load.mjs <hachidori checkout> 10
```

`build/aii-lookup-batch` and `build/aii-load-bench` are built from
`sources/lookup-batch.cpp` and `sources/load-bench.cpp` as their headers
say.

## Known gaps

- **The published dictionary has no part-of-speech tags.** Until the pack
  can set `lookup.untaggedTerms: "pass"` (#58), a rule's output with
  conditions finds no term of wty-aii-en: unpointed text finds the lemma
  for 5.4% of the dev pool forms (88.0% with the tagged copy), and the
  example hovers 56.4% unpointed and 71.9% pointed (87.2% and 84.2%).
  Pointed forms the dictionary lists are found through its form-of rows
  either way. The pack adds the field when #58 is on main, and a Hachidori
  runtime built after #58 is needed to load it there.
- **Ties go to the reading found first.** A proclitic and a word tie with a
  one-step suffix reading of the whole word, and the suffix reading comes
  first (ܕܐܵܢܵܐ, that I, → ܕܐܢ, to judge; ܕܡܵܬ݂ܵܐ, of the village, → ܕܡܐ,
  blood, unpointed). A possessed noun and a 3p verb tie the other way
  (ܓܲܒ̣ܪܝܼ, my man, → ܓܒܪ). The pack cannot order equal readings beyond the
  order of its rules (section 9.6); the order chosen is the one that
  measured best on the example hovers.
- **The word as written comes first.** An unpointed word that is itself a
  headword shows that headword before any reading the rules make, as it
  should when the word is meant (177 of the unpointed example hovers had
  another lemma in mind).
- **CāCCā nouns.** The pointed Stem I pattern reads ܣܵܦܪܵܐ (scribe) as
  the non-past of ܣܦܪ first, because the agent noun and the third person
  feminine non-past have the same pointing.
- **Urmia (1893) spellings.** The contracted past after ܪ and ܠ (ܐ݇ܡܸܪܹܐ,
  he said, 615 times as ܘܐ݇ܡܸܪܹܐ; ܫܩܸܠܘܿܢ, they took), the past base
  without ܝ before a joined L-suffix (ܦܸܫܠܹܐ), and the dot below and above
  for rukkakha and qushshaya are not read; the joined L-suffix needs the
  `olderSpellings` setting. With the tagged copy and the setting on, 6,097
  of the 45,406 words of the Urmia Bible still find no entry.
- **The dictionary's form-of rows come first** when they name a lemma for
  the word as written, even where another reading is meant (ܟܬ݂ܵܒ݂ܵܐ →
  ܟܬܒ, as its verbal noun, before ܟܬܒܐ, book; ܡܲܠܟܬ݂ܵܐ → ܡܠܟܐ).
- **gaps.tsv** (35 of the 1,677 sample rows): absolute singular and plural
  states of feminine nouns in -tā (ܓܪܵܥܵܐ → ܓܪܥܬܐ, ܒܘܼܪ̈ܟܵܢ → ܒܘܪܟܬܐ; a
  rule for -ā → -tā would read ܟܲܠܒܵܐ, dog, as ܟܠܒܬܐ, bitch), abstract
  nouns in -ū (ܐܵܣܝܘܼ → ܐܣܝܘܬܐ), plural construct and possessed forms
  with stems of their own (ܡܥܵܪ̈ܲܢ → ܡܥܪܬܐ, ܚܸܛܝܼ̈ → ܚܛܝܬܐ), three
  prepositions (ܐܸܠܲܝܢ → ܠ-), two imperatives of verbs with a weak first
  radical (ܐܲܚܲܘ → ܡܚܐ) and two irregular adjectives (ܛܵܒ݂ܲܝ̈ → ܛܒ). In
  the dev pool, 2,652 of 89,080 rows (2.98%) are not reached, mostly the
  same classes (657 absolute singular and 631 absolute plural rows).
- **Equivalent mutants**: the minimums of `pastBaseMt` and `infinitiveM`
  change no deinflection of 166,222 words, so no row can pin them; the
  middle-ܝ exclusion of the pointed pattern is pinned by measurement, not
  by a row, until an untagged test dictionary can show it.
- **Multiword lemmas** of the dictionary (ܕܪܐ ܒܠܐ, to pay attention) are
  reached only when the phrase is written as the entry writes it.
