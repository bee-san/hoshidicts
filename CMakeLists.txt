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

add_library(hoshidicts
    src/hash/hash.cpp
    src/hash/bloom.cpp
    src/importer.cpp
    src/memory/memory.cpp
    src/zip/zip.cpp
    src/source/zip_source.cpp
    src/json/yomitan_parser.cpp
    src/json/json_skip.cpp
    src/text_processor/text_processor.cpp
    src/text_processor/kanji_variants.cpp
    src/deinflector.cpp
    src/query.cpp
    src/lookup.cpp
    src/hoshidicts_c.cpp
)

if(HOSHIDICTS_WASMFS)
  target_compile_definitions(hoshidicts PRIVATE HOSHIDICTS_WASMFS=1)
endif()

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
)

if(MSVC)
    target_compile_options(hoshidicts PRIVATE /utf-8)
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
    )

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
    )
endif()
if(HOSHIDICTS_TESTS)
    enable_testing()
    foreach(variant simd scalar)
        add_executable(json-skip-test-${variant} tests/json_skip_test.cpp src/json/json_skip.cpp)
        target_include_directories(json-skip-test-${variant} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
        target_link_libraries(json-skip-test-${variant} PRIVATE glaze::glaze)
        add_test(NAME json-skip-${variant} COMMAND json-skip-test-${variant})
    endforeach()
    target_compile_definitions(json-skip-test-scalar PRIVATE HOSHIDICTS_JSON_SKIP_SCALAR=1)

    add_executable(score-roundtrip-test tests/score_roundtrip_test.cpp)
    target_link_libraries(score-roundtrip-test PRIVATE hoshidicts)
    add_test(NAME score-roundtrip COMMAND score-roundtrip-test)

    add_executable(long-key-scan-test tests/long_key_scan_test.cpp)
    target_link_libraries(long-key-scan-test PRIVATE hoshidicts)
    add_test(NAME long-key-scan COMMAND long-key-scan-test)

    add_executable(import-equivalence-test tests/import_equivalence_test.cpp)
    target_link_libraries(import-equivalence-test PRIVATE hoshidicts)
    add_test(NAME import-equivalence
             COMMAND import-equivalence-test
                     ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/yomitan/small_dict.zip
                     ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/yomitan/golden.sha256)
endif()
