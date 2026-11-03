#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Words whose first result the kept Yomitan rules change (README.md, Rule provenance). Not run by any test.

    python3 displaced.py <own languages dir> <final languages dir> <lookup-batch> <words file>... --dictionary <dir> [--dictionary <dir>]

Looks every word of the files (one per line, or the source column of a
deinflection TSV) up whole (16 results, scan length 64) with the own rules
and with the final rules, and prints the words whose first result with a
definition differs: one line per word and dictionary (dictionary, word, own
first, final first), then the totals, and how many of them the own rules
give no result with a definition for.
"""
import argparse, json, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('own'); ap.add_argument('final'); ap.add_argument('lookup'); ap.add_argument('files', nargs='+')
ap.add_argument('--dictionary', action='append', required=True)
a = ap.parse_args()
words = set()
for path in a.files:
    for line in open(path, encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        p = line.rstrip('\n').split('\t')
        w = p[2] if len(p) >= 4 else p[0].rsplit(' ', 1)[0] if ' ' in p[0] and p[0].rsplit(' ', 1)[1].isdigit() else p[0]
        words.add(w)
words = sorted(words)


def first(languages, d):
    p = subprocess.run([a.lookup, languages, 'fr', d, '16', '64'], input='\n'.join(words) + '\n', capture_output=True, text=True)
    out = {}
    for line in p.stdout.splitlines():
        r = json.loads(line)
        out[r['text']] = next((x for x in r['results'] if not x['formOf']), None)
    return out


total = own_none = 0
for d in a.dictionary:
    o, f = first(a.own, d), first(a.final, d)
    for w in words:
        x, y = o.get(w), f.get(w)
        if (x and x['expression']) == (y and y['expression']):
            continue
        total += 1
        own_none += x is None
        print(f"{d.rsplit('/', 1)[-1]}\t{w}\t{x and x['expression']}[{x and '|'.join(x['trace'])}]\t{y and y['expression']}[{y and '|'.join(y['trace'])}]")
print(f'# {len(words)} words, {total} first results differ, {own_none} of them where the own rules give no result')
