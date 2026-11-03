#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation checks for the pack's stem constraints and exclusions (docs/languages.md 14 step 7). Not run by any test.

    python3 mutate.py <repository> <scratch dir> [--only <name>]

Each mutant is a copy of languages/fr whose transforms.json lacks one
constraint, exclusion or condition. Where one rule row holds the endings of
several verbs, the verb's endings are moved to a row of their own without
the constraint, so each verb's constraint is tested by itself. For each
mutant tests/classes.json is written again (so only behaviour decides) and
language-conformance-test runs; a mutant survives when it passes. Prints
one line per mutant: killed or SURVIVED, and the first failure.
"""
import argparse, copy, json, os, re, shutil, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('repo'); ap.add_argument('scratch')
ap.add_argument('--only')
ap.add_argument('--survivors', help='mutate.py output: compare only the mutants it says SURVIVED')
ap.add_argument('--compare', nargs='*', help='lookup-batch, then dictionaries: print the first results that change on --texts')
ap.add_argument('--texts', action='append', default=[], help='files of lookup texts for --compare')
a = ap.parse_args()
pack = os.path.join(a.repo, 'languages', 'fr')
base = json.load(open(os.path.join(pack, 'transforms.json'), encoding='utf-8'))
CONSTRAINTS = ['stemMinLength', 'stemCharacters', 'stemContains', 'stemStartsWith', 'stemEndsWith', 'stemNotStartsWith',
               'stemNotEndsWith', 'stemStartsWithText', 'stemNotStartsWithText']


def pairs_of(rule):
    if rule['type'] == 'suffix':
        return [(rule['inflected'], rule['deinflected'])]
    if rule['type'] == 'circumfix' and rule.get('prefixes') == [['', '']]:
        return [tuple(p) for p in rule['suffixes']]
    return None


def without(transforms, key, value=None, ids=None, deinflected=None, inflected=None):
    """A copy where `key` (with `value`, when given) is removed from the matching rules; with
    `deinflected` or `inflected`, only those endings lose it, moved to rows of their own."""
    t2 = copy.deepcopy(transforms)
    hit = 0
    for t in t2['transforms']:
        if ids is not None and not any(t['id'] == i or t['id'].startswith(i + '-') for i in ids):
            continue
        rules = []
        for r in t['rules']:
            if key not in r or (value is not None and r[key] != value):
                rules.append(r)
                continue
            if deinflected is None and inflected is None:
                r = dict(r); del r[key]; rules.append(r); hit += 1
                continue
            ps = pairs_of(r)
            if ps is None:
                rules.append(r)
                continue
            match = [p for p in ps if (deinflected is None or p[1] == deinflected) and (inflected is None or p[0] == inflected)]
            if not match:
                rules.append(r)
                continue
            rest = [p for p in ps if p not in match]
            if rest:
                keep = dict(r)
                if keep['type'] == 'suffix':
                    keep = r
                else:
                    keep['suffixes'] = [list(p) for p in rest]
                rules.append(keep)
            moved = {k: v for k, v in r.items() if k not in ('inflected', 'deinflected', 'suffixes', 'prefixes', 'type', key)}
            rules.append({'type': 'circumfix', 'prefixes': [['', '']], 'suffixes': [list(p) for p in match], **moved})
            hit += 1
        t['rules'] = rules
    return t2, hit


def drop_rules(transforms, pred):
    t2 = copy.deepcopy(transforms)
    hit = 0
    for t in t2['transforms']:
        keep = []
        for r in t['rules']:
            if pred(t, r):
                hit += 1
            else:
                keep.append(r)
        t['rules'] = keep
    t2['transforms'] = [t for t in t2['transforms'] if t['rules']]
    return t2, hit


def edit(transforms, fn):
    t2 = copy.deepcopy(transforms)
    hit = 0
    for t in t2['transforms']:
        for r in t['rules']:
            hit += fn(t, r) or 0
    return t2, hit


mutants = []
M = lambda name, result: mutants.append((name, *result))
VERB = ['present', 'imperfect', 'simple-past', 'future', 'conditional', 'subjunctive', 'imperfect-subjunctive', 'imperative',
        'present-participle', 'past-participle']
# Verb models: the minimum stem of the regular endings, the 'alone' stems
# of être, avoir, aller and the listed verbs, and the en/y exclusions.
for d in ['er', 'ir']:
    M(f'stemMinLength of the {d} endings', without(base, 'stemMinLength', ids=VERB, deinflected=d))
for d in ['être', 'avoir', 'aller', 'voir', 'revoir', 'prévoir', 'croire', 'traire', 'extraire', 'rire', 'sourire', 'émouvoir', 'échoir']:
    M(f'stemNotEndsWith {{letter}} of {d}', without(base, 'stemNotEndsWith', '{letter}', ids=VERB, deinflected=d))
M('stemNotStartsWith [emst] of être', without(base, 'stemNotStartsWith', '[emst]', ids=VERB))
M('stemNotStartsWith [e] of vouloir', without(base, 'stemNotStartsWith', '[e]', ids=VERB))
M('stemNotStartsWith [y] of avoir', without(base, 'stemNotStartsWith', '[y]', ids=VERB))
M('stemNotStartsWithText "en " of the present participle', without(base, 'stemNotStartsWithText', 'en ', ids=['present-participle']))
M('stemMinLength of the -asser endings', without(base, 'stemMinLength', ids=VERB, deinflected='asser'))
M('the è stem change accepts any letter after the è', edit(base, lambda t, r: (r['stemChange'].update(between='{letter}') or 1) if 'stemChange' in r else 0))
M('the è stem change needs only consonants after the è', edit(base, lambda t, r: (r['stemChange'].update(between='{consonant}') or 1) if 'stemChange' in r else 0))
def no_min_on_stem_change(t, r):
    if 'stemChange' in r and 'stemMinLength' in r:
        del r['stemMinLength']
        return 1
    return 0
M('the è stem change without its minimum stem', edit(base, no_min_on_stem_change))
# Nouns and adjectives.
for tid in ['plural', 'feminine', 'feminine-noun', 'adverb']:
    M(f'stemCharacters {{notSpace}} of {tid}', without(base, 'stemCharacters', '{notSpace}', ids=[tid]))
    M(f'stemMinLength of {tid}', without(base, 'stemMinLength', ids=[tid]))
M('stemNotEndsWith [sxz] of the plural', without(base, 'stemNotEndsWith', '[sxz]', ids=['plural']))
# Clitics, elision, hyphens.
M('stemStartsWith {elidable} of the elision', without(base, 'stemStartsWith', '{elidable}', ids=['elision']))
M('the elision gives no vcl', edit(base, lambda t, r: (r.__setitem__('conditionsOut', []) or 1) if t['id'] == 'elision' and r['conditionsOut'] == ['vcl'] else 0))
M('the verb rules do not take vcl', edit(base, lambda t, r: (r.__setitem__('conditionsIn', [c for c in r['conditionsIn'] if c != 'vcl']) or 1) if 'vcl' in r['conditionsIn'] else 0))
for tid in ['imperative-pronoun', 'hyphen-nous-vous', 'inverted-subject', 'demonstrative', 'reflexive-imperative']:
    M(f'stemEndsWith {{letter}} of {tid}', without(base, 'stemEndsWith', '{letter}', ids=[tid]))
M('the imperative pronouns give no imp', edit(base, lambda t, r: (r.__setitem__('conditionsOut', []) or 1) if t['id'] == 'imperative-pronoun' else 0))
M('the inverted subject gives no fin', edit(base, lambda t, r: (r.__setitem__('conditionsOut', []) or 1) if t['id'] == 'inverted-subject' else 0))
M('stemNotStartsWith {vowel} of the reflexive imperative', without(base, 'stemNotStartsWith', '{vowel}', ids=['reflexive-imperative']))
M('stemStartsWith {elidable} of the reflexive imperative', without(base, 'stemStartsWith', '{elidable}', ids=['reflexive-imperative']))
M("m', t', s' elided before en", without(base, 'stemNotStartsWithText', 'en ', ids=['elision']))
M("m', t', s' elided before y", without(base, 'stemNotStartsWithText', 'y ', ids=['elision']))
M('stemNotStartsWith [l] of faire', without(base, 'stemNotStartsWith', '[l]', ids=VERB))
# Pronominal verbs.
M('the pronominal rule takes any person', edit(base, lambda t, r: (r.__setitem__('conditionsIn', ['v']) or 1) if t['id'] == 'pronominal' else 0))
M('me and te take each other\'s person', edit(base, lambda t, r: (r.__setitem__('conditionsIn', ['p2s' if r['conditionsIn'] == ['p1s'] else 'p1s']) or 1) if t['id'] == 'pronominal' else 0))
M('stemNotStartsWithText "suiv" of the pronominal rule', without(base, 'stemNotStartsWithText', 'suiv', ids=['pronominal']))
M('stemNotStartsWith {vowel} of the pronominal rule', without(base, 'stemNotStartsWith', '{vowel}', ids=['pronominal']))
M('stemStartsWith {elidable} of the pronominal rule', without(base, 'stemStartsWith', '{elidable}', ids=['pronominal']))
M('stemCharacters {letter} of the pronominal rule', without(base, 'stemCharacters', '{letter}', ids=['pronominal']))
M('the verb rules give no person', edit(base, lambda t, r: (r.__setitem__('conditionsOut', ['v']) or 1) if any(c in r['conditionsOut'] for c in ('p1s', 'p2s')) else 0))
# Written-out words.
M('no determiner forms', drop_rules(base, lambda t, r: t['id'] == 'determiner'))
M('no written-out plurals (yeux, messieurs)', drop_rules(base, lambda t, r: t['id'] == 'plural' and r['type'] == 'wholeWord'))
M('no maligne, bénigne', drop_rules(base, lambda t, r: t['id'] == 'feminine' and r['type'] == 'wholeWord'))
M('no gentiment, brièvement, impunément', drop_rules(base, lambda t, r: t['id'] == 'adverb' and r['type'] == 'wholeWord'))
M('no elided forms (l -> le, la)', drop_rules(base, lambda t, r: t['id'] == 'elided-form'))
M('no kept Yomitan rules', drop_rules(base, lambda t, r: r.get('source', t.get('source')) == 'yomitan'))

os.makedirs(a.scratch, exist_ok=True)
cli = os.path.join(a.repo, 'build', 'language-conformance-test')
survivors = None
if a.survivors:
    survivors = {l.split('\t')[1] for l in open(a.survivors, encoding='utf-8') if l.startswith('SURVIVED')}
if a.compare:
    lookup, dictionaries = a.compare[0], a.compare[1:]
    texts = []
    for path in a.texts:
        texts += [l.rstrip('\n') for l in open(path, encoding='utf-8') if l.strip()]
    texts = sorted(set(texts))
    def firsts(languages, d):
        p = subprocess.run([lookup, languages, 'fr', d], input='\n'.join(texts) + '\n', capture_output=True, text=True)
        out = []
        for line in p.stdout.splitlines():
            r = json.loads(line)
            f = next((x for x in r['results'] if not x['formOf']), None)
            out.append((r['text'], f and (f['expression'], f['matched'])))
        return out
    final_root = os.path.join(a.scratch, 'final-languages')
    shutil.rmtree(final_root, ignore_errors=True)
    shutil.copytree(pack, os.path.join(final_root, 'fr'), ignore=shutil.ignore_patterns('sources', 'tests'))
    reference = {d: firsts(final_root, d) for d in dictionaries}
for name, mutant, hit in mutants:
    if a.only and a.only not in name:
        continue
    if survivors is not None and name not in survivors:
        continue
    if a.compare:
        root = os.path.join(a.scratch, 'mutant-languages')
        shutil.rmtree(root, ignore_errors=True)
        os.makedirs(os.path.join(root, 'fr'))
        shutil.copy(os.path.join(pack, 'language.json'), os.path.join(root, 'fr'))
        with open(os.path.join(root, 'fr', 'transforms.json'), 'w', encoding='utf-8') as f:
            json.dump(mutant, f, ensure_ascii=False)
        changes = []
        for d in dictionaries:
            for (text, x), (_, y) in zip(reference[d], firsts(root, d)):
                if x != y:
                    changes.append(f"{text[:40]!r}: {x} -> {y}")
        print(f"{len(changes)}\t{name}\t{' | '.join(changes[:6])}", flush=True)
        continue
    if hit == 0:
        print(f'NO-OP\t{name}')
        continue
    root = os.path.join(a.scratch, 'languages')
    shutil.rmtree(root, ignore_errors=True)
    shutil.copytree(pack, os.path.join(root, 'fr'), ignore=shutil.ignore_patterns('sources'))
    with open(os.path.join(root, 'fr', 'transforms.json'), 'w', encoding='utf-8') as f:
        json.dump(mutant, f, ensure_ascii=False, indent=2)
    w = subprocess.run(['node', os.path.join(a.repo, 'tools', 'check-classes.mjs'), 'fr', '--write', '--languages', root], capture_output=True, text=True)
    if w.returncode != 0:
        print(f'ERROR\t{name}\tcheck-classes: {w.stderr.strip()[:200]}')
        continue
    p = subprocess.run([cli, os.path.join(root, 'fr'), os.path.join(a.scratch, 'tmp')], capture_output=True, text=True)
    fails = [l for l in (p.stdout + p.stderr).splitlines() if l.startswith('FAIL')]
    status = 'killed' if p.returncode != 0 or fails else 'SURVIVED'
    print(f"{status}\t{name}\t{hit} rules\t{fails[0][:160] if fails else ''}", flush=True)
