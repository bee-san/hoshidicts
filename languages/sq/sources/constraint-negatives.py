#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Negatives for the stem constraints (docs/languages.md section 14 step 7).
Run from the repository root with a built hoshidicts-cli:

  python3 languages/sq/sources/constraint-negatives.py <wty-sq-en.zip> <sq_50k.txt> <sqi_sentences.tsv.bz2> <text>...

For every transform and every stem constraint its rules carry, the rules
without that constraint deinflect the words of the frequency list and the
one-, two- and three-word texts of the sentences and texts. A text is an
example when the mutated rules give it a headword of the dictionary, with a
compatible part of speech, that the pack's rules do not give and that none of
the text's form-of rows names. Prints, for each constraint, the most frequent
example as a defaults.tsv negative row, and the constraints without one.
"""
import bz2
import collections
import copy
import json
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
from measure import load_dictionary, conditions_of, passes  # noqa: E402

ROOT = os.getcwd()
PACK = os.path.join(ROOT, 'languages', 'sq')
CLI = os.path.join(ROOT, 'build', 'hoshidicts-cli')
CONSTRAINTS = ['stemCharacters', 'stemMinLength', 'stemEndsWith', 'stemNotEndsWith', 'stemStartsWith',
               'stemNotStartsWith', 'stemContains', 'stemStartsWithText', 'stemNotStartsWithText']
WORD = re.compile(r"[a-zçë']+")


def texts_of(freq, sentences, paths):
    count = collections.Counter()
    for line in open(freq, encoding='utf-8'):
        w, c = line.rsplit(' ', 1)
        if WORD.fullmatch(w):
            count[w] += int(c)
    def add_sentence(s):
        words = WORD.findall(s.lower().replace('’', "'"))
        for n in (2, 3):
            for i in range(len(words) - n + 1):
                count[' '.join(words[i:i + n])] += 1
    for line in bz2.open(sentences, 'rt', encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) >= 3:
            add_sentence(parts[2])
    for p in paths:
        for line in open(p, encoding='utf-8'):
            for s in re.split(r'[.!?…;:,()"„“”«»]', line):
                add_sentence(s)
    return count


def deinflect(texts, transforms):
    out = subprocess.run([CLI, '--languages', os.path.join(ROOT, 'languages'), 'deinflect', 'sq', '--stdin', '--all-options',
                          '--transforms', transforms], input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    return {d['input']: {(r['text'], tuple(r['conditions'])) for r in d['results']} for d in map(json.loads, out.splitlines())}


def main(dictionary, freq, sentences, *paths):
    lemmas, forms = load_dictionary(dictionary)
    leaves, dict_forms = conditions_of(os.path.join(PACK, 'transforms.json'))
    count = texts_of(freq, sentences, paths)
    texts = sorted(count, key=lambda t: -count[t])
    base_file = os.path.join(PACK, 'transforms.json')
    base = json.load(open(base_file, encoding='utf-8'))
    base_out = deinflect(texts, base_file)
    pos_of = {'v': 'v', 'n': 'n', 'np': 'n', 'ns': 'n', 'adj': 'adj', 'adv': 'adv'}
    found, missing = [], []
    for ti, t in enumerate(base['transforms']):
        for k in [k for k in CONSTRAINTS if any(k in r for r in t['rules'])]:
            data = copy.deepcopy(base)
            for r in data['transforms'][ti]['rules']:
                r.pop(k, None)
                if r['type'] == 'suffix' and r.get('inflected') == '' and not any(c in r for c in CONSTRAINTS):
                    r['stemMinLength'] = 0
            with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
                name = f.name
            out = deinflect(texts, name)
            os.unlink(name)
            best = None
            for text in texts:
                named = {l for l, _ in forms.get(text, [])}
                base_texts = {x for x, _ in base_out.get(text, set())}
                for lemma, conds in out.get(text, set()) - base_out.get(text, set()):
                    if lemma == text or lemma in named or lemma in base_texts or lemma not in lemmas:
                        continue
                    if not conds or not passes(list(conds), lemmas[lemma], leaves, dict_forms):
                        continue
                    tags = [c for c in lemmas[lemma] if c in pos_of]
                    if tags:
                        best = (text, lemma, pos_of[tags[0]])
                        break
                if best:
                    break
            if best:
                found.append((t['id'], k, *best))
            else:
                missing.append(f'{t["id"]}: {k}')
    for tid, k, text, lemma, pos in found:
        print(f'constraint {tid} {k}\t0\t{text}\t{lemma}\t{pos}\t*')
    print(f'# {len(found)} constraints have a negative; {len(missing)} have no example in the texts:', file=sys.stderr)
    for m in missing:
        print('#   ' + m, file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    main(*sys.argv[1:])
