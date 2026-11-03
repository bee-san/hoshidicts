#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements for the aii pack (README.md, Measurements).

    python3 languages/aii/sources/measure.py misses <file.tsv> [--transforms F] [--options default|all]
    python3 languages/aii/sources/measure.py candidates <file.tsv> --headwords <wty-aii-en.zip> [--transforms F]
    python3 languages/aii/sources/measure.py firstrank <file.tsv> --dictionary <imported dir> [--unpointed]

All modes take --languages <dir> (default: this checkout's languages/), so
a scratch copy of the pack can be measured.

misses: the valid=1 rows whose lemma is not among the deinflections of the
source (after the pack's preprocessors), by category, with examples.
candidates: per category, recall and the mean number of deinflected texts
that are headwords of the dictionary other than the source and the lemma
(eval-language's falseCandidates without the part-of-speech filter, which
wty-aii-en cannot apply), and the rules behind them.

misses and candidates run build/hoshidicts-cli (--cli to change it) twice:
preprocess and deinflect, each over all inputs at once. firstrank looks each
source up with build/aii-lookup-batch (sources/lookup-batch.cpp; --lookup to
change it), as a host does, and counts the rows whose first result is the
lemma and those that find it at all.
"""
import argparse
import collections
import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def read_tsv(path):
    rows = []
    options = 'all'
    with open(path, encoding='utf-8') as f:
        for i, line in enumerate(f):
            line = line.rstrip('\n')
            if i == 0 and line == '# options: default':
                options = 'default'
            if not line or line.startswith('#'):
                continue
            cat, valid, source, term, rule, reasons = (line.split('\t') + [''] * 6)[:6]
            rows.append({'category': cat, 'valid': valid == '1', 'source': source, 'term': term, 'reasons': reasons})
    return rows, options


LANGUAGES = [str(ROOT / 'languages')]


def run(cli, args, inputs):
    text = ''.join(s + '\n' for s in inputs)
    out = subprocess.run([cli, '--languages', LANGUAGES[0]] + args, input=text,
                         capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def deinflections(cli, sources, transforms=None, options='all'):
    """For each source: list of (text, trace, steps) over its processor variants."""
    opt = ['--all-options'] if options == 'all' else []
    pre = run(cli, ['preprocess', 'aii', '--stdin'] + opt, sources)
    variants = []
    owners = []
    for i, p in enumerate(pre):
        for v in p['variants']:
            variants.append(v['text'])
            owners.append((i, v['steps']))
    args = ['deinflect', 'aii', '--stdin'] + opt
    if transforms:
        args += ['--transforms', transforms]
    res = run(cli, args, variants)
    out = [[] for _ in sources]
    for (i, steps), r in zip(owners, res):
        for x in r['results']:
            out[i].append((x['text'], tuple(x['trace']), steps))
    return out


def headwords(zip_path):
    words = set()
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if name.startswith('term_bank_'):
                for row in json.loads(z.read(name)):
                    defs = row[5]
                    if any(not (isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and isinstance(d[1], list)) for d in defs):
                        words.add(row[0])
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['misses', 'candidates', 'firstrank'])
    ap.add_argument('tsv')
    ap.add_argument('--cli', default=str(ROOT / 'build' / 'hoshidicts-cli'))
    ap.add_argument('--lookup', default=str(ROOT / 'build' / 'aii-lookup-batch'))
    ap.add_argument('--languages', default=str(ROOT / 'languages'))
    ap.add_argument('--dictionary')
    ap.add_argument('--unpointed', action='store_true')
    ap.add_argument('--transforms')
    ap.add_argument('--options', choices=['all', 'default'])
    ap.add_argument('--headwords')
    ap.add_argument('--examples', type=int, default=6)
    args = ap.parse_args()
    LANGUAGES[0] = args.languages
    rows, options = read_tsv(args.tsv)
    options = args.options or options
    rows = [r for r in rows if r['valid']]
    if args.mode == 'firstrank':
        # A lookup of each source as a host makes it (no options), pointed as
        # written or unpointed: is the lemma the first result, and is it there?
        import re as _re
        marks = _re.compile('[\u0303\u0304\u0307\u0308\u0323\u032E\u0330\u0331\u0711\u0730-\u074A]')
        texts = [marks.sub('', r['source']) if args.unpointed else r['source'] for r in rows]
        out = subprocess.run([args.lookup, args.languages, args.dictionary], input=''.join(t + '\n' for t in texts),
                             capture_output=True, text=True, check=True).stdout.splitlines()
        cats = collections.defaultdict(lambda: [0, 0, 0])
        wrong = collections.Counter()
        wrong_ex = collections.defaultdict(list)
        for r, line in zip(rows, out):
            res = json.loads(line)['results']
            c = cats[r['category']]
            c[0] += 1
            exprs = [x['expression'] for x in res]
            if exprs and exprs[0] == r['term']:
                c[1] += 1
            elif res:
                key = res[0]['trace'][-1] if res[0]['trace'] else '(as written)'
                wrong[key] += 1
                if len(wrong_ex[key]) < args.examples:
                    wrong_ex[key].append(f"{texts[rows.index(r)] if False else r['source']}→{exprs[0]} (want {r['term']})")
            if r['term'] in exprs:
                c[2] += 1
        n = sum(c[0] for c in cats.values())
        print(f'rows {n}, first {sum(c[1] for c in cats.values()) / n:.4f}, found {sum(c[2] for c in cats.values()) / n:.4f}')
        for cat in sorted(cats):
            c = cats[cat]
            print(f'  {cat}: rows {c[0]}, first {c[1] / c[0]:.3f}, found {c[2] / c[0]:.3f}')
        print('wrong first results by the last rule of their trace:')
        for key, cnt in wrong.most_common(20):
            print(f'  {key}: {cnt}  e.g. ' + '  '.join(wrong_ex[key]))
        return
    results = deinflections(args.cli, [r['source'] for r in rows], args.transforms, options)
    by_cat = collections.defaultdict(lambda: [0, 0])
    if args.mode == 'misses':
        examples = collections.defaultdict(list)
        for r, res in zip(rows, results):
            hit = any(t == r['term'] for t, _tr, _s in res)
            by_cat[r['category']][0] += 1
            if not hit:
                by_cat[r['category']][1] += 1
                examples[r['category']].append(f"{r['source']}→{r['term']}")
        total = sum(v[0] for v in by_cat.values())
        missed = sum(v[1] for v in by_cat.values())
        print(f'rows {total}, reached {total - missed} ({(total - missed) / total:.4f}), missed {missed}')
        for cat in sorted(by_cat, key=lambda c: -by_cat[c][1]):
            n, m = by_cat[cat]
            if m:
                print(f'  {cat}: {m}/{n} missed  e.g. ' + '  '.join(examples[cat][:args.examples]))
    else:
        hw = headwords(args.headwords)
        fc_rules = collections.Counter()
        fc_examples = collections.defaultdict(list)
        cat_fc = collections.defaultdict(lambda: [0, 0, 0])
        for r, res in zip(rows, results):
            texts = {}
            for t, tr, _s in res:
                texts.setdefault(t, tr)
            false = [t for t in texts if t in hw and t != r['term'] and t != r['source']]
            c = cat_fc[r['category']]
            c[0] += 1
            c[1] += int(r['term'] in texts)
            c[2] += len(false)
            for t in false:
                key = texts[t][0] if texts[t] else '(processor)'
                fc_rules[key] += 1
                if len(fc_examples[key]) < args.examples:
                    fc_examples[key].append(f"{r['source']}→{t}")
        n = sum(c[0] for c in cat_fc.values())
        print(f'rows {n}, recall {sum(c[1] for c in cat_fc.values()) / n:.4f}, false candidates per row {sum(c[2] for c in cat_fc.values()) / n:.3f}')
        for cat in sorted(cat_fc):
            c = cat_fc[cat]
            print(f'  {cat}: rows {c[0]}, recall {c[1] / c[0]:.3f}, false {c[2] / c[0]:.3f}')
        print('false candidates by the last rule of their trace:')
        for key, cnt in fc_rules.most_common(25):
            print(f'  {key}: {cnt}  e.g. ' + '  '.join(fc_examples[key]))


if __name__ == '__main__':
    main()
