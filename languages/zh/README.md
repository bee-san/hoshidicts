# Chinese (`zh`)

Lookup rules, text processors and scanning settings for Mandarin Chinese in
simplified and traditional characters. Chinese has no inflection, so the
rules find the dictionary word in the forms a learner meets that are not
written as one word: reduplication (看看, 高高兴兴), A-not-A questions (喜不喜欢),
verb-object compounds with words between their parts (洗了个澡 → 洗澡), the
potential forms (看不见 → 看见), the plural 们 and the erhua suffix 儿.

Lookups start at the hovered character and try every prefix of the text
(`cursor` / `character` / `scan`, docs/languages.md 14.1), as for Japanese.
The recommended dictionary is CC-CEDICT for Yomitan, which lists every word
under both its simplified and its traditional spelling. Neither CC-CEDICT nor
wty-zh-en (wiktionary-to-yomitan) fills the `rules` (part-of-speech) column
on any row, so the pack sets `lookup.untaggedTerms` to `pass`
(docs/languages.md 9.4 and 14 step 5; Measurements 1 gives both values). The
rules keep their parts of speech (`v`, `adj`, `n`, `pron`, all dictionary
forms), which decide which rules apply to a rule's output, and untagged terms
still match them.

CC-CEDICT is recommended before wty-zh-en, although both are CC BY-SA 4.0 and
wty-zh-en is the wiktionary-to-yomitan dictionary, because wty-zh-en misses
common single characters. A simplified word there is a form-of row pointing to
its traditional entry, which a lookup follows (`formOf` `follow`). Single
simplified characters often lack that row. Of the 300 most frequent
one-character words of FrequencyWords zh_cn_50k, wty-zh-en has no row for 37
(会 对 给 着 谁 请 为 们 …), and for 30 it has only rows pointing to other
characters (说 → 悅 and 脫, 这 → 媸 and 遮, 来 → 嚟). CC-CEDICT has its own row
for 297 of them. The other 3 (琌 硂 璶) are rare characters that are frequent in
this subtitle list, likely through mis-decoded text
(`sources/check-dictionaries.py`). With wty-zh-en, turn on **Look up
simplified characters in traditional** (the optional `simplifiedToTraditional`
processor), which finds 說 for 说.

## Sources and licences

- `sources/own.json` and every rule of `transforms.json` (all `own`) are
  written for this pack (GPL-3.0-or-later) by `sources/build-own.mjs`. Its word
  lists follow the standard descriptions of Mandarin grammar (Chao, *A Grammar
  of Spoken Chinese*, 1968; Li and Thompson, *Mandarin Chinese: A Functional
  Reference Grammar*, 1981; Liu Yuehua et al., *实用现代汉语语法*, 2001). No
  text, word list or table is copied from them or from a dictionary. Each
  literal is also written in its traditional forms. These come from the pairs
  of simplified and traditional headwords in CC-CEDICT (CC BY-SA 4.0, MDBG and
  the CC-CEDICT editors), weighted by FrequencyWords zh_tw_50k
  (`sources/variants.mjs`).
