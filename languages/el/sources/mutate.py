#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Mutation checks of docs/languages.md 14 step 7: in a scratch copy of the
# pack, remove one stem constraint, exclusion or rule group at a time, write
# tests/classes.json again and run language-conformance-test on the copy. A
# mutant that every test passes needs a row that fails without the
# constraint. Not run by any test. The last mutations edit language.json (the
# processors and the word characters).
#
#   python3 languages/el/sources/mutate.py <build dir> <scratch dir>
#
# Each mutation edits transforms.json by a predicate on (transform id, rule)
# and prints KILLED or SURVIVED with the conformance test's failures.

import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PACK = os.path.join(ROOT, 'languages', 'el')


# language.json edits: (name, function of the parsed descriptor).
LANGUAGE_MUTATIONS = [
    ('polytonicToMonotonic without its first variant (καλὸς → nothing)', lambda l: [p.update(variants=p['variants'][1:]) for p in l['lookup']['preprocessors'] if p['id'] == 'polytonicToMonotonic']),
    ('polytonicToMonotonic without its second variant', lambda l: [p.update(variants=p['variants'][:1]) for p in l['lookup']['preprocessors'] if p['id'] == 'polytonicToMonotonic']),
    ('normalizeApostrophes removed (σ’αγαπώ)', lambda l: l['lookup'].update(preprocessors=[p for p in l['lookup']['preprocessors'] if p['id'] != 'normalizeApostrophes'])),
    ('the apostrophe not a word character', lambda l: l['classes'].update(word='[{letter}\\u0300-\\u036F0-9]')),
    ]


def mutations():
    def drop_key(key, value=None, transforms=None):
        def edit(tid, rule):
            if transforms is not None and tid not in transforms:
                return rule
            if key in rule and (value is None or rule[key] == value):
                rule = dict(rule)
                del rule[key]
            return rule
        return edit

    def set_key(key, old, new, transforms=None):
        def edit(tid, rule):
            if (transforms is None or tid in transforms) and rule.get(key) == old:
                rule = dict(rule)
                rule[key] = new
            return rule
        return edit

    def drop_rule(pred):
        def edit(tid, rule):
            return None if pred(tid, rule) else rule
        return edit

    def suffixes_of(rule):
        if rule.get('type') == 'circumfix':
            return [s for s, _ in rule.get('suffixes', [])]
        return [rule.get('inflected')]

    verbs = {'aorist-1sg', 'aorist-2sg', 'aorist-3sg', 'aorist-3pl', 'imperfect-1sg', 'imperfect-2sg', 'imperfect-3sg', 'imperfect-3pl'}
    nominal = {'gen-sg', 'acc-sg', 'voc-sg', 'obl-sg', 'nom-pl', 'acc-pl', 'gen-pl', 'plural', 'feminine', 'feminine-gen-sg', 'feminine-pl', 'neuter-pl'}
    return [
        ('identity (control)', lambda tid, rule: rule),
        ('stemContains {accented} removed from nominal rules (για → γιος)', drop_key('stemContains', '{accented}', nominal)),
        ('stemContains {vowel} removed from verb rules (ήταν → τω)', drop_key('stemContains', '{vowel}', verbs)),
        ('stemEndsWith [αεηιουω] removed from unaugmented aorists (μέσα → μέσω)', drop_key('stemEndsWith', '[αεηιουω]')),
        ('stemEndsWith {consonant} removed from conjugation II (ποιά → ποιώ)', drop_key('stemEndsWith', '{consonant}', {'present-2sg', 'present-3sg', 'present-1pl', 'present-2pl', 'present-3pl'})),
        ('stemNotStartsWithText μέρ removed (μέρες → μέρος, μέρη)', drop_key('stemNotStartsWithText', 'μέρ')),
        ('stemNotStartsWithText αυτ removed (αυτιά → αυτός)', drop_key('stemNotStartsWithText', 'αυτ')),
        ('stemMinLength 2 → 1 on aorist and dependent rules (έξω → έχω)', set_key('stemMinLength', 2, 1, verbs | {'dependent-1sg', 'perfective-imperative-2sg'})),
        ('stemMinLength 4 → 2 on the unaugmented stressed imperfect', set_key('stemMinLength', 4, 2)),
        ('stemMinLength 3 → 2 on the -α imperative (ένα → ενώ)', set_key('stemMinLength', 3, 2, {'imperative-2sg'})),
        ('stemCharacters {greek} → {greekAll} everywhere (Ελληνικά → Ελληνικό)', set_key('stemCharacters', '{greek}', '{greekAll}')),
        ('stemCharacters {greekAll} → {greek} everywhere (Γιάννη, Καναδέζοι)', set_key('stemCharacters', '{greekAll}', '{greek}')),
        ('stemCharacters {unaccented} removed (accent rules on accented stems)', drop_key('stemCharacters', '{unaccented}')),
        ('stemCharacters on prefix rules removed (ξαναπώ το)', lambda tid, rule: drop_key('stemCharacters')(tid, rule) if rule.get('type') == 'prefix' else rule),
        ('written-out elisions removed (κ\' → κα)', drop_rule(lambda tid, rule: tid == 'elision' and rule.get('type') == 'wholeWord')),
        ('\'ς and \'σαν removed', drop_rule(lambda tid, rule: tid == 'aphaeresis' and rule.get('type') == 'wholeWord')),
        ('accent step: the marked ante rules take any stem (κυρία → κύρια)', lambda tid, rule: ({**rule, 'suffixes': [[b, b] for _, b in rule['suffixes']]} if tid == 'accent' and any(a != b for a, b in rule.get('suffixes', [])) else rule)),
        ('accent step removed', drop_rule(lambda tid, rule: tid == 'accent')),
        ('internal augment removed', drop_rule(lambda tid, rule: tid == 'internal-augment')),
        ('elided-proclitic removed', drop_rule(lambda tid, rule: tid == 'elided-proclitic')),
        ('diminutives removed', drop_rule(lambda tid, rule: tid == 'diminutive')),
        ('comparative removed', drop_rule(lambda tid, rule: tid == 'comparative')),
        ('Yomitan ξανα- rules removed', drop_rule(lambda tid, rule: tid == 'ξανα-' and rule.get('source') == 'yomitan')),
        ('own ξανα- rules removed', drop_rule(lambda tid, rule: tid == 'ξανα-' and rule.get('source') != 'yomitan')),
        ('the -μένος participle rules removed', drop_rule(lambda tid, rule: tid == 'passive-participle')),
        ('the bare augments removed (ΕΓΡΑΨΑ)', drop_rule(lambda tid, rule: rule.get('prefixes') in ([['ε', ''], ['η', '']],))),
        ('pronoun and article forms written out removed (αυτό → τα, οι → η first)', drop_rule(lambda tid, rule: rule.get('type') == 'wholeWord' and rule.get('deinflected') in ('αυτός', 'ο'))),
        ('short pronouns removed (μένα → τα first)', drop_rule(lambda tid, rule: tid == 'short-pronoun')),
        ('elision after a vowel allowed (καλά\' → καλάι)', drop_key('stemEndsWith', '{consonant}', {'elision'})),
        ('closing quote removed (καλά\')', drop_rule(lambda tid, rule: tid == 'closing-quote')),
        ('elision stems take capitals (μ\' → Μάι)', set_key('stemCharacters', '{greek}', '{greekAll}', {'elision'})),
        ('elision minimum 2 → 1 (κ\' → κα)', set_key('stemMinLength', 2, 1, {'elision'})),
        ('movable-n without stemContains (ντεν → ντε)', drop_key('stemContains', None, {'movable-n'})),
        ('v_acc accent rules: any letters between (κορώνα → κορώνω)', lambda tid, rule: ({**rule, 'stemChange': {**rule['stemChange'], 'between': '{greekAll}'}}
                                                                           if tid == 'accent' and rule.get('conditionsIn') == ['v_acc'] and rule.get('stemChange', {}).get('between') == '{consonant}' else rule)),
        ('n_ante/adj_ante minimum 2 → 1 (μαιών → Μάιος)', lambda tid, rule: ({**rule, 'stemChange': {**rule['stemChange'], 'betweenMinLength': 1}}
                                                                  if tid == 'accent' and rule.get('conditionsIn', [''])[0].endswith('_ante') and rule.get('stemChange', {}).get('betweenMinLength') == 2 and rule.get('stemCharacters') == '{unaccentedAll}' else rule)),
        ('gen-pl without stemContains (στων → στο)', drop_key('stemContains', None, {'gen-pl'})),
        ('stemNotStartsWithText αυτ removed from the colour adjectives (αυτιά → αυτής)', drop_key('stemNotStartsWithText', 'αυτ', {'acc-sg', 'feminine', 'feminine-gen-sg', 'feminine-pl', 'nom-pl', 'gen-sg', 'gen-pl', 'acc-pl'})),
    ]



