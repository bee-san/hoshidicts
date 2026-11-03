#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The by-kind breakdown of README.md (Measurements 1). Not run by any test.

    python3 sample-kinds.py <hoshidicts-cli> <tests dir> <languages dir>...

Sorts the rows of corpus.tsv and gaps.tsv by kind (reduplication, or how the
two spellings of a spelling row differ) and prints, per kind, how many rows
each languages directory's vi pack reaches (a processor variant's
deinflection is the row's lemma, as split-corpus.py decides it).
"""
import collections
import json
import subprocess
import sys
import unicodedata


def strip(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c))


def nfd_letters(text, y_as_i=False):
    decomposed = unicodedata.normalize('NFD', text)
    return sorted(decomposed.replace('y', 'i').replace('Y', 'I') if y_as_i else decomposed)


def kind(row):
    if row[0] == 'reduplication':
        return 'reduplication'
    a, b = row[2], row[3]
    if a.replace('-', ' ') == b.replace('-', ' '):
        return 'hyphens'
    if a.lower() == b.lower():
        return 'capitals'
    if strip(a) == strip(b) and len(a) == len(b):
        return 'tone-mark place' if nfd_letters(a) == nfd_letters(b) else 'another tone or vowel mark'
    if nfd_letters(a, True) == nfd_letters(b, True):
        return 'i/y'
    return 'several of these'


def reached(cli, languages, rows):
    def run(command, inputs):
        out = subprocess.run([cli, '--languages', languages, command, 'vi', '--stdin'], input='\n'.join(inputs) + '\n',
                             capture_output=True, text=True, check=True).stdout
        return [json.loads(line) for line in out.splitlines()]
    variants = run('preprocess', [r[2] for r in rows])
    flat = sorted({v['text'] for p in variants for v in p['variants']})
    reach = {d['input']: {r['text'] for r in d['results']} for d in run('deinflect', flat)}
    return [r[3] in set().union(*(reach[v['text']] for v in p['variants'])) for r, p in zip(rows, variants)]


def main(cli, tests, *languages):
    rows = []
    for name in ('corpus.tsv', 'gaps.tsv'):
        rows += [l.rstrip('\n').split('\t') for l in open(f'{tests}/{name}', encoding='utf-8') if l.strip() and not l.startswith('#')]
    results = [reached(cli, l, rows) for l in languages]
    counts = collections.defaultdict(lambda: [0] * (1 + len(languages)))
    for i, row in enumerate(rows):
        c = counts[kind(row)]
        c[0] += 1
        for j, r in enumerate(results):
            c[1 + j] += r[i]
    print('kind\trows\t' + '\t'.join(languages))
    for k, c in sorted(counts.items(), key=lambda kv: -kv[1][0]):
        print(k + '\t' + '\t'.join(str(x) for x in c))


if __name__ == '__main__':
    main(*sys.argv[1:])
