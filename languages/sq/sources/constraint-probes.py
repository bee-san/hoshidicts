#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Constructed negatives for the stem constraints that no text exercises
(docs/languages.md section 14 step 7). Run from the repository root:

  python3 languages/sq/sources/constraint-probes.py

For every transform and stem constraint whose removal leaves tests/ passing
(the mutation check of sources/mutations.py, run here through the CLI), a
probe text is built from one of the transform's rules: a stem that breaks the
constraint (a space for stemCharacters, a stem one letter short for
stemMinLength, a last letter outside the class for stemEndsWith, the excluded
text for stemNotStartsWithText) followed by the rule's ending. The row `probe ↛ stem + replacement` is printed when the
pack's rules do not give that text and the rules without the constraint do.
"""
import copy
import json
import os
import subprocess
import tempfile

ROOT = os.getcwd()
PACK = os.path.join(ROOT, 'languages', 'sq')
CLI = os.path.join(ROOT, 'build', 'hoshidicts-cli')
CONSTRAINTS = ['stemCharacters', 'stemMinLength', 'stemEndsWith', 'stemNotEndsWith', 'stemNotStartsWithText']
CLASSES = {'{consonant}': set('bcçdfghjklmnpqrstvxz'), '{verbConsonant}': set('bcçdfghklmnpqrstvxz'), '{vowel}': set('aeiouyë')}


def members(cls):
    if cls in CLASSES:
        return CLASSES[cls]
    if cls.startswith('[') and cls.endswith(']') and not cls.startswith('[^'):
        return set(cls[1:-1])
    return None


def deinflect(texts, transforms):
    out = subprocess.run([CLI, '--languages', os.path.join(ROOT, 'languages'), 'deinflect', 'sq', '--stdin', '--all-options',
                          '--transforms', transforms], input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    return {d['input']: {r['text'] for r in d['results']} for d in map(json.loads, out.splitlines())}


def probes(rule, key):
    """(text, wrong output) pairs where the constraint stops the rule."""
    infl, deinfl = rule.get('inflected', ''), rule.get('deinflected', '')
    if rule['type'] != 'suffix':
        return []
    base = ['dot', 'mar', 'kel', 'punt', 'lir']
    out = []
    if key == 'stemCharacters':
        out = [(f'e {b}{infl}', f'e {b}{deinfl}') for b in base]
    elif key == 'stemMinLength':
        n = rule['stemMinLength']
        if n >= 1:
            # n - 1 letters, the last one in the rule's stemEndsWith class.
            letters = sorted(members(rule.get('stemEndsWith', '')) or set('t'))
            for last in letters:
                stem = ('do' * n)[:n - 2] + last if n >= 2 else ''
                out.append((stem + infl, stem + deinfl))
    elif key == 'stemEndsWith':
        allowed = members(rule['stemEndsWith'])
        if allowed is not None:
            for last in 'aeiouyëtrmnshkj':
                if last not in allowed:
                    out += [(b[:-1] + last + infl, b[:-1] + last + deinfl) for b in base]
    elif key == 'stemNotEndsWith':
        banned = members(rule['stemNotEndsWith']) or set()
        for last in sorted(banned):
            out += [(b + last + infl, b + last + deinfl) for b in base]
    elif key == 'stemNotStartsWithText':
        head = rule['stemNotStartsWithText']
        out = [(head + infl, head + deinfl)]
    return [(t, w) for t, w in out if t and w and t != w]


def main():
    base_file = os.path.join(PACK, 'transforms.json')
    base = json.load(open(base_file, encoding='utf-8'))
    rows = []
    for ti, t in enumerate(base['transforms']):
        for key in [k for k in CONSTRAINTS if any(k in r for r in t['rules'])]:
            candidates = []
            for r in t['rules']:
                if key in r:
                    candidates += probes(r, key)
            if not candidates:
                continue
            data = copy.deepcopy(base)
            for r in data['transforms'][ti]['rules']:
                r.pop(key, None)
                if r['type'] == 'suffix' and r.get('inflected') == '' and not any(c in r for c in CONSTRAINTS):
                    r['stemMinLength'] = 0
            with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
                mutated = f.name
            texts = sorted({c[0] for c in candidates})
            ours = deinflect(texts, base_file)
            theirs = deinflect(texts, mutated)
            os.unlink(mutated)
            for text, wrong in candidates:
                if wrong not in ours.get(text, set()) and wrong in theirs.get(text, set()):
                    rows.append((t['id'], key, text, wrong))
                    break
    for tid, key, text, wrong in rows:
        print(f'negatives (constructed: {tid} {key})\t0\t{text}\t{wrong}\t*\t*')


if __name__ == '__main__':
    main()
