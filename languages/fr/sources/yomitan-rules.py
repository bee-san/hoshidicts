#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""What each of Yomitan's rules adds to the own rules (README.md, Rule provenance). Not run by any test.

    python3 yomitan-rules.py <languages dir> <dictionary zip> <fra.um4> <fra> <fr_50k.txt> <words.txt> <out prefix> \
        [--cli build/hoshidicts-cli] [--index <cache.json>]

Every Yomitan rule of sources/yomitan.json is a literal suffix rule. Each is
applied once to every word of a word set: the distinct forms of UniMorph fra
and fra.um4, the 50,000 words of the frequency list and the words of the
real-text hovers (words.txt from make-hovers.py), lowercased. An output is a
reading when the dictionary has a row with definitions for it whose part of
speech passes the rule's output conditions, or a form-of row that passes
them and names a term with definitions (one hop, as a lookup follows it).
A reading is added when the own rules (sources/own.json) do not give the
same text from the word with compatible conditions. An added reading is
right when the term it reaches is the word's lemma: the word itself or a
term its form-of rows name (two references deep), or a lemma UniMorph
fra.um4 gives for the word; otherwise it is a false candidate.

Writes <out prefix>.tsv (one line per Yomitan rule: transform, index,
inflected, deinflected, the own transform with the same ending pair, right
adds, false adds, examples) and prints totals.
"""
import argparse, collections, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dictindex import build, lemmas

ap = argparse.ArgumentParser()
for name in ('languages', 'zip', 'um4', 'fra', 'frequency', 'words', 'out'):
    ap.add_argument(name)
ap.add_argument('--cli', default='build/hoshidicts-cli')
ap.add_argument('--index')
a = ap.parse_args()
pack = os.path.join(a.languages, 'fr')
own = json.load(open(os.path.join(pack, 'sources', 'own.json'), encoding='utf-8'))
yom = json.load(open(os.path.join(pack, 'sources', 'yomitan.json'), encoding='utf-8'))
idx = build(a.zip, a.index or a.zip + '.index.json')

WORD = re.compile(r'^[a-zàâäæçéèêëîïôöœùûüÿ]+$')
uni = collections.defaultdict(set)
words = set()
# fra (verbs only) mixes in Old French conjugations of modern lemmas
# (aguerrant for aguerrir); its forms join the word set, but only fra.um4
# (modern forms) says which lemma is right.
for path in (a.um4, a.fra):
    for line in open(path, encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 3 and p[0] and WORD.match(p[1]):
            if path == a.um4:
                uni[p[1]].add(p[0])
            words.add(p[1])
for line in open(a.frequency, encoding='utf-8'):
    w = line.rsplit(' ', 1)[0].lower()
    if WORD.match(w):
        words.add(w)
for line in open(a.words, encoding='utf-8'):
    w = line.strip().lower()
    if WORD.match(w):
        words.add(w)
words = sorted(words)
print(len(words), 'words', file=sys.stderr)

# Yomitan's conditions: v n adj adv aux; a dictionary tag passes when it is
# one of the rule's output conditions.
def reaches(text, cout):
    """The terms with definitions a lookup of `text` with conditions `cout` finds."""
    e = idx.get(text)
    if e is None:
        return set()
    out = set()
    if any(set(r) & set(cout) for r in e['def']):
        out.add(text)
    for target, rules, _ in e['ref']:
        if set(rules) & set(cout):
            t = idx.get(target)
            if t is not None and t['def']:
                out.add(target)
    return out

rules = []
for t in yom['transforms']:
    for i, r in enumerate(t['rules']):
        assert r['type'] == 'suffix'
        rules.append((t['id'], i, r['inflected'], r['deinflected'], r['conditionsOut']))
by_suffix = collections.defaultdict(list)
for k, rule in enumerate(rules):
    by_suffix[rule[2]].append(k)
longest = max(len(s) for s in by_suffix)

# Own ending pairs by transform, for the "same pair" column.
OWN_TENSE = {'present indicative': 'present', 'imperfect indicative': 'imperfect', 'future': 'future', 'imperative present': 'imperative',
             'Conditional': 'conditional', 'Preterite': 'simple-past', 'plural': 'plural', 'present participle': 'present-participle',
             'present subjunctive': 'subjunctive'}
own_pairs = collections.defaultdict(set)
for t in own['transforms']:
    for r in t['rules']:
        pairs = []
        if r['type'] == 'suffix':
            pairs = [(r['inflected'], r['deinflected'])]
        elif r['type'] == 'circumfix' and r.get('prefixes') == [['', '']]:
            pairs = [tuple(p) for p in r['suffixes']]
        for p in pairs:
            own_pairs[p].add(t['id'])

def same_pair(tid, inflected, deinflected):
    tense = OWN_TENSE[tid]
    found = sorted(x for x in own_pairs.get((inflected, deinflected), ()) if x == tense or x.startswith(tense + '-'))
    if tense == 'simple-past':
        pass
    elif tense == 'imperfect':
        found = [x for x in found if not x.startswith('imperfect-subjunctive')]
    return found

candidates = collections.defaultdict(list)  # word -> [(rule k, out, reached terms)]
for w in words:
    for n in range(1, min(longest, len(w)) + 1):
        for k in by_suffix.get(w[-n:], ()):
            out = w[:-n] + rules[k][3]
            if not out or out == w:
                continue
            got = reaches(out, rules[k][4])
            if got:
                candidates[w].append((k, out, got))
print(len(candidates), 'words with a Yomitan reading', file=sys.stderr)

cand_words = sorted(candidates)
p = subprocess.run([a.cli, '--languages', a.languages, 'deinflect', 'fr', '--stdin', '--transforms', os.path.join(pack, 'sources', 'own.json')],
                   input='\n'.join(cand_words) + '\n', capture_output=True, text=True)
if p.returncode != 0:
    raise SystemExit(p.stderr)
own_out = {}
for line in p.stdout.splitlines():
    d = json.loads(line)
    own_out[d['input']] = d['results']

ALL = ['v', 'n', 'adj', 'adv', 'aux']
def own_reached(w):
    """The terms with definitions a lookup reaches from the own rules' deinflections of w."""
    out = set()
    for r in own_out[w]:
        out |= reaches(r['text'], r['conditions'] or ALL) if r['trace'] else set()
    return out

