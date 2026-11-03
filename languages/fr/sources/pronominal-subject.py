#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Pronominal readings checked against the sentence's subject (README.md, Measurements). Not run by any test.

    python3 pronominal-subject.py <fra_sentences.tsv> <lookup-batch> <languages dir> <dictionary> [--out <prefix>]

For every me, te, m', t' (also before en or y) followed by a word in Tatoeba's
French sentences, the text from the pronoun to the end of the sentence is
looked up as a hover on the pronoun is. When the first result with a
definition is a verb with se, s', s'en or s'y, the subject decides whether
the pronoun is reflexive: the last subject pronoun before it in the sentence
(je, j', tu, il, elle, on, nous, vous, ils, elles, ce, ça, cela, qui). The
reading agrees when that subject is je or j' for me and m', tu for te and
t'; it disagrees for any other subject; it is unknown without one (an
imperative or a noun subject). Counts are split by whether the pack's
pronominal rule made the reading (its trace has the transform pronominal)
or the dictionary's own row did. Writes <prefix>-disagree.tsv.
"""
import argparse, collections, json, re, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('sentences'); ap.add_argument('lookup'); ap.add_argument('languages'); ap.add_argument('dictionary')
ap.add_argument('--out', default='pronominal-subject')
a = ap.parse_args()
WORD = re.compile(r"[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]+")
SUBJECTS = {'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce', 'ça', 'cela', 'qui'}
PRONOUN = {'me': 'me', 'te': 'te', 'm': 'me', 't': 'te'}
rows = []
for line in open(a.sentences, encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) < 3:
        continue
    s = ' '.join(p[2].split()).replace('\u2019', "'")
    ms = list(WORD.finditer(s))
    for i, m in enumerate(ms[:-1]):
        w = m.group(0).lower()
        if w not in PRONOUN:
            continue
        after = s[m.end():m.end() + 1]
        if (w in ('m', 't')) != (after == "'"):
            continue
        if w in ('me', 'te') and after != ' ':
            continue
        subject = None
        for prev in reversed(ms[:i]):
            pw = prev.group(0).lower()
            if pw in SUBJECTS:
                subject = pw
                break
            if prev.group(0)[0] in '.!?;':
                break
        rows.append((s[m.start():], PRONOUN[w], subject))
p = subprocess.run([a.lookup, a.languages, 'fr', a.dictionary], input='\n'.join(r[0] for r in rows) + '\n', capture_output=True, text=True)
c = collections.Counter()
bad = []
for (text, pronoun, subject), line in zip(rows, p.stdout.splitlines()):
    d = json.loads(line)
    c['positions'] += 1
    f = next((x for x in d['results'] if not x['formOf']), None)
    if f is None or not re.match(r"^(se |s')", f['expression'].replace('\u2019', "'")) or len(f['matched']) <= 2:
        continue
    maker = 'rule' if 'pronominal' in f['trace'] else 'dictionary'
    if subject is None:
        kind = 'unknown'
    elif (pronoun == 'me' and subject in ('je', 'j')) or (pronoun == 'te' and subject == 'tu'):
        kind = 'agrees'
    else:
        kind = 'disagrees'
    c[f'{maker} {kind}'] += 1
    if kind == 'disagrees':
        bad.append((maker, subject, f['matched'], f['expression'], '|'.join(f['trace']), text[:60]))
with open(f'{a.out}-disagree.tsv', 'w', encoding='utf-8') as f:
    f.write('# made by\tsubject\tmatched\tfirst result\ttrace\ttext\n')
    for r in bad:
        f.write('\t'.join(r) + '\n')
print(json.dumps(dict(sorted(c.items()))))
