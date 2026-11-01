# 0002: Packs load at run time from JSON

Status: proposed (multi-language design, Phase 1, revision 6)

## Context

Today the Japanese rules are C++ in `src/deinflector.cpp`, compiled into every
build, including Hachidori's three WebAssembly bundles (about 3 MB each,
committed to Hachidori). Twenty-five languages will land one at a time.

## Decision

The engine parses `language.json` and `transforms.json` when a host loads a
pack (`LanguageRegistry::add`, `add_directory`, `hdw_language_load`). The
rules are indexed into the same reversed-suffix trie the Japanese
deinflector uses today, so lookups cost what they cost now. Code-only
behaviour is limited to named builtins (section 6.3 of `languages.md`).

## Options rejected

- **Generate C++ from the JSON at build time.** Zero parse cost, but every
  language would need a WebAssembly rebuild and a new 9 MB of committed
  bundles in Hachidori, and Swift Package builds cannot run the generator.
- **Embed the JSON in the binary.** Same rebuild cost as above, and the host
  still needs its own copy of the descriptors for its user interface.
- **Run deinflection in JavaScript, as Yomitan does.** Loses the trie and the
  per-prefix deinflection inside `Lookup`, adds a second implementation for
  native hosts, and moves a hot path out of the engine.

## Consequences

- A data-only language reaches Hachidori users by a submodule bump and a
  copy of JSON files, without rebuilding the engine.
- Parsing costs a few milliseconds per pack when it is first loaded; the
  budget is 10 ms for Japanese in Chrome and is measured.
- Japanese is the exception: its pack is also embedded in the library as
  committed byte arrays, so existing hosts and C callers need no files and
  Japanese lookups never wait for a load. Changing Japanese rules therefore
  still needs a rebuild, as today.
