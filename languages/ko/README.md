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
    the 르 stems that do drop ㅡ (따르다, 치르다, 들르다, 우러르다, 다다르다), and
    vowel harmony in the 르 rules (라 after ㅏ or ㅗ, 러 after the other vowels,
    so 살러 and 놀러 are not 사르다 and 노르다);
  - the conditions `particle` (how kty-ko-en tags the copula 이다) and `ida`
    (Yomitan's), and Yomitan's `p`, `f` and `eusi`: the own -았/었-, -았/었었-,
    -겠- and -(으)시- rules also take the bare stem one of Yomitan's endings
    leaves (먹었으나 → 먹었, marked `p`), under the own stem constraints;
  - endings: -아/어다가, -아/어야만, -았/었자 and -(으)되 (Yomitan has them;
    the own -(으)되 checks the stem, so 안되 is not 안다), -(으)려 하다 (neither
    rule set had it: 가려 했다, with 하다 deinflected first as Yomitan's -곤 하다
    is), and -아/어야겠- before one of Yomitan's endings (`f`); the
    contractions 마, 마요, 마라 (말다) and 건, 걸, 게 (것); and the commonest
    personal pronouns with a particle;
  - no constraint that Hangul text cannot tell apart: a `stemMinLength`
    beside a `stemEndsWith` (a stem that ends in a class is not empty, and
    holds a whole syllable), and the vowel check of the ㄷ- and ㅅ-irregular
    and ㄹ-dropping rules after -(으)-. The own rules give the same text and
    conditions for 331,848 words without them.
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
  two files without the Yomitan rules that copy an own rule and those listed
  in `sources/removed-rules.tsv`, which `sources/select-rules.mjs` chooses
  (Rule provenance).
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
  `sources/relax-yomitan-tests.mjs`: 45 valid rows whose lemma the final rules
  reach with another trace (갔다 is `-았/었` in one step, where Yomitan takes
  `-다` and `-았/었`) have `reasons` `*` and the category suffix "(any trace)";
  the one row the final rules fail is in `tests/gaps.tsv`.
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`, `tests/dictionary/`,
  `sources/benchmark-words.txt`, `sources/real-use.tsv`,
  `sources/chrome-cases.tsv` and `sources/measure.mjs`: written for
  hoshidicts (GPL-3.0-or-later). The last rows of `tests/cases.tsv` fail when
  a stem constraint or word-list group of the own rules is taken out; some of
  their sources are built forms, not words (가습니다, 삷시오). The
  tiny dictionary's 33 entries are written for it, tagged as kty-ko-en tags
  them; one is spelled in jamo (ㅁㅓㄱㄷㅏ), so a lookup that kept the
  unjoined form would find it.
- Measurement data, not committed:
  - kty-ko-en (below) and UniMorph kor;
  - the 15,947 Korean sentences of [Tatoeba](https://tatoeba.org/)
    (`kor_sentences.tsv.bz2` downloaded 2026-11-02, sha256 `2c06d3d3…c51e`,
    CC BY 2.0 FR);
  - the frequency list `ko_50k.txt` of
    [FrequencyWords](https://github.com/hermitdave/FrequencyWords) at 525f9b5
    (OpenSubtitles 2018; sha256 `8d00401b…d99d`; content CC BY-SA 4.0);
  - prose of 현진건 (1900-1943, public domain) from
    [ko.wikisource](https://ko.wikisource.org/wiki/저자:현진건): the 24 of his
    pages that pass a screen for repeated lines (vandalism), hanja and old
    jamo, fetched 2026-11-03 at their current revisions, 61,688 words (sha256
    of the joined text `da2badfe…54d6`). The largest is 첫날밤, his 1925
    translation of Turgenev.

## Rule provenance

`transforms.json` has 460 transforms and 3,029 rules (2,934 `suffix`, 95
`wholeWord`, no `pattern`):

| Source | Transforms | Rules |
| --- | ---: | ---: |
| `own` | 23 | 1,260 |
| `yomitan` | 367 | 1,769 |
| `both` | 70 | 0 |

- A `both` transform has an id both files use (the same ending, written
  twice): its rules are Yomitan's and ours, each marked. No rule is `both`
  in `tools/merge-transforms.mjs`'s sense of two equal rules: the own rules
  constrain the stem and use their own pre-final conditions (`-겠`, `-었`,
  `-시`, and for Yomitan's stems `f`, `p`, `eusi`), and a Yomitan rule equal
  to an own rule but for that is left out (below).
- Own transforms Yomitan lacks: `-나요`, `-잖아`, `-더라`, `-고요`, `-니까요`,
  `-어서요`, `-(으)려 하다`, `-어하다`, `-이에요`, `-이라`, the pronouns contracted
  with a particle (`topic` 난 → 나, 이건 → 이것, 건 → 것; `object` 날 → 나, 걸 →
  것; `subject` 내가 → 나, 이게 → 이것, 게 → 것; `possessive` 내 → 나) and the
  pronouns with a particle (`particle`: 나는 → 나, 그의 → 그, 우리를 → 우리; the
  47 such words of 14 pronouns and 10 particles that occur at least ten
  times in the Tatoeba sentences below). `-(으)ㅂ시오`, `-(으)ㅂ시다`, `-(으)시`,
  `-거라`, `-(으)ㄹ게`, `-고`, `-지만` and `-자고` are own-only in the final set
  because all of Yomitan's rules in them were left out (below).
- Not ported: the `-로라` rule `suffixInflection('', '다', [], ['ida'])`,
  which turns every text into 다 because `slice(0, -0)` is empty
  (`docs/languages.md` 8.3; `sources/yomitan-differences.tsv`).
- Left out of the final set: 912 of Yomitan's 2,681 rules (33 rules appear
  twice in their transform; leaving one out leaves out both).
  `sources/select-rules.mjs` measures the union with `hoshidicts-cli
  eval-language --per-rule` against kty-ko-en as published (form-of
  references followed), on every V/ADJ pair of UniMorph kor,
  `tests/cases.tsv`, `tests/yomitan.tsv`, Yomitan's endings after the
  pre-final endings (the chain set below), noun + particle words with their
  prefixes, and Tatoeba words (the last two count only false candidates,
  since rules do not reach nouns). It leaves out, in this order:
  - 571 copies (545 distinct rules): Yomitan rules that constrain nothing and
    equal an own rule (type, affixes and input conditions) that gives every
    output condition they give. All a copy adds is readings at stems the own
    rule refuses: Yomitan's ㅡ-dropping after any stem (바라요 → 바르다, 자러 →
    자르다, 바라야 → 바르다), its ㅗ/ㅜ contractions after any stem (바랐자 → 발다,
    바라야지 → 발다), -(으)라's ㄹㅏ → 다 after ㄹ (몰라 → 몰다), -(으)시 without the
    own stem checks (들으시고 → 들다, which is 듣다), -았/었's ㅐㅆ → ㅣ다 after any
    stem (그랬어요 → 그리다), endings read with an empty stem (어요 → 다), and
    -(으)- alternations without a vowel or consonant check.
    `sources/final-rules.mjs` finds them by that test, and one line of
    `sources/removed-rules.tsv` says to. They go first and together; had
    that lowered recall on any set, `select-rules.mjs` would stop and name
    the rows, so that the own rules are fixed (it did for 마십시오 → 마시다).
    8 of Yomitan's 64 ㅡ-dropping rules remain, in `-아/어지다` and `-아/어지이다`,
    where no own rule has the same input conditions (the own `-아/어지다` takes
    adjectives only);
  - 335 rules that recover no row (every row they help has another path) but
    add false candidates, 1,171 in all, listed in `sources/removed-rules.tsv`
    (transform id, the rule's affixes and conditions, the false candidates it
    adds, and a note on the negative it breaks or the tie it makes): 11 of the
    33 bare-stem rules of `어간` (우리 → 우리다, 감 → 감다), `-(으)리` after a noun
    (메리 → 메다), the plain-stem rules of -기로, -고는 and -건만, which read a noun
    with 로, 는 or 만 as a verb (감기로 → 감다, 사고는 → 사다, 물건만 → 물다;
    negatives in the cases), -건's (이건 → 이다), -(으)ㄹ라's (몰라 → 모다),
    -(으)려's after a vowel (걸려 → 걸다 beside 걸리다), those of archaic endings
    such as -(으)마 and -(으)ㅁ도 (주마다 → 주다, 섬도 → 서다), and others;
  - 2 rules on the paths of negatives that several rules break together:
    `-아/어다`'s ㅏㄷㅏ → ㅡ다 and ㅓㄷㅏ → ㅡ다 (나라다 → 나르다, 이러다 → 이르다), which
    no own rule copies (the own rules have no -아/어다);
  - 2 of the 11 rules that give a false candidate in as few steps as the
    lemma, so the two tie in a lookup, where the own rules alone rank the
    lemma first: `-(으)셔요`'s ㅅㅕㅇㅛ → 다 and → ㄹ다. They read 시장하셔요 as
    시장하다 and 자셔요 as 잘다 in one step, as many as UniMorph's lemmas 시장하시다
    and 자시다 take (-아/어요). Each is removed only if
    the number of valid rows whose lemma a lookup ranks first goes up,
    counted with kty-ko-en as published over UniMorph, the cases, Yomitan's
    test, the chain set and the Tatoeba words once per occurrence: 250,054
    for the union, 251,530 after the steps above, 251,539 for the final set.
    The other 9 are kept. So is `-(으)세요`'s ㅅㅔㅇㅛ → ㄹ다: removing it, as an
    earlier version of the script did, lowers the count and makes 마세요 rank
    마다 before 말다 (a cases row pins it).

  A removal is undone for any rule whose absence lowers recall on UniMorph,
  the cases, Yomitan's test or the chain set. Yomitan's endings after a plain
  stem (the plain set below) keep their rules through rows of
  `tests/cases.tsv` for the endings a learner meets (가곤, 하곤 했다, 하고자,
  하듯이, 하되, 가는가, 먹더라도, 보고도, 가다가는, 오려나, 가니깐, 간다더라, 주거니,
  치리만큼, ...). The plain set itself is measured but does not guard the
  removals: as a guard it keeps every ending's rules, and they misread
  common words. With it, -(으)마, -(으)ㅁ도 and other archaic endings put a verb
  first for 113 more noun + particle words (주마다 → 주다, 섬도 → 서다). With
  those endings left out of the guard by name, the first entry still
  changed at 568 of Tatoeba's word positions against the previous final
  set, most of them for the worse: through -(으)리 at 347 (메리 (Mary) →
  메다), -건 at 86 (이건 → 이다) and -(으)ㄹ라 at 43 (몰라 → 모다).

## Measurements

Dictionary: **kty-ko-en**, [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan)
release [v2025-04-08-10-54-36-00-00](https://github.com/yomidevs/wiktionary-to-yomitan/releases/download/v2025-04-08-10-54-36-00-00/kty-ko-en.zip)
(index revision 2025.04.08; 7,953,946 bytes, sha256 `6a075a3c…8fa1c`),
derived from English Wiktionary through kaikki.org, CC BY-SA; imported with
`hoshidicts-cli import` (372,368 terms). Every number is measured with it as
published. 336,337 of its rows are form-of rows (a glossary of only `[lemma,
[inflection]]` references) and 36,031 are entries. The pack follows the
references (`lookup.formOf: "follow"`, `docs/languages.md` 9.10): 봤어요 gives
보다 with the trace step `informal past indicative polite`, and a row that is
only references is never a result.

The sets are the ones `node languages/ko/sources/select-rules.mjs ...
--write-sets <dir>` writes, except `tests/corpus.tsv` and Yomitan's test,
which is its 616 rows as `tools/port-yomitan-tests.mjs` writes them (the 615
of `tests/yomitan.tsv` and the one of `tests/gaps.tsv`). Valid rows of the
cases and of Yomitan's test have `reasons` `*`, since own and Yomitan rules
give different traces for the same lemma, and the cases' `rule` column is
`*` where it names `particle`, `n`, `pron` or `-시`, conditions Yomitan's file
does not define (else `eval-language` refuses the file for Yomitan's rules).
`hoshidicts-cli eval-language ko <file> --transforms <rules> --dictionary
<kty-ko-en>`; recall over valid rows, negatives over `valid = 0` rows, false
candidates per valid row, first rank of a whole-source lookup. The pack has
no optional processor, transform or variant pass, so with the options line
`# options: default` (section 12.2) every number is the same (checked on
`tests/cases.tsv`):

