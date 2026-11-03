# Tagalog (`tl`)

Deinflection rules, text processors and scanning settings for Tagalog.
Lookups start at the hovered word and try only prefixes that end at a word
boundary (`word` / `word` / `spaces`, docs/languages.md 14.1). Hyphens and
apostrophes separate words, so *mag-aral* is found as the longer match of
*mag* and *aral*, and *ako'y* as the contraction of *ako*; the soft hyphen
is part of a word. Baybayin letters count as letters: wiktionary-to-yomitan's
dictionary lists 31,360 Baybayin spellings as form-of rows of their Latin
headwords, and no rule deinflects Baybayin.

The pack's dictionary leaves the part-of-speech column empty on every row
(below), so the pack sets `lookup.untaggedTerms` to `pass` and keeps the
conditions on its rules. Every number is given for both values (docs/
languages.md section 14, step 5): `pass`, the pack's, and `filter`,
Yomitan's behaviour.

## Sources and licences

- `sources/own.json` and every rule of `transforms.json` with source `own`
  or `both`: written for this pack (GPL-3.0-or-later) by
  `sources/own-rules.mjs`, from the standard description of Tagalog verbal
  and adjectival morphology (Schachter and Otanes, *Tagalog Reference
  Grammar*, 1972; the Komisyon sa Wikang Filipino's *Ortograpiyang
  Pambansa*, 2014, for hyphens; Wiktionary's Tagalog conjugation tables).
  No text or table is copied from them.
- `sources/yomitan.json` and the rules of `transforms.json` with source
  `yomitan`: Yomitan's Tagalog rules,
  [`ext/js/language/tl/tagalog-transforms.js` at d3c54c1](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/tl/tagalog-transforms.js),
  ported by `tools/port-yomitan-transforms.mjs`, with its 500 `todo` rules
  mapped by `sources/map-yomitan.mjs`. GPL-3.0-or-later, Copyright (C)
  2024-2026 Yomitan Authors. The processors `removeAlphabeticDiacritics`,
  `decapitalize` and `capitalizeFirstLetter` are Yomitan's
  (`ext/js/language/text-processors.js`, same licence).
- `tests/yomitan.tsv`: Yomitan's
  [Tagalog transform test](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/tagalog-transforms.test.js),
  converted by `tools/port-yomitan-tests.mjs`; `sources/build-final.mjs`
  set the reasons of the 4 rows whose Yomitan transform is not in the final
  set to `*`. GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan Authors.
- `tests/corpus.tsv` and `tests/gaps.tsv`: 1,799 pairs sampled with seed 1
  by `sources/build-corpus.py` from two sources:
  - [UniMorph tgl](https://github.com/unimorph/tgl) at 799d79d (file `tgl`,
    sha256 `84bcc773…e840b`), CC BY-SA 3.0, by the UniMorph contributors
    (annotator Jennifer White, data from NIU's SEAsite): 900 verb forms with
    their root, which UniMorph gives as the lemma (*kumakain* → *kain*);
  - kaikki.org's Tagalog extraction of English Wiktionary (extracted
    2026-10-30 from the 2026-10-01 dump, `kaikki.org-dictionary-Tagalog.jsonl`
    sha256 `d2824e2b…b146`), CC BY-SA 4.0, by the Wiktionary contributors:
    800 verb aspects with the verb's headword (*kinakain* → *kainin*) and 99
    plurals of ma- adjectives (*magaganda* → *maganda*), from the head
    templates.

  Accents and the apostrophe of a final glottal stop are removed, as text
  is written. Rows the final rules reach are in `corpus.tsv` (1,749), the
  others in `gaps.tsv` (50).
- `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`,
  `tests/dictionary/`, `sources/sentences.tsv` and the rest of
  `language.json`: written for this pack (GPL-3.0-or-later).
- Not committed, used for the measurements below:
  - the dictionary
    [wty-tl-en](https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/tl/en/wty-tl-en.zip)
    from [wiktionary-to-yomitan](https://github.com/yomidevs/wiktionary-to-yomitan),
    release 2026-10-22 (wty commit 61eaa08, sha256 `05c384d7…06be`,
    124,921 term rows), CC BY-SA 4.0 (Wiktionary through kaikki.org). It is
    the recommended dictionary: there is no wty-tl-tl, and no other
    Yomitan-format Tagalog dictionary with a known licence. Its `rules`
    column is empty on every row; by first definition tag: `non-lemma`
    91,298 (rows that are only form-of references), `n` 18,436, `adj` 4,901,
    `name` 4,858, `v` 3,632, `intj` 393, `adv` 371, `num` 219, and 1,013
    in 18 smaller groups and 22 rows without a tag;
  - the subtitle frequency list `tl_full.txt` of
    [FrequencyWords](https://github.com/hermitdave/FrequencyWords) at 525f9b5
    (content/2018/tl, 10,665 words, 94,596 tokens in its first 10,000 words,
    sha256 `83defa36…09f8`), content CC BY-SA 4.0;
  - [Tatoeba](https://tatoeba.org)'s Tagalog sentences,
    `tgl_sentences.tsv.bz2` downloaded 2026-11-03 (79,134 sentences, sha256
    `113726a2…7bae`), CC BY 2.0 FR;
  - two Project Gutenberg texts, public domain in the USA:
    [47629](https://www.gutenberg.org/ebooks/47629) *Ang "Filibusterismo"*
    (José Rizal, translated by Patricio Mariano; 118,273 words in the
    spelling of 1911, with accents and *ng̃*; sha256 `c0a94476…cefc`) and
    [46639](https://www.gutenberg.org/ebooks/46639) *Ang Pag-ibig ng Layas*
    (Jose N. Sevilla; 40,818 words; sha256 `03d2434d…e510`).

## Rule provenance

`transforms.json` has 91 transforms and 2,176 rules (3,389 with cross
products expanded): 1,762 `own`, 347 `yomitan` and 67 `both`.
`sources/build-final.mjs` writes it from the union that
`tools/merge-transforms.mjs` makes:

- the own transforms come first, then Yomitan's, so where both reach a term
  in the same number of steps the own trace is the one a lookup keeps;
- an own rule that makes a deinflection a Yomitan rule makes (the same rule
  type and affixes) is marked `both`, whether the Yomitan rule stays or is
  removed: 67 rules, for example the own `-in`, `-an`, `ma-`, `mag-`,
  `mang-`, `i-`, `pag-` and the linker's `-ng`;
- a Yomitan rule is left out as a copy only when an own rule accepts every
  stem it accepts. No Yomitan rule passes that test: each own twin has a
  stem constraint Yomitan's lacks, so Yomitan's rule stays unless it is
  removed for harm (below). Yomitan's `pang-` (*pangdiyeta* → *diyeta*,
  *pangsuporta* → *suporta*) and `mapag-` (*mapagusisa* → *usisa*) stay
  this way;
- the own rules written after Yomitan's rules were read, as constrained
  versions of them, are marked `yomitan`, not `own` (28 rules): the
  transforms `ka`, `pa`, `pala`, `tag` and `maIn`, and the -unan, -unin,
  -ran → d and pagkar-/pagkakar- rules;
- 19 Yomitan transforms (68 rules) and 12 single Yomitan rules are left
  out, each for the harm in the tables below (a single rule is named by its
  transform and affix, or by its pattern, so `pakiki- pakiki` leaves out
  the prefix rule and keeps Yomitan's pakiki- + rep1 pattern);
- the other Yomitan rules stay: affixes the own rules lack (`ipang-`,
  `tagapag-`, `tagapang-`, `magkanda-`, `nakakapang-`, `makipag-…-an`,
  `pang-…-an`, `papang-…-in`, the ordinals *ikalawa*, *ikatlo*,
  *pangalawa*, *pangatlo*), pang- before any consonant, mapag-
  before a vowel without the hyphen, its `rep1` rules (*magtatagal* →
  *tagal* in one step), the prefixes the own rules have with a minimum
  root, and its hyphen rule (*kapit-bahay* → *kapitbahay*).

Yomitan's rules are affix-to-root rules with conditions `n`, `adj` and
`num`; they name no aspect, so they reach 6.78% of the sample. The own
rules carry the aspects (completive, progressive, contemplative), the
infixes -um- and -in-, the linker and the contractions.

**Yomitan transforms left out.** "First results" are the positions of
Tatoeba (T) and the two Gutenberg texts (G) where the union's first result
differs from the final set's because of that transform, read with the
pack's `untaggedTerms: pass` (Measurements). "Constructed forms" are forms
`sources/check-removed.mjs` builds from the transform's rules and common
lemmas, with the share the final rules reach without it and with it.

| Transform | Harm | First results it changes | Constructed forms reached |
| --- | --- | --- | ---: |
| `-an` | wrong first results only; the own -an reaches the right ones | T 401, G 158: *Talagang* → *Talag* 141, *Abenang* → *Abe* 86, *matandaan* → *matanda* 25 | 62: 100% / 100% |
| `-in` | wrong first results only | T 303, G 60: *ring* → *d* 75, *Alin* → *Al* 59, *Kunin* → *Ko* 45 | 62: 100% / 100% |
| `-ng` | breaks 4 negatives (*ang* → *a*, *lang* → *la*) | T 118, G 777: *maneng* → *ne* 447, *malalaking* → *lalaki* 44 | 10: 50% / 100%¹ |
| `ma-` | breaks *mama* → *ma* | T 142, G 42: *mag* → *g* 86, *magaling sa* → *galing sa* 24 | 15: 100% / 100% |
| `i-` | breaks *ina* → *na*, *isa* → *sa* | T 38, G 25: *Io* → *o* 8, *iya’y* → *ya* 6 | 10: 100% / 100% |
| `ka-` | breaks *kasi* → *si*, *kaya* → *ya*, *kanya* → *nya*; the own ka- keeps its right readings | T 25, G 11: *kani* → *ni*, *katao po* → *tao po* | 15: 100% / 100% |
| `pa-` | breaks *paano* → *ano*, *papa* → *pa*, *pala* → *la* | T 75, G 26: *paano ba* → *ano ba* 39, *pay* → *y* 12 | 15: 100% / 100% |
| `pala-` | wrong first results only | T 5, G 5: *palala* → *la* | 15: 100% / 100% |
| `mag-…-an` | mostly wrong first results | T 49, G 16: *maghapunan* → *hapo* 35, against 5 right | 24: 100% / 100% |
| `pag-` | the reduplicated stem instead of the root | T 28, G 47: *pagbibigay* → *bibigay* 11 | 10: 100% / 100% |
| `pag-…-in` | wrong first results only | T 1, G 1: *pagyamanin* → *yama* | 24: 87.5% / 100% |
| `ma-…-an` | wrong first results only | T 3, G 1: *Marian* → *di* | 29: 100% / 100% |
| `ma-…-in` | wrong first results; the own ma- -in needs a root of four letters | T 33, G 1: *magasin* → *gas* 28 | 29: 75.9% / 100% |
| `magpa-` | no minimum root | T 3: *magpasa* → *sa*; the own magpa- keeps *magpaamo* → *amo* | 15: 100% / 100% |
| `tag-` | *tagalog* → *alog* | T 1, G 19 | 10: 80% / 100%² |
| `magsi-` | collides with mag- + a root in si-; the own magsi- is tried after mag- | T 9, G 3: *magsipilyo* → *pilyo* 8 | 20: 90% / 100% |
| `magma-` | wrong first results only | T 4: *magmahal.* → *hal.* | 15: 100% / 100% |
| `pa-…-an` | stems of one letter | T 2, G 1: *papuan* → *pu* | 29: 82.8% / 100% |
| `makapang-` | *makapangahas* → *ahas* | T 1, G 17: 12 wrong (*makapangahas* → *ahas*), 6 right (*makapanggamot* → *gamot*) | 34: 0% / 100%³ |

¹ The forms the final rules miss are consonant-final lemmas with -ng
(*sulatng*), which Tagalog writes *sulat na*. ² *tagaral*, *taginom*:
tag- without the hyphen before a vowel. ³ Unassimilated forms such as
*makapangkain*; the real ones (*makapangahas*, *makapanggamot*) are read as
maka- + *pangahas*, *manggamot*.

**Single Yomitan rules left out.** Prefix rules that an own rule makes
with a stem constraint. "First results" are the positions of Tatoeba (T)
and the Gutenberg texts (G) whose first result changes when that rule
alone is added back to the final set (`sources/attribute-removed.py`); all
are wrong but one, marked. The rest of each transform stays. The final
rules reach every form `sources/check-removed.mjs` builds from each of
them.

| Rule | First results it would change | Constructed forms reached |
| --- | --- | ---: |
| `mag-` *mag* | T 5, G 14: a vowel after mag- without the hyphen: *magubat* → *ubat*, *mag-2* → *2*, *magalák* → *alak*, *magipít* → *ipit* | 10: 100% / 100% |
| `ipa-` *ipa* | T 14: *ipaalam mo* → *alam mo* 9, *ipasa* → *sa* 5 | 10: 100% / 100% |
| `magka-` *magka* | T 13: *magkasing* → *si* | 10: 100% / 100% |
| `maka-` *maka*, *makar* | T 5, G 4: *makaya* → *ya*, *makaw* → *w*, *makar* → *d* | 15: 100% / 100% |
| `ika-` *ika* | T 3, G 1: *ikasang* → *sa*, *ikama* → *ma* | 10: 100% / 100% |
| `mang-` *mang* | T 3: *mango* → *o*; G 1: *manggaling sa* → *galing sa* (not wrong) | 10: 100% / 100% |
| `naka-` *naka*, *nakar* | T 3, G 2: *nakama* → *ma*, *nakay* → *y*, *nakar* → *d* | 15: 100% / 100% |
| `kaka-` *kaka* | T 4: *kakatingin ko* → *sa tingin ko* 2, *kakalaban sa* → *laban sa*, *kakae* → *e* | 10: 100% / 100% |
| `mapa-` *mapa* | T 1, G 9: *mápalâ* → *la*, *mapag* → *g*, *mapasa* → *sa* | 10: 100% / 100% |
| `pakiki-` *pakiki* | G 1: *pakikita* → *ta* | 10: 100% / 100% |

**Own rules.** One transform per affix or aspect, so a trace names both
(`progressive` then `mag`):

- aspect to infinitive: the completive (n- for the m- prefixes, the infix
  -in-, i- with -in-), the progressive and the contemplative (the root's
  first consonant and vowel copied after mag-, ma-, maka-, makapag-, maki-,
  makipag-, magpa-, mapa-, magka-, mai-, maipa-, maipag-, magpaka-, mapag-,
  mang-, i-, ipag-, ipa-, ika-, pag- -an and pa- -in, or after -um- and
  -in-, or of the prefix itself in speech: *nakakakain*), with d → r
  (*nagdarasal*), vowel roots (*nag-aaral*), clusters of loanwords
  (*nagtatrabaho*, *pinaplano*) and a hyphen before a loanword
  (*nagte-text*); the -in infinitive of a completive or progressive
  (*kinain*, *kinakain* → *kainin*; *ininom* → *inumin*; *binili* →
  *bilhin*);
- abilitative makapag-, mai-, maipa-, maipag- and social makipag-;
  recently completed *kakakain*, *kararating*; plural actor magsi-;
- affixes to the root: -um-, mag-, ma-, mang- (with the root's first
  consonant merged), maka-, maki-, magpa-, mapa-, magka-, magpaka-, i-,
  ipag-, ipa-, ika-, -in and -an (with u for the o of the last syllable,
  d → r, and verbs whose root loses a vowel: *bigyan* → *bigay*, *kunin* →
  *kuha*), the circumfixes ma- -an, maka- -an, pa- -an, pag- -an, pag- -in,
  pa- -in and ka- -an, gerunds with pag-, pagka-, pagkaka-, pagpapa-,
  pakiki- and pakikipag-, and paki-, naka-, nakaka-, taga-, pang-, mapag-
  and tig-; and, written after Yomitan's rules were read and marked
  `yomitan`, ma- -in, ka-, pa-, pala- and tag-;
- adjectives: plural ma-CV- (*magaganda*), superlative pinaka-, intensive
  napaka-, equative kasing-/kasin-/kasim-;
- the linker -ng after a vowel and -g after n, the contractions *'y*, *'t*
  and *'ng*, the older spellings *subali't*, and the hyphen after a prefix
  put back where old or informal text leaves it out (*nagaaral*,
  *pagibig*).

Conditions say what a rule's output is: an infinitive of a kind (`v_m`,
`v_um`, `v_i`, `v_sfx`, `v_in`), a root (`n`, `adj`, `v_root`) or an
intermediate state (`adj_ma`, `v_compl`), so only the rules that can follow
it apply. `n`, `adj` and `num` have Yomitan's definitions, as the merge tool
requires. The linker, the contractions and the hyphen give the word back
with no conditions, so every rule may follow them.

**Stem constraints and lists.** `sources/ablate.mjs` takes each of the
following out of a scratch copy, writes `tests/classes.json` again and runs
the conformance test; each makes a test fail, as named:

- the linker needs a stem of three letters (*lang* is not *la*, `cases.tsv`)
  apart from 13 listed short words (*kong* → *ko*, *pong* → *po*); 12 words
  in -n take -g where the word without the n is also a headword (*noong* →
  *noon*, not *noo*; `lookup.tsv` ranks 7 of them, each taken out on its
  own); in a phrase the last word follows the
  same rule (*alam mong* → *alam mo*, while *ka nang* is not *ka nan*, whose
  dictionary row names the affix *ka- -an*);
- the copied syllable must match the root's first vowel (*baboy* is not
  *boy*, *titulo* not *tulo*);
- the infix needs a vowel (or the l, r, w, y of a cluster) after the root's
  first consonant (*tindahan* is no -in- form);
- d → r only before the vowel that follows (*mandarin* is not *mandin*);
- -in and -an never start a capitalised word (*Talagang* is not *Talag*, a
  name; the decapitalised variant gives *talaga*), and -an not after mag-
  (*maghapunan* is mag- + *hapunan*);
- -in, -an, ma-, -um-, ipa-, mang-, paki-, pag-, kaka-, magsi-, the
  circumfixes and pang- without its hyphen stay within one word (*tungkol
  saan* is not *tungkol sa* + -an, *magaling sa* not ma- + *galing sa*,
  *nangako si* not mang- + *ako si*, *pakialam mo* not paki- + *alam mo*,
  *kakatingin ko* not *tingin ko*, *nasa unahan* not ma- + *sa una* + -an,
  *paningin ko* not pang- + *tingin ko*); pang- with the hyphen takes a
  phrase (*pang-alas onseng* → *alas-onse*);
- magsi- leaves out the roots *pilyo*, *gawa(n)* and *mula*, whose si- form
  is a word (*magsipilyo* is mag- + *sipilyo*, *nagsisigawan* mag- +
  *sigawan*, *magsimula* mag- + *simula*);
- mag-, ipag- and -um- need a consonant, a consonant and a vowel after
  them, without the hyphen (*maganda* is not mag- + *anda*, *ipagamot* not
  *amot*, *umpisa* not *pisa*; `lookup.tsv` and `cases.tsv`);
- magpa- and mapa- need a root of four letters after a consonant
  (*nagpasya* is mag- + *pasya*, *magpasa* is not magpa- + *sa*);
- ka- and pa- need a root of four letters and one word (*kanya* is not
  *nya*, *paano ba* not *ano ba*), pala-, ka- -an and ma- -in four letters
  (*palapag* is not *pag*, *magkamayan* not *may*, *magasin* not *gas*);
- pang- with a merged consonant needs four letters after the prefix
  (*pamuli* is pa- + *muli*, not pang- + *buli*);
- tag- before a vowel needs the hyphen (*tagalog* is not tag- + *alog*);
- the prefix reduplication of maka-, maki-, magpa-, magka-, makapag- and
  makipag- also reads straight to the root (*makakatulong* → *tulong*, not
  maka- + *katulong*);
- *'y* needs a vowel before it and a stem of two letters (*aklat'y* and
  *a'y* are no contractions), ka- -an puts back the o of the last syllable
  (*kalusugan* → *lusog*, `cases.tsv` with the trace `kaAn`), and `oldNg`
  maps the capital G̃ too (*NG̃AYON*, `text.tsv`);
- three orders: nakaka- before the aspect rules (*nakakahiya* → *hiya*
  before *makahiya*), ma- -an before -an (*matandaan* → *tanda* before
  *matanda*), magsi- after mag- (*nagsiklab* → *siklab* before *klab*,
  `lookup.tsv`).

The one-word constraint is also taken out of each of the 17 transforms
that have it on its own, and of magsi-'s patterns; each makes a
`cases.tsv` row fail. Three orders make no test fail: Yomitan's transforms
after the own ones, the linker last, and the completive after the
progressive. They decide which trace a result keeps when two traces of the
same length reach the same term; `lookup.tsv` checks the term and the
matched text, and a `cases.tsv` row passes when any trace has its reasons.

`traceSelection` is `shortest`, the contract's default and Yomitan's
choice; with `first`, *magaling* reads as *aling* and *ipagamot* as *amot*
(`lookup.tsv`).

**History.** The first commit of this pack, `tl: own rules`, has the own
rules as written before Yomitan's file was read (49 transforms, 1,736
rules). Later commits changed them after measuring:

- `n`, `adj` and `num` took Yomitan's definitions;
- the -in infinitive of a completive or progressive was added, as rules
  indexed by the root's last letter (an earlier version with an empty
  suffix tried its rules on every text and made lookups 4-9 times slower on
  12 test texts);
- the linker, copied-syllable, capital, one-word, mag-, four-letter and
  d → r constraints above, the linker's phrase patterns and lists, and the
  orders;
- d → r after every prefix that ends in a vowel (*nakarating* → *dating*,
  not *rating*); *pagiging* → *maging* and *pagkakaroon* → *magkaroon*;
  -unan and -unin → o (*matutunan* → *tuto*, *matuto*);
- the reciprocal mag- -an was dropped (*maghapunan* read as *hapon*): mag-
  now gives an -an word, which -an takes further (*magkamayan* →
  *kamayan* → *kamay*); magsi- moved after mag-;
- added after reading Yomitan's rules, as constrained versions of its
  rules: ka-, pa-, pala-, ma- -in and tag- (*gaano katagal* → *tagal*,
  *paligid* → *ligid*, *palatanong* → *tanong*, *madasalin* → *dasal*);
- a preprocessor reads the old *ng̃* as *ng* without keeping the input:
  wty-tl-en lists old spellings such as *ilang̃* as form-of rows, so the
  text as written (*kailang̃an*) reached *ilang* with fewer processor
  steps than *kailangan*;
- mapag- gained the aspect forms (*napagtanto* → *mapagtanto*) and takes a
  mapag- verb as well as an adjective; magsi- lost its own aspect and prefix
  reduplication rules (magsi- is read after mag-, through mag-'s aspect);
  the -in- cluster patterns were added (*pinaplano* → *plano*); -ran → d
  joined the circumfix suffixes;
- after audit-hachi-lang-tl: the stricter `both` test of
  `sources/build-final.mjs`, which keeps 20 Yomitan rules the first
  version left out, among them pang- and mapag- (12 others are left out one
  by one, above), and the one-word, magsi- and first-letter constraints
  above;
- after bee-san/hoshidicts#58 merged: `lookup.untaggedTerms` is `pass`;
- after audit-hachi-lang-tl-b: a single removed Yomitan rule is named by
  its pattern when it has one, so Yomitan's pakiki- + rep1 pattern is kept
  (it changes no first result in Tatoeba or the Gutenberg texts); rows for
  each one-word constraint, *'y*, ka- -an's o, `oldNg`'s G̃ and each listed
  -g word.

## Measurements

`hoshidicts-cli eval-language` at hoshidicts 0a73e5e (GCC 14.3, Release),
`--transforms` for each rule set, `--dictionary` wty-tl-en as published,
imported. "Pass" is the pack as committed, `"untaggedTerms": "pass"`: every
row of wty-tl-en carries D, the dictionary-form conditions, and matches
every deinflection whose conditions overlap it. "Filter" is the same pack
with `"untaggedTerms": "filter"` (`sources/measure.py --untagged filter`),
Yomitan's behaviour: a deinflection with conditions matches no term (docs/
languages.md 9.4), so only the text as written, the processors, the
linker, the contractions, the hyphen and the dictionary's form-of rows find
anything. Pass ranks more lemmas first (63.04% of the sample against
40.97%), so the pack keeps it. Before bee-san/hoshidicts#58 merged, these
numbers were measured with a labelled copy of wty-tl-en whose every row had
the `rules` value `n adj num v`; on every test file it gives the same
numbers as pass.

The pack has no optional processor, transform or variant pass, so every
file runs the same with every option on and with the defaults: a copy of
`cases.tsv` and of the sample with `# options: default` added gives the
same recall, false candidates and first rank (`eval-language` prints
`"options":"default"` and the same numbers).

| Rule set | Sample recall (1,799) | False candidates per row, pass / filter | First rank, pass / filter | `cases.tsv` positives (308) | `cases.tsv` negatives (70) | `yomitan.tsv` (14) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Own | 97.11% | 1.453 / 0.306 | 62.87% / 40.97% | 99.35% | 100% | 28.57% |
| Yomitan | 6.78% | 0.526 / 0.311 | 43.19% / 40.97% | 18.18% | 41.43% | 100% |
| Union | 97.22% | 1.470 / 0.311 | 62.92% / 40.97% | 100% | 40.00% | 100% |
| Final | 97.22% | 1.465 / 0.311 | 63.04% / 40.97% | 100% | 100% | 100% |

- **Recall** by source (final): UniMorph 881 / 900 (97.89%, lemma = root),
  kaikki verb aspects 769 / 800 (96.12%, lemma = headword), adjective
  plurals 99 / 99. The own rules miss two `cases.tsv` rows, the ordinals
  *pangalawa* and *ikalawa*, which only Yomitan's rules give.
- **First rank** is the share of sample rows whose full lookup shows the
  expected lemma first. For UniMorph rows that lemma is a root, which comes
  after the word's own entry or its infinitive, and with filter only
  form-of rows reach a lemma.
- **Trace quality** (`sources/measure.py traces`): of the 1,647 sampled rows
  with a completive, progressive or contemplative feature (completives of
  -um- verbs, which equal the infinitive, left out), the shortest trace to
  the lemma names the aspect for 92.8% with the own rules and 89.4% with
  the final set; Yomitan's rules name it for none. The final set is lower
  because Yomitan's `rep1` rules reach a root in one step without the
  aspect.
- **Per rule** (`--per-rule`, final set, the sample and `cases.tsv` as one
  file, pass): 365 rules recover a row, no rule breaks a negative, and 49
  rules add false candidates (119 in all: 73 from own rules, 24 `both`, 22
  Yomitan) without recovering a row, mostly the reduplication rules of
  one consonant (*kok-* → *k-*, *ses-* → *s-*), the hyphen put back after
  a prefix (*nagi-* → *nag-i*) and the gerund *pag-*. They are kept: no
  measured first result is wrong because of them, and their families are
  what reaches the forms the corpus lacks.
- **Differential check** (`tools/check-yomitan.mjs` with
  `build/hoshidicts-cli`): 5,445 inputs, 22,250 Yomitan results, 30
  differences, all the one that `sources/yomitan-differences.tsv` lists (a
  `u` that starts a sandwich stem: *kaunran* → *onr*); the three processors
  agree with Yomitan's on 2,170, 2,170 and 2,158 inputs.

**Frequent forms** (`sources/measure.py frequent`). Of the 10,000 most
frequent words of the subtitle list (94,596 tokens), 1,798 have a lemma a
form-of row of wty-tl-en or the corpus names, and a rule reaches it for 926
(4.74% of the tokens). Each word is looked up alone; the first result is
right when it is the word's own entry or such a lemma, unless it is a
linked word read as another headword that `sources/linked-judged.tsv`
judges wrong (below).

| Rule set | Words whose lemma a rule reaches | Wrong first, pass | Wrong first, filter |
| --- | ---: | ---: | ---: |
| Own | 921 | 12 | 73 |
| Yomitan | 41 | 1 | 3 |
| Union | 926 | 12 | 73 |
| Final | 926 | 11 (42 tokens, 0.044%) | 73 (220 tokens, 0.233%) |

With filter, 70 of the 73 find nothing at all: their infinitive comes only
through conditioned rules (*sumigaw* → *sigaw*, *ginamit* → *gamitin*,
*sumali* → *sali*). With pass the 11 are *kayang* → *kayan* (an awning,
through *kayang*'s form-of row, for *kaya* + -ng), *nag-aalala* and
*nag-isip* (the infinitive *mag-alala*, *mag-isip* first, where the form-of
rows name the root), *gagamitin* → *gagamit*, *ilalabas* → *lalabas*,
*titignan* and *tinignan* → *tingnan* (right, through the dictionary's
spelling *tignan*), *sinisante* → *sesantehin*, *paniniwalaan* →
*paniniwala*, *nagsikap* → *sikap* and *kinukuhanan* → *kuha*.

Counted over all 10,000 words, as the capitals are below, 18 words show a
linked word read as another headword that is judged wrong, with pass and
with filter: 0.80% of the list's tokens (*anong* → *anonang* 259 tokens,
*kang* 231, *bang* 136, *silang* 51, *kayang* → *kayan* 21, *batang* 16,
*pong* 12, *mang* 9, *palang* 5 and 9 more with 1-3 tokens). *mang* is
judged on the texts, where it is *man* + -g; in subtitles it is more often
the term of address the dictionary gives.

Written with a capital letter, as at the start of a sentence, 221 of the
10,000 words (16.22% of the list's tokens) show a capitalised headword, or
a linked word read as another headword, first with the final set, with
pass and with filter (Yomitan's rules alone: 252 with pass, 224 with
filter): *Ang* (a Chinese surname) for *ang*, *Ng* for *ng*, *Ko*, *Ka*,
*Isang* (a given name) for *isang*, *May*, *O*, *Yan*, *anonang* for
*Anong*, *Isa* (Jesus in Islam), *Salamat*, *Iba*. A few are right with
the capital (*Diyos*, *Linggo*). Known gaps says why.

**Phrases** (`sources/measure.py tatoeba`). Every word position of
Tatoeba's 79,134 sentences, looked up as the text from the word to the end
of its sentence (609,575 positions; a word includes the combining marks
after its letters). The first result is classed by script:

- a capitalised headword at a sentence start whose lowercase spelling is a
  headword too (*Ang*, *May*): counted as wrong, though a few are right
  (*Diyos*);
- a linked word read as another headword: the matched text is one word
  ending in -ng whose spelling without -ng is a headword, and the first
  result is neither that word nor a term a row describes as a word with
  the linker ("ligatured form of …", "From … + -ng") — *pong* → *pong*, a
  mahjong set, for *po* + -ng; *anong* → *anonang* through *anong*'s
  form-of row. Every group of 10 or more positions in Tatoeba or the
  Gutenberg texts is judged by hand in `sources/linked-judged.tsv` (27
  wrong, 38 right, such as *kung*, *lang*, *naging*, *tulong*, *saging*);
  the smaller groups are counted as not judged;
- the text as written or a term a form-of row names for it: right;
- a rule reading whose term the matched text's form-of rows (or the corpus)
  name: right;
- a reading of the linker, a contraction or the hyphen alone, which leaves
  the word itself: judged by hand on a random sample of 60 (seed 1);
- any other rule reading: judged by hand on a random sample of 60 (seed 1).

| Rule set | Found, pass / filter | Capital at a sentence start | Linked word read as another headword: wrong / right / not judged | As written or form-of | Lemma a form-of row names | Linker, contraction or hyphen only | Other rule readings (multiword) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Own | 579,761 / 551,313 | 8,430 | 6,197 / 3,407 / 132 | 465,927 | 19,761 | 45,961 | 29,946 (111) |
| Yomitan | 559,405 / 546,262 | 8,633 | 6,200 / 3,412 / 131 | 485,923 | 251 | 40,882 | 13,973 (160) |
| Union | 580,370 / 551,384 | 8,596 | 6,197 / 3,398 / 130 | 465,517 | 19,758 | 45,846 | 30,928 (226) |
| Final | 580,023 / 551,378 | 8,430 | 6,197 / 3,398 / 132 | 465,825 | 19,760 | 46,068 | 30,213 (111) |

(Columns 3-8 with pass. With filter the final set has the same 8,430
capitals, 6,205 / 3,409 / 143 linked words, 47,188 linker, contraction or
hyphen readings and no other rule reading.)

- **Wrong first results, final set, pass.** The capitals: 8,430, of which
  *May* 3,268, *Ang* 3,085, *Isa* 402, *Baka* 290, *Parang* 245,
  *Magaling* 136, *Malapit* 120. The linked words: 6,197, of which *pong*
  1,787, *bang* 1,018, *kang* 633, *yaong* 592, *anong* → *anonang* 546,
  *kayang* → *kayan* 451, *silang* 391, *batang* 234, *Isang* 186 and
  *Parang* 95 (after a sentence end inside a Tatoeba entry); the word
  without the linker is the second or third result. The other rule
  readings: 1 of the 60 sampled (seed 1) is wrong (*baba-baba* →
  *bababa*). A sample drawn the same way before pang- without its hyphen
  took one word (which moved 2 readings), sharing 19 readings with it, had
  4 wrong (*Gagabayan* → *gagabay*, *Pinatong* → *tong*, *ipinagako* →
  *ako*, *pagtatalong* → *talong*): 5 wrong of 101 readings in all, about
  5%, or about 1,500 of 30,213. The linker readings: 0 of 60 (seed 1)
  wrong. In all about 16,100 of the 580,023 positions found (2.8%): the
  capitals half of them, the linked words two fifths.
- Of the other rule readings, 7,215 follow a marker (*ang*, *ng*, *sa*,
  *si*, *mga*, *ay*, *na*, ...), 2,007 a pronoun and 2,207 a particle.
- Of the 111 multiword rule readings 5 are wrong (*inano ba* and *inaano
  ba* → *ano ba* 2, *pinatingin ko* → *sa tingin ko* 1, *inamin na* →
  *amin na* 1, *pangako si* → *ako si* 1); the rest are set phrases
  (*sinabi nila* → *sabi nila* 15, *mag-alas dos* → *alas-dos* 12,
  *maliliit na bagay* → *maliit na bagay* 7, *naging tao* → *magintao*, to
  be born as a person, 3).
- Before the fixes of the history above, the largest wrong groups of rule
  readings were *Talagang* → *Talag* (141), *Abenang* → *Abe* (86), *ka
  nang* → *ka- -an* (110), *naman ang* → *pang- -an* (58), *paano ba* →
  *ano ba* (39), *magsipilyo* → *pilyo* (16) and *nangako si* → *ako si*
  (4); none of them is left.

**Real text** (`sources/measure.py text`): the two Gutenberg texts, 8,386
sentences and 154,145 positions, looked up and classed the same way.

| Rule set | Found, pass / filter | Capital at a sentence start | Linked word read as another headword: wrong / right / not judged | As written or form-of | Lemma a form-of row names | Linker, contraction or hyphen only | Other rule readings (multiword) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Own | 145,839 / 132,223 | 1,167 | 610 / 556 / 99 | 107,860 | 3,729 | 17,093 | 14,725 (45) |
| Yomitan | 137,417 / 130,059 | 1,187 | 610 / 557 / 100 | 114,360 | 60 | 12,542 | 8,001 (58) |
| Union | 146,501 / 132,263 | 1,183 | 609 / 555 / 99 | 107,520 | 3,722 | 17,109 | 15,704 (97) |
| Final | 145,932 / 132,230 | 1,167 | 609 / 555 / 99 | 107,619 | 3,724 | 17,175 | 14,984 (50) |

- **Wrong first results, final set, pass.** The capitals: 1,167 (*Ang*
  874, *May* 70, *Oh* 37, *Tunay* 31). The linked words: 609, of which
  *Isang* 110, *mang* 93 (*man* + -g, as in *sino mang*), *kang* 43,
  *yaong* 42, *silang* 41, *anong* → *anonang* 34, *bang* 32 and *labing*
  30 (for *labing-*, the -teen numerals). The other rule readings: 9 of 60
  sampled (seed 1) are wrong (*ikatutuwâng* → *tuwang*, *patayang* →
  *taya*, *Katakátakáng* → *takatak*, *gagamitin* → *gagamit*, *katuturán*
  → *turan*, *umalí* → *ale*, *Mameng* → *bang*, *nang̃aglálarô* →
  *manlalaro*, *Kikoy--ang* → *kikoy*), about 2,250 of 14,984. The linker
  readings: 2 of 60 (seed 1; the name *Orang* → *ora*, and *diya’y* →
  *diya*, a jellyfish, for *diyan ay*), about 570 of 17,175. In all about
  4,600 of the 145,932 positions found (3.2%).
- The largest groups of other rule readings are *Mameng* → *bang* (145,
  wrong: a name read as mang- with a merged b, *beng*, a spelling of
  *bang*), *nag-aaral* → *mag-aral* (127), *babaing* → *baba* (82, wrong:
  the old spelling of *babaeng*), *mangyayaring* → *mangyari* (59) and
  *makaraig* → *daig* (51).
- The old spelling is read through the processors: accents and the *ng̃*
  are removed; *c* and *qu* (Rizal's *Noli*, Gutenberg 20228) are not
  mapped to *k*.

**Real use** (`sources/measure.py sentences`): the 65 sentences of
`sources/sentences.tsv`, each word looked up from it to the end of its
sentence. With pass the expected entry is the first result for 53 and
comes right after the word's own entry for the other 12 (wty-tl-en defines
many aspect forms, such as *kumakain* "progressive aspect of kumain"); with
filter, 37 and 10, and nothing at all for 16 (*Nakarating*, *katagal*,
*Napakaganda*).

**Hachidori** (feat/multi-language 803f7b6 with this branch in
`third_party/hoshidicts`, its three WebAssembly runtimes rebuilt from it
with `wasm/build.sh` and emsdk 6.0.9, since the prebuilt ones predate
`untaggedTerms`; `test/chrome-language-pack.mjs` with
`HACHIDORI_CASES=languages/tl/sources/chrome-cases.tsv`, Chrome 152,
wty-tl-en as published): 14 passed, 0 failed (adding Tagalog beside
Japanese, the import of 124,921 terms, 10 cases such as *Nagluluto* →
*magluto* [progressive] and *Ako'y* → *ako* ['y], the Anki note, and the
switch to Japanese and back). The popup for *Nagluluto* shows *magluto*
and then *luto*, which only `pass` reaches.

**Performance** (with `pass`; host load 44-48 on 64 cores, so upper
bounds):

- native `benchmark-lookup --languages languages --language tl` with
  wty-tl-en on the 421 word positions of the 65 sentences, each from the
  word to the end of its sentence (`measure.py positions`), 6 passes with
  the first dropped, three runs: p50 32.6-33.3 µs, p95 84.5-86.9 µs (budget
  1 ms p50);
- Hachidori's WebAssembly (the rebuilt runtimes, Node 22,
  `benchmark/node-lookup.mjs`, the 430 word positions that harness finds in
  the same sentences, 6 passes): `hdw_lookup` single-thread p50 94.5 µs,
  p95 256.1 µs; threaded p50 107.5 µs, p95 280.8 µs;
- pack load (`sources/wasm-load.mjs`, 10 fresh engines): `hdw_language_load`
  median 15.5 ms single-thread and 16.2 ms threaded, live heap +1,279,704
  bytes; natively (`sources/load-native.cpp`) `LanguageRegistry::add`
  takes 3.9-4.1 ms (median of 50, three runs) and the registry holds
  2,475,728 bytes. Budgets 50 ms and 20 MB;
- 187 `pattern` rules: they add 286,632 bytes of heap and 2.9 ms of load in
  WebAssembly (the same measurement without them).

**Commands.** From the repository root, with `build/` configured as
section 14 says and the inputs in a cache directory `$C`:

```sh
node languages/tl/sources/own-rules.mjs              # sources/own.json
node tools/port-yomitan-transforms.mjs $YOMITAN tl --force
node languages/tl/sources/map-yomitan.mjs $YOMITAN   # sources/yomitan.json
node tools/port-yomitan-tests.mjs $YOMITAN tl        # tests/yomitan.tsv with Yomitan's reasons
node languages/tl/sources/build-final.mjs            # transforms.json, tests/yomitan.tsv reasons
python3 languages/tl/sources/build-corpus.py $C/unimorph-tgl/tgl $C/kaikki.org-dictionary-Tagalog.jsonl
node tools/check-classes.mjs tl --write
build/hoshidicts-cli import $C/wty-tl-en.zip         # writes $C/wty-tl-en/ beside the zip
g++ -O2 -std=c++23 -Iinclude languages/tl/sources/lookup-batch.cpp -o build/tl-lookup-batch \
  build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
  build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
  build/liblzokay.a build/libgumbo.a
for u in pass filter; do
  for c in eval frequent tatoeba text traces sentences; do
    python3 languages/tl/sources/measure.py $c --cache $C --dictionary $C/wty-tl-en --untagged $u --show 100 --sample 60
  done
done
python3 languages/tl/sources/measure.py tatoeba --cache $C --dictionary $C/wty-tl-en --dump tat
python3 languages/tl/sources/measure.py text --cache $C --dictionary $C/wty-tl-en --dump text
python3 languages/tl/sources/attribute-removed.py tat text   # the removal tables' first results
node languages/tl/sources/check-removed.mjs
node languages/tl/sources/ablate.mjs
python3 languages/tl/sources/measure.py positions > words.txt
build/benchmark-lookup words.txt 6 --languages languages --language tl --term $C/wty-tl-en --json
g++ -O2 -std=c++23 -Iinclude languages/tl/sources/load-native.cpp -o build/tl-load-native \
  build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
  build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
  build/liblzokay.a build/libgumbo.a
build/tl-load-native languages/tl
node languages/tl/sources/wasm-load.mjs <hachidori checkout>
```

`hoshidicts-cli import` writes the imported directory beside the zip, so
import a copy in another directory when the cache is shared. The labelled
copy used before #58 merged is wty-tl-en.zip with `n adj num v` written
into the `rules` column of every term row and the title changed, imported
the same way.

## Known gaps

- **A capitalised headword comes first at the start of a sentence.**
  wty-tl-en has capitalised rows for many common words: *Ang* (a Chinese
  surname), *May* (a given name, and the abbreviation of *Mayo*), *Isa*
  (Jesus in Islam), *Baka* (the surah al-Baqara), *Parang* (a place),
  *Magaling*, *Malapit* and *Salamat* (surnames). The text as written
  matches such a row with no processor step, and the common word needs
  `decapitalize`, one step, which ranks after it (docs/languages.md 9.6).
  The pack cannot change this: `decapitalize` is Yomitan's processor and
  keeps its input, as check-yomitan requires, and a processor that dropped
  the capital would also turn *Hapon* (Japan) into *hapon* (afternoon) and
  *Linggo* (Sunday) into *linggo* (week) inside a sentence: after another
  word, 3,753 Tatoeba positions show a capitalised headword first (*Hapon*
  313, *Diyos* 142, *Lunes* 111, *Linggo* 59). Only the host knows where a
  sentence starts. Counts, with pass and with filter: 8,430 Tatoeba
  positions (1.5% of those found), 1,167 in the Gutenberg texts, and 207 of
  the 10,000 frequent words written with a capital (15.27% of the list's
  tokens; 221 and 16.22% with the linked words of the next entry, such as
  *Isang*). The German pack has the same gap; a host flag for a scan at a
  sentence start is a follow-up.
- **A word with the linker can read as another headword.** The linker -ng
  (-g after n) joins a word to the next one, so it is on most phrases, and
  for many frequent words the joined spelling is another headword of
  wty-tl-en: *pong* (a mahjong set) for *po* + -ng, *bang* for *ba* + -ng,
  *kang* for *ka* + -ng, *yaong* (a porcelain cup) for *yaon* + -g, *silang*
  (birth) for *sila* + -ng, *batang* (a log) for *bata* + -ng, *Isang* (a
  given name) for *isa* + -ng at a sentence start. The text as written
  matches that row with no step and the linker reading has one, so the row
  comes first (docs/languages.md 9.6); wty-tl-en's form-of rows *anong* →
  *anonang* and *kayang* → *kayan* do the same through the dictionary. The
  word without the linker is the second or third result. The pack cannot
  reorder these: without the linker's -g rule, *kayang* still reads as
  *kayan* through its form-of row. Counts, judged by group in
  `sources/linked-judged.tsv`, with pass (filter): 6,197 (6,205) Tatoeba
  positions, 1.1% of those found; 609 (614) in the Gutenberg texts; and 18
  of the 10,000 frequent words, 0.80% of the list's tokens. A follow-up
  that lets a pack ignore given form-of rows would fix *anong* and
  *kayang*.
- **The dictionary has no parts of speech.** With `pass` every row of
  wty-tl-en carries D, so the part-of-speech filter cannot tell a noun from
  a verb: a rule that makes a verb also reaches a noun spelled the same,
  and the false candidates per sample row rise from 0.311 with filter to
  1.465. With filter a rule whose output has conditions finds nothing:
  28,645 Tatoeba positions and 70 of the 10,000 frequent words find nothing
  that pass finds. The rules keep their conditions, as section 14 asks, so
  a dictionary that tags its rows is filtered.
- Names and loanwords the dictionary lacks are read as inflected words:
  *Mameng* → *bang* (145 Gutenberg positions), *Narita* → *dita*, *parking*
  → *park*, *Leoning* → *leon*; a capitalised word with the linker can reach
  a name before the common word (*Punong* → *Puno* before *puno*, *Habang* →
  *Haba* before *habang*).
- A prefix reading can be shorter than the linker's: *nakakatuwang* →
  *tuwang* (one step) before *tuwa* (two), *pagtatalong* → *talong*,
  *ikatutuwâng* → *tuwang*, *pagkakasalang* → *salang* before *sala*.
- A contemplative stem that is a headword of its own comes before the root:
  *gagamitin* → *gagamit* (19 Tatoeba and 4 Gutenberg positions),
  *gagabayan* → *gagabay* (3 Tatoeba).
- Merged consonants are ambiguous: *paminsan* → *pinsan* (43 Tatoeba
  positions; *paminsan-minsan* is no headword), *namitas* → *bitas* for
  *pitas*.
- Readings with the same steps and trace length keep the order the
  deinflector finds them in: *Pinatong* gives *tong* before *patong*, both
  one completive step.
- Yomitan's pang-, kept whole for *pangdiyeta*, reads into the next word
  where the dictionary has the phrase: *pangako si* → *ako si* (1 Tatoeba
  position).
- The Gutenberg texts write a dash as `--`, and Yomitan's hyphen rule
  removes one hyphen at a time, so *paano--ang* is read as one word,
  *paano* with -an and the linker (209 Gutenberg positions with pass, 31
  with filter; none in Tatoeba). The term is the first word's, but the match
  and the trace are wrong.
- Old spellings: *babaing* (*babaeng*) → *baba* (82 Gutenberg positions);
  *c* and *qu* are not read as *k*.
- 50 sampled forms are in `gaps.tsv` (19 UniMorph, 31 kaikki): -in
  infinitives whose stem changes in ways the rules do not model
  (*inatake* → *atakihin*, *iniba* → *ibhin*, *dinarama* → *damhin*),
  lemmas of the sources that are not the dictionary's (*tinadtad* →
  *tatad*, where the rules give wty-tl-en's *tadtad*; *sinasalita* →
  *salit-in*), typos and old spellings (*bumibista*, *mapupunitpu*,
  *naguiguing*) and irregular forms (*diringinggin* → *dinig*, *nangako*
  → *pangako*, *ipapanganak* → *anak*).
- Trace names: Yomitan's `rep1` rules reach the root of a reduplicated form
  in one step and name no aspect (trace quality 89.4% against 92.8% for the
  own rules alone).
- Baybayin text is looked up through the dictionary's Baybayin rows only;
  no rule deinflects it.
