# English (`en`)

English deinflection rules, text processors and scanning settings for
hoshidicts, following [`docs/languages.md`](../../docs/languages.md). The
rules are the union of rules written for this pack (`sources/own.json`) and
Yomitan's English rules (`sources/yomitan.json`), without the Yomitan rules
that measured worse (Rule provenance) and with Yomitan's derivational and
multiword transforms made optional.

## Sources and licences

- `sources/own.json` and every rule with `"source": "own"`: written for this
  pack (GPL-3.0-or-later) from English grammar before Yomitan's English file
  was read (commit "en: own rules"), then revised against the measurements
  below (Rule provenance lists the changes). `sources/own-rules.mjs`
  generates it: `node languages/en/sources/own-rules.mjs`.
- `sources/yomitan.json`, every rule with `"source": "yomitan"`, and the
  `decapitalize` and `capitalizeFirstLetter` processors: ported from
  [Yomitan](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/en/english-transforms.js)
  at d3c54c1 by `tools/port-yomitan-transforms.mjs`; `sources/map-yomitan.mjs`
  maps its 39 `todo` rules (38 phrasal-verb rules to `phrasal`, the
  interposed-object rule to `interposedObject`, with the word lists read from
  Yomitan's own regular expressions). GPL-3.0-or-later, Copyright (C)
  2024-2026 Yomitan Authors.
- `tests/yomitan.tsv`: Yomitan's
  [English transform tests](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/english-transforms.test.js),
  converted by `tools/port-yomitan-tests.mjs`. GPL-3.0-or-later, Copyright
  (C) 2023-2026 Yomitan Authors, 2020-2022 Yomichan Authors.
- `tests/corpus.tsv` and the six rows of `tests/gaps.tsv`: 1,600 inflected
  form → lemma pairs from
  [UniMorph eng](https://github.com/unimorph/eng/blob/66e0e9e8e2dcd196da081a25a48e5c1fe3d8b49b/eng)
  at 66e0e9e (file `eng`, sha256 `20a191ce…5c67`), CC BY-SA 3.0, by the
  UniMorph contributors. `sources/sample-corpus.py` drew them with seed 1:
  250 rows per stratum of `N;PL`, 125 of `V;PST` and `V;V.PTCP;PRS`, 100 of
  `V;PRS;3;SG` and `V;V.PTCP;PST`, 50 of `ADJ;CMPR` and `ADJ;SPRL`, half from
  forms with a [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 Zipf
  frequency of at least 2.5 (the "frequent" categories) and half from all
  forms ("any"). A UniMorph row is in the pool only when kty-en-en (below)
  lists its form as that inflection of that lemma, which drops UniMorph
  errors such as *gas* → *uncountable* (`ADJ;CMPR`). The script also writes
  the 216,933 other pool rows (the "dev pool", not committed; a form, lemma
  and part of speech the sample has in any category is left out of every
  category's pool). No wordfreq or kty-en-en data is committed.
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`, `tests/dictionary/`
  and `sources/sentences.tsv`: written for this pack (GPL-3.0-or-later).
- `sources/measure-inputs.py` and `sources/measure-frequent-words.mjs`: the
  frequent-word measurement of Measurements, written for this pack.
- `host.recommendedDictionaries`: wty-en-en from
  [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan)
  (formerly kaikki-to-yomitan), Wiktionary content through kaikki.org, CC
  BY-SA 4.0.
- Dictionaries measured with, neither committed:
  - wty-en-en, index revision 2026.10.22, 110,539,099 bytes, sha256
    `0e62d0d3d6bf68c3f65906b5940601a375392f45d89a50e5dcb5068e1961436f`,
    downloaded from the index's `downloadUrl`
    (`https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/en/en/wty-en-en.zip`):
    1,630,668 terms, imported by `hoshidicts-cli import` in 2.6 s. Every
    measurement below uses it.
  - kty-en-en, release
    [v2025-04-08-10-54-36-00-00](https://github.com/yomidevs/wiktionary-to-yomitan/releases/download/v2025-04-08-10-54-36-00-00/kty-en-en.zip),
    index revision 2025.04.08, sha256
    `3cf1f90ea930cf890293085d990e55415236a92cf935b0df6081627369033219`:
    1,717,000 terms, imported in 2.9 s; used only to check the UniMorph rows.
  Both are Wiktionary content (CC BY-SA 4.0 and GFDL); the converters are
  MIT.
- The interposed-object measurements below use public-domain novels from
  Project Gutenberg: 20 for the particle counts and the guard words (ebooks
  11, 74, 76, 84, 98, 145, 174, 219, 345, 1260, 1342, 1400, 1661, 1952, 2591,
  2701, 4300, 16328, 25344, 64317) and *Treasure Island* (ebook 120) as a
  held-out check. No text is committed.

## Text and scanning

- Scanning follows the contract's starting point for English (section 14.1):
  `scanStart` `word`, `searchResolution` `word`, `segmentation` `spaces`.
  Words are letters (ASCII, Latin-1, Latin Extended-A/B, Latin Extended
  Additional and the Latin ligatures U+FB00-FB06), combining marks and
  digits. Hyphens and apostrophes separate words, so *minute* in
  *five-minute* and *mother* in *mother’s* can be looked up, and whole
  entries such as *mother-in-law* still match because every prefix that ends
  at a word boundary is tried. The soft hyphen U+00AD is `wordInternal`.
- Preprocessors, in order: `decapitalize` and `capitalizeFirstLetter`
  (Yomitan's); `normalizeApostrophes` (’ ‘ ʼ ＇ to `'`, so the rules see one
  apostrophe); `normalizeHyphens` (U+2010 and U+2011 to `-`);
  `removeSoftHyphens` (`keepInput: false`); `removeDiacritics` (*naïve* →
  *naive*, *résumé* → *resume*, the input kept); `expandLigatures` (*æ*, *œ*
  and the U+FB00-FB06 ligatures; *encyclopædia* → *encyclopaedia*,
  *ﬁnding* → *finding*). `tests/text.tsv` checks each.
- One pack setting, `archaicForms` (boolean, off by default, group
  `lookup`), turns the optional own transforms `archaicSecondPerson` and
  `archaicThirdPerson` on (section 4.7, effect `transforms`). The optional
  Yomitan transforms (Rule provenance) have no setting: a request can enable
  them by id, and the test files and `eval-language` run every optional
  transform (section 12.2).

## Rule provenance

`transforms.json` is written by `node languages/en/sources/final.mjs`: the
union `tools/merge-transforms.mjs` makes of the two source files, without the
rules `REMOVED` lists, with the transforms `OPTIONAL` lists off by default,
and without word lists no rule names.

- 24 transforms: 10 in both files (`plural`, `possessive`, `past`, `ing`,
  `3rd pers. sing. pres`, `interposed object`, `archaic`, `comparative`,
  `superlative`, `dropped g`; the own transforms use Yomitan's ids so the
  files merge, and their names and descriptions are this pack's), 7 own
  (`present`, `pastParticiple`, `contraction`, `negative`, `placeholder`,
  `archaicSecondPerson`, `archaicThirdPerson`) and 7 Yomitan (`adverb`, `-y`,
  `un-`, `going-to future`, `will future`, `imperative negative`, `-able`).
- 1,375 rules: 1,266 own, 109 Yomitan, 0 both. No own rule is identical to a
  Yomitan rule, which is what `both` means for a rule: the own rules carry
  stem constraints and take only the text as written (`conditionsIn: []`),
  so an English word gets one inflectional ending and clitics stack on top
  (*children's*, *doesn't*), where Yomitan's rules take a verb or adjective
  in and so also apply to each other's output (*settings* → *setting* →
  *set*). By type: 831 `suffix`, 289 `phrasal`, 159 `wholeWord`, 67
  `prefix`, 28 `replace`, 1 `interposedObject`; no `pattern` rule.
- Own rules:
  - Regular endings with English spelling. -ed, -ing, -er and -est are added
    straight to a stem that ends in a vowel or w, x, y, in two consonants,
    or in a vowel and a consonant after an earlier vowel (*played*,
    *walked*, *looked*, *visited*, *cheaper*); a one-syllable stem in one
    vowel and one consonant doubles it first (*hopped*, *bigger*), so
    *hoped*, *taking*, *later* and *finer* are never read as *hop*, *tak*,
    *lat*, *fin* + an ending. These are 106 or 107 suffix rules per ending, one
    per final consonant and vowel, because a stem constraint sees one code
    point. The doubled consonants, -e dropping (*hoped*, *making*), -ied and
    -ies after two letters (*tried*, *cities*; not *died* → *dy*), the -ie
    verbs as a list (*tied*, *lying*, *boogied*: Wiktionary has *trie* and
    *marrie* as obsolete spellings, so an -ied → -ie rule would offer
    them), -s after a consonant or, with three letters before it, after a
    vowel (*ads*, *shoes*; not *has* → *ha*), -es after s only in -sses,
    -uses, -ases and -ises (*kisses*, *buses*, *atlases*; not *uses* →
    *us*, *cases* → *cas*), -cked and -cking after an earlier vowel
    (*panicked*; not *locked* → *loc*).
  - Irregular past forms and participles of 150 verbs as suffix rules, so
    prefixed verbs are reached too (*understood*, *forgave*, *withheld*,
    *undergone*; forms that also end ordinary words, such as *ate*, *lay*,
    *lit*, *bit*, *hid*, *won* and *dove*, are whole words), `am`/`are`/`is`/
    `was`/`were`/`been`/`has`/`had`/`does` and the past modals.
  - Irregular and classical plurals (*men*, *children*, *feet*, *mice*,
    *people*, *data*, *criteria*, *cacti*, *indices*, *crises*, *bases* →
    *basis*, *bureaux*, *paparazzi*, *mothers-in-law*, *passers-by*,
    *courts-martial*), with stem minimums where a short stem reads a real
    word wrongly (*prices* is not *prix*, *shoes* not *sho*, *radii* not
    *radio*).
  - Irregular comparison (*better*, *worst*, *further*, *elder*),
    possessives (*teacher's*, *James'*), clitics (*'re*, *'ve*, *'ll*, *'d*,
    *'m*, and *'s* after *it*, *that*, *there*, *let* and the question
    words), negative contractions as whole words (*don't*, *isn't*,
    *mightn't*, *daren't*, *can't*, *won't*, *ain't*; *warn't* is not *war*),
    *-in'*, *-'d* for *-ed* in verse (*lov'd*).
  - Multiword verbs: the first word's ending (a `phrasal` rule per ending,
    and `prefix` rules for whole-word forms: *had to* → *have to*), the
    interposed object (below), and the placeholders of dictionary entries
    (*lost his temper* → *lose one's temper*, *let him down* → *let someone
    down*, *enjoyed himself* → *enjoy oneself*).
  - Optional: Early Modern English *-est*, *-eth*, *art*, *hast*, *hath*,
    *doth*.
- Changes to the own rules after the port (the diff of
  `sources/own-rules.mjs` from the "own rules" commit):
  - conditions and ids aligned with Yomitan's: `v` covers `v_phr`; `np` and
    `ns` keep Yomitan's names; `name`, `pron`, `det` and `conj` were dropped
    (wiktionary-to-yomitan leaves the rules of those words empty); the
    transforms `thirdPerson`, `droppedG` and `interposedObject` took
    Yomitan's ids `3rd pers. sing. pres`, `dropped g`, `interposed object`;
  - possessive and contraction outputs carry no conditions;
  - the separable particles went from 25 to 12 (*across*, *along*,
    *behind*, *by*, *in*, *on*, *over*, *round*, *through*, *about*,
    *around* removed: Interposed object below) and the determiners left the
    guard words;
  - comparative and superlative endings other than plain *-er*/*-est*
    give adjectives only;
  - new rules: *-cced*, *-'ed*, *-ccing*, *-'ing*, *-lit* → *-light* (stem
    of three letters) and *relit*, prefix copies of whole-word forms for
    multiword verbs, and the `archaic` transform (*-'d* → *-ed*), written
    after reading Yomitan's rule of that id and given a stem minimum of
    three letters;
  - after the audit of 8482024 (reports/audit-hachi-lang-en.md): the
    interposed-object rule's conditions and guard words (below); the
    spelling constraints listed above under "Regular endings" (one-syllable
    stems, -s after a vowel, -es after s, -ies/-ied minimums, the -ie verbs,
    -cked, a doubled s not after e, -ices, -oes and -ses → -sis minimums,
    -i → -o only after t or z), negative contractions as whole words, and
    the interposed object's description.
- Yomitan rules removed (28 of 137). Measured in the union, with wty-en-en:
  rows only the rule recovers in the dev pool, the sample, `cases.tsv` and
  `yomitan.tsv`; false candidates only it adds on the sample and
  `cases.tsv`; `cases.tsv` negatives it breaks; and of the 20,000 frequent
  words (Measurements), how many have a wrong candidate because of it.

  | Rule | dev | sample | cases | yomitan.tsv | false candidates | negatives broken | frequent words | Example |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | plural `s` → | 30 | 1 | 0 | 0 | 9 | 0 | 29 | *was* → *wa*, *class* → *clas* |
  | plural `es` → | 114 | 0 | 0 | 0 | 35 | 0 | 124 | *cares* → *car*, *rates* → *rat* |
  | plural `ves` → `fe` | 0 | 0 | 0 | 0 | 5 | 2 | 3 | *serves* → *serfe* |
  | plural `ves` → `f` | 0 | 0 | 0 | 0 | 0 | 4 | 5 | *serves* → *serf*, *proves* → *prof* |
  | plural `ies` → `y` | 0 | 0 | 0 | 0 | 1 | 0 | 1 | *pies* → *py*, *dies* → *dy* |
  | past `ed` → `e` | 72 | 2 | 0 | 0 | 9 | 4 | 14 | *bed* → *be*, *red* → *re* |
  | past `ed` → | 66 | 0 | 0 | 0 | 10 | 8 | 40 | *bed* → *b*, *hoped* → *hop* |
  | past `ied` → `y` | 0 | 0 | 0 | 0 | 0 | 1 | 2 | *died* → *dy* |
  | past `cked` → `c` | 4 | 0 | 0 | 0 | 1 | 1 | 1 | *locked* → *loc* |
  | past `ssed` → `s` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | *pressed* → *pres* (ranked above *press*) |
  | ing `ing` → `e` | 14 | 0 | 0 | 0 | 11 | 3 | 14 | *being* → *bee*, *dying* → *dye* |
  | ing `ing` → | 36 | 0 | 0 | 0 | 24 | 8 | 85 | *taking* → *tak*, *feelings* → *feel* |
  | ing `ying` → `ie` | 38 | 0 | 0 | 0 | 2 | 1 | 6 | *trying* → *trie* |
  | ing `cking` → `c` | 2 | 0 | 0 | 0 | 1 | 2 | 3 | *locking* → *loc*, *ticking* → *tic* |
  | ing `ssing` → `s` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | *pressing* → *pres* (ranked above *press*) |
  | ing `dding`, `gging`, `nning`, `tting`, `rring` | 0 | 0 | 0 | 0 | 2 | 2 | 5 | *weddings* → *wed*, *settings* → *set* |
  | 3rd pers. `s` → | 0 | 0 | 0 | 0 | 14 | 1 | 29 | *has* → *ha* |
  | 3rd pers. `es` → | 38 | 0 | 0 | 0 | 8 | 0 | 39 | *makes* → *mak*, *rates* → *rat* |
  | 3rd pers. `ies` → `y` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | *dies* → *dy*, *lies* → *ly* (texts the part-of-speech filter drops) |
  | comparative `er` → | 3 | 0 | 0 | 0 | 5 | 7 | 21 | *her* → *h*, *trader* → *trad* |
  | superlative `est` → | 3 | 0 | 0 | 0 | 4 | 2 | 5 | *west* → *w*, *best* → *b* |
  | superlative `est` → `e` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | *semester* → *semest* (own -er) → *seme* |
  | archaic `'d` → `ed` | 0 | 0 | 0 | 0 | 0 | 2 | 0 | *he'd* → *heed*, *we'd* → *weed* |
  | interposed object | 0 | 0 | 0 | 0 | 0 | 10 | 0 | *put her foot on* → *put on* |

  The 426 dev rows the union reaches and the final set does not are mostly obsolete or dialect spellings
  (*envied* → *envie*, *doing* → *doe*, *playing* → *playe*, *judges* →
  *judg*), two-letter stems (*pas* → *pa*), -ses after a consonant and s
  (*ballockses*), and rare -ie and -u verbs (*sortied*, *snafued*). The
  three sample rows are in `tests/gaps.tsv`.
- Interposed object: Yomitan's rule accepts 57 particles; the own rule
  accepts *up*, *out*, *down*, *off*, *away*, *back*, *aside*, *apart*,
  *home*, *together*, *forth* and *forward*. After an object, *in*, *on*,
  *over*, *by*, *through*, *round*, *around* and *about* mostly start a
  prepositional phrase, and a lookup sees only the text up to the particle.
  In the 20 novels, where *verb + particle* is a dictionary entry, *verb
  the/his/... noun particle* was followed by a determiner or a name (a
  prepositional phrase: *put her foot on the table*) 72% of the time for *in*
  (479 of 662), 81% for *on* (397 of 489), 75% for *over* (77 of 102) and 51-68% for
  *by*, *through*, *round*, *around* and *about*, against 0-10% for *up*,
  *out*, *down*, *away*, *back*, *aside*, *home* and *together* and 34% for
  *off*. With a pronoun object (*put it on the table*) the shares were 54%
  for *in*, 64% for *on*, 2-9% for *up*, *out*, *down*, *away* and *back*,
  and 13% for *off*. Contract section 14.1 suggests *put Mary’s coat on* →
  *put on* as a case; the pack reads it as *put*, and `cases.tsv` has *put
  Mary's coat away* → *put away* and the negatives *put her foot on* and
  *put the book on* instead.

  The rule runs on the text as written and after a rule that read the first
  word's ending, and its output is a verb: the non-dictionary conditions
  `v_fw` (first word read) and `v_io` (object removed) let each run after
  the other (*turned it off* → *turn it off* → *turn off*; *picked Tom up*
  → *picked up* → *pick up*), and an ending read from the last word lets
  neither (*turn their backs* → *turn their back* is not *turn back*). The
  guard words, which end an object, are the prepositions and particles,
  conjunctions, auxiliaries, negation, the subject pronouns, the past forms
  and participles of the irregular verbs, the irregular verbs whose
  participle is the base (*come*, *run*, *put*, *set*, *cut*, *let*, ...)
  and *go*, *get*, *sit* and *stand*: after an auxiliary such a form is the
  main verb (*had gone out* is not *have out*, *did not give up* not *do
  up*), after a noun the predicate (*the cook came up* is not *cook up*),
  and after *let me* or *let us* the verb (*let me go up* is not *let up*).
  Hovering every word of a novel (the text from the word to the end of its
  sentence), the first result is an interposed-object reading for 4,288 of
  the 1,032,441 hovers of the 20 novels that have a particle after the
  second word (5,646 before these changes; 288 of them at an auxiliary,
  830 before; 5 at a word with no verb entry, 142 before), and for 157 of
  the 68,817 hovers of *Treasure Island* (228 before; 13 at an auxiliary,
  47 before; 1 at a word with no verb entry, 12 before). Of 50 readings the
  changes removed, drawn at random from the 20 novels, all 50 were wrong
  (*had come up* → *have up*, *let us sit down* → *let down*, *fire broke
  out* → *fire out*); of 50 that remain, 37 were right (*give it back*,
  *drew Shylock out*, *put the weapons aside*) and 13 wrong, most with a
  regular participle or an -ing form inside the object (*have settled down*,
  *head coming out*).
- Optional Yomitan transforms (off unless a request enables them):
  - `adverb`, `-y`, `un-`, `-able` are derivation, not inflection, and
    wty-en-en lists the derived words. With the four on, 1,718 of the 20,000
    frequent words have a wrong candidate, against 428 with them off (*only*
    → *on*, *party* → *part*, *by* → *be*, *they* → *thee*, *under* → *der*,
    *capable* → *cap*).
  - `going-to future`, `will future` and `imperative negative` apply only
    when the scan starts at the auxiliary, and then put the next verb first
    (*will paint* → *paint*, *going to school* → *school*, *don't touch* →
    *touch*), so hovering the auxiliary never shows it first; hovering the
    verb finds it either way.
  `yomitan.tsv` passes with them on, as the test files run.

## Measurements

`hoshidicts-cli eval-language` (Release, GCC 14.3) on `main` 7dba902 plus
this pack (e5751e8 gave the same numbers), `--dictionary` wty-en-en. The rule sets are `sources/own.json`,
`sources/yomitan.json`, their union (`tools/merge-transforms.mjs --out`) and
the final `transforms.json`; "final, options off" leaves out the optional
transforms, as a default lookup does. `eval-language` runs every option on.

| | Own | Yomitan | Union | Final | Final, options off |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sample recall (corpus.tsv + gaps.tsv, 1,600 rows) | 99.63% (1,594) | 97.81% (1,565) | 99.81% (1,597) | **99.63% (1,594)** | 99.63% (1,594) |
| Dev pool recall (216,933 rows) | 99.657% | 98.875% | 99.853% | 99.657% | 99.656% |
| False candidates per sample row | 0.206 | 0.335 | 0.356 | 0.296 | 0.203 |
| cases.tsv positives (572) | 572 | 187 | 572 | 572 | 557 |
| cases.tsv negatives (108) | 108 | 32 | 31 | 108 | 108 |
| yomitan.tsv positives (105), negatives (2) | 69, 2 | 105, 2 | 105, 2 | 105, 2 | 69, 2 |
| Frequent words with a wrong candidate, default lookup | 428 | 2,156 | 2,274 | 428 | 428 |
| The same with every option on | 446 | 2,156 | 2,287 | 1,735 | 428 |
| Frequent words whose first entry with definitions is a wrong deinflection | 5 | 155 | 157 | 5 | |
| Frequent words with a wrong deinflection above the lemma | 15 | 281 | 290 | 15 | |
| Expected one-step trace (sample rows reached) | 1,594 / 1,594 | 1,564 / 1,565 | 1,597 / 1,597 | 1,594 / 1,594 | |
| Lemma first among entries with definitions (sample, whole source) | 58.9% | 57.0% | 57.7% | 58.9% | |
| Lemma among the results (sample) | 99.6% | 97.8% | 99.8% | 99.6% | |
| Sentences: lemma first among entries with definitions (114 words) | 60 | 39 | 58 | 60 | |
| Sentences: lemma in the first three entries with definitions | 112 | 72 | 111 | 112 | |

- The spelling constraints of the audit round cost 0.18 points of dev-pool
  recall (99.840% before) and three sample rows (*eas* → *ea*, *envied* →
  *envie*, *shied* → *shie*, now in `gaps.tsv`); they cut the frequent words
  with a wrong candidate from 609 to 428 in a default lookup, the frequent
  words whose first entry with definitions is a wrong deinflection from 29
  to 5, and those with a wrong deinflection above the lemma from 116 to 15.
- False candidates (`eval-language`): distinct deinflected texts per row that
  are wty-en-en headwords passing the part-of-speech filter, other than the
  source and the lemma. Many are obsolete spellings with their own entries
  (*walke*, *happie*).
- `firstRank` is 0 on the sample for every rule set and 0.024 on
  `cases.tsv` (final): wty-en-en has a form-of row for nearly every
  inflected form (*walked* → [*walk*, past]), which matches the source as
  written and ranks first (Known gaps). The "entries with definitions" rows
  skip those rows: an entry with definitions is a result that has a
  glossary whose definition tags do not include `non-lemma`.
- Frequent words: `sources/measure-inputs.py` takes the 20,000 most frequent
  wordfreq 3.1.1 English words (lowercase letters, apostrophes, hyphens)
  that are wty-en-en headwords, and `sources/measure-frequent-words.mjs`
  counts the words with a wrong candidate: a deinflected text (from
  `hoshidicts-cli deinflect`, with or without `--all-options`) that is a
  headword whose rules pass the part-of-speech filter and is neither the
  word nor a lemma wty-en-en's form-of rows or UniMorph give for it (*was*
  → *wa*, *bed* → *b*). The two "first entry" rows look each word up whole
  (`Lookup::lookup`, 16 results, scan length 16, no options) and compare the
  first entry with definitions, and the entries above the lemma, with the
  same right lemmas; a wrong deinflection is a result with a trace whose
  expression is not a right lemma. The pack cannot order results of the same
  matched length, trace length and dictionary, so a wrong deinflection and
  the lemma can come in either order (Known gaps).
- Trace: a deinflection reaching the lemma with exactly the transform the
  UniMorph category names (`plural`, `3rd pers. sing. pres`, `past`, `past`
  or `pastParticiple`, `ing`, `comparative`, `superlative`).
- Sentences: `sources/sentences.tsv`, 114 hovered words in sentences written
  for the pack, looked up as a host does (from the word to the end of the
  sentence, scan length 16, no options).
- The own rules were revised while reading the misses and wrong candidates
  of the dev pool and the frequent words, and for four rows (*cc'ed*,
  *sicced*, *dx'ing*, *greenlit*) of the sample; the sample is otherwise
  held out. The interposed-object guards were chosen on the 20 novels and
  checked on *Treasure Island*.
- `language-conformance-test`: conforms; corpus.tsv 1,594/1,594,
  cases.tsv 680/680, yomitan.tsv 107/107, text.tsv 28/28, lookup.tsv
  37/37, gaps.tsv 0/6 (reported); 590 of the 1,375 rules are exercised by
  a passing row. `tools/check-yomitan.mjs`: 8,740 inputs, 34,578 Yomitan
  results, 1,214 listed differences (the two rows of
  `sources/yomitan-differences.tsv`: Yomitan matches a particle as a prefix
  of the next word), 0 unexplained; processors `decapitalize` and
  `capitalizeFirstLetter` agree on 2,386 inputs.

Real use with wty-en-en through `hoshidicts-cli lookup --language en`: *looked
the word up in her dictionary* → 1. *looked up* (form-of row), 2. *look up*
(matched *looked the word up*; interposed object → past); *teacher’s notes
were on the desk* → *teacher* (possessive); *lost his temper and shouted* →
*lose one's temper* (past → placeholder) after the form-of row *lost one's
temper*; *mothers-in-law live in Leeds* → *mother-in-law* (plural) after the
form-of row.

Hachidori: `test/chrome-language-pack.mjs` on bee-san/hachidori
feat/multi-language 1bd53232 with this pack synced in, Chrome 152, wty-en-en:
15 passed, 0 failed (adding the profile, the import, 11 cases, the Anki
note and the switch to Japanese and back), dictionary imported in 3.1 s.
The cases are words of `sources/sentences.tsv` whose first
result is the expected headword (form-of rows come first for the others).

Performance (host load 28-32 on 64 cores, so these are upper bounds):

- Native `benchmark-lookup --languages languages --language en` with
  wty-en-en on the 114 sentence texts of `sources/sentences.tsv` (each cut at
  its first comma, as the tool reads CSV), 21 passes, the first dropped,
  three runs: p50 60.0-80.2 µs, p95 182.0-242.4 µs (budget 1 ms p50). Before
  the audit round's spelling rules: 65.7 µs and 200.2 µs at load 29.
- Hachidori's WebAssembly (feat/multi-language 1bd53232) in Node 22
  (`hdw_lookup`, the same texts, 10 passes after one): single-thread p50
  233 µs, p95 847 µs; threaded p50 246 µs, p95 851 µs.
- Pack load: natively `LanguageRegistry::add` takes 2.1-2.4 ms (median of
  50) and the registry holds 742,864 bytes of heap; in WebAssembly the first
  `hdw_language_load` takes 16.1 ms (single-thread) and 18.7 ms (threaded),
  later ones 4.5-5.8 ms, and the allocator's live bytes grow by 488,264 and
  487,472 bytes. Budgets 50 ms and 20 MB. The spelling rules of the audit
  round doubled these (0.96 ms, 322,240 bytes and 13.3 ms before): each of
  their ~430 rules has a stem class.
- No `pattern` rules, so no pattern heap.

## Known gaps

- **Form-of rows come first.** wty-en-en and kty-en-en have rows whose only
  glossary is a form-of redirect (*walked* → [*walk*, past]). The importer
  stores them as ordinary terms (section 16), so for an inflected word the
  form's own row matches with no transform and ranks before the lemma: of
  the 114 sentence words, the lemma is the first result for 17, the first
  entry with definitions for 60, and within the first three for 112. A pack
  cannot change this order today. A framework change that follows the
  references as Yomitan does, chosen by a pack field (`lookup.formOf`), is
  planned (hachi-lang-engine-f); this pack takes `"follow"` when it lands.
- **Wrong deinflections can outrank the lemma** among entries with
  definitions, since the pack cannot order results of the same matched and
  trace length: for 15 of the 20,000 frequent words a wrong deinflection
  comes before the lemma, for 5 it is the first entry with definitions
  (*resumed* → *resum*, *india* → *indium*, *santa* → *santon*). Most are
  e-final verbs of more than one syllable whose e-less stem is an obsolete
  or rare headword (*defined* → *defin*, *wasted* → *wast*, *breathing* →
  *breath*), which no spelling rule tells from *visited* → *visit*.
- **Auxiliary + regular participle + particle** is read as a phrasal verb of
  *have*, *do* or *be* (*had pointed out* → *have out*, *had picked up* →
  *have up*): 13 first results in *Treasure Island*, 288 in the 20 novels.
  The guard words stop the irregular participles; regular ones are an open
  class. A `verbGuardWords` field for `interposedObject` is accepted for the
  framework (hachi-lang-engine-g); the pack lists the auxiliaries there
  when it lands.
- **A trailing apostrophe never ends a scanned prefix.** Apostrophes separate
  words, and word resolution tries prefixes that end after a word
  character, so *goin'* and *dogs'* are looked up only where the apostrophe
  ends the scanned text. Inside a sentence the dropped-g and plural
  possessive rules do not apply: *goin' home* finds *goin*, *dogs' bowls*
  finds *dog* through *dogs*. Changing it is a framework change.
- **Prepositional particles after an object** are not read as an interposed
  object (*put Mary's coat on* gives *put*), by measurement (Rule provenance).
- **Multiword entries** are reached only when their second word is a particle,
  preposition, article, pronoun or possessive (95 words): *running late*
  finds *run*, not *run late* (wty-en-en has *running late* as a form-of row).
- **Capitalised headwords** at the start of a sentence come before the
  lowercase word, which needs a processor step: *It's* gives the noun *It*
  first, *She'd* the name *She*.
- **Clitics give the host word only**: *he's*, *she'd*, *we'll* give *he*,
  *she*, *we*, not *be*, *have*, *would* or *will*.
- **Phrasal copies drop stem constraints.** The `phrasal` rule type has none,
  so the multiword copy of a rule with a stem constraint applies without it
  (*being up* → *bee up*). Such texts are rarely headwords; the `-lit` →
  `-light` compound rule has no phrasal copy for this reason (*split up*).
- **Rare and obsolete forms the spelling constraints give up**: two-letter
  stems ending in a vowel (*pas*, *mas*, *eas*), obsolete -ie spellings of
  -y verbs (*envied* → *envie*), -ie and -u verbs outside the list
  (*sortied*, *snafued*), and -ses after a consonant and s (*ballockses*,
  *summonses* is a whole word): 397 of the 216,933 dev-pool rows, all of
  which the rules reached before the audit round.
- **gaps.tsv**: *red* → *rede* (archaic; *-d* after a two-letter stem would
  make *bed* and *wed* into *be* and *we*), *stolen* → *steale* (obsolete
  spelling; *steal* is found), *former* → *fore*, *eas* → *ea*, *envied* →
  *envie* and *shied* → *shie* (above).
