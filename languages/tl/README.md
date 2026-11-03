# Tagalog (`tl`)

Deinflection rules, text processors and scanning settings for Tagalog.
Lookups start at the hovered word and try only prefixes that end at a word
boundary (`word` / `word` / `spaces`, docs/languages.md 14.1). Hyphens and
apostrophes separate words, so *mag-aral* is found as the longer match of
*mag* and *aral*, and *ako'y* as the contraction of *ako*; the soft hyphen
is part of a word. Baybayin letters count as letters: wiktionary-to-yomitan's
dictionary lists 31,360 Baybayin spellings as form-of rows of their Latin
headwords, and no rule deinflects Baybayin.

The pack's dictionary leaves the part-of-speech column empty (below), so
until `lookup.untaggedTerms` reaches main every number is given twice: with
the dictionary as published, and with a labelled copy that reads it as
`"untaggedTerms": "pass"` will.

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
  set the reasons of the 5 rows whose Yomitan transform is not in the final
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
    column is empty on every row; 91,298 rows are only form-of references;
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

`transforms.json` has 81 transforms and 2,143 rules (3,369 with cross
products expanded): 1,812 `own`, 299 `yomitan` and 32 `both`.
`sources/build-final.mjs` writes it from the union that
`tools/merge-transforms.mjs` makes:

- the own transforms come first, then Yomitan's, so where both reach a term
  in the same number of steps the own trace is the one a lookup keeps;
- a Yomitan rule that makes the deinflection an own rule makes (the same
  rule type and affixes, whatever the conditions and stem constraints) is
  left out and the own rule is marked `both`: 32 rules of `mag-`, `mang-`,
  `maka-`, `maki-`, `magka-`, `mapa-`, `magpaka-`, `ipag-`, `ipa-`, `ika-`,
  `naka-`, `nakaka-`, `taga-`, `pang-`, `mapag-`, `pag-`, `pagka-`, `kaka-`
  (the own recently completed) and one contemplative rule;
- 19 Yomitan transforms (68 rules) are left out, each for the harm in the
  table below;
- the other 299 Yomitan rules stay: affixes the own rules lack (`pang-`
  before any consonant as in *pangdiyeta*, `ipang-`, `tagapag-`,
  `tagapang-`, `magkanda-`, `pakiki-`, `nakakapang-`, `makipag-…-an`,
  `pang-…-an`, `papang-…-in`, the ordinals *ikalawa*, *ikatlo*,
  *pangalawa*, *pangatlo*), its `rep1` rules (*magtatagal* → *tagal* in one
  step), and its hyphen rule (*kapit-bahay* → *kapitbahay*, *paki-alam* →
  *pakialam*).

Yomitan's rules are affix-to-root rules with conditions `n`, `adj` and
`num`; they name no aspect, so they reach 6.78% of the sample. The own
rules carry the aspects (completive, progressive, contemplative), the
infixes -um- and -in-, the linker and the contractions.

**Yomitan transforms left out.** "First results" are the positions of
Tatoeba (T) and the two Gutenberg texts (G) where the union's first result
differs from the final set's because of that transform, read with the
labelled copy of wty-tl-en (Measurements). "Constructed forms" are forms
`sources/check-removed.mjs` builds from the transform's rules and common
lemmas, with the share the final rules reach without it and with it.

