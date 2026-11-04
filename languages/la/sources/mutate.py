#!/usr/bin/env python3
"""docs/languages.md section 14 step 7: each mutant edits a scratch copy of the
pack, rewrites tests/classes.json and runs the conformance test.
Usage: python3 languages/la/sources/mutate.py <repo> <scratch dir>"""
import json, os, shutil, subprocess, sys

repo, work = sys.argv[1], sys.argv[2]
pack = f'{repo}/languages/la'
base = json.load(open(f'{pack}/transforms.json'))
lang = json.load(open(f'{pack}/language.json'))
node = os.environ.get('NODE', 'node')
conf = f'{repo}/build/language-conformance-test'


def rules(t):
    for tr in t['transforms']:
        for r in tr['rules']:
            yield tr, r


def drop_key(key, value=None, pred=lambda tr, r: True):
    def f(t, l):
        n = 0
        for tr, r in rules(t):
            if key in r and (value is None or r[key] == value) and pred(tr, r):
                del r[key]
                n += 1
        return n
    return f


def drop_rules(pred):
    def f(t, l):
        n = 0
        for tr in t['transforms']:
            before = len(tr['rules'])
            tr['rules'] = [r for r in tr['rules'] if not pred(tr, r)]
            n += before - len(tr['rules'])
        t['transforms'] = [tr for tr in t['transforms'] if tr['rules']]
        return n
    return f


def drop_processor(pid):
    def f(t, l):
        l['lookup']['preprocessors'] = [p for p in l['lookup']['preprocessors'] if p['id'] != pid]
        return 1
    return f


def move(pred, last=True):
    def f(t, l):
        moved = [tr for tr in t['transforms'] if pred(tr['id'])]
        rest = [tr for tr in t['transforms'] if not pred(tr['id'])]
        t['transforms'] = rest + moved if last else moved + rest
        return len(moved)
    return f


def set_in(old, new, pred=lambda tr, r: True):
    def f(t, l):
        n = 0
        for tr, r in rules(t):
            if r['conditionsIn'] == old and pred(tr, r):
                r['conditionsIn'] = new
                n += 1
        return n
    return f


def enclitics_at_all(t, l):
    for p in l['lookup']['preprocessors']:
        if p['id'] == 'enclitics':
            for v in p['variants']:
                v[0]['at'] = 'all'
    return 1


def no_verb_condition(t, l):
    n = 0
    for tr, r in rules(t):
        if r['conditionsOut'] == ['v']:
            r['conditionsOut'] = []
            n += 1
    return n


def swap(tid, first, second):
    def f(t, l):
        rs = next(tr for tr in t['transforms'] if tr['id'] == tid)['rules']
        i, j = next(k for k, r in enumerate(rs) if first(r)), next(k for k, r in enumerate(rs) if second(r))
        rs[i], rs[j] = rs[j], rs[i]
        return 1
    return f