| Set (rows) | Rules | Recall | Negatives | False cand. | First |
| --- | --- | ---: | ---: | ---: | ---: |
| `tests/corpus.tsv` (1,314) | own | 100.00% |  | 0.0518 | 98.40% |
|  | Yomitan | 95.74% |  | 0.0487 | 98.55% |
|  | union | 100.00% |  | 0.0578 | 98.55% |
|  | **final** | **100.00%** |  | **0.0518** | 98.40% |
| UniMorph, every V/ADJ pair (191,146) | own | 99.996% |  | 0.0341 | 98.82% |
|  | Yomitan | 93.149% |  | 0.0257 | 98.81% |
|  | union | 99.996% |  | 0.0393 | 98.82% |
|  | **final** | **99.996%** |  | **0.0342** | 98.79% |
| Yomitan endings after -았/었-, -겠-, -(으)시-, -더- (16,839) | own | 19.26% |  | 0.0568 | 84.87% |
|  | Yomitan | 100.00% |  | 0.3851 | 78.98% |
|  | union | 100.00% |  | 0.4029 | 79.17% |
|  | **final** | **100.00%** |  | **0.2789** | 85.96% |
| Yomitan endings after plain stems (5,590) | own | 23.79% |  | 0.0216 | 61.22% |
|  | Yomitan | 100.00% |  | 0.0538 | 98.34% |
|  | union | 100.00% |  | 0.0555 | 98.32% |
|  | **final** | **57.73%** |  | **0.0406** | 81.13% |
| `tests/cases.tsv` (293; 114 negatives) | own | 78.84% | 100.00% | 0.2491 | 75.09% |
|  | Yomitan | 80.55% | 25.44% | 0.3276 | 80.55% |
|  | union | 100.00% | 25.44% | 0.3447 | 83.96% |
|  | **final** | **100.00%** | **100.00%** | **0.2628** | 84.30% |
| Yomitan's test (608; 8 negatives) | own | 98.03% | 87.50% | 0.2928 | 88.65% |
|  | Yomitan | 100.00% | 100.00% | 0.3405 | 90.13% |
|  | union | 100.00% | 87.50% | 0.3454 | 90.30% |
|  | **final** | **100.00%** | **87.50%** | **0.2928** | 90.63% |
| Tatoeba words with one lemma (12,852) | own |  |  | 0.0895 | 98.48% |
|  | Yomitan |  |  | 0.1126 | 97.60% |
|  | union |  |  | 0.1218 | 97.63% |
|  | **final** |  |  | **0.0898** | 98.39% |
| The same, once per occurrence (48,983) | own |  |  | 0.4935 | 96.93% |
|  | Yomitan |  |  | 0.5490 | 96.01% |
|  | union |  |  | 0.5906 | 96.02% |
|  | **final** |  |  | **0.4936** | 96.83% |
| Noun + particle words (75,000) | own |  |  | 0.0036 | 99.08% |
|  | Yomitan |  |  | 0.0079 | 98.65% |
|  | union |  |  | 0.0081 | 98.64% |
|  | **final** |  |  | **0.0040** | 99.06% |

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
  -건만. The final set reaches 57.7%: the endings the cases name and those
  whose rules add no false candidate. The rest are Yomitan's other endings,
  literary, archaic or colloquial (-거늘, -((느)ㄴ)다오, -드니, -더뇨, Known
  gaps), and the bare -(으)려 after a vowel stem. The rule set of the first
  audited head, fd4ace5, reached 86.9% of it.
