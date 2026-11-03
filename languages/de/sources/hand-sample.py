#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Draws the hand-judged sample of README.md (Measurements, real text). Not run by any test.

    python3 languages/de/sources/hand-sample.py <dump dir> [seed] [size]

<dump dir> holds dump-<text>.tsv as `sources/measure.mjs text ... --dump`
writes them for tatoeba, pg69327, pg22367 and pg5323. The sample is drawn
from the rows of transforms.json (the rule set file name final.json) that
the script leaves unjudged; sources/hand-judged.tsv has the verdicts for the
default seed 3 and size 60.
"""
import random
import sys

dump_dir = sys.argv[1]
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 3
size = int(sys.argv[3]) if len(sys.argv) > 3 else 60
rest = []
for text in ['tatoeba', 'pg69327', 'pg22367', 'pg5323']:
    with open(f'{dump_dir}/dump-{text}.tsv', encoding='utf-8') as f:
        for line in f:
            row = line.rstrip('\n').split('\t')
            if len(row) >= 7 and row[0].endswith('final.json') and row[1] in ('unjudged', 'multiUnjudged'):
                rest.append([text] + row[1:])
random.seed(seed)
print(f'{len(rest)} unjudged positions', file=sys.stderr)
for i, row in enumerate(random.sample(rest, size), 1):
    print('\t'.join([str(i)] + row))
