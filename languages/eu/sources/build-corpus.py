#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Samples tests/corpus.tsv and the sampled rows of tests/gaps.tsv.

    python3 languages/eu/sources/build-corpus.py <cache dir> [--cli build/hoshidicts-cli]

<cache dir> holds the downloads named in the README (Sources and licences):
  unimorph-eus/eus                    UniMorph eus at 256a35d
  kaikki.org-dictionary-Basque.jsonl  kaikki.org's Basque extract of English Wiktionary
  eu_full-2018.txt                    FrequencyWords' Basque subtitle list at 525f9b5

Five strata, each a fixed number of distinct (form, lemma) pairs, chosen by
the order of sha256("eu-corpus-1" + stratum + form + lemma), so the sample is
the same on every machine:
  - 250 finite verb forms from all of UniMorph eus;
  - 250 finite verb forms from UniMorph eus that occur in the subtitle list;
  - 250 noun forms and 100 adjective forms from kaikki's declension tables;
  - 150 non-finite verb forms from kaikki's verb entries (imperfective and
    future participles, verbal nouns, short forms).
A form equal to its lemma is left out (it needs no rule). UniMorph lists the
transitive auxiliary twice, as ukan and edun, with the same forms; ukan is
read as edun, the lemma wiktionary-to-yomitan has an entry for.

A row is reached when one of the source's processor variants deinflects to
the lemma with conditions the row's part of speech allows, as the conformance
test decides it (docs/languages.md 12.2). Reached rows go to tests/corpus.tsv,
the others to tests/gaps.tsv, after the hand-written rows already there
(categories without ";"), which are kept.