- The Tatoeba set: every Hangul word of the sentences whose lemma is
  unambiguous, as an entry of kty-ko-en, a UniMorph form with one lemma or a
  noun followed by a particle. The noun set: 3,000 nouns, pronouns and names
  of kty-ko-en with 25 particles and copula forms (학교 + 에서), drawn with
  seed 1. Rules do not reach nouns, so recall is not given for these sets.

The lookups below (`sources/measure.mjs`; `languages/en/sources/lookup-batch.cpp`
built as its header says) look the text up as a host's hover does: from the
word to the end of its sentence, 16 results, scan length 16, default
options. The first result with a definition is judged against the lemmas
the word's own kty-ko-en form-of references name with an inflection among
their rules (not only `hangeul`, `hanja`, `eumhun` or a romanization): right
when it is one of them, the word's own entry when it is the word itself, a
phrase entry when it is an entry of several words that begins with the word
(캐나다 사람, 안 돼요, 어쩔 수 없다 for 어쩔 수 없었지), wrong otherwise.

- **Frequent forms** (`measure.mjs frequent`): of the 10,000 most frequent
  words of `ko_50k.txt` (4,271,725 tokens), a rule reaches a lemma of 2,625,
  36.31% of the tokens (lemmas from their form-of references and UniMorph).
  For 2,331 (20.49% of the tokens) the first result is that lemma, for 289
  (15.81%) the word's own entry (그래, 하지만, 다른), and for 1 another word:
  드립니다 → 드립 (kty-ko-en has 드리다 only as a form-of target, Known gaps).
  For 4 forms of 드리다 there is no result with a definition.
