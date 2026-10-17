# Japanese conjugation parity

The fixture is the complete Japanese conjugation test corpus from
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

Run the standalone test without building importer dependencies:

```sh
git submodule update --init external/utfcpp
g++ -std=c++23 -Wall -Wextra -O2 -Iinclude -Iexternal/utfcpp/source \
  tests/deinflector_test.cpp src/deinflector.cpp -o /tmp/deinflector-test
/tmp/deinflector-test tests/fixtures/yomitan-deinflections.tsv
```

With all submodules initialized, the same test is available through CMake:

```sh
cmake -S . -B build -DHOSHIDICTS_DEINFLECTOR_TESTS=ON
cmake --build build --target deinflector-test
ctest --test-dir build -R '^deinflector$' --output-on-failure
```

To regenerate the fixture, check out the pinned Yomitan revision and run:

```sh
node tests/generate_deinflection_fixture.mjs /path/to/yomitan
```

Hoshidicts returns trace steps in the order they are applied (inflected form
back to dictionary form), so the test reverses Yomitan's forward-order reasons.
Existing Hoshidicts auxiliary rules are retained. This is Japanese conjugation
parity at the pinned revision, not a promise to mirror every future Yomitan change.
