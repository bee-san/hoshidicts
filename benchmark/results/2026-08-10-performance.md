# Performance experiments: 2026-08-10

## Scope

This report compares the benchmark-only baseline at `3f7295e` with the lookup
optimizations at `dd48d75`, the compression policy at `e628ba5`, and the
import-worker policy at `7d21c18`.

- Code-only lookup comparisons use the same level-3 dictionary files for both
  binaries.
- End-to-end comparisons use level-3 files with the baseline and level `-1`
  files with the final binary.
- The compression sweep changes only the Zstd level used for per-glossary
  frames; the worker sweep changes only the concurrent bank-task cap.

## Environment

- GCC 14.2.1, Release, `-O3 -DNDEBUG`
- Linux 6.12, x86-64
- Intel Xeon Platinum 8488C, 8 cores / 16 hardware threads
- Lookup processes pinned to CPU 2; process order alternated every sample
- Seven independent process samples per primary comparison
- Concurrent workers pinned to separate physical cores through 8 workers and
  to all logical CPUs at 16 workers
- Fifty fresh processes per startup-latency case
- Import processes were not pinned because normal mode imports concurrently
- OS page cache was warm; caches were not forcibly evicted

An independent replication on CPU 6 produced a 33.7% mixed-lookup reduction
and a 56.2% mixed-query reduction, close to CPU 2's 36.2% and 57.1%.

The additional experiments produced 922 JSON reports under
`/tmp/hd-extra-bench`. They use the same binaries, dictionaries, and corpora
as the primary comparisons unless a section says otherwise.

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

## Concurrent lookup scaling

Each worker was a separate pinned process with its own query objects and
memory mappings. Wall throughput includes process setup, one first operation,
three warmup passes, and twenty measured passes over the 3,000-entry mixed
corpus. Each tier has seven independent samples.

| Workers | Baseline median | Final median | Final gain | Baseline scaling | Final scaling |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 15,697 ops/s | 30,319 ops/s | 93.2% | 1.00x | 1.00x |
| 2 | 31,479 ops/s | 61,001 ops/s | 93.8% | 2.01x | 2.01x |
| 4 | 62,633 ops/s | 120,850 ops/s | 92.9% | 3.99x | 3.99x |
| 8 | 124,129 ops/s | 239,743 ops/s | 93.1% | 7.91x | 7.91x |
| 16 | 169,602 ops/s | 296,061 ops/s | 74.6% | 10.80x | 9.76x |

Per-worker p95 remained flat from one through eight physical cores: baseline
was 0.202 ms and final was 0.108 ms at eight workers. Using both hardware
threads per core raised those medians to 0.286 ms and 0.167 ms at 16 workers.
The useful scaling boundary on this host is therefore eight workers; sibling
hyperthreads add 23.5% final throughput, but not another 2x.

All 217 baseline/final worker-process pairs had identical checksums, hits, and
result counts.

## Dictionary-count scaling

This adversarial test opened the same Jitendex directory 1, 2, 4, or 8 times.
That isolates the cost of additional maps, probes, duplicate glossaries, and
decompression. Each point is the mean of seven processes with 10,000 measured
operations per scenario.

| Copies | Baseline lookup | Final lookup | Reduction | Baseline query | Final query | Reduction |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.08703 ms | 0.04346 ms | 50.1% | 0.00722 ms | 0.00155 ms | 78.6% |
| 2 | 0.14181 ms | 0.05892 ms | 58.5% | 0.01374 ms | 0.00263 ms | 80.8% |
| 4 | 0.24942 ms | 0.08682 ms | 65.2% | 0.02655 ms | 0.00467 ms | 82.4% |
| 8 | 0.46129 ms | 0.14434 ms | 68.7% | 0.05270 ms | 0.00894 ms | 83.0% |

