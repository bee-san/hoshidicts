#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Trace quality on the sample's verb rows (README.md, Measurements). Not run by any test.

    python3 traces.py <sample.tsv> <languages dir> <dictionary> <lookup-batch>

<sample.tsv> is corpus.tsv and gaps.tsv together; its category column holds
UniMorph's features. Each verb row's source is looked up whole; the trace of
the result whose expression is the row's lemma (the one a host shows) names
the tense when one of its steps is a transform of that tense or form, and
the person when that transform also lists the row's person. Own transform
ids give both (present-1s-3s: present, je and il); Yomitan's give the tense
(present indicative). Prints the counts.
"""
import collections, json, subprocess, sys

sample, languages, dictionary, lookup = sys.argv[1:5]
rows = [l.rstrip('\n').split('\t') for l in open(sample, encoding='utf-8') if not l.startswith('#') and l.strip()]
rows = [r for r in rows if r[4] == 'v']


def wanted(feats):
    t = feats.split(';')
    has = lambda *xs: all(x in t for x in xs)
    if has('V.PTCP', 'PRS'):
        return 'present-participle', None
    if has('V.PTCP', 'PST') or t[0] == 'V.PTCP':
        return 'past-participle', None
    tense = ('imperfect-subjunctive' if has('SBJV', 'PST') else 'subjunctive' if has('SBJV') else 'conditional' if has('COND')
             else 'future' if has('FUT') else 'imperfect' if has('IPFV') else 'simple-past' if has('PFV') else 'imperative' if has('IMP')
             else 'present')
    person = next((p for p in '123' if p in t), None)
    number = 's' if 'SG' in t else 'p' if 'PL' in t else None
    return tense, (person + number) if person and number else None


YOMITAN = {'present indicative': 'present', 'imperfect indicative': 'imperfect', 'future': 'future', 'imperative present': 'imperative',
           'Conditional': 'conditional', 'Preterite': 'simple-past', 'present participle': 'present-participle',
           'present subjunctive': 'subjunctive'}
TENSES = ['imperfect-subjunctive', 'simple-past', 'present-participle', 'past-participle', 'present', 'imperfect', 'future',
          'conditional', 'subjunctive', 'imperative']


def names(step):
    if step in YOMITAN:
        return YOMITAN[step], set()
    tense = next((t for t in TENSES if step == t or step.startswith(t + '-')), None)
    if tense is None:
        return None, set()
    rest = step[len(tense) + 1:]
    return tense, set(rest.split('-')) if rest and not rest.startswith(('f', 'mp', 'fp')) else set()


srcs = sorted({r[2] for r in rows})
p = subprocess.run([lookup, languages, 'fr', dictionary, '64', '64'], input='\n'.join(srcs) + '\n', capture_output=True, text=True)
found = {}
for line in p.stdout.splitlines():
    d = json.loads(line)
    found[d['text']] = d['results']
c = collections.Counter()
for r in rows:
    tense, person = wanted(r[0])
    res = next((x for x in found.get(r[2], []) if x['expression'] == r[3] and x['matched'] == r[2]), None)
    if res is None:
        continue
    c['reached'] += 1
    named = [names(s) for s in res['trace']]
    if any(t == tense for t, _ in named):
        c['tense named'] += 1
    if person is not None:
        c['finite'] += 1
        if any(t == tense and person in ps for t, ps in named):
            c['person named'] += 1
print(json.dumps(c))
