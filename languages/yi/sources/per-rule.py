#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Summarises `hoshidicts-cli eval-language --per-rule` output by rule source.

    python3 languages/yi/sources/per-rule.py <rules.json> <eval.json> [--list N]

Prints, for the rules of each source (own, yomitan, both) in <rules.json>,
how many rows only they recover, the false candidates only they add and
the negatives they break, and lists the N rules with the most false
candidates.
"""

import json
import sys


def main():
    args = sys.argv[1:]
    show = 0
    if '--list' in args:
        i = args.index('--list')
        show = int(args[i + 1])
        del args[i:i + 2]
    rules_file, eval_file = args
    with open(rules_file, encoding='utf-8') as f:
        rules = json.load(f)
    with open(eval_file, encoding='utf-8') as f:
        result = json.load(f)
    source = {}
    for t in rules['transforms']:
        for i, r in enumerate(t['rules']):
            source[(t['id'], i)] = (r.get('source', t.get('source', 'own')), r)
    totals = {}
    for entry in result['perRule']:
        s, _ = source[(entry['transform'], entry['rule'])]
        acc = totals.setdefault(s, {'rules': 0, 'recovers': 0, 'falseCandidates': 0, 'breaks': 0})
        acc['rules'] += 1
        for key in ('recovers', 'falseCandidates', 'breaks'):
            acc[key] += entry[key]
    print(json.dumps({k: v for k, v in result.items() if k != 'perRule'}, ensure_ascii=False))
    for s, acc in sorted(totals.items()):
        print(s, json.dumps(acc))
    ranked = sorted(result['perRule'], key=lambda e: (-e['falseCandidates'] - e['breaks'], e['transform'], e['rule']))
    for entry in ranked[:show]:
        s, r = source[(entry['transform'], entry['rule'])]
        brief = {k: v for k, v in r.items() if k in ('type', 'inflected', 'deinflected', 'stemChange', 'pattern')}
        print(f"  {entry['transform']}[{entry['rule']}] {s} recovers {entry['recovers']} fc {entry['falseCandidates']} "
              f"breaks {entry['breaks']} {json.dumps(brief, ensure_ascii=False)}")


if __name__ == '__main__':
    main()