MUTANTS = {
    'verb root min 2 -> 0': drop_key('stemMinLength', 2, lambda tr, r: 'v' in r['conditionsOut'] and r['type'] == 'suffix'),
    '3rd conj root not after a e i o': drop_key('stemNotEndsWith', '[aeio]'),
    'lowercase stem guard': drop_key('stemCharacters', '[^ A-Z]'),
    'no-space guard': drop_key('stemCharacters', '[^ ]'),
    'l/r stems (stemEndsWith [lr])': drop_key('stemEndsWith', '[lr]'),
    '-inis -> -o after b d g l m': drop_key('stemEndsWith', '[bdglm]'),
    'dom- exclusion': drop_key('stemNotStartsWithText', 'dom'),
    'cet- exclusion': drop_key('stemNotStartsWithText', 'cet'),
    '-ui -> -o after l m p r x': drop_key('stemEndsWith', '[lmprx]'),
    'contracted -ov- after n': drop_key('stemEndsWith', '[n]', lambda tr, r: r.get('deinflected') == 'ovi'),
    'contracted -ev- after l': drop_key('stemEndsWith', '[l]', lambda tr, r: r.get('deinflected') == 'evi'),
    'solutus -> solvo after l': drop_key('stemEndsWith', '[l]', lambda tr, r: r.get('deinflected') == 'vo'),
    'participle not: exclusions': drop_key('stemNotEndsWith', None, lambda tr, r: tr['id'] in ('ptc-perf', 'supine', 'ptc-fut', 'supine-abl')),
    'esse participle stem [dstx]/[r]': drop_key('stemEndsWith', None, lambda tr, r: 'aux' in r['conditionsIn']),
    'esse participle lowercase stem': drop_key('stemCharacters', '[^ A-Z]', lambda tr, r: 'aux' in r['conditionsIn']),
    'name rules capitalised': drop_key('stemStartsWith', '[A-Z]'),
    'compound prefix min 2': drop_key('stemMinLength', 2, lambda tr, r: tr['id'] == 'perf-stem'),
    'perfect ending stem min 2': drop_key('stemMinLength', 2, lambda tr, r: 'vpf' in r['conditionsOut']),
    '4th decl -ui min 3': drop_key('stemMinLength', 3, lambda tr, r: r.get('inflected') == 'ui'),
    'remove periphrastic esse rules': drop_rules(lambda tr, r: tr['id'] == 'esse'),
    'remove fero compounds (attuli ...)': drop_rules(lambda tr, r: r.get('inflected') in ('attuli', 'abstuli', 'sustuli', 'extuli', 'obtuli', 'distuli', 'rettuli')),
    'remove eo family': drop_rules(lambda tr, r: r['type'] == 'circumfix' and any(s[1] == 'eo' for s in r.get('suffixes', []))),
    'remove sum family': drop_rules(lambda tr, r: r['type'] == 'circumfix' and any(s[1] == 'sum' for s in r.get('suffixes', []))),
    'remove pronouns ea/id lemmas': drop_rules(lambda tr, r: r['type'] == 'wholeWord' and r.get('deinflected') in ('ea', 'id')),
    'processor uToV': drop_processor('uToV'),
    'processor jToI': drop_processor('jToI'),
    'processor enclitics': drop_processor('enclitics'),
    'processor removeAlphabeticDiacritics': drop_processor('removeAlphabeticDiacritics'),
    'processor processDiphtongs': drop_processor('processDiphtongs'),
    'processor vToU': drop_processor('vToU'),
    'enclitics anywhere': enclitics_at_all,
    'verbs without v': no_verb_condition,
    'noesse participles before esse': set_in(['ptc'], ['ptc', 'aux', 'ptcx'], lambda tr, r: tr['id'] == 'ptc-perf'),
    '-os/-as before finite esse': set_in(['auxi'], ['aux']),
    'participle stems advoc/inv/per': drop_key('stemNotStartsWithText', None, lambda tr, r: tr['id'] == 'ptc-perf'),
    'esse min 3': drop_key('stemMinLength', 3, lambda tr, r: tr['id'] == 'esse'),
    'participle before esse min 3': drop_key('stemMinLength', 3, lambda tr, r: r['conditionsIn'] in (['aux'], ['auxi'])),
    '4th decl neuter -u': drop_rules(lambda tr, r: r.get('deinflected') == 'u' and tr['id'].startswith('n-')),
    'perfect after present': move(lambda i: i.startswith(('perf', 'plupf', 'futpf', 'inf-perf'))),
    'dative plural first': move(lambda i: i == 'n-dat-pl', last=False),
    'vocative first': move(lambda i: i == 'n-voc-sg', last=False),
    'names after adjectives': move(lambda i: i.startswith('name-')),
    'nouns before adjectives': move(lambda i: i.startswith(('n-', 'pron-')), last=False),
    'neuter plural nouns before adjectives': move(lambda i: i == 'n-nom-pl+n-acc-pl', last=False),
    'no noun forms before the adjectives': drop_rules(lambda tr, r: tr['id'] == 'n-first'),
    'name rules min stem 2': drop_key('stemMinLength', 2, lambda tr, r: tr['id'].startswith('name-')),
    '-am participle before esse': drop_rules(lambda tr, r: r.get('inflected') == 'am' and r['conditionsIn'] == ['auxi']),
    'n-first stems not whole': drop_key('stemCharacters', '[]', lambda tr, r: tr['id'] == 'n-first'),
    'n-first -tura min stem 3': drop_key('stemMinLength', 3, lambda tr, r: tr['id'] == 'n-first'),
    'jura alone (imp-2s a)': drop_key('stemNotStartsWithText', 'jur', lambda tr, r: r.get('inflected') == 'a'),
    'no n-first -a nouns': drop_rules(lambda tr, r: tr['id'] == 'n-first' and r.get('prefixes', [[0]])[0][0] == 'pluvi'),
    'no n-first -sura': lambda t, l: sum(r.update(suffixes=[x for x in r['suffixes'] if 'sur' not in x[0]]) or 1 for tr, r in rules(t) if tr['id'] == 'n-first' and r.get('prefixes') == [['', '']]),
    'no ordinals': drop_rules(lambda tr, r: tr['id'] == 'ord'),
    'no whole-word fixes': drop_rules(lambda tr, r: r['type'] == 'wholeWord' and r['inflected'] in ('loca', 'viris', 'animalia', 'exercitum', 'exercitu', 'oportere', 'dicam', 'nate', 'navem', 'que')),
    '-sidi -> -sido again': lambda t, l: [tr['rules'].append(dict(r, inflected='sidi')) for tr, r in list(rules(t)) if tr['id'] == 'perf-stem' and r.get('inflected') == 'sedi' and r.get('deinflected') == 'sido'][:1] and 1,
    '-is -> -us before -is -> -a': swap('n-dat-pl', lambda r: r.get('deinflected') == 'a' and r.get('inflected') == 'is', lambda r: r.get('deinflected') == 'us' and r.get('inflected') == 'is'),
}
MUTANTS['longer stems of the exclusions'] = drop_rules(lambda tr, r: 'stemStartsWithText' in r)
for stem in ('nav', 'argent', 'patri', 'mens', 'bell', 'suppl', 'cop', 'ac', 'la', 'arm', 'fo', 'can', 'imp', 'loc', 'Ital', 'exist', 'jur', 'curt', 'coel', 'line', 'gen', 'put', 'scrib', 'pen', 'fac', 'man'):
    MUTANTS[f'{stem}- left to the dictionary'] = drop_key('stemNotStartsWithText', stem)

