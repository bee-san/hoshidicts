# 0007: Scan start, lookup resolution and segmentation are three settings

Status: proposed (multi-language design, Phase 1, revision 2)

## Context

Revision 1 tied three things to one field, `segmentation`: whether a host
starts a scan at the hovered character or at the start of the hovered word,
whether the engine looks up every prefix or only prefixes that end at a word
boundary, and how word highlighting splits running text. Korean is written
with spaces, but Yomitan's Korean rules contain no particle rules: a noun with
a particle (학교에서) is reached only by trying shorter prefixes (학교). German
compounds missing from a dictionary are found the same way.

## Decision

Packs set `text.scanStart` (`cursor` or `word`, Yomitan's `scanning.scanResolution`), `lookup.searchResolution`
(`character` or `word`, Yomitan's `translation.searchResolution`) and `text.segmentation` (`scan` or `spaces`, for
highlighting and line joining only) independently. Section 14.1 of
`languages.md` recommends values per language: Korean and German use
`cursor` and `character` with `spaces`; English, Spanish and Arabic use `word`,
`word` and `spaces`; Japanese and Chinese use `cursor`, `character` and `scan`.

## Options rejected

- **One field.** Breaks Korean noun lookups and German compound parts, as
  above.
- **Copy Yomitan's per-profile user settings instead of pack values.** Yomitan
  defaults to character resolution for every language and leaves word
  resolution to the user. Pack values give each language a good default; a
  host can still offer an override later.

## Consequences

- Under word resolution the engine grows the scan window to the end of the
  word it ends in, so words longer than the scan length are still found.
- Pack authors choose three values; the template and the starting-points table
  make the choice explicit.
