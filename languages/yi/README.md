# Yiddish (`yi`)

Deinflection rules, text processors and scanning settings for Yiddish in the
standard (YIVO) spelling, which the recommended dictionary, wty-yi-en, uses
for its headwords: pointed alefs (אַ, אָ), פּ and פֿ, ײַ for /ay/ and יי for
/ey/, final letters at the end of a word. Text is right to left. A lookup
starts at the hovered word and tries only prefixes that end at a word
boundary (`word` / `word` / `spaces`, docs/languages.md 14.1), so a
separable verb is read over two words (`הייבט אָן` → אָנהייבן).

Most Yiddish text online is unpointed (96.8% of the words of 300 random
Yiddish Wikipedia articles) or half-pointed. The `addPoints` processor adds
the points such text leaves out (`פארשטאנען` → פֿאַרשטאַנען, `זיין` → זײַן,
`ישראל` → ישׂראל, `אוועק` → אַוועק) at one processor step, so a word found
as written comes first. The pack reads both kinds of text; the measurements
below give each its own numbers.

## Sources and licences

- `sources/own-rules.mjs` (generator), `sources/own.json` and every rule of
  `transforms.json`: written for this pack (GPL-3.0-or-later) from the
  standard description of YIVO Yiddish morphology and spelling, before
  Yomitan's Yiddish rules were read (commit `yi: own rules`). The lists of
  strong participles and irregular forms were checked against the corpus
  below; no table was copied.
- `sources/yomitan.json`: Yomitan's Yiddish rules,
  [`ext/js/language/yi/yiddish-transforms.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/yi/yiddish-transforms.js),
  ported by `tools/port-yomitan-transforms.mjs`; `sources/map-yomitan.mjs`
  maps its 60 umlaut `todo` rules. `sources/yomitan-processors.json` holds
  Yomitan's four Yiddish processors in pack format
  ([`yiddish-text-preprocessors.js`](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/yi/yiddish-text-preprocessors.js),
  [`yiddish-text-postprocessors.js`](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/yi/yiddish-text-postprocessors.js)).
  `sources/yomitan-tests.tsv` is Yomitan's
  [Yiddish transform test](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/yiddish-transforms.test.js),
  converted by `tools/port-yomitan-tests.mjs`. All GPL-3.0-or-later,
  Copyright (C) 2024-2026 Yomitan Authors (the test: 2023-2026 Yomitan
  Authors, 2020-2022 Yomichan Authors). None of these rules or processors is
  in the final pack (Rule provenance).
- `tests/corpus.tsv` and `tests/gaps.tsv`: 1,000 form → lemma pairs sampled
  with seed 1 by `sources/build-corpus.py` from the inflection tables of
  English Wiktionary's Yiddish entries as extracted by kaikki.org
  ([kaikki.org-dictionary-Yiddish.jsonl](https://kaikki.org/dictionary/Yiddish/kaikki.org-dictionary-Yiddish.jsonl),
  wiktextract 19f9a30, enwiktionary dump of 2026-10-01, sha256
  `b3ec2901…921a`), CC BY-SA 4.0 and GFDL, by the Wiktionary contributors.
  The sample has 70 first, 70 second and 70 third person singular present
  forms, 21 plural present forms, 75 separable present forms (`קערסט
  איבער`), 2 imperatives, 112 past and 40 present participles, 250 noun
  plurals, 60 diminutives, 180 declined adjectives and 25 comparatives and
  25 superlatives, one row per form, lemma and part of speech, each lemma a
  wty-yi-en headword with definitions. The 976 rows the final rules reach are
  in `corpus.tsv`, the 24 others in `gaps.tsv`. UniMorph has a Yiddish set
  ([unimorph/yid](https://github.com/unimorph/yid) at 9156c6f, 7,986 rows),
  but its generator dropped -ער and -ען from stems (`אַנדער` → `אַנדע`, `אַקערן`
  → `אַקן`), so it was not used.
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`,
  `tests/dictionary/`, `sources/constructed.tsv`,
  `sources/preferred-lemmas.tsv`, `sources/benchmark-sentences.txt`,
  `sources/benchmark-sentences-unpointed.txt` and the rest of
  `language.json`: written for this pack (GPL-3.0-or-later). The rows of
  `sources/constructed.tsv` are forms of common lemmas for every ending
  Yomitan's rules read, each attested in wty-yi-en or kaikki, except the ten
  dialect second person plurals in -טס that only Yomitan's rule reads.
  `sources/preferred-lemmas.tsv` is the hand decision, for 173 frequent
  words with several readings, of which readings a first result may show
  (Measurements).
- Not committed, used for the measurements below (all in
  `hachi-lang-cache/yi/`):
  - the recommended dictionary
    [wty-yi-en](https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/yi/en/wty-yi-en.zip)
    from [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan),
    revision 2026.10.22 (wty 61eaa08, sha256 `892d15b0…37f7`), CC BY-SA 4.0
    (Wiktionary through kaikki.org): 59,930 term rows, 49,611 of them form-of
    rows, 58,213 headwords, 43,497 of them with points;
  - Yiddish Wikisource (`yiwikisource-20261101-pages-articles.xml.bz2`,
    sha256 `ecc37bf8…b2fc`): the real texts, Mendele Moykher-Sforim's *Kitser
    masoes Binyomin hashlishi* (1878; page revision 19504) and M. Stern's
    *Hershele Ostropoler un Motke Khabad* and *Motke Khabad* (New York,
    1920s; revisions 19095 and 19100), in Wikisource's modern spelling,
    public domain; and, for the frequency list, the 32 other pages of at least
    1,000 words in YIVO spelling (at least 70% of their words wty-yi-en
    headwords, at least 25% pointed), 758,702 words, public domain or CC
    BY-SA 4.0 as Wikisource publishes them;
  - Yiddish Wikipedia (`yiwiki-20261101-pages-articles.xml.bz2`, sha256
    `ea0bef1f…8c8f`), CC BY-SA 4.0: 300 random articles of at least 100
    words (seed 1) as the unpointed text, and the unpointed words of the
    whole dump for the `addPoints` decisions;
  - Tatoeba's Yiddish sentences (`yid_sentences.tsv.bz2` of 2026-11-03,
    27,547 sentences, sha256 `5a044beb…d5a`), CC BY 2.0 FR.

