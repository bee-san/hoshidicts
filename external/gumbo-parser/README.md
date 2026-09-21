# gumbo-parser (vendored)

HTML5 parser used by the MDX importer to turn MDX glossary HTML into Yomitan
structured content.

Source: the `gumbo-parser/src` tree of Nokogiri
(https://github.com/sparklemotion/nokogiri, commit
da64104acfdc8b595e49935499c9cc357ebcac7a), itself a maintained fork of
google/gumbo-parser via lua-gumbo. Only the library sources (`src/*.c`,
`src/*.h`) are copied; Nokogiri's tests, fuzzers and the gperf/ragel inputs
are not. No file is modified. See UPSTREAM-README.md for the fork's history.

Licence: Apache-2.0 (LICENSE); `src/hashmap.c` is MIT (LICENSE-hashmap.c).

To update: copy `gumbo-parser/src/*.{c,h}` and `gumbo-parser/src/README.md`
(as UPSTREAM-README.md) from a newer Nokogiri checkout and bump the commit
above.
