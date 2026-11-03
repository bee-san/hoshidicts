#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Judges the first results of real-text lookups (README.md, Measurements). Not run by any test.

    python3 judge-hovers.py <words.txt> <lookups.jsonl> <dictionary zip> [--index <cache.json>] [--out <prefix>]

<lookups.jsonl> is lookup-batch's answer to hover.txt (make-hovers.py), one
line per hover. For each hover the first result with a definition (one that
is not a form-of row) is judged by the dictionary's own rows:

- its matched text is the hovered word: right when its expression is one of
  the word's lemmas (the word itself when the dictionary has a row with
  definitions for it, and the terms its form-of rows name, two references
  deep), wrong when the word has rows and the expression is none of them,
  unjudged when the dictionary has no row for the word;
- its matched text is longer (l'homme, me souviens, dis-moi, parle-t-il):
  when the dictionary has rows for the matched text, right when the
  expression is one of its lemmas, else wrong; when it has none (a reading
  the rules made), right when the expression, without a reflexive se, s' or
  s'en, is a lemma of one of the matched words, else unjudged.

Unjudged results are left to a hand sample. Writes <prefix>-wrong.tsv and
<prefix>-unjudged.tsv and prints one JSON object.
"""
import argparse, collections, json, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dictindex import build, lemmas

ap = argparse.ArgumentParser()
ap.add_argument('words'); ap.add_argument('lookups'); ap.add_argument('zip')
ap.add_argument('--index'); ap.add_argument('--out', default='judge')
ap.add_argument('--classes', help='a file with one class per hover line; counts are also given per class')
a = ap.parse_args()
idx = build(a.zip, a.index or a.zip + '.index.json')
norm = lambda s: s.replace('\u2019', "'")


def own(word):
    out = set()
    for w in {word, word.lower(), word[:1].lower() + word[1:]}:
        out |= lemmas(idx, norm(w))
    return out


def has_rows(text):
    return any(norm(w) in idx for w in {text, text.lower(), text[:1].lower() + text[1:]})


REFLEXIVE = re.compile(r"^(?:s'en |se |s')")
words = open(a.words, encoding='utf-8').read().split('\n')
classes = open(a.classes, encoding='utf-8').read().split('\n') if a.classes else None
by_class = collections.defaultdict(collections.Counter)
counts = collections.Counter()
wrong, unjudged = [], []
groups = collections.Counter()
with open(a.lookups, encoding='utf-8') as f:
    for i, line in enumerate(f):
        d = json.loads(line)
        word = words[i]
        first = next((r for r in d['results'] if not r['formOf']), None)
        if first is None:
            counts['no result'] += 1
            continue
        counts['lookups with a result'] += 1
        e, m = norm(first['expression']), first['matched']
        trace = '|'.join(first['trace'])
        if m.lower() == word.lower():
            ls = {norm(x) for x in own(word)}
            if not ls:
                kind = 'unjudged'
            else:
                kind = 'right' if e in ls or e.lower() in {x.lower() for x in ls} else 'wrong'
        elif has_rows(m):
            ls = {norm(x).lower() for x in own(m)}
            bare = REFLEXIVE.sub('', e).lower()
            kind = 'right' if e.lower() in ls or bare in ls else 'wrong'
        else:
            parts = [p for p in re.split(r"[ '\u2019\-]+", m) if p]
            ls = set()
            for p in parts:
                ls |= {norm(x).lower() for x in own(p)}
            bare = REFLEXIVE.sub('', e).lower()
            kind = 'right' if bare in ls or e.lower() in ls else 'unjudged'
        counts[kind] += 1
        if classes is not None:
            by_class[classes[i]][kind] += 1
            if kind == 'wrong':
                by_class[classes[i]]['examples'] = by_class[classes[i]].get('examples', 0)
        row = (word, m, first['expression'], trace, d['text'][:80])
        if kind == 'wrong':
            wrong.append(row)
            groups[trace] += 1
        elif kind == 'unjudged':
            unjudged.append(row)
for name, rows in (('wrong', wrong), ('unjudged', unjudged)):
    with open(f'{a.out}-{name}.tsv', 'w', encoding='utf-8') as f:
        f.write('# hovered word\tmatched\tfirst result\ttrace\ttext\n')
        for r in rows:
            f.write('\t'.join(r) + '\n')
random.seed(1)
sample = random.sample(unjudged, min(60, len(unjudged)))
with open(f'{a.out}-unjudged-sample.tsv', 'w', encoding='utf-8') as f:
    f.write('# hovered word\tmatched\tfirst result\ttrace\ttext\n')
    for r in sample:
        f.write('\t'.join(r) + '\n')
judged = counts['right'] + counts['wrong']
print(json.dumps({**counts, 'wrongRate': counts['wrong'] / judged if judged else 0,
                  'wrongByTrace': groups.most_common(15)}, ensure_ascii=False))
for c in sorted(by_class):
    k = by_class[c]
    j = k['right'] + k['wrong']
    print(json.dumps({'class': c, 'right': k['right'], 'wrong': k['wrong'], 'unjudged': k['unjudged'],
                      'wrongRate': k['wrong'] / j if j else 0}, ensure_ascii=False))
