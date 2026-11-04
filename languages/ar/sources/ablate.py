#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Removes each constraint and condition the pack relies on, one at a time, in a
scratch copy of the pack, and checks that the conformance test then fails
(docs/languages.md 14 step 7). The rule edits change transforms.json, the
processor edits language.json; the whole words checked are those of the
frequent homographs, which tests/lookup.tsv pins by their first result.

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


def set_min(ids, old, new, kinds=('prefix', 'suffix', 'circumfix')):
    def edit(t):
        n = 0
        for _, r in rules(t, ids):
            if r.get('type') in kinds and r.get('stemMinLength', 0) == old:
                r['stemMinLength'] = new
                n += 1
        return n
    return edit


def drop_whole(ids, words):
    def edit(t):
        n = 0
        for x in t['transforms']:
            if x['id'] in ids:
                before = len(x['rules'])
                x['rules'] = [r for r in x['rules'] if not (r.get('type') == 'wholeWord' and r['inflected'] in words)]
                n += before - len(x['rules'])
        return n
    return edit


def drop_suffix(ids, inflected, deinflected):
    def edit(t):
        n = 0
        for x in t['transforms']:
            if x['id'] in ids:
                before = len(x['rules'])
                x['rules'] = [r for r in x['rules'] if not (r.get('type') == 'suffix' and r.get('inflected') == inflected and r.get('deinflected') == deinflected)]
                n += before - len(x['rules'])
        return n
    return edit


def move_transform(tid, before):
    def edit(t):
        ids = [x['id'] for x in t['transforms']]
        x = t['transforms'].pop(ids.index(tid))
        t['transforms'].insert([y['id'] for y in t['transforms']].index(before), x)
        return 1
    return edit


def processor_edit(change):
    """An edit of language.json's preprocessors, marked for run()."""
    change.language = True
    return change


@processor_edit
def unicode_last(d):
    p = d['lookup']['preprocessors']
    p.append(p.pop([x['id'] for x in p].index('normalizeUnicode')))
    return 1


@processor_edit
def hamza_first(d):
    p = d['lookup']['preprocessors']
    x = p.pop([y['id'] for y in p].index('addHamza'))
    p.insert([y['id'] for y in p].index('removeArabicScriptDiacritics'), x)
    return 1


@processor_edit
def letter_forms_late(d):
    p = d['lookup']['preprocessors']
    x = p.pop([y['id'] for y in p].index('arabicLetterForms'))
    p.insert([y['id'] for y in p].index('addHamza') + 1, x)
    return 1


@processor_edit
def dagger_late(d):
    p = d['lookup']['preprocessors']
    x = p.pop([y['id'] for y in p].index('daggerAlif'))
    p.insert([y['id'] for y in p].index('removeArabicScriptDiacritics') + 1, x)
    return 1


def first_person_object(t):
    n = 0
    for _, r in rules(t, {'presentI', 'presentWe'}):
        if r.get('type') == 'circumfix' and r.get('stemCharacters') == STRONG and any(x[0] == 'ه' for x in r['suffixes']):
            r['suffixes'] = r['suffixes'] + [['ني', ''], ['نا', '']]
            n += 1
    return n


@processor_edit
def maqsura_all(d):
    for x in d['lookup']['preprocessors']:
        if x['id'] == 'convertAlifMaqsuraToYaa':
            x['variants'][0][0]['at'] = 'all'
    return 1


STRONG = r'[\u0621-\u0626\u0628-\u063A\u0641-\u0647]'  # the letters other than ا و ي ى (own-rules.mjs)
PRONOUNS = {'p1s', 'p1sObj', 'p1p', 'p2s', 'p2d', 'p2mp', 'p2fp', 'p3ms', 'p3fs', 'p3d', 'p3mp', 'p3fp'}
ENDINGS = {'feminine', 'accusative', 'dual', 'oblique', 'pluralMasc', 'pluralFem'}
ABLATIONS = [
    ('no "ال" exclusion on pronoun, accusative and construct rules', drop_key('stemNotStartsWithText', 'ال', PRONOUNS | {'accusative', 'construct', 'dual'})),
    ('no "ال" exclusion on broken plurals', drop_key('stemNotStartsWithText', 'ال', {'brokenPlural'})),
    ('لـ before ل', drop_key('stemNotStartsWith', '[ل]', {'li'})),
    ('short stems after و ف ب ك ل', short_stems),
    ('past endings on two-letter stems', past_min_two),
    ('stems of any characters (spaces)', drop_key('stemCharacters', '{base}')),
    ('noun endings give no conditions', set_out(ENDINGS, [])),
    ('الـ gives no conditions', set_out({'al'}, [])),
    ('ت + pronoun -> ة gives no conditions', set_out(PRONOUNS, [], lambda r: r.get('deinflected') == 'ة')),
    ('construct ending gives no conditions', set_out({'construct'}, [])),
    ('sa: any next letter', drop_key('stemStartsWith', '[يتنأآ]', {'sa'})),
    ('ي pronoun after ي or أ', drop_key('stemNotEndsWith', '[يأ]', {'p1s'})),
    ('accusative after ة ى ا', drop_key('stemNotEndsWith', '[اةى]', {'accusative'})),
    ('proclitics on one-letter stems', set_min({'wa', 'fa', 'bi', 'ka', 'li'}, 2, 1, ('prefix',))),
    ('الـ on a word of one letter', set_min({'al'}, 1, 0, ('circumfix',))),
    ('سـ on two-letter stems', set_min({'sa'}, 3, 2, ('prefix',))),
    ('سـ gives no conditions', set_out({'sa'}, [])),
    ('proclitics before any character (digits)', drop_key('stemStartsWith', '{base}', {'wa'})),
    ('one-step object pronoun on weak stems', drop_key('stemCharacters', STRONG, {'presentHe', 'presentSheYou', 'presentI', 'presentWe'})),
    ('form I imperative stems with long vowels', drop_key('stemCharacters', STRONG, {'imperativeYou'})),
    ('ـتيه -> ـت', drop_suffix(PRONOUNS, 'تيه', 'ت')),
    ('whole words: frequent homographs', drop_whole({'demonstrative', 'presentHe', 'presentSheYou', 'al', 'p1p', 'listedPlural', 'jussiveWe',
                                                     'definiteAdjective', 'imperativeYou', 'p3ms'},
                                                    {'تلك', 'يمكنك', 'يجب', 'الحين', 'معنا', 'أيدي', 'نكن', 'الأولى', 'ضع', 'صوته', 'يحب', 'صل', 'ر'})),
    ('processors: normalizeUnicode last', unicode_last),
    ('processors: addHamza before the diacritics', hamza_first),
    ('processors: arabicLetterForms after addHamza', letter_forms_late),
    ('processors: alif maqsura anywhere', maqsura_all),
    ('processors: daggerAlif after the diacritics', dagger_late),
    ('one-step present with a first-person object after أ and ن', first_person_object),
]


def run(edit):
    target = SCRATCH / 'ar'
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    shutil.copytree(PACK, target)
    name = 'language.json' if getattr(edit, 'language', False) else 'transforms.json'
    t = json.loads((target / name).read_text(encoding='utf-8'))
    n = edit(t)
    (target / name).write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
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