## Rule provenance

`transforms.json` has 21 transforms and 883 rules: 667 `own`, 216 `both`
and no `yomitan` rule (`sources/build-final.mjs`). It is `sources/own.json`
with the own rules that read the same ending as a Yomitan rule marked `both`.

- **`both`**: an own rule that reads the same ending, for the same form, as a
  Yomitan rule: a plural ending (-ס, -ן, -ען, -ער, -ים, -עס, -ות, and -עך after
  a diminutive), -ער or -ן with the same vowel change (ע for אַ or אָ, י for
  ו, יי for וי), a diminutive ending (-ל, -עלע, -קע, -טשיק), alone or with
  those vowel changes, and the present endings -סט and -ט and the
  participle's -נדיק. Yomitan's rules give a verb's first person form or a
  stem with a medial final letter (`קויפֿט` → `קויפֿנ`), the own rules the
  infinitive with its final letter (`קויפֿן`), so `both` means the same
  ending is read, not that the outputs are equal.
  `sources/yomitan-provenance.tsv` lists, for each of Yomitan's 83 rules,
  the own transforms that read its ending, or why none does.
- **Yomitan rules left out: all 83.** In the union (`tools/merge-transforms.mjs`,
  with Yomitan's postprocessors, without which Yomitan's rules reach almost no
  wty-yi-en headword), `eval-language --per-rule` gives Yomitan's rules:
  - the corpus sample: no row only they recover, 29 false candidates only
    they add;
  - the 7,832 single-word inflection references of wty-yi-en: 5 rows, of
    which 2 are malformed participles of the dictionary (`אַפּליקירטנדיק`,
    `פֿאַרוויגטנדיק`) and 1 is `מענען` → מאַן; 133 false candidates;
  - `sources/constructed.tsv`: the 8 dialect second person plurals in -טס
    (`מאַכטס` → מאַכן); 11 false candidates;
  - `tests/cases.tsv`: 12 negatives broken (`ביים` → בוים, `טייער` → טיי,
    `מיינע` → מיינען), 4 false candidates.

  On the real texts the union changes 296 first results. None becomes right
  and 105 that were right stop being so: the diminutive -ל reads `ווייל`
  (because) as וויי (61 places), the plural -ער reads `פריער` (earlier) as
  פּרי (42) and `ווערטער` as ווערט (22), -ות reads `שאלות` as שאל (9), and -קע
  and -ן read the name `מאָטקע` as מאָט (39). The wrong first results the
  script judges rise from 1,282 to 1,375. The -טס rule, the only one that
  reads a form the own rules miss, reads `וועלטס` (the world's) as וועלן (to
  want; 153 places in Wikipedia and Wikisource) and `גייטס` (Gates) as גיין,
  against about 30 dialect forms in Hasidic texts on Wikisource (`שטעלטס ענק
  פאר`).