| Transform | Harm | First results it changes | Constructed forms reached |
| --- | --- | --- | ---: |
| `-an` | wrong first results only; the own -an reaches the right ones | T 401, G 199: *Talagang* → *Talag* 141, *Abenang* → *Abe* 86, *matandaan* → *matanda* 25 | 62: 100% / 100% |
| `-in` | wrong first results only | T 303, G 79: *ring* → *d* 75, *Alin* → *Al* 59, *Kunin* → *Ko* 45 | 62: 100% / 100% |
| `-ng` | breaks 4 negatives (*ang* → *a*, *lang* → *la*) | T 129, G 795: *maneng* → *ne* 447, *malalaking* → *lalaki* 44 | 10: 50% / 100%¹ |
| `ma-` | breaks *mama* → *ma* | T 142, G 42: *mag* → *g* 86, *magaling sa* → *galing sa* 24 | 15: 100% / 100% |
| `i-` | breaks *ina* → *na*, *isa* → *sa* | T 40, G 375: *íg* → *g* 141, *Io* → *o* 8 | 10: 100% / 100% |
| `ka-` | breaks *kasi* → *si*, *kaya* → *ya*, *kanya* → *nya*; the own ka- keeps its right readings | T 25, G 11: *kani* → *ni*, *katao po* → *tao po* | 15: 100% / 100% |
| `pa-` | breaks *paano* → *ano*, *papa* → *pa*, *pala* → *la* | T 75, G 26: *paano ba* → *ano ba* 39, *pay* → *y* 12 | 15: 100% / 100% |
| `pala-` | wrong first results only | T 5, G 5: *palala* → *la* | 15: 100% / 100% |
| `mag-…-an` | mostly wrong first results | T 49, G 16: *maghapunan* → *hapo* 35, against 5 right | 24: 100% / 100% |
| `pag-` | the reduplicated stem instead of the root | T 26, G 44: *pagbibigay* → *bibigay* 11 | 10: 100% / 100% |
| `pag-…-in` | wrong first results only | T 1, G 1: *pagyamanin* → *yama* | 24: 87.5% / 100% |
| `ma-…-an` | wrong first results only | T 3, G 1: *Marian* → *di* | 29: 100% / 100% |
| `ma-…-in` | wrong first results; the own ma- -in needs a root of four letters | T 33, G 1: *magasin* → *gas* 28 | 29: 75.9% / 100% |
| `magpa-` | no minimum root | T 3: *magpasa* → *sa*; the own magpa- keeps *magpaamo* → *amo* | 15: 100% / 100% |
| `tag-` | *tagalog* → *alog* | G 19 | 10: 80% / 100%² |
| `magsi-` | collides with mag- + a root in si-; the own magsi- is tried after mag- | T 1, G 3 | 20: 90% / 100% |
| `magma-` | wrong first results only | T 4: *magmahal.* → *hal.* | 15: 100% / 100% |
| `pa-…-an` | stems of one letter | T 2, G 1: *papuan* → *pu* | 29: 82.8% / 100% |
| `makapang-` | *makapangahas* → *ahas* | G 17 (12 wrong, 4 right) | 34: 0% / 100%³ |

¹ The forms the final rules miss are consonant-final lemmas with -ng
(*sulatng*), which Tagalog writes *sulat na*. ² *tagaral*, *taginom*:
tag- without the hyphen before a vowel. ³ Unassimilated forms such as
*makapangkain*; the real ones (*makapangahas*, *makapanggamot*) are read as
maka- + *pangahas*, *manggamot*.

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
  pa- -in, ka- -an and ma- -in, gerunds with pag-, pagka-, pagkaka-,
  pagpapa-, pakiki- and pakikipag-, and paki-, naka-, nakaka-, taga-,
  pang-, mapag-, tig-, tag-, ka-, pa- and pala-;
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
  *noon*, not *noo*, `lookup.tsv`); in a phrase the last word follows the
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
- -in, -an, ma-, -um- and ipa- stay within one word (*tungkol saan* is not
  *tungkol sa* + -an, *magaling sa* not ma- + *galing sa*, *ipaalam mo* not
  ipa- + *alam mo*);
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
- three orders: nakaka- before the aspect rules (*nakakahiya* → *hiya*
  before *makahiya*), ma- -an before -an (*matandaan* → *tanda* before
  *matanda*), magsi- after mag- (*nagsisipilyo* → *sipilyo* before
  *pilyo*).

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
  -unan and -unin → o (*matutunan* → *matuto*);
- the reciprocal mag- -an was dropped (*maghapunan* read as *hapon*): mag-
  now gives an -an word, which -an takes further (*magkamayan* →
  *kamayan* → *kamay*); magsi- moved after mag-;
- added after reading Yomitan's rules, as constrained versions of its
  rules: ka-, pa-, pala-, ma- -in and tag- (*gaano katagal* → *tagal*,
  *paligid* → *ligid*, *palatanong* → *tanong*, *madasalin* → *dasal*);
- a preprocessor reads the old *ng̃* as *ng* without keeping the input:
  wty-tl-en lists old spellings such as *ilang̃* as form-of rows, so the
  text as written (*kailang̃an*) reached *ilang* with fewer processor
  steps than *kailangan*.

## Measurements

