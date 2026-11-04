#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Samples tests/corpus.tsv and tests/gaps.tsv (docs/languages.md 12.2).

    python3 languages/pt/sources/build-corpus.py <unimorph por file> <wty-pt-en.zip> [--cli <hoshidicts-cli>] [--out <tests dir>]

Two licensed sources, both from English Wiktionary:

- UniMorph por (https://github.com/unimorph/por/blob/fc2778e08e2da476d9d2f27f15f218b1cbb25ad5/por,
  sha256 af71c94afbb857b3875817d8edb8ea4a1211d902326b74de4d86de85ea348944),
  CC BY-SA 3.0, by the UniMorph contributors: verbs only. 14 rows are drawn
  from each tag set (seed 1), one row per form and lemma.
- wty-pt-en 2026.10.22 (https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/pt/en/wty-pt-en.zip,
  sha256 90c8e8fe98818163c21ea84ac4dbc8683395c8b696b312054744e5739bfe8ee8),
  CC BY-SA 4.0, Wiktionary through kaikki.org and wiktionary-to-yomitan:
  form-of rows of plurals, feminines, diminutives, superlatives and verb forms
  with attached pronouns, whose target is a lemma row of the dictionary.

Rows the pack's rules reach (the CLI's deinflections of the source include
the lemma with a compatible condition) go to corpus.tsv, the others to
gaps.tsv; hand-written rows of gaps.tsv (category starting with "hand:") are
kept. Prints the counts as JSON.
"""
import argparse
import hashlib
import json
import random
import re
import subprocess
import sys
import zipfile
from collections import OrderedDict, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
UNIMORPH_SHA256 = 'af71c94afbb857b3875817d8edb8ea4a1211d902326b74de4d86de85ea348944'
WTY_SHA256 = '90c8e8fe98818163c21ea84ac4dbc8683395c8b696b312054744e5739bfe8ee8'
SEED = 1
PER_TAG = 14
WTY_QUOTAS = OrderedDict([('plural', 250), ('feminine', 150), ('diminutive', 80), ('superlative', 60), ('verb with pronouns', 120)])
WORD = re.compile(r'^[a-zà-öø-ÿ]+$')
HYPHENATED = re.compile(r'^[a-zà-öø-ÿ]+(-[a-zà-öø-ÿ]+)+$')
PRONOUN = r'(me|te|se|lhe|lhes|nos|vos|o|a|os|as|lo|la|los|las|no|na|mo|ma|mos|mas|to|ta|tos|tas|lho|lha|lhos|lhas)'
CLITIC = re.compile(rf'-{PRONOUN}(-[a-zàáâãéêíóôõúç]+)?$')
# Labels that are spellings, registers or other relations, not inflections.
NOT_INFLECTION = re.compile(r'\b(alternative|alt-of|misspelling|obsolete|archaic|abbreviation|pronunciation-spelling|nonstandard|'
                            r'dated|proscribed|Internet|dialectal|rare|eye-dialect|uncommon|standard|hypercorrect|misconstruction)\b|masculine/feminine')
# A form wty-pt-en 2026.10.22 writes for hundreds of unrelated lemmas, a parse
# artifact of the conversion (Wiktionary's "metaphonic" plural label).
ARTIFACTS = {'metaphonic'}
VERB_LABEL = re.compile(r'person|gerund|infinitive|imperative|indicative|subjunctive|conditional|preterite')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def kind(label, form):
    if NOT_INFLECTION.search(label):
        return None
    if VERB_LABEL.search(label) and 'participle' not in label:
        return 'verb with pronouns' if CLITIC.search(form) else None
    if 'participle' in label or 'augmentative' in label or 'comparative' in label:
        return None
    if 'superlative' in label:
        return 'superlative'
    if 'diminutive' in label:
        return 'diminutive'
    if 'plural' in label:
        return 'plural'
    if 'feminine' in label or 'female equivalent' in label:
        return 'feminine'
    return None


PREFERRED = {'plural': ['n', 'adj'], 'feminine': ['adj', 'n'], 'diminutive': ['n', 'adj'], 'superlative': ['adj', 'n'], 'verb with pronouns': ['v']}


def unimorph_rows(path):
    by_tag = defaultdict(list)
    seen = set()
    for line in open(path, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) != 3:
            continue
        lemma, form, tags = parts
        if form == lemma or (form, lemma) in seen or not WORD.match(form) or not WORD.match(lemma.replace('-', '')):
            continue
        seen.add((form, lemma))
        by_tag[tags].append((form, lemma))
    rng = random.Random(SEED)
    rows = []
    for tags in sorted(by_tag):
        pairs = by_tag[tags]
        for form, lemma in rng.sample(pairs, min(PER_TAG, len(pairs))):
            rows.append((tags, form, lemma, 'v'))
    return rows


def wty_rows(path, taken):
    z = zipfile.ZipFile(path)
    lemma_pos = defaultdict(set)
    # Every label a row gives a (form, lemma) pair, in bank order: a pair is
    # an inflection only when none of its labels is a spelling or register.
    labels = OrderedDict()
    for name in sorted(n for n in z.namelist() if n.startswith('term_bank')):
        for row in json.loads(z.read(name)):
            expression, tags, definitions = row[0], row[2].split(), row[5]
            if 'non-lemma' in tags:
                for d in definitions:
                    if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0]:
                        labels.setdefault((expression, d[0]), []).append(' '.join(d[1]))
            else:
                lemma_pos[expression].update(t for t in tags if t in ('n', 'adj', 'v'))
    pools = defaultdict(OrderedDict)
    for (form, lemma), pair_labels in labels.items():
        if form in ARTIFACTS or any(NOT_INFLECTION.search(l) for l in pair_labels):
            continue
        k = next((kind(l, form) for l in pair_labels if kind(l, form) is not None), None)
        if k is None or form == lemma or (form, lemma) in taken or not lemma_pos.get(lemma):
            continue
        if not (WORD.match(form) or (k == 'verb with pronouns' and HYPHENATED.match(form))):
            continue
        rule = next((p for p in PREFERRED[k] if p in lemma_pos[lemma]), None)
        if rule is None:
            continue
        pools[k].setdefault((form, lemma), rule)
    rng = random.Random(SEED)
    rows = []
    for k, quota in WTY_QUOTAS.items():
        pairs = list(pools[k].items())
        for (form, lemma), rule in rng.sample(pairs, min(quota, len(pairs))):
            rows.append((f'wty {k}', form, lemma, rule))
    return rows


def run(cli, languages, command, inputs):
    p = subprocess.run([cli, '--languages', str(languages), command, 'pt', '--stdin', '--all-options'],
                       input='\n'.join(inputs) + '\n', capture_output=True, text=True, check=True)
    return [json.loads(line) for line in p.stdout.splitlines()]


def reached(cli, languages, rows):
    # As the conformance test does (12.2): the source goes through the
    # pack's preprocessors, and each variant is deinflected.
    sources = sorted({form for _, form, _, _ in rows})
    variants = {d['input']: [v['text'] for v in d['variants']] for d in run(cli, languages, 'preprocess', sources)}
    texts = sorted({t for vs in variants.values() for t in vs})
    results = {d['input']: d['results'] for d in run(cli, languages, 'deinflect', texts)}
    # Conditions compatible with a row's rule (docs/languages.md 12.2): 0, or one the rule names.
    ok = []
    for row in rows:
        _, form, lemma, rule = row
        ok.append(any(r['text'] == lemma and (not r['conditions'] or rule in r['conditions'])
                      for text in variants.get(form, [form]) for r in results.get(text, [])))
    return ok


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('unimorph')
    parser.add_argument('wty')
    parser.add_argument('--cli', default=str(HERE.parents[2] / 'build' / 'hoshidicts-cli'))
    parser.add_argument('--out', default=str(HERE.parent / 'tests'))
    args = parser.parse_args()
    for path, expected in ((args.unimorph, UNIMORPH_SHA256), (args.wty, WTY_SHA256)):
        if sha256(path) != expected:
            sys.exit(f'{path}: sha256 is not {expected}')
    rows = unimorph_rows(args.unimorph)
    rows += wty_rows(args.wty, {(f, l) for _, f, l, _ in rows})
    ok = reached(args.cli, HERE.parents[1], rows)
    out = Path(args.out)
    header = [
        '# Sources: UniMorph por (https://github.com/unimorph/por/blob/fc2778e08e2da476d9d2f27f15f218b1cbb25ad5/por, sha256 af71c94afbb857b3), '
        'CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary (categories with ";");',
        '# and wty-pt-en 2026.10.22 (wiktionary-to-yomitan, sha256 90c8e8fe98818163), CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), '
        'by the Wiktionary contributors through kaikki.org (categories "wty ...").',
        f'# {len(rows)} rows sampled with seed {SEED} by sources/build-corpus.py ({PER_TAG} per UniMorph tag set; '
        + ', '.join(f'{q} wty {k}' for k, q in WTY_QUOTAS.items()) + '); the rows the pack\'s rules reach are in corpus.tsv, the others in gaps.tsv.',
    ]
    columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)'
    line = lambda r: '\t'.join([r[0], '1', r[1], r[2], r[3], '*'])
    (out / 'corpus.tsv').write_text('\n'.join(header + [columns] + [line(r) for r, k in zip(rows, ok) if k]) + '\n', encoding='utf-8')
    gaps_file = out / 'gaps.tsv'
    hand = []
    if gaps_file.exists():
        hand = [l for l in gaps_file.read_text(encoding='utf-8').splitlines() if l and not l.startswith('#') and l.startswith('hand:')]
    gaps_header = ['# Known gaps: run by the conformance test and counted, not enforced.',
                   '# Rows whose category starts with "hand:" are written for this pack (GPL-3.0-or-later), no third-party data.'] + header
    gaps_file.write_text('\n'.join(gaps_header + [columns] + hand + [line(r) for r, k in zip(rows, ok) if not k]) + '\n', encoding='utf-8')
    by = defaultdict(lambda: [0, 0])
    for r, k in zip(rows, ok):
        group = r[0] if r[0].startswith('wty') else ('verb, gerund or participle' if 'PTCP' in r[0] else 'verb, finite or infinitive')
        by[group][0 if k else 1] += 1
    print(json.dumps({'sampled': len(rows), 'corpus': sum(ok), 'gaps': len(rows) - sum(ok), 'recall': round(sum(ok) / len(rows), 4),
                      'by': {g: {'reached': a, 'missed': b} for g, (a, b) in sorted(by.items())}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