for w in ('loca', 'animalia', 'exercitum', 'exercitu', 'oportere', 'dicam', 'nate', 'que', 'solis', 'proxime'):
    MUTANTS[f'{w} whole word'] = drop_rules(lambda tr, r, w=w: r['type'] == 'wholeWord' and r['inflected'] == w)
MUTANTS['untaggedTerms pass'] = lambda t, l: l['lookup'].update(untaggedTerms='pass') or 1

results = []
for name, mutate in MUTANTS.items():
    root = f'{work}/mutant'
    shutil.rmtree(root, ignore_errors=True)
    shutil.copytree(f'{repo}/languages/la', f'{root}/la')
    t = json.loads(json.dumps(base))
    l = json.loads(json.dumps(lang))
    n = mutate(t, l)
    json.dump(t, open(f'{root}/la/transforms.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(l, open(f'{root}/la/language.json', 'w'), ensure_ascii=False, indent=2)
    subprocess.run([node, f'{repo}/tools/check-classes.mjs', 'la', '--write', '--languages', root], capture_output=True)
    p = subprocess.run([conf, f'{root}/la'], capture_output=True, text=True, timeout=900)
    out = p.stdout + p.stderr
    fails = [line for line in out.splitlines() if line.startswith('FAIL')]
    verdict = 'killed' if p.returncode != 0 else 'SURVIVED'
    results.append((name, n, verdict, fails[:2]))
    print(f'{verdict:9s} {name} ({n} changed) {fails[:1]}', flush=True)
shutil.rmtree(f'{work}/mutant', ignore_errors=True)
