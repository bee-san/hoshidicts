# Vietnamese (`vi`)

Text processors, reduplication rules and scanning settings for Vietnamese.
Vietnamese words do not inflect: a lookup has to undo spelling variation and
reduplication, not conjugation or declension. Lookups start at the hovered
word and try only prefixes that end at a word boundary (`word` / `word` /
`spaces`, docs/languages.md 14.1). Vietnamese writes a space between
syllables, not between words, so a prefix of several syllables is a word
when the dictionary has it (*học sinh*, *Hà Nội*), and the longest one
found comes first. Hyphens separate words, as in the other packs.

- **Processors**, in this order: compose decomposed letters (NFC); `Ð`
  (U+00D0, which mis-encoded text has for `Đ`) to `Đ`; lower case, and the
  first letter alone in lower case (*Tiếng Việt* → *tiếng Việt*); hyphens to
  spaces, with a second variant that capitalises each word after a hyphen
  (*Hồng-bàng* → *Hồng bàng*, *Hồng Bàng*), as older texts write names; the
  tone mark on the glide or on the main vowel of open *oa*, *oe*, *uy*
  (*hòa* / *hoà*, *thủy* / *thuỷ*, never after *qu*), in every syllable;
  Yomitan's `normalizeDiacritics`, which also fixes a misplaced tone
  (*cuả* → *của*); *i* and *y* in a syllable of their own after *h, k, l,
  m, s, t, qu* (*kĩ thuật* / *kỹ thuật*, *Mĩ* / *Mỹ*, *quít* / *quýt*); and
  the first letter in upper case.
- **Rules**: the reduplications whose form a dictionary may not list.
  - `partialReduplication`: 80 adjectives (and a few verbs) said twice, the
    first time with a level tone and a final stop made nasal: *đo đỏ* →
    *đỏ*, *man mát* → *mát*, *sành sạch* → *sạch*, *chầm chậm* → *chậm*.
  - `reduplication`: a two-word expression said twice: *đi đi lại lại* →
    *đi lại*, *lôi tha lôi thôi* → *lôi thôi*, *lề mà lề mề* → *lề mề*.

The pack has no optional processor, transform or setting. Its rules carry no
conditions: Vietnamese has no inflection classes for them to track, every rule
shortens the text so chains end, and the recommended dictionary has no part
of speech in its `rules` column (0 of 76,689 rows; wty-vi-vi 0 of 44,885), so
a rule output with conditions would find nothing in it.

## Sources and licences

- `sources/own.json`, `sources/own-processors.json` and the rules of
  `transforms.json` (all `own`): written for this pack (GPL-3.0-or-later) by
  `sources/build-own.mjs` from the standard description of Vietnamese
  orthography (the 1980s tone-mark and i/y rules and the older spellings
  they replaced) and of reduplication (tone harmony of reduplicated
  adjectives), before Yomitan's Vietnamese file was read.
- `sources/yomitan-processors.json` and the processors `decapitalize`,
  `capitalizeFirstLetter` and `normalizeDiacritics` of `language.json`:
  Yomitan's Vietnamese processors at
  [d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/vi/viet-text-preprocessors.js)
  (`normalizeDiacritics`, written as the framework's `vi.toneMarksOld` and
  `vi.toneMarksNew` builtins) and its `capitalizationPreprocessors`
  (`ext/js/language/text-processors.js`), GPL-3.0-or-later, Copyright (C)
  2024-2026 Yomitan Authors. Yomitan has no Vietnamese transforms and no
  transform test at d3c54c1, so there is no `sources/yomitan.json` and no
  `tests/yomitan.tsv`.
- `tests/text.tsv`, category `yomitan`: the 15 cases of Yomitan's
  [`test/language/viet-text-preprocessors.test.js`](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/viet-text-preprocessors.test.js),
  same licence.
- `tests/corpus.tsv` (607 rows) and `tests/gaps.tsv` (393): 1,000 pairs
  written by `sources/build-corpus.py` from kaikki.org's extract of English
  Wiktionary, Vietnamese entries (downloaded 2026-11-03, sha256
  `186cd0a6…d945`), CC BY-SA 4.0 and GFDL, by the Wiktionary contributors:
  every reduplication pair (185: a sense that is a form of another word
  tagged *reduplication*, or an etymology with the reduplication template
  naming the base) and 815 of the 917 spelling pairs (an alternative form
  with the same letters as its headword once marks, capitals and hyphens are
  set aside and y is read as i), sampled with seed 1. The selection does not
  look at the pack's rules; `sources/split-corpus.py` puts the rows the pack
  reaches in `corpus.tsv` and the others in `gaps.tsv`.
