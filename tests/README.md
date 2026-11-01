# Japanese conjugation parity

The fixture, `languages/ja/tests/yomitan.tsv` (moved there from
`tests/fixtures/` with the Japanese language pack), is the complete Japanese
conjugation test corpus from
[Yomitan e7334a9](https://github.com/yomidevs/yomitan/blob/e7334a96106a6c74e6fa75bd33a5ea1219d92712/test/language/japanese-transforms.test.js):
1,446 positive and negative cases with expected dictionary forms, condition
types, and conjugation chains. It includes historical kana (PRs #2474 and
#2501), honorific forms, emphatic negatives, and invalid causative/passive chains.
Four additional checks cover whole-word honorifics and their inflected forms.
Twelve more cover NekoPara's cat speech (`deinflect_neko_speech`, not part of
Yomitan): six forms covering its five readings of `にゃ`; four checks that every
such result is marked `neko speech` and that `deinflect` returns none; one that
each `にゃ` is read on its own (`にゃにゃ`); and one that text without a hiragana
`にゃ` (`カゃ` shares its last four bytes) gets none.
The fixture retains Yomitan's GPL-3.0-or-later attribution.

The deinflector reads its rules from the Japanese language pack
(`languages/ja/`, built into the library), so the test links the library.
With all submodules initialized:

```sh
cmake -S . -B build -DHOSHIDICTS_DEINFLECTOR_TESTS=ON
cmake --build build --target deinflector-test
ctest --test-dir build -R '^deinflector$' --output-on-failure
```

The same corpus is also checked through the pack by the language
conformance test (`ctest -R language`) and, against the 35e2dab code kept in
`tests/reference/`, by `ja-deinflect-parity`.

To regenerate the fixture, check out the pinned Yomitan revision and run:

```sh
node tests/generate_deinflection_fixture.mjs /path/to/yomitan
```

Hoshidicts returns trace steps in the order they are applied (inflected form
back to dictionary form), so the test reverses Yomitan's forward-order reasons.
Existing Hoshidicts auxiliary rules are retained. This is Japanese conjugation
parity at the pinned revision, not a promise to mirror every future Yomitan change.
