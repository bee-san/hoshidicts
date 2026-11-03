#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes languages/tl/tests/corpus.tsv and the sampled rows of tests/gaps.tsv.

    python3 languages/tl/sources/build-corpus.py <unimorph tgl file> <kaikki Tagalog jsonl> [--cli build/hoshidicts-cli]

Two licensed sources, sampled with seed 1:

- UniMorph tgl (https://github.com/unimorph/tgl), CC BY-SA 3.0: verb forms
  with their root, which UniMorph gives as the lemma (kumain -> kain). A cell
  holds one form, or two forms separated by a space (nagbasa bumasa), or one
  form broken over a line break after a hyphen (ipinag- yabang, joined as
  ipinagyabang); accents and the
  apostrophe of a final glottal stop are removed, as text is written.
- kaikki.org's Tagalog extraction of English Wiktionary, CC BY-SA 4.0: the
  three aspects a verb's head template lists (complete, progressive,
  contemplative) with the verb's headword (kinain -> kainin), and the plural a
  ma- adjective's head template lists (magaganda -> maganda).

One row per (form, lemma), forms that differ from their lemma, single words
of Latin letters and hyphens. A row the pack's transforms.json reaches (the
lemma among the deinflections of the form, as `hoshidicts-cli deinflect`
gives them) goes to corpus.tsv, any other row to gaps.tsv, below the
hand-written rows gaps.tsv already has.
"""

import argparse
import json
import random
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

PACK = Path(__file__).resolve().parent.parent
REPO = PACK.parent.parent
UNIMORPH_SAMPLE = 900
KAIKKI_VERB_SAMPLE = 800
KAIKKI_ADJ_SAMPLE = 100
WORD = re.compile(r"^[a-z]+(?:-[a-z]+)*$")
MARK = '# sampled rows'


def clean(text):
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if not unicodedata.combining(c))
    return text.replace("'", '').replace('’', '').strip().lower()


def unimorph_pairs(path):
    pairs = {}
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.rstrip('\r')
        if not line:
            continue
        lemma, cell, features = line.split('\t')
        lemma = clean(lemma)
        if not WORD.match(lemma):
            continue
        # A form broken after a hyphen over a line break in the source
        # ("ipinag- yabang", "sinu- ngalingan") is joined without it.
        forms = []
        for piece in cell.split():
            if forms and forms[-1].endswith('-'):
                forms[-1] = forms[-1][:-1] + piece
            else:
                forms.append(piece)
        for form in forms:
            form = clean(form)
            if form != lemma and WORD.match(form):
                pairs.setdefault((form, lemma), features)
    return pairs




def kaikki_pairs(path):
    verbs = {}
    adjectives = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            entry = json.loads(line)
            pos = entry.get('pos')
            if pos not in ('verb', 'adj'):
                continue
            word = clean(entry.get('word', ''))
            if not WORD.match(word):
                continue
            for template in entry.get('head_templates') or []:
                args = template.get('args', {})
                if pos == 'verb' and template.get('name') == 'tl-verb':
                    for key, aspect in (('2', 'completive'), ('3', 'progressive'), ('4', 'contemplative')):
                        for form in (args.get(key) or '').split(','):
                            form = clean(form)
                            if form and form != word and WORD.match(form):
                                verbs.setdefault((form, word), f'verb, {aspect}')
                elif pos == 'adj' and template.get('name') == 'tl-adj' and word.startswith('ma'):
                    for form in (args.get('pl') or '').split(','):
                        form = clean(form)
                        if form and form != word and WORD.match(form):
                            adjectives.setdefault((form, word), 'adjective, plural')
    return verbs, adjectives


def reached(pairs, cli):
    inputs = '\n'.join(form for form, _ in pairs) + '\n'
    out = subprocess.run([cli, '--languages', str(REPO / 'languages'), 'deinflect', 'tl', '--stdin'],
                         input=inputs, capture_output=True, text=True, check=True).stdout.splitlines()
    assert len(out) == len(pairs)
    return [lemma in {r['text'] for r in json.loads(line)['results']} for (_, lemma), line in zip(pairs, out)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('unimorph')
    parser.add_argument('kaikki')
    parser.add_argument('--cli', default=str(REPO / 'build' / 'hoshidicts-cli'))
    args = parser.parse_args()

    rng = random.Random(1)
    um = unimorph_pairs(args.unimorph)
    verbs, adjectives = kaikki_pairs(args.kaikki)
    rows = []
    for name, pool, size in (('UniMorph', um, UNIMORPH_SAMPLE), ('kaikki verb', verbs, KAIKKI_VERB_SAMPLE),
                             ('kaikki adjective', adjectives, KAIKKI_ADJ_SAMPLE)):
        keys = sorted(pool)
        sample = sorted(rng.sample(keys, min(size, len(keys))))
        rows.extend((pool[key], key[0], key[1], name) for key in sample)
        print(f'{name}: {len(keys)} pairs, {len(sample)} sampled', file=sys.stderr)
    # One row per (form, lemma) across the sources: the first source keeps it.
    seen = set()
    rows = [r for r in rows if (r[1], r[2]) not in seen and not seen.add((r[1], r[2]))]
    ok = reached([(form, lemma) for _, form, lemma, _ in rows], args.cli)

    header = [
        '# Sources: UniMorph tgl (https://github.com/unimorph/tgl, commit 799d79de338d1370ebfbeabb9823a0e8f86a2b6a, file tgl,',
        '# sha256 84bcc773fde9430d9c8f9d10c72cd4ebca6410eac0eb8408accf0fd6b49e840b), CC BY-SA 3.0, by the UniMorph contributors',
        '# (categories with ";", lemma = the root); and kaikki.org\'s Tagalog extraction of English Wiktionary (2026-10-30,',
        '# kaikki.org-dictionary-Tagalog.jsonl sha256 d2824e2bc07e4fac812b936a099226df30159180fa73988e5976b2b1d501b146),',
        '# CC BY-SA 4.0, by the Wiktionary contributors (categories "verb, ..." and "adjective, plural", lemma = the headword).',
        f'# {UNIMORPH_SAMPLE} + {KAIKKI_VERB_SAMPLE} + {KAIKKI_ADJ_SAMPLE} rows sampled with seed 1 by sources/build-corpus.py; the rows the final rules do not',
        '# reach are in gaps.tsv.',
    ]
    columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)'
    corpus = [f'{cat}\t1\t{form}\t{lemma}\t*\t*' for (cat, form, lemma, _), hit in zip(rows, ok) if hit]
    gaps = [f'{cat}\t1\t{form}\t{lemma}\t*\t*' for (cat, form, lemma, _), hit in zip(rows, ok) if not hit]
    (PACK / 'tests' / 'corpus.tsv').write_text('\n'.join(header + [columns] + corpus) + '\n', encoding='utf-8')

    gaps_file = PACK / 'tests' / 'gaps.tsv'
    kept = []
    if gaps_file.exists():
        for line in gaps_file.read_text(encoding='utf-8').splitlines():
            if line.startswith(MARK):
                break
            kept.append(line)
    if not kept:
        kept = ['# Known gaps: run by the conformance test and counted, not enforced.', columns]
    gaps_file.write_text('\n'.join(kept + [f'{MARK} of corpus.tsv\'s sources that the final rules do not reach (sources/build-corpus.py)']
                                   + gaps) + '\n', encoding='utf-8')
    by_source = {}
    for (_, _, _, name), hit in zip(rows, ok):
        a, b = by_source.get(name, (0, 0))
        by_source[name] = (a + hit, b + 1)
    for name, (a, b) in by_source.items():
        print(f'{name}: {a} / {b} reached ({100 * a / b:.2f}%)', file=sys.stderr)
    print(f'corpus.tsv {len(corpus)} rows, gaps.tsv {len(gaps)} sampled rows; recall {100 * len(corpus) / len(rows):.2f}%', file=sys.stderr)


if __name__ == '__main__':
    main()