- `tests/cases.tsv`, the other rows of `tests/text.tsv`, `tests/lookup.tsv`,
  `tests/dictionary/`, `sources/benchmark-words.txt`,
  `sources/judgements.tsv` and the scripts in `sources/`: written for this
  pack (GPL-3.0-or-later). `sources/lookup-batch.cpp` is
  `languages/en/sources/lookup-batch.cpp` with each result's processor
  steps added.
- Measured with and not committed (`sources/inputs.tsv` has every URL,
  revision and sha256):
  - the recommended dictionary,
    [wty-vi-en](https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/vi/en/wty-vi-en.zip)
    from [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan),
    revision 2026.10.22 (wty 61eaa08, sha256 `ee0015f2…c910`), CC BY-SA 4.0:
    76,689 rows, 49,374 headwords, 33,353 of the rows form-of references only;
  - wty-vi-vi 2026.10.22 (sha256 `11ecdab6…a136`), checked for its spelling
    conventions only;
  - the frequency list `vi_50k.txt` of
    [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (2018,
    OpenSubtitles; sha256 `3f5b112e…adf3`), content CC BY-SA 4.0;
  - Tatoeba's Vietnamese sentences (`vie_sentences.tsv.bz2`, 33,269
    sentences, downloaded 2026-11-03, sha256 `daa2b5a4…e980`), CC BY 2.0 FR;
  - the public-domain text: Trần Trọng Kim, *Việt Nam sử lược*, Quyển I
    (1920; the author died in 1953), the 25 chapter pages of
    [vi.wikisource.org](https://vi.wikisource.org/wiki/Vi%E1%BB%87t_Nam_s%E1%BB%AD_l%C6%B0%E1%BB%A3c)
    at the revisions `sources/inputs.tsv` lists, 75,308 words. It writes
    compounds with hyphens and capitalises only the first word of a name
    (*Hồng-bàng*, *Đại-Việt sử-ký*), as texts of its time do. Project
    Gutenberg has no Vietnamese book.

## Rule provenance

`transforms.json` has 2 transforms and 151 rules, all `own`; Yomitan has no
Vietnamese rules, so the union of `sources/own.json` and Yomitan's rules
(`tools/merge-transforms.mjs`) is the own file.

- `partialReduplication`: 84 `wholeWord` rules, one per form of the 80
  listed words (a word in ngã gives two: *se sẽ*, *sè sẽ*).
- `reduplication`: 67 `pattern` rules with one pattern,
  `^([^ ]+) (?:\1( [^ ]+)\2|([bcdđghklmnpqrstvx]*)[aà] \1( \3[^ bcdđghklmnpqrstvx][^ ]*))$`,
  each anchored on one letter a syllable can end with.

The processors are 6 `own` (`normalizeUnicode`, `replaceEth`,
`decapitalizeFirstLetter`, `hyphensToSpaces`, `toneMarks`, `alternateIY`), 2
`both` (`decapitalize` and `capitalizeFirstLetter`: written for the pack, and
the same steps as Yomitan's) and 1 `yomitan` (`normalizeDiacritics`). No
Yomitan processor is left out; `tools/check-yomitan.mjs` compares all three
with Yomitan's own on 1,175, 1,175 and 1,144 inputs and finds no difference.

The first commit of the pack, `vi: own rules`, has the own rules as written
before Yomitan's file was read. These were changed after measuring, each for
wrong first results in real text (Measurements 4 has the texts):

- **Partial reduplication by pattern, for any word** (350 patterns, one per
  toned rhyme). In Tatoeba it gave 61 first results, 53 of them a reading of
  two words (*cho chó*, feed the dog, read as *chó* ×23, *cùng cũng* ×19,
  *nhưng những* ×3, *tôi tối*, I … tonight, ×2, *về vệ*, *cô cố*), 7 right
  (*chầm chậm* ×2, *cuồn cuộn* ×2, *hôi hổi* ×2, *dinh dính*) and 1 unclear
  (*là lạ*). In *Việt Nam sử lược* 5 of its 6 were wrong (*đê để*, *đình
  định*, *Mân mất*), the sixth unclear. The rule now lists the adjectives that reduplicate this way,
  leaving out *tối*, *lạ* and *đủ* for *tôi tối*, *là lạ* and *đu đủ*
  (papaya). On the 1,000-row sample the patterns reached 69 rows, the list
  13.
- **A single word said twice, and a word repeated after a phrase** (*X X* →
  *X*, *A B B* → *A B*). Judged by hand in the two texts, *X X* was a
  reduplication at 44 places (*đi đi*, *ha ha*, *quen quen*) and two words
  at 41 (*máy bay bay*, the plane flies; *bằng chứng chứng minh*; *năm năm*,
  five years), and *A B B* a word repeated after a phrase at 18 of its 21
  places (*máy bay bay* ×3, *học sinh sinh viên*). Either way the result
  shows the word *X*, which a lookup of *X* alone shows too. The rule lost
  31 sample rows (*xanh xanh* → *xanh*), which wty-vi-en's own form-of rows
  (*xanh xanh*, *dần dần*) cover where they exist.
- **Capitalising every word** (`capitalizeWords`). In Tatoeba it changed 71
  first results: 42 longer matches, 24 of them right by my judgement (*Nhật
  bản* → *Nhật Bản*, *Trung quốc* → *Trung Quốc*) and the rest names for
  ordinary words (*cao bằng*, as tall as, → the province *Cao Bằng* ×7,
  *cái răng* → *Cái Răng*), and 29 sentence-initial nouns read as names
  (*Sư tử* → *Sư Tử* ×5, *Văn hóa* → *Văn Hóa* ×4, *Dân số* → *Dân Số*
  ×3). In *Việt Nam sử lược* it changed 1,247, nearly all hyphenated names
  read right (*Hồng-bàng* → *Hồng Bàng*). Its place is now the second
  variant of `hyphensToSpaces`, which capitalises only the words after a
  hyphen: it gives the same first result at all but 44 of those 1,247
  (names whose first two words a space separates, *An dương-vương*), and in
  Tatoeba it adds 2 right ones (*Cơ-đốc nhân* → *Cơ Đốc nhân*) and none of
  the wrong ones.
- **Misplaced tone marks in `toneMarks`** (*ngừơi* → *người*): Yomitan's
  `normalizeDiacritics` makes them, and more (*cuả*, *baỷ*). `toneMarks`
  keeps the old/new placement in every syllable, which `normalizeDiacritics`
  does only for the first syllable it can change: it adds 11 first results
  in the two texts, all right (*cứu hỏa* → *cứu hoả* ×7, *Thái-hòa*, *Mèo
  già hóa cáo*), for 20-30% of the batch time.

## Measurements

All with wty-vi-en as published, form-of rows included, at hoshidicts b145feb
(GCC 14.3, Release). The pack has no optional feature, so every file gives
the same numbers with every option on and with `# options: default`
(`sources/measure-eval.sh` runs both).

1. **eval-language** (`sources/measure-eval.sh`). *Own*: own processors and
   rules; *Yomitan*: Yomitan's three processors and no rules; *union* and
   *final* are the same set. The sample is `corpus.tsv` and `gaps.tsv`
   together.

   | Set | Sample recall | False candidates | First rank | cases.tsv positives | negatives | false candidates | first rank |
   | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
   | Own | 60.7% (607) | 0.154 | 75.9% | 95.3% | 100% | 0.266 | 78.1% |
   | Yomitan | 10.4% (104) | 0.108 | 75.6% | 12.5% | 100% | 0.656 | 31.2% |
   | Union = final | 60.7% (607) | 0.154 | 75.9% | 100% | 100% | 0.859 | 82.8% |

   By kind of sample row (final / Yomitan): i/y 342 / 0 of 357; hyphens 103
   / 0 of 130; tone-mark place 72 / 55 of 73; capitals 54 / 48 of 81; other
   letters or marks as well 23 / 1 of 42; another tone or vowel mark
   (dialect and older spellings such as *mầu* / *màu*) 0 / 0 of 132;
   reduplication 13 / 0 of 185. First rank barely moves because wty-vi-en
   has a form-of row for most of these pairs.

   Most false candidates are headwords wty-vi-en's own references name from
   a right form: a syllable's Hán-Nôm characters (*đỏ* → 𣠶) and the nouns a
   classifier counts (a row of *người* names 37 nouns). Per rule on the
   sample: `partialReduplication` recovers 13 rows and adds 3 false
   candidates, `reduplication` 0 and 5 (four-syllable forms whose row names
   another spelling of the long form, such as *hổn hà hổn hển*); on
   `cases.tsv` 32 and 12, 10 and 0. No rule breaks a negative.
2. **Frequent forms** (`sources/measure-frequent.py`): of the 10,000 most
   frequent words of `vi_50k.txt` (26,127,960 tokens), the final set reaches
   a lemma that a form-of row of the word or the sample names for 96 words
   (1.28% of the tokens; Yomitan's processors 71, 1.05%). One of them, *lóa*
   (44 tokens), shows no definition: wty-vi-en's only row for it refers to
   *loá*, which has no row of its own. No word shows a wrong lemma first.
3. **Clitics, pronouns, articles and auxiliaries**: Vietnamese writes none
   attached to a word. What can read across two words is reduplication, so
   every Tatoeba position whose first result comes through a pack rule was
   judged by hand: 7 positions, all right (*đi đi lại lại*, *lén lén lút
   lút*, *lề mà lề mề* ×2, *vớ va vớ vẩn*, *khất kha khất khưởng*, *dinh
   dính*). With the first own rules, the same positions had 53 wrong partial
   reduplications, 35 wrong readings of two equal words and 18 of a word
   repeated after a phrase (Rule provenance).
4. **Real text** (`sources/make-hovers.py`, `sources/lookup-batch.cpp`,
   `sources/judge-real.py` with `sources/judgements.tsv`): every word of
   *Việt Nam sử lược* Quyển I (78,249 lookups) and of Tatoeba (284,843),
   looked up from the word to the end of its sentence as a host does. The
   first result with a definition was compared with that of Yomitan's
   processors alone:
   - it differs at 4,268 positions of *Việt Nam sử lược* and 270 of
     Tatoeba;
   - 4,252 and 260 of them are judged right by script: the result has the
     letters of the matched text once marks, capitals and hyphens are set
     aside (*Hồng-bàng* → *Hồng Bàng*, *thế-kỷ* → *thế kỉ*, *tòa nhà* →
     *toà nhà*, *lúa mỳ* → *lúa mì*, *kỷ* → *kỉ* where Yomitan's processors
     give the Han character 己);
   - the other 16 and 10 were all judged by hand: 2 are wrong, *Thăng-bình*
     (a district) → *thăng bằng* through wty-vi-en's alternative form, and
     the typo *kì kỳ* → *kì*.

   So 2 of 363,092 lookups (0.0006%) show a wrong first result that the
   pack's own processors and rules cause. A seeded random sample of 50
   positions of each text, judged by hand, has 3 wrong first results, none
   from the pack's rules or processors: *đánh bắt* (to fish) for *đánh bắt
   được* (attacked and caught), and the name syllables *Tu* → *tu* and
   *Độ* (of *Ấn Độ*) → *độ*.
5. **Speed.**
   - Native `benchmark-lookup --languages languages --language vi`, the 80
     texts of `sources/benchmark-words.txt` (written for the pack, each the
     rest of a sentence from a looked-up word), 6 passes with the first
     dropped, 3 runs at machine load about 31: p50 127-129 µs, p95 828-881 µs
     (budget 1 ms p50). Yomitan's processors alone: p50 41 µs, p95 398-493
     µs.
   - The slowest texts start with a classifier (*cái bàn* 1.4 ms, *con mèo*
     1.2 ms, *cây bàng* 0.9 ms): wty-vi-en has a form-of row for every noun a
     classifier counts (*cái* names 924), and each is looked up.
   - WebAssembly (Hachidori feat/multi-language d7e82b0c engines, Node 22,
     `benchmark/node-lookup.mjs` with `HACHIDORI_LOOKUP_LANGUAGE=vi`, the
     539 hovers of the same texts, 6 passes, load about 45): `hdw_lookup`
     p50 174 µs and p95 397 µs threaded, p50 162 µs and p95 383 µs
     single-thread.
   - Pack load (`sources/wasm-load.mjs`, 10 fresh engines each):
     `hdw_language_load` median 6.98 ms single-thread and 7.18 ms threaded
     (budget 50 ms); live heap +296,984 bytes (budget 20 MB). The 67
     `pattern` rules take 145,752 bytes of it and 0.6 ms (the pack without
     them: +151,232 bytes, 6.35 ms).
6. **Hachidori** (feat/multi-language d7e82b0c with this branch in
   `third_party/hoshidicts`, `node scripts/sync-languages.mjs`,
   `test/chrome-language-pack.mjs`, Chrome 152, wty-vi-en): 16 / 16 checks
   pass. Settings adds Vietnamese beside Japanese and imports the dictionary
   (76,689 terms, 0.5 s); twelve hovered words find their headword first
   (*đo đỏ* → *đỏ*, *đi đi lại lại* → *đi lại*, *tòa nhà* → *toà nhà*,
   *Hồng-bàng* → *Hồng Bàng*, *Ðà Nẵng* → *Đà Nẵng*, *Nước Mỹ* → *nước Mĩ*);
   the Anki note and the switch to Japanese and back work.
7. **Conformance** (`language-conformance-test`): corpus.tsv 607 / 607,
   cases.tsv 100 / 100, text.tsv 73 / 73, lookup.tsv 27 / 27; gaps.tsv 0 /
   393 (reported); classes.json agrees with the engine (2 classes, 2 fields,
   3 steps, 3,432 outputs). `sources/mutate.mjs` removes each exclusion,
   constraint and processor in turn (21 mutations); a test fails for every
   one.

The commands: `node languages/vi/sources/build-own.mjs && node
languages/vi/sources/build-pack.mjs` writes the pack;
`languages/vi/sources/measure-eval.sh <work dir> <imported wty-vi-en>` the
table of 1; `measure-frequent.py` (its header has the arguments) 2;
`make-hovers.py`, `lookup-batch-vi` (built as the header of
`lookup-batch.cpp` says) and `judge-real.py` 3 and 4; `compare-first.py`
the comparisons of Rule provenance; `wasm-load.mjs` and the commands above 5;
`mutate.mjs` 7.

## Known gaps

- **Lexicalised reduplicatives** (*bạn bè*, *rộng rãi*, *sắc sảo*, *bươm
  bướm*): 172 of the 185 reduplication rows of the sample. They are words of
  their own, which dictionaries list, and a rule for them would read
  ordinary pairs of words as one (Rule provenance).
- **A single word said twice** (*xanh xanh*, *dần dần*) is not read by a
  rule: 31 sample rows. wty-vi-en lists the common ones as forms of their
  base.
- **Adjectives not on the list** do not reduplicate partially; the list has
  80.
- **Another tone or vowel mark** (*mầu* / *màu*, *giầy* / *giày*, hỏi and ngã
  confused): 132 sample rows. No processor makes them, because the same
  change turns *tây* into *tay* and *nghĩ* into *nghỉ*.
- **Hyphens the text leaves out** (*xi măng* for wty-vi-en's *xi-măng*): 27
  sample rows; a processor would double the lookups of every phrase.
- **Capitals the text does not have** (*Tết âm lịch* → *Tết Âm lịch*,
  *VIỆT NAM* → *Việt Nam*): since `capitalizeWords` is gone, only the
  first letter and the words after a hyphen are capitalised.
- **Names read as common words** after a capital is lowered: *Tu* → *tu*,
  *ĐỖ* → *đậu* through wty-vi-en's Northern form of *đỗ*.
- **One hop**: a form-of row whose target has no row gives nothing (*lóa* →
  *loá*).
- **Classifier references**: looking up a classifier (*cái*, *con*, *cây*,
  *chiếc*) follows all its references, so it is slow (up to 1.4 ms native)
  and lists unrelated nouns after the classifier's own entries.
- `normalizeDiacritics` changes only the first syllable it can in a text
  (Yomitan's behaviour); `toneMarks` covers *oa*, *oe* and *uy* in every
  syllable, but not other misplaced marks after the first.
- `traceSelection` is `shortest`, as the contract recommends; no test can
  observe it.
