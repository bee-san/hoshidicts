cmake_minimum_required(VERSION 3.22.1)
cmake_policy(SET CMP0077 NEW)

project(hoshidicts LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(HOSHIDICTS_CLI "hoshidicts cli" OFF)
option(HOSHIDICTS_BENCHMARK "hoshidicts import and lookup benchmarks" OFF)
option(HOSHIDICTS_TESTS "hoshidicts unit tests (ctest)" OFF)
# Emscripten hosts that link with -sWASMFS: read-only descriptors are served
# from a Blob there, so dictionary files are opened read-write for the copy
# (see src/memory/memory.cpp).
option(HOSHIDICTS_WASMFS "The Emscripten build links against WasmFS" OFF)
option(HOSHIDICTS_DEINFLECTOR_TESTS "Japanese conjugation parity tests" OFF)
option(HOSHIDICTS_LANGUAGE_TESTS "language pack conformance tests (docs/languages.md 12.1)" OFF)

set(ZSTD_BUILD_PROGRAMS OFF CACHE BOOL "")
set(ZSTD_BUILD_TESTS OFF CACHE BOOL "")
set(ZSTD_BUILD_SHARED OFF CACHE BOOL "")
set(ZSTD_BUILD_STATIC ON CACHE BOOL "")

set(LIBDEFLATE_BUILD_SHARED_LIB OFF CACHE BOOL "")
set(LIBDEFLATE_BUILD_GZIP OFF CACHE BOOL "")

set(UTF8PROC_INSTALL OFF CACHE BOOL "")

add_subdirectory(external/glaze)
add_subdirectory(external/zstd)

# Override one zstd translation unit: src/zstd/zstd_compress_sequences.c is the
# pinned upstream file plus a cache for the default FSE table (see its header
# comment). Re-copy it when the zstd submodule moves.
get_target_property(HOSHIDICTS_ZSTD_SOURCES libzstd_static SOURCES)
list(FILTER HOSHIDICTS_ZSTD_SOURCES EXCLUDE REGEX "compress/zstd_compress_sequences\\.c$")
set_property(TARGET libzstd_static PROPERTY SOURCES ${HOSHIDICTS_ZSTD_SOURCES})
target_sources(libzstd_static PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src/zstd/zstd_compress_sequences.c)
target_include_directories(libzstd_static PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/external/zstd/lib/compress)
add_subdirectory(external/unordered_dense)
add_subdirectory(external/libdeflate)
add_subdirectory(external/utf8proc)

# Vendored (not submodules): external/lzokay and external/gumbo-parser carry
# their own LICENSE and README with the upstream commit they were copied from.
add_library(lzokay STATIC external/lzokay/lzokay.cpp)
target_include_directories(lzokay PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/external/lzokay)

set(GUMBO_DIR ${CMAKE_CURRENT_SOURCE_DIR}/external/gumbo-parser/src)
add_library(gumbo STATIC
    ${GUMBO_DIR}/ascii.c
    ${GUMBO_DIR}/attribute.c
    ${GUMBO_DIR}/char_ref.c
    ${GUMBO_DIR}/error.c
    ${GUMBO_DIR}/foreign_attrs.c
    ${GUMBO_DIR}/hashmap.c
    ${GUMBO_DIR}/parser.c
    ${GUMBO_DIR}/string_buffer.c
    ${GUMBO_DIR}/string_piece.c
    ${GUMBO_DIR}/string_set.c
    ${GUMBO_DIR}/svg_attrs.c
    ${GUMBO_DIR}/svg_tags.c
    ${GUMBO_DIR}/tag.c
    ${GUMBO_DIR}/tag_lookup.c
    ${GUMBO_DIR}/token_buffer.c
    ${GUMBO_DIR}/tokenizer.c
    ${GUMBO_DIR}/utf8.c
    ${GUMBO_DIR}/util.c
    ${GUMBO_DIR}/vector.c
)
target_include_directories(gumbo PUBLIC ${GUMBO_DIR})
if(MSVC)
    target_compile_definitions(gumbo PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()

add_library(hoshidicts
    src/hash/hash.cpp
    src/hash/bloom.cpp
    src/importer.cpp
    src/memory/memory.cpp
    src/memory/page_cache.cpp
    src/blob_file.cpp
    src/zip/zip.cpp
    src/source/zip_source.cpp
    src/mdict/ripemd128.cpp
    src/mdict/mdict_reader.cpp
    src/mdict/html_to_structured.cpp
    src/mdict/mdict_source.cpp
    src/json/yomitan_parser.cpp
    src/json/json_skip.cpp
    src/languages/builtins/builtins.cpp
    src/languages/builtins/hangul.cpp
    src/languages/builtins/japanese.cpp
    src/languages/builtins/kanji_variants.cpp
    src/languages/builtins/vietnamese.cpp
    src/languages/builtin_packs.cpp
    src/languages/case_mapping.cpp
    src/languages/case_tables.cpp
    src/languages/classes.cpp
    src/languages/corpus.cpp
    src/languages/json.cpp
    src/languages/pack.cpp
    src/languages/regex.cpp
    src/languages/registry.cpp
    src/languages/steps.cpp
    src/languages/transforms.cpp
    src/languages/unicode.cpp
    src/deinflector.cpp
    src/query.cpp
    src/lookup.cpp
    src/hoshidicts_c.cpp
)

if(HOSHIDICTS_WASMFS)
  target_compile_definitions(hoshidicts PRIVATE HOSHIDICTS_WASMFS=1)
endif()

# Language packs are parsed once per pack (docs/languages.md 13), so the
# WebAssembly build optimises the load-time sources, and the code they
# instantiate, for size: they are most of what the framework adds to a bundle.
if(EMSCRIPTEN)
  set_source_files_properties(
      src/languages/pack.cpp
      src/languages/json.cpp
      src/languages/classes.cpp
      src/languages/registry.cpp
      src/languages/corpus.cpp
      PROPERTIES COMPILE_OPTIONS "-Oz")
endif()

# MDD stylesheets that declare a legacy @charset (Shift_JIS, GBK, ...) are
# decoded with iconv(3), part of glibc and musl (so Emscripten) and Apple's
# libiconv. Without it such a sheet is left out of the dictionary's styles.
find_package(Iconv)
if(Iconv_FOUND)
  target_compile_definitions(hoshidicts PRIVATE HOSHIDICTS_ICONV=1)
  target_link_libraries(hoshidicts PRIVATE Iconv::Iconv)
endif()

target_include_directories(hoshidicts PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_include_directories(hoshidicts PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/external/utfcpp/source
    ${CMAKE_CURRENT_SOURCE_DIR}/external/xxHash
)

target_link_libraries(hoshidicts PRIVATE
    glaze::glaze
    libzstd_static
    libdeflate_static
    unordered_dense
    utf8proc::utf8proc
    lzokay
    gumbo
)

if(MSVC)
    target_compile_options(hoshidicts PRIVATE /utf-8)
endif()

if(HOSHIDICTS_DEINFLECTOR_TESTS)
    enable_testing()
    # The deinflector reads the Japanese pack, so the test links the library.
    add_executable(deinflector-test tests/deinflector_test.cpp)
    target_link_libraries(deinflector-test PRIVATE hoshidicts)
    if(MSVC)
        target_compile_options(deinflector-test PRIVATE /utf-8)
    endif()
    add_test(NAME deinflector
             COMMAND deinflector-test ${CMAKE_CURRENT_SOURCE_DIR}/languages/ja/tests/yomitan.tsv)
endif()

if(HOSHIDICTS_LANGUAGE_TESTS)
    enable_testing()
    add_executable(language-conformance-test tests/language_conformance_test.cpp)
    target_include_directories(language-conformance-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
    target_link_libraries(language-conformance-test PRIVATE hoshidicts glaze::glaze unordered_dense utf8proc::utf8proc)
    if(MSVC)
        target_compile_options(language-conformance-test PRIVATE /utf-8)
    endif()
    # One test per pack directory; adding a pack adds its test, also in an
    # existing build directory.
    file(GLOB HOSHIDICTS_PACK_DESCRIPTORS CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/languages/*/language.json)
    foreach(descriptor ${HOSHIDICTS_PACK_DESCRIPTORS})
        get_filename_component(pack_dir ${descriptor} DIRECTORY)
        get_filename_component(pack_code ${pack_dir} NAME)
        if(NOT pack_code MATCHES "^_")
            add_test(NAME language-${pack_code}
                     COMMAND language-conformance-test ${pack_dir} ${CMAKE_CURRENT_BINARY_DIR})
        endif()
    endforeach()
endif()

if(HOSHIDICTS_CLI)
    add_executable(hoshidicts-cli
        cli/main.cpp
    )

    add_executable(hoshidicts-cli-c
        cli/main.c
    )

    target_link_libraries(hoshidicts-cli PRIVATE
        hoshidicts
        unordered_dense
    )
    # `--languages` defaults to this checkout's packs.
    target_compile_definitions(hoshidicts-cli PRIVATE
        HOSHIDICTS_LANGUAGES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/languages")
    if(MSVC)
        target_compile_options(hoshidicts-cli PRIVATE /utf-8)
    endif()

    target_link_libraries(hoshidicts-cli-c PRIVATE
        hoshidicts
    )
endif()

if(HOSHIDICTS_BENCHMARK)
    add_executable(benchmark-import
        benchmark/import.cpp
    )

    target_link_libraries(benchmark-import PRIVATE
        hoshidicts
    )

    add_executable(benchmark-lookup
        benchmark/lookup.cpp
    )

    target_link_libraries(benchmark-lookup PRIVATE
        hoshidicts
        glaze::glaze
    )
    target_compile_definitions(benchmark-lookup PRIVATE
        HOSHIDICTS_LANGUAGES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/languages")
endif()
if(HOSHIDICTS_TESTS)
    enable_testing()

    # The oracle: the Japanese pipeline at 35e2dab in namespace hoshidicts_legacy
    # (docs/languages.md 11.3, tests/reference/README.md). Linked only into tests.
    add_library(hoshidicts-legacy STATIC
        tests/reference/legacy_deinflector.cpp
        tests/reference/legacy_text_processor.cpp
        tests/reference/legacy_kanji_variants.cpp
        tests/reference/legacy_query.cpp
        tests/reference/legacy_lookup.cpp
    )
    target_include_directories(hoshidicts-legacy PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
    target_link_libraries(hoshidicts-legacy
        PUBLIC hoshidicts
        PRIVATE glaze::glaze libzstd_static unordered_dense utf8proc::utf8proc)
    if(MSVC)
        target_compile_options(hoshidicts-legacy PRIVATE /utf-8)
    endif()

    # languages/ja/transforms.json is what tools/export-legacy-japanese.cpp
    # writes from the oracle's deinflector (docs/languages.md 11.1).
    add_executable(export-legacy-japanese tools/export-legacy-japanese.cpp)
    target_include_directories(export-legacy-japanese PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/external/utfcpp/source)
    if(MSVC)
        target_compile_options(export-legacy-japanese PRIVATE /utf-8)
    endif()
    add_test(NAME ja-export-legacy
             COMMAND ${CMAKE_COMMAND}
                     -DEXPORT=$<TARGET_FILE:export-legacy-japanese>
                     -DOUT=${CMAKE_CURRENT_BINARY_DIR}/ja-transforms.json
                     -DEXPECTED=${CMAKE_CURRENT_SOURCE_DIR}/languages/ja/transforms.json
                     -P ${CMAKE_CURRENT_SOURCE_DIR}/tests/export_legacy_japanese.cmake)

    # The Japanese parity tests (docs/languages.md 11.3): the framework against
    # the oracle.
    add_executable(ja-parity-test tests/ja_parity_test.cpp)
    target_include_directories(ja-parity-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src ${CMAKE_CURRENT_SOURCE_DIR}/tests)
    target_link_libraries(ja-parity-test PRIVATE hoshidicts-legacy hoshidicts unordered_dense)
    if(MSVC)
        target_compile_options(ja-parity-test PRIVATE /utf-8)
    endif()
    add_test(NAME ja-deinflect-parity COMMAND ja-parity-test deinflect ${CMAKE_CURRENT_SOURCE_DIR})
    add_test(NAME ja-process-parity COMMAND ja-parity-test process ${CMAKE_CURRENT_SOURCE_DIR})
    add_test(NAME ja-lookup-parity COMMAND ja-parity-test lookup ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_BINARY_DIR})

    # The C API with a language request, compiled as C (docs/languages.md 11.3).
    add_executable(c-smoke-test tests/c_smoke_test.c)
    target_link_libraries(c-smoke-test PRIVATE hoshidicts)
    file(MAKE_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/c-smoke)
    add_test(NAME c-smoke
             COMMAND c-smoke-test ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/yomitan/small_dict.zip
                     ${CMAKE_CURRENT_BINARY_DIR}/c-smoke)

    foreach(variant simd scalar)
        add_executable(json-skip-test-${variant} tests/json_skip_test.cpp src/json/json_skip.cpp)
        target_include_directories(json-skip-test-${variant} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
        target_link_libraries(json-skip-test-${variant} PRIVATE glaze::glaze)
        add_test(NAME json-skip-${variant} COMMAND json-skip-test-${variant})
    endforeach()
    target_compile_definitions(json-skip-test-scalar PRIVATE HOSHIDICTS_JSON_SKIP_SCALAR=1)

    add_executable(builtins-test tests/builtins_test.cpp)
    target_include_directories(builtins-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
    target_link_libraries(builtins-test PRIVATE hoshidicts)
    if(MSVC)
        target_compile_options(builtins-test PRIVATE /utf-8)
    endif()
    add_test(NAME builtins COMMAND builtins-test)

    add_executable(languages-test tests/languages_test.cpp)
    target_include_directories(languages-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
    target_link_libraries(languages-test PRIVATE hoshidicts unordered_dense)
    if(MSVC)
        target_compile_options(languages-test PRIVATE /utf-8)
    endif()
    add_test(NAME languages COMMAND languages-test ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/languages)

    add_executable(score-roundtrip-test tests/score_roundtrip_test.cpp)
    target_link_libraries(score-roundtrip-test PRIVATE hoshidicts)
    add_test(NAME score-roundtrip COMMAND score-roundtrip-test)

    add_executable(lookup-order-test tests/lookup_order_test.cpp)
    target_link_libraries(lookup-order-test PRIVATE hoshidicts)
    add_test(NAME lookup-order COMMAND lookup-order-test)

    add_executable(tag-bank-test tests/tag_bank_test.cpp)
    target_link_libraries(tag-bank-test PRIVATE hoshidicts)
    add_test(NAME tag-bank COMMAND tag-bank-test)

    add_executable(kanji-meta-test tests/kanji_meta_test.cpp)
    target_link_libraries(kanji-meta-test PRIVATE hoshidicts)
    add_test(NAME kanji-meta COMMAND kanji-meta-test)

    add_executable(zip64-test tests/zip64_test.cpp)
    target_link_libraries(zip64-test PRIVATE hoshidicts)
    add_test(NAME zip64 COMMAND zip64-test)

    add_executable(escaped-strings-test tests/escaped_strings_test.cpp)
    target_link_libraries(escaped-strings-test PRIVATE hoshidicts)
    add_test(NAME escaped-strings COMMAND escaped-strings-test)

    add_executable(title-folder-test tests/title_folder_test.cpp)
    target_link_libraries(title-folder-test PRIVATE hoshidicts)
    add_test(NAME title-folder COMMAND title-folder-test)

    add_executable(data-descriptor-test tests/data_descriptor_test.cpp)
    target_link_libraries(data-descriptor-test PRIVATE hoshidicts)
    add_test(NAME data-descriptor COMMAND data-descriptor-test)

    add_executable(long-key-scan-test tests/long_key_scan_test.cpp)
    target_link_libraries(long-key-scan-test PRIVATE hoshidicts)
    add_test(NAME long-key-scan COMMAND long-key-scan-test)

    add_executable(dictionary-storage-test tests/dictionary_storage_test.cpp)
    target_link_libraries(dictionary-storage-test PRIVATE hoshidicts)
    add_test(NAME dictionary-storage COMMAND dictionary-storage-test)

    add_executable(paged-hash-test tests/paged_hash_test.cpp)
    target_link_libraries(paged-hash-test PRIVATE hoshidicts)
    add_test(NAME paged-hash COMMAND paged-hash-test)

    add_executable(deps-smoke-test tests/deps_smoke_test.cpp)
    target_link_libraries(deps-smoke-test PRIVATE lzokay gumbo)
    add_test(NAME deps-smoke COMMAND deps-smoke-test)

    add_executable(mdict-reader-test tests/mdict_reader_test.cpp)
    target_include_directories(mdict-reader-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
    target_link_libraries(mdict-reader-test PRIVATE hoshidicts)
    add_test(NAME mdict-reader COMMAND mdict-reader-test ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/mdict)

    add_executable(html-to-structured-test tests/html_to_structured_test.cpp)
    target_include_directories(html-to-structured-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
    target_link_libraries(html-to-structured-test PRIVATE hoshidicts glaze::glaze)
    add_test(NAME html-to-structured COMMAND html-to-structured-test)

    add_executable(mdict-test tests/mdict_test.cpp)
    target_link_libraries(mdict-test PRIVATE hoshidicts)
    add_test(NAME mdict-import COMMAND mdict-test ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/mdict)

    add_executable(import-equivalence-test tests/import_equivalence_test.cpp)
    target_link_libraries(import-equivalence-test PRIVATE hoshidicts)
    add_test(NAME import-equivalence
             COMMAND import-equivalence-test
                     ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/yomitan/small_dict.zip
                     ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/yomitan/golden.sha256)
endif()

if(HOSHIDICTS_TESTS AND HOSHIDICTS_CLI)
    # The real CLI's language commands on the probe packs (docs/languages.md 10.3).
    add_test(NAME cli-languages
             COMMAND ${CMAKE_COMMAND} -DCLI=$<TARGET_FILE:hoshidicts-cli>
                     -DFIXTURES=${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures
                     -DTOOLS_FIXTURES=${CMAKE_CURRENT_SOURCE_DIR}/tools/test/fixtures
                     -DSCRATCH=${CMAKE_CURRENT_BINARY_DIR}
                     -P ${CMAKE_CURRENT_SOURCE_DIR}/tests/cli_languages_test.cmake)
    # tools/check-yomitan.mjs with the real CLI (the tool tests use a stand-in)
    # on the tool tests' fixture pack, whose setting names an optional
    # transform that its sources/yomitan.json lacks (docs/languages.md 8.2).
    # Without Node the test is still added, and fails saying why, so a build
    # that cannot run it is never green by leaving it out.
    find_program(HOSHIDICTS_NODE node)
    if(HOSHIDICTS_NODE)
        add_test(NAME check-yomitan-cli
                 COMMAND ${HOSHIDICTS_NODE} ${CMAKE_CURRENT_SOURCE_DIR}/tools/check-yomitan.mjs
                         ${CMAKE_CURRENT_SOURCE_DIR}/tools/test/fixtures/yomitan xx
                         --languages ${CMAKE_CURRENT_SOURCE_DIR}/tools/test/fixtures/languages
                         --cli $<TARGET_FILE:hoshidicts-cli>)
    else()
        set(HOSHIDICTS_NO_NODE "node not found: check-yomitan-cli fails until Node is on the PATH (or HOSHIDICTS_NODE names it) and CMake configures this build again")
        message(WARNING "${HOSHIDICTS_NO_NODE}")
        add_test(NAME check-yomitan-cli COMMAND ${CMAKE_COMMAND} -E echo "${HOSHIDICTS_NO_NODE}")
        set_tests_properties(check-yomitan-cli PROPERTIES WILL_FAIL TRUE)
    endif()
endif()

if(HOSHIDICTS_LANGUAGE_TESTS)
    # Only the Japanese pack may use tests/yomitan.tsv as its corpus (12.1 step 4).
    add_test(NAME language-needs-corpus
             COMMAND ${CMAKE_COMMAND} -DTEST=$<TARGET_FILE:language-conformance-test>
                     -DPACK=${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/conformance/yt
                     -DSCRATCH=${CMAKE_CURRENT_BINARY_DIR}
                     "-DREASON=a pack with transforms needs tests/corpus.tsv"
                     -P ${CMAKE_CURRENT_SOURCE_DIR}/tests/conformance_refuses_test.cmake)
    # Settings name optional transforms of the pack's own lookup.transforms
    # file, whatever other rule files the pack has (4.7, 12.1 step 1).
    add_test(NAME language-settings-own-rules
             COMMAND ${CMAKE_COMMAND} -DTEST=$<TARGET_FILE:language-conformance-test>
                     -DPACK=${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/conformance/st
                     -DSCRATCH=${CMAKE_CURRENT_BINARY_DIR}
                     "-DREASON=st: language.json: settings[0].effect.transforms[0]: names no optional transform \"archaic\""
                     -P ${CMAKE_CURRENT_SOURCE_DIR}/tests/conformance_refuses_test.cmake)
    # An interposedObject rule with verbGuardWords conforms (7.3), and the list
    # it names must be defined (12.1 step 1).
    add_test(NAME language-verb-guards
             COMMAND language-conformance-test ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/conformance/vg
                     ${CMAKE_CURRENT_BINARY_DIR})
    add_test(NAME language-verb-guards-undefined
             COMMAND ${CMAKE_COMMAND} -DTEST=$<TARGET_FILE:language-conformance-test>
                     -DPACK=${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/conformance/vg
                     -DSCRATCH=${CMAKE_CURRENT_BINARY_DIR}
                     -DEDIT=transforms.json "-DFROM=\"auxiliaries\": [" "-DTO=\"verbs\": ["
                     "-DREASON=vg: transforms.json: transforms[1].rules[0].verbGuardWords: names no word list \"auxiliaries\""
                     -P ${CMAKE_CURRENT_SOURCE_DIR}/tests/conformance_refuses_test.cmake)
    # A test file whose first line is `# options: default` runs with the
    # pack's defaults, every other file with every option on (12.2): the od
    # fixture, copies with a rule removed and the line removed, added, moved
    # or misspelt, and a copy of the Japanese pack with such a lookup.tsv.
    add_test(NAME language-options-default
             COMMAND ${CMAKE_COMMAND} -DTEST=$<TARGET_FILE:language-conformance-test>
                     -DPACK=${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/conformance/od
                     -DJA=${CMAKE_CURRENT_SOURCE_DIR}/languages/ja
                     -DSCRATCH=${CMAKE_CURRENT_BINARY_DIR}
                     -P ${CMAKE_CURRENT_SOURCE_DIR}/tests/conformance_options_test.cmake)
endif()
