# Chinese (`zh`)

Lookup rules, text processors and scanning settings for Mandarin Chinese in
simplified and traditional characters. Chinese has no inflection, so the
rules find the dictionary word in the forms a learner meets that are not
written as one word: reduplication (看看, 高高兴兴), A-not-A questions (喜不喜欢),
verb-object compounds with words between their parts (洗了个澡 → 洗澡), the
potential forms (看不见 → 看见), the plural 们 and the erhua suffix 儿.

Lookups start at the hovered character and try every prefix of the text
(`cursor` / `character` / `scan`, docs/languages.md 14.1), as for Japanese.
The recommended dictionary is CC-CEDICT for Yomitan: it lists every word under
both its simplified and its traditional spelling. Neither CC-CEDICT nor
wty-zh-en (wiktionary-to-yomitan) fills the `rules` (part-of-speech) column,
so the pack sets `lookup.untaggedTerms` to `pass` (docs/languages.md 9.4): the
rules keep their parts of speech (`v`, `adj`, `n`, `pron`, all dictionary
forms), which decide which rules apply to a rule's output, and untagged terms
still match them.

Why CC-CEDICT and not wty-zh-en: in wty-zh-en a simplified word is a form-of
row that points to its traditional entry, which a lookup follows (`formOf`
`follow`), but single simplified characters often have no such row. Of the 300
most frequent one-character words of FrequencyWords zh_cn_50k, wty-zh-en has
no row at all for 37 (会 对 给 着 谁 请 为 们 …) and only rows pointing to other
characters for 30 (说 → 悅 and 脫, 这 → 媸 and 遮, 吗, 来, 还, 没 …). With
wty-zh-en, turn on **Look up simplified characters in traditional** (the
optional `simplifiedToTraditional` processor), which finds 說 for 说.

## Sources and licences

- `sources/own.json` and every rule of `transforms.json` (all `own`): written
  for this pack (GPL-3.0-or-later) by `sources/build-own.mjs`, from word lists
  of Mandarin grammar written from the standard descriptions (Chao, *A Grammar
  of Spoken Chinese*, 1968; Li and Thompson, *Mandarin Chinese: A Functional
  Reference Grammar*, 1981; Liu Yuehua et al., *实用现代汉语语法*, 2001). No
  text, word list or table is copied from them. Each literal is also written
  in its traditional forms, taken from the pairs of simplified and traditional
  headwords of CC-CEDICT (CC BY-SA 4.0, MDBG and the CC-CEDICT editors) and
  weighted by FrequencyWords zh_tw_50k (`sources/variants.mjs`).
- The processors and `readingNormalizer` of `language.json`:
  - `normalizeRadicalCharacters` is Yomitan's processor of that id
    ([`ext/js/language/CJK-util.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/CJK-util.js),
    NFKD on the radical and stroke blocks; GPL-3.0-or-later, Copyright (C)
    2024-2026 Yomitan Authors), followed by a map of the 112 CJK Radicals
    Supplement characters that Unicode's `EquivalentUnifiedIdeograph.txt` 17.0
    (Unicode License V3) maps to an ideograph.
  - `readingNormalizer` is Yomitan's `normalizePinyin`
    ([`ext/js/language/zh/chinese.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/zh/chinese.js),
    same licence) with two own steps: a parenthesised part is removed (wty-zh-en
    writes `ēi (ei¹)`), and so are `·`, `‧` and `ʼ` (CC-CEDICT writes
    `Yàdāng·Sīmì`).
  - `normalizeUnicode` (NFKC) and the two optional script conversions are own.
    The conversion maps are written by `sources/build-processors.mjs` from
    CC-CEDICT's headword pairs (CC BY-SA 4.0), Unihan 17.0's variant fields
    (Unicode License V3) and FrequencyWords zh_cn_50k and zh_tw_50k
    ([hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
    at 525f9b5, content CC BY-SA 4.0).
- `tests/corpus.tsv` (721 rows) and `tests/gaps.tsv` (235 rows), written by
  `sources/build-corpus.py`: 356 usage rows from the example sentences of
  English Wiktionary in wty-zh-en 2026.10.22, where Wiktionary's editors mark
  the headword's parts in bold where they are not written together (洗個澡 for
  洗澡, 生她的氣 for 生氣, 壓壓驚 for 壓驚); 300 rows from its "erhua form of"
  glosses and 300 from CC-CEDICT's "erhua variant of" glosses, each sampled
  with seed 1. CC BY-SA 4.0, by the Wiktionary contributors (through
  kaikki.org) and the CC-CEDICT editors. Sentences in Cantonese, Wu or Hokkien
  and sentences with a citation before 1900 are left out.