`hoshidicts-cli eval-language` at hoshidicts b145feb (GCC 14.3, Release),
`--transforms` for each rule set, `--dictionary` the imported wty-tl-en.
"Published" is the dictionary as wiktionary-to-yomitan releases it.
"Pass" is a copy whose every row has the `rules` value `n adj num v`, which
gives each term the dictionary-form mask D that `"untaggedTerms": "pass"`
(bee-san/hoshidicts#58) gives an untagged row; it is labelled and not the
published dictionary. Under the published dictionary a deinflection with
conditions matches no term (docs/languages.md 9.4), so only the text as
written, the processors, the linker, the contractions, the hyphen and the
dictionary's form-of rows find anything.

The pack has no optional processor, transform or variant pass, so every
file runs the same with every option on and with the defaults: a copy of
`cases.tsv` and of the sample with `# options: default` added gives the
same recall, false candidates and first rank (`eval-language` prints
`"options":"default"` and the same numbers).

| Rule set | Sample recall (1,799) | False candidates per row, pass / published | First rank, pass / published | `cases.tsv` positives (262) | `cases.tsv` negatives (41) | `yomitan.tsv` (14) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Own | 97.11% | 1.458 / 0.306 | 62.87% / 40.97% | 100% | 100% | 35.71% |
| Yomitan | 6.78% | 0.526 / 0.311 | 43.19% / 40.97% | 20.61% | 31.71% | 100% |
| Union | 97.22% | 1.475 / 0.311 | 62.92% / 40.97% | 100% | 29.27% | 100% |
| Final | 97.22% | 1.470 / 0.311 | 63.04% / 40.97% | 100% | 100% | 100% |

- **Recall** by source (final): UniMorph 881 / 900 (97.89%, lemma = root),
  kaikki verb aspects 769 / 800 (96.12%, lemma = headword), adjective
  plurals 99 / 99.
- **First rank** is the share of sample rows whose full lookup shows the
  expected lemma first. For UniMorph rows that lemma is a root, which comes
  after the word's own entry or its infinitive, and with the published
  dictionary only form-of rows reach a lemma.
- **Trace quality** (`sources/measure.py traces`): of the 1,647 sampled rows
  with a completive, progressive or contemplative feature (completives of
  -um- verbs, which equal the infinitive, left out), the shortest trace to
  the lemma names the aspect for 92.8% with the own rules and 89.4% with
  the final set; Yomitan's rules name it for none. The final set is lower
  because Yomitan's `rep1` rules reach a root in one step without the
  aspect.
- **Per rule** (`--per-rule`, final set, sample and `cases.tsv`, pass): 342
  rules recover a row, no rule breaks a negative, and 48 rules add false
  candidates (119 in all) without recovering a row, 104 of them own, mostly
  single consonants of the reduplication families and the gerund. They are
  kept: no measured first result is wrong because of them, and their
  families are what reaches the forms the corpus lacks.
- **Differential check** (`tools/check-yomitan.mjs` with
  `build/hoshidicts-cli`): 5,345 inputs, 21,671 Yomitan results and no
  difference; the three processors agree with Yomitan's on 2,068, 2,068 and
  2,056 inputs.

**Frequent forms** (`sources/measure.py frequent`). Of the 10,000 most
frequent words of the subtitle list (94,596 tokens), 1,798 have a lemma a
form-of row of wty-tl-en or the corpus names, and a rule reaches it for 926
(4.74% of the tokens). Each word is looked up alone; the first result is
right when it is the word's own entry or such a lemma.

| Rule set | Words whose lemma a rule reaches | Wrong first, pass | Wrong first, published |
| --- | ---: | ---: | ---: |
| Own | 921 | 11 | 72 |
| Yomitan | 41 | 1 | 3 |
| Union | 926 | 11 | 72 |
| Final | 926 | 10 (21 tokens, 0.022%) | 72 (199 tokens, 0.210%) |

With the published dictionary 70 of the 72 find nothing at all: their
infinitive comes only through conditioned rules (*sumigaw* → *sigaw*,
*ginamit* → *gamitin*, *sumali* → *sali*). With pass the 10 left are
*nag-aalala* and *nag-isip* (the infinitive *mag-alala*, *mag-isip* first,
where the form-of rows name the root), *gagamitin* → *gagamit*, *ilalabas*
→ *lalabas*, *titignan* and *tinignan* → *tingnan* (right, through the
dictionary's spelling *tignan*), *sinisante* → *sesantehin*, *paniniwalaan*
→ *paniniwala*, *nagsikap* → *sikap* and *kinukuhanan* → *kuha*.

**Phrases** (`sources/measure.py tatoeba`). Every word position of
Tatoeba's 79,134 sentences, looked up as the text from the word to the end
of its sentence (609,626 positions). A first result is right by script when
it is the text as written, a term a form-of row names for it, or a rule
reading whose term the matched text's form-of rows name; a reading of the
linker, a contraction or the hyphen alone leaves the word itself; the
other rule readings were judged by hand on a random sample of 60 (seed 1).

| Rule set | Found, pass / published | As written or form-of | Lemma a form-of row names | Linker, contraction or hyphen only | Other rule readings (multiword) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Own | 579,793 / 551,345 | 483,622 | 20,196 | 45,999 | 29,976 (147) |
| Yomitan | 559,439 / 546,295 | 504,128 | 251 | 40,919 | 14,141 (160) |
| Union | 580,404 / 551,417 | 483,197 | 20,193 | 45,884 | 31,130 (257) |
| Final | 579,916 / 551,410 | 483,511 | 20,195 | 46,106 | 30,104 (147) |

(Columns 3-6 with pass. With the published dictionary the final set has
47,228 linker, contraction or hyphen readings and no other rule reading.)

- Of the final set's other rule readings, 7,218 follow a marker (*ang*,
  *ng*, *sa*, *si*, *mga*, *ay*, *na*, ...), 2,008 a pronoun and 2,206 a
  particle. In the sample 3 of 60 are wrong (*Namitas* → *bitas* for
  *pitas*, *Nanganganib* → *anib*, *mabibili* → *bibili*); in a sample of 60
  linker readings, 1 (*Punong* → *Puno*, a name, for *puno*). That puts the
  wrong first results at about 2,300 of the 579,916 found positions (0.4%).
- Of the 147 multiword rule readings, about 10 are wrong (*nangako si* →
  *ako si* 4, *paningin ko* and *kakatingin ko* → *sa tingin ko* 4,
  *pakialam mo* → *alam mo* 1); the rest are set phrases (*sinabi nila* →
  *sabi nila* 15, *nanggaling sa* → *galing sa* 12, *mag-alas dos* →
  *alas-dos* 12).
- Before the fixes of the history above, the largest wrong groups were
  *Talagang* → *Talag* (141), *Abenang* → *Abe* (86), *ka nang* → *ka- -an*
  (110), *naman ang* → *pang- -an* (58) and *paano ba* → *ano ba* (39);
  none of them is left.

**Real text** (`sources/measure.py text`): the two Gutenberg texts, 8,386
sentences and 161,937 positions, looked up the same way.

| Rule set | Found, pass / published | As written or form-of | Lemma a form-of row names | Linker, contraction or hyphen only | Other rule readings (multiword) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Own | 151,461 / 137,649 | 115,579 | 3,736 | 17,214 | 14,932 (58) |
| Yomitan | 143,358 / 135,598 | 122,095 | 60 | 12,657 | 8,546 (58) |
| Union | 152,506 / 137,804 | 115,204 | 3,729 | 17,248 | 16,325 (106) |
| Final | 151,524 / 137,662 | 115,327 | 3,731 | 17,305 | 15,161 (61) |

- In a random sample of 60 of the final set's other rule readings 7 are
  wrong, and none in a sample of 60 linker readings: about 1,800 wrong first
  results among 151,524 positions (1.2%). The largest groups are the name
  *Mameng* → *bang* (145, through mam- + *beng*, a spelling of *bang*),
  *babaing* → *baba* (82; the old spelling of *babaeng*), *paparonin* →
  *paparo*, *nálarawan* → *laraw* and *makahulugáng* → *hulog*.
- The old spelling is read through the processors: accents and the *ng̃*
  are removed; *c* and *qu* (Rizal's *Noli*, Gutenberg 20228) are not
  mapped to *k*.

**Real use** (`sources/measure.py sentences`): the 65 sentences of
`sources/sentences.tsv`, each word looked up from it to the end of its
sentence. With pass the expected entry is the first result for 53 and
comes right after the word's own entry for the other 12 (wty-tl-en defines
many aspect forms, such as *kumakain* "progressive aspect of kumain"); with
the published dictionary, 37 and 10, and nothing at all for 16 (*Nakarating*,
*katagal*, *Napakaganda*).

**Hachidori** (feat/multi-language 803f7b6 with this branch in
`third_party/hoshidicts`, `test/chrome-language-pack.mjs` with
`HACHIDORI_CASES=languages/tl/sources/chrome-cases.tsv`, Chrome 152,
wty-tl-en as published): 14 passed, 0 failed (adding Tagalog beside
Japanese, the import of 124,921 terms in 0.6 s, 10 cases such as
*Nagluluto* → *magluto* [progressive] and *Ako'y* → *ako* ['y], the Anki
note, and the switch to Japanese and back).

