# Arabic (`ar`)

Deinflection rules, text processors and scanning settings for Modern
Standard Arabic, following [`docs/languages.md`](../../docs/languages.md).
Lookups start at the hovered word and try only prefixes that end at a word
boundary (`word` / `word` / `spaces`, section 14.1). The rules read the
unvowelled letters (the preprocessors remove vowel marks first). They remove
the proclitics written together with the next word (و ف بـ كـ لـ الـ سـ) and
the attached pronouns, read the endings of nouns and adjectives, and
conjugate verbs of every root type. So وسيكتبونها gives كتب, بالقلم gives
قلم, and أعطيته gives أعطى.

## Sources and licences

- `sources/own.json` and every rule of `transforms.json` (`own` or `both`):
  written for this pack (GPL-3.0-or-later). `sources/own-rules.mjs` generates
  them (`node languages/ar/sources/own-rules.mjs`). They follow the standard
  description of Arabic morphology: the persons and moods of the perfect,
  imperfect and imperative of sound, doubled, hollow, defective, hamzated and
  assimilated verbs of forms I-X; the noun's dual, sound plurals, case endings
  and attached pronouns. This is the description W. Wright's *A Grammar of the
  Arabic Language* and Wiktionary's Arabic conjugation and declension tables
  give. No text or table is copied from them. The first commit of this pack,
  `ar: own rules`, has the rules as written before Yomitan's Arabic file was
  read (63 transforms, 6,023 rules).