Every own transform needs a passing row (docs/languages.md 12.1 step 5).
For each finite-verb transform (one tense and set of persons) that no corpus
row exercises, the UniMorph row that comes first in the same hash order and
that the transform reads alone (the form is one of its forms) is written to
the UniMorph section of tests/cases.tsv, with the transform as its expected
trace. The hand-written rows of tests/cases.tsv (categories without ";") are
kept.
"""

import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
SEED = 'eu-corpus-1'
UNIMORPH = 'UniMorph eus (https://github.com/unimorph/eus/blob/256a35d915d4689e96e79cc9725e0518b8152db0/eus, sha256 b80f2538)'
KAIKKI = ("kaikki.org's Basque extract of English Wiktionary (https://kaikki.org/dictionary/Basque/kaikki.org-dictionary-Basque.jsonl, "
          'downloaded 2026-11-03, sha256 d6951e8b)')
STRATA = [
    ('verb, finite (all of UniMorph)', 250),
    ('verb, finite (UniMorph forms in the subtitle list)', 250),
    ('noun', 250),
    ('adjective', 100),
    ('verb, non-finite', 150),
]
LETTERS = set('abcdefghijklmnopqrstuvwxyzñçü')
FINITE_TENSES = {'present', 'past', 'cond', 'condpast', 'hyp', 'pot', 'pothyp', 'potpast', 'subj', 'subjpast', 'imp', 'allo', 'allopast'}


def key(stratum, form, lemma):
    return hashlib.sha256(f'{SEED}\0{stratum}\0{form}\0{lemma}'.encode()).hexdigest()


def plain(word):
    return word != '' and all(c in LETTERS for c in word)


def unimorph_rows(cache):
    rows = {}
    with open(os.path.join(cache, 'unimorph-eus', 'eus'), encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 3:
                continue
            lemma, form, feats = parts
            lemma = 'edun' if lemma == 'ukan' else lemma
            if form == lemma or not plain(form):
                continue
            rows.setdefault((form, lemma), feats)
    return rows


def kaikki_rows(cache):
    pos_map = {'noun': ('noun', 'n', 'N'), 'adj': ('adjective', 'adj', 'ADJ')}
    nonfinite = {'imperfect participle': 'V.PTCP;IPFV', 'future participle': 'V.PTCP;FUT', 'noun-from-verb': 'V;MSDR', 'short-form': 'V;SHORT'}
    out = {name: {} for name, _ in STRATA}
    with open(os.path.join(cache, 'kaikki.org-dictionary-Basque.jsonl'), encoding='utf-8') as f:
        for line in f:
            entry = json.loads(line)
            pos = entry.get('pos')
            lemma = entry.get('word', '')
            if not plain(lemma):
                continue
            for form in entry.get('forms', []):
                text = form.get('form', '')
                tags = form.get('tags', [])
                if text == lemma or not plain(text):
                    continue
                if pos in pos_map and form.get('source') == 'declension':
                    stratum, rule, prefix = pos_map[pos]
                    category = prefix + ';' + ';'.join(sorted(tags))
                    out[stratum].setdefault((text, lemma), (category, rule))
                elif pos == 'verb':
                    joined = ' '.join(sorted(tags))
                    for name, category in nonfinite.items():
                        if joined == ' '.join(sorted(name.split())):
                            out['verb, non-finite'].setdefault((text, lemma), (category, 'v'))
    return out


def sample(candidates, stratum, quota, taken):
    chosen = []
    for form, lemma in sorted(candidates, key=lambda fl: key(stratum, *fl)):
        if (form, lemma) in taken:
            continue
        chosen.append((form, lemma))
        taken.add((form, lemma))
        if len(chosen) == quota:
            break
    if len(chosen) < quota:
        raise SystemExit(f'{stratum}: only {len(chosen)} candidates for {quota}')
    return chosen


def run(cli, args, inputs):
    result = subprocess.run([cli, '--languages', os.path.dirname(PACK)] + args, input='\n'.join(inputs) + '\n',
                            capture_output=True, text=True, check=True)
    return [json.loads(line) for line in result.stdout.splitlines()]


def main(argv):
    if len(argv) < 1:
        raise SystemExit(__doc__)
    cache = argv[0]
    cli = argv[argv.index('--cli') + 1] if '--cli' in argv else os.path.join(os.path.dirname(os.path.dirname(PACK)), 'build', 'hoshidicts-cli')
    subtitles = set()
    with open(os.path.join(cache, 'eu_full-2018.txt'), encoding='utf-8') as f:
        for line in f:
            subtitles.add(line.split(' ')[0])
    um = unimorph_rows(cache)
    kk = kaikki_rows(cache)
    taken = set()
    rows = []
    for stratum, quota in STRATA:
        if stratum.startswith('verb, finite'):
            pool = um.keys() if 'all of' in stratum else [fl for fl in um if fl[0] in subtitles]
            for form, lemma in sample(pool, stratum, quota, taken):
                rows.append((um[(form, lemma)], form, lemma, 'v', 'unimorph'))
        else:
            pool = kk[stratum]
            for form, lemma in sample(pool.keys(), stratum, quota, taken):
                category, rule = pool[(form, lemma)]
                rows.append((category, form, lemma, rule, 'kaikki'))

    # Reached: a processor variant of the source deinflects to the lemma.
    sources = sorted({r[1] for r in rows})
    variants = {d['input']: [v['text'] for v in d['variants']] for d in run(cli, ['preprocess', 'eu', '--stdin', '--all-options'], sources)}
    texts = sorted({t for s in sources for t in variants[s]})
    transforms = os.path.join(PACK, 'transforms.json')
    deinflections = {d['input']: d['results'] for d in run(cli, ['deinflect', 'eu', '--stdin', '--all-options', '--transforms', transforms], texts)}

    def reached(source, lemma, rule):
        return any(r['text'] == lemma and (not r['conditions'] or rule in r['conditions'])
                   for t in variants[source] for r in deinflections[t])

    passed = [r for r in rows if reached(r[1], r[2], r[3])]
    failed = [r for r in rows if not reached(r[1], r[2], r[3])]

    # Transforms the corpus exercises: the traces of the deinflections that
    # make a reached row's lemma.
    exercised = set()
    for r in passed:
        for t in variants[r[1]]:
            for d in deinflections[t]:
                if d['text'] == r[2] and (not d['conditions'] or r[3] in d['conditions']):
                    exercised.update(d['trace'])
    with open(transforms, encoding='utf-8') as f:
        rules = json.load(f)
    finite = {}
    for t in rules['transforms']:
        if t['id'].split('-')[0] in FINITE_TENSES:
            for rule in t['rules']:
                if rule['type'] == 'wholeWord':
                    finite.setdefault(t['id'], set()).add((rule['inflected'], rule['deinflected']))
    coverage = []
    uncovered = []
    for tid in sorted(finite):
        if tid in exercised:
            continue
        pairs = [fl for fl in sorted(um, key=lambda fl: key('coverage', *fl)) if fl in finite[tid]]
        if pairs:
            form, lemma = pairs[0]
            coverage.append((um[(form, lemma)], form, lemma, 'v', tid))
        else:
            uncovered.append(tid)
    header = [
        f'# Source: {UNIMORPH}, CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary (categories with V; and ARG features);',
        f'# and {KAIKKI}, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) and GFDL, by the Wiktionary contributors, extracted by kaikki.org (wiktextract) (categories N;, ADJ;, V.PTCP;, V;MSDR and V;SHORT).',
        f'# {len(rows)} rows sampled by sources/build-corpus.py ({", ".join(f"{q} {n}" for n, q in STRATA)}); the rows the pack\'s rules reach are in corpus.tsv, the others in gaps.tsv.',
    ]
    columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)'
    line = lambda r: f'{r[0]}\t1\t{r[1]}\t{r[2]}\t{r[3]}\t*'
    tests = os.path.join(PACK, 'tests')
    os.makedirs(tests, exist_ok=True)
    with open(os.path.join(tests, 'corpus.tsv'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(header + [columns] + [line(r) for r in passed]) + '\n')
    gaps_file = os.path.join(tests, 'gaps.tsv')
    hand = []
    if os.path.exists(gaps_file):
        with open(gaps_file, encoding='utf-8') as f:
            hand = [l.rstrip('\n') for l in f if l.strip() and not l.startswith('#') and ';' not in l.split('\t')[0]]
    with open(gaps_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(['# Known gaps: run by the conformance test and counted, not enforced.',
                           '# Hand-written rows (categories without ";"): written for this pack, no third-party data.']
                          + header + [columns] + hand + [line(r) for r in failed]) + '\n')
    cases_file = os.path.join(tests, 'cases.tsv')
    hand_cases = []
    hand_header = []
    if os.path.exists(cases_file):
        with open(cases_file, encoding='utf-8') as f:
            for l in f:
                l = l.rstrip('\n')
                if l.startswith('# UniMorph rows') or l.startswith(f'# Source: {UNIMORPH}'):
                    continue
                if l.startswith('#'):
                    if not l.startswith('# category'):
                        hand_header.append(l)
                elif l.strip() and ';' not in l.split('\t')[0]:
                    hand_cases.append(l)
    with open(cases_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(hand_header + [
            f'# UniMorph rows (categories with ";"): {len(coverage)} rows from {UNIMORPH}, CC BY-SA 3.0, by the UniMorph contributors,',
            '# one for each finite-verb transform no row of corpus.tsv exercises, written by sources/build-corpus.py; the reason is that transform.',
            columns] + hand_cases + [f'{c[0]}\t1\t{c[1]}\t{c[2]}\t{c[3]}\t{c[4]}' for c in coverage]) + '\n')
    by = lambda rs: {n: sum(1 for r in rs if stratum_of(r, rows) == n) for n, _ in STRATA}
    print(json.dumps({'sampled': len(rows), 'corpus': len(passed), 'gaps': len(failed), 'recall': round(len(passed) / len(rows), 4),
                      'reached': by(passed), 'missed': by(failed), 'coverageRows': len(coverage),
                      'finiteTransformsWithoutUniMorphForm': uncovered}, ensure_ascii=False))


def stratum_of(row, rows):
    index = rows.index(row)
    total = 0
    for name, quota in STRATA:
        total += quota
        if index < total:
            return name
    return None


if __name__ == '__main__':
    main(sys.argv[1:])
