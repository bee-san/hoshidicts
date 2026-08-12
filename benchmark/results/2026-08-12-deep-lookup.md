# Deep lookup optimization experiments: 2026-08-12

## Method

All comparisons used GCC 14.2.1 Release builds with `-O3 -DNDEBUG -march=native` on an Intel Xeon Platinum 8488C. Processes were pinned to CPU 2. Candidate/reference order alternated between fresh processes. Each process used three warm-up passes, deterministic corpus shuffling, and the same imported dictionaries. Checksums, hit counts, and result counts had to match before timing was accepted.

The main text-processing comparison used nine paired processes per workload. Corpora and their hashes are documented in the 2026-08-10 report.

## Profiling

`perf` and `gprof` agreed on the dominant steady-state costs:

- hit-heavy query: Zstd frame decoding was about 45% of sampled time;
- mixed lookup: Zstd decode was about 24%, text preprocessing about 13%, query assembly about 6%, and hash probing about 3%;
- sentence lookup: preprocessing was about 23% and deinflection about 20%;
- misses: preprocessing was about 28%, deinflection about 20%, and hash probing about 5%.

This motivated one storage optimization (trained Zstd dictionaries) and one allocation/container optimization (vector-backed preprocessing variants).

## Accepted changes

### Trained per-dictionary Zstd glossary blocks

Large imports train a 64 KiB dictionary from 10,000 unique glossary samples and store it as format v4. Existing formats v1-v3 remain readable; small inputs continue to use ordinary frames.

A disjoint 90,000-block Jitendex test reduced decode time from 2.897 us/block to 0.631 us/block (4.59x faster), while compressed output fell from 34.45 MiB to 11.16 MiB. On the integrated binary and 2,000 Jitendex hits, v4 versus the prior v3 artifact measured:

| Operation | v3 mean | trained-v4 mean | Reduction |
| --- | ---: | ---: | ---: |
| lookup | 56.92 us | 37.64 us | 33.9% |
| query | 3.94 us | 1.36 us | 65.5% |

This is a format-level comparison, so it includes both the smaller frames and the trained decoder.

### Vector-backed text variants

The preprocessor now uses reserved vectors and linear duplicate detection instead of repeatedly allocating red-black-tree nodes. Variant counts are small, so contiguous scans beat logarithmic node traversal. Option zero avoids an unnecessary callback, transformation output strings reserve their known capacity, and final ordering is restored before returning.

Nine paired-process medians:

| Workload | Reduction |
| --- | ---: |
| Jitendex hits | 5.24% |
| JMnedict hits | 10.00% |
| Japanese misses | 15.89% |
| Mixed two-dictionary | 6.26% |
| Sentence, scan 16 | 11.03% |
| Sentence, scan 32 | 10.79% |

All pairs had identical checksums, hits, and result counts.

## Rejected changes

- **Remove Bloom filter:** improved JMnedict hit-only queries by 11.1% and Jitendex by 1.7%, but made misses 115.1% slower and mixed queries 4.6% slower. Rejected.
- **Replace probe-loop modulo with a wrap branch:** neutral to slightly slower in eleven paired processes (mixed +1.6%). Rejected.
- **Power-of-two hash table:** a microbenchmark showed faster hit probes, but requires a larger, incompatible on-disk table and hash probing was only 3-5% of end-to-end profiles. The expected whole-request gain was too small relative to migration and disk cost. Rejected.
- **Minimal perfect hashing / sorted hashes / Swiss controls:** each requires a new format or extra verification data. Existing historical MPHF code also cannot prove absence without checking the key stored in the blob. Given the profile ceiling and the Bloom filter's strong miss behavior, these were not competitive with compression and preprocessing changes.

## Validation

- Release build with GCC 14 passed.
- Glossary codec round-trip and training test passed.
- Importer format test passed against both the tiny fixture and a real Jitendex archive.
- Comprehensive lookup reports accepted formats v1-v4 and produced matching semantic checksums.