- `sources/yomitan.json`: Yomitan's Arabic rules,
  [`ext/js/language/ar/arabic-transforms.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/ar/arabic-transforms.js),
  ported by `tools/port-yomitan-transforms.mjs`. `sources/map-yomitan.mjs`
  maps its 6,620 `todo` rules: `sandwichInflection` becomes circumfix cross
  products, and `(?<!ن)`, `(?<!ت)` and `(?!ل)` become `stemNotEndsWith` and
  `stemNotStartsWith`. The result is 668 JSON rules, 7,157 expanded, and every
  mapped rule is checked against Yomitan's function on 99,300 probes.
  GPL-3.0-or-later, Copyright (C) 2025-2026 Yomitan Authors.
- The preprocessors `normalizeUnicode`, `removeArabicScriptDiacritics`,
  `removeTatweel` and `convertAlifMaqsuraToYaa` are Yomitan's
  ([`arabic-text-preprocessors.js`](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/ar/arabic-text-preprocessors.js),
  same licence). The others are written for the pack (Text and scanning).
- `tests/yomitan.tsv`: Yomitan's
  [Arabic transform test](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/arabic-transforms.test.js),
  converted by `tools/port-yomitan-tests.mjs` (GPL-3.0-or-later, Copyright (C)
  2025-2026 Yomitan Authors). `sources/build-final.mjs` sets its valid rows'
  reasons to `*` and moves the 26 negatives that the final rules do not reject
  to `sources/yomitan-tests-not-kept.tsv` (Known gaps).
- `tests/corpus.tsv` and `tests/gaps.tsv`: 1,496 pairs sampled with seed 1 by
  `sources/sample-corpus.py` from
  [UniMorph ara](https://github.com/unimorph/ara) at e9b7521 (file `ara`,
  sha256 `01663d08…90f1`), CC BY-SA 3.0, by the UniMorph contributors (data
  from English Wiktionary).
  - Forms are written as running text writes them: NFC, with vowel marks,
    shadda, sukun and dagger alif removed.
  - Rows whose form is the lemma are dropped. So are rows whose form
    wty-ar-en (below) does not list as a form of the lemma, which removes
    UniMorph's errors (الراكب given as a form of جزية) and its lemmas spelled
    without their hamza (اباحي for إباحي). That leaves 39,034 pairs, one per
    form, lemma and part of speech.
  - The 20 strata are fixed numbers of perfect, imperfect, jussive and
    imperative verb forms (active and passive), participles and verbal nouns,
    and singular, dual and plural nouns and adjectives (`sources/sample-corpus.py`).
  - `sources/split-corpus.py` puts the rows the final rules reach in
    `corpus.tsv` (1,380) and the others in `gaps.tsv` (116).
  - The other 37,538 pairs, the dev pool, are never committed; the rules were
    revised against them and against the texts below, not against the sample.
- `tests/cases.tsv`, `tests/defaults.tsv`, `tests/text.tsv`,
  `tests/lookup.tsv`, `tests/dictionary/` and `sources/benchmark-words.py`
  (its sentences): written for this pack (GPL-3.0-or-later).
- Measured with, not committed:
  - the recommended dictionary, wty-ar-en from
    [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan),
    revision 2026.10.22 (wty commit 61eaa08), downloaded from
    `https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/ar/en/wty-ar-en.zip`:
    13,609,450 bytes, sha256
    `cf45a3a39dc978f287cc5489d02d848c118c5a0fd93ce22467d3b5d0c305fd47`,
    1,019,773 term rows, 992,228 of them form-of rows. It is Wiktionary
    content through kaikki.org, CC BY-SA 4.0. `hoshidicts-cli import` imports
    it in 1.05 s. wiktionary-to-yomitan is the source the contract
    recommends, and wty-ar-en is its only Arabic-English dictionary; it has
    vowelled readings and a form-of row for almost every inflected form.
  - the 50,000-word Arabic subtitle list `ar_50k.txt` of
    [FrequencyWords](https://github.com/hermitdave/FrequencyWords) at 525f9b5
    (sha256 `bbe98b4b…229e19f`), content CC BY-SA 4.0;
  - Tatoeba's Arabic sentences (`ara_sentences.tsv.bz2` from
    downloads.tatoeba.org, 2026-11-03, sha256 `b42168cd…bb60`, 68,708
    sentences), CC BY 2.0 FR;
  - two public-domain works from Arabic Wikisource, fetched page by page
    (the transcriptions are CC BY-SA 4.0): al-Manfaluti's *al-Nazarat*
    (النظرات, 1910-1921; the author died in 1924), 99 pages, 88,419 words
    (sha256 `6824bbc8…ab59`); and Ibn al-Muqaffaʿ's *Kalila wa Dimna*
    (كليلة ودمنة, 8th century), 19 pages, 45,731 words (sha256
    `1e4a58ed…005b`). Project Gutenberg has no Arabic book of that length.

## Text and scanning

- Words are the Arabic letters (U+0620-U+06FF letters, the Arabic
  presentation forms), the vowel and Quranic marks and tatweel (`classes.word`);
  everything else separates words. Sentences end at `.`, `!`, `?`, `؟`, `۔`
  and `…`; clauses break at `،`, `؛`, `,`, `;` and `:`.
- Preprocessors, in order:
  - Yomitan's: `normalizeUnicode` (NFKC: presentation forms ﻛﺘﺎﺏ → كتاب,
    ﷲ → الله), `removeArabicScriptDiacritics` (the vowel marks Yomitan lists),
    `removeTatweel`, `convertAlifMaqsuraToYaa` (final ى → ي: فى → في);
  - own: `removeQuranicMarks` (the small high letters and signs of Quranic
    text: قُلۡ → قل), `arabicLetterForms` (Persian ی ک and the wasla alif ٱ
    as Arabic letters), `addHamza` (an alif that starts the word, and is not
    the article, or follows الـ or a one-letter proclitic, read with hamza
    above and below: اكبر → أكبر, اسلام → إسلام, والامر → والأمر).
  - Optional, off unless a setting turns them on: `convertYaaToAlifMaqsura`
    (final ي → ى: حتي → حتى) and `convertHaToTaMarbuta` (final ه → ة: مدرسه →
    مدرسة).
- `sources/yomitan-differences.tsv` lists Yomitan's `addHamzaTop` and
  `addHamzaBottom` as unpaired: they put a hamza on the first alif anywhere in
  the word (كان → كأن, الكتاب → ألكتاب), which the pack's `addHamza` does
  not. On 3,753 dev rows, recall is the same with either, and false
  candidates per row fall from 2.444 to 2.332. A madda variant (اخر → آخر)
  was tried and removed: of the 10,000 most frequent words of the subtitle
  list, 2 (0.007% of the list's tokens) are found only through it, and 32
  (0.512%) get a competing reading from it (الى, انت, او).
- Settings: `vowelMarks` (display: hide the vowels of headwords), and four
  lookup settings that turn on optional parts: `informalTaMarbuta` and
  `informalFinalYa` (the two processors above), `derivedForms` (the
  `participle` and `verbalNoun` transforms: مستخدم and استخدام → استخدم) and
  `brokenPlurals` (the `brokenPlural` transform, Rule provenance).
- `lookup.formOf` is `follow`. `lookup.untaggedTerms` is left at its default,
  `filter`. wty-ar-en tags verbs and nouns (`v`, `n`) and leaves adjectives,
  names and particles untagged. With `pass`, false candidates per sample row
  rose from 2.297 to 2.737 for the same recall. Leaving the key out also lets
  the pack load in engines built before #58, such as Hachidori's vendored
  ones.

## Rule provenance

`transforms.json` has 66 transforms, 577 JSON rules and 13,889 rules once
cross products expand: 13,298 `own` and 591 `both` (87 JSON rules), and no
`yomitan` rule. By type, 13,539 are `circumfix` (cross products of person
prefixes and endings, or of an empty prefix and a list of endings), 248
`suffix`, 90 `wholeWord` and 12 `prefix`; there is no `pattern` rule.
`sources/build-final.mjs` writes it: `sources/own.json` with each own rule
marked `both` when one of its affix pairs (prefix and suffix, inflected and
deinflected, a cross product expanded) is also a Yomitan rule's, with a
compatible part of speech.

- `sources/yomitan-provenance.tsv` lists each of Yomitan's 668 JSON rules
  with the own transforms that make one of its deinflections in one step,
  applied to its affixes on ten common stems (281 rules have one), and the
  share of its outputs the own rules reach in any number of steps. For 666
  rules the share is all of them. The other two are `NSuff-AF`'s endings
  `اً` and `ًا`, which keep their tanwin; the pack's preprocessors remove it
  before any rule runs, so a lookup of `كتاباً` reaches كتاب.
- **Yomitan rules left out: all 668.** Added to the own rules (the union
  `tools/merge-transforms.mjs` makes, `--per-rule` with wty-ar-en):
  - they recover 0 rows of the sample, 1 of a 3,753-row subset of the dev
    pool (البصين → بص), 0 of `cases.tsv` and 0 of `yomitan.tsv`;
  - they add false candidates: 9 on the sample, 53 on the dev subset, 29 on
    `cases.tsv` and 52 on `yomitan.tsv`;
  - they break 4 negatives of `cases.tsv`: `NSuff-ath` reads مدرسته as مدرس,
    رأيته as رأي and سيارتها as سيار, and `NSuff-An` reads ذهب الولدان as
    ذهب الولد;
  - looked up as a host does, the first result is wrong at 1.48% of the
    judged positions of *al-Nazarat*, 0.66% of Tatoeba's and 1.56% of *Kalila
    wa Dimna*'s, against 0.39%, 0.26% and 0.34% for the final rules, and for 8
    of the frequent words against 2 (Measurements).

  One sample row, لبا → لب in `gaps.tsv`, is reached by the union and not
  by the final rules: Yomitan's `NSuff-AF` reads the accusative ـًا on any
  stem, while the own rule needs three letters when the stem starts with و ف
  ب ك or ل, so that لكان is لـ + كان, not an accusative of لك.
- **Own rules**, one transform per tense and person, so a trace names both
  (`past (they)`, `present (you f.)`), and one per clitic:
  - proclitics و, ف, بـ, كـ, لـ (with للـ for لـ + الـ), الـ and the future
    سـ before a present verb; each its own transform, so وبالقلم shows و,
    بـ, الـ;
  - the twelve attached pronouns, with the spellings a word takes before
    them: ة as ت (مدرسته), final ى as ا (معناه), the hamza's seat (سماؤه,
    سمائه), a verb's ـوا without its alif (كتبوه), ـتم as ـتمو (كتبتموه);
    and بـ, لـ, على, إلى, لدى written whole (به, لها, عليه, إليه);
  - nouns and adjectives: feminine ـة, accusative ـًا, dual ـان/ـين/ـتا,
    plurals ـون/ـين/ـو/ـات, with the spellings of nouns in ى, ا and hamza
    (مستشفيان, عصوان, صحراوان, منشآت), the pattern فاعٍ (القاضي, صافيان), and
    أب, أخ, حم before a pronoun (أبيه, أخوك) and in the dual (أبوان);
  - verbs of forms I-X: the perfect, the passive perfect where it is spelled
    differently (قيل, أقيم, سئل, كوتب), the present with its subjunctive and
    jussive, and the imperative. Hollow verbs (قال: قلت, يقول, قل),
    defective verbs in ا, ى and ي (دعا, رمى, نسي: دعوت, يرمي, ينسى, ادع),
    doubled verbs (مد: مددت, يمدد), hamzated ones with the hamza's seat
    (يبتدئ, يبأس, أضأت), assimilated imperatives (قف, ضع, صل), رأى (يرى, ير),
    ليس, and كل, خذ, مر;
  - a present verb with an object pronoun in one step (يمكنك, يعرفه), as
    Yomitan reads it; without it, two pronoun rules tie with it (يمكنك →
    ـكن + ـك → يم). It leaves out stems that end in ي, و, ى or ا, where the
    verb is defective (يعطيه → أعطى, not عط);
  - optional: `participle` and `verbalNoun` (the `derivedForms` setting) and
    `brokenPlural` (the `brokenPlurals` setting) read the patterns أفعال,
    فعلاء, مفاعل, فواعل, فعائل, تفاعيل and أفعلة. wty-ar-en lists most broken
    plurals as form-of rows of their singular, and with the rule on, the rule
    ties with those rows and wins (أصحابه → صحب, the collective, before
    صاحب). On the three texts it fixed 1 first result and made 104 wrong.
- **Conditions.** `v` (Yomitan's definition, with `pv`, `iv`, `cv`) and `n`
  are the dictionary's tags.
  - The conjugation rules take `vf` (a verb form that keeps its person
    affixes, the output of سـ and of a pronoun rule that restores a verb
    ending) and give `v`. Nothing takes `v` in, so no rule runs on a verb's
    lemma.
  - The noun endings give `n` and `nd`, and take `nd`, which الـ also gives.
    So noun endings chain with الـ and each other (الكبيرتان), and no verb
    rule reads a noun ending's output (سيكون is not a plural of سيك read as a
    passive, ساك).
  - The proclitics and pronouns give no conditions. wiktionary-to-yomitan
    leaves adjectives, names and particles untagged (`rules` empty), and such
    a row matches only a form without conditions: إنه, منه, لمحمد and والله
    need it.
  - So inflected adjectives (كبيرة, الكبيرات) are found through the
    dictionary's own form-of rows, which name the adjective, and not through
    the noun endings.
- **Constraints**, each with a test that fails without it:
  - every stem is Arabic letters only, of at least two letters, so a rule
    never reads across a space or a short word;
  - الـ is not removed before a pronoun or ـًا (الكتابه is not كتاب + ـه);
  - لـ + الـ is not read before ل (للليل);
  - endings replaced by nothing need three letters when the stem starts with
    و ف ب ك or ل (وبين is و + بين, not a dual of وب);
  - the past endings ن, نا, تم, تما and تن need a stem of three letters, since
    a doubled verb writes both letters there (فلن is ف + لن);
  - the hollow change reads only the و or ي before the last consonant
    (بيوتهم is not بـ + يوتهم);
  - the broken-plural rules never read الـ as stem letters (العناء).
- **Changes after the first commit**, all measured on the dev pool, the
  frequency list and the texts; `git log` has each with its numbers:
  - `v` took Yomitan's subconditions, so the two rule files merge;
  - الـ gives a noun, and the comparative's فُعلى and أفاعل rules were removed
    (364 false candidates for 20 dev rows);
  - the hollow change was limited to the letter before the last consonant;
  - hamza seats, broken plurals and the five nouns were added;
  - the noun endings give `n` (sample false candidates 2.207 → 1.739 per
    row);
  - the madda variant and the final ي → ى variant were removed or made
    optional;
  - broken plurals became optional, and the one-step present + object
    pronoun rule was added.

## Measurements

All numbers use hoshidicts at this branch's head (on main 1fed676, rebased onto 90022a8 with no change to the engine; GCC 14.3,
Release) and wty-ar-en as published, form-of rows included. The scripts are
in `sources/`, run from the repository root.

1. **`eval-language --dictionary`** (`python3 languages/ar/sources/measure.py
   sets <imported wty-ar-en>`). Each file is run with every option on and with
   the defaults, as written and with its options line added or removed. The
   final set is `sources/own.json` with provenance marks, so its numbers are
   the own set's.

   | Rule set | File | Options | Recall | Negatives passed | False candidates | First rank |
   | --- | --- | --- | ---: | ---: | ---: | ---: |
   | final (= own) | corpus.tsv + gaps.tsv (1,496) | all on | **92.25%** | - | 1.728 | 80.48% |
   | final (= own) | corpus.tsv + gaps.tsv | defaults | 87.37% | - | 1.418 | 80.68% |
   | Yomitan | corpus.tsv + gaps.tsv | all on | 67.91% | - | 1.210 | 78.61% |
   | Yomitan | corpus.tsv + gaps.tsv | defaults | 67.45% | - | 1.206 | 78.54% |
   | union | corpus.tsv + gaps.tsv | all on | 92.31% | - | 1.758 | 78.94% |
   | union | corpus.tsv + gaps.tsv | defaults | 87.43% | - | 1.448 | 79.14% |
   | final | cases.tsv (461) | all on | 100% | 100% | 3.371 | 77.40% |
   | final | cases.tsv | defaults | 89.43% | 100% | 3.069 | 76.66% |
   | Yomitan | cases.tsv | all on | 3.44% | 85.19% | 2.152 | 61.43% |
   | union | cases.tsv | all on | 100% | 85.19% | 3.570 | 71.25% |
   | final | defaults.tsv (19) | defaults | 100% | 100% | 2.571 | 85.71% |
   | final | yomitan.tsv (356) | all on | 100% | 100% | 2.782 | 90.04% |
   | Yomitan | yomitan.tsv | all on | 100% | 100% | 1.525 | 82.76% |
   | union | yomitan.tsv | all on | 100% | 100% | 3.042 | 84.29% |

   - Recall counts deinflections only. With the defaults, the optional
     `brokenPlural`, `participle` and `verbalNoun` transforms are off, and the
     sample's broken plurals and derived forms are found in a lookup through
     wty-ar-en's form-of rows instead; this is why it falls to 87.37%. On the
     37,538-row dev pool, the final rules' recall is 93.84%, with 1.627 false
     candidates per row and first rank 83.86%.
   - False candidates are distinct deinflected texts per row that are
     wty-ar-en headwords passing the part-of-speech filter, other than the
     source and the lemma. Most are other real words of the same letters:
     unvowelled Arabic spells many words alike (كتب is "books" and "he
     wrote").
   - First rank is the share of rows whose whole-word lookup puts the
     UniMorph lemma first. Of the 292 sample rows where it does not (every
     option on):
     - 106 have a lemma with no entry with definitions in wty-ar-en, such as a
       verbal noun whose rows only name its verb (التغسيل → غسل);
     - 100 have another reading of the same letters first (صفتا: صفة before
       صفا; حددتما: حد before حدد);
     - 70 have a form that is a headword itself (ربت, خلت, أنام);
     - 16 have a lemma first that the form's own rows name (أبتا → أب).
   - `measure.py sets` prints the full table, with every option state.
2. **Frequent forms** (`measure.py frequent <wty-ar-en.zip> <imported>
   ar_50k.txt`). Of the 10,000 most frequent entries of the subtitle list,
   9,215 are Arabic words; 4,266 of them (34.8% of the list's tokens) are words
   whose own lemma a rule reaches. A word's own lemmas are the targets of its
   form-of rows, followed one more step where the target has no definitions
   (العثور → عثور → عثر), and the word itself when it has definitions. Looked
   up alone, as a host does:
   - 2 show another lemma first: انس and انسي (3,926 occurrences, 0.003% of
     the list's tokens) give نسى before نسي. Both verbs are named by the
     dictionary's rows (نسّى through the processor variant أنس), and they tie
     on every key (Known gaps).
   - Yomitan's rules: 0 of the 3,798 words they reach (27.3% of the tokens).
   - The union: 8 of 4,274.
3. **Clitics and pronouns in a sentence corpus**. Arabic writes its
   proclitics and pronouns together with the word, so `measure.py text`
   judges every position of Tatoeba's 68,708 Arabic sentences (306,356 words,
   each looked up with the rest of its sentence).
   - Words the dictionary lists: 249,504 judged, 30 (0.01%) with a wrong first
     result.
   - Words it does not list, judged by the lemmas of every way of writing them
     as proclitics (و ف ب ك ل س ال لل) + a listed word + a pronoun
     (والكتاب, بقلمه, سيكتبونها): 41,294 judged, 724 wrong (1.75%).
   - The largest groups:
     - بطريقة → بطريق (52) and بطلاقة → طلاق (17): the feminine ending removed
       where بـ + طريقة was meant; equal traces.
     - كين → كان (24): the passive of كان read for a name.
     - الي → إلى (16), الان → لان (15), اين → ونى (14) and ابدا → بدا (14):
       informal spellings without hamza, read as other words.
     - لياني → لي (15): a name.
4. **Real text** (`measure.py text`, every word looked up with the rest of
   its sentence; the first result is judged by script when it matches the
   whole word and the word or its split has entries).
   - *al-Nazarat*: 88,419 positions, 84,650 judged by script, 332 wrong
     (0.39%). Of the 61,465 positions whose word wty-ar-en lists, 19 are
     wrong; of the 23,185 with proclitics or a pronoun, 313 are.
   - *Kalila wa Dimna*: 44,208 judged, 149 wrong (0.34%).
   - Tatoeba: 290,798 judged, 754 wrong (0.26%).
   - The same with Yomitan's rules: 1.61%, 1.66% and 0.72%; with the union,
     1.48%, 1.56% and 0.66%.
   - In *al-Nazarat*, 1,719 positions could not be judged by script (words
     the dictionary has no entry for, or a first result longer than the
     word). A random sample of 60 of them (seed 1), judged by hand: 26 right,
     13 a participle shown as its verb through the dictionary's own form-of
     row (مبتسما → ابتسم; right by the dictionary's own reference), and 21
     wrong. Most of the wrong ones are rare words the dictionary lacks, read
     as a short root (فولتير → تر, سحتوت → سح, لواعج → عج). Counting those
     at the sample's rate, about 1.1% of all 86,369 positions with a result
     show a wrong first result.
   - The largest groups by script are ties between two one-step readings:
     ويطفئ → طفئ (4), ورائي → وراء (4, right as a word but not the
     preposition's own lemma), فيخيل → خال (4), جفنيه → جف (3), برأيه →
     برأ (4, *Kalila*).
5. **Performance** (host load 30-35 on 64 cores, so these are upper bounds).
   - Native `benchmark-lookup --languages languages --language ar --term
     <imported wty-ar-en>` on the 135 texts of `sources/benchmark-words.txt`
     (each word of 20 sentences written for the pack, with the rest of its
     sentence), 6 passes, the first dropped, three runs: p50 86.4-86.9 µs, p95
     242.4-248.0 µs. The budget is 1 ms p50.
   - Native pack load (`sources/pack-load.cpp`): `LanguageRegistry::add`
     median 4.5-5.3 ms over 50 runs, three runs; the registry holds
     6,781,904 bytes of heap. The 13,889 rules are mostly cross products,
     indexed by their endings.
   - WebAssembly, Hachidori feat/multi-language 803f7b6 engines (built from
     hoshidicts b145feb), Node 22:
     - `sources/wasm-load.mjs`, 10 fresh engines each: `hdw_language_load`
       median 11.95 ms single-thread and 13.12 ms threaded; live heap
       +3,339,952 bytes. The budgets are 50 ms and 20 MB.
     - `benchmark/node-lookup.mjs` with `HACHIDORI_LOOKUP_LANGUAGE=ar` on the
       same 20 sentences (135 hovers, 6 passes): `hdw_lookup` p50 227 µs and
       p95 571 µs single-thread, p50 209 µs and p95 513 µs threaded.
   - The pack has no `pattern` rule, so no pattern heap.
6. **Hachidori** (feat/multi-language 803f7b6 with this branch in
   `third_party/hoshidicts` and `node scripts/sync-languages.mjs`;
   `test/chrome-language-pack.mjs`, Chrome 152, wty-ar-en): 17 / 17 checks
   pass.
   - Settings adds Arabic beside Japanese and imports the dictionary
     (1,019,773 terms, 1.4 s).
   - Thirteen hovered words find their headword first, with their traces:
     واستعرتُ → استعار (و, past), سيكتبون → كتب, بالقلم → قلم, مفاتيحنا →
     مفتاح, تساعديني → ساعد, ليستخدمه → استخدم, رأيتهم → رأى, كِتَابَهُ →
     كتاب and others.
   - The Anki note and the switch to Japanese and back work.
   - `test/node-smoke-languages.mjs` loads the pack in all three runtimes.
7. **Conformance and checks**:
   - `language-conformance-test`: corpus.tsv 1,380 / 1,380, cases.tsv 461 /
     461, defaults.tsv 19 / 19 (with the pack's defaults), yomitan.tsv 356 /
     356, text.tsv 34 / 34, lookup.tsv 39 / 39; gaps.tsv 0 / 116 (reported).
   - `tests/classes.json` agrees with the engine (4 classes, 564 fields, 2
     steps).
   - `tools/check-yomitan.mjs`: 10,199 inputs, 155,132 Yomitan results, 0
     unexplained. The processors `normalizeUnicode`,
     `removeArabicScriptDiacritics`, `removeTatweel` and
     `convertAlifMaqsuraToYaa` agree; `addHamzaTop` and `addHamzaBottom` are
     the two listed differences.
   - `sources/ablate.py`: removing each of 14 constraints, exclusions and
     conditions in turn makes the conformance test fail.
   - `tests/` and `sources/` hold about 870 KB.
8. **Commands**:

   ```sh
   cmake -S . -B build -DHOSHIDICTS_LANGUAGE_TESTS=ON -DHOSHIDICTS_CLI=ON -DHOSHIDICTS_BENCHMARK=ON && cmake --build build --parallel 8
   node languages/ar/sources/own-rules.mjs && node languages/ar/sources/build-final.mjs
   node tools/port-yomitan-transforms.mjs <yomitan> ar --force && node languages/ar/sources/map-yomitan.mjs <yomitan>
   python3 languages/ar/sources/sample-corpus.py <unimorph>/ara <dir> <wty-ar-en.zip>
   python3 languages/ar/sources/split-corpus.py <dir>/sample.tsv
   g++ -O2 -std=c++23 -Iinclude languages/ar/sources/lookup-batch.cpp -o build/lookup-batch-ar <the libraries the file names>
   python3 languages/ar/sources/measure.py sets <imported wty-ar-en>
   python3 languages/ar/sources/measure.py frequent <wty-ar-en.zip> <imported wty-ar-en> ar_50k.txt
   python3 languages/ar/sources/measure.py text <wty-ar-en.zip> <imported wty-ar-en> <text file>
   python3 languages/ar/sources/benchmark-words.py
   build/benchmark-lookup languages/ar/sources/benchmark-words.txt 6 --term <imported wty-ar-en> --languages languages --language ar --json
   python3 languages/ar/sources/ablate.py
   ```

   `measure.py text` and `frequent` take `--languages <dir>` for a scratch
   copy of the pack with another rule file, which is how the Yomitan and union
   numbers were measured.

## Known gaps

- **`gaps.tsv`: 116 of the 1,496 sample rows** (7.75%):
  - 76 broken plurals (القضاة → قاض, المحاريب → محراب, الطقوس → طقس). The
    rules read none with the defaults and only seven patterns with the
    `brokenPlurals` setting. wty-ar-en lists them as form-of rows of their
    singular, so a lookup finds them anyway: the gap is in deinflection, not
    in what a user sees with the recommended dictionary.
  - 11 verbal nouns and participles of forms the optional transforms do not
    read (دراية → درى, وسوسة → وسوس, مملوء → ملأ).
  - 17 rare verb forms: passives of form III and VI with ي (نوديتن → نادى,
    تحوشيتن → تحاشى); a doubled hollow verb (حوققنا → حاق); hamza after و
    (يؤوون → أوى); and imperatives of two letters (سم → سمى, نس → نسى).
  - 12 others: the comparative's feminine فعلاء (جرداء → أجرد), ذا and ذي as
    ذو, and لبا → لب (the accusative needs three letters after ل, so that
    لكان is لـ + كان).
- **Ties the pack cannot break** (section 9.6). When two lemmas tie on
  matched length, steps and trace length, and both or neither are named by
  the matched text's own form-of rows, discovery order decides.
  - انس and انسي (3,926 occurrences in the subtitle list) show نسّى before
    نسي. The row of انس names نسي, and the row of أنس, its processor variant,
    names نسّى, so both are confirmed. This is the framework issue the lead
    accepted for a later framework PR (`lookup.confirmedOrder`, hachi-lang-engine-l).
  - Most wrong first results by script in the texts are ties between two
    one-step readings of the same letters: بطريقة → بطريق (the feminine) and
    not بـ + طريقة (52 in Tatoeba), يده → دهي (the jussive of دهي, which
    wty-ar-en lists) before يد + ـه, ويطفئ → طفئ, جفنيه → جف.
- **Yomitan's 26 negatives not kept** (`sources/yomitan-tests-not-kept.tsv`):
  - 23 have a subject and an object pronoun of the same person (علمناني,
    أضربني, ادرسك);
  - 3 have لـ before an indicative (ليجلسون).

  The own pronoun and proclitic rules give no conditions, so that the
  particles, adjectives and names wiktionary-to-yomitan leaves untagged are
  found after them (إنه, منه, لمحمد). A conjugation rule can then follow
  any of them. Yomitan's own proclitics give `n`, so in Yomitan وهو, ومحمد and
  إنه find nothing in wty-ar-en (its untagged rows fail its part-of-speech
  filter). The same holds for Yomitan's invalid chains that the own rules
  accept: بوبيت, كلبيت (proclitics in any order), ووسمع (و twice) and بولدان
  (بـ before a nominative dual).
- **Words the dictionary does not have** get the rules' readings: rare
  words, names and loanwords are read as a short root (فولتير → تر, سحتوت →
  سح, كين → كان). This is 21 of 60 hand-judged positions in *al-Nazarat*
  that the script could not judge (Measurements 4).
- **Adjectives** are untagged in wty-ar-en, and the noun endings give `n`,
  so an inflected adjective is found through the dictionary's own form-of
  rows (كبيرة → كبير). With a dictionary that lists adjectives without such
  rows, كبيرة finds only the noun readings of كبيرة. Setting
  `lookup.untaggedTerms` to `pass` would read them, at 2.297 → 2.737 false
  candidates per sample row (measured before the noun endings gave `n`).
- **Participles and verbal nouns** are shown as their verb when the
  dictionary's own row for the word says only that (مبتسما → ابتسم, العثور
  → عثر). The optional transforms read the others.
- **Informal spellings**: a final ه for ة (مدرسه) and ي for ى (حتي, الي)
  are read only with the `informalTaMarbuta` and `informalFinalYa` settings.
  A word without its hamza is read only at the start of the word or after
  الـ or a one-letter proclitic (اكبر, والامر); inside the word (مسئول for
  مسؤول, شئ for شيء) it is read only where the dictionary lists the spelling.
  Without a madda variant, الان is read as an imperative of لان (to soften;
  15 in Tatoeba).
- **Spaces**: a rule never reads across a space, so a multiword entry is
  found only when the scanned text spells it as the dictionary does (رأس
  مال, من حيث), not with an inflected word inside (رؤوس أموال).
- **Dialects**: the rules are for Modern Standard Arabic; dialect forms
  (Egyptian بيكتب, Levantine عم يكتب) are not read.
