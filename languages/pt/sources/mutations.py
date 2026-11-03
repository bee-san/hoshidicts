#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation checks of README.md (docs/languages.md 14 step 7). Not run by any test.

    python3 languages/pt/sources/mutations.py <build dir> <scratch dir> [name filter...]

<build dir> has language-conformance-test (a build configured with
HOSHIDICTS_LANGUAGE_TESTS). For each mutation the pack is copied into
<scratch dir>/languages/pt (tools/ linked beside it), one text replacement is
made in sources/build-own.mjs or language.json, own.json, transforms.json and
tests/classes.json are written again for the copy, and the conformance test
runs on it. A mutation is killed when a test row fails (not only the
classes.json comparison, which is rewritten). Prints one line per mutation and
writes <scratch dir>/mutations.json.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]

MUTATIONS = [
    # name, file, text to replace, replacement (None: remove that processor)
    ('stems: spaces and capitals allowed (no lowerStem)', 'build-own.mjs', "const letters = () => ({stemCharacters: '{lowerStem}'});", "const letters = () => ({});"),
    ('stems: capitals allowed', 'language.json', '"lowerStem": "[^ A-Z\\\\u00C0-\\\\u00D6\\\\u00D8-\\\\u00DE]"', '"lowerStem": "[^ ]"'),
    ('stems: spaces allowed', 'language.json', '"lowerStem": "[^ A-Z\\\\u00C0-\\\\u00D6\\\\u00D8-\\\\u00DE]"', '"lowerStem": "[^A-Z\\\\u00C0-\\\\u00D6\\\\u00D8-\\\\u00DE]"'),
    ('pronoun rules: stem may hold a space', 'build-own.mjs', "conditionsOut, stemMinLength: 1, stemCharacters: '{lowerStem}', ...extra});", "conditionsOut, stemMinLength: 1, ...extra});"),
    ('verbs: stem of one letter', 'build-own.mjs', "conditionsIn: ['vf'], conditionsOut: ['v'], stemMinLength: 2, ...letters(inflected), ...extra});", "conditionsIn: ['vf'], conditionsOut: ['v'], stemMinLength: 1, ...letters(inflected), ...extra});"),
    ('-ar e-endings after c, g', 'build-own.mjs', "verb(slot, ending, 'ar', {stemNotEndsWith: '[cg]'});", "verb(slot, ending, 'ar');"),
    ('-er/-ir a/o endings after c, g', 'build-own.mjs', "verb(slot, ending, conj, {stemNotEndsWith: '[cg]'});", "verb(slot, ending, conj);"),
    ('est exclusion removed', 'build-own.mjs', "            rule.stemNotStartsWithText = 'est';\n", ""),
    ('est twin removed', 'build-own.mjs', "            twins.push({...rest, stemStartsWithText: 'est', stemMinLength: 4});\n", ""),
    ('exclusion -er present: cont', 'build-own.mjs', "['cont', 'prov!', 'rel!', 'serv!']", "['prov!', 'rel!', 'serv!']"),
    ('exclusion -er present: cont twin', 'build-own.mjs', "['cont', 'prov!', 'rel!', 'serv!']", "['cont!', 'prov!', 'rel!', 'serv!']"),
    ('exclusion -er present: prov', 'build-own.mjs', "['cont', 'prov!', 'rel!', 'serv!']", "['cont', 'rel!', 'serv!']"),
    ('exclusion -er present: rel', 'build-own.mjs', "['cont', 'prov!', 'rel!', 'serv!']", "['cont', 'prov!', 'serv!']"),
    ('exclusion -er present: serv', 'build-own.mjs', "['cont', 'prov!', 'rel!', 'serv!']", "['cont', 'prov!', 'rel!']"),
    ('exclusion -ir present: prov', 'build-own.mjs', "['prov!', 'fal!']]", "['fal!']]"),
    ('exclusion -ir present: fal', 'build-own.mjs', "['prov!', 'fal!']]", "['prov!']]"),
    ('exclusion -er future: qu', 'build-own.mjs', "/^er/u.test(rule.inflected) && rule.stemChange === undefined, ['qu']]", "/^er/u.test(rule.inflected) && rule.stemChange === undefined, ['zzqq!']]"),
    ('exclusion -er future: qu twin', 'build-own.mjs', "/^er/u.test(rule.inflected) && rule.stemChange === undefined, ['qu']]", "/^er/u.test(rule.inflected) && rule.stemChange === undefined, ['qu!']]"),
    ('exclusion -ar preterite: af', 'build-own.mjs', "rule.stemChange === undefined, ['af']]", "rule.stemChange === undefined, ['zzqq!']]"),
    ('exclusion -ar preterite: af twin', 'build-own.mjs', "rule.stemChange === undefined, ['af']]", "rule.stemChange === undefined, ['af!']]"),
    ('exclusion vir compounds: conv', 'build-own.mjs', "['conv', 'interv!', 'prov!', 'av!', 'sobrev!']", "['interv!', 'prov!', 'av!', 'sobrev!']"),
    ('exclusion vir compounds: conv twin', 'build-own.mjs', "['conv', 'interv!', 'prov!', 'av!', 'sobrev!']", "['conv!', 'interv!', 'prov!', 'av!', 'sobrev!']"),
    ('exclusion vir compounds: interv', 'build-own.mjs', "['conv', 'interv!', 'prov!', 'av!', 'sobrev!']", "['conv', 'prov!', 'av!', 'sobrev!']"),
    ('exclusion vir compounds: prov', 'build-own.mjs', "['conv', 'interv!', 'prov!', 'av!', 'sobrev!']", "['conv', 'interv!', 'av!', 'sobrev!']"),
    ('exclusion vir compounds: av', 'build-own.mjs', "['conv', 'interv!', 'prov!', 'av!', 'sobrev!']", "['conv', 'interv!', 'prov!', 'sobrev!']"),
    ('exclusion vir compounds: sobrev', 'build-own.mjs', "['conv', 'interv!', 'prov!', 'av!', 'sobrev!']", "['conv', 'interv!', 'prov!', 'av!']"),
    ('-guer only after r (gu rule)', 'build-own.mjs', "verb(slot, `gu${ENDINGS.er[slot]}`, 'guer', {stemEndsWith: '[r]'});", "verb(slot, `gu${ENDINGS.er[slot]}`, 'guer');"),
    ('-guer only after r (g before a, o)', 'build-own.mjs', "conj === 'er' ? {stemEndsWith: '[r]'} : {}", "{}"),
    ('plain -er present not after u', 'build-own.mjs', "verb(slot, ending, conj, {stemNotEndsWith: '[u]'});", "verb(slot, ending, conj);"),
    ('u -> o as a general rule', 'build-own.mjs', "for (const [form, infinitive] of [['ob', 'ubir'], ['om', 'umir'], ['og', 'ugir'], ['od', 'udir'], ['osp', 'uspir'], ['op', 'upir'], ['ol', 'ulir']]) {\n        verb(slot, `${form}${ending}`, infinitive, {stemMinLength: form === 'om' ? 0 : 1});\n    }", "verb(slot, ending, 'ir', {stemChange: {from: ['o'], to: 'u', occurrence: 'last', between: '{consonant}'}});"),
    ('names: stem of three letters', 'build-own.mjs', "{stemMinLength: 4, stemStartsWith: '[A-Z", "{stemMinLength: 3, stemStartsWith: '[A-Z"),
    ('names: removed', 'build-own.mjs', "    nominal('diminutive', inflected, deinflected, NA, NA, {stemMinLength: 4, stemStartsWith:", "    if (false) nominal('diminutive', inflected, deinflected, NA, NA, {stemMinLength: 4, stemStartsWith:"),
    ('-azinho after -az removed', 'build-own.mjs', "    nominal('diminutive', `az${ending}`, 'az', NA, NA, {stemMinLength: 2});", ""),
    ('diminutive after l r s z: any letter', 'build-own.mjs', "nominal('diminutive', ending, '', NA, NA, {stemMinLength: 3, stemEndsWith: '[lrsz]'});", "nominal('diminutive', ending, '', NA, NA, {stemMinLength: 3});"),
    ('plural of loanwords: after any letter', 'build-own.mjs', "stemEndsWith: '[bcdfgklnprtwy]'", "stemMinLength: 2"),
    ('plural of acronyms removed', 'build-own.mjs', "nominal('plural', 's', '', [], NA, {stemMinLength: 2, stemCharacters: '[A-Z]'});", ""),
    ('plural of compounds removed', 'build-own.mjs', "add('plural', {type: 'replace', inflected: 's-', deinflected: '-', occurrence: 'first', conditionsIn: NA, conditionsOut: NA});", ""),
    ('feminine -a: stem of two letters', 'build-own.mjs', "['a', 'o', 3], ['ora', 'or', 2]", "['a', 'o', 2], ['ora', 'or', 2]"),
    ('-uir: also after g and q', 'build-own.mjs', "verb(slot, `u${ending}`, 'uir', {stemMinLength: 1, stemNotEndsWith: '[gq]'});", "verb(slot, `u${ending}`, 'uir', {stemMinLength: 1});"),
    ('-ir e -> i: no consonant condition', 'build-own.mjs', "verb(slot, ending, 'ir', {stemNotEndsWith: '[cg]', stemChange: {from: ['i'], to: 'e', occurrence: 'last', between: '{consonant}'}});", "verb(slot, ending, 'ir', {stemNotEndsWith: '[cg]', stemChange: {from: ['i'], to: 'e', occurrence: 'last'}});"),
    ('superlative: accent copies removed', 'build-own.mjs', "        if (accents) { withAccents(write); } else { write({}); }\n    }\n    // facílimo", "        write({});\n    }\n    // facílimo"),
    ('adverb: -mente after -a allowed', 'build-own.mjs', "{stemMinLength: 3, stemNotEndsWith: '[a]', ...extra}", "{stemMinLength: 3, ...extra}"),
    ('processor: removeDiaeresis removed', 'language.json', '      {\n        "id": "removeDiaeresis",\n        "name": "Remove the diaeresis (ü → u)",\n        "variants": [[{"map": {"ü": "u", "Ü": "U"}}]]\n      }', None),
    ('processor: NFKC -> NFC', 'language.json', '"normalize": "NFKC"', '"normalize": "NFC"'),
    ('processor: capitalizeFirstLetter -> lowerFirst', 'language.json', '"case": "upperFirst"', '"case": "lowerFirst"'),
    ('processor: decapitalize -> upper', 'language.json', '"case": "lower"', '"case": "upper"'),
    ('hyphen made word-internal', 'language.json', '"wordInternal": null', '"wordInternal": "[\\\\-]"'),
    ('searchResolution character', 'language.json', '"searchResolution": "word"', '"searchResolution": "character"'),
]


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def prepare(root, file, old, new):
    if root.exists():
        shutil.rmtree(root)
    (root / 'languages').mkdir(parents=True)
    shutil.copytree(REPO / 'languages' / 'pt', root / 'languages' / 'pt')
    (root / 'tools').symlink_to(REPO / 'tools')
    pack = root / 'languages' / 'pt'
    path = pack / ('sources/build-own.mjs' if file == 'build-own.mjs' else 'language.json')
    text = path.read_text(encoding='utf-8')
    if old not in text:
        return f'pattern not found in {file}'
    if new is None:  # remove a processor object and the comma before it
        i = text.index(old)
        j = text.rindex(',', 0, i)
        text = text[:j] + text[i + len(old):]
    else:
        text = text.replace(old, new)
    path.write_text(text, encoding='utf-8')
    for cmd in (['node', str(pack / 'sources' / 'build-own.mjs')],
                ['node', str(REPO / 'tools' / 'merge-transforms.mjs'), 'pt', '--languages', str(root / 'languages'), '--force'],
                ['node', str(REPO / 'tools' / 'check-classes.mjs'), 'pt', '--write', '--languages', str(root / 'languages')]):
        r = run(cmd)
        if r.returncode:
            return f'{Path(cmd[1]).name} failed: ' + (r.stderr or r.stdout)[-300:]
    return None


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    build, scratch = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    only = sys.argv[3:]
    root = scratch / 'mutation'
    results = []
    for name, file, old, new in MUTATIONS:
        if only and not any(o in name for o in only):
            continue
        problem = prepare(root, file, old, new)
        if problem:
            results.append({'mutation': name, 'verdict': 'error', 'detail': problem})
            print(f'ERROR    {name}: {problem}', flush=True)
            continue
        r = run([str(build / 'language-conformance-test'), str(root / 'languages' / 'pt'), str(build)], timeout=900)
        fails = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith('FAIL') and 'README.md is missing' not in l]
        verdict = 'killed' if fails else 'SURVIVED'
        results.append({'mutation': name, 'verdict': verdict, 'failing': fails[:5]})
        print(f'{verdict:8s} {name}: {len(fails)} failing rows; ' + ' | '.join(f[9:110] for f in fails[:2]), flush=True)
    (scratch / 'mutations.json').write_text(json.dumps(results, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    killed = sum(1 for x in results if x['verdict'] == 'killed')
    print(f'{killed} of {len(results)} mutations killed')


if __name__ == '__main__':
    main()
