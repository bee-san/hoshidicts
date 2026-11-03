#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Real-text judgement of README.md (Measurements 4). Not run by any test.

    python3 judge-real.py <yomitan.jsonl> <final.jsonl> <judgements.tsv> [sample size] [seed]

Both files are lookup-batch-vi runs over the same hovers, with Yomitan's
processors alone and with this pack. Every hover whose first result with a
definition differs is judged:

- by script, "spelling": the final result's expression has the letters and
  capitals of the matched text once marks and hyphens are set aside and y is
  read as i (kỷ → kỉ, thủy-thổ → thuỷ thổ): the same word in another
  spelling. A result whose capitals differ (Hồng-bàng → Hồng Bàng, Kinh-đô →
  Kinh Đô, Kyoto) may be a name shown for a common word, so it is judged by
  hand;
- by hand, every hover whose result came through a reduplication rule, and
  the rest (all of them when sample size is at least their number). The hand judgements are in
  <judgements.tsv> (matched text, expression, verdict right|wrong, note),
  written for this pack; a judged pair applies to every hover with it.

Prints the counts per group and the pairs that still need a judgement.
"""
import collections
import json
import random
import sys
import unicodedata

PACK_RULES = {'reduplication', 'partialReduplication'}


def key(text):
    letters = ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c))
    return ' '.join(letters.replace('y', 'i').replace('Y', 'I').replace('-', ' ').split())


def first(results):
    return next((r for r in results if not r['formOf']), None)


def main(yomitan_path, final_path, judgements_path, sample_size='60', seed='1'):
    judged = {}
    for line in open(judgements_path, encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        matched, expression, verdict, *_ = line.rstrip('\n').split('\t')
        judged[(matched, expression)] = verdict
    groups = collections.Counter()
    rest = []
    unjudged = collections.Counter()
    total = 0
    with open(yomitan_path, encoding='utf-8') as fy, open(final_path, encoding='utf-8') as ff:
        for ly, lf in zip(fy, ff):
            total += 1
            y, f = first(json.loads(ly)['results']), first(json.loads(lf)['results'])
            if f is None or (y is not None and (y['expression'], y['matched']) == (f['expression'], f['matched'])):
                if f is None and y is not None:
                    groups['final finds nothing'] += 1
                continue
            pair = (f['matched'], f['expression'])
            if PACK_RULES & set(f['trace']):
                verdict = judged.get(pair)
                groups[f'rule, {verdict or "unjudged"}'] += 1
                if verdict is None:
                    unjudged[pair] += 1
            elif key(f['matched']) == key(f['expression']):
                groups['spelling (script): right'] += 1
            else:
                rest.append(pair)
    random.Random(int(seed)).shuffle(rest)
    sample = rest[:int(sample_size)]
    for pair in sample:
        verdict = judged.get(pair)
        groups[f'other, sampled, {verdict or "unjudged"}'] += 1
        if verdict is None:
            unjudged[pair] += 1
    groups['other, not sampled'] = len(rest) - len(sample)
    print(f'hovers {total}; first result differs from Yomitan\'s processors at {sum(groups.values()) - groups["final finds nothing"]}')
    for name, count in sorted(groups.items()):
        print(f'  {name}: {count}')
    for (matched, expression), count in unjudged.most_common():
        print(f'UNJUDGED\t{matched}\t{expression}\t{count}')


if __name__ == '__main__':
    main(*sys.argv[1:])
