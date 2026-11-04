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
  reach to `sources/yomitan-tests-not-kept.tsv`, generated, not committed (Known gaps).
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
    sentences), CC BY 2.0 FR; the text measured is their third column, one
    sentence per line (`bzcat ara_sentences.tsv.bz2 | cut -f3`);
  - two public-domain works from Arabic Wikisource (the transcriptions are
    CC BY-SA 4.0), fetched page by page on 2026-11-03 by
    `sources/fetch-wikisource.py`, with the revision of each page listed
    below: al-Manfaluti's
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

<details><summary>Wikisource subpages and revision ids (https://ar.wikisource.org/w/index.php?oldid=&lt;id&gt;)</summary>

النظرات: أبو الشمقمق 469719; أدب المناظرة 433986; أدوار الشعر العربي 305978; أفسدك قومك 433821; أفسدك قومُك 335286; أهناء أم عزاء؟ 469718; أهناءٌ أم عزاء؟ 335296; أين الفضيلة؟ 469712; أيها المحزون 433928; إلى الدير 433772; إلى الدَّيْر 335305; إلى تولستوي 305972; الأوصياء 305963; الإحسان في الزواج 425184; الإسلام والمسيحية 469717; الإغراق 305950; الإنسانية العامة 305977; الإنصاف 433883; الاتحاد 434005; الانتحار 433884; الانـتحار 305968; البائسات 433970; البخيل 433996; البعوض والإنسان 305939; البيان 433910; التوبة 305957; الجامعة الإسلامية 305961; الجزع 309724; الجمال 433861; الحب والزواج 433908; الحرية 433782; الحسد 305958; الحياة الذاتية 305943; الحياة الشعرية 305969; الدعاء 306026; الدعوة 433997; الدفين الصغير 433820; الدَّفِينُ الصَّغِير 335315; الرثاء 306021; الرجل والمرأة 305942; الرحمة 433862; الزوجتان 433963; السريرة 433911; السياسة 305948; الشرف 433946; الشعر 306024; الشعرة البيضاء 469716; الشهيدتان 306025; الصدق والكذب 433863; الصندوق 305952; الصياد 433909; العام الجديد 305964; العبرات 335320; العلماء والجهلاء 469721; العَبَرات 335324; الغد 469710; الغناء العربي 305956; الغني والفقير 433832; الغَنيُّ والفقير 335332; القمار 335337; القِمار 335342; الكأس الأولى 469711; الكبرياء 305967; الكذب 433905; الكوخ والقصر 306028; اللقيطة 305951; المدنية الغربية 433871; المقدمة 433966; النبوغ 305941; النظامون 433781; النظَّامون 335352; الوفاء 305959; تأبين فولتير 433865; حوانيت الأعراض 305979; خبايا الزوايا 305960; خداع العناوين 335357; خطبة الحرب 305976; خِدَاعُ العناوين 335362; دمعة على الإسلام 305945; دورة الفلك 469720; رباعيات الخيام 305970; رسالة الغفران 469714; زيد وعمرو 433765; زيدٌ وعمرو 335370; سحر البيان 305965; عبرة الدهر 469715; عبرة الهجرة 433783; على سرير الموت 306029; عِبرةُ الهجرة 335378; غرفة الأحزان 433875; في سبيل الإحسان 305935; لا همجية في الإسلام 335382; لا همجيَّةَ في الإسلام 335387; ليلة في التمثيل 306027; مدينة السعادة 469713; مقدمة «مختارات المنفلوطي» 305973; مناجاة القمر 433860; وا رحمتاه! 305975; يوم الحساب 433945.

كليلة ودمنة: الناسك وابن عرس 251292; باب إيلاذ وبلاذ وايراخت 231372; باب ابن الملك وأصحابه 231368; باب ابن الملك والطائر فنزة 231363; باب الأسد والثور وهو أول الكتاب 272368; باب الأسد والشغبر الناسك وهو ابن آوى 302554; باب البوم والغربان 285510; باب الجرذ والسنور 231362; باب الحمامة المطوقة 245541; باب الحمامة والثعلب ومالك الحزين 231369; باب السائح والصائغ 381514; باب الفحص عن أمر دمنة 290965; باب القرد والغيلم 231360; باب اللبوة والإسوار والشغبر 374244; باب الناسك والضيف 231371; باب بروزيه ترجمة بزرجمهر بن البختكان 141243; باب بعثة برزويه إلى بلاد الهند 245550; باب عرض الكتاب ترجمة عبد الله بن المقفع 245551; باب مقدمة الكتاب 488570.

</details>

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
  | corpus.tsv + gaps.tsv | 80.15% → 80.08% | 1.725 → 2.077 |
  | cases.tsv | 81.02% → 79.69% | 3.446 → 4.088 |
  | defaults.tsv | 71.43% → 71.43% | 2.571 → 3.000 |
  | yomitan.tsv | 89.27% → 81.23% | 2.793 → 4.096 |

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

`transforms.json` has 72 transforms, 1,294 JSON rules and 14,579 rules once
cross products expand: 14,021 `own` and 558 `both` (86 JSON rules), and no
`yomitan` rule. By type, 13,509 are `circumfix` (cross products of person
prefixes and endings, or of an empty prefix and a list of endings), 801
`wholeWord`, 257 `suffix` and 12 `prefix`; there is no `pattern` rule.
`sources/build-final.mjs` writes it: `sources/own.json` with each own rule
marked `both` when one of its affix pairs (prefix and suffix, inflected and
deinflected, a cross product expanded) is also a Yomitan rule's, with a
compatible part of speech.

- `sources/yomitan-provenance.tsv`, which `build-final.mjs` writes (not committed, to keep `sources/` under 1 MB), lists each of Yomitan's 668 JSON rules
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
  - they add false candidates per row: 1.725 → 1.758 on the sample, 1.615 →
    1.653 on the dev subset, 3.446 → 3.660 on `cases.tsv` and 2.793 → 3.054
    on `yomitan.tsv`;
  - in the conformance test, 8 of the 64 negatives of `cases.tsv` fail with
    them: `NSuff-ath` reads مدرسته as مدرس, رأيته as رأي and سيارتها as سيار;
    `NSuff-An` reads ذهب الولدان as ذهب الولد and لكان as لك; `NSuff-h` هذا
    كتابه as هذا كتاب; `NSuff-ayn` وبين as وب; `PVSuff-n` فلن as فل;
  - looked up as a host does and judged as Measurements 2 describes, the
    first result is wrong at 11.99% of the judged positions of *al-Nazarat*,
    16.11% of *Kalila wa Dimna*'s and 10.34% of Tatoeba's, against 10.41%,
    13.98% and 9.10% for the final rules; the rules make 884, 487 and 3,018
    of those wrong results, against 172, 58 and 372. Of the frequent words,
    121 show a wrong first result (8 made by the rules), against 111 (3).

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
    and imperative, and in the defective endings of the present (نسيت, لا
    تنس, ابق, ينسون, نسوا: نسي, بقي; the dictionary's نسى is نَسَّى "to
    cause to forget"). In the ي-hollow present, form IV comes first (يريد,
    يعيد, يصيب, يشير: أراد, أعاد, أصاب, أشار); the frequent form I and II
    verbs of that shape are listed (يبيع, يميل, يفيض, يغير: باع, مال, فاض,
    غيّر);
  - listed words, for the frequent homographs whose ordinary reading the
    rules would otherwise put after a rarer one the dictionary also names
    (the audit's MAJOR-1): تلك → ذلك and لذا → لهذا (`demonstrative`); يمكن
    and its pronoun forms → أمكن; the present of أحب, أخبر, أعجب, أدرك and
    أصبح as form IV; the present of 16 frequent verbs like وجد (يجد, تضع,
    يصل) and their imperatives; seven definite words whose rows also name a
    rarer noun (الكبيرة, الأولى, الكلاب; `definiteAdjective`); أيدي
    (`listedPlural`); الحين, معنا, منا, عنا, صوت with a pronoun, نكن, العب,
    أعطني, انسي, بحكم; the eight form V and VI imperatives for a woman that
    the form I subjunctive would read first (تعالي, توقفي); 36 frequent words
    written without their hamza (اين, الان, اريد; `hamzaOmitted`); and the
    frequent words that the stricter judge of Measurements 2 showed the rules
    or الـ misread (`LISTED`, `LISTED_NOUNS`: يبيع, يغير, يسبب, يدخن, النساء,
    السنين, اثنين, الأسباب, أعين; نفسه, بشكل, فضلك and وجهه as nouns, before
    the verbs of the same spelling; جيدة and جيدا as جَيِّد "good"; after the
    third audit, definite adjectives in ة that الـ would read as a noun in ة
    (الطويلة, السرية, الاجتماعية, الوطنية, الشمسية), وقتي and صاحبي, and the
    paradigms of دعا, أعطى, مدّ, وجد, وصل and نام that a rule read as another
    verb: دعت, يدعون, يعطون, أعط, تمدين, يجدان). Each list is in
    `sources/own-rules.mjs`. `tests/lookup.tsv` pins 23 of these fixes by their
    first result, with both homographs in the test dictionary (تلك, يجب,
    الحق, نسيت, ترتدي, تعني, أيديهم, أعطني, الطويلة, دعت, يعطون, صوتا, وقتا,
    يجد, ينسون); the rows for يمكنك and صوته pass without their whole words,
    because the test dictionary does not reproduce what puts مكن and صوة first
    in wty-ar-en;
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

All numbers use hoshidicts at this branch's head (on main 78f0cee; main's engine is as at 350d9e0, whose change since 5ac86a3 leaves the first three cards of the 10,000 frequent words as they were; GCC 14.3,
Release) and wty-ar-en as published, form-of rows included. The scripts are
in `sources/`, run from the repository root.

1. **`eval-language --dictionary`** (`python3 languages/ar/sources/measure.py
   sets <imported wty-ar-en>`). Each file is run with every option on and with
   the defaults, as written and with its options line added or removed. The
   final set is `sources/own.json` with provenance marks, so its numbers are
   the own set's.

   | Rule set | File | Options | Recall | Negatives passed | False candidates | First rank |
   | --- | --- | --- | ---: | ---: | ---: | ---: |
   | final (= own) | corpus.tsv + gaps.tsv (1,496) | all on | **92.25%** | - | 1.725 | 80.15% |
   | final (= own) | corpus.tsv + gaps.tsv | defaults | 87.37% | - | 1.415 | 80.21% |
   | Yomitan | corpus.tsv + gaps.tsv | all on | 67.91% | - | 1.210 | 78.61% |
   | Yomitan | corpus.tsv + gaps.tsv | defaults | 67.45% | - | 1.206 | 78.54% |
   | union | corpus.tsv + gaps.tsv | all on | 92.31% | - | 1.758 | 78.41% |
   | union | corpus.tsv + gaps.tsv | defaults | 87.43% | - | 1.448 | 78.48% |
   | final | cases.tsv (517) | all on | 100% | 100% | 3.446 | 81.02% |
   | final | cases.tsv | defaults | 90.51% | 100% | 3.168 | 80.35% |
   | Yomitan | cases.tsv | all on | 3.09% | 87.50% | 2.254 | 59.16% |
   | union | cases.tsv | all on | 100% | 87.50% | 3.660 | 75.28% |
   | final | defaults.tsv (19) | defaults | 100% | 100% | 2.571 | 71.43% |
   | final | yomitan.tsv (304) | all on | 100% | 100% | 2.793 | 89.27% |
   | Yomitan | yomitan.tsv | all on | 100% | 83.72% | 1.525 | 82.76% |
   | union | yomitan.tsv | all on | 100% | 83.72% | 3.054 | 83.91% |

   - Recall counts deinflections only. With the defaults, the optional
     `brokenPlural`, `participle` and `verbalNoun` transforms are off, and the
     sample's broken plurals and derived forms are found in a lookup through
     wty-ar-en's form-of rows instead; this is why it falls to 87.37%. On the
     37,538-row dev pool, the final rules' recall is 93.84%, with 1.626 false
     candidates per row and first rank 83.85%.
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
   a host does and judge the first card, its expression and its reading, with
   `--homographs sources/homographs.tsv`:
   - a word decided by hand counts as right only with the lemmas
     `homographs.tsv` gives it, and where a lemma names its reading (لم=لَمْ,
     إن=إِنَّ for إنه), only with that entry. It holds 743 words, decided in
     eight rounds: the most frequent words whose rows or clitic splits name
     several lemmas; listed words whose clitic splits name other lemmas (فلا,
     به, لك); words whose wrong results showed the judge wrong (وعلى, فرأى);
     the frequent words whose first card changes with the rules; first cards
     that are another word of the same spelling (لم, قد, نفس, مثل); and the
     audits' corrections (الكتاب, الملك, علي, إنه, إذن, جميلة, نوع; فحسب as
     حسب=حَسْب; the 38 forms of أن with a pronoun as أن=أَنَّ, since أَنْ takes
     none; `-` for names wty-ar-en lacks, as جون, دان and دمنة); and nouns in ة
     with a pronoun whose stem in ت is also a verb form (غرفته, خيمته, غايته:
     49 words);
   - another word wty-ar-en lists, with one lemma, counts as right with that
     lemma: its form-of target, as the entry the row names when the target is
     written with its vowels (كافية: كَافٍ "enough", not كَاف the letter), and
     followed one more step where the target has no definitions (العثور →
     عثور → عثر); the word's own entries; a word that starts with ا also with
     its spellings with hamza (احد: أحد);
   - a word it does not list (وكتابه) counts as right with the lemma of the
     ways of writing it as proclitics + a listed word + a pronoun, where they
     fit the lemma's part of speech (no الـ, بـ or كـ before a verb, سـ only
     before one, no ـي after a verb, no ـني after a noun, no ة for ت after a
     verb in ـت: كسرته);
   - a definite word (its trace removes الـ or a row calls it definite)
     whose first card is a verb entry counts as wrong where the spelling also
     has a noun or adjective entry with definitions (الصعب → صَعُبَ "to be
     hard", الأشخاص → شَخَصَ); a verbal noun whose rows name only its verb
     keeps the verb (التحدث → تَحَدَّثَ);
   - where a form-of row names its target without vowels (most of
     wty-ar-en's), any entry of that spelling counts as right: the uniform
     hand samples of Measurements 4 measure what this misses;
   - a word with several lemmas and no hand decision is **ambiguous**: it is
     not judged, and Measurements 3 and 4 sample it by hand;
   - with `--split`, a wrong result is the rules' when, looked up with no
     rules, a listed word's first card is right, or when the trace of one
     not listed has a transform of the pack other than the clitics, or when a
     pronoun rule wrote ة for ت and so reached another lemma (قلته → قِلَّة);
     else the dictionary's;
   - `measure.py changes` compares the first card with the rules and with no
     rules for every measured frequent word and every text position.
3. **Frequent forms** (`measure.py frequent <wty-ar-en.zip> <imported>
   ar_50k.txt --homographs sources/homographs.tsv --split`). Of the 10,000
   most frequent entries of the subtitle list, 9,215 are Arabic words; 4,265
   of them (34.8% of the list's tokens) are words whose own lemma a rule
   reaches. Looked up alone:
   - 340 are decided by hand, 93 of them wrong; 2,408 have one lemma, 18
     wrong; 1,517 are ambiguous. The 111 wrong words are 4.29% of the list's
     tokens.
   - The rules make 3 of them (9,801 tokens, 0.01%): انهض → اِنْهَاضَ, انسي →
     نَسَّى and اشهر → شَهَرَ, where an imperative rule reaches another verb (or
     the verb entry of a noun's spelling) in one step and the tie goes by the
     order the deinflections were found; listing انهض as a whole word does not
     change it (Known gaps). The dictionary makes the other 108.
   - Yomitan's rules: 138 of the 3,798 words they reach (3.96% of the
     tokens), 38 made by the rules. The union: 121 of 4,275 (4.54%), 8.
   - **The ambiguous words** (`sources/hand/frequent.tsv`: 50 of the 1,517,
     drawn by a hash of seed 20261104 and the word, judged with the glosses
     of both cards): 19 show a wrong card (38%, Wilson 95% 25.9-51.8%), with
     34.8% of the sample's tokens: ماهي → the name Mahi for ما هي, خيارات →
     خِيَار "cucumber", أسنان → سَنَّ "to sharpen", نساء → نَسَاء "longevity",
     أعمل → أَعْمَلَ "to make work", عظيمة → "misfortune". With no rules, all
     19 are wrong too. Scaled to the 1,517 (8,657,614 tokens), that is about
     580 more words and 1.9% of the list's tokens; the fourth audit's sample
     of 50 found 13.
   - With the rules and with no rules (`measure.py changes`), the first card
     differs for 524 words with 4,834,679 tokens: the rules' card is right and
     the other wrong for 2,826,324 tokens, the reverse for 9,801 (the 3
     above). The judge decides neither side for 268 words (1,340,601
     tokens); I judged all of them with both cards' glosses: the rules' card
     is right or the change is wrong both ways in all but three borderline
     ones, الخطب, الحجر and السموم (13,409 tokens).
4. **Real text** (`measure.py text <wty-ar-en.zip> <imported> <text>
   --homographs sources/homographs.tsv --split`): every word looked up with
   the rest of its sentence. A position is judged by script when its first
   card matches the whole word and the judge finds one right lemma or a hand
   decision.

   | Text | Positions | Judged | Wrong | By the rules | By the dictionary | Ambiguous | Yomitan's rules | Union |
   | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
   | *al-Nazarat* | 87,910 | 62,144 | 6,470 (10.41%) | 172 (0.28%) | 6,298 | 22,026 | 8,854 (14.42%), 1,158 | 7,450 (11.99%), 884 |
   | *Kalila wa Dimna* | 43,622 | 32,064 | 4,483 (13.98%) | 58 (0.18%) | 4,425 | 10,173 | 6,106 (19.31%), 557 | 5,165 (16.11%), 487 |
   | Tatoeba | 306,356 | 233,177 | 21,225 (9.10%) | 372 (0.16%) | 20,853 | 57,424 | 30,327 (13.14%), 5,168 | 24,099 (10.34%), 3,018 |

   The Yomitan and union columns give the wrong results and how many of them
   their rules make.
   - By kind, for *al-Nazarat*, *Kalila* and Tatoeba: decided by hand 29,630,
     16,801 and 118,925 positions, wrong 16.93%, 24.75% and 15.79%; listed
     with one lemma 23,190, 10,207 and 97,249, wrong 2.82%, 1.25% and 1.42%;
     not listed, one lemma by the clitic splits, 9,324, 5,056 and 17,003,
     wrong 8.57%, 3.90% and 6.23%.
   - The rules' wrong results are mostly a pronoun rule that writes ة for ت
     (54, 15 and 104 positions: دعوته → دَعْوَة for "I called him", صفعته,
     خدعته, ترجمتها, منحته; the judge also counts some nouns here, as
     وغبطتها), and ties between one-step readings of rare words (ويطفئ →
     طفئ, فيخيل → خال in *al-Nazarat*; كين → كان, a name, 24 in Tatoeba;
     بطلاقة → طَلَاق, 17).
   - **Rules against no rules** (`measure.py changes`): the first card
     differs at 29,275, 15,161 and 60,601 positions. Where the judge decides
     both, it goes from wrong to right at 1,963, 1,128 and 5,572 positions and
     from right to wrong at 10, 0 and 68. Of the 37,446 words and cards it
     cannot decide on one side (92,070 positions), I judged the 100 largest
     at e6ae266 by hand (19,918 positions; `sources/hand/changes.tsv`): the
     rules' card is right in 82 (11,845 positions) and wrong in 18 (8,073):
     توم and ياني (names; 4,758), أنها, أنني, أنهم and بأنه → أَنْ
     (496; Known gaps), إنه, إنها, إنك, فإنه,
     إنهم and فإن → إِن "if" for إِنَّ (1,423), بها and بي (the letter ب;
     717), بذلك → بذل (310), ولم → لَمَّ (201), أمره → أَمَرَ (98) and ديما
     (70). In most of them a copy with no rules has no card for the whole
     word.
   - **Hand samples** (`sources/hand/`, seed 20261104; `measure.py text
     --sample-out` draws each position by a hash of the seed and its index),
     judged with each card's gloss in its sentence. Of 100, 60 and 60
     positions drawn uniformly from those with a result, 16 (16.0%, Wilson
     95% 10.1-24.4%), 13 (21.7%, 13.1-33.6%) and 12 (20.0%, 11.8-31.8%) show
     a wrong first card. The fourth audit's uniform *al-Nazarat* samples at
     e6ae266 found 29 of 120; with mine, 45 of 220 (20.5%, 15.7-26.3%).
     - Of the sampled positions the script judges right, 7 of 137 are wrong
       by hand (the audit's: 23 of 180; together 30 of 317, 9.5%, 6.7-13.2%),
       so the script's rates are lower bounds: where a form-of target has no
       vowels, it accepts every entry of the spelling.
     - Of 50 more positions per text that the script does not judge (no card
       for the whole word, or no lemma), 16, 11 and 31 are wrong (22 of
       Tatoeba's are Tom).
5. **Performance** (host load 32-35 on 64 cores, so these are upper bounds).
   - Native `benchmark-lookup --languages languages --language ar --term
     <imported wty-ar-en>` on the 135 texts of `sources/benchmark-words.txt`
     (each word of 20 sentences written for the pack, with the rest of its
     sentence), 6 passes, the first dropped, three runs: p50 82.7-90.6 µs, p95
     234.8-264.8 µs. The budget is 1 ms p50.
   - Native pack load (`sources/pack-load.cpp`): `LanguageRegistry::add`
     median 4.74-4.77 ms over 50 runs, three runs; the registry holds
     7,194,096 bytes of heap. The 14,579 rules are mostly cross products,
     indexed by their endings.
   - WebAssembly, Hachidori feat/multi-language 803f7b6 engines (built from
     hoshidicts b145feb), Node 22:
     - `sources/wasm-load.mjs`, 10 fresh engines each: `hdw_language_load`
       median 14.66 ms single-thread and 14.87 ms threaded; live heap
       +3,558,336 bytes. The budgets are 50 ms and 20 MB.
     - `benchmark/node-lookup.mjs` with `HACHIDORI_LOOKUP_LANGUAGE=ar` on the
       same 20 sentences (135 hovers, 6 passes): `hdw_lookup` p50 202 µs and
       p95 509 µs single-thread, p50 221 µs and p95 539 µs threaded.
   - The pack has no `pattern` rule, so no pattern heap.
6. **Hachidori** (feat/multi-language 803f7b6 with this branch in
   `third_party/hoshidicts` and `node scripts/sync-languages.mjs`;
   `test/chrome-language-pack.mjs`, Chrome 152, wty-ar-en):
   - with the pack's 13 cases, 17 / 17 checks pass. Settings adds Arabic
     beside Japanese and imports the dictionary (1,019,773 terms); the
     hovered words find their headword first with their traces (واستعرتُ →
     استعار, سيكتبون → كتب, بالقلم → قلم, مفاتيحنا → مفتاح, تساعديني → ساعد,
     رأيتهم → رأى, كِتَابَهُ → كتاب); the Anki note and the switch to
     Japanese and back work;
   - with the first audit's 30 cases, 31 / 34 checks pass; the three that
     fail are the dictionary's cards of Known gaps (لم يقل → قلا, أنه → نهى,
     ابني → بنى). With the second audit's 33 cases, 37 / 37. With the third
     audit's 36 cases, 38 / 40: لم يقل → قلا (the reading key) and لا تنس →
     تنس "tennis" (the word's own entry) fail. With the fourth audit's 40
     cases, 44 / 44: تعطون, تدعون, تصلان, كبيرتان, يبدون, تصبحين, قلته,
     قابلته, تعالوا and يمر, which failed at the audit, pass. The check
     compares headwords only, so أنها passes as أن with the entry أَنْ, and
     الأشخاص as شخص with the verb entry (Known gaps);
   - `test/node-smoke-languages.mjs`: the pack loads and deinflects its
     warm-up sample; 36 of its 40 checks pass, and the 4 that fail are the
     aii, el, tl and zh packs, whose `lookup.untaggedTerms` the vendored
     engines predate.
7. **Conformance and checks**:
   - `language-conformance-test`: corpus.tsv 1,380 / 1,380, cases.tsv 517 /
     517, defaults.tsv 19 / 19 (with the pack's defaults), yomitan.tsv 304 /
     304, text.tsv 43 / 43, lookup.tsv 97 / 97; gaps.tsv 0 / 116 (reported).
   - `tests/classes.json` agrees with the engine (4 classes, 571 fields, 2
     steps).
   - `tools/check-yomitan.mjs`: 10,270 inputs, 155,534 Yomitan results, 0
     unexplained. The processors `normalizeUnicode`,
     `removeArabicScriptDiacritics`, `removeTatweel` and
     `convertAlifMaqsuraToYaa` agree; `addHamzaTop` and `addHamzaBottom` are
     the two listed differences.
   - `sources/ablate.py`: each of its 28 edits (a constraint, exclusion or
     condition removed, a listed word dropped, two processors swapped) makes
     the conformance test fail. Each of the 33 `lookup.tsv` rows added for
     the fourth audit fails when its whole word is removed, checked one by
     one (السرية, تعطين, يدعون, أعط, يعط, تعطون, نعط, دعتا, تدعون, تمدين,
     تضع, يصل, يصلان, تصلان, يجدان, الباردة, الوطنية, الأنفاق, بطريقة, والتي,
     سآتي, يبدون, قلته, قابلته, سمعته, يمر, مرت, الا, أخواتي, تعالوا and
     others).
   - Measured, not pinned by a test (no row fails without them):
     - the 23 whole words that choose between entries of one spelling
       (كافية, حرة, المقبل, …; Known gaps) and وقتي and صاحبي: `lookup.tsv`
       compares the first result's expression and matched text (docs/
       languages.md 12), and these entries share their expression;
     - صوت with a pronoun (the test dictionary does not reproduce what makes
       صوة win in wty-ar-en); the layout of ـي (my) after the verb
       transforms; `convertAlifMaqsuraToYaa` before `addHamza` and
       `removeQuranicMarks` first; the minimum stems of كـ and فـ; أقف, نصل,
       يثقون and يمكنك, which the rules already read the same way without
       their lists;
     - the « » and ” “ quote pairs and `untaggedTerms: filter` (measured in
       Text and scanning), which the conformance test does not exercise.
   - `tests/` and `sources/` hold 997,990 bytes.
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
   python3 languages/ar/sources/measure.py text <wty-ar-en.zip> <imported wty-ar-en> <text file> --homographs languages/ar/sources/homographs.tsv --split [--sample-out f.tsv --seed 20261104 --sample-sizes 30,50,50]
   python3 languages/ar/sources/measure.py changes <wty-ar-en.zip> <imported wty-ar-en> ar_50k.txt <text files> --homographs languages/ar/sources/homographs.tsv --out changes.tsv
   python3 languages/ar/sources/benchmark-words.py   # writes sources/benchmark-words.txt (not committed)
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
- **Wrong first results the dictionary makes** (Measurements 3 and 4;
  looked up with no rules, each is wrong too). The lead counts these as
  framework issues, not held for this pack; hachi-lang-engine-l has accepted
  `lookup.ownEntry: "afterReferences"` (a word's own form-of lemmas before its
  own entry) and `lookup.confirmedOrder: "references"`. They would help where
  the word's rows name the right lemma (أعرف → عرف), not where only the rules
  reach it (لك → لـ + ك) or the right entry is another reading of the same
  expression (لم). Counts are the subtitle list's tokens and the positions in
  *al-Nazarat*, *Kalila* and Tatoeba:
  - Another entry of the same spelling comes first (the dictionary's order):
    لم → لَمَّ "to gather" (963,831 tokens; 211, 214 and 2,971 positions; ولم
    87 and 98), و → the letter (2,169 in Tatoeba), بها and بي → the letter
    ب (بها 286 and 69, بي 55 and 146), قد → قَدَّ "to cut" (302,480 tokens; 184, 267,
    255), بعد → بَعُدَ "to be distant" (157, 55, 486), قبل → قَبِلَ "to accept"
    (105; 374), نعم → نَعَمَ "to live in comfort" (621,456 tokens), مثل →
    مَثَلَ (197,432 tokens; 60, 67), علي → عَلِيَ (162,651 tokens; 64, 43,
    338), شخص → شَخَصَ (219 in Tatoeba), الملك, الأسد and الكتاب → the
    entries for God, Leo and the Quran (388, 194 and 48 in *Kalila*; الكتاب
    247 in Tatoeba).
  - **A definite word shown as a verb entry** of its spelling, which grammar
    rules out after الـ: الأمور → أَمَرَ "to order", الرجال → رَجِلَ, الأشخاص →
    شَخَصَ, الصعب → صَعُبَ "to be hard", الأخبار, الدماء, الأعمال, الأولاد
    (64 of the 10,000 frequent entries, 393,806 tokens; 625, 189 and 895
    positions: النفوس 35, الأمور 32 and 70). The form-of rows name the noun
    or adjective without vowels, and the verb entry comes first in the bank;
    a copy with no rules shows the same cards.
  - **أن with a pronoun shown as أَنْ** "to" for أَنَّ "that", which alone
    takes a pronoun: أنها, أنني, أننا, بأنه, أنهم, بأنك and the others (30
    forms of the list, 585,363 tokens; 187, 39 and 500 positions). These
    forms have no row (a copy with no rules has no card for them); the
    pronoun rule reaches أن without conditions, and the bank lists أَنْ first.
    A whole word to أن reaches both entries in the same order (the fourth
    audit's copy). The same holds for إنه, إنها, إنهم, إنك and فإنه → إِن
    "if" for إِنَّ (733,991 tokens; 193, 208 and 979 positions). Both are the
    tie of one expression with two readings that the lead accepted for
    hachi-lang-engine-l, counted here.
  - The word is a headword itself, so its own entry comes first: لك (لـ + ك,
    shown as "lacquer"; 404,720 tokens; 138, 111 and 472 positions), لي (190,
    102, 635), لها (153, 79, 173), لهم (83), فلا (182, 64), وقد (86, 137), وفي
    (59), مني (36, 157), أني (73, 138), يدي (70), and verbs whose first person
    is another verb or an elative: أعرف (231,425 tokens; 302 in Tatoeba), تعرف
    (295), أرى, أذهب, أفعل, أشعر, تكون (210), تقول, تعال; also أمي, حياتي,
    أليس, النار (141).
  - A form-of row of the word names another lemma, which ranks first (section
    9.6): به → باه (193,490 tokens; 402, 314, 291), أنه and انه → نهى
    (543,689 tokens; 177, 85, 467), منه → أنهى (178, 176), أنك → ناك (221 in
    Tatoeba), لدي → ولد (336), بذلك → بذل (57, 226), فلما → فلم (193), فما →
    فم (123), بك → بيه (41), يده → دهي (60), ماري → مار (909 in Tatoeba),
    يمكننا → مكنن (80,195 tokens). The audit traces قلت, وقلت and لم يقل →
    قلا (100,043 tokens) to the reading key.
  - Names wty-ar-en lacks: كليلة → كليل "blunt" (50 in *Kalila*), دان (142
    in Tatoeba), جون.
- **Wrong first results the rules make** (Measurements 3 and 4): 3
  frequent words and 172, 58 and 372 text positions (0.28%, 0.18% and 0.16%
  of those judged).
  - **Imperatives** انهض → اِنْهَاضَ, انسي → نَسَّى and اشهر → شَهَرَ (9,801
    tokens): an imperative rule reaches another verb, or the verb entry of a
    noun's spelling (اشهر for أشهر "months"), in one step, as it reaches the
    right one, and the tie goes by the order the deinflections were found. A
    whole word انهض → نهض in the same transform does not change it.
  - **ة for ت before a pronoun.** A pronoun rule writes ة back for ت in one
    step, so a past verb with an object pronoun, which takes two steps, can
    show a noun in ة first: دعوته and دعوتك → دَعْوَة for "I called him",
    صفعته, خدعته, ترجمتها, منحته (54, 15 and 104 positions judged wrong; the
    judge counts some nouns here too, as وغبطتها). Whole words fix the
    frequent ones (قلته, قالته, قابلته, سمعته, كتبتها).
  - **The same spelling, another entry**, fixed for the fourth audit: a rule
    with conditions reaches only the entries that pass them, which then come
    first. 23 whole words without conditions, first in `listedNoun`, reach
    the bare spelling as the word's own form-of rows do, so its entries come
    in the dictionary's order: كافية, كافي, الكافي and كافيا → كَافٍ
    "enough", حرة → حُرّ "free", المقبل and المقبلة → مُقْبِل "next", العلوي,
    عارية, خالية, مستقرة, منخفضة, جدية, عشرات, خفيفة, كريمة, ضيقة, مؤقتة,
    مسرعة, طيبة, الطيب, كبيرتان and الكبيرات. `lookup.tsv` cannot pin them
    (Measurements 7).
  - Ties between one-step readings of rare words: ويطفئ → طفئ, فيخيل → خال
    (4 each in *al-Nazarat*), كين → كان (24 in Tatoeba, a name), بطلاقة →
    طَلَاق (17).
- **Ambiguous words** (several lemmas, no hand decision: 22,026, 10,173 and
  57,424 positions, and 1,517 frequent words) are not judged by script. The
  uniform hand samples of Measurements 4 include them, and 19 of 50 sampled
  ambiguous frequent words show a wrong card (Measurements 3), mostly a rare
  sense or another word of the spelling first (خيارات → "cucumber", أسنان →
  "to sharpen", نساء → "longevity", الثور → Taurus).
- **Words the dictionary does not have** get the rules' or a shorter
  match's reading: names (Tom: توم → آم is 22 of the 50 unjudged positions of
  the Tatoeba hand sample, and توم is 3,057 of its 306,356 words; also Maria,
  Ziri, Bruno, Boris) and rare words read as a root (كنانة → كن, فولتير →
  تر).
- **Yomitan's 78 negatives not kept** (their reasons are `*` in `tests/yomitan.tsv`; `build-final.mjs` lists them in `sources/yomitan-tests-not-kept.tsv`, which is not committed):
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