- **The forms behind pronouns and 안/못** (`measure.mjs positions`): Korean has
  no articles, clitics or auxiliaries in front of a verb, so the words that
  can stand there are the pronouns (with or without a particle) and the
  negators 안 and 못. Of Tatoeba's 69,969 word positions, 7,152 follow one of
  them; at the 1,952 whose references name a lemma the first result is right
  for 1,382, the word's own entry for 566 and wrong for 4 (0.20%, all
  `eumhun`, below). No rule changes the word in front: of 6,000 phrases of
  10 pronouns and negators with the 600 most frequent words of `ko_50k.txt`
  (나는 몰라, 안 먹었어요), every deinflection keeps the front word as written,
  and rows of `tests/lookup.tsv` check both lookups (안 자러 가요 → 안, 자러 안
  가요 → 자다). A lookup from the pronoun or negator itself (7,178) reads past
  it 15 times: kty-ko-en's entries 안 돼요 (10), 제2차 세계 대전 (3) and 저는
  한국 사람이에요 (1), and its `eumhun` row 날 비 → 비 for 날 비웃지마 (1).
- **Real text** (`measure.mjs positions`, `measure.mjs text`):
  - Tatoeba, 69,969 positions: 67,853 find something; at the 23,556 whose
    references name a lemma the first result is right for 16,141, the
    word's own entry for 7,339, a phrase entry for 29 and wrong for 39
    (0.17%). 37 of the 39 are kty-ko-en's `eumhun` rows (줄 수, 갈 거, 받을 수,
    한 일), which a lookup follows to a syllable (Known gaps); the others are
    드립니다 and 나을 거야 → 나다.
  - 현진건's prose (61,688 positions): 61,159 find something; at the 16,094
    whose references name a lemma the first result is right for 11,575, the
    word's own entry for 4,463, a phrase entry for 12 and wrong for 38
    (0.24%): `eumhun` rows 26 (한 일 14), the dialect spelling 맨들고/맨든 of
    만들다 6, and `-(으)려 하다` read at a word in -려 6. Five of those six are
    right and the judge is wrong: 알려 한다, 울려 하여도, 들려 할, 끌려 하였다 and
    걸려 하던 (전화를) are 알다, 울다, 들다, 끌다 and 걸다 + -(으)려 하다, while the
    word's references name the passives 알리다, 울리다, 들리다, 끌리다 and 걸리다.
    The sixth, 벌려 하품을 → 벌다, is 벌리다 + -어 (Known gaps).
  - Of the 45,071 positions of the prose that find something but have no
    form-of reference to judge by, a seeded sample of 60 judged by hand
    (`reports/hachi-lang-ko/measure/text-sample-judged.tsv` outside the
    pack): 45 right, 9 words kty-ko-en lacks (비위, 그편, 집무, 첫날밤, 여지없다,
    the old spellings 정갱이 and 아츰), 3 homograph entries (이원 for 이 원 "two
    won", 일이 for 일 + 이 twice), 2 the name 한경, and 1 wrong: 진토록 → 진, the
    old -토록 (진(盡)하다 + -도록), which no rule set reads. A first draw of the
    sample found 주거니 (-거니) and 치리만큼 (-(으)리만큼) unread; rows of
    `tests/cases.tsv` now keep them, and both are right in this draw.
  - Read across a space, as section 14 asks to count: of Tatoeba's first
    results, 301 through Yomitan's spaced endings (않을 거야 → 않다, 있을 것이다 →
    있다), 31 a phrase entry deinflected on its last word (마음에 들어 → 마음에
    들다) and 84 through a reference (the `eumhun` rows, 마음에 들었어); none
    another way, so no rule reads a word followed by a short word as another
    word. In the prose: 86, 12, 53 and none.