Dictionary-open time scales approximately linearly from 0.06 ms for one map
to 0.41 ms for eight and is neutral between builds. The growing request-time
advantage confirms that reusable decompression state matters more as the
number of materialized glossaries rises. All 28 process pairs matched
semantically.

## Fresh-process latency

The code-only case uses the optimized binary with the original level-3
dictionaries. The final case adds level `-1` dictionaries. Values below are
medians from 50 new processes per operation, pinned to CPU 2.

| Metric | Baseline | Code only | Final | Final reduction |
| --- | ---: | ---: | ---: | ---: |
| Two-dictionary open | 0.134 ms | 0.133 ms | 0.134 ms | neutral |
| Deinflector initialization | 0.227 ms | 0.224 ms | 0.230 ms | neutral |
| First lookup | 0.223 ms | 0.198 ms | 0.183 ms | 18.1% |
| First query | 0.0565 ms | 0.0542 ms | 0.0490 ms | 13.3% |
| Full lookup process | 9.491 ms | 8.228 ms | 7.809 ms | 17.7% |
| Full query process | 4.439 ms | 4.328 ms | 4.322 ms | 2.6% |

The full-process rows include executable startup, opening dictionaries, the
first operation, one measured 50-input pass, JSON serialization, and exit.
They are CLI/startup measurements rather than steady-state request latency.
All 200 baseline-to-code-only/final comparisons matched semantically.

## Import worker sweep

Jitendex contains 217 term banks, making it sensitive to the importer task
window. A broad sweep used three processes with three measured imports each:

| Worker cap | Mean import |
| ---: | ---: |
| 1 | 2270.6 ms |
| 2 | 1194.4 ms |
| 4 | 645.2 ms |
| 8 | 405.2 ms |
| 12 | 357.2 ms |
| 16 | 311.2 ms |
| 20, previous default | 317.3 ms |
| 24 | 319.0 ms |
| 32 | 324.7 ms |

A focused randomized comparison used seven processes and three measured
imports per process. Capping normal mode at the host's 16 hardware threads
instead of `hardware_concurrency() + 4` improved Jitendex by 0.8% (310.3 ms
versus 312.9 ms) and JMnedict by 0.4% (182.1 ms versus 182.9 ms). Six of seven
paired Jitendex rounds favored 16 workers.

Seven single-import RSS processes showed a larger resource win: median peak
RSS fell from 206.76 MiB at 20 workers to 194.18 MiB at 16 workers, a 6.1%
reduction. Low-RAM mode remains capped at two workers. Dropping it to one
worker saved only 7.24 MiB while making Jitendex 88.7% slower.

Commit `7d21c18` therefore removes the four-worker oversubscription only from
normal mode. Post-change seven-sample confirmation:

| Dictionary | Normal mean | Low-RAM mean | Output |
| --- | ---: | ---: | ---: |
| Jitendex | 308.9 ms | 1193.9 ms | 206.94 MiB |
| JMnedict | 183.3 ms | 353.2 ms | 72.42 MiB |
| KANJIDIC | 66.1 ms | 65.7 ms | 2.94 MiB |

## Validation

- Every paired lookup/query run had identical checksums, hits, and result counts.
- Concurrent, repeated-dictionary, and fresh-process comparisons also had no
  checksum, hit, or result-count mismatches.
- Default-, level-1-, and negative-level dictionaries were mutually readable.
- Normal and low-RAM imports produced identical dictionary counts and sizes.
- Post-change Jitendex normal and low-RAM `blobs.bin`, hash, bloom, and media
  files had identical SHA-256 checksums.
- Release, strict-warning, and ASan import/lookup runs passed after the worker
  policy change.
- Leak detection remained enabled for lookup and was clean.
- Import leak checking still reports the pre-existing worker-thread
  `libdeflate` allocation in `src/zip/zip.cpp`.
- Clang 15 cross-compilation was unavailable because the host's libstdc++ 11
  lacks the required C++23 library and Clang crashes in vendored Glaze.
