# Performance experiments: 2026-08-10

## Scope

This report compares the benchmark-only baseline at `3f7295e` with the lookup
optimizations at `dd48d75` and the final import policy at `e628ba5`.

- Code-only lookup comparisons use the same level-3 dictionary files for both
  binaries.
- End-to-end comparisons use level-3 files with the baseline and level `-1`
  files with the final binary.
- Import comparisons change only the Zstd level used for per-glossary frames.

## Environment

- GCC 14.2.1, Release, `-O3 -DNDEBUG`
- Linux 6.12, x86-64
- Intel Xeon Platinum 8488C, 8 cores / 16 hardware threads
- Lookup processes pinned to CPU 2; process order alternated every sample
- Seven independent process samples per primary comparison
- Import processes were not pinned because normal mode imports concurrently
- OS page cache was warm; caches were not forcibly evicted

An independent replication on CPU 6 produced a 33.7% mixed-lookup reduction
and a 56.2% mixed-query reduction, close to CPU 2's 36.2% and 57.1%.

## Corpora

Dictionary expressions were parsed from the Yomitan term-bank JSON, filtered
to 1-12 characters, sorted, deduplicated, and sampled at even intervals.

| Corpus | Entries | SHA-256 |
| --- | ---: | --- |
| Jitendex hits | 2,000 | `ba8a6d729c4a0067967cca3146d2689164f12e4a57fcdf02450baab59c399c13` |
| JMnedict hits | 2,000 | `b9caf287c443cc0edbfed626113f257340d07fd169a5c0de07d151cce2fc18b3` |
| Japanese-shaped misses | 2,000 | `7118eb3f2993d5930305fc252d234d8d7af7033e451e5379c88638e50eeba3ad` |
| Sentence prefix hits | 1,000 | `ff4b17939dd1de8412c26b0775b7136dad7224ea870c0cf21ae7f4d5091ee60f` |
| Mixed two-dictionary | 3,000 | `5c5e44bb439705ba96b79de31fe4c42f1b7155a27213060bc12066e8585bbc38` |

## Lookup results

These results isolate decompression-context and text-processor reuse by using
identical level-3 dictionary files.

| Workload | Operation | Mean baseline | Mean optimized | Reduction | P95 reduction |
| --- | --- | ---: | ---: | ---: | ---: |
| Jitendex hits | lookup | 0.08737 ms | 0.06166 ms | 29.4% | 25.3% |
| Jitendex hits | query | 0.00731 ms | 0.00401 ms | 45.1% | 38.6% |
| JMnedict hits | lookup | 0.02704 ms | 0.01024 ms | 62.1% | 42.8% |
| JMnedict hits | query | 0.00365 ms | 0.00042 ms | 88.4% | 90.1% |
| Misses | lookup | 0.01757 ms | 0.01573 ms | 10.5% | 7.4% |
| Misses | query | 0.000066 ms | 0.000065 ms | 1.1% | 0.5% |
| Sentence, scan 8 | lookup | 0.11302 ms | 0.08765 ms | 22.4% | 24.0% |
| Sentence, scan 32 | lookup | 0.22900 ms | 0.20316 ms | 11.3% | 10.7% |
| Mixed, two dictionaries | lookup | 0.06579 ms | 0.04201 ms | 36.2% | 30.9% |
| Mixed, two dictionaries | query | 0.00409 ms | 0.00175 ms | 57.1% | 43.0% |

Miss-only queries are intentionally neutral: they perform no glossary
decompression. Miss-only lookups still improve because they exercise the
reused preprocessing pipeline.

The lookup gain increases with materialized result count:

| `max-results` | Mean reduction |
| ---: | ---: |
| 1 | 22.7% |
| 16 | 29.4% |
| 64 | 32.3% |

## Compression sweep

Jitendex import results:

| Zstd level | Normal mean | Low-RAM mean | Output bytes |
| ---: | ---: | ---: | ---: |
| 3 (default) | 465.6 ms | 1902.0 ms | 193,731,069 |
| 2 | 450.5 ms | 1840.6 ms | 198,145,915 |
| 1 | 438.3 ms | 1798.4 ms | 197,462,913 |
| -1 | 333.8 ms | 1215.0 ms | 216,988,050 |
| -3 | 323.2 ms | 1168.7 ms | 228,851,476 |
| -5 | 324.0 ms | 1147.6 ms | 240,434,674 |

Level 2 is dominated by level 1: it is slower and larger for these many small
frames. Level `-1` is the speed/size knee. Levels `-3` and `-5` add 11.3 MiB
and 22.4 MiB over `-1` for little additional lookup improvement.

Jitendex lookup using the optimized binary:

| Zstd level | Lookup mean | Query mean |
| ---: | ---: | ---: |
| 1 | 0.06043 ms | 0.00373 ms |
| -1 | 0.04368 ms | 0.00156 ms |
| -3 | 0.04348 ms | 0.00151 ms |
| -5 | 0.04236 ms | 0.00144 ms |

JMnedict is less compression-sensitive because its glossaries are short.
Level `-1` improved normal import by 2.6%, low-RAM import by 3.5%, and lookup
by about 3%. KANJIDIC contains no term glossaries and remained neutral.

## Final end-to-end result

On the mixed two-dictionary corpus, combining the lookup changes with level
`-1` dictionaries produced:

| Operation | Baseline | Final | Reduction |
| --- | ---: | ---: | ---: |
| Lookup mean | 0.06579 ms | 0.03230 ms | 50.9% |
| Lookup p95 | 0.20853 ms | 0.10719 ms | 48.6% |
| Query mean | 0.00409 ms | 0.00088 ms | 78.5% |

Jitendex output grows by 22.18 MiB (12.0%) versus default compression.
Median peak RSS stayed effectively unchanged: low-RAM import moved from
117.8 MB to 118.1 MB, while normal import decreased from 230.2 MB to 222.2 MB.

## Validation

- Every paired lookup/query run had identical checksums, hits, and result counts.
- Default-, level-1-, and negative-level dictionaries were mutually readable.
- Normal and low-RAM imports produced identical dictionary counts and sizes.
- Release, strict-warning, and ASan import/lookup runs passed.
- Leak detection remained enabled for lookup and was clean.
- Import leak checking still reports the pre-existing worker-thread
  `libdeflate` allocation in `src/zip/zip.cpp`.
- Clang 15 cross-compilation was unavailable because the host's libstdc++ 11
  lacks the required C++23 library and Clang crashes in vendored Glaze.
