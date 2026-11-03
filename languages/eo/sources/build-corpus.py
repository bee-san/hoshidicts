#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Samples tests/corpus.tsv and the sampled rows of tests/gaps.tsv from
kaikki.org's English Wiktionary extraction for Esperanto (README.md,
Sources and licences). Not run by any test.

    python3 languages/eo/sources/build-corpus.py <kaikki.org-dictionary-Esperanto.jsonl> \
        <eo_full.txt> <hoshidicts-cli> [--languages <dir>]

The pool is every sense with `form_of` of an Esperanto entry: the form is the
entry's word, the lemma the sense's form_of word. Only single words of
Esperanto letters (a-z, ĉ ĝ ĥ ĵ ŝ ŭ, either case) that differ from their
lemma are kept, one row per form, lemma and category. The category comes
from the part of speech and the sense's tags; senses with other tags
(possessives, alternative spellings, nonstandard forms) are not used.

Each category takes the number of rows in QUOTAS, sampled with
random.Random(1): half from forms that are among the 10,000 most frequent
words of the frequency list (FrequencyWords' eo_full.txt, the "frequent"
rows) and half from all forms of the category ("any"), without repeating a
form. The rows the pack's final rules reach (hoshidicts-cli eval-language on
each row alone) go to tests/corpus.tsv, the others to tests/gaps.tsv after
its hand-written rows.
"""
import json
import os
import random
import re
import subprocess
import sys
import tempfile

args = sys.argv[1:]
if len(args) < 3:
    sys.exit(__doc__)
kaikki, frequency_file, cli = args[:3]
languages = 'languages'
if len(args) >= 5 and args[3] == '--languages':
    languages = args[4]
here = os.path.dirname(os.path.abspath(__file__))
tests = os.path.join(here, '..', 'tests')

WORD = re.compile(r'^[A-Za-zĉĝĥĵŝŭĈĜĤĴŜŬ]+$')
PARTICIPLE = {'active': {'present': 'ant', 'past': 'int', 'future': 'ont'},
              'passive': {'present': 'at', 'past': 'it', 'future': 'ot'}}


def category(pos, tags):
    """(category, rule) for a sense, or None when it is not used."""
    tags = set(tags) - {'form-of', 'nominative'}
    number = 'plural' if 'plural' in tags else 'singular'
    case = 'accusative' if 'accusative' in tags else ''
    declension = ' '.join(x for x in (case, number if number == 'plural' else '') if x) or 'singular'
    if pos == 'verb' and len(tags) == 1:
        tense = next(iter(tags))
        if tense in ('present', 'past', 'future', 'conditional', 'imperative'):
            return f'verb {tense}', 'v'
        return None
    if 'participle' in tags:
        voice = 'passive' if 'passive' in tags else 'active'
        tense = next((t for t in ('present', 'past', 'future') if t in tags), None)
        if tense is None or tags - {'participle', 'passive', 'active', 'present', 'past', 'future',
                                    'singular', 'plural', 'accusative', 'adverbial', 'nominal'}:
            return None
        if 'adverbial' in tags:
            return 'participle adverb', 'v'
        if 'nominal' in tags:
            return f'participle noun ({declension})', 'v'
        return f'participle adjective ({declension})', 'v'
    if tags - {'accusative', 'plural', 'singular'} or not tags:
        return None
    if pos == 'noun':
        return f'noun ({declension})', 'n'
    if pos == 'adj':
        return f'adjective ({declension})', 'adj'
    if pos == 'name':
        return 'name', '*'
    if pos in ('pron', 'det', 'num'):
        return 'pronoun or determiner', '*'
    return None


QUOTAS = {
    'verb present': 50, 'verb past': 50, 'verb future': 50, 'verb conditional': 50, 'verb imperative': 50,
    'participle adjective (singular)': 50, 'participle adjective (plural)': 40, 'participle adjective (accusative)': 30,
    'participle adjective (accusative plural)': 30,
    'participle noun (singular)': 40, 'participle noun (plural)': 20, 'participle noun (accusative)': 20,
    'participle noun (accusative plural)': 20,
    'participle adverb': 60,
    'noun (plural)': 70, 'noun (accusative)': 70, 'noun (accusative plural)': 70,
    'adjective (plural)': 50, 'adjective (accusative)': 50, 'adjective (accusative plural)': 50,
    'name': 40, 'pronoun or determiner': 40,
}

pool = {}
for line in open(kaikki, encoding='utf-8'):
    entry = json.loads(line)
    if entry.get('lang_code') != 'eo':
        continue
    form = entry['word']
    if not WORD.match(form):
        continue
    for sense in entry.get('senses', []):
        for target in sense.get('form_of', []):
            lemma = target.get('word', '')
            if not WORD.match(lemma) or lemma == form:
                continue
            found = category(entry['pos'], sense.get('tags', []))
            if found is None:
                continue
            name, rule = found
            pool.setdefault(name, {}).setdefault((form, lemma), rule)

frequent = set()
for line in open(frequency_file, encoding='utf-8'):
    word = line.split(' ')[0]
    frequent.add(word)
    if len(frequent) == 10000:
        break

rng = random.Random(1)
rows = []
used = set()
for name, quota in QUOTAS.items():
    pairs = sorted(pool.get(name, {}).items())
    half = quota // 2
    common = [p for p in pairs if p[0][0] in frequent or p[0][0].lower() in frequent]
    rng.shuffle(common)
    taken = []
    for (form, lemma), rule in common:
        if len(taken) == half:
            break
        if form not in used:
            used.add(form)
            taken.append((f'{name} (frequent)', form, lemma, rule))
    rest = list(pairs)
    rng.shuffle(rest)
    count = len(taken)
    for (form, lemma), rule in rest:
        if count == quota:
            break
        if form not in used:
            used.add(form)
            taken.append((f'{name} (any)', form, lemma, rule))
            count += 1
    rows += taken

header = [
    '# Source: kaikki.org, English Wiktionary extraction for Esperanto (https://kaikki.org/dictionary/Esperanto/),',
    '# extracted 2026-10-30 from the enwiktionary dump of 2026-10-01 (kaikki.org-dictionary-Esperanto.jsonl, sha256 3b2dc933f034ebcf),',
    '# CC BY-SA 4.0 and GFDL, by the Wiktionary contributors (https://en.wiktionary.org/). Form-of senses: the form and the word it is a form of.',
    f'# {len(rows)} rows sampled with seed 1 by sources/build-corpus.py, half from the 10,000 most frequent words of FrequencyWords eo_full (2018);',
    '# the rows the final rules reach are in corpus.tsv, the others in gaps.tsv.',
    '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)',
]

# Which rows do the final rules reach? eval-language on one file per row.
reached = []
with tempfile.TemporaryDirectory() as tmp:
    path = os.path.join(tmp, 'rows.tsv')
    for cat, form, lemma, rule in rows:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(f'x\t1\t{form}\t{lemma}\t{rule}\t*\n')
        out = subprocess.run([cli, '--languages', languages, 'eval-language', 'eo', path], capture_output=True, text=True, check=True)
        reached.append(json.loads(out.stdout)['recall'] == 1)

with open(os.path.join(tests, 'corpus.tsv'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(header) + '\n')
    for (cat, form, lemma, rule), ok in zip(rows, reached):
        if ok:
            f.write(f'{cat}\t1\t{form}\t{lemma}\t{rule}\t*\n')
gaps_file = os.path.join(tests, 'gaps.tsv')
hand = []
if os.path.exists(gaps_file):
    hand = [line for line in open(gaps_file, encoding='utf-8').read().splitlines()
            if line and not line.startswith('#') and not line.split('\t')[0].endswith(('(frequent)', '(any)'))]
with open(gaps_file, 'w', encoding='utf-8') as f:
    f.write('# Known failures: reported, not enforced (docs/languages.md 12.2).\n')
    f.write('# Rows whose category ends in (frequent) or (any) are the sampled rows of corpus.tsv the final rules do not reach;\n')
    f.write('# see corpus.tsv for their source and licence. The others are hand-written (README.md, Known gaps).\n')
    f.write('# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)\n')
    for line in hand:
        f.write(line + '\n')
    for (cat, form, lemma, rule), ok in zip(rows, reached):
        if not ok:
            f.write(f'{cat}\t1\t{form}\t{lemma}\t{rule}\t*\n')
print(f'eo: {len(rows)} rows, {sum(reached)} in corpus.tsv, {len(rows) - sum(reached)} in gaps.tsv', file=sys.stderr)
for name, quota in QUOTAS.items():
    have = sum(1 for r in rows if r[0].startswith(name + ' ('))
    if have < quota:
        print(f'  {name}: {have} of {quota} (pool {len(pool.get(name, {}))})', file=sys.stderr)
