# Language framework: performance against 35e2dab

Measurements for `docs/languages.md` section 13: the Japanese pipeline before
the language framework (35e2dab) and after it (feat/multi-language 33c422d),
on the same machine with the same dictionary. Recorded 2026-11-02.

## Setup

- x86_64, 64 cores, conda GCC 14.3.0, CMake Release (`-O3 -DNDEBUG`), Ninja.
  The 35e2dab build is the one in `measure/BASELINE.md`; both builds use the
  same compiler and flags.
- Jitendex.org [2026-10-03] (zip sha256
  `e914c76596220dffc6ee0c069cd05992f03adb2988c12c3cebe817a3ac271356`),
  imported once, mapped storage.
- `benchmark-lookup <words> <passes> --json --term <Jitendex>`: `lookup(word,
  16, 16)`, the first pass dropped, p50 and p95 over every remaining lookup.
  Reference words (`食べました`, `走り出した`, `美しい景色`,
  `日本語を勉強しています`) x 200 passes; the 1,382 distinct `valid = 1`
  sources of `languages/ja/tests/yomitan.tsv` x 6 passes.
- Before and after alternate within each round (10 rounds), so both see the
  same machine load. Peak RSS is the process's `ru_maxrss`.
- WebAssembly: Hachidori's bindings at 99960c7c (`wasm/CMakeLists.txt`,
  Emscripten 6.0.9, `-O3 -flto -fwasm-exceptions -msimd128`), built against
  each engine.

## Native lookups

Medians over 10 interleaved rounds (range in brackets):

| Words | Statistic | 35e2dab | 33c422d | Change |
| --- | --- | ---: | ---: | ---: |
| 4 reference words | p50 | 14.1 µs (14.0-14.3) | 14.0 µs (13.9-14.2) | -0.7% |
| 4 reference words | p95 | 30.1 µs (29.6-30.6) | 27.5 µs (27.2-27.9) | -8.7% |
| 4 reference words | mean | 16.7 µs | 16.0 µs | -4.0% |
| 1,382 corpus sources | p50 | 15.4 µs (15.3-15.5) | 15.0 µs (14.9-15.4) | -2.8% |
| 1,382 corpus sources | p95 | 59.3 µs (58.8-59.8) | 58.8 µs (58.4-59.9) | -1.0% |
| 1,382 corpus sources | mean | 21.9 µs | 21.2 µs | -3.3% |

Per reference word (median of per-pass medians): 食べました 14.2 → 14.0 µs,
走り出した 14.1 → 14.1 µs, 美しい景色 8.1 → 8.3 µs (+1.7%),
日本語を勉強しています 29.5 → 26.9 µs.

Every run returns the same number of results before and after (4,000 for
the reference words, 44,232 for the corpus), and the parity tests require
identical results field by field.

Where the time went, timing the parts alone on the 6,199 prefixes of the
corpus sources: the generic deinflector takes 2.4 ms where 35e2dab's took
3.2 ms (parent-linked traces copy trace strings only for the results a
lookup keeps), and the eight processors take 2.7 ms, as before.

## Native memory and load

| | 35e2dab | 33c422d |
| --- | ---: | ---: |
| Peak RSS, reference-word run | 8.4 MiB | 9.4 MiB |
| Peak RSS, corpus run | 66.5 MiB | 67.0 MiB |
| Heap of the Japanese deinflector (`mallinfo2`, in use + mmapped) | 189 KiB | 287 KiB |
| First `Deinflector()` (load of the built-in pack) | 0.28 ms | 1.33 ms |
| Parse of the built-in pack, warm (best of 20) | (C++ code) | 0.59 ms |

The 1 MiB of RSS is mostly the larger binary (`benchmark-lookup` text
1,529,105 → 1,954,570 bytes: the pack parser, builtins, case tables and
`std::wregex`) and the inflated pack text while it is parsed.

## WebAssembly bundles

`hoshidicts.wasm` sizes with Hachidori's bindings at 99960c7c:

