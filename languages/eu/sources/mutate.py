#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation checks of docs/languages.md section 14 step 7.

    python3 languages/eu/sources/mutate.py [--work <dir>] [--only <name>,...]

Each mutation edits a copy of sources/build-own.mjs (a stem constraint, an
exclusion or a left-out form removed), regenerates own.json, transforms.json
and tests/classes.json in a scratch copy of the pack under <work>, and runs
build/language-conformance-test on it. A mutation the tests do not catch is
printed as SURVIVED with the reason the README gives, if any.
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(PACK))

# (name, text in build-own.mjs, replacement)
MUTATIONS = [
    ('identity (control)', 'const VOWEL = ', 'const VOWEL = '),
    ('case rules: no minimum stem', 'stemMinLength: 2, stemEndsWith: g.stemEndsWith};', 'stemEndsWith: g.stemEndsWith};'),
    ('case rules: vowel stems take consonant endings', "rules.push({inflected: cEnding, deinflected: '', stemEndsWith: consonant});",
     "rules.push({inflected: cEnding, deinflected: ''});"),
    ('case rules: -a stems without the vowel check', "rules.push({inflected: vEnding.slice(1), deinflected: '', stemEndsWith: A});",
     "rules.push({inflected: vEnding.slice(1), deinflected: ''});"),
    ('indefinite dative after any consonant', "indef: [['ri', 'i', '[lnt]']]", "indef: [['ri', 'i']]"),
    ('participle readings of the dative and genitive', "{id: 'dat', name: 'dative',", "{id: 'dat', name: 'dative', v: true,"),
    ('participle reading of the indefinite ergative', "{id: 'erg', name: 'ergative', v: ['sg', 'pl'],", "{id: 'erg', name: 'ergative', v: true,"),
    ('-a stem rule joins a vowel rule of other parts of speech', 'if (samePos) {', 'if (v !== undefined) {'),
    ('degree after r and space', "stemMinLength: 2, stemNotEndsWith: '[r ]'});", 'stemMinLength: 2});'),
    ('adverb -ki: euskalki', ", stemNotStartsWithText: 'euskal'});", '});'),
    ('-ka: three-letter stems', "conditionsOut: ['n', 'adj', 'sg'], stemMinLength: 4,", "conditionsOut: ['n', 'adj', 'sg'], stemMinLength: 3,"),
    ('closed classes: every case takes a case output', "conditionsIn: STACKING.has(caseId) ? IN : []", 'conditionsIn: IN'),
    ('relative den takes the plural', "inflected: 'den', deinflected: 'da', conditionsIn: ['sg']", "inflected: 'den', deinflected: 'da', conditionsIn: ['sg', 'pl']"),
    ('imperatives take subordinators', "if (tense === 'imp') { return []; }", ''),
    ('hypothetical forms take subordinators', "if (tense === 'hyp') { return ['pfx']; }", ''),
    ('finite forms not in -n take case outputs', "return form.endsWith('n') ? FIN_IN : ['fin'];", 'return FIN_IN;'),
    ('familiar -k after any first letter', "stemMinLength: 3, stemStartsWith: '[gln]'});", 'stemMinLength: 3});'),
    ('familiar z...k: one-letter stems', "conditionsOut: ['pfx'], stemMinLength: 2, stemStartsWith: VOWEL});", "conditionsOut: ['pfx'], stemMinLength: 1, stemStartsWith: VOWEL});"),
    ('compound verbs: gauza izan', ", stemNotStartsWithText: 'gauza'});", '});'),
    ('radical: four-letter stems before -tu', "conditionsOut: ['v'], stemMinLength: 5, stemEndsWith: '[t]'});", "conditionsOut: ['v'], stemMinLength: 4, stemEndsWith: '[t]'});"),
    ('hau as a form of edun', "'2f': '1s:haut 1p:haugu 3p:haute',", "'2f': '1s:haut 3s:hau 1p:haugu 3p:haute',"),
    ('zain as a form of izan', "allo: {'3s': '1s:zaidak 3s:zaiok 1p:zaiguk 3p:zaiek'", "allo: {'3s': '1s:zaidak,zain 3s:zaiok 1p:zaiguk 3p:zaiek'"),
    ('begi as the imperative of egin', "imp: {'3s': '2f:egik 2s:egizu 2p:egizue'},", "imp: {'3s': '2f:egik 2s:egizu 2p:egizue 3s:begi'},"),
    ('hitza as a form of ezan', "'3p': '2f:itzak,itzan 2s:itzazu", "'3p': '2f:itzak,itzan,hitza 2s:itzazu"),
    ('feminine zion as familiar', "'3s': '1s:zioat,zionat 3s:ziok 1p:", "'3s': '1s:zioat,zionat 3s:ziok,zion 1p:"),
    ('ezan forms read as edun directly', "{key: 'ezan', lemmas: ['ezan'],", "{key: 'ezan', lemmas: ['ezan', 'edun'],"),
    ('no auxiliary-root rule', "add('auxiliary-root', {type: 'wholeWord', inflected: 'ezan', deinflected: 'edun', conditionsIn: ['v'], conditionsOut: ['v']});", ''),
]


def run(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def main(argv):
    work = argv[argv.index('--work') + 1] if '--work' in argv else os.path.join(ROOT, 'build', 'eu-mutate')
    only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
    cli_test = os.path.join(ROOT, 'build', 'language-conformance-test')
    with open(os.path.join(HERE, 'build-own.mjs'), encoding='utf-8') as f:
        source = f.read()
    for name, old, new in MUTATIONS:
        if only and name not in only:
            continue
        if source.count(old) != 1:
            print(f'NOT APPLIED  {name}: the text occurs {source.count(old)} times')
            continue
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(os.path.join(work, 'languages'))
        os.symlink(os.path.join(ROOT, 'tools'), os.path.join(work, 'tools'))
        scratch = os.path.join(work, 'languages', 'eu')
        shutil.copytree(PACK, scratch, ignore=shutil.ignore_patterns('__pycache__'))
        with open(os.path.join(scratch, 'sources', 'build-own.mjs'), 'w', encoding='utf-8') as f:
            f.write(source.replace(old, new))
        steps = [['node', os.path.join(scratch, 'sources', 'build-own.mjs')], ['node', os.path.join(scratch, 'sources', 'build-final.mjs')],
                 ['node', os.path.join(ROOT, 'tools', 'check-classes.mjs'), 'eu', '--write', '--languages', os.path.join(work, 'languages')]]
        failed = None
        for step in steps:
            result = run(step)
            if result.returncode != 0:
                failed = (step[1], result.stderr.strip().splitlines()[-1:] if result.stderr else '')
                break
        if failed:
            print(f'BUILD FAILED {name}: {failed}')
            continue
        result = run([cli_test, scratch])
        fails = [line for line in result.stdout.splitlines() + result.stderr.splitlines() if line.startswith('FAIL') and 'README.md is missing' not in line]
        if fails:
            print(f'KILLED       {name}: {fails[0][:160]}')
        else:
            print(f'SURVIVED     {name}')
    shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main(sys.argv[1:])
