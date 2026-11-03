#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Drops the kept Yomitan rules that do measured harm (README.md, Rule provenance). Not run by any test.

    python3 yomitan-harm.py <languages dir> <provenance.tsv> <false.tsv> <lookup-batch> <dictionary>... \
        [--cli build/hoshidicts-cli] [--cases languages/fr/tests/cases.tsv]

<languages dir> holds the fr pack whose transforms.json build-final.mjs wrote
from <provenance.tsv>; <false.tsv> is the list of every false add that
yomitan-rules.py writes. A rule the TSV keeps is changed to:
- drop-first, when one of its false adds is the first result with a
  definition of a lookup of that word, with a trace through the rule's
  transform, with any of the dictionaries;
- drop-negative, when it makes a negative row of cases.tsv fail;
- with --own, drop-first also when the word's first result with the own
  rules is one of its lemmas (the dictionary's or UniMorph's) and, with the
  final rules, another term reached through the rule; and with --hovers,
  when a hover text's first result with the final rules is new, reached
  through the rule, and a lemma of neither the matched text nor its words
  (faire sa -> faire savoir).
Rewrites <provenance.tsv> and prints what it changed.
"""
import argparse, json, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('languages'); ap.add_argument('provenance'); ap.add_argument('false'); ap.add_argument('lookup')
ap.add_argument('dictionaries', nargs='+')
ap.add_argument('--cli', default='build/hoshidicts-cli')
ap.add_argument('--cases', default='languages/fr/tests/cases.tsv')
ap.add_argument('--own', help='languages dir with the own rules: also drop a rule that displaces their first result when it is the word\'s lemma')
ap.add_argument('--words', help='words for --own, one per line')
ap.add_argument('--zip', help='the dictionary zip, for --own (which terms are a word\'s lemmas)')
ap.add_argument('--um4', help='UniMorph fra.um4, for --own')
ap.add_argument('--index')
ap.add_argument('--hovers', action='append', default=[], help='hover texts (make-hovers.py, tatoeba-hovers.py) for --own: whole texts compared too')
a = ap.parse_args()

header, rows = [], []
for line in open(a.provenance, encoding='utf-8'):
    if line.startswith('#'):
        header.append(line)
    elif line.strip():
        rows.append(line.rstrip('\n').split('\t'))
key = lambda tid, i: f'{tid}\t{i}'
kept = {key(r[0], r[1]): r for r in rows if r[6] == 'keep'}
false = [l.rstrip('\n').split('\t') for l in open(a.false, encoding='utf-8')]
false = [f for f in false if key(f[0], f[1]) in kept]
words = sorted({f[2] for f in false})
harm = {}
for d in a.dictionaries:
    p = subprocess.run([a.lookup, a.languages, 'fr', d], input='\n'.join(words) + '\n', capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(p.stderr)
    first = {}
    for line in p.stdout.splitlines():
        r = json.loads(line)
        first[r['text']] = next((x for x in r['results'] if not x['formOf']), None)
    for tid, i, w, out in false:
        f = first.get(w)
        if f is not None and f['expression'] == out and tid in f['trace'] and f['matched'] == w:
            harm.setdefault(key(tid, i), ('drop-first', f'{w}>{out}'))

# Negatives of cases.tsv that a kept rule's one-step reading reaches.
negs = []
for line in open(a.cases, encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) >= 4 and p[1] == '0':
        negs.append((p[2], p[3]))
pre = subprocess.run([a.cli, '--languages', a.languages, 'preprocess', 'fr', '--stdin', '--all-options'],
                     input='\n'.join(s for s, _ in negs) + '\n', capture_output=True, text=True)
variants = {json.loads(l)['input']: [v['text'] for v in json.loads(l)['variants']] for l in pre.stdout.splitlines()}
for source, term in negs:
    for text in variants[source]:
        for k, r in kept.items():
            inf, de = r[2], r[3]
            if text.endswith(inf) and text[:len(text) - len(inf)] + de == term:
                harm.setdefault(k, ('drop-negative', f'{source}>{term}'))
# Displacements: a word whose first result with a definition is its lemma
# with the own rules and another term, through a kept Yomitan rule, with the
# final rules.
if a.own:
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from dictindex import build, lemmas
    idx = build(a.zip, a.index or a.zip + '.index.json')
    uni = {}
    for line in open(a.um4, encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 3 and p[0]:
            uni.setdefault(p[1], set()).add(p[0])
    allwords = [w.strip() for w in open(a.words, encoding='utf-8') if w.strip()]
    def firsts(languages, d):
        p = subprocess.run([a.lookup, languages, 'fr', d, '16', '64'], input='\n'.join(allwords) + '\n', capture_output=True, text=True)
        out = {}
        for line in p.stdout.splitlines():
            r = json.loads(line)
            out[r['text']] = next((x for x in r['results'] if not x['formOf']), None)
        return out
    def reaches(text, target):
        if text == target:
            return True
        e = idx.get(text)
        return e is not None and any(t == target for t, _, _ in e['ref'])
    for d in a.dictionaries:
        o, f = firsts(a.own, d), firsts(a.languages, d)
        for w in allwords:
            x, y = o.get(w), f.get(w)
            if x is None or y is None or x['expression'] == y['expression']:
                continue
            good = lemmas(idx, w) | uni.get(w, set())
            if x['expression'] not in good:
                continue
            for tid in y['trace']:
                for k, r in kept.items():
                    if r[0] == tid and w.endswith(r[2]) and reaches(w[:len(w) - len(r[2])] + r[3], y['expression']):
                        harm.setdefault(k, ('drop-first', f"{w}>{y['expression']} over {x['expression']}"))

# Hover texts: a first result that the own rules do not give, through a
# kept Yomitan rule, whose expression is not a lemma of the matched text or
# of one of its words.
if a.own and a.hovers:
    import re as _re
    texts = []
    for path in a.hovers:
        texts += [l.rstrip('\n') for l in open(path, encoding='utf-8')]
    texts = sorted(set(texts))
    for d in a.dictionaries:
        def run(languages):
            p = subprocess.run([a.lookup, languages, 'fr', d], input='\n'.join(texts) + '\n', capture_output=True, text=True)
            return [json.loads(l) for l in p.stdout.splitlines()]
        for x, y in zip(run(a.own), run(a.languages)):
            fx = next((r for r in x['results'] if not r['formOf']), None)
            fy = next((r for r in y['results'] if not r['formOf']), None)
            if fy is None or (fx is not None and fx['expression'] == fy['expression'] and fx['matched'] == fy['matched']):
                continue
            m = fy['matched'].replace('\u2019', "'")
            good = set()
            for part in [m] + [p for p in _re.split(r"[ '\-]+", m) if p]:
                good |= lemmas(idx, part) | lemmas(idx, part.lower()) | uni.get(part.lower(), set())
            if fy['expression'] in good:
                continue
            for tid in fy['trace']:
                for k, r in kept.items():
                    if r[0] == tid and m.lower().endswith(r[2]) and reaches(m.lower()[:len(m) - len(r[2])] + r[3], fy['expression']):
                        harm.setdefault(k, ('drop-first', f"{fy['matched']}>{fy['expression']} (text)"))

changed = 0
for r in rows:
    k = key(r[0], r[1])
    if k in harm and r[6] == 'keep':
        r[6] = harm[k][0]
        r[7] = f'{harm[k][1]} ; {r[7]}'
        changed += 1
        print(r[0], r[1], r[2], '->', r[3], r[6], harm[k][1])
with open(a.provenance, 'w', encoding='utf-8') as f:
    f.writelines(header)
    for r in rows:
        f.write('\t'.join(r) + '\n')
print(changed, 'rules changed')
