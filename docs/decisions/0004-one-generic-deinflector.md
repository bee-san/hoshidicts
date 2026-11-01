# 0004: One data-driven deinflector, Japanese included, proved against today's code

Status: proposed (multi-language design, Phase 1, revision 2)

## Context

The task allows keeping Japanese in C++ beside a generic deinflector if
measurements justify it. The Japanese deinflector is a reversed-suffix trie of
literal rules with condition flags and a whole-word flag: exactly the
`suffix` and `wholeWord` subset of the generic format.

## Decision

Japanese becomes the `ja` pack, generated from today's rules in insertion
order, and runs on the same generic engine as every other language. Today's
deinflector, text processor and `Lookup` are kept, unmodified apart from
renamed classes, in `tests/reference/` as oracles: the new code must give
identical deinflections, processor variants and whole lookup results on
Yomitan's 1,446-case corpus, every prefix of it, deep chains and 100,000
generated strings, with every lookup option on and off.

Where Japanese behaviour differs from Yomitan's for every language, the
difference becomes a pack field with Japanese keeping today's value:
`traceSelection: "first"` (a term keeps the first trace that reached it;
Yomitan and other packs keep the shortest). The engine imposes no depth limit
on traces, as today.

## Options rejected

- **Keep Japanese in C++ and add a generic engine beside it.** Two
  deinflectors to maintain, and the generic one would never be exercised by
  the language with the most users and the largest test corpus. It would only
  be justified by a measured slowdown; the generic engine walks the same trie
  in the same order, so none is expected, and the performance budget makes it
  a merge condition.
- **Prove parity only at `deinflect()`.** The lookup around it changes too
  (pack selection, the part-of-speech filter through pack conditions, variant
  passes, dictionary selection), and Hachidori's suites check reply shapes and
  chosen fields, not every byte of every reply.
- **A 32-step trace limit for every pack.** Today's deinflector has none; deep
  chains such as 食べ + させ × 40 + る would change.

## Consequences

- The framework pull request proves the generic engine with the strongest
  corpus available, at the level users see.
- Japanese rules become editable as data, with the same review as any pack.
