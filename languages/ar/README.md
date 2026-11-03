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
  2025-2026 Yomitan Authors). `sources/build-final.mjs` sets every row's
  reasons to `*`, since a negative that names Yomitan's transform ids could
  not fail against the final rules, and moves the 78 negatives the final rules
  reach to `sources/yomitan-tests-not-kept.tsv` (Known gaps).
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
    `sample-corpus.py` also writes `dev-subset.tsv`, every tenth row of the
    pool (3,753 rows), which Rule provenance calls the dev subset.
- `tests/cases.tsv`, `tests/defaults.tsv`, `tests/text.tsv`,
  `tests/lookup.tsv`, `tests/dictionary/`, `sources/benchmark-words.py` (its
  sentences), `sources/homographs.tsv` (hand decisions for the judge of
  Measurements) and `sources/hand/` (hand-judged samples of text positions):
  written for this pack (GPL-3.0-or-later).
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
  - two public-domain works from Arabic Wikisource (the transcriptions are
    CC BY-SA 4.0), fetched page by page on 2026-11-03 by
    `sources/fetch-wikisource.py`, with the revision of each page in
    `sources/wikisource-revisions.tsv`: al-Manfaluti's
    [*al-Nazarat*](https://ar.wikisource.org/wiki/%D8%A7%D9%84%D9%86%D8%B8%D8%B1%D8%A7%D8%AA)
    (النظرات, 1910-1921; the author died in 1924), 99 pages, 88,419 words
    (sha256 `6824bbc8…ab59`); and Ibn al-Muqaffaʿ's
    [*Kalila wa Dimna*](https://ar.wikisource.org/wiki/%D9%83%D9%84%D9%8A%D9%84%D8%A9_%D9%88%D8%AF%D9%85%D9%86%D8%A9)
    (كليلة ودمنة, 8th century), 19 pages, 45,731 words (sha256
    `1e4a58ed…005b`). Project Gutenberg has no Arabic book of that length.
    `fetch-wikisource.py --clean` drops what is not the book's text: the
    navigation lines at the top of 44 pages of *al-Nazarat* (494 words: →
    previous, next ←, the book's title, المؤلف, ../) and of *Kalila* (291),
    and every sentence of five words or more that already occurred (15 and
    1,818 words; *Kalila*'s pages overlap). The cleaned texts the
    measurements use have 87,910 and 43,622 words (sha256 `d1f281fc…ba85`
    and `18a69398…6a26`).

## Text and scanning

- Words are the Arabic letters (U+0620-U+06FF letters, the Arabic
  presentation forms), the vowel and Quranic marks and tatweel (`classes.word`);
  everything else separates words. Sentences end at `.`, `!`, `?`, `؟`, `۔`
  and `…`; clauses break at `،`, `؛`, `,`, `;` and `:`. A sentence keeps
  « », “ ”, ” “, " ", ( ) and ﴿ ﴾ whole; ” “ is there because Tatoeba's
  Arabic sentences open a quote with ” in 32 of their 35 pairs.
- Preprocessors, in order:
  - Yomitan's: `normalizeUnicode` (NFKC: presentation forms ﻛﺘﺎﺏ → كتاب,
    ﷲ → الله), `removeArabicScriptDiacritics` (the vowel marks Yomitan lists),
    `removeTatweel`, `convertAlifMaqsuraToYaa` (final ى → ي: فى → في);
  - own: `daggerAlif` (the dagger alif also read as alif, before the vowel
    marks go, since Uthmani spelling writes long ā with it: الكتٰب → الكتاب;
    removed, as `removeArabicScriptDiacritics` does, it still gives هٰذا →
    هذا), `removeQuranicMarks` (the small high letters and signs of Quranic
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
  `filter`. Of wty-ar-en's 1,019,773 rows, 171,798 (16.85%) have empty
  `rules`, 164,379 of them form-of rows; the untagged lemma rows are, by first
  tag, adj 3,873, name 2,375, adv 370, phrase 136, prep 123, intj 93, conj
  89, char 72, pron 60, num 56 and ptcl 51 (`measure.py untagged`). With
  `pass` (a copy of the pack differing only by that key), every file keeps its
  recall and loses first rank or gains false candidates:

  | File | First rank, filter → pass | False candidates, filter → pass |
  | --- | --- | --- |
  | corpus.tsv + gaps.tsv | 80.41% → 80.35% | 1.725 → 2.077 |
  | cases.tsv | 79.69% → 78.35% | 3.435 → 4.074 |
  | defaults.tsv | 85.71% → 85.71% | 2.571 → 3.000 |
  | yomitan.tsv | 89.66% → 81.61% | 2.782 → 4.084 |

  The untagged adjectives, names and particles are still found through the
  proclitic and pronoun rules, which give no conditions (Rule provenance).
  Leaving the key out also lets the pack load in engines built before #58,
  such as Hachidori's vendored ones.
- `capabilities.readings` is `optional`: wty-ar-en gives each headword a
  vowelled reading (كَتَبَ for كتب), which Hachidori shows, and lookups do
  not need one. Hachidori's `{part-of-speech}` field reads a term's `rules`
  and term tags; wty-ar-en leaves term tags empty, so only `v` and `n` get a
  label, and the 51 `ptcl` and 72 `char` rows have none.

## Rule provenance

`transforms.json` has 71 transforms, 1,040 JSON rules and 14,261 rules once
cross products expand: 13,703 `own` and 558 `both` (86 JSON rules), and no
`yomitan` rule. By type, 13,444 are `circumfix` (cross products of person
prefixes and endings, or of an empty prefix and a list of endings), 548
`wholeWord`, 257 `suffix` and 12 `prefix`; there is no `pattern` rule.
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
  - they reach 1 more row of the sample (لبا, below), 2 more of the dev
    subset (93.66% → 93.71%), and none of `cases.tsv` or `yomitan.tsv`;
  - they add false candidates per row: 1.725 → 1.758 on the sample, 1.614 →
    1.651 on the dev subset, 3.435 → 3.647 on `cases.tsv` and 2.782 → 3.042
    on `yomitan.tsv`;
  - in the conformance test, 14 of the 63 negatives of `cases.tsv` fail with
    them: `NSuff-ath` reads
    مدرسته as مدرس, رأيته as رأي and سيارتها as سيار; `NSuff-An` reads ذهب
    الولدان as ذهب الولد and لكان as لك; `NSuff-h` هذا كتابه as هذا كتاب;
    `NSuff-ayn` وبين as وب; `PVSuff-n` فلن as فل; and the rules merged into
    the own imperative and present read الان, اكون and ابدا as imperatives,
    يبيعه as one present + pronoun step, and برأي as برأ (two rows);
  - looked up as a host does and judged as Measurements 2 describes, the
    first result is wrong at 6.13% of the judged positions of *al-Nazarat*,
    7.00% of *Kalila wa Dimna*'s and 5.15% of Tatoeba's, against 3.78%, 4.67%
    and 2.81% for the final rules; the rules make 1,538, 751 and 4,915 of
    those wrong results, against 211, 80 and 485. Of the frequent words, 62
    show a wrong first result (15 made by the rules), against 39 (0).

  One sample row, لبا → لب in `gaps.tsv`, is reached by the union and not
  by the final rules: Yomitan's `NSuff-AF` reads the accusative ـًا on any
  stem, while the own rule needs three letters when the stem starts with و ف
  ب ك or ل, so that لكان is لـ + كان, not an accusative of لك.
- **Own rules**, one transform per tense and person, so a trace names both
  (`past (they)`, `present (you f.)`), and one per clitic:
  - proclitics و, ف, بـ, كـ, لـ (with للـ for لـ + الـ, and for لـ + a noun
    in ل: لليل), الـ, the negation لا written together with the next word
    (لاشيء, لازال) and the future سـ before a present verb; each its own
    transform, so وبالقلم shows و, بـ, الـ. الـ is indexed at the word's last
    letter, so that it is found before the imperatives that read its letters
    as a stem (الحق is الـ + حق, not the imperative of لحق);
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
  - a present verb with an object pronoun in one step (يعرفه), as Yomitan
    reads it. It takes only stems without و, ي, ى or ا, which their own
    rules and the pronoun rule read (يزوره → زار, يعطيه → أعطى), and no
    first-person object after أ and ن (أعطني is the imperative of أعطى);
  - ـي (my) runs after the verb transforms. A lookup breaks a tie between
    two lemmas the dictionary names by the order the rules found them
    (docs/languages.md 9.6), and a verb never takes this pronoun: on the
    10,000 most frequent words, this read 37 more words as verbs first
    (تعني, تجري, ترتدي) and 12 fewer (تعالي, توقفي, تفضلي), which are listed
    below. A verb in ي comes before one in ى in the defective past, jussive
    and imperative (نسيت, لا تنس, ابق: نسي, بقي), as ى is their informal
    spelling;
  - listed words, for the frequent homographs whose ordinary reading the
    rules would otherwise put after a rarer one the dictionary also names
    (the audit's MAJOR-1): تلك → ذلك and لذا → لهذا (`demonstrative`); يمكن
    and its pronoun forms → أمكن; the present of أحب, أخبر, أعجب, أدرك and
    أصبح as form IV; the present of 16 frequent verbs like وجد (يجد, تضع,
    يصل) and their imperatives; seven definite words whose rows also name a
    rarer noun (الكبيرة, الأولى, الكلاب; `definiteAdjective`); أيدي
    (`listedPlural`); الحين, معنا, منا, عنا, صوت with a pronoun, نكن, العب,
    أعطني, انسي, the eight form V and VI imperatives for a woman that the form
    I subjunctive would read first (تعالي, توقفي), and 36 frequent words written without their hamza (اين, الان,
    اريد; `hamzaOmitted`). Each list is in `sources/own-rules.mjs` with what
    it fixes. `tests/lookup.tsv` pins 15 of these fixes by their first
    result, with both homographs in the test dictionary (تلك, يجب, يمكنك,
    الحق, نسيت, ترتدي, تعني, صوته, أيديهم);
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
- **Constraints**, each with a test that fails without it
  (`sources/ablate.py` makes 26 such edits, the processor order among them):
  - every stem is Arabic letters only, of at least two letters (three after
    سـ), so a rule never reads across a space or a short word (بي is بـ + ـي,
    و٢٠٠٠ has no stem);
  - a form I imperative's stem has no long vowel (اكتب, ادع), so الان, اين
    and اكون are not imperatives; the one-step present + pronoun takes only
    strong stems (يبيعه is not بيع + ـه);
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
    pronoun rule was added;
  - after the first audit: the listed words above, الـ at the last letter,
    ـي after the verbs, ي before ى, the negation لا, the dagger alif and the
    quotes ” “ (Measurements 3 and 4 have the effect).

## Measurements

All numbers use hoshidicts at this branch's head (on main 90022a8; GCC 14.3,
Release) and wty-ar-en as published, form-of rows included. The scripts are
in `sources/`, run from the repository root.

1. **`eval-language --dictionary`** (`python3 languages/ar/sources/measure.py
   sets <imported wty-ar-en>`). Each file is run with every option on and with
   the defaults, as written and with its options line added or removed. The
   final set is `sources/own.json` with provenance marks, so its numbers are
   the own set's.

   | Rule set | File | Options | Recall | Negatives passed | False candidates | First rank |
   | --- | --- | --- | ---: | ---: | ---: | ---: |
   | final (= own) | corpus.tsv + gaps.tsv (1,496) | all on | **92.25%** | - | 1.725 | 80.41% |
   | final (= own) | corpus.tsv + gaps.tsv | defaults | 87.37% | - | 1.415 | 80.55% |
   | Yomitan | corpus.tsv + gaps.tsv | all on | 67.91% | - | 1.210 | 78.61% |
   | Yomitan | corpus.tsv + gaps.tsv | defaults | 67.45% | - | 1.206 | 78.54% |
   | union | corpus.tsv + gaps.tsv | all on | 92.31% | - | 1.758 | 78.74% |
   | union | corpus.tsv + gaps.tsv | defaults | 87.43% | - | 1.448 | 78.88% |
   | final | cases.tsv (511) | all on | 100% | 100% | 3.435 | 79.69% |
   | final | cases.tsv | defaults | 90.40% | 100% | 3.154 | 79.24% |
   | Yomitan | cases.tsv | all on | 3.12% | 87.30% | 2.248 | 59.38% |
   | union | cases.tsv | all on | 100% | 87.30% | 3.647 | 73.88% |
   | final | defaults.tsv (19) | defaults | 100% | 100% | 2.571 | 85.71% |
   | final | yomitan.tsv (304) | all on | 100% | 100% | 2.782 | 89.66% |
   | Yomitan | yomitan.tsv | all on | 100% | 83.72% | 1.525 | 82.76% |
   | union | yomitan.tsv | all on | 100% | 83.72% | 3.042 | 84.29% |

   - Recall counts deinflections only. With the defaults, the optional
     `brokenPlural`, `participle` and `verbalNoun` transforms are off, and the
     sample's broken plurals and derived forms are found in a lookup through
     wty-ar-en's form-of rows instead; this is why it falls to 87.37%. On the
     37,538-row dev pool, the final rules' recall is 93.84%, with 1.626 false
     candidates per row and first rank 83.89%.
   - Yomitan's own negatives take reasons `*` (Sources), and Yomitan's rules
     then reach 16.28% of them through other chains.
   - False candidates are distinct deinflected texts per row that are
     wty-ar-en headwords passing the part-of-speech filter, other than the
     source and the lemma. Most are other real words of the same letters:
     unvowelled Arabic spells many words alike (كتب is "books" and "he
     wrote").
   - First rank is the share of rows whose whole-word lookup puts the
     UniMorph lemma first. The rows where it does not mostly have a lemma with
     no entry with definitions in wty-ar-en (a verbal noun whose rows only
     name its verb: التغسيل → غسل), another reading of the same letters first
     (صفتا: صفة before صفا), or a form that is a headword itself (ربت, خلت,
     أنام).
   - `measure.py sets` prints the full table, with every option state.
2. **The judge.** `measure.py frequent` and `measure.py text` look words up as
   a host does and judge the first result by script, with `--homographs
   sources/homographs.tsv`:
   - a word decided by hand counts as right only with the lemmas
     `homographs.tsv` gives it. It holds 533 words: the most frequent ones
     whose rows or clitic splits name several lemmas (the top 250 of the
     subtitle list and of the three texts), the most frequent listed words
     whose clitic splits name other lemmas (فلا, به, لك), and words whose
     wrong results showed the judge wrong (وعلى, فرأى);
   - another word wty-ar-en lists counts as right with the targets of its
     form-of rows (followed one more step where the target has no
     definitions: العثور → عثور → عثر), and the word itself when it has
     definitions; a word that starts with ا, also with those of its spellings
     with hamza (احد: أحد);
   - a word it does not list (وكتابه) counts as right with the lemmas of the
     ways of writing it as proclitics (و ف ب ك ل س ال لل and their chains) +
     a listed word + a pronoun, where they fit the lemma's part of speech:
     no الـ, بـ or كـ before a verb, سـ only before one, no ـي after a verb and
     no ـني after a noun;
   - with `--split`, a wrong result is the rules' when, looked up with no
     rules, a listed word's first result is right, or when the trace of one
     not listed has a transform of the pack other than the clitics; else the
     dictionary's: the word is a headword itself, or a form-of row of it names
     the lemma shown, which ranks first on equal length, steps and trace
     (docs/languages.md 9.6).

   The counts below say how many positions each kind judged.
3. **Frequent forms** (`measure.py frequent <wty-ar-en.zip> <imported>
   ar_50k.txt --homographs sources/homographs.tsv --split`). Of the 10,000
   most frequent entries of the subtitle list, 9,215 are Arabic words; 4,265 of
   them (34.8% of the list's tokens) are words whose own lemma a rule reaches.
   Looked up alone:
   - 39 show a wrong first result, 2.05% of the list's tokens. The rules make
     none of them: with no rules each is wrong too (Known gaps). 262 of the
     4,265 are decided by hand (39 wrong), 2,439 have one lemma (0 wrong) and
     1,564 several not decided by hand (0 wrong; any of them counts).
   - Yomitan's rules: 55 of the 3,798 words they reach (2.71% of the
     tokens), 14 of them made by the rules. The union: 62 of 4,274 (3.12%),
     15 made by the rules.
4. **Real text** (`measure.py text <wty-ar-en.zip> <imported> <text>
   --homographs sources/homographs.tsv --split`): every word looked up with
   the rest of its sentence. A position is judged by script when its first
   result matches the whole word and the judge finds lemmas for it.

   | Text | Positions | Judged | Wrong | By the rules | By the dictionary | Yomitan's rules | Union |
   | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
   | *al-Nazarat* | 87,910 | 84,177 | 3,186 (3.78%) | 211 (0.25%) | 2,975 | 6,502 (7.81%), 1,483 | 5,160 (6.13%), 1,538 |
   | *Kalila wa Dimna* | 43,622 | 42,242 | 1,972 (4.67%) | 80 (0.19%) | 1,892 | 4,115 (9.87%), 721 | 2,959 (7.00%), 751 |
   | Tatoeba | 306,356 | 290,607 | 8,178 (2.81%) | 485 (0.17%) | 7,693 | 18,572 (6.45%), 5,100 | 14,973 (5.15%), 4,915 |

   The Yomitan and union columns give the wrong results and how many of them
   their rules make.

   - By kind, for *al-Nazarat*, *Kalila* and Tatoeba: decided by hand 29,314,
     16,589 and 114,661 positions, wrong 9.06%, 10.64% and 6.18%; listed with
     one lemma 23,366, 10,312 and 100,800, wrong 0.07%, 0.08% and 0.11%;
     listed with several not decided by hand 11,406, 5,124 and 42,258 (any
     counts); not listed, by the clitic splits, 20,091, 10,217 and 32,888,
     wrong 2.55%, 1.95% and 2.83%.
   - The rules' wrong results are mostly ties between one-step readings of
     rare words: والتي → والى (10 in *al-Nazarat*), بطريقة → بطريق (52 in
     Tatoeba; the feminine ending, where بـ + طريقة was meant), كين → كان
     (24, a name). The dictionary's are listed in Known gaps.
   - Hand samples (`sources/hand/`, drawn with seed 20261104 by `measure.py
     text --sample-out`, judged by me): of 40 judged positions of
     *al-Nazarat*, 5 are wrong by hand and 3 by script; the script counts
     بدا for بدًّا and غنى for يُغني (أغنى) as right, since the words' own rows
     name them. *Kalila*: 1 of 20 by hand (بهما → بهيم), 0 by script.
     Tatoeba: 3 of 40 by hand, 2 by script (ثري → وثر). Of the positions the
     script cannot judge (no lemma found, or a first result longer than the
     word), 10 of 40 are wrong in *al-Nazarat* (rare words read as a root,
     كنانة → كن; derived forms shown as form I, يتخلق → خلق), 3 of 20 in
     *Kalila*, and 21 of 40 in Tatoeba, 13 of them Tom (توم → آم) and 6
     other names.
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
   - `language-conformance-test`: corpus.tsv 1,380 / 1,380, cases.tsv 509 /
     509, defaults.tsv 19 / 19 (with the pack's defaults), yomitan.tsv 304 /
     304, text.tsv 41 / 41, lookup.tsv 56 / 56; gaps.tsv 0 / 116 (reported).
   - `tests/classes.json` agrees with the engine (4 classes, 564 fields, 2
     steps).
   - `tools/check-yomitan.mjs`: 10,260 inputs, 155,488 Yomitan results, 0
     unexplained. The processors `normalizeUnicode`,
     `removeArabicScriptDiacritics`, `removeTatweel` and
     `convertAlifMaqsuraToYaa` agree; `addHamzaTop` and `addHamzaBottom` are
     the two listed differences.
   - `sources/ablate.py`: each of its 26 edits (a constraint, exclusion or
     condition removed, a listed word dropped, two processors swapped) makes
     the conformance test fail.
   - `tests/` and `sources/` hold 997,507 bytes.
8. **Commands**:

   ```sh
   cmake -S . -B build -DHOSHIDICTS_LANGUAGE_TESTS=ON -DHOSHIDICTS_CLI=ON -DHOSHIDICTS_BENCHMARK=ON && cmake --build build --parallel 8
   node languages/ar/sources/own-rules.mjs && cp languages/ar/sources/own.json languages/ar/transforms.json
   node tools/port-yomitan-tests.mjs <yomitan> ar && node languages/ar/sources/build-final.mjs
   node tools/check-classes.mjs ar --write
   node tools/port-yomitan-transforms.mjs <yomitan> ar --force && node languages/ar/sources/map-yomitan.mjs <yomitan>
   python3 languages/ar/sources/sample-corpus.py <unimorph>/ara <dir> <wty-ar-en.zip>
   python3 languages/ar/sources/split-corpus.py <dir>/sample.tsv
   python3 languages/ar/sources/fetch-wikisource.py <dir>/nazarat.txt النظرات
   python3 languages/ar/sources/fetch-wikisource.py --clean <dir>/nazarat.txt <dir>/nazarat.clean.txt
   g++ -O2 -std=c++23 -Iinclude languages/ar/sources/lookup-batch.cpp -o build/lookup-batch-ar <the libraries the file names>
   python3 languages/ar/sources/measure.py sets <imported wty-ar-en>
   python3 languages/ar/sources/measure.py untagged <wty-ar-en.zip> <imported wty-ar-en>
   python3 languages/ar/sources/measure.py frequent <wty-ar-en.zip> <imported wty-ar-en> ar_50k.txt --homographs languages/ar/sources/homographs.tsv --split
   python3 languages/ar/sources/measure.py text <wty-ar-en.zip> <imported wty-ar-en> <text file> --homographs languages/ar/sources/homographs.tsv --split [--sample-out f.tsv --seed 20261104 --sample 40]
   python3 languages/ar/sources/benchmark-words.py
   build/benchmark-lookup languages/ar/sources/benchmark-words.txt 6 --term <imported wty-ar-en> --languages languages --language ar --json
   python3 languages/ar/sources/ablate.py
   ```

   `build-final.mjs` reads `tests/yomitan.tsv` as `port-yomitan-tests.mjs`
   writes it, so the port runs first. `measure.py text` and `frequent` take
   `--languages <dir>` for a scratch copy of the pack with another rule file,
   which is how the Yomitan and union numbers were measured.

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
- **Wrong first results the dictionary makes** (Measurements 2-4; looked up
  with no rules, each is wrong too). The lead counts these as framework
  issues for hachi-lang-engine-l (`formOfIgnore`, `confirmedOrder`, the
  whole-word tie rule, the reading key). Counts are the subtitle list's tokens
  and the positions in *al-Nazarat*, *Kalila* and Tatoeba:
  - The word is a headword itself, so its own entry comes first: لك (لـ + ك,
    shown as لك "lacquer"; 404,720 tokens; 138, 111 and 472 positions), لي
    (190, 102 and 635), لها (153, 79, 173), لهم (83, 31), فلا (182, 64), وقد
    (86, 137), وفي (59, 22), مني (30, 36, 157), عني, أني (73, 23, 138), يدي
    (70), and verbs whose first person is a headword of another verb or an
    elative: أعرف (231,425 tokens; 302 in Tatoeba), أرى (43, 18), أذهب (121),
    أفعل, أشعر, أفهم, تكون (210), تقول, تعمل (108), يتم; also أمي, حياتي,
    كبيرة (125), صغيرة, أليس.
  - A form-of row of the word names another lemma, which ranks first on equal
    length, steps and trace (section 9.6): به → باه (193,490 tokens; 402,
    314 and 291 positions), أنه and انه → نهى (543,689 tokens; 177, 85, 467),
    منه → أنهى (178, 176, 104), أنك → ناك (40, 20, 221), لدي → ولد (336 in
    Tatoeba), بذلك → بذل (57, 226), فلما → فلم (42, 193), فما → فم (123, 30),
    بك → بيه (42, 41, 138), يده → دهي (60, 18), ماري → مار (909 in Tatoeba),
    يمكننا → مكنن (80,195 tokens) and أنتي → أنة. The audit traces قلت, وقلت
    and لم يقل → قلا (100,043 tokens; 40 and 110 positions) to the reading
    key.
- **Wrong first results the rules make**: none among the frequent words, and
  211, 80 and 485 text positions (0.25%, 0.19% and 0.17% of those judged).
  The largest groups are بطريقة → بطريق (52 in Tatoeba) and بطلاقة → طلاق
  (17): the feminine ending removed where بـ + a noun in ة was meant; كين →
  كان (24) and لياني → لي (15), names; والتي → والى (10 and 4); لحياته →
  لحية (7) and الا → لأى (7).
- **Words the dictionary does not have** get the rules' or a shorter
  match's reading: names (Tom: توم → آم is 13 of the 40 unjudged positions of
  the Tatoeba hand sample, and توم is 3,057 of its 306,356 words; also
  Maria, Linda, Pietro, Lucia, Bush) and rare words read as a root (كنانة →
  كن, فولتير → تر).
- **Yomitan's 78 negatives not kept** (`sources/yomitan-tests-not-kept.tsv`):
  - 44 duals, plurals and singulars after بـ, كـ or لـ, or with a suffix
    Yomitan marks invalid (بالولدان, بمسلمون, الكتابه);
  - 25 verbs with a subject and an object pronoun of the same person
    (علمناني, أضربني, تضربك);
  - 9 chains: proclitics in any order (بوبيت, كلبيت), و twice (ووسمع), and لـ
    before an indicative (ليجلسون).

  The own pronoun and proclitic rules give no conditions, so that the
  particles, adjectives and names wiktionary-to-yomitan leaves untagged are
  found after them (إنه, منه, لمحمد). A conjugation or noun rule can then
  follow any of them. Yomitan's own proclitics give `n`, so in Yomitan وهو,
  ومحمد and إنه find nothing in wty-ar-en (its untagged rows fail its
  part-of-speech filter).
- **Adjectives** are untagged in wty-ar-en, and the noun endings give `n`,
  so an inflected adjective is found through the dictionary's own form-of
  rows (كبيرة → كبير). With a dictionary that lists adjectives without such
  rows, كبيرة finds only the noun readings of كبيرة; `lookup.untaggedTerms`
  `pass` would read them, at the cost Text and scanning gives.
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