- Trace quality, on UniMorph's 136,107 finite rows (lemma, form, tags): the
  shortest trace to the lemma, which a lookup shows, has a past step exactly
  when the tags say PST, -겠 exactly when they say FUT, and -(으)시- exactly
  when they say ELEV, for 99.91% of the 135,414 rows the rules reach. The
  rest are rows whose tags do not fit the form (계시겠다 tagged as an
  imperative).
- `language-conformance-test`: corpus.tsv 1,314 / 1,314, cases.tsv 407 /
  407, yomitan.tsv 615 / 615, text.tsv 16 / 16, lookup.tsv 34 / 34, gaps.tsv
  0 / 1 (reported); classes.json agrees with the engine (7 classes, 557
  fields, no steps); 440 of the 3,029 rules are exercised by a passing row.
  `tests/` and `sources/` hold 987,265 bytes. Taking out any of 84 of the 87
  stem constraints, exclusions and word-list groups of
  `sources/own-rules.mjs` fails the test; the other three (`vowelStem:
  false` at -(으)냐, -(으)니 and -(으)냐고) only keep out a rule that `direct()`
  writes with more conditions.
- `tools/check-yomitan.mjs`, with Yomitan d3c54c1's `ext/lib/hangul-js.js`
  built by `tools/yomitan-libs/` (hangul-js 0.2.6, esbuild 0.25.1; sha256
  `90190300…9f62`): 13,768 inputs, 117,201 Yomitan results, 13,741 listed
  differences (all the `-로라` defect), 0 unexplained; processors
  `disassembleHangul` and `reassembleHangul` 2,302 inputs each, 0
  unexplained.
