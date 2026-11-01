# 0006: Character classes use one syntax for C++ and JavaScript, without script properties

Status: proposed (multi-language design, Phase 1, revision 5)

## Context

A pack's character classes are read twice: by the engine (word boundaries,
segmentation, stem constraints) and by hosts in JavaScript (the scanning gate,
word starts, debug-log redaction). Yomitan writes them as JavaScript regular
expressions, often with `\p{Script=...}`.

## Decision

Classes are single bracket expressions with literals, code point escapes,
ranges, general categories (`\p{L}`, `\p{M}`, ...) and references to other
classes of the same pack. The engine parses them itself and answers general
categories from utf8proc, which it already links. The conformance test checks
that both implementations accept the same code points.

## Options rejected

- **Allow script properties.** The engine would need ICU or a generated
  script table (about 100 KB) for something packs can write as ranges.
- **Separate classes for the engine and for hosts.** Two definitions of one
  thing drift apart; a word boundary would differ between the popup and the
  lookup.

## Consequences

- Packs list ranges, as `content-scan.js` already does for Japanese.
- A class means the same thing everywhere it is used.
