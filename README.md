# hoshidicts

[![Discord](https://img.shields.io/discord/754001738184392704?logo=discord&label=Discord)](https://discord.skerritt.blog)

This library implements a dictionary backend that works similarly to [Yomitan](https://github.com/yomidevs/yomitan). This was made for [Hoshi Reader](https://github.com/Manhhao/Hoshi-Reader). Each language is a data-only **language pack** in `languages/<code>/` (descriptor, deinflection rules, tests); Japanese is built in, and other packs load at run time. [`docs/languages.md`](docs/languages.md) is the contract for packs and the language API.

A MIT version of the library is available on the [main-mit](https://github.com/Manhhao/hoshidicts/tree/main-mit) branch.

## Reference

### importer
```cpp
ImportResult dictionary_importer::import(const std::string& source_path, const std::string& output_dir, bool low_ram = false)
```
Imports a Yomitan `.zip` dictionary file or an MDict `.mdx` dictionary into a custom format. The resulting folder is stored in `output_dir/<folder_name(dict_title)>`: the title itself when it is a single path component, otherwise the title with `/`, `\`, `:` and NUL replaced by `_` plus ` #` and the title's FNV-1a 32-bit hash in hex (`Nico/Pixiv` → `Nico_Pixiv #c747f3db`). `dictionary_importer::folder_name` returns it. Glossaries are compressed using zstd. Term, frequency and pitch dictionaries are generally supported, but only a small part of the pitch accent spec was implemented. Setting `low_ram` to `true` can reduce memory usage significantly at the cost of slightly lower import speed.

The format is detected from the file contents, not the extension.

A term bank row whose definitions hold form-of references (`[term, [rules]]`, as wiktionary-to-yomitan dictionaries write them) is flagged in its record; the references stay in the glossary. Packs whose `lookup.formOf` is `follow` read them through the flag (`docs/languages.md` 9.10), so a dictionary imported before the flag existed must be imported again for its references to be followed. A dictionary without such rows imports byte for byte as before.

#### MDX / MDD import

An `.mdx` file is imported directly, without an intermediate Yomitan archive: its entries are converted to Yomitan term banks of 10,000 rows as they are read, so memory use is bounded by the bank size, not the dictionary. The conversion follows [manabitan](https://github.com/ManabiIO/manabitan)'s MDX importer so the result renders the same way.

- Container: MDict engine versions 1.x and 2.0 (`GeneratedByEngineVersion`). Version 3 files are rejected with a clear error.
- Encodings: UTF-8 and UTF-16. `GBK`, `GB18030` and `Big5` dictionaries are rejected (`unsupported MDX encoding: <name>`).
- Compression: none, LZO1X and zlib, per block, with every block's Adler-32 verified. A record block that fails to decode loses its entries, not the dictionary; the import fails only when no entry is left (`MDX has no usable entries: N records could not be read (…)`).
- Encryption: `Encrypted="2"` (ciphered key index) is supported. `Encrypted="1"` (registration-protected record blocks) needs a user key and is rejected.
- Resource files: `X.mdd`, `X.1.mdd`, `X.2.mdd`, ... next to `X.mdx` are read automatically (file name case does not matter); a missing MDD is not an error. Only assets the glossaries or stylesheets refer to are imported, under `mdict-media/<path>`; every `*.css` in the MDD plus inline `<style>` blocks become the dictionary's stylesheet. Keys containing `..`, a drive letter or NUL are dropped. An asset or stylesheet in a block that fails to decode is left out without failing the import.
- MDD stylesheets: decoded by their BOM, else by a leading `@charset "…";`, else as UTF-8, else as UTF-16 without a BOM, else as Shift_JIS, and their `@charset` rule is removed. A declared charset may be UTF-8, Shift_JIS, EUC-JP, GBK/GB18030, Big5, EUC-KR or windows-1252 under any of its [WHATWG labels](https://encoding.spec.whatwg.org/#names-and-labels); the legacy ones are decoded with `iconv(3)`, which the CMake build uses when `find_package(Iconv)` finds it. A sheet that does not decode cleanly, or declares any other charset, is left out of the stylesheet; it never fails the import.
- Entries: `@@@LINK=target` redirects become extra headwords of the entry they reach, through chains of redirects of any length; every alias keeps its own spelling. A target matches the key spelled exactly. A target that no key spells exactly matches the keys that equal it under the header's `KeyCaseSensitive` and `StripKey` rules (absent, `No` and `Yes` as in MDict): letter case is ignored, and StripKey removes `( ) . , - & 、 ' / \ @ _ $ !` and spaces. A redirect whose target is missing, or that only reaches other redirects, is dropped. Duplicate headwords stay separate entries. `Format="Text"` definitions become plain string glossaries; HTML definitions become structured content.
- HTML fidelity: the MDX `StyleSheet` backtick markup is expanded; `b/i/em/strong/u/s/sub/sup/h1-6/p/pre/font/...` map to styled `span`/`div`; `<font size>` becomes a CSS keyword (`x-small` … `xxx-large`) by the HTML legacy font-size rules, and an inline `style` wins over `size`, `color` and `face`; inline `style` keeps the properties Yomitan's structured content supports; `entry://`, `bword://`, `d:`, `x:` links search the term; `sound://` links are disabled (rendered as `#`) and their files are not imported; `javascript:` and friends are neutralised; `<script>` is dropped; unsupported elements keep their text; nesting deeper than 20 is flattened. CSS from the MDD is passed through as the dictionary stylesheet, so selectors that depend on tags Yomitan does not render (`<b>`, `<p>`, ...) will not match.
- What an import left out is counted on `ImportResult::warnings`, as manabitan's MDict conversion notes count it: `skippedRecords` (records in blocks that failed to decode), `unresolvedRedirects` (aliases that reach no entry), `missingResources` (distinct referenced paths no MDD provides) and `unreadableResources` (distinct MDD resources in blocks that failed to decode). A Yomitan archive's counts are zero. They describe the import run and are not written to `index.json`.
- The key index of the MDX (and of each MDD) is held in memory during the import; records are streamed block by block.

```
hoshidicts-cli import path/to/dictionary.mdx
```

### query
```cpp
bool DictionaryQuery::add_term_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped, DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped)
```
Adds an imported term dictionary to the query.

```cpp
bool DictionaryQuery::add_freq_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped, DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped)
```
Adds an imported frequency dictionary to the query.

```cpp
bool DictionaryQuery::add_pitch_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped, DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped)
```
Adds an imported pitch dictionary to the query.

A dictionary added as several kinds (term, frequency, pitch, kanji) is opened once: the later kinds share the files the first one opened, whatever storage modes they ask for, and `remove_dict` releases them with the last kind. A path's files must not change while any kind of it is loaded. Remove all its kinds before changing either mode. `hash_index_paged(path)` reports its actual hash mode; `last_error()` describes a failed add.

`storage` decides how the dictionary's entries are held. `index_storage` independently decides how `hash.table` is held. Bloom filters, media offsets, scan metadata and the trained zstd dictionary remain memory-mapped.

- `DictionaryStorage::Mapped` maps `blobs.bin`, which holds the entries, and `media.bin`. Natively a mapping costs nothing until it is read. Under Emscripten `mmap` copies the whole file into linear memory, so there `media.bin` is not mapped but read from the file when a media file is asked for.
- `DictionaryStorage::Paged` reads `blobs.bin` on demand through a page cache that the query's paged dictionaries share, and reads `media.bin` on demand. Lookups return the same results; one that needs pages the cache does not hold costs a read per page. `DictionaryQuery(PageCacheOptions{...})` sets the page size (default 4 KiB) and the cache budget (default 32 MiB); pages a running query holds stay valid until it returns, so the cache can exceed its budget until then. `page_cache_bytes()` returns what it holds.

- `DictionaryIndexStorage::Mapped` keeps the complete hash table mapped, preserving the default for existing callers.
- `DictionaryIndexStorage::Paged` reads hash slots through that same cache, after the resident Bloom filter has accepted the key. Slots are copied safely across page boundaries and pages are released after each probe. The existing file format is unchanged; entries and hashes compete for one cache budget. `page_cache_statistics()` splits cache bytes, hits, page reads and bytes read into `entries` and `indexes`.

```cpp
std::vector<TermResult> DictionaryQuery::query(const std::string& expression) const
```
Queries all added dictionaries for the given expression. TermResult includes glossary, frequency and pitch data in the order dictionaries were added. Within each dictionary, glossaries are ordered by their term-bank score, highest first, with original order kept for equal scores. Glossaries are decompressed.

```cpp
std::vector<DictionaryStyle> DictionaryQuery::get_styles() const
```
Returns CSS styles for all dictionaries, if present.

```cpp
std::vector<DictionaryTags> DictionaryQuery::get_tags() const
```
Returns the tag-bank rows (`name`, `category`, `order`, `notes`, `score`) of each term dictionary that has any, in bank order. A name is kept as the bank spells it, as a glossary's `definition_tags` is, so it matches the names a glossary uses. Dictionaries imported before tag banks were stored have none until they are imported again.

```cpp
std::vector<char> DictionaryQuery::get_media_file(const std::string& dict_name, const std::string& media_path) const
```
Returns raw bytes for file originally stored at `media_path` in term dictionary `dict_name` or an empty vector if the file does not exist.

```cpp
size_t DictionaryQuery::read_media_file(const std::string& dict_name, const std::string& media_path,
                                        std::vector<uint8_t>& out, size_t max_bytes = SIZE_MAX) const
```
Returns the stored size of the media file (0 when there is none) and copies it into `out` when it is at most `max_bytes` long, so a caller can refuse a large file without reading it. `get_media_file_view` returns a view into the mapping instead, and an empty one where media is read on demand.

### languages
```cpp
hoshidicts::LanguageRegistry registry = hoshidicts::LanguageRegistry::with_builtin();  // Japanese
bool LanguageRegistry::add(std::string_view language_json, std::string_view transforms_json, std::string* error)
bool LanguageRegistry::add_directory(const std::string& languages_dir, std::string* error)
```
A registry holds the language packs a host has loaded. `with_builtin()` starts with the Japanese pack, which is compiled into the library (`src/languages/builtin_packs.cpp`, written by `tools/embed-packs.py` from `languages/ja/`). `add` parses one pack from its `language.json` and `transforms.json`, replacing a pack with the same code; `add_directory` loads every `<dir>/<code>/language.json` whose directory name does not start with `_`. Errors name the pack, the file, the JSON path and the reason. `find(code)` and `codes()` list what is loaded. A pack is the generic, data-driven pipeline of `docs/languages.md`: character classes, text processors, rule types from suffixes to anchored patterns, and the dictionary-form conditions its part-of-speech filter uses.

### deinflector
```cpp
std::vector<DeinflectionResult> Deinflector::deinflect(const std::string& text) const
```
Deinflects a string with a pack's rules: `Deinflector()` uses the built-in Japanese pack (Yomitan's Japanese rules and hoshidicts' own auxiliaries, `languages/ja/transforms.json`), `Deinflector(pack)` any other. As this doesn't use any dictionary data, the result may include invalid deinflections. Each trace step has the transform's `id`, `name` and `description`.

```cpp
std::vector<DeinflectionResult> Deinflector::deinflect_neko_speech(const std::string& text) const
```
Reads NekoPara's cat speech, which says `にゃ` for `な` and sometimes for `だ`, `ら`, `ま` or `じゃ`: each `にゃ` in `text` is replaced by each of them, one at a time, and deinflected as usual, so `できにゃい` gives `できる` and `いにゃっしゃいます` gives `いらっしゃる`. Every result's trace starts with `neko speech` (`Deinflector::neko_speech`; `Deinflector::is_neko_speech` checks it). Empty when `text` has no `にゃ`. `deinflect` never returns these; `Lookup` uses them only with `LookupOptions::neko_speech`.

```cpp
static uint32_t Deinflector::pos_to_conditions(const std::vector<std::string>& part_of_speech)
```
Converts a vector of Japanese part-of-speech tags into a bitmask used for deinflection filtering. `conditions_for_parts_of_speech` does the same for the deinflector's own pack.

### lookup
```cpp
Lookup::Lookup(DictionaryQuery& query, const hoshidicts::LanguageRegistry& languages)
Lookup::Lookup(DictionaryQuery& query, Deinflector& deinflector)
```
Creates a Lookup object using a given query with dictionaries added, and either a registry, whose every pack it can look up (`LookupOptions::language`, default `ja`; an unknown code throws `std::invalid_argument`), or a deinflector, whose pack is its only language.

`LookupOptions::dictionaries` names the loaded dictionaries (paths) a request uses, in rank order: term, frequency, pitch and kanji queries and the long-key length use only those, an empty list selects nothing, and without it every loaded dictionary is used in load order, as before. `language_options` turns on a pack's optional processors, transforms and variant passes (`nekoSpeech` for Japanese, which `neko_speech` also enables). `pos_filter_exempt` lists dictionaries whose terms skip the part-of-speech filter. `DictionaryQuery::query_kanji(kanji, dictionaries)` takes the same selection.

```cpp
std::vector<LookupResult> Lookup::lookup(const std::string& lookup_string, int max_results = 16, size_t scan_length = 16) const
```
Follows a parsing strategy similar to Yomitan. Substrings of `lookup_string` are tested from length `scan_length` down to 1. Each substring is preprocessed, deinflected then queried using the query object.

Keys longer than `scan_length` are still found when `scan_length` is at least 8 and `lookup_string` is long enough to contain them: the importer records every key longer than 16 code points by its first eight code points in `scan.idx`, and when the input begins like such a key the scan extends to that key's length plus eight code points for an inflected ending. Inputs that do not begin like a long key keep the cost of `scan_length`. `DictionaryQuery::max_long_key_length()` returns the longest such key across the loaded term dictionaries so a caller can size `lookup_string`. Dictionaries imported before `scan.idx` existed simply never extend.

Results are filtered by part-of-speech tags defined in dictionaries, or added directly if none are present. The results are sorted by matched length first, then by preprocessing steps, then deinflection trace length and finally by frequency.

A pack whose `lookup.formOf` is `follow` (every pack but Japanese) follows form-of references as Yomitan does: `walked` with `[["walk", ["simple past"]]]` gives `walk` with the trace step `simple past` (`TransformGroup::from_dictionary`), a row that is only references never appears, and a term the dictionary names ranks before one only the rules reach on equal length, steps and trace length (`docs/languages.md` 9.6 and 9.10).

`LookupOptions::neko_speech` (off by default) also reads NekoPara's cat speech (`deinflect_neko_speech`). A cat-speech reading counts only where it matches a longer part of `lookup_string` than every ordinary one, long keys included, and then comes first (after any `primary_reading` results, which sort before matched length): `できにゃい` finds `出来る` over the whole word, and `そんにゃ` finds `そんな`. A term found both ways is listed once, under the longer match. Every other ordinary result is kept, but since cat speech takes the first places, a list capped by `max_results` can lose the last of them. `lookup_dictionary` judges this within its one dictionary. Off, the results are exactly those without the option. The option is meant for NekoPara-style text; on other text with `にゃ` or `ニャ` it also reads, wherever that reaches further than the dictionary's own words:

- a word followed by more text: `こんにゃくって` gives `凝る`; a word alone, such as `こんにゃく` or `にゃあ`, keeps exactly its ordinary results;
- dialect `にゃ` for `には` or `ねば`: `俺にゃ` gives `俺ら`, `たまにゃ` gives `球菜`;
- names and loanwords with `ニャ`, through the katakana-to-hiragana variant: `ソーニャ` gives `そうだ`, `おニャン子` gives `おじゃん`;
- meows and the sentence-final `にゃ`: `にゃぁ` gives `なぁ` and `まぁ`, `ですにゃ` gives `ですら`, and `来ましたにゃ` is read as `-たら`.

Among themselves the five readings rank like any others, so they can tie: `しにゃい` gives `竹刀` and `市内` (`な`), `私大` and `次第` (`だ`) and `姉妹` (`ま`) as equals, in no fixed order, while `わかりにゃした` puts `分かり出す` (`だ`) before `分かる` (`ま`), whose chain is longer. A word with two `にゃ` is read with one replaced at a time.

`LookupOptions::metadata_only_terms` (off by default) also returns terms that only frequency and pitch dictionaries have. Yomitan has no such option: it builds results from term banks alone and attaches frequencies and pitches to them, a row that names a reading only to a headword with that reading (`_getDeinflections` and `_addTermMeta` in `ext/js/language/translator.js` at yomidevs/yomitan@d3c54c1). A frequency or pitch row has no part of speech, so, like a term without one, it answers only the deinflections that need none: the text as written, after preprocessing, and the few rules that carry no part of speech, such as kansai-ben `-うたら` for `-ったら`. A row for `ググる` is found for `ググる` but not for `ググった`. Each reading the rows name is one term, with the rows for that reading and those without one, unless a term with glossaries is that text with that reading and so has those rows already: `銃五` in a term dictionary without a reading, as JMnedict stores names, and a frequency row for `銃五` read `じゅうご` give `銃五` and then `銃五` read `じゅうご`. Rows without a reading are a term of their text read as itself, when they name no reading and no term with glossaries is written that way. The readings rank in the order the frequency dictionaries and then the pitch dictionaries list them, unless a frequency sort separates them. Such a term has no glossaries, no rules and a zero score. It comes after the terms with glossaries that match as much of the text and before those that match less, so it comes first only where it matches more than all of them, long keys and cat speech included, or has the `primary_reading` they lack: with `東京` in a term dictionary and `東京タワー` only in a frequency and a pitch dictionary, `東京タワー` gives `東京タワー`, with the rows of both, before `東京`. The terms with glossaries keep exactly their order without the option, but a list capped by `max_results` can lose the last of them to metadata-only terms that match more of the text. `lookup_dictionary` never returns them. Off, the results are exactly those without the option. A frequency list counted from text, such as Jiten's, also lists kana fragments and the kana of names (`こで`, `とで`), which then come first wherever they match more of the text than the words around them.

`LookupOptions::glossary_text` and `LookupOptions::pitches` (both on by default) can be turned off by a caller that only ranks or splits text and reads no glossary or pitch. Without `glossary_text`, no result's glossary is decompressed: each keeps its dictionary, tags and score, but `glossary` is empty and it has no compressed data. A pack whose `lookup.formOf` is `follow` still decompresses the rows that hold form-of references, because their references decide the results. Without `pitches`, no result has pitches. Either way, the results, their order and everything else in them are exactly those with the option. Decompressing is most of a lookup's time when every result is kept: Hachidori's segmenter, which looks up every position of a sentence, runs about three times as fast without both.

```cpp
std::vector<LookupResult> Lookup::lookup_dictionary(const std::string& lookup_string,
                                                    const std::string& dictionary_path,
                                                    int max_results = 16,
                                                    size_t scan_length = 16) const
```
Runs the same lookup and ranking pipeline while restricting term matches to one
already-added dictionary. Frequency and pitch metadata still come from every
added metadata dictionary.

## Acknowledgements

- [Yomitan](https://github.com/yomidevs/yomitan): Dictionary format, Japanese deinflection rules and descriptions, Japanese preprocessor | GPL-3.0
- [glaze](https://github.com/stephenberry/glaze): MIT
- [libdeflate](https://github.com/ebiggers/libdeflate.git): MIT
- [xxHash](https://github.com/Cyan4973/xxHash): BSD-2-Clause
- [zstd](https://github.com/facebook/zstd): BSD
- [utfcpp](https://github.com/nemtrif/utfcpp): BSL-1.0
- [unordered_dense](https://github.com/martinus/unordered_dense.git): MIT
- [utf8proc](https://github.com/JuliaStrings/utf8proc): MIT
- [kanji-processor](https://github.com/yomidevs/kanji-processor): MIT
- [lzokay](https://github.com/AxioDL/lzokay): MIT (vendored in `external/lzokay`)
- [gumbo-parser](https://github.com/sparklemotion/nokogiri/tree/main/gumbo-parser) (Nokogiri's fork of Google's gumbo): Apache-2.0, `hashmap.c` MIT (vendored in `external/gumbo-parser`)
- [Nekopara-Speech](https://huggingface.co/datasets/OpenSpeechHub/Nekopara-Speech): the transcripts the `neko speech` substitutions were taken from (no data from it is included)
- [Hangul.js](https://github.com/e-/Hangul.js) 0.2.6: MIT, Copyright 2017 Jaemin Jo (ported in `src/languages/builtins/hangul.cpp`)
- Language packs carry their own sources and licences in `languages/<code>/README.md`

## Lookup benchmark

Build with `-DHOSHIDICTS_BENCHMARK=ON`. `benchmark-lookup` accepts a word list
(one UTF-8 word per line, or a CSV whose first column is the word), an iteration
count and `--term`, `--freq`, `--pitch` or `--kanji` package paths. Defaults keep
entries and hashes mapped. Add `--paged-entries` and independently
`--paged-index` to compare the readers. `--metadata-only-terms` turns
`LookupOptions::metadata_only_terms` on; `--no-glossary-text` and
`--no-pitches` turn `LookupOptions::glossary_text` and `pitches` off.
`--language <code>` looks words up with
that pack, loaded from `--languages <dir>` (default: this checkout's
`languages/`); without it the built-in Japanese pack is used through
`Lookup(query, deinflector)`. `--json` emits per-lookup milliseconds
for each pass, result/glossary counts and the shared cache's activity.
[`docs/benchmarks-languages.md`](docs/benchmarks-languages.md) has the
measurements of the language framework against 35e2dab.

```sh
./build/benchmark-lookup words.txt 2 --paged-entries --paged-index --json \
  --term imported/dictionary --freq imported/dictionary --pitch imported/dictionary
```

Timing covers `Lookup::lookup`, including decompression and ranking, and excludes
result counting, serialization and result destruction. Full result parity is
covered by the dictionary-storage tests; Chrome/WASM memory and transport costs
belong to the host application's benchmark.

## License
hoshidicts (main) is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE) for details.
