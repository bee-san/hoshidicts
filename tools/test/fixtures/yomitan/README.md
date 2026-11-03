# A miniature Yomitan checkout for the tool tests

`tools/test/` runs the port and differential tools against this tree, laid out
like a Yomitan checkout, so the tests need no real checkout.

- `ext/js/language/language-transformer.js`, `language-transforms.js` and
  `text-processors.js` are copied unchanged from
  [Yomitan d3c54c1](https://github.com/yomidevs/yomitan/tree/d3c54c10264673eca0d66b970ef74cd5c8b048e3/ext/js/language),
  GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan Authors.
- `ext/js/core/log.js` stands in for Yomitan's logger.
- `ext/js/language/xx/` is a made-up language with one rule of every shape the
  port tool classifies (section 8.1 of `docs/languages.md`), including a
  misleading `type`, a `g` flag, an `i` flag and an empty affix;
  `language-descriptors.js` gives it processors, and `kx/` imports
  `ext/lib/hangul-js.js`, which is missing as in an unbuilt checkout.
- `test/language/xx-transforms.test.js` has Yomitan's test layout.
