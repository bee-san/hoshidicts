#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Builds tests/corpus.tsv and tests/gaps.tsv for the Yiddish pack.

    python3 languages/yi/sources/build-corpus.py <kaikki.org-dictionary-Yiddish.jsonl> <wty-yi-en term banks dir>

Samples 1,000 inflected form -> lemma pairs with seed 1 from the inflection
tables of English Wiktionary's Yiddish entries, as kaikki.org extracts them
(wiktextract). Forms come from the entries' tables (yi-conj, yi-decl) and
their plural and diminutive lines; a pair is kept when the form is written
in Hebrew letters and points (and, for separable verbs, one space), differs
from its lemma, and the lemma is a headword with definitions in wty-yi-en.
One row per form, lemma and part of speech.

The rows the pack's rules reach (`build/hoshidicts-cli deinflect yi`, the
term among the deinflections with a compatible condition) go to corpus.tsv,
the others to gaps.tsv.
"""

import collections
import glob
import json
import os
import random
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PACK))
CLI = os.path.join(REPO, 'build', 'hoshidicts-cli')

WORD = re.compile(r'^[\u05D0-\u05EA\u05F0-\u05F2\u05B0-\u05C7]+$')
SEPARABLE = re.compile(r'^[\u05D0-\u05EA\u05F0-\u05F2\u05B0-\u05C7]+ [\u05D0-\u05EA\u05F0-\u05F2\u05B0-\u05C7]+$')
PRONOUNS = {'איך': '1sg', 'דו': '2sg', 'ער': '3sg', 'מיר': '1pl', 'איר': '2pl', 'זיי': '3pl'}
# Wiktionary tags of the adjective table, by the ending they take.
CASES = {'nominative', 'accusative', 'dative'}

# Category -> number of rows in the sample.
TARGETS = {
    'present-1sg': 70, 'present-2sg': 70, 'present-3sg': 70, 'present-pl': 21, 'present-separable': 75,
    'imperative': 2, 'past-participle': 112, 'present-participle': 40,
    'noun-plural': 250, 'noun-diminutive': 60,
    'adjective-declined': 180, 'adjective-comparative': 25, 'adjective-superlative': 25,
}
RULE = {'present': 'v', 'imperative': 'v', 'past': 'v', 'noun': 'n', 'adjective': 'adj'}


def headwords(bank_dir):
    """wty-yi-en headwords that have a row with definitions (not only form-of references)."""
    out = set()
    for path in sorted(glob.glob(os.path.join(bank_dir, 'term_bank_*.json'))):
        with open(path, encoding='utf-8') as f:
            for row in json.load(f):
                if any(not isinstance(d, list) for d in row[5]):
                    out.add(row[0])
    return out


def pairs(kaikki):
    """(category, form, lemma) for every usable form of every entry."""
    with open(kaikki, encoding='utf-8') as f:
        for line in f:
            entry = json.loads(line)
            lemma, pos = entry['word'], entry.get('pos')
            if not WORD.match(lemma):
                continue
            for form in entry.get('forms', []):
                tags = set(form.get('tags', []))
                text = form['form']
                if pos == 'verb':
                    if tags == {'present'}:
                        pronoun, _, rest = text.partition(' ')
                        person = PRONOUNS.get(pronoun)
                        if person is None:
                            continue
                        if SEPARABLE.match(rest):
                            yield 'present-separable', rest, lemma
                        elif person in ('1pl', '3pl'):
                            yield 'present-pl', rest, lemma
                        elif person == '2pl':
                            yield 'present-3sg', rest, lemma
                        else:
                            yield 'present-' + person, rest, lemma
                    elif tags == {'imperative'}:
                        yield 'imperative', re.sub(r' \((דו|איר)\)$', '', text), lemma
                    elif tags == {'participle', 'past'}:
                        yield 'past-participle', text, lemma
                    elif tags == {'participle', 'present'}:
                        yield 'present-participle', text, lemma
                elif pos == 'noun' and tags == {'canonical'}:
                    for key, category in (('plural ', 'noun-plural'), ('diminutive ', 'noun-diminutive')):
                        if text.startswith(key):
                            yield category, text[len(key):], lemma
                elif pos == 'adj':
                    if tags == {'comparative'}:
                        yield 'adjective-comparative', text, lemma
                    elif tags == {'superlative'}:
                        yield 'adjective-superlative', text, lemma
                    elif tags & CASES and not tags - CASES - {'masculine', 'feminine', 'neuter', 'plural', 'definite', 'indefinite', 'postpositional'}:
                        yield 'adjective-declined', text, lemma


HEADER = ('# Source: English Wiktionary\'s Yiddish inflection tables as extracted by kaikki.org (wiktextract 19f9a30, '
          'enwiktionary dump of 2026-10-01; kaikki.org-dictionary-Yiddish.jsonl, sha256 b3ec2901...921a), '
          'CC BY-SA 4.0 and GFDL, by the Wiktionary contributors. 1,000 rows sampled with seed 1 by sources/build-corpus.py; '
          '{note}\n'
          '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)\n')


def sample(kaikki, bank_dir):
    known = headwords(bank_dir)
    by_category = collections.defaultdict(list)
    seen = set()
    for category, form, lemma in pairs(kaikki):
        rule = RULE[category.split('-')[0]]
        key = (form, lemma, rule)
        if key in seen or form == lemma or lemma not in known:
            continue
        if not (WORD.match(form) or (category == 'present-separable' and SEPARABLE.match(form))):
            continue
        seen.add(key)
        by_category[category].append((form, lemma, rule))
    rng = random.Random(1)
    rows = []
    for category, count in TARGETS.items():
        candidates = sorted(by_category[category])
        picked = rng.sample(candidates, min(count, len(candidates)))
        rows.extend((category, form, lemma, rule) for form, lemma, rule in sorted(picked))
    return rows, {c: len(v) for c, v in by_category.items()}


def failing_lines(rows, scratch):
    """Lines of a corpus.tsv holding `rows` that the pack's conformance test fails."""
    import shutil
    pack = os.path.join(scratch, 'yi')
    shutil.rmtree(pack, ignore_errors=True)
    os.makedirs(os.path.join(pack, 'tests'))
    for name in ('language.json', 'transforms.json', 'README.md'):
        shutil.copy(os.path.join(PACK, name), pack)
    with open(os.path.join(pack, 'tests', 'corpus.tsv'), 'w', encoding='utf-8') as f:
        f.write(HEADER.format(note='scratch copy.'))
        for category, form, lemma, rule in rows:
            f.write(f'{category}\t1\t{form}\t{lemma}\t{rule}\t*\n')
    test = os.path.join(REPO, 'build', 'language-conformance-test')
    run = subprocess.run([test, pack, os.path.join(scratch, 'work')], capture_output=True, text=True)
    lines = set(int(m) for m in re.findall(r'tests/corpus\.tsv:(\d+): .* is not among the deinflections', run.stdout + run.stderr))
    return lines, len(HEADER.format(note='').splitlines())


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    kaikki, bank_dir = sys.argv[1:]
    rows, available = sample(kaikki, bank_dir)
    scratch = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'yi-corpus-split')
    failing, header = failing_lines(rows, scratch)
    reached = [r for i, r in enumerate(rows) if i + header + 1 not in failing]
    missed = [r for i, r in enumerate(rows) if i + header + 1 in failing]
    tests = os.path.join(PACK, 'tests')
    with open(os.path.join(tests, 'corpus.tsv'), 'w', encoding='utf-8') as f:
        f.write(HEADER.format(note=f'the {len(reached)} rows the final rules reach (the other {len(missed)} are in gaps.tsv).'))
        for category, form, lemma, rule in reached:
            f.write(f'{category}\t1\t{form}\t{lemma}\t{rule}\t*\n')
    with open(os.path.join(tests, 'gaps.tsv'), 'w', encoding='utf-8') as f:
        f.write(HEADER.format(note=f'the {len(missed)} rows the final rules do not reach (Known gaps in README.md).'))
        for category, form, lemma, rule in missed:
            f.write(f'{category}\t1\t{form}\t{lemma}\t{rule}\t*\n')
    print(f'{len(rows)} rows: {len(reached)} in corpus.tsv, {len(missed)} in gaps.tsv')
    for category in TARGETS:
        n = sum(1 for r in rows if r[0] == category)
        m = sum(1 for r in missed if r[0] == category)
        print(f'  {category}: {n} sampled of {available.get(category, 0)}, {m} missed')


if __name__ == '__main__':
    main()