- **Yomitan's processors left out: all four** (`sources/yomitan-differences.tsv`).
  `removeYiddishDiacritics` replaces the text with its letters alone, so
  pointed text never reaches wty-yi-en's pointed headwords: with Yomitan's
  processors the final rules reach 36.8% of the corpus sample, first rank
  34.0%, instead of 97.6% and 91.0%. `combineYiddishLigatures` writes letter
  pairs as one character (וו → װ), which wty-yi-en never does, and
  `convertYiddishLigatures` undoes it; `convertFinalLetters` writes the
  final letter Yomitan's rules leave medial, which the own rules write
  themselves. The pack's processors do the reverse of Yomitan's:
  - `normalizeUnicode` (NFKC, replacing the text): presentation forms (ﬠ,
    ײַ as one code point, ﭏ) as letters and points;
  - `splitLigatures`: װ, ױ, ײ (without patah) as two letters, ײַ kept and ייַ
    written ײַ, as wty-yi-en spells them;
  - `normalizeApostrophes`: `'` and `’` as geresh (ס'איז → ס׳איז), `"` as
    gershayim (ד"ר → ד״ר);
  - `addPoints`: the combinations of the points an unpointed letter can
    take, at most 512 per text: א as א, אַ or אָ (not before ו or י, where it
    is silent, except before consonantal וו: `אוועק` → אַוועק), פ as פּ or פֿ,
    יי as ײַ or ייִ, ווו as וווּ, ב, כ, ת as בֿ, כּ, תּ, and ש as שׂ. A key for
    each pointed form keeps pointed text from gaining a second point.
- **Own rules** (`sources/own-rules.mjs`), one transform per form so a trace
  names it:
  - the present tense: the stem (first person singular, singular imperative,
    and the third person of stems in -ט), -סט, -ט, and the plural where it is
    not the infinitive, for every stem ending: -ען after ם, ן, נג, נק and a
    syllabic ל or ן, -ן after the others, vowel stems (`גייט` → גיין, `ציט` →
    ציִען, `שרײַט` → שרײַען), the final letters;
  - irregular verbs: זײַן, האָבן, געבן, טאָן, וויסן, וועלן, the auxiliaries
    וועל, וואָלט, פֿלעג; pronoun + זענען or זענט;
  - past participles: גע- … -ט, after a separable particle too
    (`אָנגעהויבן`), and without גע- after an unstressed prefix
    (`פֿאַרקויפֿט`, `דערציילט`) and in verbs in -ירן (`שטודירט`); 146
    strong participles with their changed stems, with or without גע-
    (`געשריבן`, `פֿאַרשטאַנען`, `באַשלאָסן`); present participles in -נדיק;
    all of them declined as adjectives (`פֿאַרקויפֿטע`);
  - separable particles: written after the verb (`הייבט אָן` → אָנהייבט →
    אָנהייבן) and with צו before the infinitive (`אָנצוהייבן`);
  - the clitic -טו for דו (`האָסטו`, `ביסטו`, `ווילסטו`);
  - compound verbs of a word and האָבן, זײַן or ווערן with the auxiliary
    before the word (`האָט ליב` → ליב האָבן, `איז מסכּים` → מסכּים זײַן) or
    as a participle after it (`ליב געהאַט`);
  - noun plurals: -ן, -ען, -ס, -עס, -ער with or without a vowel change, a
    vowel change alone (`טעג`, `הענט`), the Hebrew -ים, -ות and -יות, and
    irregular plurals (`ברידער`, `נשים`, `ימים`, `פֿייגל`); the accusative and
    dative of nouns in -ע (`טאַטן`);
  - diminutives in -ל, -עלע, -לע, -קע, -טשיק and their plurals in -לעך, with
    the vowel change;
  - adjectives: -ע, -ער, -ן or -עם, -ס, with the ע that syllabic ל and ן take
    (`אָפֿענע`, `איידעלע`), adjectives in -ע (`מאָדנער`) and in -י (`פֿריִע`);
    comparatives and superlatives with the vowel change and the irregular
    בעסער, ערגער, מער, נעענטער;
  - `unpointed`: 13 frequent unpointed words whose pointings tie or would be
    read wrong, read as their usual pointed word with no processor step:
    `זאל` → זאָל (should, not זאַל hall), `דאך` → דאָך, `וואך` → וואָך, `וואכן`,
    `שלאף`, `קאסטן`, `פאן`, `פארן`, `אב`, `גלייך` → גלײַך, `פירער`, `מיי`,
    `שייכות`.
- **Stem constraints.** Every suffix rule reads one word (`stemCharacters:
  "[^ ]"`), so a short ending never fires on a word before a space (`די
  טישן` is not `די טיש`, `מיר זאָגט` is not `מיר זאָגן`). Where a constraint
  stops a real false candidate, a negative row of `tests/cases.tsv` shows it:
  - a vowel stem takes -ען or -ן only after a vowel (`די` is not דין, `ציט`
    not צין), a stem in -ע takes -ען not after י, מ or נ (`מיינע` and `נייע`,
    unpointed מײַנע and נײַע, are not מיינען and נייען), and -ענען needs a
    stem of three code points (`טרעט` is not טרענען, `זע` not זענען);
  - noun and adjective endings need a stem that does not end in a medial
    letter (`וואָכן` is not וואָכ) and a plural -ער one that does not end in a
    vowel (`טייער` is not טיי);
  - a vowel change alone makes a plural only from ע for אַ or אָ; the other
    such plurals are written out (`ביים` is בײַם, not a plural of בוים;
    `גביר` is not one of גבור); a plural with a vowel change comes before the
    same ending without one (`ווערטער` → וואָרט before ווערט);
  - the vowel change needs a consonant after the vowel (`גיין` is not גוי,
    `איין` not אוי);
  - a separable particle is not read after a participle (`געשטאַנען אויף` is
    "stood on", not אויפֿשטיין), nor צו after זאָג- or גיי- (`זאָגט צו אים`
    is "says to him", not צוזאָגן: 17 of the 20 such places in the real
    texts), and a compound verb not before a pronoun (`האָט מיר` is not מיר
    האָבן);
  - -קע after a consonant needs a stem of five code points (`מאָטקע` is a name,
    not a diminutive of מאָט).

  `sources/mutations.py` deletes each constraint in a scratch copy, per
  transform and per value: each of the 78 deletions makes a test fail. The
  conditions of the separable, compound-verb and participle rules, every
  `addPoints` key, `wordInternal` and `searchResolution` also have rows that
  fail without them. `sources/mutation-gains.py` found the false candidates
  each constraint prevents on 150,000 words and phrases of the real texts and
  Tatoeba. Five transforms (1pl, adjE, adjS, comparative, superlative) have no
  minimum stem: deleting it added no headword there.
- **History.** The first commit, `yi: own rules`, has the rules as written
  before Yomitan's file was read (20 transforms, 706 rules). Later commits,
  after measuring:
  - `v` and `n` got Yomitan's subconditions (the merge tool requires equal
    conditions), and noun rules give `ns`;
  - corpus misses: verbs in -ייִען, -וולען, -דזשען and -שטשען, the particles
    אום and פֿיר, 42 more strong participles, plurals in -ס after a final
    letter and in -עס, -ים after ה, -יות, more diminutive endings,
    comparatives in -ענער and superlatives in -שט, the present participle
    -לנדיק and the plural -נען of verbs in syllabic -ן;
  - adjectives in -ע and -י and syllabic -ל before -ן (`מאָדנער`, `פֿריִע`,
    `איידעלן`), and the compound verbs with the participle after the word;
  - real-text collisions: the constraints above, `ווו`, ב, כ and ת in
    `addPoints`, pronoun + זענען;
  - after the first audit (audit-hachi-lang-yi, two MAJOR and six MINOR
    findings): the stricter judge and the Wikipedia measurement; the `addPoints`
    keys for אוו and ש and the 512-variant limit; the `unpointed` transform;
    participles without גע- and their declension; -ענען with a three-letter
    stem; צו after זאָג- and גיי-; the plural vowel change first; tests for
    every reading, prefix, key and setting the audit could delete unnoticed.

## Measurements

All with wty-yi-en 2026.10.22 as published, form-of rows included, imported
by `hoshidicts-cli import`, at hoshidicts 7c854db (GCC 14.3, Release). The
pack has no optional processor, transform or variant pass, so every number is
the same with every option on and with the defaults.

1. **`eval-language --dictionary`** (`sources/measure.py tables`), with the
   pack's processors. "+ post" adds Yomitan's two postprocessors, without
   which Yomitan's rules leave medial final letters. Recall / false candidates
   per row / first rank; negatives passed for `cases.tsv`:

   | Rules | corpus + gaps (1,000) | cases.tsv (334) | wty forms (7,832) | constructed (152) | Yomitan's test (34) |
   | --- | --- | --- | --- | --- | --- |
   | Own (`sources/own.json`) | 97.6% / 0.098 / 91.0% | 100%, 100% neg / 0.291 / 80.3% | 95.3% / 0.086 / 94.9% | 92.8% / 0.230 / 81.6% | 20.6% |
   | Yomitan (`sources/yomitan.json`) | 20.3% / 0.050 / 60.3% | 6.7%, 85.0% neg / 0.150 / 55.5% | 8.2% / 0.038 / 94.8% | 38.2% / 0.151 / 66.5% | 100% |
   | Yomitan + post | 31.4% / 0.073 / 67.7% | 9.1%, 85.0% neg / 0.181 / 57.5% | 13.7% / 0.053 / 94.8% | 65.8% / 0.224 / 76.3% | 67.6% |
   | Union (merge tool) | 97.6% / 0.118 / 90.6% | 100%, 85.0% neg / 0.299 / 79.9% | 95.3% / 0.097 / 94.9% | 92.8% / 0.283 / 79.6% | 100% |
   | Union + post | 97.6% / 0.128 / 90.6% | 100%, 85.0% neg / 0.311 / 79.9% | 95.4% / 0.105 / 94.9% | 98.0% / 0.322 / 84.2% | 67.6% |
   | **Final (`transforms.json`)** | **97.6% / 0.098 / 91.0%** | **100%, 100% neg / 0.291 / 80.3%** | **95.3% / 0.086 / 94.9%** | **92.8% / 0.230 / 81.6%** | 20.6% |

   - The final set is the own set with provenance marks, so its numbers are
     the own set's. "wty forms" are the 7,832 single-word inflection
     references of wty-yi-en (`measure.py forms`; spelling variants and
     alternative forms left out).
   - Yomitan's test writes its terms as Yomitan's rules leave them, with a
     medial final letter (`קויפֿנ`) and often without points (`מאנ`), and some
     of its sources are no standard form (`בוךערס`, `קוכןסער`, `ליפענעס`), so
     it is in `sources/`, not `tests/`.
   - First rank on the corpus is the share of rows whose whole-word lookup
     shows the lemma first. Most of the others show a wty-yi-en entry of the
     form itself, a noun or adjective spelled like the verb form (`אַקער`,
     `האַס`, `דינג`).
   - `lookup.untaggedTerms`: 1,987 of wty-yi-en's 59,930 rows have no
     `rules` (names 747, alternative-spelling rows 630, interjections,
     prepositions, affixes, phrases, pronouns), and no part of speech the
     rules produce is untagged, so the pack keeps the default `"filter"`.
     With `"pass"` false candidates rise on every file (corpus 0.114, cases
     0.347, wty forms 0.102, constructed 0.270, Yomitan's test 0.882), first
     rank falls on the corpus (90.8%) and recall does not change.
2. **How first results are judged** (`sources/measure.py`, `judge`). A first
   result is right when it is the lemma the matched text's inflection
   references name in wty-yi-en (a named lemma whose rows are only references
   standing for the lemmas they name: `בעסטער` → בעסט → גוט), or, for the 173
   frequent words of `sources/preferred-lemmas.tsv` with several readings
   (`געווען`: "been" or "the past"), one of the readings decided there by
   hand. A word without inflection references is right as itself or as the
   lemma of its spelling references. An "Unpointed form of X" entry counts as
   X. A word outside the table with both an entry and an inflection
   reference counts either as right, separately ("right-ambiguous"). Where
   the matched text has no row, the rows of its `addPoints` variants judge
   ("right-variant", "wrong-variant"). wty-yi-en's rows for `מיר זענען`,
   `איר זענט` and `זיי זענען` name only מסביר זײַן (a split table): such a
   first result is "wrong-dictionary". Words the dictionary does not have
   are "unjudged" and are sampled by hand.
3. **Frequent forms** (`measure.py freq`): of the 10,000 most frequent words
   of the 32 YIVO-spelled Wikisource pages (758,702 words), 1,455 (92,196
   occurrences) have an inflection reference that names a lemma a rule
   reaches. Looked up alone, 65 of them (10,638 occurrences, 1.40% of the
   list's words) show a wrong first result:
   - 62 words (10,207 occurrences) show their own entry, which the exact
     match ranks first (docs/languages.md 9.6): `געווען` (3,368) "the past",
     `האָב` (1,966) "property", `וועט` (1,860) "bet", `וועלן` (709) "to
     want" for the future auxiliary, `ווערט` (507) "value", `בעט` (350)
     "bed", `מאַכט` (322) "might", `גיי` (186) "come on!", `ווייס` (173)
     "white", `לידער` (138) "leader";
   - 2 show a rule's reading on a tie with the dictionary's: `געהערט` (261)
     → געהערן (it belongs) before הערן (heard), `גייען` (146) → the adjective
     גיי, whose form wty-yi-en lists, before גיין;
   - `אונזערע` (24) finds nothing: its row names `אונזער`, whose row names
     `אונדזער` (one hop reaches nothing; docs/languages.md 16).
4. **Behind pronouns, clitics, articles and auxiliaries** (`measure.py
   phrases`): Tatoeba's 46,446 places where a word follows איך, דו, ער, זי,
   עס, מיר, איר, זיי, מען, ס׳, כ׳, מ׳, דער, די, דאָס, דעם, אַ, אַן, a form of
   האָבן, זײַן, וועלן or וואָלט, or זיך, looked up from that word to the end of
   the sentence:
   - 43,132 right (236 of them through a variant); 655 not judged by script,
     compound verbs (`האָב ליב` → ליב האָבן, `האָט מורא` → מורא האָבן), right;
     367 with no result;
   - 2,292 wrong: the auxiliaries' own entries (`האָב` 1,042 "property",
     `וועט` 348 "bet", `וועלן` 135 "to want"), the split-table rows (612:
     `מיר זענען` 269, `איר זענט` 214, `זיי זענען` 129), and wty-yi-en's rows
     for `איך וועל`, `מיר וועלן` and `זיי וועלן`, which name וועלן (to want)
     beside the auxiliary וועל and tie (155).
5. **Real text, pointed** (`measure.py text`): every word of the three
   Wikisource texts, looked up from the word to the end of its sentence,
   66,644 lookups.
   - Right by script: 55,962 (50,614 as written, 50 ambiguous, 5,298
     through a variant).
   - Wrong by script: 1,282 (1.9%). 1,081 are own entries ranked first by
     the exact match (`געווען` 308, `האָב` 269, `וועט` 197, `וועלן` 58, `גיי`
     49, `מאַכט` 40, `ווערט` 37, `בעט` 36, `שיינע` 34 "a name", `ווייס` 28);
     68 are wty-yi-en's references (`איך וועל` → וועלן 55, `פּלוצלונג` →
     פּלוצעם 9, `גערן` → יערן 4); 41 are the split tables; 92 are rule
     readings (`געהערט` → געהערן 28, `לייט` (unpointed לײַט, people) → לייטן
     24, `גייען` → גיי 13, `ווערטלעך` → ווערט 7).
   - By hand (`unjudged` by script: 2,572): random samples, seeds 11-12: of
     100 judged right, 2 are wrong in context (`אייער` eggs shown as "your",
     `וועלן` the auxiliary shown as "to want"); of 20 right-variant, none; of
     50 unjudged, 5 (the name `מענדעלע` → מאַנדל twice, `אויסן` → אויס,
     `קישעלעך` → קוש, `הערט ער אויף` → הערן for אויפֿהערן).
   - So about 1,282 + 1,000 + 260 ≈ 2,550 wrong first results (3.8%); the
     share in the right bucket is the least certain (2 of 100).
   - No result: 6,828, mostly names (`סענדערל`, `הערשלען`), Hebrew words
     wty-yi-en lacks or spells otherwise, and pieces of abbreviations (`ר` of
     `ר׳`).
6. **Real text, unpointed** (`measure.py wiki`): every word of 300 random
   Yiddish Wikipedia articles (seed 1), 140,997 lookups, 3.2% of the words
   pointed.
   - Right by script: 101,113 (70,588 as written, 83 ambiguous, 30,442
     through a variant).
   - Wrong by script: 4,278 (3.0%). 4,126 are own entries ranked first: the
     article `א` shown as the letter alef (2,607), `געווען` 866, `ווערט` 303,
     `וועט` 170, `וועלן` 70, `לידער` 26; 66 the split tables; 69 rule
     readings (`געהערט` 22, `גייען` 18, `לייט` 6); 17 references.
   - By hand (seed 13): of 30 judged right, 2 are wrong (both the article
     `א`, now judged by script); of 40 right-variant, none; of 40 unjudged
     (4,957), 8 (`וואונדער` → וווּנד, `פלייטס` → פֿלייט, `שמעלצער` → שמאַלץ,
     `אנקום` → אָנקומען, `געהאלט` → האַלטן, the letters `עף` → עפֿענען, the
     abbreviation `אר` → אַרן, the name `ציגלער` → ציגל), so about 990.
   - So about 4,278 + 990 ≈ 5,300 wrong first results (3.8%).
   - No result: 30,649 (21.7%): pieces of abbreviations and dates (`ה`, `ס`,
     `טן`), names, and spellings that are neither YIVO nor its unpointed
     form (`אסאך`, `עטליכע`, `פאראייניגטע`, `שטענדיג`, `ארבייטער`).
7. **Performance** (docs/languages.md 13): the 107 hover texts of
   `sources/benchmark-sentences.txt` (each word of ten sentences written for
   the pack, to the end of its sentence) and of its unpointed copy
   `sources/benchmark-sentences-unpointed.txt`.
   - Native `benchmark-lookup --languages languages --language yi` (wty-yi-en
     mapped, 6 passes, the first dropped, three runs at machine load 47-53):
     pointed p50 25.9-26.5 µs, p95 58-62 µs; unpointed p50 41.4-42.5 µs, p95
     176-178 µs, max 0.88 ms. The 140,997 Wikipedia hovers: p50 48.0 µs,
     p95 360 µs, p99 924 µs, max 7.5 ms (the 512-variant limit of `addPoints`
     took the maximum from 50 ms). Budget 1 ms p50.
   - Hachidori feat/multi-language 803f7b6 prebuilt engines, Node 22,
     `benchmark/node-lookup.mjs` with `HACHIDORI_LOOKUP_LANGUAGE=yi`:
     `hdw_lookup` pointed p50 79.9 µs, p95 165 µs single-thread, p50 90.5
     µs, p95 187 µs threaded; unpointed p50 109.9 / 117.6 µs, p95 398 / 399
     µs.
   - `hdw_language_load` (`sources/wasm-load.mjs`, 10 fresh engines): median
     7.97 ms (max 14.0) single-thread, 8.21 ms (15.9) threaded. Live heap
     after the load: +1,271,936 bytes. Budgets 50 ms and 20 MB.
   - The pack has 56 `pattern` rules (35 separable particles, 21 compound
     verbs); a copy without them loads with about 133 KB less heap.
8. **Hachidori in Chrome** (`test/chrome-language-pack.mjs` on
   feat/multi-language 803f7b6 with this branch in `third_party/hoshidicts`,
   Chrome 152.0.7977.75, wty-yi-en.zip): 20 of 20 checks pass. Settings adds
   Yiddish beside Japanese and imports the dictionary (0.5 s); hovered words
   in right-to-left pages find their lemma first, pointed and unpointed
   (`הייבט` → אָנהייבן over `הייבט אָן`, `האָסטו` → האָבן, `שענסטע` → שיין,
   `פארשטייט` → פֿאַרשטיין, `זאל` → זאָל, `אוועק` → אַוועק, `ישראל` →
   ישׂראל); the Anki note and the switch to
   Japanese and back work.
9. **Checks**: `language-conformance-test` (corpus.tsv 976/976, cases.tsv
   334/334, text.tsv 58/58, lookup.tsv 40/40; gaps.tsv 0/24 reported);
   `tools/check-classes.mjs yi`; `tools/check-yomitan.mjs` (2,696 rule inputs,
   8,884 Yomitan results, no unexplained difference; the four unpaired
   processors listed); `sources/mutations.py` (78 of 78 deletions fail a
   test).
10. **Commands.** Each number above comes from one of these, with the inputs
    of Sources and licences in `<cache>`:

    ```sh
    node languages/yi/sources/own-rules.mjs && node languages/yi/sources/build-final.mjs
    python3 languages/yi/sources/build-corpus.py <cache>/kaikki.org-dictionary-Yiddish.jsonl <cache>/wty-yi-en-json
    python3 languages/yi/sources/measure.py forms <cache> <cache>/work/forms.tsv
    python3 languages/yi/sources/measure.py tables <cache> <out>
    python3 languages/yi/sources/measure.py freq|text|phrases <cache> languages <out>
    python3 languages/yi/sources/measure.py wiki <cache> languages <out> 300 1
    python3 languages/yi/sources/mutations.py; python3 languages/yi/sources/mutation-gains.py <cache> <mutations output>
    python3 languages/yi/sources/per-rule.py <rules.json> <eval-language --per-rule output>
    build/benchmark-lookup <hover texts> 6 --languages languages --language yi --term <cache>/wty-yi-en --json
    node languages/yi/sources/wasm-load.mjs <hachidori checkout> 10
    ```

    `measure.py` looks texts up with `build/lookup-batch`, built from
    `languages/en/sources/lookup-batch.cpp` as its header says. `measure.py
    wiki` writes the Wikipedia hover texts the benchmark reads.

## Known gaps

- **A word's own entry comes first** (docs/languages.md 9.6: an exact match
  has no trace step, so it ranks before every rule reading and every
  reference, even the word's own). This is most of the wrong first results:
  `געווען` "the past" for "been", `האָב` "property", `וועט` "bet", `וועלן`
  "to want" for the future auxiliary, `ווערט` "value" for "becomes", `מאַכט`
  "might", `בעט` "bed", `גיי` "come on!", `ווייס` "white", `שיינע` the name,
  and in unpointed text the article `א` shown as the letter alef: 62 of the
  frequent words (10,207 occurrences), 1,081 places in the pointed texts,
  1,525 in Tatoeba and 4,126 in Wikipedia. The pack cannot reorder them:
  a rule reading always has a trace step. A framework option that ranks the
  matched text's own inflection references before its own entry would fix
  them; it is reported to the lead with these counts.
- **Dictionary rows and ties** (docs/languages.md 9.6 and 9.10, framework
  issues the lead accepted for a later framework pull request):
  - wty-yi-en's rows for `מיר זענען`, `איר זענט` and `זיי זענען` name only
    מסביר זײַן, from a split table: 612 Tatoeba places, 41 in the pointed
    texts and 66 in Wikipedia. The pack's whole-word rules give זײַן at the
    same length, steps and trace length, and the dictionary-confirmed
    reading wins the tie (the whole-word tie rule of hachi-lang-engine-l
    would reverse it);
  - the rows of `איך וועל`, `מיר וועלן` and `זיי וועלן` name both וועלן (to
    want) and the auxiliary וועל, and discovery order puts וועלן first: 155
    Tatoeba places, 55 in the pointed texts (`lookup.confirmedOrder` would
    order them by the row);
  - a rule reading ties with the dictionary's: `געהערט` → געהערן (it
    belongs) before הערן (heard), 28 places in the pointed texts and 22 in
    Wikipedia; `גייען` → the adjective גיי before גיין, 13 and 18;
    `ווערטלעך` (sayings) → ווערט before וואָרט, 7;
  - rows that name a spelling whose own row is a reference, such as
    `אונזערע`, reach nothing (one hop, docs/languages.md 16).
