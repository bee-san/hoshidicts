#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation check of docs/languages.md, section 14 step 7: in a scratch copy of
the pack, delete each stem constraint the rules use (per transform, and per
constraint value across transforms), write tests/classes.json again and run
the conformance test on the copy. A mutation no test notices is printed.

    python3 languages/yi/sources/mutations.py [<scratch dir>]
"""

import copy
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PACK))
KEYS = ['stemCharacters', 'stemMinLength', 'stemEndsWith', 'stemNotEndsWith', 'stemStartsWith', 'stemNotStartsWith',
        'stemContains', 'stemStartsWithText', 'stemNotStartsWithText']
CHANGE_KEYS = ['between', 'betweenMinLength']


def constraints(rule):
    out = [(k, json.dumps(rule[k], ensure_ascii=False)) for k in KEYS if k in rule]
    out += [('stemChange.' + k, json.dumps(rule['stemChange'][k], ensure_ascii=False))
            for k in CHANGE_KEYS if k in rule.get('stemChange', {})]
    return out


def delete(rule, key):
    if key.startswith('stemChange.'):
        del rule['stemChange'][key.split('.', 1)[1]]
    else:
        del rule[key]


def mutations(transforms):
    """(label, mutated transforms) for every constraint per transform and per value."""
    seen = {}
    for t in transforms['transforms']:
        for r in t['rules']:
            for key, value in constraints(r):
                seen.setdefault(('transform', t['id'], key), None)
                seen.setdefault(('value', key, value), None)
    for kind, a, b in seen:
        m = copy.deepcopy(transforms)
        n = 0
        for t in m['transforms']:
            for r in t['rules']:
                for key, value in constraints(r):
                    if (kind == 'transform' and t['id'] == a and key == b) or (kind == 'value' and key == a and value == b):
                        delete(r, key)
                        n += 1
        yield (f'{a}: no {b}' if kind == 'transform' else f'every {a} = {b}'), n, m


def main():
    scratch = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('TMPDIR', '/tmp'), 'yi-mutations')
    with open(os.path.join(PACK, 'transforms.json'), encoding='utf-8') as f:
        transforms = json.load(f)
    node = shutil.which('node') or 'node'
    test = os.path.join(REPO, 'build', 'language-conformance-test')
    survived = 0
    total = 0
    for label, n, mutated in mutations(transforms):
        copy_dir = os.path.join(scratch, 'languages')
        shutil.rmtree(copy_dir, ignore_errors=True)
        shutil.copytree(PACK, os.path.join(copy_dir, 'yi'))
        with open(os.path.join(copy_dir, 'yi', 'transforms.json'), 'w', encoding='utf-8') as f:
            json.dump(mutated, f, ensure_ascii=False, indent=2)
        subprocess.run([node, os.path.join(REPO, 'tools', 'check-classes.mjs'), 'yi', '--write', '--languages', copy_dir],
                       capture_output=True, check=True)
        run = subprocess.run([test, os.path.join(copy_dir, 'yi'), os.path.join(scratch, 'work')], capture_output=True, text=True)
        fails = [line for line in (run.stdout + run.stderr).splitlines() if line.startswith('FAIL')]
        total += 1
        if not fails:
            survived += 1
            print(f'SURVIVES  {label} ({n} rules)')
        else:
            print(f'killed    {label} ({n} rules): {fails[0][:150]}')
    print(f'{total} mutations, {survived} survive')


if __name__ == '__main__':
    main()
