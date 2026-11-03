#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Splits the sample of build-corpus.py into tests/corpus.tsv (the rows the
pack's rules reach) and tests/gaps.tsv (the others). Not run by any test.

    python3 split-corpus.py <sample.tsv> <hoshidicts-cli> [languages dir]

A row is reached when its term is among the deinflections of one of the
source's preprocessed variants, with conditions compatible with its rule
column, every optional processor and transform on: what the conformance test
checks (docs/languages.md 12.1).
"""
import json
import os
import subprocess
import sys

sample, cli = sys.argv[1], sys.argv[2]
languages = sys.argv[3] if len(sys.argv) > 3 else None
here = os.path.dirname(os.path.abspath(__file__))
tests = os.path.join(here, '..', 'tests')
base = [cli] + (['--languages', languages] if languages else [])

rows = []
for line in open(sample, encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    rows.append(line.rstrip('\n').split('\t'))

pack = json.load(open(os.path.join(here, '..', 'transforms.json'), encoding='utf-8'))
conds = pack['conditions']


def bits(name):
    c = conds[name]
    return set(c.get('subConditions') or [name])


srcs = sorted(set(r[2] for r in rows))
out = subprocess.run(base + ['preprocess', 'grc', '--stdin', '--all-options'], input='\n'.join(srcs) + '\n',
                     capture_output=True, text=True, check=True).stdout
variants = {}
for line in out.splitlines():
    d = json.loads(line)
    variants[d['input']] = [v['text'] for v in d['variants']]
allv = sorted(set(v for vs in variants.values() for v in vs))
results = {}
proc = subprocess.Popen(base + ['deinflect', 'grc', '--stdin', '--all-options'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
stdout, _ = proc.communicate('\n'.join(allv) + '\n')
for line in stdout.splitlines():
    d = json.loads(line)
    results[d['input']] = [(r['text'], set(r['conditions'])) for r in d['results']]

reached, gaps = [], []
for r in rows:
    cat, valid, src, term, rule, reasons = r
    wanted = None if rule == '*' else bits(rule)
    hit = any(t == term and (not wanted or not c or c & wanted) for v in variants.get(src, []) for t, c in results.get(v, []))
    (reached if hit else gaps).append(r)

header = ('# Source: {n} pairs sampled with seed 1 by sources/build-corpus.py from UniMorph grc (CC BY-SA 3.0, the UniMorph\n'
          '# contributors, from English Wiktionary) and the Perseus Ancient Greek Dependency Treebank 2.1 (CC BY-SA 3.0 US,\n'
          '# the Perseus Digital Library, Tufts University); README.md has the revisions. {what}\n'
          '# category\tvalid\tsource\tterm\trule\treasons\n')
with open(os.path.join(tests, 'corpus.tsv'), 'w', encoding='utf-8') as f:
    f.write(header.format(n=len(rows), what=f'The {len(reached)} rows the rules reach; the others are in gaps.tsv.'))
    for r in reached:
        f.write('\t'.join(r) + '\n')
with open(os.path.join(tests, 'gaps.tsv'), 'w', encoding='utf-8') as f:
    f.write(header.format(n=len(rows), what=f'The {len(gaps)} rows the rules do not reach (README.md, "Known gaps").'))
    for r in gaps:
        f.write('\t'.join(r) + '\n')
print(f'{len(reached)} reached, {len(gaps)} gaps', file=sys.stderr)