- **Unpointed text.** A word found as written, through a rule, comes before
  its pointed lemma found through `addPoints`, which costs a processor step:
  `לייט` (unpointed לײַט, people) → לייטן (to solder; 24 places in the
  pointed texts), `יינגל` (ייִנגל, boy) → יונג. The 13 whole words of the
  `unpointed` transform fix the most frequent such words of Wikipedia; others
  remain. `addPoints` adds no hiriq to a single yod (`פריער` finds the
  comparative of פֿרי, not the adverb פֿריִער) and keeps at most 512
  combinations per text, so a long run of unpointed words can lose a
  pointing (4 places in the Wikipedia sample, all still finding a shorter
  phrase). Unpointed lookups cost more: p95 0.36 ms on Wikipedia, p99 0.92
  ms, max 7.5 ms (Measurements 7). 21.7% of the Wikipedia lookups find
  nothing, against 10.2% in the pointed texts, mostly spellings that are
  neither YIVO nor its unpointed form.
- **Readings the rules make that are wrong in context** (hand samples above):
  nouns read as plurals or diminutives of a shorter noun (`וואונדער` →
  וווּנד, `קישעלעך` → קוש, `שמעלצער` → שמאַלץ), adverbs and nouns read as
  forms of other words (`אויסן` → אויס, `אנקום` → אָנקומען, `געהאלט` →
  האַלטן), and names read as diminutives (`מענדעלע` → מאַנדל, `מאָטל` → מאָט).
