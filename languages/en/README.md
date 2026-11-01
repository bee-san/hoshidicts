# English (prototype pack)

A prototype pack that proves the language framework end to end for
Hachidori's prototype. It lives on the `prototype/en-ar` branch only and is
never merged: the real English pack is written later, from scratch, by its
own language agent.

## Sources and licences

- `sources/yomitan.json` and every transform with `"source": "yomitan"` in
  `transforms.json`: ported from
  [Yomitan](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language/en/english-transforms.js)
  at d3c54c1 by `tools/port-yomitan-transforms.mjs`, with its 39 `todo`
  rules mapped by `sources/map-yomitan.mjs`. GPL-3.0-or-later, Copyright (C)
  2024-2026 Yomitan Authors.
- `tests/yomitan.tsv`: Yomitan's
  [English transform tests](https://github.com/yomidevs/yomitan/blob/d3c54c10264673eca0d66b970ef74cd5c8b048e3/test/language/english-transforms.test.js),
  converted by `tools/port-yomitan-tests.mjs`. GPL-3.0-or-later, Copyright
  (C) 2023-2026 Yomitan Authors, 2020-2022 Yomichan Authors.
- `tests/corpus.tsv` and the UniMorph rows of `tests/gaps.tsv`: 2,000 pairs
  sampled with seed 1 by `sources/build-corpus.mjs` from
  [UniMorph eng](https://github.com/unimorph/eng/blob/66e0e9e8e2dcd196da081a25a48e5c1fe3d8b49b/eng)
  at 66e0e9e (file `eng`, sha256 `20a191ce…5c67`), CC BY-SA 3.0, by the
  UniMorph contributors: 500 `N;PL`, 300 each of `V;PST`, `V;V.PTCP;PST`,
  `V;V.PTCP;PRS` and `V;PRS;3;SG`, 150 each of `ADJ;CMPR` and `ADJ;SPRL`,
  leaving out rows whose form is a Wiktionary table word (`countable`,
  `uncountable`, ...) or equals the lemma. Rows the final rules reach are
  in `corpus.tsv`, the others in `gaps.tsv`.
- `sources/own.json` (built by `sources/build.mjs` from
  `sources/irregular-verbs.tsv` and `sources/own-rules.tsv`),
  `tests/cases.tsv`, `tests/text.tsv`, `tests/lookup.tsv`, the hand-written
  rows of `tests/gaps.tsv` and `tests/dictionary/`: written for this pack,
  no third-party data.
- `host.recommendedDictionaries`: Wiktionary English-English from
  [wiktionary-to-yomitan](https://yomidevs.github.io/wiktionary-to-yomitan/download/)
  (formerly kaikki-to-yomitan), CC BY-SA 4.0 (Wiktionary content through
  kaikki.org).

## Rule provenance

- Yomitan (`source: "yomitan"`): 17 transforms, 137 rules: 98 literal
  suffix and prefix rules ported as they are, 38 phrasal-verb rules mapped
  to `phrasal` (one per suffix rule of `past`, `ing` and
  `3rd pers. sing. pres`, followed by Yomitan's 78 particles and
  prepositions) and the interposed-object rule mapped to one
  `interposedObject` (Yomitan's 57 particles, the 78 words as guard words).
  None is left out.
- Own (`source: "own"`): 11 transforms, 269 rules that Yomitan lacks:
  irregular past and past participle forms of 133 verbs (wholeWord; forms
  equal to the base or already reached by Yomitan's rules are left out),
  irregular and classical plurals (`men`, `children`, `feet`, `mice`,
  `-i` → `-us`, `-ices` → `-ex`/`-ix`, `-ses` → `-sis`, ...), irregular
  comparison (`better`, `worst`, ...), `am`/`are`/`is`/`has`, `-ier`/`-iest`
  → `-ey`, and Yomitan's apostrophe rules with the typographic apostrophe
  U+2019 (`mother’s`, `adorn’d`, `runnin’`).
- No rule is `both`: the own rules only add what Yomitan lacks.

## Measurements

Provisional, until the engine's `hoshidicts-cli` is built: measured with
the JavaScript model of the pack deinflector in `tools/test/stub/`.

| Rule set | UniMorph sample (2,000 rows) | cases.tsv positives | cases.tsv negatives | yomitan.tsv |
| --- | ---: | ---: | ---: | ---: |
| Yomitan only (`sources/yomitan.json`) | 1,963 / 2,000 (98.2%) | 9 / 30 | 9 / 9 | 107 / 107 |
| Final (`transforms.json`) | 1,970 / 2,000 (98.5%) | 30 / 30 | 9 / 9 | 107 / 107 |

The UniMorph sample is mostly regular forms, so the own rules add 7 rows
there; `cases.tsv` shows what they add for common words (irregular verbs
and plurals, the typographic apostrophe).

`tools/check-yomitan.mjs`: 4,352 inputs, 17,490 Yomitan results; every
difference is the one listed in `sources/yomitan-differences.tsv`
(Yomitan matches a particle as a prefix of the next word), and the two
processors agree on 140 inputs each.

## Known gaps

- Prefixed irregular verbs that UniMorph lists as lemmas (`outspun` →
  `outspin`, `unstole` → `unsteal`): the irregular forms are whole words.
- Irregular verbs in phrasal verbs (`gave up` → `give up`): `phrasal`
  rules are built from suffix rules only.
- Yomitan's rules have no minimum stem, so short words give stems such as
  `bu` (from `bus`) or `s` (from `sing`); the dictionary query and the
  part-of-speech filter remove them.
- UniMorph's own errors (`better` listed as the comparative of `matching`).
