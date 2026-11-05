#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The mutation check of docs/languages.md section 14 step 7. Not run by any test.

    python3 mutate.py <scratch dir> [--cli-dir build] [--suggest <words> <headwords>]

For every transform and stem constraint its rules use, a copy of the pack loses that constraint and the conformance
test runs on it; prints the mutations no test notices. --suggest lists words of <words> the copy deinflects to a new
text (those in <headwords> first): candidates for a negative row of tests/cases.tsv.
"""
import json, shutil, subprocess, sys
from pathlib import Path

args = sys.argv[1:]
scratch = Path(args.pop(0))
build = Path(args[args.index('--cli-dir') + 1]) if '--cli-dir' in args else Path('build')
suggest = args[args.index('--suggest') + 1:args.index('--suggest') + 3] if '--suggest' in args else None
here = Path(__file__).resolve().parent
pack = here.parent
base = json.loads((pack / 'transforms.json').read_text(encoding='utf-8'))
KEYS = ['stemMinLength', 'stemCharacters', 'stemContains', 'stemStartsWith', 'stemEndsWith', 'stemNotStartsWith', 'stemNotEndsWith',
        'stemStartsWithText', 'stemNotStartsWithText']

mutations = []
for ti, t in enumerate(base['transforms']):
    seen = set()
    for r in t['rules']:
        for k in KEYS:
            if k in r and k not in seen:
                seen.add(k)
                mutations.append((ti, t['id'], k))
print(f'{len(mutations)} mutations', flush=True)
unnoticed = []
for ti, tid, key in mutations:
    copy = scratch / 'grc'
    if copy.exists():
        shutil.rmtree(copy)
    shutil.copytree(pack, copy)
    data = json.loads(json.dumps(base))
    for r in data['transforms'][ti]['rules']:
        r.pop(key, None)
    (copy / 'transforms.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    w = subprocess.run(['node', str(pack.parent.parent / 'tools' / 'check-classes.mjs'), 'grc', '--write', '--languages', str(scratch)], capture_output=True, text=True)
    if w.returncode != 0:
        print(f'{tid} {key}: check-classes failed: {w.stderr.strip()[:200]}', flush=True)
        continue
    c = subprocess.run([str(build / 'language-conformance-test'), str(copy), str(scratch / 'work')], capture_output=True, text=True)
    noticed = c.returncode != 0
    if not noticed:
        unnoticed.append((tid, key))
    print(f'{"noticed  " if noticed else "UNNOTICED"} {tid} {key}', flush=True)
    if not noticed and suggest:
        words = Path(suggest[0]).read_text(encoding='utf-8').split()
        # And texts made from the transform's own affixes: alone, after one letter, after a word and a space.
        for r in base['transforms'][ti]['rules']:
            affixes = [r['inflected']] if r['type'] in ('suffix', 'prefix', 'wholeWord') else [s for s, _ in r.get('suffixes', [])] + [p for p, _ in r.get('prefixes', [])]
            for a in affixes:
                if a and r['type'] != 'prefix':
                    words += [a, 'τ' + a, 'ἀ' + a, 'λόγος ' + a]
                elif a:
                    words += [a, a + 'α', a + 'ν']
        heads = set(Path(suggest[1]).read_text(encoding='utf-8').split('\n'))
        words = list(dict.fromkeys(words))
        out = {}
        for name, langs in (('pack', pack.parent), ('copy', scratch)):
            cli = [str(build / 'hoshidicts-cli'), '--languages', str(langs)]
            pre = subprocess.run(cli + ['preprocess', 'grc', '--stdin', '--all-options'], input='\n'.join(words) + '\n', capture_output=True, text=True).stdout
            variants = [[v['text'] for v in json.loads(l)['variants']] for l in pre.splitlines()]
            flat = sorted({v for vs in variants for v in vs})
            run = subprocess.run(cli + ['deinflect', 'grc', '--stdin', '--all-options'], input='\n'.join(flat) + '\n', capture_output=True, text=True)
            texts = {json.loads(l)['input']: {r['text'] for r in json.loads(l)['results']} for l in run.stdout.splitlines()}
            out[name] = [set().union(*(texts.get(v, set()) for v in vs)) for vs in variants]
        found = [(w, t) for w, a, b in zip(words, out['pack'], out['copy']) for t in sorted(b - a)]
        found.sort(key=lambda x: (x[1] not in heads, len(x[0])))
        print('    candidates: ' + '; '.join(f'{w} → {t}{" (headword)" if t in heads else ""}' for w, t in found[:6]), flush=True)
print(f'{len(unnoticed)} of {len(mutations)} mutations pass every test:')
for tid, key in unnoticed:
    print(f'  {tid} {key}')
