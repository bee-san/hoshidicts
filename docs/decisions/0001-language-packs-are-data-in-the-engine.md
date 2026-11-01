# 0001: A language is one data directory in the engine repository

Status: proposed (multi-language design, Phase 1)

## Context

Hachidori is gaining per-language profiles. The owner asked for the language
system to live in hoshidicts, for one agent (or contributor) per language, and
for packs that never conflict with each other. A language touches three
layers: lookup (preprocessing, deinflection, scanning), presentation (readings,
character view, direction, fonts) and host features (speech, Anki, recommended
dictionaries, samples).

## Decision

Everything about a language lives in `languages/<code>/` in hoshidicts:
`language.json` (identity, text, lookup, capabilities, presentation,
settings, host data), optional `transforms.json`, tests and a README. The
engine reads the lookup parts and checks the rest only for shape. Packs are
discovered by directory; nothing lists them.

## Options rejected

- **Engine data in hoshidicts, host data in Hachidori
  (`extension/languages/<code>/`).** Each language would need two pull
  requests in two repositories that must agree, and the language agents work
  only in hoshidicts. Splitting saves the engine nothing: it ignores host
  blocks.
- **A shared registry file listing languages.** Every new language would edit
  it, so parallel pull requests would conflict.
- **One file per language.** Rules, tests and provenance notes are large and
  change at different rates; one directory keeps them together while keeping
  each file reviewable.

## Consequences

- One pull request describes a language completely.
- hoshidicts carries data that only hosts use (labels, samples, links). It is
  small and plain JSON; another host can ignore it.
- Hachidori ships a generated copy of the packs and regenerates it when it
  bumps the submodule.