- **Real use**: the 40 inflected words of `sources/real-use.tsv`, each looked
  up from the word to the end of its sentence: the expected lemma is the
  first result with a definition for 36 and among the results for 39. The
  four others: 사세요 → 사다 before 살다 (a tie, below), 난 (kty-ko-en's own
  entry, "topic-marked form of 나"), 무서워해요 → 무서워하다 (UniMorph's lemma is
  무섭다; kty-ko-en has 무서워하다 as a verb of its own), and 드릴게요 → 드릴.
- **Hachidori in Chrome** (`test/chrome-language-pack.mjs` on hachidori
  feat/multi-language 1bd53232 with this branch in `third_party/hoshidicts`
  and its three WebAssembly runtimes rebuilt from it, Chrome 152, kty-ko-en,
  the cases of `sources/chrome-cases.tsv`): 14 of 14 checks pass in 9 s and
  kty-ko-en imports in 0.9 s. Each of the ten words, such as 학교에서 → 학교
  (matched 학교) and 따뜻해졌어요 → 따뜻하다 (-아/어요, past, -아/어지다), shows its
  lemma as the first card, with no card for a form-of row.
- **Lookup speed**, native `benchmark-lookup --languages languages --language
  ko --term kty-ko-en`, the 64 texts of `sources/benchmark-words.txt` (each
  from an inflected word to the end of its sentence), 6 passes with the
  first dropped, three runs, machine load 43-51 on 64 cores: final p50
  84-96 µs, p95 195-208 µs; own p50 77-79 µs, p95 148-152 µs; Yomitan p50
  94-104 µs, p95 227-233 µs; union p50 118-133 µs, p95 295-320 µs (budget
  1 ms p50). The 69,969 Tatoeba word positions (to the end of the sentence,
  at most 200 code points): final p50 100 µs, p95 191 µs, p99 227 µs.
