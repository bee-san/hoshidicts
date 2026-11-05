#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Recall on every UniMorph rus row that sources/build-corpus.mjs admits, not only
the 1,000-row sample (README.md, Measurements). Not run by any test.

  python3 languages/ru/sources/unimorph-recall.py <languages dir> <unimorph rus file>
      [--ku-datives <lookup-batch-ru> <imported wty-ru-en dir>]

--ku-datives also reports the singular datives in -ку of the admitted rows
(коробку, куску): how many the rules do not reach, and for how many of those a
lookup (sources/lookup-batch.cpp, default options) still shows the lemma, and
first (README.md, History).
"""
import json, os, re, subprocess, collections, sys
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
WORD = re.compile(r'^[а-яё]+(-[а-яё]+)?$')
STRATA = [('noun, singular case', lambda t: t[0] == 'N' and 'SG' in t), ('noun, plural', lambda t: t[0] == 'N' and 'PL' in t),
          ('adjective, long form', lambda t: t[0] == 'ADJ' and 'LGSPEC1' not in t), ('adjective, short form', lambda t: t[0] == 'ADJ' and 'LGSPEC1' in t),
          ('verb, present or future', lambda t: t[0] == 'V' and ('PRS' in t or 'FUT' in t)), ('verb, past', lambda t: t[0] == 'V' and 'PST' in t),
          ('verb, imperative', lambda t: t[0] == 'V' and 'IMP' in t), ('participle', lambda t: t[0] == 'V.PTCP'), ('adverbial participle', lambda t: t[0] == 'V.CVB')]
POS = {'N': {'n', 'name'}, 'V': {'v'}, 'V.CVB': {'v'}, 'ADJ': {'adj'}}
rows, seen = [], set()
DATIVE = set()
for line in open(sys.argv[2], encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) != 3: continue
    lemma, form, feats = p
    if form == lemma or not WORD.match(form) or not WORD.match(lemma): continue
    tags = feats.split(';')
    s = next((n for n, f in STRATA if f(tags)), None)
    if s is None: continue
    pos = {'adj'} if tags[0] == 'V.PTCP' and re.search(r'(ый|ий|ой)(ся)?$', lemma) else POS.get(tags[0], {'v'})
    key = (form, lemma, tags[0] == 'V.PTCP' and 'p' or tags[0])
    if key in seen: continue
    seen.add(key); rows.append((s, form, lemma, pos))
    if tags[0] == 'N' and 'DAT' in tags and 'SG' in tags:
        DATIVE.add((form, lemma))
langs = sys.argv[1]
forms = sorted({r[1] for r in rows})
pre = subprocess.run([f'{R}/build/hoshidicts-cli', '--languages', langs, 'preprocess', 'ru', '--stdin'], input='\n'.join(forms) + '\n', capture_output=True, text=True, check=True).stdout.splitlines()
variants = {json.loads(l)['input']: [v['text'] for v in json.loads(l)['variants']] for l in pre}
texts = sorted({t for v in variants.values() for t in v})
de = subprocess.run([f'{R}/build/hoshidicts-cli', '--languages', langs, 'deinflect', 'ru', '--stdin'], input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout.splitlines()
res = {json.loads(l)['input']: json.loads(l)['results'] for l in de}
by, hit = collections.Counter(), collections.Counter()
for s, form, lemma, pos in rows:
    by[s] += 1
    if any(r['text'] == lemma and (not r['conditions'] or set(r['conditions']) & pos) for v in variants[form] for r in res[v]):
        hit[s] += 1
total, reached = sum(by.values()), sum(hit.values())
print(json.dumps({'rows': total, 'reached': reached, 'recall': round(reached / total, 4), 'byStratum': {s: round(hit[s] / by[s], 4) for s, _ in STRATA}}, ensure_ascii=False))
if '--ku-datives' in sys.argv:
    batch, dictionary = sys.argv[sys.argv.index('--ku-datives') + 1: sys.argv.index('--ku-datives') + 3]
    ku = sorted({(form, lemma) for s, form, lemma, pos in rows if s == 'noun, singular case' and form.endswith('ку') and (form, lemma) in DATIVE})
    missed = [(f, l) for f, l in ku if not any(r['text'] == l and (not r['conditions'] or set(r['conditions']) & {'n', 'name'}) for v in variants[f] for r in res[v])]
    out = subprocess.run([batch, langs, 'ru', dictionary], input='\n'.join(f for f, _ in missed) + '\n', capture_output=True, text=True, check=True).stdout.splitlines()
    shown = first = 0
    for (f, l), line in zip(missed, out):
        defs = [r for r in json.loads(line)['results'] if not r['formOf']]
        shown += any(r['expression'] == l for r in defs)
        first += bool(defs) and defs[0]['expression'] == l
    print(json.dumps({'kuDatives': len(ku), 'notReachedByRules': len(missed), 'lookupShowsLemma': shown, 'lemmaFirst': first}, ensure_ascii=False))