- **Separable particles that are prepositions.** The pack's 35 patterns read
  a verb and a following particle as the particle verb; wty-yi-en itself has
  only 15 such rows. After the guards above, 78 first results in the
  pointed texts are such readings; most are right (`נעמט אַרויס`, `שטיי
  אויף`, `גיי אַהיים`), but a particle that is a preposition in context
  reads as the particle verb when it ends the scanned prefix (`גייט מיט
  גרויס מי` → מיטגיין, `שטייט אויף אַ בענקל` → אויפֿשטיין). A reflexive זיך
  between the verb and its particle (`געוווינט זיך צו`) and a particle after
  a participle (`געקומען אַהיים`) are not read as the particle verb; the
  second is deliberate (Rule provenance).
- **Traces.** A plain comparative in -ער shows "adjective -ער" (`שפּעטער` →
  שפּעט), and a comparative with a vowel change whose positive is also a
  noun shows "plural" (`שענער` → שיין): both readings give the same lemma,
  and the first transform that reaches it names the trace.
- **Forms the rules do not reach** (`tests/gaps.tsv`, 24 of the 1,000):
  - Hebrew plurals with a changed vowel or stem (`נקודות` → ניקוד, `כּפֿירות` →
    כפירה, `טײַוולאָנים` → טײַוול, `ציצית` → ציצה) and compounds whose first
    part changes (`שׂונאי־ישׂראל`, `ייִדישע־קינדער`, `בית־הכּאות`);
  - diminutives with another stem (`אָזשעניצע` → אָזשענע, `אייוול` → אויוון,
    `קיילעטשל` → קוילעטש, `שאַליקל` → שאַל, `זשמענקעלע` → זשמעניע);
  - kaikki's forms with a final letter inside the word (`אײַןגעמאַכט`,
    `אָןגערירן`, `אײַןגעשטילט`) and its broken forms (`אַדמיניסטירן` for
    אַדמיניסטרירן, `אײַנפּלאַצירנען`, `גייען` for פֿאַרגיין), which no standard
    text writes;
  - plurals and declined forms with another stem (`קעלישקעס` → קעלישעק,
    `לעבן־געבליבענע` → לעבן־געבליבענער);
  - the rare `קהל` → קהלן, `בלעקט` → בלעקען, `לײַכסט` → לײַכט and `נפֿלעך` →
    נפֿלע.
- **Dialect forms.** Second person plurals in -טס (`שטעלטס ענק פאר`) are not
  read (Rule provenance).
- **Tests that cannot see an order.** No test can observe `traceSelection`
  or the order of transforms where two paths reach the same lemma
  (`lookup.tsv` checks a result's expression and matched text, `cases.tsv`
  any path's trace), so they are set as the contract recommends and as the
  generator writes them. The conditions of the compound-verb rules and the
  plural's `ns` cannot change a result either: no other rule reads their
  outputs.
