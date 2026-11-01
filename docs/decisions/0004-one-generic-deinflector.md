# 0004: One data-driven deinflector, Japanese included

Status: proposed (multi-language design, Phase 1)

## Context

The task allows keeping Japanese in C++ beside a generic deinflector if
measurements justify it. The Japanese deinflector is a reversed-suffix trie of
literal rules with condition flags and a whole-word flag. That is exactly the
`suffix` and `wholeWord` subset of the generic format.

## Decision

Japanese becomes the `ja` pack, generated from today's rules in insertion
order, and runs on the same generic engine as every other language. The
current C++ is kept only as a test oracle (`tests/reference/`) that must
produce identical output on Yomitan's 1,446-case corpus, every prefix of it
and 100,000 generated strings.

## Options rejected

- **Keep Japanese in C++ and add a generic engine beside it.** Two
  deinflectors to maintain, and the generic one would never be exercised by
  the language with the most users and the largest test corpus. It would only
  be justified by a measured slowdown; the generic engine walks the same trie
  with the same rule order, so none is expected, and section 13 of
  `languages.md` makes it a merge condition.

## Consequences

- The framework pull request proves the generic engine with the strongest
  corpus available.
- Japanese rules become editable as data, with the same review as any pack.
