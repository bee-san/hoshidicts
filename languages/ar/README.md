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

`transforms.json` has 66 transforms, 563 JSON rules and 13,823 rules once
cross products expand: 13,232 `own` and 591 `both` (87 JSON rules), and no
`yomitan` rule. By type, 13,473 are `circumfix` (cross products of person
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
  - looked up as a host does, the first result is wrong at 1.52% of the
    judged positions of *al-Nazarat*, 0.72% of Tatoeba's and 1.65% of *Kalila
    wa Dimna*'s, against 0.44%, 0.33% and 0.43% for the final rules, and for 8
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

TBD

## Known gaps

TBD
