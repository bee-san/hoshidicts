#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The first audit's hand-judged readings (verdict, old first result,
matched text, sentence), looked up again (README.md). Not run by any test.

    python3 rejudge.py <judged.tsv> <pack dir> <lookup-batch> <dictionary>
"""
import collections, json, subprocess, sys
judged, pack, lookup, dictionary = sys.argv[1:5]
rows = [l.rstrip('\n').split('\t') for l in open(judged, encoding='utf-8') if not l.startswith('#')]
texts = []
for _, _, m, s in rows:
    s, m = s.replace('\u2019', "'"), m.replace('\u2019', "'")
    i = s.lower().find(m.lower())
    texts.append(s[i:] if i >= 0 else m)
out = subprocess.run([lookup, pack, 'fr', dictionary], input='\n'.join(texts) + '\n',
                     capture_output=True, text=True, check=True).stdout.splitlines()
counts = collections.Counter()
print('# verdict\told first result\tmatched\tnew first result')
for (verdict, first, matched, _), line in zip(rows, out):
    new = next((r['expression'] for r in json.loads(line)['results'] if not r['formOf']), '-')
    counts[f"{verdict}, {'same' if new == first else 'changed'}"] += 1
    print('\t'.join((verdict, first, matched, new)))
print(json.dumps(dict(sorted(counts.items()))))
