# Language tools

Node 22 scripts for language packs ([`docs/languages.md`](../docs/languages.md)).
They have no npm dependencies, except `tools/yomitan-libs/`, which installs
esbuild 0.25.1 (MIT) and hangul-js 0.2.6 (MIT) to build one Yomitan bundle;
neither is part of the library. Yomitan is read from a checkout at
[d3c54c1](https://github.com/yomidevs/yomitan/tree/d3c54c10264673eca0d66b970ef74cd5c8b048e3);
only `tools/yomitan-libs/build.mjs` writes into one, and only into a copy.

| Command | Contract | What it does |
| --- | --- | --- |
| `node tools/check-classes.mjs <code>... [--write]` | 5, 12.1 step 2 | Writes (`--write`) or checks `languages/<code>/tests/classes.json`: every class, every other class field and every `pattern` and `case` step on the pack's corpus strings, as Node computes them. `--all` runs every pack. |
| `node tools/port-yomitan-transforms.mjs <yomitan> <code>` | 8.1 | Writes `languages/<code>/sources/yomitan.json` from Yomitan's rules: literal suffix, prefix and whole-word rules are ported, every other rule becomes a `todo` to map by hand. An existing file is kept unless `--force`. |
| `node tools/port-yomitan-tests.mjs <yomitan> <code>` | 8.1, 12.2 | Writes `languages/<code>/tests/yomitan.tsv` from Yomitan's transform test. |
| `node tools/check-yomitan.mjs <yomitan> <code>...` | 8.2 | Compares `hoshidicts-cli` (default `build/hoshidicts-cli`; `--cli` or `HOSHIDICTS_CLI` to change it) with Yomitan's transformer and processors; `sources/yomitan-differences.tsv` lists the deliberate differences. `--all` runs every pack. Korean processors need the checkout's `ext/lib/hangul-js.js` (next row). |
| `npm ci --prefix tools/yomitan-libs --ignore-scripts=false`, then `node tools/yomitan-libs/build.mjs <yomitan copy>` | 8.2 | Writes `ext/lib/hangul-js.js` and its source map into a copy of a Yomitan checkout, byte for byte as Yomitan's `dev/build-libs.js` does (a result with other hashes is not written), with the esbuild and hangul-js of `tools/yomitan-libs/package-lock.json` (Yomitan's versions, and its hashes where it records them). It refuses any directory that is not the top of a git work tree at d3c54c1, an `ext` or `ext/lib` that is a symbolic link, and packages other than Yomitan's. CI runs it on its own checkout. |
| `node tools/merge-transforms.mjs <code>` | 14 step 5 | Writes the union of `languages/<code>/sources/own.json` and `sources/yomitan.json` to `transforms.json`, each rule marked `own`, `yomitan` or `both`. A `transforms.json` other than the template's is kept unless `--force`; `--out <file>` writes elsewhere. |

`tools/lib/classes.mjs` is the JavaScript side of the class syntax and the
pattern dialect; hosts import it to expand the patterns they copy:

```js
import {ClassSet} from './tools/lib/classes.mjs';

const classes = new ClassSet(descriptor.classes);  // parses, checks references and cycles
classes.source(descriptor.text.pattern);           // RegExp source for the `u` flag
classes.ranges('{letter}');                        // [[first, last], ...] without surrogates
classes.expandSteps(descriptor.presentation.displayTransforms.stripVowelMarks);
```

Tests: `node --test tools/test/` (or `node --test tools/test/*.test.mjs`).
They run against a miniature Yomitan tree in `tools/test/fixtures/yomitan/`
and a stand-in for `hoshidicts-cli` in `tools/test/stub/`, so they need
neither a Yomitan checkout nor a build. With `YOMITAN_DIR` set to a checkout
at d3c54c1 they also check the port against the contract's census of every
Yomitan language and `tools/yomitan-libs/package-lock.json` against Yomitan's
lockfile. When that checkout's `ext/lib/hangul-js.js` is built and
`hoshidicts-cli` is built, `yomitan-libs.test.mjs` also checks that the bundle
is the one Yomitan's own build writes and runs `check-yomitan.mjs` on the
Korean pack in `tools/test/fixtures/korean/`. CI sets `YOMITAN_DIR` to its
checkout. `ctest -R check-yomitan-cli` (a build with `HOSHIDICTS_TESTS` and
`HOSHIDICTS_CLI`, and Node on the `PATH`) runs `check-yomitan.mjs` on the same
fixtures with the real `hoshidicts-cli`.

`sources/yomitan-differences.tsv` has seven columns:

```text
# kind<TAB>id<TAB>side<TAB>input<TAB>text<TAB>conditions<TAB>reason
rule	*	yomitan	/ (?:up|on)[a-z]/	*	v_phr	Yomitan matches a particle as a prefix of the next word.
processor	addHamzaBottom	yomitan	*	*	*	Why the pack has no such processor.
```

`kind` is `rule` or `processor`; `id` a transform id the result's trace
contains, or a Yomitan processor id, or `*`; `side` is `yomitan` (a result
only Yomitan gives), `pack` (only the engine) or `*`; `input`, `text` and
`conditions` are exact values, `*`, or a `/regular expression/` (JavaScript,
`u` flag); conditions are names in declaration order joined by `|`, empty for
none. Every row needs a reason.
