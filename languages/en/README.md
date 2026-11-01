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

`ctest -R language` (hachi-lang-engine's `language-conformance-test`,
feat/multi-language 250675e before it was pushed): conforms. corpus.tsv
1,970 / 1,970, cases.tsv 39 / 39, yomitan.tsv 107 / 107, text.tsv 11 / 11,
lookup.tsv 13 / 13, gaps.tsv 0 / 32 (reported); classes.json agrees with the
engine (2 classes, 2 fields, 2 steps, 4,304 outputs); 111 of the 406 rules
are exercised by a passing row.

`hoshidicts-cli eval-language` from feat/multi-language at 1faeed5 (GCC
14.3, Release), with `--dictionary` Wiktionary English-English
(wiktionary-to-yomitan 2026.10.22, `wty-en-en.zip`, sha256
`0e62d0d3…436f`, CC BY-SA 4.0). The sample is the 2,000 UniMorph rows of
`corpus.tsv` and `gaps.tsv` together.

| Rule set | Sample recall | False candidates per row | First rank | cases.tsv positives | cases.tsv negatives | yomitan.tsv |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Own (`sources/own.json`) | 0.35% (7) | 0.046 | 0.05% | 19 / 29 | 10 / 10 | 0 / 105, negatives 2 / 2 |
| Yomitan (`sources/yomitan.json`) | 98.15% (1,963) | 0.286 | 0.30% | 8 / 29 | 10 / 10 | 105 / 105, negatives 2 / 2 |
| Final (`transforms.json`) | 98.5% (1,970) | 0.312 | 0.35% | 29 / 29 | 10 / 10 | 105 / 105, negatives 2 / 2 |

- The sample is mostly regular forms, so the own rules add 7 rows there;
  `cases.tsv` shows what they add for common words.
- First rank is low because the dictionary lists inflected forms as
  headwords of their own (`went`, `children`, `running`, with "form of"
  glosses), so a lookup of the form ranks that entry, found without
  deinflection, before the lemma.
- `--per-rule` on the final set: 43 of the 406 rules recover sampled rows;
  9 recover none and add false candidates (330 in all; `-y`, `un-`, one
  plural rule and five irregular forms); no rule breaks a negative. All
  are kept: the prototype keeps Yomitan's rules as they are, and the own
  irregular forms are exercised by `cases.tsv`.
- `tools/check-yomitan.mjs` against the same CLI: 8,568 inputs, 30,872
  Yomitan results, 1,053 differences, every one explained by
  `sources/yomitan-differences.tsv` (Yomitan matches phrasal and
  interposed-object particles as prefixes of the next word); the two processors agree with Yomitan's on 2,184 inputs
  each.
- `tests/lookup.tsv` (13 rows) passes against `tests/dictionary/` imported
  by `hoshidicts-cli import` and looked up with `hoshidicts-cli lookup`.
- Lookup speed is not measured: `benchmark-lookup` has no language option
  at 1faeed5.

## Known gaps

- Prefixed irregular verbs that UniMorph lists as lemmas (`outspun` →
  `outspin`, `unstole` → `unsteal`): the irregular forms are whole words.
- Irregular verbs in phrasal verbs (`gave up` → `give up`): `phrasal`
  rules are built from suffix rules only.
- Yomitan's rules have no minimum stem, so short words give stems such as
  `bu` (from `bus`) or `s` (from `sing`); the dictionary query and the
  part-of-speech filter remove them.
- UniMorph's own errors (`better` listed as the comparative of `matching`).
