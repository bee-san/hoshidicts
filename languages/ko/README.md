# Korean (`ko`)

Korean words are written in Hangul syllables, and an ending changes the
syllables of the stem (먹 + 었 + 어요 → 먹었어요, 돕 + 아 → 도와, 모르 + 아 →
몰라). The pack's first preprocessor composes the text (NFC), the second
splits every syllable into jamo with the engine's `hangul.disassemble`, as
Yomitan does, so every rule is a plain suffix rule on jamo: `ㅇㅓㅇㅛ` → `ㄷㅏ`
turns 먹었어요 (ㅁㅓㄱㅇㅓㅆㅇㅓㅇㅛ) into 먹었다. The postprocessor `hangul.assemble`
joins each deinflected form into syllables again before the dictionary is
queried.

Scanning follows `docs/languages.md` 14.1: the scan starts at the cursor,
every prefix is looked up (`searchResolution: "character"`) and spaces
separate words. Particles are written together with the noun (학교에서), and
nouns have no rules: the lookup reaches 학교 by shortening the scan.
Headwords are not split across lines (`wordBreak: "keep-all"`).

## Sources and licences

- `sources/own.json`, written by `sources/own-rules.mjs`: the rules written
  for hoshidicts (GPL-3.0-or-later). The first version was committed on its
  own (the branch's first commit, "ko: own rules") before Yomitan's Korean
  rules were read. Later
  changes, all from the measurements below: transform ids renamed to
  Yomitan's where the ending is the same, so `tools/merge-transforms.mjs`
  pairs them; the alternations 그러다/이러다/저러다/어쩌다 (그래) and ㅓ ㅎ-irregular
  adjectives (누렇다 → 누레), the irregular stems before -(으)ㅂ시오, and the
  honorific verbs before -(으)십시오, from UniMorph rows the rules missed;
  -아/어지다 limited to adjective stems and the endings in 는/느 to verbs, 있다
  and 없다, which removed false candidates; the conditions `particle` (how
  kty-ko-en tags the copula 이다) and `ida` (Yomitan's name for it).
- `sources/yomitan.json`: written by `tools/port-yomitan-transforms.mjs` from
  [Yomitan](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/ko/korean-transforms.js)
  `ext/js/language/ko/korean-transforms.js` at d3c54c1, GPL-3.0-or-later,
  Copyright (C) 2024-2026 Yomitan Authors. Transform ids, names, conditions
  and their Korean names are Yomitan's.
- The processors `disassembleHangul` and `reassembleHangul` have the ids and
  behaviour of Yomitan's `ext/js/language/ko/korean-text-processors.js`
  (GPL-3.0-or-later), through the engine's port of
  [Hangul.js](https://github.com/e-/Hangul.js) 0.2.6 (MIT, Copyright 2017
  Jaemin Jo). `composeHangul` (NFC) is ours.
- `transforms.json`: written by `sources/final-rules.mjs`, the union of the
  two files without the Yomitan rules listed in `sources/removed-rules.tsv`,
  which `sources/select-rules.mjs` chooses (Rule provenance).
- `tests/corpus.tsv`: 1,314 form → lemma pairs, 12 from each of UniMorph's
  115 tag sets, drawn with seed 1 by `sources/sample-corpus.mjs` from
  [UniMorph kor](https://github.com/unimorph/kor/blob/35bbecb10a3045e24b783a6efd2202e844a1ba3d/kor)
  at 35bbecb (file `kor`, sha256 `fcf730bf…9195`), compiled from Wiktionary
  inflection tables by Maria Nepomniashchaya, Daria Rodionova and Anastasia
  Yemelina; CC BY-SA 3.0, the licence UniMorph gives its data (the `kor`
  repository has no licence file of its own; the data is Wiktionary's, CC
  BY-SA). Rows that are not plain Hangul (scraping leftovers such as
  `두근거린다-georinda`) or not V/ADJ are skipped.
- `tests/yomitan.tsv`: Yomitan's Korean transform test,
  [`test/language/korean-transforms.test.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/korean-transforms.test.js),
  GPL-3.0-or-later, Copyright (C) 2023-2026 Yomitan Authors and 2020-2022
  Yomichan Authors, converted by `tools/port-yomitan-tests.mjs` and
  `sources/relax-yomitan-tests.mjs`: 53 valid rows whose lemma the final rules
  reach with another trace (갔다 is `-았/었` in one step, where Yomitan takes
  `-다` and `-았/었`) have `reasons` `*` and the category suffix "(any trace)";
  the one row the final rules fail is in `tests/gaps.tsv`.
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`, `tests/dictionary/`
  and `sources/benchmark-words.txt`: written for hoshidicts
  (GPL-3.0-or-later). The tiny dictionary's 26 entries are written for it,
  tagged as kty-ko-en tags them.
- Measurement data, not committed: kty-ko-en (below), every V/ADJ pair of
  UniMorph kor (191,146), and the 15,947 Korean sentences of
  [Tatoeba](https://tatoeba.org/) (`kor_sentences.tsv.bz2` downloaded
  2026-11-02, sha256 `2c06d3d3…c51e`, CC BY 2.0 FR).

## Rule provenance

`transforms.json` has 459 transforms and 3,284 rules (3,242 `suffix`, 42
`wholeWord`, no `pattern`):

| Source | Transforms | Rules |
| --- | ---: | ---: |
| `own` | 14 | 898 |
| `yomitan` | 372 | 2,386 |
| `both` | 73 | 0 |

- A `both` transform has an id both files use (the same ending, written
  twice): its rules are Yomitan's and ours, each marked. No rule is `both`
  in `tools/merge-transforms.mjs`'s sense of two equal rules: the own rules
  constrain the stem (`stemEndsWith`, `stemMinLength`) and use their own
  pre-final conditions (`-겠`, `-었`, `-시`; Yomitan's are `f`, `p`, `eusi`), so
  even endings both sets have are written differently.
- Own transforms Yomitan lacks: `-나요`, `-잖아`, `-더라`, `-고요`, `-니까요`,
  `-어서요`, `-어하다`, `-이에요`, `-이라`, and the pronouns contracted with a
  particle (`topic` 난 → 나, 이건 → 이것; `object` 날 → 나; `subject` 내가 → 나,
  이게 → 이것; `possessive` 내 → 나), which shortening the scan cannot reach.
- Not ported: the `-로라` rule `suffixInflection('', '다', [], ['ida'])`,
  which turns every text into 다 because `slice(0, -0)` is empty
  (`docs/languages.md` 8.3; `sources/yomitan-differences.tsv`).
- Left out of the final set: 295 Yomitan rules, each with its numbers in
  `sources/removed-rules.tsv`. `sources/select-rules.mjs` measures the union
  with `hoshidicts-cli eval-language --per-rule` against kty-ko-en as
  published, on every V/ADJ pair of UniMorph kor, `tests/cases.tsv`,
  Yomitan's test, 75,000 noun + particle words with their prefixes, and the
  12,852 Tatoeba words whose lemma is unambiguous (the last two count only
  false candidates). It removes:
  - 281 rules that recover no row (every row they help has another path)
    but add false candidates, 2,472 in all: 11 of the 33 bare-stem rules of
    `어간` (우리 → 우리다, 감 → 감다), `-(으)시` rules without the own rules' stem
    checks (들으시고 → 들다, which is 듣다), `-았/었` with ㅐㅆ → ㅣ다 after any
    consonant (그랬어요 → 그리다), `-(으)리` after a noun (메리 → 메다), and
    rules of `-아/어다`, `-(으)ㅁ도`, `-(으)니까` and others;
  - 3 rules that together break the negative 몰라 → 몰다: `-(으)라`, `-아/어라`
    and `-(으)ㄹ라` with `ㄹㅏ` → `ㄷㅏ`;
  - 11 rules that give a false candidate in as few steps as the lemma, so
    the two tie in a lookup, where the own rules alone reach the lemma first:
    `-(으)셔요` reads 마셔요 as 마다 in one step, as many as 마셔요 → 마시다, where
    the own rules take two (-아/어요, then -(으)시); `-(으)세요`'s ㅅㅔㅇㅛ → ㄹ다
    reads 거세요 as 걸다 in one step, tied with 거세다.
  The removal is undone for any rule whose absence lowers recall on
  UniMorph, the cases or Yomitan's test.

## Measurements

Dictionary: **kty-ko-en**, [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan)
release [v2025-04-08-10-54-36-00-00](https://github.com/yomidevs/wiktionary-to-yomitan/releases/download/v2025-04-08-10-54-36-00-00/kty-ko-en.zip)
(index revision 2025.04.08; 7,953,946 bytes, sha256 `6a075a3c…8fa1c`),
derived from English Wiktionary through kaikki.org, CC BY-SA; imported with
`hoshidicts-cli import` (372,368 terms, 0.5 s). 336,337 of its rows are
form-of rows (a glossary of only `[lemma, [inflection]]` references) and
36,031 are entries. Today the engine imports a form-of row as a term
without a part of speech: it matches an inflected word as written and ranks
before the lemma, which drives the `firstRank` column down. The column
"first, entries" repeats the measurement with a copy of kty-ko-en without
its form-of rows, labelled as such; every other number is the published
dictionary's (false candidates are the same with both).

`hoshidicts-cli eval-language ko <file> --transforms <rules> --dictionary
<kty-ko-en>`; recall over valid rows, negatives over `valid = 0` rows, false
candidates per valid row, first rank of a whole-source lookup:

| Set (rows) | Rules | Recall | Negatives | False cand. | First | First, entries |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `tests/corpus.tsv` (1,314) | own | 100.00% | | 0.0472 | 2.36% | 97.95% |
| | Yomitan | 95.74% | | 0.0426 | 2.36% | 97.56% |
| | union | 100.00% | | 0.0533 | 2.36% | 98.02% |
| | **final** | **100.00%** | | **0.0472** | 2.36% | 97.95% |
| UniMorph, every V/ADJ pair (191,146) | own | 99.992% | | 0.0309 | 1.81% | 98.63% |
| | Yomitan | 93.149% | | 0.0206 | 1.80% | 97.75% |
| | union | 99.996% | | 0.0359 | 1.81% | 98.48% |
| | **final** | **99.996%** | | **0.0309** | 1.81% | 98.63% |
| `tests/cases.tsv`, any trace (189 + 34) | own | 98.41% | 100.00% | 0.2222 | 33.86% | 80.95% |
| | Yomitan | 82.01% | 58.82% | 0.2804 | 29.63% | 71.96% |
| | union | 100.00% | 58.82% | 0.3069 | 35.98% | 78.31% |
| | **final** | **100.00%** | **100.00%** | **0.2222** | 36.51% | 81.48% |
| Yomitan's test, any trace (608 + 8) | own | 96.38% | 87.50% | 0.1398 | 26.32% | 86.68% |
| | Yomitan | 100.00% | 100.00% | 0.1957 | 28.95% | 88.98% |
| | union | 100.00% | 87.50% | 0.2007 | 28.78% | 88.98% |
| | **final** | **100.00%** | 87.50% | **0.1414** | 29.93% | 90.13% |
| Tatoeba words with one lemma (12,852) | own | | | 0.0417 | 69.15% | 98.18% |
| | Yomitan | | | 0.0643 | 68.46% | 97.12% |
| | union | | | 0.0736 | 68.42% | 97.14% |
| | **final** | | | **0.0420** | 69.16% | 98.16% |
| Noun + particle (75,000) | own | | | 0.0031 | 98.95% | 99.02% |
| | Yomitan | | | 0.0079 | 98.40% | 98.47% |
| | union | | | 0.0082 | 98.38% | 98.46% |
| | **final** | | | **0.0035** | 98.92% | 98.99% |

- **Final recall: 100.00%** on `tests/corpus.tsv` and `tests/gaps.tsv`
  together (1,314 of 1,314 valid rows; `gaps.tsv` holds one negative), and
  99.996% (191,139 of 191,146) on every V/ADJ pair of UniMorph kor.
- The Tatoeba set: every Hangul word of the sentences whose lemma is
  unambiguous, as a headword of kty-ko-en (2,118), a UniMorph form with one
  lemma (3,796) or a noun followed by a particle (6,938). The noun + particle
  set: 3,000 nouns, pronouns and names of kty-ko-en with 25 particles and
  copula forms (학교 + 에서). Rules do not reach nouns, so recall is not given
  for these two sets.
- Trace quality, on the 98,718 finite forms of UniMorph: the trace a lookup
  keeps for the lemma has a past step exactly when the tags say PST, -겠
  exactly when they say FUT, and -(으)시- exactly when they say ELEV, for
  99.90% of the forms whose lemma the rules reach (own 98,704 forms, 99.90%;
  Yomitan 95,993, 99.91%; final 98,712, 99.90%). The other 0.10% are rows
  whose tags do not fit the form (계시겠다 tagged as an imperative).
- `language-conformance-test`: corpus.tsv 1,314 / 1,314, cases.tsv 223 /
  223, yomitan.tsv 615 / 615, text.tsv 15 / 15, lookup.tsv 25 / 25, gaps.tsv
  0 / 1 (reported); classes.json agrees with the engine (7 classes, 552
  fields, no steps); 421 of the 3,284 rules are exercised by a passing row.
  `tests/` and `sources/` hold 917,987 bytes.
- `tools/check-yomitan.mjs`, on a copy of Yomitan d3c54c1 with
  `ext/lib/hangul-js.js` built (hangul-js 0.2.6, esbuild 0.25.1): 13,556
  inputs, 116,777 Yomitan results, 13,529 listed differences (all the `-로라`
  defect), 0 unexplained; processors `disassembleHangul` and
  `reassembleHangul` 2,133 inputs each, 0 unexplained.
- **Real use**: 40 inflected words in sentences written for this pack,
  looked up with `hoshidicts-cli lookup --language ko` in kty-ko-en: the
  expected lemma is among the results for 39 and is the first entry (after
  form-of rows) for 35; it is the first result for 11, because a form-of row
  comes first for 29. Of the 69,969 Hangul word positions of the Tatoeba
  sentences (each looked up to the end of its sentence), 67,864 find
  something; a form-of row is the first result for 17,124 of them (25.2%),
  and an entry is second for 17,050.
- **Hachidori in Chrome** (`test/chrome-language-pack.mjs` on hachidori
  feat/multi-language 1bd53232 with this branch in `third_party/hoshidicts`,
  Chrome 152, kty-ko-en): 14 of 14 checks pass in 7-8 s; kty-ko-en imports
  in about 1 s; ten words, from 학교에서 → 학교 (matched 학교) to 따뜻해졌어요 →
  따뜻하다 (-아/어요, past, -아/어지다), chosen where the lemma is the first
  result today.
- **Lookup speed**, native `benchmark-lookup --languages languages --language
  ko --term kty-ko-en`, the 64 texts of `sources/benchmark-words.txt` (each
  from an inflected word to the end of its sentence), 6 passes with the
  first dropped, three runs, machine load 20-23 on 64 cores: final p50
  78-89 µs, p95 208-216 µs; own p50 58-63 µs, p95 127-135 µs; Yomitan p50
  80-85 µs, p95 217-223 µs; union p50 81-84 µs, p95 205-208 µs (budget 1 ms
  p50). The 69,969 Tatoeba word positions (to the end of the sentence, at
  most 200 code points): final p50 108 µs, p95 214 µs, p99 257 µs.
- **WebAssembly** (Hachidori 1bd53232's prebuilt engines, Node 22.23.1,
  machine load 33, kty-ko-en): `hdw_lookup` on the 64 texts p50 0.345 ms,
  p95 0.789 ms (single-thread), p50 0.317 ms, p95 0.740 ms (threaded).
  `hdw_language_load` of the pack: median 12.8 ms (single-thread) and 12.4 ms
  (threaded) over 10 fresh engines; live heap +792,472 bytes after the load
  (`hdw_memory_stats`). Natively `LanguageRegistry::add` takes 4.4 ms (median
  of 50) and keeps 1,264,112 bytes of heap. Budgets 50 ms and 20 MB. The pack
  has no `pattern` rule.

## Known gaps

- **Form-of rows first.** As above, kty-ko-en's form-of rows match inflected
  words before the rules' lemmas, and Hachidori shows them as cards without
  definitions. A framework change that follows them as Yomitan does is under
  way; when it merges, this pack sets `lookup.formOf` to `"follow"`.
- **Ties.** A lookup orders readings of equal trace length arbitrarily, and
  kty-ko-en has no frequencies, so 사세요 gives 사다 (to buy) before 살다 (to
  live), 갈까요 갈다 before 가다, 마세요 마다 before 말다: both readings are
  Korean, and both are listed.
- **Nouns are not deinflected.** Particles are reached by shortening the
  scan, so a result shows the noun without the particle's meaning. 813 of the
  75,000 noun + particle words (1.1%) rank another word first: for 374 a
  form-of row covers more of the text (사냥한테: 사냥한, a form of 사냥하다), for
  197 another headword does (벌이에요: 벌이), and for 242 a rule reads noun and
  particle as a verb form (벌까지: 벌까 → 벌다 by -(으)ㄹ까). Some of these
  readings are right: the generated 포 + 도 is the word 포도 (grape), and 접어도 is
  접다 + -어도.
- **Honorific headwords.** UniMorph lists 가세요, 자세요 and 돌아가세요 under the
  honorific headwords 가시다, 자시다 and 돌아가시다; the rules give 가다 and 자다
  (-(으)세요, honorific -(으)시-), so these UniMorph rows are not reached, with
  시장하세요, 편찮으세요 and 있으세요 (6 rows); the seventh is 이에, which UniMorph
  lists as a connective of 이다 and the rules do not give (they give 이어). The
  honorific verbs 계시다, 주무시다, 드시다 and 잡수시다 have rules.
- **보십시다** (`tests/gaps.tsv`): Yomitan's test says -(으)시- + -(으)ㅂ시다 is
  not an analysis of 보십시다; the own rules give it, because the honorific
  hortative -(으)십시다 is -(으)시- with -(으)ㅂ시다. The lemma, 보다, is the same.
- **Dictionary coverage.** kty-ko-en has form-of rows for 드리다 but no entry,
  so 드릴게요 finds 드릴 (drill).
- **No hanja view.** Hanja words are looked up as written; kty-ko-en has
  them as form-of rows pointing to the Hangul word. `characterView` is null.
- **CI**: the processor comparison of `tools/check-yomitan.mjs` needs
  Yomitan's `ext/lib/hangul-js.js`, which CI's Yomitan checkout does not
  build until the framework change that adds it (hachi-lang-engine-e)
  merges; on a built copy the comparison passes.
