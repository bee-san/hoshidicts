#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The mutation check of docs/languages.md section 14 step 7. Run from the
repository root with a built language-conformance-test:

  python3 languages/sq/sources/mutations.py <scratch dir>

For every transform and every stem constraint its rules carry
(stemCharacters, stemMinLength, stemEndsWith, ...), a copy of the pack in
<scratch dir> gets transforms.json without that constraint in that
transform; tests/classes.json is written again and the conformance test run.
A mutation survives when the copy still conforms. One more mutation turns the
whole-word forms of the one-syllable verbs into suffix rules. Prints the
surviving mutations.
"""
import copy
import json
import os
import shutil
import subprocess
import sys

ROOT = os.getcwd()
PACK = os.path.join(ROOT, 'languages', 'sq')
CONSTRAINTS = ['stemCharacters', 'stemMinLength', 'stemEndsWith', 'stemNotEndsWith', 'stemStartsWith',
               'stemNotStartsWith', 'stemContains', 'stemStartsWithText', 'stemNotStartsWithText']
WHOLE_WORD_VERBS = {'jam', 'kam', 'ha', 'pi', 'di', 'rri', 'fle', 'lë', 'vë', 'zë', 'nxë', 'përzë', 'kundërvë', 'bashkëvë', 'bie', 'dua', 'vete'}


def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def conforms(scratch):
    languages = os.path.join(scratch, 'languages')
    w = subprocess.run(['node', os.path.join(ROOT, 'tools', 'check-classes.mjs'), 'sq', '--write', '--languages', languages],
                       capture_output=True, text=True)
    if w.returncode != 0:
        return None
    r = subprocess.run([os.path.join(ROOT, 'build', 'language-conformance-test'), os.path.join(languages, 'sq')],
                       capture_output=True, text=True)
    return r.returncode == 0


def main(scratch):
    target = os.path.join(scratch, 'languages', 'sq')
    if os.path.exists(target):
        shutil.rmtree(target)
    shutil.copytree(PACK, target)
    base = json.load(open(os.path.join(PACK, 'transforms.json'), encoding='utf-8'))
    tfile = os.path.join(target, 'transforms.json')
    write_json(tfile, base)
    if not conforms(scratch):
        print('the unmutated copy does not conform')
        return 1
    mutations = []
    for ti, t in enumerate(base['transforms']):
        keys = [k for k in CONSTRAINTS if any(k in r for r in t['rules'])]
        for k in keys:
            mutations.append((f'{t["id"]}: without {k}', ti, k))
    survived = []
    for name, ti, k in mutations:
        data = copy.deepcopy(base)
        for r in data['transforms'][ti]['rules']:
            r.pop(k, None)
            if r['type'] == 'suffix' and r.get('inflected') == '' and not any(c in r for c in CONSTRAINTS):
                r['stemMinLength'] = 0  # keep the rule valid: an empty ending needs a constraint
        write_json(tfile, data)
        if conforms(scratch):
            survived.append(name)
    # The one-syllable verbs' forms as suffix rules.
    data = copy.deepcopy(base)
    changed = 0
    for t in data['transforms']:
        for r in t['rules']:
            if r['type'] == 'wholeWord' and r['deinflected'] in WHOLE_WORD_VERBS and len(r['inflected']) >= 4:
                r.update({'type': 'suffix', 'stemCharacters': '[^ ]'})
                changed += 1
    write_json(tfile, data)
    if conforms(scratch):
        survived.append(f'the one-syllable verbs\' {changed} forms as suffix rules')
    shutil.rmtree(target)
    print(f'{len(mutations) + 1} mutations, {len(survived)} survive')
    for s in survived:
        print('  ' + s)
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
