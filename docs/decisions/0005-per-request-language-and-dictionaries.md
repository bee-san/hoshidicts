# 0005: The language and the dictionaries are chosen per request

Status: accepted (multi-language design, Phase 1, revision 9)

## Context

Hachidori profiles each hold their own dictionaries and order, and may switch
automatically with a page element's `lang`. A page can mix languages, and
Firefox runs the engine single-threaded on IndexedDB, where reloading a large
library takes seconds.

## Decision

`LookupOptions` carries `language` (default `ja`) and an optional ordered
`dictionaries` list. One engine holds every dictionary any profile enables;
each request names the profile's language and dictionaries, and is ranked by
that list. Requests without the new fields behave exactly as today.

## Options rejected

- **One language per engine, set when the dictionary set is applied.**
  Simpler, but switching profiles reloads dictionaries (100-300 ms in Chrome,
  seconds on Firefox), and automatic switching by element language would
  reload on every hover across languages.
- **Load each profile's dictionaries only when that profile is first used.**
  Saves memory for users who rarely use a second language, but the first
  lookup in that language would wait for a load and fail with "dictionary
  update in progress" while it runs. Can be added later behind the same API
  if memory measurements ask for it.

## Consequences

- Memory is the sum of the dictionaries enabled in any profile: what the same
  dictionaries cost today when all are enabled in one list. Hachidori's paged
  storage modes keep the resident share small.
- The engine stays unaware of profiles and of which language a dictionary is
  for.
