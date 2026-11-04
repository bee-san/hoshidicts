# The oracle: hoshidicts at 35e2dab, with a95758b

These files are today's Japanese pipeline at
[35e2dab](https://github.com/bee-san/hoshidicts/commit/35e2dab), with the one
change below applied, kept as a reference for the language framework
(`docs/languages.md`, section 11.3). The parity tests (`ja-deinflect-parity`,
`ja-process-parity`, `ja-lookup-parity`) compare the new engine with them and
require identical output.

| File | Copied from |
| --- | --- |
| `legacy_deinflector.cpp`, `deinflector.hpp` | `src/deinflector.cpp`, `include/hoshidicts/deinflector.hpp` |
| `legacy_text_processor.cpp`, `text_processor.hpp` | `src/text_processor/text_processor.cpp`, `src/text_processor/text_processor.hpp` |
| `legacy_kanji_variants.cpp` | `src/text_processor/kanji_variants.cpp` (the kanji-variant table) |
| `legacy_query.cpp`, `query.hpp`, `query_internal.hpp` | `src/query.cpp`, `include/hoshidicts/query.hpp`, `src/query_internal.hpp` |
| `legacy_lookup.cpp`, `lookup.hpp` | `src/lookup.cpp`, `include/hoshidicts/lookup.hpp` |

The only changes are the ones needed to compile them beside the new code:

- everything is placed in `namespace hoshidicts_legacy`;
- `#include` lines name the copies in this directory instead of the originals
  (`"deinflector.hpp"`, `"query.hpp"`, `"lookup.hpp"`, `"text_processor.hpp"`),
  and `query.hpp` names `"hoshidicts/importer.hpp"`;
- the forward declarations of types that shared code defines (`BlobPins`,
  `memory::page_cache`, zstd's `ZSTD_DDict_s`) are moved to the top of
  `query.hpp`, outside the namespace.

The oracle shares only code the framework leaves unchanged: `src/blob_file`,
`src/hash/`, `src/memory/`, `src/scan_index.hpp`, `src/path_utils.hpp`, the
glossary parser (`src/json/yomitan_parser`) and the importer's types. CMake
builds it as the static library `hoshidicts-legacy` with `HOSHIDICTS_TESTS`,
and links it only into tests and `tools/export-legacy-japanese.cpp`.

Never edit these files to follow a change in `src/`: they are what the new
code is measured against. The exception is a change to the Japanese pipeline
itself, made in `src/` and here alike. There is one:
[`a95758b`](https://github.com/bee-san/hoshidicts/commit/a95758b79c1fa7107f83abd6baafa97a8ef8bc80)
(bee-san/hachidori#658), which Hachidori pins, applied unchanged to
`legacy_lookup.cpp`, `legacy_query.cpp`, `query.hpp` and `lookup.hpp`. With
`metadata_only_terms` it returns every reading that only frequency and pitch
rows have, after the terms with glossaries that match as far, not only the
terms that match further than all of them.