| Runtime | 35e2dab | 33c422d | Change | gzip -9 |
| --- | ---: | ---: | ---: | --- |
| threaded (WasmFS/OPFS) | 3,022,159 B | 3,111,011 B | +88,852 B (+2.94%) | 1,064,719 → 1,160,673 B |
| threaded IDBFS | 2,931,964 B | 3,020,677 B | +88,713 B (+3.03%) | 1,036,666 → 1,132,534 B |
| single-thread | 2,862,825 B | 2,956,989 B | +94,164 B (+3.29%) | 1,023,250 → 1,118,960 B |

Today's bindings never call `LanguageRegistry::add`, so link-time
optimisation drops the parser's paths for packs loaded at run time. With a
scratch export that calls `add()` (as Hachidori's `hdw_language_load` will),
the single-thread bundle is 2,978,087 B (+115,262 B, +4.03%).

What the budget took: the embedded Japanese pack is stored as raw DEFLATE
(14 KB instead of 158 KB of JSON) and inflated with the libdeflate the
library already links; the load-time sources compile with `-Oz` under
Emscripten; rules keep rare fields out of line (`sizeof(Rule)` 408 → 160 B).

## WebAssembly lookups (Node 22)

Node `hdw_lookup` on the single-thread bundle, Jitendex copied into MEMFS,
8 interleaved rounds (median of the rounds' values):

| Words | Statistic | 35e2dab | 33c422d | Change |
| --- | --- | ---: | ---: | ---: |
| 4 reference words, 100 passes | p50 | 132.1 µs | 133.2 µs | +0.9% |
| 4 reference words | p95 | 266.4 µs | 262.6 µs | -1.4% |
| 1,382 corpus sources, 3 passes | p50 | 104.1 µs | 102.1 µs | -1.9% |
| 1,382 corpus sources | p95 | 549.8 µs | 549.1 µs | -0.1% |
| | `hdw_add_dict` (engine start and Jitendex) | 71.0 ms | 68.8 ms | -3.1% |
| | first `hdw_lookup` after start | 6.2 ms | 8.4 ms | +2.2 ms |
| | live heap after loading and the lookups | 97,266,616 B | 97,327,376 B | +60,760 B |

The first lookup pays V8's lazy compilation of the lookup path, which is new
code.

## Built-in pack load in Chrome

Headless Chrome 152 (Chrome for Testing 152.0.7977.75), a page that
instantiates the single-thread engine and times `Deinflector d;` once: the
load of the built-in Japanese pack (inflate the embedded JSON, parse
`language.json` and `transforms.json`, build the tries), including V8's
lazy compilation of every function that load runs. For 35e2dab the same
timer covers its `Deinflector()`, which builds the same rules in C++. A
fresh profile per run, the two engines interleaved.

| | 35e2dab | 33c422d |
| --- | ---: | ---: |
| Default flags, 20 runs: median | 6.50 ms | 9.85 ms |
| p25-p75 | 6.4-6.6 ms | 9.8-10.0 ms |
| min-max | 6.2-8.7 ms | 6.8-10.2 ms |
| `--no-wasm-lazy-compilation`, 10 runs: median (execution only) | 0.45 ms | 3.20 ms |

Section 13's budget, under 10 ms for the built-in pack load, is met by the
median (9.85 ms) with little margin. Most of the time is V8 compiling the
functions the load runs on their first call: 225 functions for the load and
the first deinflection (35 for 35e2dab, one of them 176 KB); execution alone
is 3.2 ms. In Node 22 the same load takes 5.9 ms (35e2dab 6.1 ms).

## Japanese pack quality

`hoshidicts-cli eval-language ja <file> --dictionary <Jitendex>`:

| File | Rows | Recall | Negatives passed | False candidates per row | First rank |
| --- | ---: | ---: | ---: | ---: | ---: |
| `tests/yomitan.tsv` | 1,446 | 1.000 | 1.000 | 0.354 | 0.787 |
| `tests/cases.tsv` | 46 | 1.000 | 1.000 | 0.225 | 0.725 |
