#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Section 14 step 7 of docs/languages.md: removes each stem constraint and
exclusion of the pack, in a scratch copy, writes tests/classes.json again and
runs language-conformance-test on the copy. A mutation that no test catches
is listed as SURVIVED.

    python3 languages/sh/sources/mutate.py [--build build] [--only <name>]

Each mutation edits the rules of transforms.json (and language.json where
it says so). Every rule of a kind is edited at once.
"""
import argparse, copy, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PACK))


def rules(t):
    for tr in t['transforms']:
        for r in tr['rules']:
            yield tr, r


def drop_key(key, value=None, out=None):
    def edit(t, lang):
        n = 0
        for tr, r in rules(t):
            if key in r and (value is None or r[key] == value) and (out is None or set(out) & set(r['conditionsOut'])):
                del r[key]
                n += 1
        return n
    return edit


def set_key(key, old, new):
    def edit(t, lang):
        n = 0
        for tr, r in rules(t):
            if r.get(key) == old:
                r[key] = new
                n += 1
        return n
    return edit


def lower_min():
    def edit(t, lang):
        n = 0
        for tr, r in rules(t):
            if r.get('stemMinLength', 0) >= 2:
                r['stemMinLength'] -= 1
                n += 1
        return n
    return edit


def generic_suffix(transform_id, rule):
    """Adds a rule the pack writes per root or per word (an exclusion by listing)."""
    def edit(t, lang):
        for tr in t['transforms']:
            if tr['id'] == transform_id:
                tr['rules'].append(rule)
                return 1
        return 0
    return edit


def pattern_edit(old, new):
    def edit(t, lang):
        n = 0
        for tr, r in rules(t):
            if r['type'] == 'pattern' and old in r['pattern']:
                r['pattern'] = r['pattern'].replace(old, new)
                n += 1
        return n
    return edit


def drop_whole(forms):
    def edit(t, lang):
        n = 0
        for tr in t['transforms']:
            keep = [r for r in tr['rules'] if not (r['type'] == 'wholeWord' and r['inflected'] in forms)]
            n += len(tr['rules']) - len(keep)
            tr['rules'] = keep
        return n
    return edit


V = ['v']
def add_rule(transform_id, rule):
    return generic_suffix(transform_id, rule)


def drop_rules(predicate):
    def edit(t, lang):
        n = 0
        for tr in t['transforms']:
            keep = [r for r in tr['rules'] if not predicate(tr, r)]
            n += len(tr['rules']) - len(keep)
            tr['rules'] = keep
        return n
    return edit


def rename(transform_id):
    def edit(t, lang):
        for tr in t['transforms']:
            if tr['id'] == transform_id:
                tr['id'] += '-renamed'
                return 1
        return 0
    return edit


def processor_map(processor, key, value):
    def edit(t, lang):
        for p in lang['lookup']['preprocessors']:
            if p['id'] == processor:
                for variant in p['variants']:
                    for step in variant:
                        if 'map' in step and key in step['map']:
                            step['map'][key] = value
                            return 1
        return 0
    return edit


def word_internal_null(t, lang):
    lang['text']['wordInternal'] = None
    return 1


def order_nouns_first(t, lang):
    nouns = [tr for tr in t['transforms'] if tr['id'].startswith('n-') and not tr['id'].startswith('n-irr')]
    rest = [tr for tr in t['transforms'] if tr not in nouns]
    first = next(i for i, tr in enumerate(rest) if tr['id'].startswith('adj-'))
    t['transforms'] = rest[:first] + nouns + rest[first:]
    return len(nouns)


def order_adjectives_first(t, lang):
    adjectives = [tr for tr in t['transforms'] if tr['id'].startswith(('adj-', 'cmp-'))]
    rest = [tr for tr in t['transforms'] if tr not in adjectives]
    first = next(i for i, tr in enumerate(rest) if tr['id'].startswith('n-') and not tr['id'].startswith('n-irr'))
    t['transforms'] = rest[:first] + adjectives + rest[first:]
    return len(adjectives)


PREFERRED = {'nema', 'reci', 'radim', 'izgleda', 'pusti', 'govori', 'otvori', 'druge', 'sobu', 'vodu'}
MUTATIONS = [
    ('no space guard ({stem})', drop_key('stemCharacters', '{stem}')),
    ('no space and capital guard ({lowerStem})', drop_key('stemCharacters', '{lowerStem}')),
    ('capital guard only a space guard ({lowerStem} → {stem})', set_key('stemCharacters', '{lowerStem}', '{stem}')),
    ('vocative o → a: capital guard removed', lambda t, lang: sum(1 for tr, r in rules(t) if tr['id'] == 'n-voc-sg' and r.get('inflected') == 'o' and r.get('deinflected') == 'a' and r.update(stemCharacters='{stem}') is None)),
    ('minimum stems one shorter', lower_min()),
    ('stemEndsWith {consonant} removed', drop_key('stemEndsWith', '{consonant}')),
    ('stemEndsWith {palatal} removed', drop_key('stemEndsWith', '{palatal}')),
    ('stemEndsWith {softNeuter} removed', drop_key('stemEndsWith', '{softNeuter}')),
    ('stemEndsWith {palatalOrR} removed', drop_key('stemEndsWith', '{palatalOrR}')),
    ('stemEndsWith {afterA} removed', drop_key('stemEndsWith', '{afterA}')),
    ('stemEndsWith {nonJotated} removed', drop_key('stemEndsWith', '{nonJotated}')),
    ('stemEndsWith {stemVowel} removed', drop_key('stemEndsWith', '{stemVowel}')),
    ('stemEndsWith [ieo] removed', drop_key('stemEndsWith', '[ieo]')),
    ('stemNotEndsWith [pk] removed', drop_key('stemNotEndsWith', '[pk]')),
    ('stemNotStartsWithText jest removed', drop_key('stemNotStartsWithText', 'jest')),
    ('stemChange between removed', lambda t, lang: sum(1 for tr, r in rules(t) if 'stemChange' in r and r['stemChange'].pop('between', None) is not None)),
    ('-sti stems: generic de → sti', generic_suffix('prs-present-3sg', {'type': 'suffix', 'inflected': 'de', 'deinflected': 'sti', 'conditionsIn': [], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('-sti stems: generic te → sti (pletem)', generic_suffix('prs-present-3sg', {'type': 'suffix', 'inflected': 'te', 'deinflected': 'sti', 'conditionsIn': [], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('-sti stems: generic se → sti (tresem)', generic_suffix('prs-present-3sg', {'type': 'suffix', 'inflected': 'se', 'deinflected': 'sti', 'conditionsIn': [], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('-ije- roots: generic ije → iti', generic_suffix('prs-present-3sg', {'type': 'suffix', 'inflected': 'ije', 'deinflected': 'iti', 'conditionsIn': [], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('-t participle: generic t → ti', generic_suffix('ptcp-passive-participle-short-infinitive', {'type': 'suffix', 'inflected': 't', 'deinflected': 'ti', 'conditionsIn': ['adj'], 'conditionsOut': V, 'stemMinLength': 2, 'stemCharacters': '{lowerStem}', 'stemEndsWith': '{stemVowel}'})),
    ('stati class: generic ane → ati', generic_suffix('prs-present-3sg', {'type': 'suffix', 'inflected': 'ane', 'deinflected': 'ati', 'conditionsIn': [], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('-ću instrumental: generic ću → ć', generic_suffix('n-ins-sg', {'type': 'suffix', 'inflected': 'ću', 'deinflected': 'ć', 'conditionsIn': [], 'conditionsOut': ['n'], 'stemMinLength': 1, 'stemCharacters': '{stem}'})),
    ('jotated comparatives: generic či → k', generic_suffix('cmp-comparative', {'type': 'suffix', 'inflected': 'či', 'deinflected': 'k', 'conditionsIn': ['adj', 'cmp'], 'conditionsOut': ['adj'], 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('jotated comparatives: generic ći → t', generic_suffix('cmp-comparative', {'type': 'suffix', 'inflected': 'ći', 'deinflected': 't', 'conditionsIn': ['adj', 'cmp'], 'conditionsOut': ['adj'], 'stemMinLength': 2, 'stemCharacters': '{lowerStem}'})),
    ('jotated comparatives: generic ži → g', generic_suffix('cmp-comparative', {'type': 'suffix', 'inflected': 'ži', 'deinflected': 'g', 'conditionsIn': ['adj', 'cmp'], 'conditionsOut': ['adj'], 'stemMinLength': 2, 'stemCharacters': '{lowerStem}'})),
    ('future pattern: any stem before t', pattern_edit('^([^ ]*[aeiu]s?|[^ ]*bos)t', '^([^ ]+)t')),
    ('future pattern: any stem before ti or ći', pattern_edit('^([^ ]*[aeiu]s?ti|[^ ]*bosti|[^ ]*[aeiou]ći)', '^([^ ]+(?:ti|ći))')),
    ('jotated comparatives removed (brži, mlađi, ...)', drop_whole({'brži', 'mlađi', 'žući', 'skuplji', 'jači', 'kraći', 'lakši', 'ljepši', 'viši', 'niži'})),
    ('pronoun nikom, nekom removed', drop_whole({'nikom', 'nekom'})),
    # The audit's (audit-hachi-lang-sh) and the fixes after it.
    ('generic l-participle stao → sti', add_rule('ptcp-past-masc-sg', {'type': 'suffix', 'inflected': 'stao', 'deinflected': 'sti', 'conditionsIn': ['lpart'], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('generic l-participle ao → asti', add_rule('ptcp-past-masc-sg', {'type': 'suffix', 'inflected': 'ao', 'deinflected': 'asti', 'conditionsIn': ['lpart'], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('generic l-participle sla → sti', add_rule('ptcp-past-fem-sg-neut-pl', {'type': 'suffix', 'inflected': 'sla', 'deinflected': 'sti', 'conditionsIn': [], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('generic l-participle ela → esti', add_rule('ptcp-past-fem-sg-neut-pl', {'type': 'suffix', 'inflected': 'ela', 'deinflected': 'esti', 'conditionsIn': [], 'conditionsOut': V, 'stemMinLength': 1, 'stemCharacters': '{lowerStem}'})),
    ('generic comparative đi → d', add_rule('cmp-comparative', {'type': 'suffix', 'inflected': 'đi', 'deinflected': 'd', 'conditionsIn': ['adj', 'cmp'], 'conditionsOut': ['adj'], 'stemMinLength': 2, 'stemCharacters': '{lowerStem}'})),
    ('generic comparative lji → p', add_rule('cmp-comparative', {'type': 'suffix', 'inflected': 'lji', 'deinflected': 'p', 'conditionsIn': ['adj', 'cmp'], 'conditionsOut': ['adj'], 'stemMinLength': 2, 'stemCharacters': '{lowerStem}'})),
    ('generic comparative ši → h', add_rule('cmp-comparative', {'type': 'suffix', 'inflected': 'ši', 'deinflected': 'h', 'conditionsIn': ['adj', 'cmp'], 'conditionsOut': ['adj'], 'stemMinLength': 2, 'stemCharacters': '{lowerStem}'})),
    ('passive bačen → baciti removed', drop_rules(lambda tr, r: r.get('inflected') == 'bačen' or ['bačen', 'baciti'] in r.get('suffixes', []))),
    ('noun and adjective lemmas of 2 letters', lambda t, lang: sum(1 for tr, r in rules(t) if r.get('stemMinLength') == 3 and r.get('deinflected', '') == '' and r.update(stemMinLength=2) is None)),
    ('preferred readings removed', drop_rules(lambda tr, r: r['type'] == 'wholeWord' and r['inflected'] in PREFERRED)),
    ('one preferred reading removed (radim → raditi)', drop_rules(lambda tr, r: r['type'] == 'wholeWord' and r['inflected'] == 'radim' and r['deinflected'] == 'raditi')),
    ('-ad collectives widened to suffix rules', lambda t, lang: add_rule('n-collective-plural-gen-dat-loc-ins', {'type': 'suffix', 'inflected': 'adi', 'deinflected': 'e', 'conditionsIn': [], 'conditionsOut': ['n'], 'stemMinLength': 2})(t, lang) + add_rule('n-collective-plural', {'type': 'suffix', 'inflected': 'ad', 'deinflected': 'e', 'conditionsIn': [], 'conditionsOut': ['n'], 'stemMinLength': 2})(t, lang)),
    ('otići written out removed', drop_rules(lambda tr, r: r['type'] == 'wholeWord' and r['deinflected'] == 'otići')),
    ('cio written out removed', drop_rules(lambda tr, r: r['type'] == 'wholeWord' and r['deinflected'] == 'cio')),
    ('pronoun time removed', drop_whole({'time'})),
    ('processor: Cyrillic Џ → D', processor_map('cyrillicToLatin', 'Џ', 'D')),
    ('wordInternal null (the apostrophe separates words)', word_internal_null),
    ('untaggedTerms filter (the untagged dictionary meets no rule)', lambda t, lang: (lang['lookup'].update(untaggedTerms='filter'), 1)[1]),
    ('rename transform id ptcp-past-masc-sg', rename('ptcp-past-masc-sg')),
    ('rename transform id n-dat-loc-sg-voc-sg', rename('n-dat-loc-sg-voc-sg')),
]


def run(name, edit, build):
    with tempfile.TemporaryDirectory(prefix='sh-mutate-') as tmp:
        dest = os.path.join(tmp, 'sh')
        shutil.copytree(PACK, dest)
        tpath = os.path.join(dest, 'transforms.json')
        lpath = os.path.join(dest, 'language.json')
        t = json.load(open(tpath, encoding='utf-8'))
        lang = json.load(open(lpath, encoding='utf-8'))
        n = edit(t, lang)
        if n == 0:
            return name, 'NO EDIT', ''
        json.dump(t, open(tpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        json.dump(lang, open(lpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        w = subprocess.run(['node', os.path.join(REPO, 'tools', 'check-classes.mjs'), 'sh', '--write', '--languages', tmp], capture_output=True, text=True)
        if w.returncode != 0:
            return name, 'KILLED (check-classes)', w.stderr.strip()[:200]
        c = subprocess.run([os.path.join(REPO, build, 'language-conformance-test'), dest, tmp], capture_output=True, text=True)
        out = c.stdout + c.stderr
        fails = [l for l in out.splitlines() if l.startswith('FAIL')]
        if c.returncode == 0 and not fails:
            return name, f'SURVIVED ({n} rules)', ''
        return name, f'KILLED ({n} rules)', fails[0][:160] if fails else out[-160:]


def deinflect_all(languages, words, build):
    out = subprocess.run([os.path.join(REPO, build, 'hoshidicts-cli'), '--languages', languages, 'deinflect', 'sh', '--stdin'],
                         input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    return {d['input']: {r['text'] for r in d['results'][1:]} for d in map(json.loads, out.splitlines())}


def diff(args):
    words = [line.split()[0] for line in open(args.diff, encoding='utf-8')]
    heads = set(line.rstrip('\n') for line in open(args.headwords, encoding='utf-8'))
    base = deinflect_all(os.path.dirname(PACK), words, args.build)
    for name, edit in MUTATIONS:
        if args.only and args.only not in name:
            continue
        with tempfile.TemporaryDirectory(prefix='sh-mutate-') as tmp:
            dest = os.path.join(tmp, 'sh')
            shutil.copytree(PACK, dest)
            tpath = os.path.join(dest, 'transforms.json')
            t = json.load(open(tpath, encoding='utf-8'))
            edit(t, None)
            json.dump(t, open(tpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
            mutant = deinflect_all(tmp, words, args.build)
        new = [(w, x) for w in words for x in sorted(mutant[w] - base[w]) if x in heads]
        print(f'{name}: {len(new)} new headword readings', new[:15])
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--build', default='build')
    parser.add_argument('--only')
    parser.add_argument('--diff', help='a word list: print the headword readings of these words only the mutant gives')
    parser.add_argument('--headwords', help='a file of headwords with definitions, one per line (for --diff)')
    args = parser.parse_args()
    if args.diff:
        return diff(args)
    survived = 0
    for name, edit in MUTATIONS:
        if args.only and args.only not in name:
            continue
        name, verdict, detail = run(name, edit, args.build)
        survived += verdict.startswith('SURVIVED') or verdict == 'NO EDIT'
        print(f'{verdict:28s} {name}  {detail}')
    print(f'{survived} survived or did not apply')
    return 1 if survived else 0


if __name__ == '__main__':
    sys.exit(main())
