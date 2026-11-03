#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation check of docs/languages.md 14 step 7. Not run by any test.

    python3 languages/sga/sources/mutate.py [--work <dir>] [--only <substring>]

Each mutation edits a copy of languages/sga in <work> (default /tmp/sga-mutate):
it removes one kind of stem constraint (or notAtStart, or a stem change's
`between`) from every rule of one transform, removes one transform, or changes
one setting or processor of language.json. The copy's tests/classes.json is
written again and build/language-conformance-test runs on it. A mutation is
killed when a test fails. The output lists every mutation with the first
failing row, and the survivors last.
"""

import argparse
import copy
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(PACK))
CONFORMANCE = os.path.join(ROOT, 'build', 'language-conformance-test')
CHECK_CLASSES = os.path.join(ROOT, 'tools', 'check-classes.mjs')
KEYS = ['stemMinLength', 'stemCharacters', 'stemContains', 'stemStartsWith', 'stemEndsWith', 'stemNotStartsWith',
        'stemNotEndsWith', 'stemStartsWithText', 'stemNotStartsWithText', 'notAtStart', 'stemChange.between']


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def transform_mutations(transforms):
    out = []
    for t_index, transform in enumerate(transforms['transforms']):
        present = set()
        for rule in transform['rules']:
            present |= {k for k in KEYS if k in rule}
            if 'between' in rule.get('stemChange', {}):
                present.add('stemChange.between')
        for key in sorted(present):
            def edit(data, t_index=t_index, key=key):
                for rule in data['transforms'][t_index]['rules']:
                    if key == 'stemChange.between':
                        rule.get('stemChange', {}).pop('between', None)
                    else:
                        rule.pop(key, None)
                    # An empty affix needs a stem constraint (7.3); such a rule
                    # without one is not a valid mutant of the pack.
                    if rule['type'] in ('suffix', 'prefix') and rule.get('inflected') == '' and not any(k in rule for k in KEYS[:9]):
                        rule['stemMinLength'] = 1
            out.append((f'{transform["id"]}: without {key}', 'transforms', edit))

        def remove(data, t_index=t_index):
            del data['transforms'][t_index]
        out.append((f'{transform["id"]}: transform removed', 'transforms', remove))
    return out


def language_mutations(language):
    out = []
    ids = [p['id'] for p in language['lookup']['preprocessors']]
    for pid in ids:
        def remove(data, pid=pid):
            data['lookup']['preprocessors'] = [p for p in data['lookup']['preprocessors'] if p['id'] != pid]
        out.append((f'preprocessor {pid} removed', 'language', remove))
    def set_path(path, value):
        def edit(data):
            node = data
            for part in path[:-1]:
                node = node[part]
            node[path[-1]] = value
        return edit
    out += [
        ('untaggedTerms filter', 'language', set_path(['lookup', 'untaggedTerms'], 'filter')),
        ('formOf asTerm', 'language', set_path(['lookup', 'formOf'], 'asTerm')),
        ('searchResolution character', 'language', set_path(['lookup', 'searchResolution'], 'character')),
        ('wordInternal null', 'language', set_path(['text', 'wordInternal'], None)),
        ('word class without the abbreviation signs', 'language', set_path(['classes', 'word'], '[{letter}\\u0300-\\u036F0-9]')),
        ('decapitalize to upper', 'language', lambda d: d['lookup']['preprocessors'][ids.index('decapitalize')]['variants'][0][0].update({'case': 'upper'})),
        ('normalizeUnicode NFD', 'language', lambda d: d['lookup']['preprocessors'][ids.index('normalizeUnicode')]['variants'][0][0].update({'normalize': 'NFD'})),
        ('macronLength without ā', 'language', lambda d: d['lookup']['preprocessors'][ids.index('macronLength')]['variants'][0][0]['map'].pop('ā')),
        ('middleDot without U+2027', 'language', lambda d: d['lookup']['preprocessors'][ids.index('middleDot')]['variants'][0][0]['map'].pop('\u2027')),
        ('removeAlphabeticDiacritics keeps the input off', 'language', lambda d: d['lookup']['preprocessors'][ids.index('removeAlphabeticDiacritics')].update({'keepInput': False})),
    ]
    return out


def run(work, name, kind, edit, transforms, language):
    target = os.path.join(work, 'sga')
    shutil.rmtree(work, ignore_errors=True)
    shutil.copytree(PACK, target)
    data = copy.deepcopy(transforms if kind == 'transforms' else language)
    edit(data)
    path = os.path.join(target, 'transforms.json' if kind == 'transforms' else 'language.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    classes = subprocess.run(['node', CHECK_CLASSES, 'sga', '--languages', work, '--write'], capture_output=True, text=True)
    if classes.returncode != 0:
        return 'invalid', classes.stderr.strip().splitlines()[-1] if classes.stderr.strip() else 'check-classes failed'
    result = subprocess.run([CONFORMANCE, target], capture_output=True, text=True)
    lines = (result.stdout + result.stderr).splitlines()
    fails = [l for l in lines if l.startswith('FAIL')]
    if result.returncode == 0 and not fails:
        return 'survived', ''
    if any('could not load' in l or 'cannot' in l.lower() and 'json' in l.lower() for l in fails):
        return 'invalid', fails[0]
    return 'killed', fails[0] if fails else lines[-1]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--work', default='/tmp/sga-mutate')
    parser.add_argument('--only', default=None)
    args = parser.parse_args()
    transforms = load(os.path.join(PACK, 'transforms.json'))
    language = load(os.path.join(PACK, 'language.json'))
    mutations = transform_mutations(transforms) + language_mutations(language)
    if args.only:
        mutations = [m for m in mutations if args.only in m[0]]
    survivors = []
    counts = {'killed': 0, 'survived': 0, 'invalid': 0}
    for name, kind, edit in mutations:
        verdict, detail = run(args.work, name, kind, edit, transforms, language)
        counts[verdict] += 1
        print(f'{verdict:8s} {name}  {detail}', flush=True)
        if verdict == 'survived':
            survivors.append(name)
    print(json.dumps(counts))
    print('survivors:', json.dumps(survivors, ensure_ascii=False))
    shutil.rmtree(args.work, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
