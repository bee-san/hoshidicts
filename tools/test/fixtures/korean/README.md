# A Korean pack for comparing processors with Yomitan's hangul-js

`tools/test/yomitan-libs.test.mjs` runs `tools/check-yomitan.mjs` on this
languages directory with a Yomitan checkout whose `ext/lib/hangul-js.js`
`tools/yomitan-libs/build.mjs` has built (section 8.2 of
`docs/languages.md`).

- `ko/language.json` has Yomitan's two Korean processor ids:
  `disassembleHangul` (builtin `hangul.disassemble`) and `reassembleHangul`
  (builtin `hangul.assemble`), both with `keepInput: false`. It has no
  transforms, so only the processors are compared.
- `ko/tests/text.tsv` holds the inputs: every initial, medial and final,
  every compatibility jamo, some conjoining jamo, jamo sequences, words and
  mixed text. The variant column is Yomitan's `disassembleHangul` output,
  computed with that bundle.
