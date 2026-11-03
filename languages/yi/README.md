# Yiddish (`yi`)

Deinflection rules, text processors and scanning settings for Yiddish in the
standard (YIVO) spelling, which the recommended dictionary, wty-yi-en, uses
for its headwords: pointed alefs (אַ, אָ), פּ and פֿ, ײַ for /ay/ and יי for
/ey/, final letters at the end of a word. Text is right to left. A lookup
starts at the hovered word and tries only prefixes that end at a word
boundary (`word` / `word` / `spaces`, docs/languages.md 14.1), so a
separable verb is read over two words (`הייבט אָן` → אָנהייבן).

The pack reads unpointed and half-pointed text too (most text online, and
older or Hasidic spelling): the `addPoints` processor adds the points such
text leaves out (`פארשטאנען` → פֿאַרשטאַנען, `זיין` → זײַן, `כעס` → כּעס), at
one processor step, so a word found as written comes first.

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
  wty-yi-en headword with definitions. The 974 rows the final rules reach are
  in `corpus.tsv`, the 26 others in `gaps.tsv`. UniMorph has a Yiddish set
  ([unimorph/yid](https://github.com/unimorph/yid) at 9156c6f, 7,986 rows),
  but its generator dropped -ער and -ען from stems (`אַנדער` → `אַנדע`, `אַקערן`
  → `אַקן`), so it was not used.
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`,
  `tests/dictionary/`, `sources/constructed.tsv`,
  `sources/benchmark-sentences.txt` and the rest of `language.json`: written
  for this pack (GPL-3.0-or-later). The rows of `sources/constructed.tsv` are
  forms of common lemmas for every ending Yomitan's rules read, each attested
  in wty-yi-en or kaikki, except the ten dialect second person plurals in
  -טס that only Yomitan's rule reads.
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
    headwords, at least 25% pointed), 758,702 words, public domain or CC BY-SA 4.0 as Wikisource
    publishes them;
  - Tatoeba's Yiddish sentences (`yid_sentences.tsv.bz2` of 2026-11-03,
    27,547 sentences, sha256 `5a044beb…d5a`), CC BY 2.0 FR;
  - Yiddish Wikipedia (`yiwiki-20261101`, sha256 `ea0bef1f…8c8f`), CC BY-SA
    4.0, only to see how much text is unpointed (96% of its words).

## Rule provenance

`transforms.json` has 20 transforms and 860 rules: 644 `own`, 216 `both`
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
    `פֿאַרוויגטנדיק`) and 1 is `מענען` → מאַן; 139 false candidates;
  - `sources/constructed.tsv`: the 8 dialect second person plurals in -טס
    (`מאַכטס` → מאַכן); 11 false candidates;
  - `tests/cases.tsv`: 12 negatives broken (`ביים` → בוים, `טייער` → טיי,
    `מיינע` → מיינען), 4 false candidates.

  On the real texts the union changes 272 first results. None becomes right
  and 83 that were right stop being so: the diminutive -ל reads `ווייל`
  (because) as וויי (61 places), the plural -ער reads `פריער` (earlier) as
  פּרי (42), -ות reads `שאלות` as שאל (9) and `מעלות` as מעל (6), the umlaut
  rules read `פירן` as פור, and -קע and -ן read the name `מאָטקע` as מאָט (39).
  The wrong first results the script judges rise from 95 to 166. The -טס rule, the only one that reads a form the own rules
  miss, reads `וועלטס` (the world's) as וועלן (to want; 153 places in
  Wikipedia and Wikisource) and `גייטס` (Gates) as גיין, against about 30
  dialect forms in Hasidic texts on Wikisource (`שטעלטס ענק פאר`).
- **Yomitan's processors left out: all four** (`sources/yomitan-differences.tsv`).
  `removeYiddishDiacritics` replaces the text with its letters alone, so
  pointed text never reaches wty-yi-en's pointed headwords: with Yomitan's
  processors the final rules reach 36.9% of the corpus sample, first rank
  34.0%, instead of 97.4% and 90.7%. `combineYiddishLigatures` writes letter
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
  - `addPoints`: every combination of the points an unpointed letter can
    take: א as א, אַ or אָ (not before ו or י, where it is silent), פ as פּ or
    פֿ, יי as ײַ or ייִ, ווו as וווּ, and ב, כ, ת as בֿ, כּ, תּ.
- **Own rules** (`sources/own-rules.mjs`), one transform per form so a trace
  names it:
  - the present tense: the stem (first person singular, singular imperative,
    and the third person of stems in -ט), -סט, -ט, and the plural where it is
    not the infinitive, for every stem ending: -ען after ם, ן, נג, נק and a
    syllabic ל or ן, -ן after the others, vowel stems (`גייט` → גיין, `ציט` →
    ציִען, `שרײַט` → שרײַען), the final letters;
  - irregular verbs: זײַן, האָבן, געבן, טאָן, וויסן, וועלן, the auxiliaries
    וועל, וואָלט, פֿלעג; pronoun + זענען or זענט;
  - past participles: גע- … -ט after a separable particle too (`אָנגעהויבן`),
    155 strong participles with their changed stems, without גע- after an
    unstressed prefix (`פֿאַרשטאַנען`, `באַשלאָסן`); present participles in
    -נדיק; both declined as adjectives;
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
    (`אָפֿענע`, `איידעלע`); comparatives and superlatives with the vowel change
    and the irregular בעסער, ערגער, מער, נעענטער.
- **Stem constraints.** Every suffix rule reads one word (`stemCharacters:
  "[^ ]"`), so a short ending never fires on a word before a space (`די
  טישן` is not `די טיש`, `מיר זאָגט` is not `מיר זאָגן`). Where a constraint
  stops a real false candidate, a negative row of `tests/cases.tsv` shows it:
  - a vowel stem takes -ען or -ן only after a vowel (`די` is not דין, `ציט`
    not צין), a stem in -ע takes -ען not after י, מ or נ (`מיינע` and `נייע`,
    unpointed מײַנע and נײַע, are not מיינען and נייען);
  - noun and adjective endings need a stem that does not end in a medial
    letter (`וואָכן` is not וואָכ) and a plural -ער one that does not end in a
    vowel (`טייער` is not טיי);
  - a vowel change alone makes a plural only from ע for אַ or אָ; the other
    such plurals are written out (`ביים` is בײַם, not a plural of בוים;
    `גביר` is not one of גבור);
  - the vowel change needs a consonant after the vowel (`גיין` is not גוי,
    `איין` not אוי);
  - a separable particle is not read after a participle (`געשטאַנען אויף` is
    "stood on", not אויפֿשטיין), and a compound verb not before a pronoun
    (`האָט מיר` is not מיר האָבן);
  - -קע after a consonant needs a stem of five code points (`מאָטקע` is a name,
    not a diminutive of מאָט).

  `sources/mutations.py` deletes each constraint in a scratch copy, per
  transform and per value: each of the 77 deletions makes a test fail.
  `sources/mutation-gains.py` found the false candidates each one prevents on
  150,000 words and phrases of the real texts and Tatoeba. Five transforms
  (1pl, adjE, adjS, comparative, superlative) have no minimum stem: deleting
  it added no headword there.
- **History.** The first commit, `yi: own rules`, has the rules as written
  before Yomitan's file was read (20 transforms, 706 rules). Later commits,
  after measuring:
  - `v` and `n` got Yomitan's subconditions (the merge tool requires equal
    conditions), and noun rules give `ns`;
  - corpus misses: verbs in -ייִען, -וולען, -דזשען and -שטשען, the particles
    אום and פֿיר, 42 more strong participles, plurals in -ס after a final
    letter and in -עס, -ים after ה, -יות, more diminutive endings, comparatives
    in -ענער and superlatives in -שט;
  - real-text collisions: the constraints above, `ווו`, ב, כ and ת in
    `addPoints`, pronoun + זענען.

## Measurements

All with wty-yi-en 2026.10.22 as published, form-of rows included, imported
by `hoshidicts-cli import`, at hoshidicts 0a73e5e (GCC 14.3, Release). The
pack has no optional processor, transform or variant pass, so every number is
the same with every option on and with the defaults.

1. **`eval-language --dictionary`** (`sources/measure.py tables`), with the
   pack's processors. "Yomitan + post" adds Yomitan's two postprocessors,
   without which Yomitan's rules leave medial final letters. Recall / false
   candidates per row / first rank; negatives passed for `cases.tsv`:

   | Rules | corpus + gaps (1,000) | cases.tsv (299) | wty forms (7,832) | constructed (152) | Yomitan's test (34) |
   | --- | --- | --- | --- | --- | --- |
   | Own (`sources/own.json`) | 97.4% / 0.097 / 90.7% | 100%, 100% neg / 0.239 / 81.5% | 95.3% / 0.082 / 94.9% | 92.8% / 0.230 / 80.9% | 20.6% |
   | Yomitan (`sources/yomitan.json`) | 20.3% / 0.050 / 60.3% | 7.7%, 84.4% neg / 0.104 / 58.6% | 8.2% / 0.038 / 94.8% | 38.2% / 0.151 / 66.5% | 100% |
   | Yomitan + post | 31.4% / 0.073 / 67.7% | 10.4%, 84.4% neg / 0.135 / 60.8% | 13.7% / 0.053 / 94.8% | 65.8% / 0.224 / 76.3% | 67.6% |
   | Union (merge tool) | 97.4% / 0.117 / 90.3% | 100%, 84.4% neg / 0.248 / 81.5% | 95.3% / 0.092 / 94.9% | 92.8% / 0.283 / 79.6% | 100% |
   | Union + post | 97.4% / 0.127 / 90.3% | 100%, 84.4% neg / 0.261 / 81.5% | 95.4% / 0.101 / 94.9% | 98.0% / 0.322 / 84.2% | 67.6% |
   | **Final (`transforms.json`)** | **97.4% / 0.097 / 90.7%** | **100%, 100% neg / 0.239 / 81.5%** | **95.3% / 0.082 / 94.9%** | **92.8% / 0.230 / 80.9%** | 20.6% |

   - The final set is the own set with provenance marks, so its numbers are
     the own set's. "wty forms" are the 7,832 single-word inflection
     references of wty-yi-en (`measure.py forms`; spelling variants and
     alternative forms left out).
   - Yomitan's test writes its terms as Yomitan's rules leave them, with a
     medial final letter (`קויפֿנ`) and often without points (`מאנ`), and some
     of its sources are no standard form (`בוךערס`, `קוכןסער`, `ליפענעס`), so
     it is in `sources/`, not `tests/`.
   - First rank on the corpus is the share of rows whose whole-word lookup
     shows the lemma first. Of the 93 others, 65 show a wty-yi-en entry of the
     form itself, a noun or adjective spelled like the verb form (`אַקער`,
     `האַס`, `דינג`), 12 the lemma later, 12 nothing and 4 another word.
   - `lookup.untaggedTerms`: 1,987 of wty-yi-en's 59,930 rows have no
     `rules` (names 747, alternative-spelling rows 630, interjections,
     prepositions, affixes, phrases, pronouns), and no part of speech the
     rules produce is untagged, so the pack keeps the default `"filter"`.
     With `"pass"` false candidates rise (corpus 0.113, cases 0.293) and
     first rank falls on the corpus (90.5%).
2. **Frequent forms** (`measure.py freq`): of the 10,000 most frequent words
   of the 32 YIVO-spelled Wikisource pages (758,702 words), 1,471 (97,743
   occurrences) have a form-of row that names a lemma a rule reaches. Looked
   up alone, one shows no right first result: `אונזערע` (24 occurrences),
   whose row names the spelling `אונזער`, whose row names `אונדזער` (one hop
   reaches nothing; docs/languages.md 16). No word shows a wrong lemma first.
3. **Behind pronouns, clitics, articles and auxiliaries** (`measure.py
   phrases`): Tatoeba's 46,446 places where a word follows איך, דו, ער, זי,
   עס, מיר, איר, זיי, מען, ס׳, כ׳, מ׳, דער, די, דאָס, דעם, אַ, אַן, a form of
   האָבן, זײַן, וועלן or וואָלט, or זיך, looked up from that word to the end of
   the sentence. 44,812 first results are right by the dictionary's own rows;
   612 are wrong because wty-yi-en's rows for `מיר זענען`, `איר זענט` and `זיי
   זענען` name מסביר זײַן (Known gaps); the 655 the script cannot judge are
   compound verbs (`האָב ליב` → ליב האָבן, `האָט מורא` → מורא האָבן), right; 367
   find nothing.
4. **Real text** (`measure.py text`): every word of the three Wikisource
   texts, looked up from the word to the end of its sentence, 66,644
   lookups. A first result is judged right when the matched text's own
   wty-yi-en rows, or those of a processor variant of it, name its term, also
   through one more reference (`בעסטער` → בעסט → גוט) or an "Unpointed form of"
   entry.
   - Right by script: 57,035 (51,832 as written, 5,203 through a processor
     variant).
   - Wrong by script: 95 (0.14%): 43 are the `מסביר זײַן` rows above; 24 are
     `לייט` (unpointed לײַט, "people") read as the verb לייטן (to solder); the
     others are unpointed words read before their pointed lemma, such as
     `ווערטלעך` → ווערט and `יינגל` → יונג (Known gaps).
   - Not judged by script: 2,584. A random sample of 60 (seed 3), judged by
     hand: 55 right, 5 wrong (`וואונדער` → וווּנד, `קעסטעלע` → קעסט, `דורען`
     → דור, `אויסער` → אויס, the name `מאָטל` → מאָט), so about 215 of the
     2,584 are wrong. Wrong first results in all: about 310 of 66,644 (0.47%).
   - No result: 6,930, mostly names (`סענדערל`, `הערשלען`), Hebrew words
     wty-yi-en lacks or spells otherwise, and pieces of abbreviations (`ר` of
     `ר׳`).
5. **Performance** (docs/languages.md 13): the 107 hover texts of
   `sources/benchmark-sentences.txt` (each word of ten sentences written for
   the pack, to the end of its sentence).
   - Native `benchmark-lookup --languages languages --language yi` (wty-yi-en
     mapped, 6 passes, the first dropped, three runs at machine load 28-34):
     p50 22.2 µs, p95 44.4-45.0 µs. Budget 1 ms p50.
   - Hachidori feat/multi-language 803f7b6 prebuilt engines, Node 22,
     `benchmark/node-lookup.mjs` with `HACHIDORI_LOOKUP_LANGUAGE=yi`:
     `hdw_lookup` p50 66.2 µs, p95 145.0 µs single-thread; p50 72.3 µs, p95
     158.7 µs threaded.
   - `hdw_language_load` (`sources/wasm-load.mjs`, 10 fresh engines): median
     7.07 ms (max 13.0) single-thread, 7.49 ms (13.3) threaded. Live heap
     after the load: +1,227,656 bytes. Budgets 50 ms and 20 MB.
   - The pack has 56 `pattern` rules (35 separable particles, 21 compound
     verbs); a copy without them loads with 1,094,928 bytes, so the patterns
     take about 133 KB.
6. **Hachidori in Chrome** (`test/chrome-language-pack.mjs` on
   feat/multi-language 803f7b6 with this branch in `third_party/hoshidicts`,
   Chrome 152.0.7977.75, wty-yi-en.zip): 17 of 17 checks pass. Settings adds
   Yiddish beside Japanese and imports the dictionary (0.5 s); 13 hovered
   words in right-to-left pages find their lemma first (`הייבט` → אָנהייבן
   over `הייבט אָן`, `האָסטו` → האָבן, `שענסטע` → שיין, the unpointed
   `פארשטייט` → פֿאַרשטיין); the Anki note and the switch to Japanese and back
   work.
7. **Checks**: `language-conformance-test` (corpus.tsv 974/974, cases.tsv
   299/299, text.tsv 43/43, lookup.tsv 35/35; gaps.tsv 0/26 reported);
   `tools/check-classes.mjs yi`; `tools/check-yomitan.mjs` (2,639 rule inputs,
   8,713 Yomitan results,
   no unexplained difference; the four unpaired processors listed);
   `sources/mutations.py` (77 of 77 deletions fail a test).
8. **Commands.** Each number above comes from one of these, with the inputs
   of Sources and licences in `<cache>`:

   ```sh
   node languages/yi/sources/own-rules.mjs && node languages/yi/sources/build-final.mjs
   python3 languages/yi/sources/build-corpus.py <cache>/kaikki.org-dictionary-Yiddish.jsonl <cache>/wty-yi-en-json
   python3 languages/yi/sources/measure.py forms <cache> <cache>/work/forms.tsv
   python3 languages/yi/sources/measure.py tables <cache> <out>
   python3 languages/yi/sources/measure.py freq|text|phrases <cache> languages <out>
   python3 languages/yi/sources/mutations.py; python3 languages/yi/sources/mutation-gains.py <cache> <mutations output>
   python3 languages/yi/sources/per-rule.py <rules.json> <eval-language --per-rule output>
   build/benchmark-lookup <texts> 6 --languages languages --language yi --term <cache>/wty-yi-en --json
   node languages/yi/sources/wasm-load.mjs <hachidori checkout> 10
   ```

   `measure.py` looks texts up with `build/lookup-batch`, built from
   `languages/en/sources/lookup-batch.cpp` as its header says.

## Known gaps

- **Dictionary rows.** wty-yi-en's rows for `מיר זענען`, `איר זענט` and `זיי
  זענען` name only מסביר זײַן (a split table), so a lookup from the pronoun
  shows מסביר זײַן first: 612 Tatoeba places and 41 in the real texts. The
  pack's whole-word rules for these phrases give זײַן at the same length,
  steps and trace length, and the tie goes to the dictionary-confirmed
  reading (docs/languages.md 9.6). The lead accepted a framework change for
  such ties (hachi-lang-engine-l: a whole-word rule for the exact matched
  text ranks first); the pack will be measured again when it merges.
  Rows that name a spelling whose own row is a reference, such as `אונזערע`,
  reach nothing (one hop).
- **Unpointed text.** A word found as written, through a rule, comes before
  its pointed lemma found through `addPoints`, which costs a processor step:
  `לייט` (unpointed לײַט, people) → לייטן (to solder; 24 places), `יינגל`
  (ייִנגל, boy) → יונג. `addPoints` adds no hiriq to a single yod, so
  `פריער` finds the comparative of פֿרי, not the adverb פֿריִער.
- **Ties between rule readings** stay in the engine's order (docs/languages.md
  9.6): `ווערטלעך` (sayings) gives ווערט (worth) before וואָרט (word), both
  through the diminutive and its plural (7 places).
- **Readings the rules make that are wrong in context** (hand sample above):
  nouns read as plurals or diminutives of a shorter noun (`וואונדער` →
  וווּנד, `דורען` → דור, `קעסטעלע` → קעסט), adverbs read as adjectives
  (`אויסער` → אויס), and names read as diminutives (`מאָטל` → מאָט).
- **Forms the rules do not reach** (`tests/gaps.tsv`, 26 of the 1,000):
  - Hebrew plurals with a changed vowel or stem (`נקודות` → ניקוד, `כּפֿירות` →
    כפירה, `טײַוולאָנים` → טײַוול, `ציצית` → ציצה) and compounds whose first
    part changes (`שׂונאי־ישׂראל`, `ייִדישע־קינדער`, `בית־הכּאות`);
  - diminutives with another stem (`אָזשעניצע` → אָזשענע, `אייוול` → אויוון,
    `קיילעטשל` → קוילעטש, `שאַליקל` → שאַל, `זשמענקעלע` → זשמעניע);
  - kaikki's forms with a final letter inside the word (`אײַןגעמאַכט`,
    `אָןגערירן`) and its broken plural forms of -ירן verbs
    (`אַפּליקירטן`, `אַדמיניסטירן`), which no standard text writes;
  - the rare `קהל` → קהלן, `בלעקט` → בלעקען, `לײַכסט` → לײַכט and `נפֿלעך` → נפֿלע.
- **Phrases.** A reflexive זיך between a verb and its particle (`געוווינט זיך
  צו` → זיך צוגעוווינען) and a particle after a participle (`געקומען אַהיים`)
  are not read as the particle verb; the second is deliberate (Rule
  provenance). A separable particle that is a preposition in context reads as
  the particle verb when it ends the scanned prefix: `זאָגט צו אים` shows
  צוזאָגן (promise) first. wty-yi-en's own rows of verb + particle do the same.
- **Dialect forms.** Second person plurals in -טס (`שטעלטס ענק פאר`) are not
  read (Rule provenance).
- No test can observe `traceSelection` (`lookup.tsv` checks a result's
  expression and matched text), so it is set as the contract recommends.
