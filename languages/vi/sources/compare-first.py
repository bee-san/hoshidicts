#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Compares the first results of two lookup-batch runs over the same hovers.
Not run by any test.

    python3 compare-first.py <words.txt> <a.jsonl> <b.jsonl> [examples]

A first result is the first result whose glossaries are not all form-of
rows (what a popup shows first). Prints how many hovers have a first result
in each run, how many differ, and the differences grouped by what the b run's
first result used: the transform ids of its trace (or "-" for none) and
whether its matched text is longer than a's.
"""
import collections
import json
import sys


def first(results):
    for r in results:
        if not r['formOf']:
            return r
    return None


def main(words_path, a_path, b_path, examples=8):
    examples = int(examples)
    words = [w.rstrip('\n') for w in open(words_path, encoding='utf-8')]
    groups = collections.defaultdict(list)
    found_a = found_b = same = 0
    with open(a_path, encoding='utf-8') as fa, open(b_path, encoding='utf-8') as fb:
        for word, la, lb in zip(words, fa, fb):
            ra, rb = json.loads(la), json.loads(lb)
            a, b = first(ra['results']), first(rb['results'])
            found_a += a is not None
            found_b += b is not None
            key_a = (a['expression'], a['matched']) if a else None
            key_b = (b['expression'], b['matched']) if b else None
            if key_a == key_b:
                same += 1
                continue
            trace = '|'.join(b['trace']) if b and b['trace'] else '-'
            longer = b is not None and (a is None or len(b['matched']) > len(a['matched']))
            groups[(trace, 'longer' if longer else 'not longer')].append((ra['text'], key_a, key_b))
    total = len(words)
    print(f'hovers {total}; first result: a {found_a}, b {found_b}; same {same}; differ {total - same}')
    for (trace, longer), items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        print(f'{len(items):6d}  {trace}  ({longer})')
        for text, ka, kb in items[:examples]:
            print(f'          {text[:40]!r}: {ka} -> {kb}')


if __name__ == '__main__':
    main(*sys.argv[1:])
