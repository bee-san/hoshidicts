# hoshidicts

This library implements a dictionary backend that works similarly to [Yomitan](https://github.com/yomidevs/yomitan). This was made for [Hoshi Reader](https://github.com/Manhhao/Hoshi-Reader) and was only tested with Japanese. Other languages might need their own deinflector or adjustments to the lookup strategy.

A MIT version of the library is available on the [main-mit](https://github.com/Manhhao/hoshidicts/tree/main-mit) branch.

## Reference

### importer
```cpp
ImportResult dictionary_importer::import(const std::string& source_path, const std::string& output_dir, bool low_ram = false)
```
Imports a Yomitan `.zip` dictionary file or an MDict `.mdx` dictionary into a custom format. The resulting folder is stored in `output_dir/<dict_title>`. Glossaries are compressed using zstd. Term, frequency and pitch dictionaries are generally supported, but only a small part of the pitch accent spec was implemented. Setting `low_ram` to `true` can reduce memory usage significantly at the cost of slightly lower import speed.

The format is detected from the file contents, not the extension.

#### MDX / MDD import

An `.mdx` file is imported directly, without an intermediate Yomitan archive: its entries are converted to Yomitan term banks of 10,000 rows as they are read, so memory use is bounded by the bank size, not the dictionary. The conversion follows [manabitan](https://github.com/ManabiIO/manabitan)'s MDX importer so the result renders the same way.

- Container: MDict engine versions 1.x and 2.0 (`GeneratedByEngineVersion`). Version 3 files are rejected with a clear error.
- Encodings: UTF-8 and UTF-16. `GBK`, `GB18030` and `Big5` dictionaries are rejected (`unsupported MDX encoding: <name>`).
- Compression: none, LZO1X and zlib, per block, with every block's Adler-32 verified. A record block that fails to decode loses its entries, not the dictionary; the import fails only when no entry is left (`MDX has no usable entries: N records could not be read (…)`).
- Encryption: `Encrypted="2"` (ciphered key index) is supported. `Encrypted="1"` (registration-protected record blocks) needs a user key and is rejected.
- Resource files: `X.mdd`, `X.1.mdd`, `X.2.mdd`, ... next to `X.mdx` are read automatically (file name case does not matter); a missing MDD is not an error. Only assets the glossaries or stylesheets refer to are imported, under `mdict-media/<path>`; every `*.css` in the MDD plus inline `<style>` blocks become the dictionary's stylesheet. Keys containing `..`, a drive letter or NUL are dropped. An asset or stylesheet in a block that fails to decode is left out without failing the import.
- MDD stylesheets: decoded by their BOM, else by a leading `@charset "…";`, else as UTF-8, else as UTF-16 without a BOM, and their `@charset` rule is removed. A declared charset may be UTF-8, Shift_JIS, EUC-JP, GBK/GB18030, Big5, EUC-KR or windows-1252 under any of its [WHATWG labels](https://encoding.spec.whatwg.org/#names-and-labels); the legacy ones are decoded with `iconv(3)`, which the CMake build uses when `find_package(Iconv)` finds it. A sheet that does not decode cleanly, or declares any other charset, is left out of the stylesheet; it never fails the import.
- Entries: `@@@LINK=target` redirects become extra headwords of the entry they reach, through chains of redirects of any length; every alias keeps its own spelling. A target matches the key spelled exactly. A target that no key spells exactly matches the keys that equal it under the header's `KeyCaseSensitive` and `StripKey` rules (absent, `No` and `Yes` as in MDict): letter case is ignored, and StripKey removes `( ) . , - & 、 ' / \ @ _ $ !` and spaces. A redirect whose target is missing, or that only reaches other redirects, is dropped. Duplicate headwords stay separate entries. `Format="Text"` definitions become plain string glossaries; HTML definitions become structured content.
- HTML fidelity: the MDX `StyleSheet` backtick markup is expanded; `b/i/em/strong/u/s/sub/sup/h1-6/p/pre/font/...` map to styled `span`/`div`; `<font size>` becomes a CSS keyword (`x-small` … `xxx-large`) by the HTML legacy font-size rules, and an inline `style` wins over `size`, `color` and `face`; inline `style` keeps the properties Yomitan's structured content supports; `entry://`, `bword://`, `d:`, `x:` links search the term; `sound://` links are disabled (rendered as `#`) and their files are not imported; `javascript:` and friends are neutralised; `<script>` is dropped; unsupported elements keep their text; nesting deeper than 20 is flattened. CSS from the MDD is passed through as the dictionary stylesheet, so selectors that depend on tags Yomitan does not render (`<b>`, `<p>`, ...) will not match.
- What an import left out is counted on `ImportResult::warnings`, as manabitan's MDict conversion notes count it: `skippedRecords` (records in blocks that failed to decode), `unresolvedRedirects` (aliases that reach no entry), `missingResources` (distinct referenced paths no MDD provides) and `unreadableResources` (distinct MDD resources in blocks that failed to decode). A Yomitan archive's counts are zero. They describe the import run and are not written to `index.json`.
- The key index of the MDX (and of each MDD) is held in memory during the import; records are streamed block by block.

```
hoshidicts-cli import path/to/dictionary.mdx
```

### query
```cpp
bool DictionaryQuery::add_term_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped)
```
Adds an imported term dictionary to the query.

```cpp
bool DictionaryQuery::add_freq_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped)
```
Adds an imported frequency dictionary to the query.

```cpp
bool DictionaryQuery::add_pitch_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped)
```
Adds an imported pitch dictionary to the query.

A dictionary added as several kinds (term, frequency, pitch, kanji) is opened once: the later kinds share the files the first one opened, whatever `storage` they ask for, and `remove_dict` releases them with the last kind. A path's files must not change while any kind of it is loaded.

`storage` decides how the dictionary's entries are held. The index files (`hash.table`, `bloom.filter`, `media.idx`, `scan.idx` and the trained zstd dictionary) are memory-mapped either way; every probe reads them.

- `DictionaryStorage::Mapped` maps `blobs.bin`, which holds the entries, and `media.bin`. Natively a mapping costs nothing until it is read. Under Emscripten `mmap` copies the whole file into linear memory, so there `media.bin` is not mapped but read from the file when a media file is asked for.
- `DictionaryStorage::Paged` reads `blobs.bin` on demand through a page cache that the query's paged dictionaries share, and reads `media.bin` on demand. Lookups return the same results; one that needs pages the cache does not hold costs a read per page. `DictionaryQuery(PageCacheOptions{...})` sets the page size (default 4 KiB) and the cache budget (default 32 MiB); pages a running query holds stay valid until it returns, so the cache can exceed its budget until then. `page_cache_bytes()` returns what it holds.

```cpp
std::vector<TermResult> DictionaryQuery::query(const std::string& expression) const
```
Queries all added dictionaries for the given expression. TermResult includes glossary, frequency and pitch data in the order dictionaries were added. Glossaries are decompressed.

```cpp
std::vector<DictionaryStyle> DictionaryQuery::get_styles() const
```
Returns CSS styles for all dictionaries, if present.

```cpp
std::vector<char> DictionaryQuery::get_media_file(const std::string& dict_name, const std::string& media_path) const
```
Returns raw bytes for file originally stored at `media_path` in term dictionary `dict_name` or an empty vector if the file does not exist.

```cpp
size_t DictionaryQuery::read_media_file(const std::string& dict_name, const std::string& media_path,
                                        std::vector<uint8_t>& out, size_t max_bytes = SIZE_MAX) const
```
Returns the stored size of the media file (0 when there is none) and copies it into `out` when it is at most `max_bytes` long, so a caller can refuse a large file without reading it. `get_media_file_view` returns a view into the mapping instead, and an empty one where media is read on demand.

### deinflector
```cpp
std::vector<DeinflectionResult> Deinflector::deinflect(const std::string& text) const
```
Deinflects a given Japanese string using rules from the Yomitan deinflector. As this doesn't use any dictionary data, the result may include invalid deinflections.

```cpp
static uint32_t Deinflector::pos_to_conditions(const std::vector<std::string>& part_of_speech)
```
Converts a vector of part-of-speech tags into a bitmask used for deinflection filtering.

### lookup
```cpp
Lookup::Lookup(DictionaryQuery& query, Deinflector& deinflector)
```
Creates a Lookup object using a given query with dictionaries added and a deinflector.

```cpp
std::vector<LookupResult> Lookup::lookup(const std::string& lookup_string, int max_results = 16, size_t scan_length = 16) const
```
Follows a parsing strategy similar to Yomitan. Substrings of `lookup_string` are tested from length `scan_length` down to 1. Each substring is preprocessed, deinflected then queried using the query object.

Keys longer than `scan_length` are still found when `scan_length` is at least 8 and `lookup_string` is long enough to contain them: the importer records every key longer than 16 code points by its first eight code points in `scan.idx`, and when the input begins like such a key the scan extends to that key's length plus eight code points for an inflected ending. Inputs that do not begin like a long key keep the cost of `scan_length`. `DictionaryQuery::max_long_key_length()` returns the longest such key across the loaded term dictionaries so a caller can size `lookup_string`. Dictionaries imported before `scan.idx` existed simply never extend.

Results are filtered by part-of-speech tags defined in dictionaries, or added directly if none are present. The results are sorted by matched length first, then by preprocessing steps, then deinflection trace length and finally by frequency.

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

## License
hoshidicts (main) is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE) for details.
