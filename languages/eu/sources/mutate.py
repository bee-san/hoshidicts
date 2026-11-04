#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation checks of docs/languages.md section 14 step 7.

    python3 languages/eu/sources/mutate.py [--work <dir>] [--only <name>,...]

Each mutation edits a copy of sources/build-own.mjs (a stem constraint, an
exclusion, a left-out form or an order removed) or of language.json (a lookup
setting), regenerates own.json, transforms.json and tests/classes.json in a
scratch copy of the pack under <work>, and runs
build/language-conformance-test on it. A mutation the tests do not catch is
printed as SURVIVED.
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(PACK))

# (name, text in build-own.mjs, replacement), or (name, text, replacement,
# 'language.json') for an edit of the descriptor.
MUTATIONS = [
    ('identity (control)', 'const VOWEL = ', 'const VOWEL = '),
    ('case rules: no minimum stem', 'stemMinLength: minimum, stemEndsWith: g.stemEndsWith};', 'stemEndsWith: g.stemEndsWith};'),
    ('case rules: vowel stems take consonant endings', "rules.push({inflected: cEnding, deinflected: '', stemEndsWith: consonant});",
     "rules.push({inflected: cEnding, deinflected: ''});"),
    ('case rules: -a stems without the vowel check', "rules.push({inflected: vEnding.slice(1), deinflected: '', stemEndsWith: A});",
     "rules.push({inflected: vEnding.slice(1), deinflected: ''});"),
    ('case rules: -a stem readings before the consonant ones', "    const rules = [];\n    rules.push({inflected: cEnding, deinflected: '', stemEndsWith: consonant});",
     "    const rules = [];\n    if (!startsWithVowel(vEnding)) {} else if (!vEnding.startsWith('a')) { rules.push({inflected: vEnding, deinflected: 'a'}); }\n    rules.push({inflected: cEnding, deinflected: '', stemEndsWith: consonant});"),
    ('indefinite dative after any consonant', "indef: [['ri', 'i', '[lnt]']]", "indef: [['ri', 'i']]"),
    ('participle readings of the dative and genitive', "{id: 'dat', name: 'dative',", "{id: 'dat', name: 'dative', v: true,"),
    ('participle reading of the indefinite ergative', "{id: 'erg', name: 'ergative', v: ['sg', 'pl'],", "{id: 'erg', name: 'ergative', v: true,"),
    ('-a stem rule joins a vowel rule of other parts of speech', 'if (samePos) {', 'if (v !== undefined) {'),
    ('ablative + -ko: two-letter stems', "readings.some(([c]) => c.id === 'ablko') ? 3 : 2", '2'),
    ('degree after r and space', "stemMinLength: 2, stemNotEndsWith: '[r ]'});", 'stemMinLength: 2});'),
    ('adverb -ki: euskalki', ", stemNotStartsWithText: 'euskal'});", '});'),
    ('adverb -ki: two-letter stems', "conditionsOut: ['adj'], stemMinLength: 3,", "conditionsOut: ['adj'], stemMinLength: 2,"),
    ('-ka: three-letter stems', "conditionsOut: ['n', 'adj', 'sg'], stemMinLength: 4,", "conditionsOut: ['n', 'adj', 'sg'], stemMinLength: 3,"),
    ('-ka after -i', "stemEndsWith: '[aeoulnrt]'});", "stemEndsWith: '[aeioulnrt]'});"),
    ('closed classes: every case takes a case output', "conditionsIn: STACKING.has(caseId) ? IN : []", 'conditionsIn: IN'),
    ('zuen read as the genitive of zuek', "gen: 'zeuen',", "gen: 'zuen zeuen',"),
    ('bat without its own case forms', "    bat: {erg: 'batek',", "    batx: {erg: 'batek',"),
    ('beren not bera', "gen: 'beraren beraien beren',", "gen: 'beraren beraien',"),
    ('no auxiliary homographs read as izan first', 'for (const p of AUXILIARY_HOMOGRAPHS) { paradigm(p); }', ''),
    ('auxiliary homographs after the synthetic verbs', 'for (const p of AUXILIARY_HOMOGRAPHS) { paradigm(p); }\nfor (const p of SYNTHETIC) { paradigm(p); }',
     'for (const p of SYNTHETIC) { paradigm(p); }\nfor (const p of AUXILIARY_HOMOGRAPHS) { paradigm(p); }'),
    ('relative den takes the plural', "inflected: 'den', deinflected: 'da', conditionsIn: ['sg']", "inflected: 'den', deinflected: 'da', conditionsIn: ['sg', 'pl']"),
    ('relative -en after -t', "rel({inflected: 'en', deinflected: '', stemMinLength: 2, stemNotEndsWith: '[t]'});", "rel({inflected: 'en', deinflected: '', stemMinLength: 2});"),
    ('complementizer -ela after -t', "comp({inflected: 'ela', deinflected: '', stemMinLength: 2, stemNotEndsWith: '[t]'});", "comp({inflected: 'ela', deinflected: '', stemMinLength: 2});"),
    ('complementizer takes every case ending', "add('complementizer', {type: 'suffix', inflected, conditionsIn: [], conditionsOut: ['sub'], ...rest});",
     "add('complementizer', {type: 'suffix', inflected, conditionsIn: IN, conditionsOut: ['sub'], ...rest});"),
    ('imperatives take subordinators', "if (tense === 'imp') { return []; }", ''),
    ('hypothetical forms take subordinators', "if (tense === 'hyp') { return ['pfx']; }", ''),
    ('finite forms not in -n take case outputs', "return form.endsWith('n') ? FIN_IN : ['fin'];", 'return FIN_IN;'),
    ('familiar -k after any first letter', "stemMinLength: 3, stemStartsWith: '[gln]'});", 'stemMinLength: 3});'),
    ('familiar -k: no minimum stem', "add('familiar', {type: 'suffix', inflected: 'k', deinflected: '', conditionsIn: [], conditionsOut: ['pfx'], stemMinLength: 3,",
     "add('familiar', {type: 'suffix', inflected: 'k', deinflected: '', conditionsIn: [], conditionsOut: ['pfx'], stemMinLength: 0,"),
    ('familiar z...k: one-letter stems', "conditionsOut: ['pfx'], stemMinLength: 2, stemStartsWith: VOWEL});", "conditionsOut: ['pfx'], stemMinLength: 1, stemStartsWith: VOWEL});"),
    ('ba-: any first letter', "stemMinLength: 2, stemStartsWith: '[dglnhz]'});", 'stemMinLength: 2});'),
    ('bait- before any letter', "['bait', '', '[z]']", "['bait', '', null]"),
    ('-an for -en after any first letter', "stemMinLength: 1, stemStartsWith: '[ghlnz]'});", 'stemMinLength: 1});'),
    ('compound verbs: gauza izan', ", stemNotStartsWithText: 'gauza'});", '});'),
    ('compound verbs: one-letter first word', "conditionsOut: ['v'], stemMinLength: 2, stemNotStartsWithText: 'gauza'});", "conditionsOut: ['v'], stemMinLength: 0, stemNotStartsWithText: 'gauza'});"),
    ('compound verbs: no part of speech', "add(id, {type: 'suffix', inflected: ' ' + form, deinflected: ' izan', conditionsIn: finiteIn(cell.tense, form),\n                conditionsOut: ['v'],",
     "add(id, {type: 'suffix', inflected: ' ' + form, deinflected: ' izan', conditionsIn: finiteIn(cell.tense, form),\n                conditionsOut: [],"),
    ('uste without case endings', "conditionsIn: w === 'uste' ? ['sg', 'pl'] : []", 'conditionsIn: []'),
    ('radical: four-letter stems before -tu', "conditionsOut: ['v'], stemMinLength: 5, stemEndsWith: '[t]'});", "conditionsOut: ['v'], stemMinLength: 4, stemEndsWith: '[t]'});"),
    ('radical -tu: two-letter stems', "deinflected: 'tu', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 3, stemEndsWith: '[aeiou]'});",
     "deinflected: 'tu', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 2, stemEndsWith: '[aeiou]'});"),
    ('radical -i: any final letter', "deinflected: 'i', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 3, stemEndsWith: '[lsxz]'});",
     "deinflected: 'i', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 3});"),
    ('hau as a form of edun', "'2f': '1s:haut 1p:haugu 3p:haute',", "'2f': '1s:haut 3s:hau 1p:haugu 3p:haute',"),
    ('zain as a form of izan', "allo: {'3s': '1s:zaidak 3s:zaiok 1p:zaiguk 3p:zaiek'", "allo: {'3s': '1s:zaidak,zain 3s:zaiok 1p:zaiguk 3p:zaiek'"),
    ('begi as the imperative of egin', "imp: {'3s': '2f:egik 2s:egizu 2p:egizue'},", "imp: {'3s': '2f:egik 2s:egizu 2p:egizue 3s:begi'},"),
    ('hitza as a form of ezan', "'3p': '2f:itzak,itzan 2s:itzazu", "'3p': '2f:itzak,itzan,hitza 2s:itzazu"),
    ('hatza as a form of etzan', "present: '1s:natza 3s:datza", "present: '1s:natza 2f:hatza 3s:datza"),
    ('beroa as a form of eroan', "{key: 'egin-present', lemmas: ['egin'],",
     "{key: 'eroan', lemmas: ['eroan'], about: 'eroan', roles: 'nor-nork', tenses: {imp: {'3s': '3s:beroa'}}},\n    {key: 'egin-present', lemmas: ['egin'],"),
    ('feminine zion as familiar', "'3s': '1s:zioat,zionat 3s:ziok 1p:", "'3s': '1s:zioat,zionat 3s:ziok,zion 1p:"),
    ('no Gipuzkoan det, dezu, degu', "'3s': '1s:dut,det 2f:duk,dun 3s:du 1p:dugu,degu 2s:duzu,dezu 2p:duzue,dezue 3p:dute',",
     "'3s': '1s:dut 2f:duk,dun 3s:du 1p:dugu 2s:duzu 2p:duzue 3p:dute',"),
    ('no deritzot', "'3s': {'3s': '1s:deritzot,deritzat 2f:", "'3s': {'3s': '1s:deritzat 2f:"),
    ('no iezadazu', "'1s': '2f:iezadak 2s:iezadazu 2p:iezadazue',", "'1s': '2f:iezadak 2p:iezadazue',"),
    ('no familiar past transform', "allopast: '1s:ninduan,nindunan 3s:zuan,zunan 1p:gintuan,gintunan 3p:zituan,zitunan',", ''),
    ('ezan forms read as edun directly', "{key: 'ezan', lemmas: ['ezan'],", "{key: 'ezan', lemmas: ['ezan', 'edun'],"),
    ('no auxiliary-root rule', "add('auxiliary-root', {type: 'wholeWord', inflected: 'ezan', deinflected: 'edun', conditionsIn: ['v'], conditionsOut: ['v']});", ''),
    ('dioen read through the relative', "3s:dio,dioen 1p:diogu", "3s:dio 1p:diogu"),
    ('no aterako, bizitzen, saia readings', "    add('future', {type: 'wholeWord', inflected: 'aterako', deinflected: 'atera', conditionsIn: [], conditionsOut: ['v']});", ''),
    ('no hartu verbal-noun readings', "for (const form of ['hartzeko', 'hartzean', 'hartzera', 'hartzeak']) {", "for (const form of []) {"),
    ('berekin not bera', "com: 'berarekin beraiekin berekin',", "com: 'berarekin beraiekin',"),
    ('ezak not izan first', "        imp: {'3s': '2f:ezak'},\n", ''),
    ('duela + -ko or -rik as a case', "if (g.stemEndsWith === VOWEL && (g.inflected === 'ko' || g.inflected === 'rik')) { rule.stemNotStartsWithText = 'duela'; }", ''),
    ('duelako as duela\'s future', ",\n        stemNotStartsWithText: 'duela'});", "});"),
    ('formOf asTerm', '"formOf": "follow"', '"formOf": "asTerm"', 'language.json'),
    ('untaggedTerms pass', '"formOf": "follow",', '"formOf": "follow",\n    "untaggedTerms": "pass",', 'language.json'),
    ('searchResolution character', '"searchResolution": "word"', '"searchResolution": "character"', 'language.json'),
    ('word characters without digits', '"word": "[{letter}\\\\p{M}\\\\p{Nd}]"', '"word": "[{letter}\\\\p{M}]"', 'language.json'),
    ('word characters without marks', '"word": "[{letter}\\\\p{M}\\\\p{Nd}]"', '"word": "[{letter}\\\\p{Nd}]"', 'language.json'),
    ('decapitalize to upper case', '"variants": [[{"case": "lower"}]]', '"variants": [[{"case": "upper"}]]', 'language.json'),
]


def run(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def main(argv):
    work = argv[argv.index('--work') + 1] if '--work' in argv else os.path.join(ROOT, 'build', 'eu-mutate')
    only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
    cli_test = os.path.join(ROOT, 'build', 'language-conformance-test')
    sources = {}
    for file in ('sources/build-own.mjs', 'language.json'):
        with open(os.path.join(PACK, file), encoding='utf-8') as f:
            sources[file] = f.read()
    for name, old, new, *rest in MUTATIONS:
        file = 'language.json' if rest == ['language.json'] else 'sources/build-own.mjs'
        source = sources[file]
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
        with open(os.path.join(scratch, file), 'w', encoding='utf-8') as f:
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
