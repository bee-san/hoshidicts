# Form-of options in the conformance test

A fixture for the conformance test (docs/languages.md, sections 4.4, 9.6,
9.10 and 12.1). The pack follows form-of references with every option set:
`formOfIgnore: ["eumhun"]`, a `formOfNormalizer` (NFD, a `strip` of the
falling accents, a `pattern` that removes the other marks after a vowel or
`r`, NFC), `confirmedOrder: "references"` and `ownEntry: "afterReferences"`,
and its readings are `none`. It has no transforms.

- `tests/classes.json` records the normalizer as other step lists are
  recorded: its `strip` class under `fields`
  (`lookup.formOfNormalizer[1].strip`) and its `pattern` step under `steps`.
- `tests/lookup.tsv` checks the options in a lookup against
  `tests/dictionary/`: *davati*, whose row names *dȁti*, finds *dati*; *dvije*
  names *dvȃ*, whose only row is a reference, so nothing; *줄 수 있어* gives 줄
  because 줄 수's row carries `eumhun`; *געווען* gives *זײַן* before its own
  entry; *sibi* gives *sui* (read *suī*) before *sibus*, whose reading is
  empty, because readings are not `required`.

`language-form-of-options` runs the test on the pack, which conforms. The
`language-form-of-*` tests run it on copies with one edit each, which must
fail for exactly that reason: a `builtin` or an `alternatives` step in the
normalizer, a changed `strip` class that `tests/classes.json` no longer
matches, a `formOfIgnore` that is not an array, `formOf: "asTerm"` with
`formOfIgnore` set, and values of `confirmedOrder` and `ownEntry` that do not
exist.

## Sources and licences

Hand-written for the test. The rows imitate kty-ko-en, wty-sh-en, wty-la-en
and wty-yi-en rows; their glosses are short stand-ins.

## Rule provenance

No transforms.

## Measurements

None: this is a test fixture.

## Known gaps

None.
