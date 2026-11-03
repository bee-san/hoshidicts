#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The rule-changed sample of README.md (Measurements, real text). Not run by any test.

    python3 languages/de/sources/changed-sample.py <dump dir> <transforms.json> [seed] [size]

<dump dir> holds diff-none-final-<text>.tsv, written by
`measure.mjs diff <inputs> <unimorph> <dictionary> <text> none.json final.json --dump <file>`
for tatoeba, pg69327, pg22367 and pg5323 (none.json from sources/variants.mjs).
Counts the positions where the first result with a definition for the
hovered word itself is another lemma with the pack's rules than with none,
through a rule of the pack, and draws a random sample of them;
sources/changed-judged.tsv has the verdicts for the default seed 4 and size
80.
"""
import json
import random
import re
import sys

dump_dir, transforms = sys.argv[1], sys.argv[2]
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 4
size = int(sys.argv[4]) if len(sys.argv) > 4 else 80
ids = {t['id'] for t in json.load(open(transforms, encoding='utf-8'))['transforms']}
result = re.compile(r'^(.*) \((.*)\) \[(.*)\]$')
changed = []
for text in ('tatoeba', 'pg69327', 'pg22367', 'pg5323'):
    with open(f'{dump_dir}/diff-none-final-{text}.tsv', encoding='utf-8') as f:
        for line in f:
            cells = line.rstrip('\n').split('\t')
            if len(cells) != 5:
                continue
            name, word, before, after, hover = cells
            a, b = result.match(before), result.match(after)
            if a is None or b is None:
                continue
            if a.group(2).lower() != word.lower() or b.group(2).lower() != word.lower() or a.group(1) == b.group(1):
                continue
            if not any(step in ids for step in b.group(3).split(',')):
                continue
            changed.append([name, word, a.group(1), b.group(1), b.group(3), hover[:99]])
print(f'{len(changed)} positions where a rule of the pack changes the first lemma of the hovered word', file=sys.stderr)
random.seed(seed)
for i, row in enumerate(random.sample(changed, min(size, len(changed))), 1):
    print('\t'.join([str(i)] + row))