- `tests/defaults.tsv`, `tests/cases.tsv`, `tests/text.tsv` and the `sources/`
  scripts: written for this pack (GPL-3.0-or-later). `tests/classes.json` is
  written by `tools/check-classes.mjs`.
- Not committed, used for the measurements (all in
  `hachi-lang-cache/zh/` on the build host):
  - CC-CEDICT for Yomitan, release
    [2026-11-03](https://github.com/MarvNC/cc-cedict-yomitan/releases/tag/2026-11-03)
    (data of 2026-11-02), `CC-CEDICT.zip`, sha256 `32be1df9…15ec`, 203,339 term
    rows; data CC BY-SA 4.0, converter MIT. `CC-CEDICT.Hanzi.zip` (sha256
    `24d63fbe…91ca`) for the character view.
  - wty-zh-en 2026.10.22 from
    [wiktionary-to-yomitan](https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/zh/en/wty-zh-en.zip)
    (commit 61eaa08), sha256 `f055265a…f711`, 347,368 term rows of which
    156,581 are form-of rows; CC BY-SA 4.0.
  - FrequencyWords `zh_cn_50k.txt` (sha256 `25599e00…fe45`) and `zh_tw_50k.txt`
    (sha256 `b3bfa426…4036`) at 525f9b5.
  - Tatoeba's Mandarin sentences, `cmn_sentences.tsv.bz2` downloaded
    2026-11-03 (89,248 sentences, sha256 `d603c1b9…1743`), CC BY 2.0 FR, by the
    Tatoeba contributors.
  - Lu Xun's *吶喊* (Project Gutenberg #27166, sha256 `ddf28d52…9732`) and
    *徬徨* (#24042, sha256 `5a3bbbf8…76cd`), public domain in the United States:
    117,871 Han characters.
  - Unihan 17.0.0 (`Unihan.zip`, sha256 `f7a48b2b…4b5e`) and
    `EquivalentUnifiedIdeograph-17.0.0.txt` (sha256 `38619c05…4320`).

## Rule provenance

`transforms.json` has 16 transforms and 2,907 rules, all `own`. Yomitan has no
Chinese transforms or transform tests (`tools/port-yomitan-transforms.mjs`:
"Yomitan has no ext/js/language/zh/*-transforms.js"), so there is no
`sources/yomitan.json`, no Yomitan rule to leave out, and the union is the own
rules. Yomitan's Chinese code is two text functions, both in the pack (above);
`tools/check-yomitan.mjs` compares `normalizeRadicalCharacters` on 2,486 inputs
with 0 unexplained differences, and `sources/yomitan-differences.tsv` lists the
112 supplement radicals Yomitan leaves unchanged.
`sources/check-reading-normalizer.mjs` passes Yomitan's 9 pinyin tests and
normalises every reading of CC-CEDICT (106,887) and wty-zh-en (129,939) as
Yomitan does except the 155 and 1,380 that the own steps change.

The transforms, with the part of speech of their output:

| Transform | Rules | Example | Output |
| --- | ---: | --- | --- |
| `plural` 们 | 2 | 朋友们 → 朋友 | n, pron |
| `erhua` 儿 | 2 | 一点儿 → 一点 | (none: every rule applies after it) |
| `aNotA` | 502 | 好不好 → 好, 喜不喜欢 → 喜欢 | v, adj |
| `aMeiA` | 252 | 有没有 → 有, 吃没吃饭 → 吃饭 | v |
| `redupAA` | 454 | 看看 → 看, 慢慢 → 慢 | v, adj |
| `redupAyiA` | 334 | 看一看 → 看, 點一點頭 → 點頭 | v |
| `redupAleA` | 334 | 看了看 → 看, 点了点头 → 点头 | v |
| `redupAleyiA` | 44 | 想了一想 → 想 | v |
| `redupAAB` | 127 | 散散步 → 散步 | v |
| `redupAABB` | 227 | 高高兴兴 → 高兴 | v, adj |
| `redupABAB` | 211 | 研究研究 → 研究 | v, adj |
| `redupAliAB` | 51 | 糊里糊涂 → 糊涂 | adj |
| `separable` | 352 | 洗了个澡 → 洗澡, 生他的气 → 生气 | v |
| `potentialNot` | 7 | 看不见 → 看见, 想不起来 → 想起来 | v (takes v) |
| `potentialDe` | 7 | 看得见 → 看见 | v (takes v) |
| `potentialLiao` | 1 | 去不了 → 去 | v (takes v) |

- **Lists, not patterns over any character.** Every prefix of the text is
  looked up, so a rule that removed any doubled character or any 一 would turn
  天天下雨 into 天下 ("all under heaven") at a longer match than 天天. The
  reduplication and A-not-A rules are word lists (whole-word rules, and prefix
  rules for A一A, A了A and the verb of AAB); the 2-character A-not-A words are
  listed whole (喜不喜欢), never as a prefix, because 会不会同意 then gave 会同.
- **Separable compounds** are one `pattern` per object (`anchorSuffix`), with
  the verbs that take it, then one to six of a class of insertions (aspect
  markers, complements, numerals, measure words, demonstratives, a few
  adjectives, pronouns, 的, question words), then the object. Lookaheads after
  the verb keep out what Tatoeba and Lu Xun's stories showed wrong: 的 after the
  verb or after anything but a possessor or a duration (做的事, 说过的话, but
  生他的气, 服八年的刑); 好, 小 and 白 right after the verb (做好事); a numeral,
  measure word or demonstrative after 上 or 下 before 班, 课, 车, 站 or 节 (下一班,
  下次课); 时 starting the insertions (离开时会). An object that is a measure word
  may not follow a numeral, 多, 几 or 些 (松了一口气, 过了这么多年), and some objects
  may not follow the characters that make another word with them (见下面, 碰那面
  镜子, 路上开车, 搬回家, 动门把手, 写下字母, 落到那个地步, 吃不了热豆腐, 出了差错,
  上过大学). Compounds whose object starts too many other words were left out
  (生火: 生了火灾; 找钱: 找他的钱包; 问好: 问得好; 碰头, 松口, 要脸, 出名, 吃香, 请安).
- **Potential forms** are one `stemChange` rule per marker: 不 or 得 is removed
  when only complement characters follow it (看不见, 想不起来), and the text may
  not start with an adverb, pronoun or noun of time (`zhNotPotential`: 我不去,
  天不下, 再不见, 早不来) or, before 得, with a word that 得 ends (`zhNotPotentialDe`:
  变得通, 觉得). 明白 and 清楚 have their own rules (说不明白 is not 说明); 会 is
  a complement only after 学 and 教 (都不会, 将不会). 不了 follows only a verb
  (都不了解).
- **Erhua** is not removed after function words, pronouns, numerals, the words
  儿 follows as 儿子 or 儿童 (的儿子, 我儿子, 一个儿子, 女儿, 婴儿, 教育儿童), or 莱 and
  丽, which end foreign names (克莱儿).
- **Removed after measuring** (each with its numbers in the commit messages
  and below): the demonstrative guard of compositional compounds (54 right
  readings lost on real text, such as 写这封信 → 写信), A一A as whole words only
  (10 right readings lost, 點一點頭), the potential rules' minimum stem (no
  effect).
- `sources/mutations.mjs` removes each stem constraint, exclusion, lookahead,
  list and group of entries from a copy of the pack and runs the conformance
  test on it: 36 mutations, all killed.

## Measurements

Every number uses the recommended dictionary as published, CC-CEDICT for
Yomitan 2026-11-03, and wty-zh-en 2026.10.22 where it says so; lookups scan 16
code points and keep 16 results.

1. **`eval-language --dictionary`** (`sources/evaluate.py`), with
   `untaggedTerms: pass` as the pack has it. Yomitan has no Chinese rules, so
   the union is the own rules; "first own rules" is `sources/own.json` of the
   own-rules commit, before any measurement. The pack's only optional features
   are the script conversions.

   | Rules | File | Options | Rows | Recall | Negatives passed | False candidates | First rank |
   | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
   | final | corpus + gaps | defaults (as written) | 956 | 75.42% | – | 0.004 | 32.53% |
   | final | corpus + gaps | all options | 956 | 75.52% | – | 0.788 | 32.53% |
   | final | defaults.tsv | defaults (as written) | 203 | 100.00% | 100.00% | 0.016 | 74.40% |
   | final | defaults.tsv | all options | 203 | 100.00% | 100.00% | 0.752 | 74.40% |
   | final | cases.tsv | all options (as written) | 7 | 100.00% | – | 1.143 | 0.00% |
   | final | cases.tsv | defaults | 7 | 0.00% | – | 1.000 | 0.00% |
   | first own rules | corpus + gaps | defaults | 956 | 74.16% | – | 0.010 | 28.77% |
   | first own rules | defaults.tsv | defaults | 203 | 96.00% | 24.36% | 0.024 | 69.60% |

   - Recall over corpus + gaps by source: usage rows 45.2% (161 of 356),
     Wiktionary erhua 92.3%, CC-CEDICT erhua 94.3%.
   - With `untaggedTerms: filter`, recall is the same and first rank drops to
     18.51% (corpus + gaps) and 17.60% (defaults.tsv): rule outputs find no
     CC-CEDICT term. With wty-zh-en (pass), false candidates are 0.456 and
     first rank 24.37% on corpus + gaps, 0.744 and 43.20% on defaults.tsv.
   - First rank is low on corpus + gaps because 393 of the 956 sources are
     CC-CEDICT headwords themselves (一点儿, 玩儿), which rightly come first, and
     235 are gaps. With every option on, the conversions find each word again
     under its other spelling, which counts as a false candidate (0.79 per
     row); CC-CEDICT needs no conversion, so they are off by default.
   - `--per-rule` on corpus + gaps: erhua recovers 575 rows, separable 130,
     potentialNot 9, AAB 5, potentialDe 3, AABB 1; no rule breaks a negative;
     the false candidates are 2 each for erhua, aNotA and AA. On defaults.tsv
     every transform recovers its rows and none breaks one of its 78 negatives.
     The cases.tsv rows need the conversions (说不说 → 說), so they fail with
     the defaults by design.
2. **Frequent forms** (`sources/measure.py frequent`): each of the 10,000 most
   frequent words of FrequencyWords zh_cn_50k looked up alone. A rule reaches
   the first result over the whole word for 42 words (81,922 of 69,431,047
   tokens, 0.118%), all with the right lemma: 想想 → 想, 试试, 看不到 → 看到,
   知不知道 → 知道, 打个招呼 → 打招呼, 女士们 → 女士. In zh_tw_50k, 40 words (30,053
   tokens): none wrong; 娘們 → 娘 (228 tokens) and 樂樂 → 樂 (206, likely a name)
   are doubtful. The other 9,958 words are found as written.
3. **Sentence corpus** (`sources/measure.py compare` on every hover of Tatoeba:
   915,672 texts, from each Han character to the end of its sentence): the
   rules change the first result of 3,410 (0.37%). 1,720 keep the lemma and
   only match more of the text (朋友们, 试试, 能不能, 做不了); 1,690 give another
   lemma (separable 1,224, potentialNot 185, aNotA 117, potentialDe 68, AABB 34,
   aMeiA 22, AAB 20). In a random sample of 150 of those (seed 2), judged by
   hand, 145 are right, 3 doubtful (放下你的手 → 放手, 吃了豆腐 → 吃豆腐 when it
   is literal, 進一家門 → 進門) and 2 wrong (打开包装 → 打包, 山上不下雪 → 上下):
   1.3% wrong. Three earlier samples of the same size, each drawn before the
   fixes it led to, found 8, 6 and 9 wrong; each of those was fixed or is in
   Known gaps.
4. **Real text** (*吶喊* and *徬徨*, 117,867 hovers, the same procedure): 521
   first results change (0.44%): 225 keep the lemma, 296 give another one
   (separable 222, potentialNot 37, AABB 12, A一A 10, potentialDe 9, AAB 6).
   All 296 were judged by hand: 285 right, 1 doubtful (受一個多月的苦刑 → 受苦)
   and 10 wrong (3.4%; 0.0085% of all hovers): 說人話 → 說話 (2), 過年過節 → 過節,
   走出後門 → 走後門, 過了這年 → 過年, 出一個國民 → 出國, 找不出什麼事情 → 出事,
   動他的手指 → 動手, 見他們兩面 → 見面, 想得到手 → 想到. Most are an object that
   is the first character of a longer word, which a rule cannot see.
5. **Performance** (section 13), CC-CEDICT, 300 hover texts sampled with seed
   1 from Tatoeba (200) and the two books (100), 6 passes, the first dropped,
   machine load about 46:
   - native `benchmark-lookup --languages languages --language zh`: p50
     31 µs, p95 162-165 µs over three runs (budget 1 ms p50);
   - Hachidori's `hdw_lookup` (`benchmark/node-lookup.mjs`, Node 22, engine
     built from this branch on hoshidicts #58): p50 75 µs, p95 231 µs
     threaded; p50 71 µs, p95 229 µs single-thread;
   - `hdw_language_load` (`sources/wasm-load.mjs`, 10 fresh engines): median
     28.1 ms threaded, 26.6 ms single-thread (budget 50 ms); live heap +2.38 MB
     after the load (budget 20 MB). Natively the pack loads in 12.7 ms with
     5.1 MiB, of which the 352 patterns take 7.6 ms and 4.2 MiB. Their
     character classes are written out: a named class reference in a pattern
     costs about 0.1 ms to expand, which made the pack load in 53 ms.
   - The real-Chrome pack check (`test/chrome-language-pack.mjs`, Hachidori
     feat/multi-language d7e82b0 with this branch's engine and pack): 16 of 16
     checks pass, 12 lookups among them (洗个澡 → 洗澡, 生我的气 → 生气, 点了点头 →
     点头).
6. **Commands** (from the repository root, with the cache files above):

   ```sh
   node languages/zh/sources/build-own.mjs && node tools/merge-transforms.mjs zh --force
   node languages/zh/sources/build-processors.mjs
   python3 languages/zh/sources/build-corpus.py --wty wty-zh-en.zip --cedict CC-CEDICT.zip
   node tools/check-classes.mjs zh --write && node languages/zh/sources/mutations.mjs
   node languages/zh/sources/check-reading-normalizer.mjs <yomitan> CC-CEDICT.zip wty-zh-en.zip
   build/hoshidicts-cli import CC-CEDICT.zip   # and wty-zh-en.zip
   python3 languages/zh/sources/evaluate.py --dictionary <CC-CEDICT> --dictionary <wty-zh-en> --first <own-rules own.json>
   g++ -O2 -std=c++23 -Iinclude languages/zh/sources/lookup-batch.cpp -o build/zh-lookup-batch build/libhoshidicts.a ...
   python3 languages/zh/sources/measure.py hovers cmn_sentences.tsv --tatoeba > tatoeba.txt
   python3 languages/zh/sources/measure.py hovers pg27166.txt --gutenberg > luxun.txt   # and pg24042.txt
   python3 languages/zh/sources/measure.py compare --dictionary <CC-CEDICT> --hovers tatoeba.txt --out diffs.tsv
   python3 languages/zh/sources/measure.py frequent --dictionary <CC-CEDICT> --frequency zh_cn_50k.txt
   python3 languages/zh/sources/measure.py sample --files tatoeba.txt luxun.txt --counts 200 100 > bench.txt
   build/benchmark-lookup bench.txt 6 --languages languages --language zh --term <CC-CEDICT> --json
   node languages/zh/sources/wasm-load.mjs <hachidori checkout> 10 hoshidicts-threaded
   ```

## Known gaps

- **Usage rows the rules do not reach**: 195 of the 356 Wiktionary usage rows
  (`tests/gaps.tsv`). Most are compounds not in the lists or insertions not in
  the class (充我手机的电 → 充电, 备下周的课 → 备课, 受朋友欢迎 → 受欢迎), idioms with a
  word added (大吃了一惊, 临渴而掘井, 一朵鲜花插在了牛粪上), dialect usages that
  the filter missed (执番剂, 揸住个兜), and reduplications of words not listed
  (淡淡定, 白相相).
- **Erhua inside a word** (差点儿没, 猫儿腻, 份儿饭) and erhua after the excluded
  characters (哥们儿, 挨个儿, 胡同儿): 40 of the 600 erhua rows. Most are
  dictionary words, found as written.
- **An object that starts a longer word** cannot be told from the object,
  because a rule sees only the text up to it: 点到了火车站 → 点火, 谈起天气 → 谈天,
  出一个国民 → 出国, 动他的手指 → 动手, 打开包装 → 打包: the wrong results of
  Measurements 3 and 4 (9 of the 222 separable readings in Lu Xun's stories,
  1 of 106 in the Tatoeba sample).
- **Potential forms read across words**: 山上不下雪 gives 上下, 想得到手 gives 想到.
- **Script conversions with CC-CEDICT**: turned on, they show each word twice
  (说 and 說), which is why they are off; with wty-zh-en they are needed for
  single simplified characters (see the top of this file).
- **Ruby**: CC-CEDICT and wty-zh-en write pinyin without spaces between
  syllables (xǐzǎo), so the `syllable` ruby falls back to one ruby over the
  word; a dictionary with spaced pinyin gets one syllable per character.
