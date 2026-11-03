#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The seeded random sample of README.md (Measurements 4) for a hand
judgement of all first results, not only those that differ. Not run by any
test.

    python3 sample-firsts.py <lookup-batch-vi output> <count> <seed>

Prints `count` hovers drawn with `random.Random(seed)` (hovers that start with
an ASCII character that is not a letter are skipped), with the first result
that has a definition. sample-judgements.tsv has the judgements of the
README's samples (count 50, seed 7, both texts).
"""
import json
import random
import sys


def main(path, count, seed):
    lines = open(path, encoding='utf-8').readlines()
    order = list(range(len(lines)))
    random.Random(int(seed)).shuffle(order)
    printed = 0
    for i in order:
        d = json.loads(lines[i])
        if d['text'][0].isascii() and not d['text'][0].isalpha():
            continue
        first = next((r for r in d['results'] if not r['formOf']), None)
        print(f"{i}\t{first['expression'] if first else ''}\t{first['matched'] if first else ''}")
        printed += 1
        if printed == int(count):
            break


if __name__ == '__main__':
    main(*sys.argv[1:])
