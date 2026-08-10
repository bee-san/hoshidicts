# Hoshidicts benchmarks

The benchmark suite exercises the public importer, query, and lookup APIs against real Yomitan dictionaries. It does
not ship dictionary archives; provide the same archive and corpus when comparing commits.

## Build

Always benchmark an optimized build:

```sh
cmake -S . -B build/benchmark -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DHOSHIDICTS_BENCHMARK=ON
cmake --build build/benchmark --target benchmark-import benchmark-lookup
```

Each report records the commit and dirty-worktree state, compiler, platform, build type, timestamp, and hardware thread
count. A warning is printed for non-Release builds.

## Lookup suite

The original command shape remains valid:

```sh
build/benchmark/benchmark-lookup words.csv 20 \
  --term "/path/to/Jitendex"
```

A comprehensive run measures both high-level lookup and exact dictionary query paths, groups the bundled corpus by
workload, randomizes each measured pass deterministically, and repeats the run for every 1..N term-dictionary prefix:

```sh
build/benchmark/benchmark-lookup benchmark/corpora/japanese.csv 20 \
  --operation both \
  --warmup 3 \
  --open-iterations 5 \
  --shuffle \
  --seed 42 \
  --scale-dictionaries \
  --term "/path/to/Jitendex" "/path/to/JMnedict" \
  --freq "/path/to/frequency-dictionary" \
  --pitch "/path/to/pitch-dictionary" \
  --json lookup-results.json
```

The report includes:

- dictionary-open p50/p95, measured separately from requests;
- deinflector initialization and the first request after setup;
- steady-state mean, p50, p90, p95, p99, standard deviation, min, and max;
- operations per second, hit rate, returned result count, and a result checksum;
- per-label distributions when the corpus has an `input,label` header;
- direct `DictionaryQuery::query` and full `Lookup::lookup` scenarios;
- one scenario per term-dictionary prefix with `--scale-dictionaries`.

`--max-results` and `--scan-length` default to the library defaults of 16. The input may be plain text or CSV. The first
column is always used as input. A second column is grouped only when its header is `label`, `scenario`, or `category`,
so existing word-list CSV files keep working unchanged.

## Import suite

The original command also remains valid:

```sh
build/benchmark/benchmark-import dictionary.zip 5
```

Run both importer strategies and record memory:

```sh
build/benchmark/benchmark-import dictionary.zip 5 \
  --archive another-dictionary.zip \
  --mode both \
  --warmup 1 \
  --measure-memory \
  --json import-results.json
```

Each sample gets a unique output directory. Cleanup and output-size traversal happen outside the measured interval.
Outputs are deleted by default. Use `--output-dir <parent> --keep-output` to retain every measured import for inspection.

The report includes duration distributions, imports per second, input MiB/s, archive size, generated size and expansion
ratio, term/metadata/kanji/media counts, and optional resident-set-size distributions. `--measure-memory` polls process
RSS every millisecond; leave it off for the cleanest timing run.

For the most defensible normal versus low-RAM memory comparison, run each mode in a separate process. Allocator state is
process-wide, so `--mode both` is convenient for timing but later samples can inherit retained allocator pages:

```sh
build/benchmark/benchmark-import dictionary.zip 5 --mode normal --measure-memory --json normal.json
build/benchmark/benchmark-import dictionary.zip 5 --mode low-ram --measure-memory --json low-ram.json
```

## JSON reports

Pass `--json <path>` to keep the human report on stdout and write structured results to a file. Pass `--json -` for
JSON-only stdout. Reports currently use `schema_version: 1`; benchmark and configuration fields make scenario matching
explicit.

Useful comparison fields include:

```sh
jq '.scenarios[] | {name, p50: .latency_ms.p50, p95: .latency_ms.p95}' lookup-results.json
jq '.cases[] | {archive, mode, mean: .duration_ms.mean, peak_rss: .peak_rss_bytes.p50}' import-results.json
```

## Measurement guidance

- Use the same compiler, flags, dictionary revisions, corpus, and benchmark arguments for both commits.
- Close CPU- and I/O-heavy applications and use a stable performance governor when possible.
- Prefer at least three warmup passes and enough measured passes to bring p95/p99 noise under control.
- Treat the first-operation field as first use after constructing Hoshidicts objects, not as a guaranteed cold-disk
  result. The suite does not evict the operating system page cache.
- Compare distributions and mechanism, not a single minimum. Import benchmarks are especially sensitive to filesystem
  cache, CPU frequency, and background I/O.