def run(build, scratch):
    conformance = os.path.join(build, 'language-conformance-test')
    node = shutil.which('node')
    results = []
    plan = [(name, edit, None) for name, edit in mutations()] + [(name, lambda tid, rule: rule, edit) for name, edit in LANGUAGE_MUTATIONS]
    for name, edit, edit_language in plan:
        work = os.path.join(scratch, 'languages')
        shutil.rmtree(work, ignore_errors=True)
        shutil.copytree(PACK, os.path.join(work, 'el'))
        path = os.path.join(work, 'el', 'transforms.json')
        data = json.load(open(path, encoding='utf-8'))
        changed = 0
        for t in data['transforms']:
            out = []
            for rule in t['rules']:
                new = edit(t['id'], rule)
                if new != rule:
                    changed += 1
                if new is not None:
                    out.append(new)
            t['rules'] = out
        json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        if edit_language is not None:
            lpath = os.path.join(work, 'el', 'language.json')
            language = json.load(open(lpath, encoding='utf-8'))
            edit_language(language)
            json.dump(language, open(lpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        subprocess.run([node, os.path.join(ROOT, 'tools', 'check-classes.mjs'), 'el', '--write', '--languages', work], capture_output=True, text=True)
        proc = subprocess.run([conformance, os.path.join(work, 'el'), scratch], capture_output=True, text=True)
        fails = [l for l in (proc.stdout + proc.stderr).splitlines() if l.startswith('FAIL')]
        verdict = 'KILLED' if fails or proc.returncode != 0 else 'SURVIVED'
        if name.startswith('identity'):
            verdict = 'PASS (control)' if verdict == 'SURVIVED' else 'CONTROL FAILED'
        results.append((verdict, name, changed, fails[:3]))
        print(f'{verdict}\t{changed} rules\t{name}\t' + ' | '.join(fails[:2]), flush=True)
    return results


if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
