#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Pronominal readings after me, te, m' and t' (README.md, Measurements). Not run by any test.

    python3 pronominal.py <hover.txt> <lookups.jsonl> <dictionary zip> [--index <cache.json>] [--out <prefix>]

For the hovers that start with me, te, m' or t' and a word (from
tatoeba-hovers.py), the first result with a definition is a pronominal
reading when its expression starts with se, s' or s'en and it matches more
than the pronoun. It agrees when the dictionary's form-of rows of the word
after the pronoun (or of the matched text) name the verb without se with a
first-person singular tag (alone or as in first/second-person singular)
for me and m', second-person singular for te and t', or the infinitive (je
vais me lever, m'en aller); it disagrees otherwise (il me dit -> se dire). Prints the counts and writes <prefix>-disagree.tsv.
"""
import argparse, collections, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dictindex import build

ap = argparse.ArgumentParser()
ap.add_argument('hover'); ap.add_argument('lookups'); ap.add_argument('zip')
ap.add_argument('--index'); ap.add_argument('--out', default='pronominal')
a = ap.parse_args()
idx = build(a.zip, a.index or a.zip + '.index.json')
START = re.compile(r"^(me|te|m'|t'|m\u2019|t\u2019)\s?(?:en )?([A-Za-z\u00C0-\u024F]+)", re.I)
PERSONS = re.compile(r'((?:first|second|third)(?:/(?:first|second|third))*)-person singular')
REFLEXIVE = re.compile(r"^(?:s'en |se |s')")
counts = collections.Counter()
bad = []
with open(a.lookups, encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        m = START.match(d['text'])
        if not m:
            continue
        counts['positions'] += 1
        first = next((r for r in d['results'] if not r['formOf']), None)
        if first is None or not REFLEXIVE.match(first['expression'].replace('\u2019', "'")) or len(first['matched']) <= len(m.group(1)):
            continue
        counts['pronominal first'] += 1
        pronoun, word = m.group(1).lower().replace('\u2019', "'"), m.group(2).lower()
        person = 'first' if pronoun[0] == 'm' else 'second'
        base = REFLEXIVE.sub('', first['expression'].replace('\u2019', "'"))
        ok = False
        for text in (word, first['matched'].lower().replace('\u2019', "'")):
            for target, _, tags in (idx.get(text) or {'ref': []})['ref']:
                t = ' '.join(tags)
                persons = {x for m2 in PERSONS.finditer(t) for x in m2.group(1).split('/')}
                if REFLEXIVE.sub('', target) == base and (person in persons or 'infinitive' in t):
                    ok = True
        if word == base or base.endswith(' ' + word) or base == 'en ' + word:
            ok = True
        counts['agrees' if ok else 'disagrees'] += 1
        if not ok:
            bad.append((d['text'][:60], first['matched'], first['expression'], '|'.join(first['trace'])))
with open(f'{a.out}-disagree.tsv', 'w', encoding='utf-8') as f:
    f.write('# text\tmatched\tfirst result\ttrace\n')
    for r in bad:
        f.write('\t'.join(r) + '\n')
print(json.dumps(counts))