**Performance** (host load 41-60 on 64 cores, so upper bounds):

- native `benchmark-lookup --languages languages --language tl` with
  wty-tl-en on the 412 word positions of the 65 sentences, each from the
  word to the end of its sentence, 6 passes with the first dropped, three
  runs: p50 30.4-32.5 µs, p95 74.4-78.4 µs (budget 1 ms p50);
- Hachidori's WebAssembly (feat/multi-language 803f7b6 prebuilt engines,
  Node 22, `benchmark/node-lookup.mjs`, the 421 word positions that harness
  finds in the same sentences, 6 passes): `hdw_lookup` single-thread p50
  88.3 µs, p95 213.5 µs; threaded p50 96.8 µs, p95 230.5 µs;
- pack load (`sources/wasm-load.mjs`, 10 fresh engines): `hdw_language_load`
  median 14.9 ms single-thread and 16.0 ms threaded, live heap +1,261,896
  bytes; natively `LanguageRegistry::add` takes 3.8 ms (median of 50) and
  the registry holds 2,448,976 bytes. Budgets 50 ms and 20 MB;
- 188 `pattern` rules: they add 284,920 bytes of heap and 2.8 ms of load in
  WebAssembly (the same measurement without them).

**Commands.** From the repository root, with `build/` configured as
section 14 says and the inputs in a cache directory `$C`:

```sh
node languages/tl/sources/own-rules.mjs              # sources/own.json
node tools/port-yomitan-transforms.mjs $YOMITAN tl --force
node languages/tl/sources/map-yomitan.mjs $YOMITAN   # sources/yomitan.json
node languages/tl/sources/build-final.mjs            # transforms.json, tests/yomitan.tsv reasons
python3 languages/tl/sources/build-corpus.py $C/unimorph-tgl/tgl $C/kaikki.org-dictionary-Tagalog.jsonl
node tools/check-classes.mjs tl --write
build/hoshidicts-cli import $C/wty-tl-en.zip $C
g++ -O2 -std=c++23 -Iinclude languages/tl/sources/lookup-batch.cpp -o build/tl-lookup-batch \
  build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
  build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
  build/liblzokay.a build/libgumbo.a
for c in eval frequent tatoeba text traces sentences; do
  python3 languages/tl/sources/measure.py $c --cache $C --dictionary $C/wty-tl-en --show 100 --sample 60
done
node languages/tl/sources/check-removed.mjs
node languages/tl/sources/ablate.mjs
build/benchmark-lookup words.txt 6 --languages languages --language tl --term $C/wty-tl-en
node languages/tl/sources/wasm-load.mjs <hachidori checkout>
```

The labelled pass copy is wty-tl-en.zip with `n adj num v` written into the
`rules` column of every term row and the title changed, imported the same
way.

## Known gaps

- **The dictionary has no parts of speech.** Until the pack can say
  `"untaggedTerms": "pass"` (bee-san/hoshidicts#58), a rule whose output has
  conditions finds nothing in wty-tl-en: 28,506 Tatoeba positions find
  nothing that pass finds, 70 of the 10,000 frequent words find nothing,
  and the -um-, -in-, mag- and aspect readings this pack exists for reach a
  lemma only where a form-of row names it. The rules keep their conditions,
  as section 14 asks.
- Names and loanwords the dictionary lacks are read as inflected words:
  *Mameng* → *bang* (145 Gutenberg positions), *Narita* → *dita*, *parking*
  → *park*; a capitalised word with the linker can reach a name before the
  common word (*Punong* → *Puno* before *puno*, *Habang* → *Haba* before
  *habang*), because the text as written has fewer processor steps.
- A prefix reading can be shorter than the linker's: *nakakatuwang* →
  *tuwang* (one step) before *tuwa* (two), *pagkakasalang* → *salang*
  before *sala*.
- Merged consonants are ambiguous: *paminsan* → *pinsan* (43 Tatoeba
  positions; *paminsan-minsan* is no headword), *namitas* → *bitas* for
  *pitas*.
- Old spellings: *babaing* (*babaeng*) → *baba* (82 Gutenberg positions);
  *c* and *qu* are not read as *k*.
- The -in infinitive is not rebuilt from the contemplative of vowel-initial
  roots or reduplicated prefixes where the dictionary has no form-of row,
  and 50 sampled forms are in `gaps.tsv`: irregular and archaic forms
  (*diringinggin*, *nanganga-ilangan*), typos of the source (*bumibista*,
  *mapupunitpu*), and stems the rules leave out (*tinadtad* → *tatad*,
  whose root has a d → r only in some forms).
- Ties between readings of the same length are left in discovery order:
  *maghapunan* gives *hapunan* before *hapon*, but *magsimula* and
  *nagsisipilyo* also show *mula* and *pilyo* after the right root.
- Trace names: Yomitan's `rep1` rules reach the root of a reduplicated form
  in one step and name no aspect (trace quality 89.4% against 92.8% for the
  own rules alone).
- Baybayin text is looked up through the dictionary's Baybayin rows only;
  no rule deinflects it.
