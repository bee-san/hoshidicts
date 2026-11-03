#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""A large form -> lemma file for per-rule measurements (README.md, Rule provenance). Not run by any test.

    python3 universe.py <fra.um4> <fr_50k.txt> <dictionary zip> <out.tsv> [--unimorph 40000] [--frequent 10000] [--index <cache.json>]

Rows, in the corpus format of docs/languages.md 12.2 (reasons *):
- a uniform sample (seed 2) of UniMorph fra.um4 rows of one lowercase word
  that differs from its lemma, agreeing participles given their verb's
  infinitive, the 8 verbs with Old French conditionals left out (as
  build-corpus.mjs does);
- for each of the first --frequent words of the frequency list, one row per
  lemma that the word's form-of rows in the dictionary name (two references
  deep), with the part of speech of the naming row (v, n, adj, or * when it
  has none).
"""
import argparse, json, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dictindex import build

ap = argparse.ArgumentParser()
ap.add_argument('um4'); ap.add_argument('frequency'); ap.add_argument('zip'); ap.add_argument('out')
ap.add_argument('--unimorph', type=int, default=40000)
ap.add_argument('--frequent', type=int, default=10000)
ap.add_argument('--index')
a = ap.parse_args()
WORD = re.compile(r'^[a-zàâäæçéèêëîïôöœùûüÿ]+$')
POS = {'N': 'n', 'V': 'v', 'V.PTCP': 'v', 'ADJ': 'adj'}
rows, cond, inf = [], {}, {}
for line in open(a.um4, encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) < 3 or not p[0]:
        continue
    rows.append(p)
    if p[2] == 'V;COND;1;SG':
        cond[p[0]] = p[1]
    if p[2] == 'V;V.PTCP;PST':
        inf[p[1]] = p[0]
old = {l for l, f in cond.items() if not f.endswith('rais')}
seen, pool = set(), []
for lemma0, form, feats in rows:
    tags = feats.split(';')
    lemma = inf.get(lemma0) if tags[0] == 'V.PTCP' else lemma0
    if lemma is None or lemma in old or form == lemma or not WORD.match(form) or not WORD.match(lemma) or tags[0] not in POS:
        continue
    key = (form, lemma, POS[tags[0]])
    if key in seen:
        continue
    seen.add(key)
    pool.append(('U:' + feats, '1', form, lemma, POS[tags[0]], '*'))
random.seed(2)
random.shuffle(pool)
out = pool[:a.unimorph]
idx = build(a.zip, a.index or a.zip + '.index.json')
n = 0
for line in open(a.frequency, encoding='utf-8'):
    if n >= a.frequent:
        break
    n += 1
    w = line.rsplit(' ', 1)[0]
    e = idx.get(w)
    if not e:
        continue
    found = {}
    for t, rules, _ in e['ref']:
        found.setdefault(t, set()).update(rules or ['*'])
        f = idx.get(t)
        if f:
            for u, rules2, _ in f['ref']:
                found.setdefault(u, set()).update(rules2 or ['*'])
    for lemma, poss in sorted(found.items()):
        if lemma == w or ' ' in lemma:
            continue
        pos = sorted(poss)[0] if len(poss) == 1 else ('*' if '*' in poss else sorted(poss)[0])
        out.append(('F:frequent', '1', w, lemma, pos if pos in ('v', 'n', 'adj') else '*', '*'))
with open(a.out, 'w', encoding='utf-8') as f:
    f.write('# Measurement universe (not committed): UniMorph fra.um4 sample and the frequent words\' dictionary lemmas.\n')
    f.write('# category\tvalid\tsource\tterm\trule\treasons\n')
    for r in out:
        f.write('\t'.join(r) + '\n')
print(len(out), 'rows', file=sys.stderr)