- **WebAssembly** (`measure.mjs wasm`; Node 22.23.1, machine load 43-51,
  kty-ko-en): Hachidori's three runtimes rebuilt from this branch, since
  those vendored at feat/multi-language 1bd53232 predate `lookup.formOf` and
  refuse the pack. `hdw_lookup` on the 64 texts p50 0.347 ms, p95 0.793 ms
  (single-thread), p50 0.348 ms, p95 0.816 ms (threaded).
  `hdw_language_load` of the pack: median 11.4 ms (single-thread) and 11.8 ms
  (threaded) over 10 fresh engines; live heap +786,448 bytes after the load
  (`hdw_memory_stats`). Natively `LanguageRegistry::add` takes 4.2 ms (median
  of 50) and keeps 1,238,512 bytes of heap. Budgets 50 ms and 20 MB. The pack
  has no `pattern` rule.

## Known gaps

- **Hanja labels (`eumhun`).** kty-ko-en writes a hanja's meaning-and-sound
  label as a row whose references name the syllable (`["줄 수", ...,
  [["수", ["eumhun"]], ...]]`; 3,297 rows). A lookup follows it, so the label
  read over two words comes first: 줄 수 있어 → 수, 갈 거야 → 거, 받을 수 → 수,
  한 일 → 일. These are 37 of the 39 wrong first results in Tatoeba and 26 of
  the 38 in the prose (above). The pack cannot choose which references a
  lookup follows; `reports/hachi-lang-questions.md` has a note for the
  framework.
- **Ties.** A lookup orders readings of equal trace length by when it found
  them, and kty-ko-en has no frequencies. With references followed, the
  word's own references come first among equals: 갑니다, 갈게 and 갈까요 give 가다
  before 갈다, 줄게, 줄래 and 주세요 주다 before 줄다. Where the references do not
  decide, the other reading can come first: 사세요 gives 사다 before 살다, 마세요
  마다 before 말다 (`-(으)세요`'s ㅅㅔㅇㅛ → ㄹ다 gives 말다 in one step, and a
  cases row keeps it), 걸 (= 것을, 146 Tatoeba positions) 걸다 [-(으)ㄹ] before 것,
  and 썼다 쓰다 before the dialect verb 써다. 건 gives kty-ko-en's own 건 ("past
  determinative of 걸다") first. Both readings are Korean, and both are listed.
