#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Mutation checks of docs/languages.md 14 step 7 for languages/eo (README.md,
# Measurements). Not run by any test. Run from anywhere:
#
#   python3 languages/eo/sources/mutate.py <repo> <work dir> [count]
#
# The mutations run in scratch copies under <work dir>, never in the
# checkout: every stem constraint removed (per transform), every stem
# minimum lowered by one, every whole-word rule removed, every transform
# removed, every transform's conditionsOut and conditionsIn emptied, every
# preprocessor removed, and the optional processor and transform turned on
# by default. Each copy gets its own tests/classes.json (tools/check-
# classes.mjs, with node from PATH) and is checked with build/language-
# conformance-test. A mutation that every test survives is printed as
# SURVIVED. [count] stops after that many mutations.
import copy
import json
import os
import shutil
import subprocess
import sys

repo, work = sys.argv[1], sys.argv[2]
pack = os.path.join(repo, 'languages', 'eo')
node = shutil.which('node') or sys.exit('node is not on PATH')
conformance = os.path.join(repo, 'build', 'language-conformance-test')

base = json.load(open(os.path.join(pack, 'transforms.json'), encoding='utf-8'))
language = json.load(open(os.path.join(pack, 'language.json'), encoding='utf-8'))

CONSTRAINTS = ('stemMinLength', 'stemCharacters', 'stemNotStartsWith', 'stemNotEndsWith', 'stemStartsWith', 'stemEndsWith',
               'stemNotStartsWithText', 'stemStartsWithText')


def mutations():
    # 1. Each constraint key, removed from every rule of one transform at a
    #    time (a transform's rules share their constraints).
    for ti, t in enumerate(base['transforms']):
        keys = sorted({k for r in t['rules'] for k in r if k in CONSTRAINTS})
        for key in keys:
            def edit(d, ti=ti, key=key):
                for r in d['transforms'][ti]['rules']:
                    r.pop(key, None)
            yield f'{t["id"]}: without {key}', edit, None
        # A minimum lowered by one, where it is above 1.
        mins = sorted({r.get('stemMinLength', 0) for r in t['rules']})
        for m in mins:
            if m >= 2:
                def edit(d, ti=ti, m=m):
                    for r in d['transforms'][ti]['rules']:
                        if r.get('stemMinLength') == m:
                            r['stemMinLength'] = m - 1
                yield f'{t["id"]}: stemMinLength {m} → {m - 1}', edit, None
    # 2. Each whole-word rule removed (the pronoun and correlative lists).
    for ti, t in enumerate(base['transforms']):
        for ri, r in enumerate(t['rules']):
            if r['type'] == 'wholeWord':
                def edit(d, ti=ti, ri=ri):
                    del d['transforms'][ti]['rules'][ri]
                yield f'{t["id"]}: without wholeWord {r["inflected"]} → {r["deinflected"]}', edit, None
    # 3. Each transform removed.
    for ti, t in enumerate(base['transforms']):
        def edit(d, ti=ti):
            del d['transforms'][ti]
        yield f'without transform {t["id"]}', edit, None
    # 4. Conditions emptied on each transform's output.
    for ti, t in enumerate(base['transforms']):
        if any(r['conditionsOut'] for r in t['rules']):
            def edit(d, ti=ti):
                for r in d['transforms'][ti]['rules']:
                    r['conditionsOut'] = []
            yield f'{t["id"]}: conditionsOut emptied', edit, None
        if any(r['conditionsIn'] for r in t['rules']):
            def edit(d, ti=ti):
                for r in d['transforms'][ti]['rules']:
                    r['conditionsIn'] = []
            yield f'{t["id"]}: conditionsIn emptied', edit, None
    # 5. Each preprocessor removed, and the optional ones made default.
    for pi, p in enumerate(language['lookup']['preprocessors']):
        def edit_l(d, pi=pi):
            del d['lookup']['preprocessors'][pi]
            d['settings'] = [s for s in d['settings'] if s['effect'].get('preprocessor') != p['id']]
        yield f'without preprocessor {p["id"]}', None, edit_l
        if p.get('optional'):
            def edit_l(d, pi=pi):
                d['lookup']['preprocessors'][pi].pop('optional')
                d['settings'] = [s for s in d['settings'] if s['effect'].get('preprocessor') != p['id']]
            yield f'preprocessor {p["id"]} on by default', None, edit_l
    # 6. The optional transform made default.
    for ti, t in enumerate(base['transforms']):
        if t.get('optional'):
            def edit(d, ti=ti):
                d['transforms'][ti].pop('optional')
            def edit_l(d, tid=t['id']):
                d['settings'] = [s for s in d['settings'] if tid not in s['effect'].get('transforms', [])]
            yield f'transform {t["id"]} on by default', edit, edit_l


def run(name, edit, edit_l, index):
    root = os.path.join(work, 'mutants', f'm{index}')
    if os.path.exists(root):
        shutil.rmtree(root)
    dest = os.path.join(root, 'languages', 'eo')
    shutil.copytree(pack, dest)
    os.makedirs(os.path.join(root, 'tools'), exist_ok=True)
    d = copy.deepcopy(base)
    if edit:
        edit(d)
    with open(os.path.join(dest, 'transforms.json'), 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    l = copy.deepcopy(language)
    if edit_l:
        edit_l(l)
    with open(os.path.join(dest, 'language.json'), 'w', encoding='utf-8') as f:
        json.dump(l, f, ensure_ascii=False, indent=2)
    # classes.json for the copy, written by the repository's tool.
    w = subprocess.run([node, os.path.join(repo, 'tools', 'check-classes.mjs'), 'eo', '--write', '--languages',
                        os.path.join(root, 'languages')], capture_output=True, text=True)
    if w.returncode != 0:
        return 'ERROR', w.stderr.strip()[-300:]
    r = subprocess.run([conformance, dest, os.path.join(repo, 'build')], capture_output=True, text=True)
    out = r.stdout + r.stderr
    failures = [line for line in out.splitlines() if line.startswith('FAIL') or 'error' in line.lower()]
    shutil.rmtree(root)
    return ('KILLED' if r.returncode != 0 else 'SURVIVED'), (failures[0] if failures else '')


results = []
limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
for i, (name, edit, edit_l) in enumerate(mutations()):
    if limit is not None and i >= limit:
        break
    status, detail = run(name, edit, edit_l, i)
    results.append((status, name, detail))
    print(f'{status}\t{name}\t{detail[:160]}', flush=True)
killed = sum(1 for s, _, _ in results if s == 'KILLED')
print(f'{len(results)} mutations: {killed} killed, {sum(1 for s, _, _ in results if s == "SURVIVED")} survived, '
      f'{sum(1 for s, _, _ in results if s == "ERROR")} errors')