- The processors and `readingNormalizer` of `language.json`:
  - `normalizeRadicalCharacters` is Yomitan's processor of that id
    ([`ext/js/language/CJK-util.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/CJK-util.js),
    NFKD on the radical and stroke blocks; GPL-3.0-or-later, Copyright (C)
    2024-2026 Yomitan Authors). It is followed by a map of the 112 CJK
    Radicals Supplement characters that Unicode's
    `EquivalentUnifiedIdeograph.txt` 17.0 (Unicode License V3) maps to an
    ideograph.
  - `readingNormalizer` is Yomitan's `normalizePinyin`
    ([`ext/js/language/zh/chinese.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/zh/chinese.js),
    same licence) with two own steps. A parenthesised part is removed
    (wty-zh-en writes `ēi (ei¹)`), and so are `·`, `‧` and `ʼ` (CC-CEDICT
    writes `Yàdāng·Sīmì`).
  - `normalizeUnicode` (NFKC) and the two optional script conversions are
    own. `sources/build-processors.mjs` writes the conversion maps from
    CC-CEDICT's headword pairs (CC BY-SA 4.0), the variant fields of Unihan
    17.0 (Unicode License V3) and FrequencyWords zh_cn_50k and zh_tw_50k
    ([hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
    at 525f9b5, content CC BY-SA 4.0).
- `tests/corpus.tsv` (721 rows) and `tests/gaps.tsv` (235 rows) are written by
  `sources/build-corpus.py` from three sources, CC BY-SA 4.0, by the
  Wiktionary contributors (through kaikki.org) and the CC-CEDICT editors:
  - 356 usage rows from the example sentences of English Wiktionary in
    wty-zh-en 2026.10.22. In these, Wiktionary's editors mark the headword's
    parts in bold where they are not written together (洗個澡 for 洗澡, 生她的氣
    for 生氣, 壓壓驚 for 壓驚). Sentences in Cantonese, Wu or Hokkien and
    sentences with a citation before 1900 are left out.
  - 300 rows from wty-zh-en's "erhua form of" glosses and 300 from CC-CEDICT's
    "erhua variant of" glosses, each sampled with seed 1.
- `tests/defaults.tsv`, `tests/cases.tsv`, `tests/text.tsv`,
  `sources/chrome-cases.tsv` and the `sources/` scripts are written for this
  pack (GPL-3.0-or-later). `tests/classes.json` is written by
  `tools/check-classes.mjs`.
- Not committed, used for the measurements (all in `hachi-lang-cache/zh/` on
  the build host):
  - CC-CEDICT for Yomitan, release
    [2026-11-03](https://github.com/MarvNC/cc-cedict-yomitan/releases/tag/2026-11-03)
    (data of 2026-11-02). `CC-CEDICT.zip` has sha256
    `32be1df928de7b875d64320bdee830fcfa79171c9b5884d230198bc7ab0815ec` and
    203,339 term rows; data CC BY-SA 4.0, converter MIT.
    `CC-CEDICT.Hanzi.zip` (sha256
    `24d63fbe00e15d7e960e97f7a637a746227342e2c7620c2101b624da11ea91ca`) is
    for the character view.
  - wty-zh-en 2026.10.22 from
    [wiktionary-to-yomitan](https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/zh/en/wty-zh-en.zip)
    (commit 61eaa08), sha256
    `f055265a63269980b2315ab18a3402684105fcff98a2a75385b5e50c3c7b576f`:
    347,368 term rows, 156,581 of them only form-of references; CC BY-SA 4.0.
  - FrequencyWords `zh_cn_50k.txt` (sha256
    `25599e00347b893e55c3058a748819b3fe19403291cd12f7c03af128e7f3fe45`) and
    `zh_tw_50k.txt` (sha256
    `b3bfa426ebd05225b1963cd557ce844d52912c5534c08b40ebeaec8768f36034`) at
    525f9b5.
  - Tatoeba's Mandarin sentences, `cmn_sentences.tsv.bz2`, downloaded
    2026-11-03 from downloads.tatoeba.org: 89,248 sentences, sha256
    `d603c1b9c67fb7a5a68c56fe6df5c935025ca1f36a1f9a912c33ed6dbed91743`;
    CC BY 2.0 FR, by the Tatoeba contributors.
  - Lu Xun's *吶喊* (Project Gutenberg #27166, `pg27166.txt`, sha256
    `ddf28d52eff750e9b62b53e065a16d666d27f7d468fd038a44bc887c4a429732`) and
    *徬徨* (#24042, `pg24042.txt`, sha256
    `5a3bbbf817fa6d1a901dd468d1fa5db523e47c4e3174af44bf4d7107399476cd`),
    public domain in the United States.
  - Unihan 17.0.0 (`Unihan-17.0.0.zip`, sha256
    `f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e`;
    `Unihan_Variants.txt` sha256
    `3f23cd71872633f3350875d25bd388e83b60fa71807634c9a600ec26f38a68ab`) and
    `EquivalentUnifiedIdeograph-17.0.0.txt` (sha256
    `38619c05a17e771554000fe604afee92e10eb49e0616ecf0c87af3c1eb0f4320`),
    Unicode License V3.

## Rule provenance

`transforms.json` has 16 transforms and 2,909 rules: 2,909 `own`, 0 `yomitan`,
0 `both`. Yomitan has no Chinese transforms or transform tests
(`tools/port-yomitan-transforms.mjs` prints "Yomitan has no
ext/js/language/zh/*-transforms.js"). So there is no `sources/yomitan.json`,
no Yomitan rule to leave out, and the union is the own rules. Yomitan's
Chinese code is two text functions, both in the pack (above):

- `tools/check-yomitan.mjs` compares `normalizeRadicalCharacters` on 2,531
  inputs: 675 listed differences (the supplement radicals, one row of
  `sources/yomitan-differences.tsv`) and 0 unexplained.
- `sources/check-reading-normalizer.mjs` passes Yomitan's 9 pinyin tests. Of
  the distinct readings of CC-CEDICT (106,887) and wty-zh-en (129,939), it
  normalises all as Yomitan does except the 155 and 1,380 that the own steps
  change.

The transforms, with the part of speech of their output:

| Transform | Rules | Example | Output |
| --- | ---: | --- | --- |
| `plural` 们 | 2 | 朋友们 → 朋友 | n, pron |
| `erhua` 儿 | 2 | 一点儿 → 一点 | (none: every rule applies after it) |
| `aNotA` | 502 | 好不好 → 好, 喜不喜欢 → 喜欢 | v, adj |
| `aMeiA` | 252 | 有没有 → 有, 吃没吃饭 → 吃饭 | v |
| `redupAA` | 454 | 看看 → 看, 慢慢 → 慢 | v, adj |
| `redupAyiA` | 336 | 看一看 → 看, 點一點頭 → 點頭 | v |
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

What changed after the first measurement, and why. The first own rules
(`sources/own.json` of the own-rules commit) are measured beside the final
ones in Measurements 1. Every change below was made because a judged first
result on Tatoeba or in Lu Xun's stories was wrong (Measurements 3 and 4):

- **Lists, not patterns over any character.** Every prefix of the text is
  looked up, so a rule that removed any doubled character or any 一 would turn
  天天下雨 into 天下 ("all under heaven") at a longer match than 天天. The
  reduplication and A-not-A rules are word lists: whole-word rules, and prefix
  rules for A一A, A了A and the verb of AAB. A一A of 点 is a whole word or
  点一点头 only, because 点一点 also ends 一点一点 "little by little"
  (一点一点开始学 gave 点开). The A-not-A forms of one-character
  words are whole-word rules (会不会, 好不好), never prefixes, because a prefix
  rule turned 会不会同意 into 会同 ("to handle jointly").
- **Separable compounds** are one `pattern` per object (`anchorSuffix`). A
  pattern has the verbs that take the object, then one to six characters of a
  class of insertions (aspect markers, complements, numerals, measure words,
  demonstratives, a few adjectives, pronouns, 的, question words), then the
  object. Constraints keep out what the judged first results showed wrong:
  - 的 may not follow the verb, nor anything but a possessor or a duration
    (做的事, 说过的话; but 生他的气, 服八年的刑);
  - 好, 小 and 白 may not follow the verb (做好事), and 时 may not start the
    insertions (离开时会);
  - after 上 or 下, no numeral, measure word, demonstrative or 头 before 班, 课,
    车, 站 or 节 (下一班, 下次课, 赶上头班火车);
  - some verbs may not be followed by the character that makes another verb
    with them: 放下 (放下你的手 is not 放手), 握住 and 握着 (not 握手), 有点过头
    (not 点头), 打开 before any object of 打 (打开了车的雾灯 is not 打车), and 点
    as "o'clock": no 钟 after 点 and no 到 before 火 (七点钟的火车, 7点到了火车站
    are not 点火);
  - an object that is a measure word may not follow a numeral, 多, 几 or 些
    (松了一口气, 过了这么多年);
  - some objects may not follow the characters that make another word with
    them (见下面, 碰那面镜子, 路上开车, 搬回家, 动门把手, 写下字母, 落到那个地步,
    出了差错, 上过大学), and 豆腐 follows only a possessor (吃她的豆腐; 吃了豆腐 is
    about tofu);
  - compounds whose separated readings were wrong are out of the list: 生火
    (生了火灾), 找钱 (找他的钱包), 问好 (问得好), 碰头 (碰我的头发), 松口 (松了口气),
    要脸 (it broke 洗了把脸 → 洗脸), 度假 (度过假期), and 做事, 当家, 管事, 出名, 吃香
    and 请安 in the first revision on Tatoeba.
- **Potential forms** are one `stemChange` rule per marker. 不 or 得 is
  removed when only complement characters follow it (看不见, 想不起来). The text
  may not start with an adverb, a pronoun, a noun of time or 生
  (`zhNotPotential`: 我不去, 天不下, 再不见, 早不来, 学生不下, 长生不死). Before
  得 it also may not start with a word that 得 ends (`zhNotPotentialDe`: 变得通,
  觉得). 明白 and 清楚 have their own rules (说不明白 is not 说明). 会 is a
  complement only after 学 and 教 (都不会, 将不会). 不了 follows only a verb
  (都不了解).
- **Erhua** is not removed after function words, pronouns and numerals, nor
  after the words 儿 follows as 儿子 or 儿童 (的儿子, 我儿子, 一个儿子, 女儿, 婴儿,
  教育儿童), nor after 莱 and 丽, which end foreign names (克莱儿).
- **Reverted after measuring** on Tatoeba and Lu Xun's stories: a guard against
  demonstratives in compositional compounds lost 54 right readings on real
  text (写这封信 → 写信), so it is gone. A一A as whole words only lost 10 right
  readings (點一點頭), so A一A is a prefix rule again. A minimum stem length on
  the potential rules changed nothing and is gone.
- `sources/mutations.mjs` removes each stem constraint, exclusion, lookahead,
  list and group of entries from a copy of the pack and runs the conformance
  test on it: 45 mutations, all killed.

## Measurements

Every number uses the recommended dictionary as published, CC-CEDICT for
Yomitan 2026-11-03, imported with `hoshidicts-cli import`; wty-zh-en
2026.10.22 where it says so. Lookups scan 16 code points and keep 16 results,
with `lookup.untaggedTerms` `pass` as the pack has it.

1. **`eval-language --dictionary`** (`sources/evaluate.py`). Yomitan has no
   Chinese rules, so there is no Yomitan row, no union row and no
   `yomitan.tsv`; the union is the own rules. "First own rules" is
   `sources/own.json` of the own-rules commit, before any measurement. The
   pack's only optional features are the two script conversions.

   | Rules | File | Options | Rows | Recall | Negatives passed | False candidates, pass / filter | First rank, pass / filter |
   | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
   | final | corpus + gaps | defaults (as written) | 956 | 75.42% | – | 0.004 / 0.000 | 32.53% / 18.51% |
   | final | corpus + gaps | all options | 956 | 75.52% | – | 0.788 / 0.698 | 32.53% / 18.51% |
   | final | defaults.tsv | defaults (as written) | 222 | 100.00% | 100.00% | 0.015 / 0.008 | 75.38% / 16.92% |
   | final | defaults.tsv | all options | 222 | 100.00% | 100.00% | 0.731 / 0.200 | 75.38% / 16.92% |
   | final | cases.tsv | all options (as written) | 7 | 100.00% | – | 1.143 / 0.143 | 0.00% / 0.00% |
   | final | cases.tsv | defaults | 7 | 0.00% | – | 1.000 / 0.000 | 0.00% / 0.00% |
   | first own rules | corpus + gaps | defaults | 956 | 74.16% | – | 0.010 / 0.010 | 28.77% / 28.77% |
   | first own rules | corpus + gaps | all options | 956 | 74.27% | – | 0.791 / 0.791 | 28.77% / 28.77% |
   | first own rules | defaults.tsv | defaults | 222 | 94.62% | 25.00% | 0.023 / 0.023 | 69.23% / 69.23% |
   | first own rules | defaults.tsv | all options | 222 | 94.62% | 25.00% | 0.723 / 0.723 | 69.23% / 69.23% |

   - `untaggedTerms` is `pass` because both dictionaries leave `rules` empty
     on every row (`sources/check-dictionaries.py`): CC-CEDICT has no
     definition tags at all, and wty-zh-en's untagged rows include all its
     verbs, nouns and adjectives (first definition tag `non-lemma` 156,581,
     `n` 90,172, `v` 34,198, `char` 19,999, `name` 19,112, `adj` 11,213, …).
     Recall and negatives are the same under both values. `pass` ranks more
     lemmas first on corpus + gaps (32.53% against 18.51%) and defaults.tsv
     (75.38% against 16.92%), because under `filter` rule outputs find no
     CC-CEDICT term; cases.tsv ranks none first either way. The first own
     rules have no conditions, so both values give the same numbers.
   - With wty-zh-en (`pass`), false candidates are 0.456 and first rank
     24.37% on corpus + gaps, and 0.723 and 45.38% on defaults.tsv.
   - Recall over corpus + gaps by source: usage rows 45.2% (161 of 356),
     Wiktionary erhua 92.3% (277 of 300), CC-CEDICT erhua 94.3% (283 of 300).
   - First rank is low on corpus + gaps for two reasons. Many erhua sources
     are CC-CEDICT headwords themselves (一点儿, 玩儿), which rightly come first
     as written, and the 235 gap rows do not reach their term at all. With
     every option on, the conversions find each word again under its other
     spelling, and each such entry counts as a false candidate (0.79 per
     row). CC-CEDICT needs no conversion, so the conversions are off by
     default.
   - `--per-rule` on corpus + gaps: erhua recovers 575 rows, separable 128,
     potentialNot 9, AAB 5, potentialDe 3 and AABB 1. No rule breaks a row.
     The false candidates are 2 each for erhua, aNotA and AA.
   - `--per-rule` on defaults.tsv: every transform recovers rows (separable
     43, aNotA 12, potentialNot 11, erhua 9, aMeiA 8, and 2 to 6 each for the
     others) and none breaks one of the 92 negatives.
   - The cases.tsv rows need the conversions (说不说 → 說), so they fail with
     the defaults by design.
2. **Frequent forms** (`sources/measure.py frequent`): each of the 10,000
   most frequent words of a FrequencyWords list looked up alone, as a host
   does.
   - zh_cn_50k: a rule reaches the first result over the whole word for 42
     words, 81,922 of 69,431,047 tokens (0.118%). All 42 have the right lemma
     (想想 → 想, 试试, 看不到 → 看到, 知不知道 → 知道, 打个招呼 → 打招呼, 女士们 → 女士).
   - zh_tw_50k: 40 words, 30,053 of 27,261,482 tokens (0.110%). None is a
     wrong lemma. Three are doubtful: 這儿 → 這 (258 tokens, a mixed-script
     spelling of 這兒 "here"), 娘們 → 娘 (228, a word CC-CEDICT lacks) and 樂樂 →
     樂 (206, often a name).
   - No other word has another word as its first result over the whole
     text.
3. **Sentence corpus** (Tatoeba, 915,672 hovers, one per Han character, each
   from that character to the end of its sentence):
   - `sources/measure.py compare`: the rules change the first result of 3,390
     hovers (0.37%). 1,721 keep the lemma and only match more of the text
     (朋友们, 试试, 能不能, 完不了). 1,669 give another lemma: separable 1,207,
     potentialNot 182, aNotA 117, potentialDe 68, AABB 34, aMeiA 22, AAB 20,
     and 19 from the other rules.
   - Two samples of those 1,669 rows were judged by hand, each row with its
     whole sentence:
     - `sources/measure.py judge` gives the 150 rows whose hover text has the
       smallest SHA-1. It reproduces from the final rules, and a rule change
       that removes rows keeps the rest of it. 145 right, 4 doubtful, 1 wrong.
     - A random sample of 150 (seed 3) was drawn before the exclusions for 点
       as "o'clock", 一点一点 and 头班, which removed none of its rows: 141
       right, 4 doubtful, 5 wrong.
     - Together that is 283 distinct rows: 270 right, 7 doubtful and 6 wrong
       (2.1%). The wrong ones are 開一家藥房 → 開藥, 洗一下你的车 → 下车,
       離不開她的車 → 開車, 房間有沒有空調 → 有空, 说得通顺流畅 → 说通 and 忘记了她的账号
       → 记账. The doubtful ones are 解决不了 → 决 (three times, hovered in the
       middle of 解决), 说得通 → 说通 ("makes sense", three times) and 早上上學 →
       上學 (hovered at the 上 of 早上).
   - Behind pronouns and auxiliary verbs (`sources/measure.py behind`).
     Chinese has no clitics or articles; the words that most often stand
     right before a hovered word are pronouns (我, 你, 他, 我们, 大家, 自己, …) and
     auxiliary verbs (会, 能, 要, 想, 可以, 应该, …). After a pronoun there are
     81,473 hovers; a rule gives the first result of 619 and another lemma
     than without rules for 438. After an auxiliary there are 26,837 hovers,
     with 213 and 134. Of the 283 judged rows, 78 follow a pronoun, all right.
     20 follow an auxiliary: 18 right, 1 doubtful (能说得通 → 说通) and 1 wrong
     (要開一家藥房 → 開藥).
   - An earlier random sample of 150 (seed 2), drawn before the exclusions
     for 放下, 握住, 有点过头, 打开 and 豆腐, had 7 wrong. Those exclusions fixed
     5 of them (放下你的手, 握住他的手, 有點過頭, 打开包装, 吃了豆腐). The other 2
     (早上不来 → 上来, 晚上不下雪 → 上下) are in Known gaps.
4. **Real text**: Lu Xun's *吶喊* and *徬徨* looked up at each of their
   117,867 Han characters, the same way. 521 first results change (0.44%):
   225 keep the lemma, and 296 give another one (separable 222, potentialNot
   37, AABB 12, A一A 10, potentialDe 9, AAB 6). All 296 were judged by hand:
   285 right, 1 doubtful (受一個多月的苦刑 → 受苦) and 10 wrong. That is 3.4% of
   the changes and 0.0085% of all lookups. The wrong ones are 說人話 → 說話
   (twice), 過年過節 → 過節, 走出後門 → 走後門, 過了這年 → 過年, 出一個國民 →
   出國, 找不出什麼事情 → 出事, 動他的手指 → 動手, 見他們兩面 → 見面 and 想得到手 →
   想到. In four of them the object or complement is the first character of a
   longer word (國民, 事情, 手指, 到手), which a rule cannot see. The others read
   two words as one compound (過年過節, 走出後門, 說人話).
5. **Performance** (section 13), with CC-CEDICT and 300 hover texts sampled
   with seed 1 from Tatoeba (200) and the two books (100). The machine's load
   average was about 42 to 46 during these runs.
   - Native `benchmark-lookup --languages languages --language zh`, 6 passes
     with the first dropped (1,500 timed lookups per run): p50 30.8, 30.8 and
     30.5 µs and p95 163.1, 159.4 and 163.0 µs in three runs. The budget is
     1 ms p50.
   - Native pack load (`sources/load-time.cpp`, five loads): 12.8 to 14.6 ms
     after the first, cold load (34.1 ms), with 5.1 MiB of heap. The 352
     separable patterns take about 8 ms and 4.2 MiB of that: a copy without
     them loads in 5.2 to 6.3 ms with 0.94 MiB. Their character classes are
     written out, because expanding a class reference in a pattern takes the
     engine about 0.1 ms, which made the pack load in about 50 ms.
   - Hachidori's WebAssembly engine (feat/multi-language d7e82b0, built from
     hoshidicts with lookup.untaggedTerms), `hdw_language_load`
     (`sources/wasm-load.mjs`, 10 fresh engines): median 29.5 ms threaded and
     29.0 ms single-thread (budget 50 ms), with 2,394,792 bytes of live heap
     after the load (budget 20 MB).
   - `hdw_lookup` (Hachidori's `benchmark/node-lookup.mjs`, Node 22, 505
     lookups made from the same 300 texts, 6 passes): p50 79.6 µs and p95
     239.0 µs threaded; p50 78.1 µs and p95 246.7 µs single-thread.
   - The real-Chrome pack check (`test/chrome-language-pack.mjs` in that
     checkout, with `sources/chrome-cases.tsv` and `CC-CEDICT.zip`) passes 16
     of 16 checks in 10 s. These are the 12 lookups of the cases file (洗个澡
     → 洗澡, 生我的气 → 生气, 点了点头 → 点头, …), the profile and import, the Anki
     note and the switch to Japanese and back.
6. **Commands** (from the repository root, with the cache files above):

   ```sh
   C=hachi-lang-cache/zh   # the downloads; import copies, never inside it
   node languages/zh/sources/build-own.mjs && node tools/merge-transforms.mjs zh --force
   node languages/zh/sources/build-processors.mjs
   python3 languages/zh/sources/build-corpus.py --wty $C/wty-zh-en.zip --cedict $C/CC-CEDICT.zip
   node tools/check-classes.mjs zh --write && build/language-conformance-test languages/zh
   node languages/zh/sources/mutations.mjs
   node languages/zh/sources/check-reading-normalizer.mjs <yomitan> $C/CC-CEDICT.zip $C/wty-zh-en.zip
   python3 languages/zh/sources/check-dictionaries.py --dictionary $C/CC-CEDICT.zip --dictionary $C/wty-zh-en.zip --frequency $C/zh_cn_50k.txt
   build/hoshidicts-cli import work/CC-CEDICT.zip; build/hoshidicts-cli import work/wty-zh-en.zip
   python3 languages/zh/sources/evaluate.py --dictionary "work/CC-CEDICT [2026-11-02]" --dictionary work/wty-zh-en --first <own.json of the own-rules commit>
   hoshidicts-cli --languages languages eval-language zh <corpus + gaps> --dictionary "work/CC-CEDICT [2026-11-02]" --per-rule
   g++ -O2 -std=c++23 -Iinclude languages/zh/sources/lookup-batch.cpp -o build/zh-lookup-batch build/libhoshidicts.a ...   # and load-time.cpp; see their headers
   python3 languages/zh/sources/measure.py frequent --dictionary "work/CC-CEDICT [2026-11-02]" --frequency $C/zh_cn_50k.txt   # and zh_tw_50k
   python3 languages/zh/sources/measure.py hovers $C/cmn_sentences.tsv.bz2 --tatoeba > tatoeba.txt
   python3 languages/zh/sources/measure.py hovers $C/pg27166.txt --gutenberg > luxun.txt   # then pg24042.txt >> luxun.txt
   python3 languages/zh/sources/measure.py compare --dictionary "work/CC-CEDICT [2026-11-02]" --hovers tatoeba.txt --out tatoeba.tsv   # and luxun.txt
   python3 languages/zh/sources/measure.py behind --dictionary "work/CC-CEDICT [2026-11-02]" --text $C/cmn_sentences.tsv.bz2 --tatoeba --out behind.tsv
   python3 languages/zh/sources/measure.py sample --files tatoeba.txt luxun.txt --counts 200 100 > bench.txt
   build/benchmark-lookup bench.txt 6 --languages languages --language zh --term "work/CC-CEDICT [2026-11-02]" --json > bench.json
   python3 languages/zh/sources/measure.py percentiles bench.json
   build/zh-load-time languages/zh
   node languages/zh/sources/wasm-load.mjs <hachidori checkout> 10 hoshidicts-threaded   # and hoshidicts
   ```

   `python3 languages/zh/sources/measure.py judge --diffs tatoeba.tsv --text $C/cmn_sentences.tsv.bz2 --tatoeba`
   prints the sample of item 3 with the text before each hover. The seeded
   samples are `random.Random(seed).sample` over the same rows.

## Known gaps

- **Usage rows the rules do not reach**: 195 of the 356 Wiktionary usage rows
  (`tests/gaps.tsv`). Most are compounds not in the lists or insertions not in
  the class (充我手机的电 → 充电, 备下周的课 → 备课, 受朋友欢迎 → 受欢迎). Others are
  idioms with a word added (大吃了一惊, 临渴而掘井, 一朵鲜花插在了牛粪上), dialect
  usages the filter missed (执番剂, 揸住个兜), and reduplications of words not
  listed (淡淡定, 白相相).
- **Erhua rows the rules do not reach**: 40 of the 600 erhua rows. Some have
  erhua inside a word (差点儿没, 猫儿腻, 份儿饭), others erhua after an excluded
  character (哥们儿, 挨个儿, 胡同儿). Most are dictionary words, found as
  written.
- **An object that starts a longer word**: a rule sees only the text up to
  the object, so it cannot tell the object from the start of a longer word.
  In the judged rows this gave 開一家藥房 → 開藥, 有沒有空調 → 有空, 说得通顺 → 说通,
  忘记了她的账号 → 记账, 出一個國民 → 出國, 找不出什麼事情 → 出事, 動他的手指 → 動手
  and 想得到手 → 想到: 4 of the 283 Tatoeba rows and 4 of the 296 Lu Xun rows.
- **A lookup that starts inside a word**: the rules read the rest of the text
  as if it started a word. Examples are 解决不了 hovered at 决 (→ 决), 早上不来 at
  上 (→ 上来), 晚上不下雪 at 上 (→ 上下), 離不開她的車 at 開 (→ 開車) and 洗一下你的车
  at 下 (→ 下车). In the judged Tatoeba rows this is 3 of the 6 wrong ones
  and 4 of the 7 doubtful ones.
- **Script conversions with CC-CEDICT**: turned on, they show each word twice
  (说 and 說), which is why they are off. With wty-zh-en they are needed for
  single simplified characters (see the top of this file).
- **Readings**: CC-CEDICT and wty-zh-en write the pinyin of a word without
  spaces (xǐzǎo). In the Chrome check's lookup screenshot, Hachidori shows
  it above the whole word.
