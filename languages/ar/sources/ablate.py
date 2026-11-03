#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Removes each constraint and condition the pack relies on, one at a time, in a
scratch copy of the pack, and checks that the conformance test then fails
(docs/languages.md 14 step 7).

    python3 languages/ar/sources/ablate.py [scratch dir]

Run from the repository root after building build/language-conformance-test.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

PACK = Path(__file__).resolve().parent.parent
SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/ar-ablate')


def rules(t, ids=None):
    for x in t['transforms']:
        if ids is None or x['id'] in ids:
            for r in x['rules']:
                yield x, r


def drop_key(key, value=None, ids=None):
    def edit(t):
        n = 0
        for _, r in rules(t, ids):
            if key in r and (value is None or r[key] == value):
                del r[key]
                n += 1
        return n
    return edit


def set_out(ids, new, only=None):
    def edit(t):
        n = 0
        for _, r in rules(t, ids):
            if only is None or only(r):
                r['conditionsOut'] = new
                n += 1
        return n
    return edit


def past_min_two(t):
    n = 0
    for _, r in rules(t, {'pastWe', 'pastTheyF', 'pastYouTwo', 'pastYouPl', 'pastYouFPl'}):
        if r.get('stemMinLength') == 3 and r.get('type') == 'suffix':
            r['stemMinLength'] = 2
            n += 1
    return n


def short_stems(t):
    n = 0
    for _, r in rules(t):
        if r.get('stemNotStartsWith') == '[وفبكل]':
            del r['stemNotStartsWith']
            n += 1
    return n


PRONOUNS = {'p1s', 'p1sObj', 'p1p', 'p2s', 'p2d', 'p2mp', 'p2fp', 'p3ms', 'p3fs', 'p3d', 'p3mp', 'p3fp'}
ENDINGS = {'feminine', 'accusative', 'dual', 'oblique', 'pluralMasc', 'pluralFem'}
ABLATIONS = [
    ('no "ال" exclusion on pronoun, accusative and construct rules', drop_key('stemNotStartsWithText', 'ال', PRONOUNS | {'accusative', 'construct', 'dual'})),
    ('no "ال" exclusion on broken plurals', drop_key('stemNotStartsWithText', 'ال', {'brokenPlural'})),
    ('لـ before ل', drop_key('stemNotStartsWith', '[ل]', {'li'})),
    ('short stems after و ف ب ك ل', short_stems),
    ('past endings on two-letter stems', past_min_two),
    ('one-step object pronoun after a defective ending', drop_key('stemNotEndsWith', '[يوىا]', {'presentHe', 'presentSheYou', 'presentI', 'presentWe'})),
    ('stems of any characters (spaces)', drop_key('stemCharacters', '{base}')),
    ('noun endings give no conditions', set_out(ENDINGS, [])),
    ('الـ gives no conditions', set_out({'al'}, [])),
    ('ت + pronoun -> ة gives no conditions', set_out(PRONOUNS, [], lambda r: r.get('deinflected') == 'ة')),
    ('construct ending gives no conditions', set_out({'construct'}, [])),
    ('sa: any next letter', drop_key('stemStartsWith', '[يتنأآ]', {'sa'})),
    ('ي pronoun after ي', drop_key('stemNotEndsWith', '[ي]', {'p1s'})),
    ('accusative after ة ى ا', drop_key('stemNotEndsWith', '[اةى]', {'accusative'})),
]


def run(edit):
    target = SCRATCH / 'ar'
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    shutil.copytree(PACK, target)
    t = json.loads((target / 'transforms.json').read_text(encoding='utf-8'))
    n = edit(t)
    (target / 'transforms.json').write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    subprocess.run(['node', 'tools/check-classes.mjs', 'ar', '--write', '--languages', str(SCRATCH)], capture_output=True)
    out = subprocess.run(['build/language-conformance-test', str(target)], capture_output=True, text=True)
    fails = [line for line in out.stdout.splitlines() + out.stderr.splitlines() if line.startswith('FAIL')]
    return n, fails


def main():
    for name, edit in ABLATIONS:
        n, fails = run(edit)
        status = 'caught' if fails else 'NOT CAUGHT'
        print('%-62s %4d rules  %s  %s' % (name, n, status, fails[0][:90] if fails else ''))


if __name__ == '__main__':
    main()
