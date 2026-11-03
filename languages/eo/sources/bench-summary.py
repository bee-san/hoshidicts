#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""p50 and p95 of benchmark-lookup --json output, in microseconds, with the
first pass dropped (README.md, Measurements). Not run by any test.

    python3 bench-summary.py <benchmark.json>...
"""
import json
import sys


def percentile(values, p):
    values = sorted(values)
    k = (len(values) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)


for path in sys.argv[1:]:
    data = json.load(open(path))
    times = [t for p in data['passes'][1:] for t in p]   # milliseconds per lookup
    print(f"{path}: {data['words']} texts, {len(data['passes']) - 1} passes: "
          f"p50 {percentile(times, 0.5) * 1000:.1f} µs, p95 {percentile(times, 0.95) * 1000:.1f} µs")
