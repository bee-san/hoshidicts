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
  own (the branch's first commit, "ko: own rules (before reading Yomitan's
  Korean rules)") before Yomitan's Korean
  rules were read. Later changes, all from the measurements below and the
  audit of this pull request:
  - transform ids renamed to Yomitan's where the ending is the same, so
    `tools/merge-transforms.mjs` pairs them; the -는데/-(으)ㄴ데 and
    -는지/-(으)ㄴ지 transforms merged under Yomitan's ids, and the -(으)니
    connective moved from `-(으)니까` to `-(으)니`;
  - rules for UniMorph rows the rules missed: the alternations of
    그러다/이러다/저러다/어쩌다 (그래) and of ㅓ ㅎ-irregular adjectives (누렇다 →
    누레), the irregular stems before -(으)ㅂ시오 (with ㄹ excluded from its
    consonant-stem 읍시오 rule, and 시 stems allowed: 마십시오 → 마시다, as
    UniMorph lists it), and the honorific verbs before -(으)십시오;
  - restrictions that removed false candidates: -아/어지다 only after
    adjective stems, the endings in 는/느 only after verbs, 있다 and 없다, and
    no ㅡ-dropping before -아/어 after ㄹ (사러 is never 사르다), with rules for
    the 르 stems that do drop ㅡ (따르다, 치르다, 들르다, 우러르다, 다다르다);
  - the conditions `particle` (how kty-ko-en tags the copula 이다) and `ida`
    (Yomitan's), and Yomitan's `p`, `f` and `eusi`: the own -았/었-, -았/었었-,
    -겠- and -(으)시- rules also take the bare stem one of Yomitan's endings
    leaves (먹었으나 → 먹었, marked `p`), under the own stem constraints;
  - endings: -아/어다가, -아/어야만 and -았/었자 (Yomitan has them), -(으)려는
    and -(으)려던 (neither rule set had them: 가려는 사람), and -아/어야겠- before
    one of Yomitan's endings (`f`); the contractions 마, 마요, 마라 (말다) and 건,
    걸, 게 (것); and the commonest personal pronouns with a particle.
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

`transforms.json` has 461 transforms and 3,146 rules (3,051 `suffix`, 95
`wholeWord`, no `pattern`):

| Source | Transforms | Rules |
| --- | ---: | ---: |
| `own` | 17 | 1,260 |
| `yomitan` | 369 | 1,886 |
| `both` | 75 | 0 |

- A `both` transform has an id both files use (the same ending, written
  twice): its rules are Yomitan's and ours, each marked. No rule is `both`
  in `tools/merge-transforms.mjs`'s sense of two equal rules: the own rules
  constrain the stem (`stemEndsWith`, `stemMinLength`) and use their own
  pre-final conditions (`-겠`, `-었`, `-시`, and for Yomitan's stems `f`, `p`,
  `eusi`), so even endings both sets have are written differently.
- Own transforms Yomitan lacks: `-나요`, `-잖아`, `-더라`, `-고요`, `-니까요`,
  `-어서요`, `-(으)려는`, `-어하다`, `-이에요`, `-이라`, the pronouns contracted with a
  particle (`topic` 난 → 나, 이건 → 이것, 건 → 것; `object` 날 → 나, 걸 → 것;
  `subject` 내가 → 나, 이게 → 이것, 게 → 것; `possessive` 내 → 나) and the
  pronouns with a particle (`particle`: 나는 → 나, 그의 → 그, 우리를 → 우리;
  the 47 such words of 14 pronouns and 10 particles that occur at least ten
  times in the Tatoeba sentences below). `-느냐` and `-다가` are own-only in the
  final set because all of Yomitan's rules in them were left out (below).
- Not ported: the `-로라` rule `suffixInflection('', '다', [], ['ida'])`,
  which turns every text into 다 because `slice(0, -0)` is empty
  (`docs/languages.md` 8.3; `sources/yomitan-differences.tsv`).
- Left out of the final set: 795 of Yomitan's 2,681 rules (33 rules appear
  twice in their transform, and leaving one out leaves out both).
  `sources/select-rules.mjs` measures the union with `hoshidicts-cli
  eval-language --per-rule` against kty-ko-en as published, on every V/ADJ
  pair of UniMorph kor, `tests/cases.tsv`, `tests/yomitan.tsv`, Yomitan's
  endings after the pre-final endings (the chain set below), noun + particle
  words with their prefixes, and Tatoeba words (the last two count only false
  candidates, since rules do not reach nouns). It leaves out, in this order:
  - 403 copies (377 distinct rules): Yomitan rules that equal an own rule
    (type, affixes and input conditions) except that the own rule constrains
    the stem (`stemEndsWith`) and they constrain nothing, where the own rule
    also gives every output condition they give. All a copy adds is readings
    at stems the own rules refuse: Yomitan's ㅡ-dropping after any stem
    (바라요 → 바르다, 자러 → 자르다, 바라야 → 바르다), its ㅗ/ㅜ contractions after
    any stem (바랐자 → 발다, 바라야지 → 발다), -(으)라's ㄹㅏ → 다 after ㄹ (몰라 →
    몰다), -(으)시 without the own stem checks (들으시고 → 들다, which is 듣다),
    -았/었's ㅐㅆ → ㅣ다 after any stem (그랬어요 → 그리다), and -(으)-
    alternations without a vowel or consonant check. `sources/final-rules.mjs`
    finds them by that test, and one line of `sources/removed-rules.tsv` says
    to. They go first and together; had that lowered recall on any set,
    `select-rules.mjs` would stop and name the rows, so that the own rules are
    fixed (it did for 마십시오 → 마시다). 8 of Yomitan's 64 ㅡ-dropping rules
    remain, in `-아/어지다` and `-아/어지이다`, where no own rule has the same
    input conditions (the own `-아/어지다` takes adjectives only);
  - 383 rules that recover no row (every row they help has another path) but
    add false candidates, 1,537 in all, listed with their numbers in
    `sources/removed-rules.tsv` (transform id, the rule's affixes and
    conditions, what it recovers, the false candidates it adds, the negatives
    it breaks): 11 of the 33 bare-stem rules of `어간` (우리 → 우리다, 감 → 감다),
    `-(으)리` after a noun (메리 → 메다), the plain-stem rules of -기로, -고는 and
    -건만, which read a noun with 로, 는 or 만 as a verb (감기로 → 감다, 사고는 →
    사다, 물건만 → 물다; negatives in the cases), -건's (이건 → 이다), -(으)ㄹ라's
    (몰라 → 모다), -(으)려's after a vowel (걸려 → 걸다 beside 걸리다), those of
    archaic endings such as -(으)마 and -(으)ㅁ도 (주마다 → 주다, 섬도 → 서다), and
    others;
  - 2 rules on the paths of negatives that several rules break together:
    `-아/어다`'s ㅏㄷㅏ → ㅡ다 and ㅓㄷㅏ → ㅡ다 (나라다 → 나르다, 이러다 → 이르다), which
    no own rule copies (the own rules have no -아/어다);
  - 5 of the 11 rules that give a false candidate in as few steps as the
    lemma, so the two tie in a lookup, where the own rules alone rank the
    lemma first (`-(으)셔요`'s ㅅㅕㅇㅛ → 다 reads 마셔요 as 마다 in one step, as
    many as 마시다 takes, and the union ranks 마다 first). Each is removed only
    if the number of valid rows whose lemma a lookup ranks first goes up,
    counted with kty-ko-en without its form-of rows over UniMorph, the cases,
    Yomitan's test, the chain set and the Tatoeba words once per occurrence:
    249,871 for the union, 251,899 after the steps above, 251,913 for the
    final set. The other 6 are kept. So is `-(으)세요`'s ㅅㅔㅇㅛ → ㄹ다:
    removing it, as an earlier version of the script did, lowers the count
    and makes 마세요 rank 마다 before 말다 (a cases row pins it).
  A removal is undone for any rule whose absence lowers recall on UniMorph,
  the cases, Yomitan's test or the chain set. Yomitan's endings after a plain
  stem (the plain set below) keep their rules through rows of
  `tests/cases.tsv` for the endings a learner meets (가곤, 하곤 했다, 하고자,
  하듯이, 하되, 가는가, 먹더라도, 보고도, 가다가는, 오려나, 가니깐, 간다더라, ...).
  The plain set itself is measured but does not guard the removals. As a
  guard it keeps every ending's rules, and they misread common words. With
  it, -(으)마, -(으)ㅁ도 and other archaic endings put a verb first for 113
  more noun + particle words (주마다 → 주다, 섬도 → 서다). With those endings
  left out of the guard by name, the first entry still changed at 568 of
  Tatoeba's word positions against the previous final set, most of them for
  the worse: through -(으)리 at 347 (메리 (Mary) → 메다), -건 at 86 (이건 → 이다)
  and -(으)ㄹ라 at 43 (몰라 → 모다).

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
give different traces for the same lemma, and the cases' `rule` column is
`*` where it names `particle`, `n` or `pron`, conditions Yomitan's file does
not define (else `eval-language` refuses the file for Yomitan's rules).
`hoshidicts-cli eval-language ko
<file> --transforms <rules> --dictionary <kty-ko-en>`; recall over valid
rows, negatives over `valid = 0` rows, false candidates per valid row, first
rank of a whole-source lookup:

| Set (rows) | Rules | Recall | Negatives | False cand. | First | First, entries |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `tests/corpus.tsv` (1,314) | own | 100.00% | | 0.0472 | 2.36% | 97.95% |
| | Yomitan | 95.74% | | 0.0426 | 2.36% | 97.56% |
| | union | 100.00% | | 0.0533 | 2.36% | 98.02% |
| | **final** | **100.00%** | | **0.0472** | 2.36% | 98.02% |
| UniMorph, every V/ADJ pair (191,146) | own | 99.996% | | 0.0304 | 1.81% | 98.64% |
| | Yomitan | 93.149% | | 0.0206 | 1.80% | 97.75% |
| | union | 99.996% | | 0.0356 | 1.81% | 98.48% |
| | **final** | **99.996%** | | **0.0304** | 1.81% | 98.64% |
| Yomitan endings after -았/었-, -겠-, -(으)시-, -더- (16,839) | own | 19.00% | | 0.0559 | 73.79% | 86.41% |
| | Yomitan | 100.00% | | 0.3845 | 79.12% | 81.91% |
| | union | 100.00% | | 0.4027 | 78.90% | 81.92% |
| | **final** | **100.00%** | | **0.2785** | 85.92% | 88.48% |
| Yomitan endings after plain stems (5,590) | own | 23.47% | | 0.0175 | 29.84% | 60.32% |
| | Yomitan | 100.00% | | 0.0490 | 90.09% | 96.44% |
| | union | 100.00% | | 0.0510 | 89.98% | 96.33% |
| | **final** | **56.62%** | | **0.0361** | 62.50% | 80.41% |
| `tests/cases.tsv` (273; 69 negatives) | own | 79.12% | 100.00% | 0.2088 | 34.43% | 74.36% |
| | Yomitan | 83.52% | 33.33% | 0.2930 | 41.76% | 73.63% |
| | union | 100.00% | 33.33% | 0.3114 | 46.52% | 79.49% |
| | **final** | **100.00%** | **100.00%** | **0.2234** | 48.35% | 84.62% |
| Yomitan's test (608; 8 negatives) | own | 98.03% | 87.50% | 0.1480 | 27.30% | 87.66% |
| | Yomitan | 100.00% | 100.00% | 0.1957 | 28.95% | 88.98% |
| | union | 100.00% | 87.50% | 0.2007 | 28.78% | 88.98% |
| | **final** | **100.00%** | 87.50% | **0.1480** | 29.28% | 89.97% |
| Tatoeba words with one lemma (12,852) | own | | | 0.0423 | 69.20% | 98.26% |
| | Yomitan | | | 0.0643 | 68.46% | 97.12% |
| | union | | | 0.0744 | 68.43% | 97.16% |
| | **final** | | | **0.0425** | 69.21% | 98.24% |
| The same, once per occurrence (48,983) | own | | | 0.1428 | 71.60% | 97.43% |
| | Yomitan | | | 0.1901 | 70.87% | 94.92% |
| | union | | | 0.2398 | 70.85% | 96.11% |
| | **final** | | | **0.1428** | 71.67% | 97.36% |
| Noun + particle words (75,000) | own | | | 0.0035 | 99.07% | 99.08% |
| | Yomitan | | | 0.0078 | 98.64% | 98.66% |
| | union | | | 0.0080 | 98.63% | 98.64% |
| | **final** | | | **0.0039** | 99.05% | 99.06% |

- **Final recall: 100.00%** on `tests/corpus.tsv` and `tests/gaps.tsv`
  together (1,314 of 1,314 valid rows; `gaps.tsv` holds one negative), and
  99.996% (191,139 of 191,146) on every V/ADJ pair of UniMorph kor.
- The chain set: for every Yomitan rule that removes an ending and leaves a
  bare stem marked `p`, `f`, `eusi` or `do`, a few verbs and adjectives in
  that stem form (먹었, 됐, 그랬, 가셨; 먹겠; 받으시; 먹더) followed by the ending,
  where the result is whole syllables (먹었으나 → 먹다, 됐건만 → 되다, 받았더라도 →
  받다). Yomitan reaches them through a chain of two or three of its rules.
- The plain set: for every Yomitan rule that turns an ending beginning with a
  consonant into 다 with no stem change, 18 verbs and adjectives of the stem
  classes the ending takes (vowel stems such as 가다 and 기다리다, consonant
  stems such as 먹다 and 좋다, ㄹ stems such as 살다 and 길다; -(으)- and -아/어
  variants and ㄹ dropping before ㄴ, ㅂ and ㅅ taken into account) followed by
  the ending (가곤 → 가다, 먹으려 → 먹다, 알더라도 → 알다), without -기로, -고는 and
  -건만. The final set reaches 56.6%: the endings the cases name and those
  whose rules add no false candidate. The rest are Yomitan's other endings,
  most of them literary, archaic or colloquial (-거늘, -((느)ㄴ)다오, -드니,
  -더뇨), and -(으)려 after a vowel stem. The rule set of the first audited
  head, fd4ace5, reached 86.9% of it.
- The Tatoeba set: every Hangul word of the sentences whose lemma is
  unambiguous, as an entry of kty-ko-en, a UniMorph form with one lemma or a
  noun followed by a particle. The noun set: 3,000 nouns, pronouns and names
  of kty-ko-en with 25 particles and copula forms (학교 + 에서), drawn with
  seed 1. Rules do not reach nouns, so recall is not given for these sets.
- Trace quality, on the 98,718 finite forms of UniMorph: the trace a lookup
  keeps for the lemma has a past step exactly when the tags say PST, -겠
  exactly when they say FUT, and -(으)시- exactly when they say ELEV, for
  99.90% of the forms whose lemma the rules reach (own 98,712 forms, 99.90%;
  Yomitan 95,993, 99.91%; final 98,712, 99.90%). The other 0.10% are rows
  whose tags do not fit the form (계시겠다 tagged as an imperative).
- `language-conformance-test`: corpus.tsv 1,314 / 1,314, cases.tsv 342 /
  342, yomitan.tsv 615 / 615, text.tsv 16 / 16, lookup.tsv 26 / 26, gaps.tsv
  0 / 1 (reported); classes.json agrees with the engine (7 classes, 685
  fields, no steps); 474 of the 3,146 rules are exercised by a passing row.
  `tests/` and `sources/` hold 993,987 bytes.
- `tools/check-yomitan.mjs`, with Yomitan d3c54c1's `ext/lib/hangul-js.js`
  built by `tools/yomitan-libs/` (hangul-js 0.2.6, esbuild 0.25.1; sha256
  `90190300…9f62`): 13,686 inputs, 117,037 Yomitan results, 13,659 listed
  differences (all the `-로라` defect), 0 unexplained; processors
  `disassembleHangul` and `reassembleHangul` 2,244 inputs each, 0
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
  first result for 17,101 of them (25.2%), and an entry is second for 17,027.
- **Hachidori in Chrome** (`test/chrome-language-pack.mjs` on hachidori
  feat/multi-language 1bd53232 with this branch in `third_party/hoshidicts`,
  Chrome 152, kty-ko-en, the cases of `sources/chrome-cases.tsv`): 14 of 14
  checks pass in about 10 s; kty-ko-en imports in 1-2 s; the ten words,
  such as 학교에서 → 학교 (matched 학교) and 따뜻해졌어요 → 따뜻하다 (-아/어요,
  past, -아/어지다), are ones whose first result is the lemma today.
- **Lookup speed**, native `benchmark-lookup --languages languages --language
  ko --term kty-ko-en`, the 64 texts of `sources/benchmark-words.txt` (each
  from an inflected word to the end of its sentence), 6 passes with the
  first dropped, three runs, machine load 12-15 on 64 cores: final p50
  71 µs, p95 177-180 µs; own p50 59 µs, p95 136 µs; Yomitan p50 77 µs, p95
  214-217 µs; union p50 103-104 µs, p95 286-293 µs (budget 1 ms p50). The
  69,969 Tatoeba word positions (to the end of the sentence, at most 200
  code points): final p50 87 µs, p95 166 µs, p99 195 µs.
- **WebAssembly** (Hachidori 1bd53232's prebuilt engines, Node 22.23.1,
  machine load 12, kty-ko-en): `hdw_lookup` on the 64 texts p50 0.292 ms,
  p95 0.647 ms (single-thread), p50 0.300 ms, p95 0.671 ms (threaded).
  `hdw_language_load` of the pack: median 12.4 ms (single-thread) and 12.5 ms
  (threaded) over 10 fresh engines; live heap +830,472 bytes after the load
  (`hdw_memory_stats`). Natively `LanguageRegistry::add` takes 4.4 ms (median
  of 50) and keeps 1,316,160 bytes of heap. Budgets 50 ms and 20 MB. The pack
  has no `pattern` rule.

## Known gaps

- **Form-of rows first.** As above, kty-ko-en's form-of rows match inflected
  words before the rules' lemmas, and Hachidori shows them as cards without
  definitions. A framework change that follows them as Yomitan does is under
  way; when it merges, this pack sets `lookup.formOf` to `"follow"`.
- **Ties.** A lookup orders readings of equal trace length arbitrarily, and
  kty-ko-en has no frequencies. 갑니다, 갈게 and 갈까요 give 갈다 before 가다, and
  줄게 and 줄래 줄다 before 주다. 사세요 gives 살다 before 사다 with both
  dictionaries. Keeping `-(으)세요`'s ㅅㅔㅇㅛ → ㄹ다 gives 마세요 its 말다 in one
  step, and 주세요 its 줄다 too: with kty-ko-en as published the first entry
  after the form-of row is 마다 for 마세요 and 주다 for 주세요; without form-of
  rows it is 말다 and 줄다. Both readings are Korean, and both are listed.
- **Pronouns with a particle.** With kty-ko-en as published the pronoun is
  the first entry for all 47 words of the `particle` rules. Without form-of
  rows three tie with a verb and rank it first: 우리는 → 우리다 (-는), 나를 →
  나르다 (-(으)ㄹ), 나와 → 나오다 (-아/어). 이를 (= 이것을), which is not in the
  list, gives 이르다 [-(으)ㄹ] first with both dictionaries.
- **Endings after a plain stem.** -기로, -고는 and -건만 are not read after a
  plain stem: their rules read a noun with 로, 는 or 만 as a verb. So 가기로
  했다 finds 가다 only at 가기 (-기), and 가건만 not at all. Nor is -(으)려 after
  a vowel stem (가려 한다 finds 가리다 [-아/어] at 가려, and 가다 only at 가): that
  rule also reads 걸려, 내려 (걸리다, 내리다) as 걸다, 내다. Yomitan's literary and
  archaic endings whose rules add false candidates are not read either (the
  plain set above).
- **Nouns are not deinflected.** Particles are reached by shortening the
  scan, so a result shows the noun without the particle's meaning. 714 of the
  75,000 noun + particle words (0.95%) rank another word first: for 284 a
  form-of row covers more of the text (사냥한테: 사냥한, a form of 사냥하다), for
  191 another entry does (벌이에요: 벌이), and for 239 a rule reads noun and
  particle as a verb form (벌까지: 벌까 → 벌다 by -(으)ㄹ까). Some of these
  readings are right: the generated 포 + 도 is the word 포도 (grape), and 접어도 is
  접다 + -어도.
- **Irregular stems without a lexicon.** The ㄷ-, ㅂ- and ㅅ-irregular rules
  also apply to regular stems that look the same (달아요 → 닫다 beside 달다,
  굴을 → 굳다 beside 굴), and the 르-irregular rule to 러-irregular adjectives
  (놀라다가 → 노르다 beside 놀라다), as rules without a list of irregular verbs
  must.
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