# An add is a term with definitions that the Yomitan rule reaches and the
# own rules do not reach from the same word.
stats = [{'right': [], 'false': []} for _ in rules]
for w in cand_words:
    good = lemmas(idx, w) | uni.get(w, set())
    mine = own_reached(w) | ({w} if idx.get(w, {}).get('def') else set())
    for k, out, got in candidates[w]:
        new = got - mine
        if not new:
            continue
        kind = 'right' if new & good else 'false'
        stats[k][kind].append(f"{w}>{out}{'' if new == {out} else '(' + ','.join(sorted(new)) + ')'}")
with open(a.out + '.tsv', 'w', encoding='utf-8') as f:
    f.write('# Yomitan rules (sources/yomitan.json) that add a reading the own rules lack, written by sources/yomitan-rules.py; every other Yomitan rule adds none.\n')
    f.write('# decision: keep when the rule adds more right readings than false ones, else drop; sources/yomitan-harm.py then changes keep to drop-first (a false add is the first result of its word) or drop-negative (it fails a negative of tests/cases.tsv); sources/build-final.mjs keeps only keep.\n')
    f.write('# transform\tindex\tinflected\tdeinflected\tright adds\tfalse adds\tdecision\texamples (right; false)\n')
    for k, (tid, i, inf, de, cout) in enumerate(rules):
        s = stats[k]
        if not s['right'] and not s['false']:
            continue
        decision = 'keep' if len(s['right']) > len(s['false']) else 'drop'
        examples = ' '.join(s['right'][:2]) + ' ; ' + ' '.join(s['false'][:2])
        f.write(f"{tid}\t{i}\t{inf}\t{de}\t{len(s['right'])}\t{len(s['false'])}\t{decision}\t{examples.strip()}\n")
# Every false add, for the harm check (yomitan-harm.py).
with open(a.out + '-false.tsv', 'w', encoding='utf-8') as f:
    for k, (tid, i, inf, de, cout) in enumerate(rules):
        for ex in stats[k]['false']:
            w, rest = ex.split('>', 1)
            f.write(f"{tid}\t{i}\t{w}\t{rest.split('(')[0]}\n")
tot = collections.Counter()
for k, (tid, *_rest) in enumerate(rules):
    s = stats[k]
    pair = bool(same_pair(tid, rules[k][2], rules[k][3]))
    tot['rules'] += 1
    tot['same pair as an own rule'] += pair
    tot['rules with right adds'] += bool(s['right'])
    tot['rules with only false adds'] += bool(s['false']) and not s['right']
    tot['rules adding nothing'] += not s['false'] and not s['right']
    tot['right adds'] += len(s['right'])
    tot['false adds'] += len(s['false'])
print(json.dumps(tot))
