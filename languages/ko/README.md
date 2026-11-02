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
nouns have no rules: the lookup reaches 학교 by shortening the scan. The one
exception is a closed list of personal pronouns with a particle (나는, 그는,
우리를), which get the whole word. Headwords are not split across lines
(`wordBreak: "keep-all"`).

## Sources and licences

- `sources/own.json`, written by `sources/own-rules.mjs`: the rules written
  for hoshidicts (GPL-3.0-or-later). The first version was committed on its
  own (the branch's first commit, "ko: own rules") before Yomitan's Korean
  rules were read. Later changes, all from the measurements below and the
  audit of this pull request:
  - transform ids renamed to Yomitan's where the ending is the same, so
    `tools/merge-transforms.mjs` pairs them; the -는데/-(으)ㄴ데 and
    -는지/-(으)ㄴ지 transforms merged under Yomitan's ids, and the -(으)니
    connective moved from `-(으)니까` to `-(으)니`;
  - rules for UniMorph rows the rules missed: the alternations of
    그러다/이러다/저러다/어쩌다 (그래) and of ㅓ ㅎ-irregular adjectives (누렇다 →
    누레), the irregular stems before -(으)ㅂ시오 (with ㄹ excluded from its
    consonant-stem 읍시오 rule), and the honorific verbs before -(으)십시오;
  - restrictions that removed false candidates: -아/어지다 only after
    adjective stems, the endings in 는/느 only after verbs, 있다 and 없다, and
    no ㅡ-dropping before -아/어 after ㄹ (사러 is never 사르다), with rules for
    the 르 stems that do drop ㅡ (따르다, 치르다, 들르다, 우러르다, 다다르다);
  - the conditions `particle` (how kty-ko-en tags the copula 이다) and `ida`
    (Yomitan's), and Yomitan's `p`, `f` and `eusi`: the own -았/었-, -았/었었-,
    -겠- and -(으)시- rules also take the bare stem one of Yomitan's endings
    leaves (먹었으나 → 먹었, marked `p`), under the own stem constraints;
  - two endings: -아/어다가 and -아/어야만; the contractions 마, 마요, 마라 (말다)
    and 건, 걸, 게 (것); and the personal pronouns with a particle.
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
  `sources/relax-yomitan-tests.mjs`: 42 valid rows whose lemma the final rules
  reach with another trace (갔다 is `-았/었` in one step, where Yomitan takes
  `-다` and `-았/었`) have `reasons` `*` and the category suffix "(any trace)";
  the one row the final rules fail is in `tests/gaps.tsv`.
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`, `tests/dictionary/`,
  `sources/benchmark-words.txt`, `sources/real-use.tsv` and
  `sources/chrome-cases.tsv`: written for hoshidicts (GPL-3.0-or-later). The
  tiny dictionary's 29 entries are written for it, tagged as kty-ko-en tags
  them; one is spelled in jamo (ㅁㅓㄱㄷㅏ), so a lookup that kept the
  unjoined form would find it.
- Measurement data, not committed: kty-ko-en (below), UniMorph kor, and the
  15,947 Korean sentences of [Tatoeba](https://tatoeba.org/)
  (`kor_sentences.tsv.bz2` downloaded 2026-11-02, sha256 `2c06d3d3…c51e`,
  CC BY 2.0 FR).

## Rule provenance

`transforms.json` has 460 transforms and 3,405 rules (3,221 `suffix`, 184
`wholeWord`, no `pattern`):

| Source | Transforms | Rules |
| --- | ---: | ---: |
| `own` | 15 | 1,267 |
| `yomitan` | 370 | 2,138 |
| `both` | 75 | 0 |

- A `both` transform has an id both files use (the same ending, written
  twice): its rules are Yomitan's and ours, each marked. No rule is `both`
  in `tools/merge-transforms.mjs`'s sense of two equal rules: the own rules
  constrain the stem (`stemEndsWith`, `stemMinLength`) and use their own
  pre-final conditions (`-겠`, `-었`, `-시`, and for Yomitan's stems `f`, `p`,
  `eusi`), so even endings both sets have are written differently.
- Own transforms Yomitan lacks: `-나요`, `-잖아`, `-더라`, `-고요`, `-니까요`,
  `-어서요`, `-어하다`, `-이에요`, `-이라`, the pronouns contracted with a
  particle (`topic` 난 → 나, 이건 → 이것, 건 → 것; `object` 날 → 나, 걸 → 것;
  `subject` 내가 → 나, 이게 → 이것, 게 → 것; `possessive` 내 → 나) and the
  pronouns with a particle (`particle`: 나는 → 나, 그의 → 그, 우리를 → 우리; 14
  pronouns with 10 particles, 136 words). `-느냐` is own-only in the final
  set because both of Yomitan's `-느냐` rules were left out.
- Not ported: the `-로라` rule `suffixInflection('', '다', [], ['ida'])`,
  which turns every text into 다 because `slice(0, -0)` is empty
  (`docs/languages.md` 8.3; `sources/yomitan-differences.tsv`).
- Left out of the final set: 531 Yomitan rules, each with its numbers in
  `sources/removed-rules.tsv` (transform id, the rule's affixes and
  conditions, what it recovers, the false candidates it adds, the negatives it
  breaks). `sources/select-rules.mjs` measures the union with
  `hoshidicts-cli eval-language --per-rule` against kty-ko-en as published,
  on every V/ADJ pair of UniMorph kor, `tests/cases.tsv`, `tests/yomitan.tsv`,
  Yomitan's endings after the pre-final endings (the chain set below), noun +
  particle words with their prefixes, and Tatoeba words (the last two count
  only false candidates, since rules do not reach nouns). It removes:
  - 511 rules that recover no row (every row they help has another path) but
    add false candidates, 4,927 in all: 11 of the 33 bare-stem rules of `어간`
    (우리 → 우리다, 감 → 감다), `-(으)시` rules without the own rules' stem checks
    (들으시고 → 들다, which is 듣다), `-았/었` with ㅐㅆ → ㅣ다 after any stem
    (그랬어요 → 그리다), `-(으)리` after a noun (메리 → 메다), and others. Yomitan's
    own completers of its chains (-았/었 after `p` and so on) are among them
    where the own completers above give the same lemma under stem
    constraints;
  - 12 rules on the paths of negatives that several rules break together:
    ㄹㅏ → 다 in `-(으)라` and `-아/어라` and ㄹㄹㅏ → ㄹ다 in `-(으)ㄹ라` (몰라 → 몰다),
    and Yomitan's ㅡ-dropping after ㄹ in `-아/어`, `-아/어도`, `-아/어서`,
    `-아/어요`, `-아/어다`, `-아/어다가` and `-아/어라` (자러 → 자르다, 나라도 →
    나르다, 이라서 → 이르다, 바라요 → 바르다, 거라 → 거르다, 나라다 → 나르다, 이러다 →
    이르다, 이러다가 → 이르다, 이러라 → 이르다);
  - 8 of the 14 rules that give a false candidate in as few steps as the
    lemma, so the two tie in a lookup, where the own rules alone rank the
    lemma first (`-(으)셔요`'s ㅅㅕㅇㅛ → 다 reads 시장하셔요 as 시장하다 in one step,
    as many as UniMorph's lemma 시장하시다 takes; Yomitan's ㅡ-dropping in
    `-아/어라`, `-아/어야` and `-았/었` ties 바라라 → 바르다 with 바라다). Each is removed only if the number of valid
    rows whose lemma a lookup ranks first goes up, counted with kty-ko-en
    without its form-of rows over UniMorph, the cases, Yomitan's test, the
    chain set and the Tatoeba words once per occurrence: 249,841 for the
    union, 251,856 after the first two steps, 251,878 for the final set. The
    other 6 are kept. So is `-(으)세요`'s ㅅㅔㅇㅛ → ㄹ다: removing it, as an
    earlier version of the script did, lowers the count by 5 and makes 마세요
    rank 마다 before 말다.
  A removal is undone for any rule whose absence lowers recall on UniMorph,
  the cases, Yomitan's test or the chain set.

## Measurements

Dictionary: **kty-ko-en**, [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan)
release [v2025-04-08-10-54-36-00-00](https://github.com/yomidevs/wiktionary-to-yomitan/releases/download/v2025-04-08-10-54-36-00-00/kty-ko-en.zip)
(index revision 2025.04.08; 7,953,946 bytes, sha256 `6a075a3c…8fa1c`),
derived from English Wiktionary through kaikki.org, CC BY-SA; imported with
`hoshidicts-cli import` (372,368 terms, 0.5 s). 336,337 of its rows are
form-of rows (a glossary of only `[lemma, [inflection]]` references) and
36,031 are entries. Today the engine imports a form-of row as a term
without a part of speech: it matches an inflected word as written and ranks
before the lemma, which drives the "First" column down. "First, entries"
repeats the measurement with a copy of kty-ko-en without its form-of rows,
as an additional measurement; every other number is the published
dictionary's.

The sets are the ones `node languages/ko/sources/select-rules.mjs ...
--write-sets <dir>` writes, except `tests/corpus.tsv` and Yomitan's test,
which is its 616 rows as `tools/port-yomitan-tests.mjs` writes them (the 615
of `tests/yomitan.tsv` and the one of `tests/gaps.tsv`). Valid rows of the
cases and of Yomitan's test have `reasons` `*`, since own and Yomitan rules
give different traces for the same lemma. `hoshidicts-cli eval-language ko
<file> --transforms <rules> --dictionary <kty-ko-en>`; recall over valid
rows, negatives over `valid = 0` rows, false candidates per valid row, first
rank of a whole-source lookup:

| Set (rows) | Rules | Recall | Negatives | False cand. | First | First, entries |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `tests/corpus.tsv` (1,314) | own | 100.00% | | 0.0472 | 2.36% | 97.95% |
| | Yomitan | 95.74% | | 0.0426 | 2.36% | 97.56% |
| | union | 100.00% | | 0.0533 | 2.36% | 98.02% |
| | **final** | **100.00%** | | **0.0472** | 2.36% | 98.02% |
| UniMorph, every V/ADJ pair (191,146) | own | 99.992% | | 0.0303 | 1.81% | 98.64% |
| | Yomitan | 93.149% | | 0.0206 | 1.80% | 97.75% |
| | union | 99.996% | | 0.0356 | 1.81% | 98.48% |
| | **final** | **99.996%** | | **0.0304** | 1.81% | 98.64% |
| Yomitan endings after -았/었-, -겠-, -(으)시-, -더- (16,839) | own | 19.00% | | 0.0559 | 73.79% | 86.41% |
| | Yomitan | 100.00% | | 0.3845 | 79.12% | 81.91% |
| | union | 100.00% | | 0.4027 | 78.90% | 81.92% |
| | **final** | **100.00%** | | **0.2768** | 85.99% | 88.56% |
| `tests/cases.tsv` (218; 55 negatives) | own | 94.95% | 100.00% | 0.2339 | 35.78% | 80.28% |
| | Yomitan | 80.28% | 41.82% | 0.3073 | 31.19% | 70.18% |
| | union | 100.00% | 41.82% | 0.3303 | 37.16% | 77.52% |
| | **final** | **100.00%** | **100.00%** | **0.2431** | 38.07% | 81.65% |
| Yomitan's test (608; 8 negatives) | own | 97.37% | 87.50% | 0.1431 | 27.14% | 87.50% |
| | Yomitan | 100.00% | 100.00% | 0.1957 | 28.95% | 88.98% |
| | union | 100.00% | 87.50% | 0.2007 | 28.78% | 88.98% |
| | **final** | **100.00%** | 87.50% | **0.1447** | 29.61% | 90.13% |
| Tatoeba words with one lemma (12,852) | own | | | 0.0423 | 69.20% | 98.26% |
| | Yomitan | | | 0.0643 | 68.46% | 97.12% |
| | union | | | 0.0745 | 68.46% | 97.19% |
| | **final** | | | **0.0426** | 69.22% | 98.25% |
| The same, once per occurrence (48,983) | own | | | 0.1429 | 71.61% | 97.43% |
| | Yomitan | | | 0.1901 | 70.87% | 94.92% |
| | union | | | 0.2399 | 70.88% | 96.15% |
| | **final** | | | **0.1429** | 71.67% | 97.36% |
| Noun + particle words (75,000) | own | | | 0.0035 | 99.07% | 99.08% |
| | Yomitan | | | 0.0078 | 98.64% | 98.66% |
| | union | | | 0.0080 | 98.63% | 98.65% |
| | **final** | | | **0.0039** | 99.05% | 99.07% |

- **Final recall: 100.00%** on `tests/corpus.tsv` and `tests/gaps.tsv`
  together (1,314 of 1,314 valid rows; `gaps.tsv` holds one negative), and
  99.996% (191,139 of 191,146) on every V/ADJ pair of UniMorph kor.
- The chain set: for every Yomitan rule that removes an ending and leaves a
  bare stem marked `p`, `f`, `eusi` or `do`, a few verbs and adjectives in
  that stem form (먹었, 됐, 그랬, 가셨; 먹겠; 받으시; 먹더) followed by the ending,
  where the result is whole syllables (먹었으나 → 먹다, 됐건만 → 되다, 받았더라도 →
  받다). Yomitan reaches them through a chain of two or three of its rules.
- The Tatoeba set: every Hangul word of the sentences whose lemma is
  unambiguous, as an entry of kty-ko-en, a UniMorph form with one lemma or a
  noun followed by a particle. The noun set: 3,000 nouns, pronouns and names
  of kty-ko-en with 25 particles and copula forms (학교 + 에서), drawn with
  seed 1. Rules do not reach nouns, so recall is not given for these sets.
- Trace quality, on the 98,718 finite forms of UniMorph: the trace a lookup
  keeps for the lemma has a past step exactly when the tags say PST, -겠
  exactly when they say FUT, and -(으)시- exactly when they say ELEV, for
  99.90% of the forms whose lemma the rules reach (own 98,704 forms, 99.90%;
  Yomitan 95,993, 99.91%; final 98,712, 99.90%). The other 0.10% are rows
  whose tags do not fit the form (계시겠다 tagged as an imperative).
- `language-conformance-test`: corpus.tsv 1,314 / 1,314, cases.tsv 273 /
  273, yomitan.tsv 615 / 615, text.tsv 16 / 16, lookup.tsv 26 / 26, gaps.tsv
  0 / 1 (reported); classes.json agrees with the engine (7 classes, 638
  fields, no steps); 464 of the 3,405 rules are exercised by a passing row.
  `tests/` and `sources/` hold 982,540 bytes.
- `tools/check-yomitan.mjs`, with Yomitan d3c54c1's `ext/lib/hangul-js.js`
  built by `tools/yomitan-libs/` (hangul-js 0.2.6, esbuild 0.25.1; sha256
  `90190300…9f62`): 13,615 inputs, 116,895 Yomitan results, 13,588 listed
  differences (all the `-로라` defect), 0 unexplained; processors
  `disassembleHangul` and `reassembleHangul` 2,179 inputs each, 0
  unexplained.
- **Real use**: the 40 inflected words of `sources/real-use.tsv`, each looked
  up with `hoshidicts-cli lookup --language ko` in kty-ko-en from the word to
  the end of its sentence: the expected lemma is among the results for 39
  and is the first entry (after form-of rows) for 36; it is the first result
  for 11, because a form-of row comes first for 26 and an entry for the
  other three: 난, whose own entry in kty-ko-en says "topic-marked form of 나";
  갈까요 → 갈다 (a tie, below); and 드릴게요 → 드릴. Of the
  69,969 Hangul word positions of the Tatoeba sentences (each looked up to
  the end of its sentence), 67,865 find something; a form-of row is the
  first result for 17,118 of them (25.2%), and an entry is second for 17,044.
- **Hachidori in Chrome** (`test/chrome-language-pack.mjs` on hachidori
  feat/multi-language 1bd53232 with this branch in `third_party/hoshidicts`,
  Chrome 152, kty-ko-en, the cases of `sources/chrome-cases.tsv`): 14 of 14
  checks pass in under 10 s; kty-ko-en imports in about 1 s; ten words, from
  학교에서 → 학교 (matched 학교) to 따뜻해졌어요 → 따뜻하다 (-아/어요, past,
  -아/어지다), chosen where the lemma is the first result today.
- **Lookup speed**, native `benchmark-lookup --languages languages --language
  ko --term kty-ko-en`, the 64 texts of `sources/benchmark-words.txt` (each
  from an inflected word to the end of its sentence), 6 passes with the
  first dropped, three runs, machine load 33-37 on 64 cores: final p50
  92-93 µs, p95 211-212 µs; own p50 71-74 µs, p95 148-151 µs; Yomitan p50
  88-96 µs, p95 229-235 µs; union p50 119-120 µs, p95 308-326 µs (budget 1 ms
  p50). The 69,969 Tatoeba word positions (to the end of the sentence, at
  most 200 code points): final p50 107 µs, p95 213 µs, p99 258 µs.
- **WebAssembly** (Hachidori 1bd53232's prebuilt engines, Node 22.23.1,
  machine load 33, kty-ko-en): `hdw_lookup` on the 64 texts p50 0.356 ms,
  p95 0.787 ms (single-thread), p50 0.387 ms, p95 0.872 ms (threaded).
  `hdw_language_load` of the pack: median 14.2 ms (single-thread) and 15.0 ms
  (threaded) over 10 fresh engines; live heap +857,968 bytes after the load
  (`hdw_memory_stats`). Natively `LanguageRegistry::add` takes 5.1 ms (median
  of 50) and keeps 1,353,888 bytes of heap. Budgets 50 ms and 20 MB. The pack
  has no `pattern` rule.

## Known gaps

- **Form-of rows first.** As above, kty-ko-en's form-of rows match inflected
  words before the rules' lemmas, and Hachidori shows them as cards without
  definitions. A framework change that follows them as Yomitan does is under
  way; when it merges, this pack sets `lookup.formOf` to `"follow"`.
- **Ties.** A lookup orders readings of equal trace length arbitrarily, and
  kty-ko-en has no frequencies, so 갑니다, 갈게 and 갈까요 give 갈다 before 가다,
  줄게 and 줄래 줄다 before 주다, 사세요 사다 before 살다, and 마세요 gives 말다 or
  마다 first depending on the dictionary. Both readings are Korean, and both
  are listed. The same holds for a pronoun with a particle: 우리는 is 우리다 (-는)
  or 우리 + 는 in one step each, and kty-ko-en ranks 우리다 first.
- **Nouns are not deinflected.** Particles are reached by shortening the
  scan, so a result shows the noun without the particle's meaning. 711 of the
  75,000 noun + particle words (0.95%) rank another word first: for 284 a
  form-of row covers more of the text (사냥한테: 사냥한, a form of 사냥하다), for
  191 another entry does (벌이에요: 벌이), and for 236 a rule reads noun and
  particle as a verb form (벌까지: 벌까 → 벌다 by -(으)ㄹ까). Some of these
  readings are right: the generated 포 + 도 is the word 포도 (grape), and 접어도 is
  접다 + -어도.
- **Irregular stems without a lexicon.** The ㄷ-, ㅂ- and ㅅ-irregular rules
  also apply to regular stems that look the same (달아요 → 닫다 beside 달다,
  굴을 → 굳다 beside 굴), as rules without a list of irregular verbs must.
- **Honorific headwords.** UniMorph lists 가세요, 자세요 and 돌아가세요 under the
  honorific headwords 가시다, 자시다 and 돌아가시다; the rules give 가다 and 자다
  (-(으)세요, honorific -(으)시-), so these UniMorph rows are not reached, with
  시장하세요, 편찮으세요 and 있으세요 (6 rows); the seventh is 이에, which UniMorph
  lists as a connective of 이다 and the rules do not give (they give 이어). The
  honorific verbs 계시다, 주무시다, 드시다 and 잡수시다 have rules.
- **보십시다** (`tests/gaps.tsv`): Yomitan's test says -(으)시- + -(으)ㅂ시다 is
  not an analysis of 보십시다; the own rules give it, because the honorific
  hortative -(으)십시다 is -(으)시- with -(으)ㅂ시다. The lemma, 보다, is the same.
- **Spaced endings after a past stem.** 먹었을 거예요 is not deinflected as a
  whole (Yomitan's -(으)ㄹ 거예요 takes no past stem); a lookup still finds 먹다
  from its prefix 먹었을.
- **Dictionary coverage.** kty-ko-en has form-of rows for 드리다 but no entry,
  so 드릴게요 finds 드릴 (drill).
- **No hanja view.** Hanja words are looked up as written; kty-ko-en has
  them as form-of rows pointing to the Hangul word. `characterView` is null.
- **Not pinned by a test.** `traceSelection: "shortest"` decides which trace a
  result shows, and the test files compare only lemmas and matched text
  (`docs/languages.md` 12.2), so changing it to `"first"` passes them.