- **Pronouns with a particle.** An entry for the exact word comes first:
  kty-ko-en's 나의 ("a traditional practice in Jeju-do"), 나랑 ("(Yukjin)
  country, nation") and its "topic-marked form of 나" entry for 나는. Three
  tie with a verb, which comes first: 우리는 → 우리다 (-는), 나를 → 나르다 (-(으)ㄹ),
  나와 → 나오다 (-아/어); the pronoun is second. 이를 (= 이것을), which is not in the
  list, gives 이르다 [-(으)ㄹ] first.
- **Endings after a plain stem.** -기로, -고는 and -건만 are not read after a
  plain stem: their rules read a noun with 로, 는 or 만 as a verb. So 가기로
  했다 finds 가다 only at 가기 (-기), and 가건만 not at all. The bare -(으)려 is
  not read after a vowel stem (가려 alone; -(으)려 하다 is), because the rule
  also reads 걸려, 내려 (걸리다, 내리다) as 걸다, 내다; nor are -(으)려는 and
  -(으)려던 (하려는 → 하): such a rule reads 고려 + 는 as 고다. Yomitan's literary,
  archaic and colloquial endings whose rules add false candidates are not
  read either (the plain set above), among them -(으)라니까 (가라니까), -(으)리라
  (하리라), -고야 (먹고야) and -(으)려다가 (죽이려다가); the rules of the first
  three read 나라니까, 자리라 and 사고야 as verbs.
- **Rules kept for the cases that also misread.** 따듯하다 → 따다 [-듯],
  신고는 하셨습니까 → 신다 [-고는 하다], 조리되었다는 → 조리다 [-(으)되], 잘려나가고 →
  잘다 [-(으)려나]; and `-(으)려 하다` reads 벌려 하품을 as 벌다 (it is 벌리다 + -어).
- **Nouns are not deinflected.** Particles are reached by shortening the
  scan, so a result shows the noun without the particle's meaning. 707 of the
  75,000 noun + particle words (0.94%) give another first result with a
  definition: for 191 another entry covers more of the text (벌이에요: 벌이,
  너는: 너는), for 506 a rule reads noun and particle as a verb form (벌까지:
  벌까 → 벌다 by -(으)ㄹ까; 줄기에 → 줄다 by -기에; 다시는 → 달다), and for 10 a
  form-of reference does (메이다 → 메다). Some of these readings are right:
  the generated 접어 + 도 is 접다 + -어도. In Tatoeba, common nouns with 을 give a
  verb first too: 길을 → 긷다, 물을 → 묻다, 집을 → 집다 [-(으)ㄹ].
- **Irregular stems without a lexicon.** The ㄷ-, ㅂ- and ㅅ-irregular rules
  also apply to regular stems that look the same (달아요 → 닫다 before 달다,
  굴을 → 굳다 beside 굴), and the 르-irregular rule to 러-irregular adjectives
  (놀라다가 → 노르다 before 놀라다), as rules without a list of irregular verbs
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
- **Dictionary coverage.** kty-ko-en has 드리다 only as a form-of target, so
  드릴게요 finds 드릴 (drill), 드립니다 finds 드립, and 드리겠습니다, 드리고, 드려요
  and 드려 find no result with a definition: 5 of the 10,000 frequent words.
  The dialect spelling 맨들고, 맨든 (만들다) finds 맨 (6 positions of the prose),
  and the old contraction -토록 (진토록 for 진하도록) is read by no rule set.
- **No hanja view.** Hanja words are looked up as written; kty-ko-en has
  them as form-of rows pointing to the Hangul word. `characterView` is null.
- **Not pinned by a test.** `traceSelection: "shortest"` decides which trace a
  result shows, and the test files compare only lemmas and matched text
  (`docs/languages.md` 12.2), so changing it to `"first"` passes them. Nor
  are three `vowelStem: false` options (above).
