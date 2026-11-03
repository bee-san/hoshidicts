#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements for the Albanian pack (README, Measurements). Run from the
repository root with a built hoshidicts-cli:

  python3 languages/sq/sources/measure.py yomitan <wty-sq-en.zip> <sq_50k.txt> <unimorph sqi>
      Applies Yomitan's rules (sources/yomitan.json, each rule alone) to the
      word list and lists the readings the final rules (transforms.json) lack:
      a deinflected text with a row that has definitions and passes the
      part-of-speech filter, which no final deinflection of the word gives.

The dictionary is wty-sq-en as published (term banks read from the zip). The
word list is the 50,000 words of the frequency list, the single-word forms of
UniMorph sqi and the single-word form-of rows of the dictionary.
"""
import collections
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.getcwd()
CLI = os.environ.get('HOSHIDICTS_CLI', os.path.join(ROOT, 'build', 'hoshidicts-cli'))
PACK = os.path.join(ROOT, 'languages', 'sq')
WORD = re.compile(r"^[a-zçë]+$")


def is_ref(d):
    return isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0] != '' and isinstance(d[1], list)


def load_dictionary(path):
    """headword -> set of POS tags of its rows with definitions; form -> [(lemma, tags)] of its form-of rows."""
    lemmas = collections.defaultdict(set)
    forms = collections.defaultdict(list)
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.startswith('term_bank_'):
                continue
            for row in json.loads(z.read(name)):
                tags = set(row[3].split())
                refs = [d for d in row[5] if is_ref(d)]
                if refs:
                    for d in refs:
                        forms[row[0]].append((d[0], tags))
                else:
                    lemmas[row[0]] |= tags or {''}
    return lemmas, forms


def conditions_of(transforms_file):
    """condition name -> set of leaf names it stands for."""
    data = json.load(open(transforms_file, encoding='utf-8'))
    conds = data['conditions']
    def leaves(name):
        sub = conds[name].get('subConditions')
        return {name} if not sub else set().union(*(leaves(s) for s in sub))
    return {name: leaves(name) for name in conds}, {n for n, c in conds.items() if c.get('isDictionaryForm')}


def passes(conditions, tags, leaves, dictionary_forms):
    """The part-of-speech filter (docs/languages.md 7.2, 9.4)."""
    if not conditions:
        return True
    have = set().union(*(leaves[c] for c in conditions))
    want = set()
    for t in tags:
        if t in dictionary_forms:
            want |= leaves[t]
    return bool(have & want)


def deinflect(words, transforms=None):
    cmd = [CLI, '--languages', os.path.join(ROOT, 'languages'), 'deinflect', 'sq', '--stdin', '--all-options']
    if transforms:
        cmd += ['--transforms', transforms]
    out = subprocess.run(cmd, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    return {d['input']: d['results'] for d in map(json.loads, out.splitlines())}


def word_list(freq, unimorph, forms):
    words = set()
    for line in open(freq, encoding='utf-8'):
        w = line.split(' ')[0].strip().lower()
        if WORD.match(w):
            words.add(w)
    for line in open(unimorph, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) == 3 and WORD.match(parts[1]):
            words.add(parts[1])
    words |= {f for f in forms if WORD.match(f)}
    return sorted(words)


def cmd_yomitan(dictionary, freq, unimorph):
    lemmas, forms = load_dictionary(dictionary)
    words = word_list(freq, unimorph, forms)
    yomitan_file = os.path.join(PACK, 'sources', 'yomitan.json')
    final_file = os.path.join(PACK, 'transforms.json')
    leaves_y, dict_y = conditions_of(yomitan_file)
    leaves_f, dict_f = conditions_of(final_file)
    # Each Yomitan rule as a transform of its own, so a trace names the rule.
    data = json.load(open(yomitan_file, encoding='utf-8'))
    split = {'schema': 1, 'conditions': data['conditions'], 'transforms': []}
    label = {}
    for t in data['transforms']:
        for i, rule in enumerate(t['rules']):
            rid = f"{t['id']}#{i}"
            label[rid] = f"{t['id']} [{i}] {rule.get('inflected')} → {rule.get('deinflected')}"
            split['transforms'].append({'id': rid, 'name': rid, 'description': '', 'source': 'yomitan', 'rules': [rule]})
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(split, f, ensure_ascii=False)
        split_file = f.name
    ours = deinflect(words)
    theirs = deinflect(words, split_file)
    os.unlink(split_file)
    stats = collections.defaultdict(lambda: {'readings': 0, 'lost': [], 'false': 0})
    for w in words:
        final = ours.get(w, [])
        for r in theirs.get(w, []):
            if not r['trace'] or r['text'] == w or r['text'] not in lemmas:
                continue
            if not passes(r['conditions'], lemmas[r['text']], leaves_y, dict_y):
                continue
            kept = any(o['text'] == r['text'] and passes(o['conditions'], lemmas[o['text']], leaves_f, dict_f) for o in final)
            # Attribute the reading to every rule of its trace.
            for rid in set(r['trace']):
                s = stats[rid]
                s['readings'] += 1
                if not kept:
                    s['lost'].append(f"{w} → {r['text']}")
    print(f'{len(words)} words; {len(stats)} of {len(label)} Yomitan rules give a reading')
    total_lost = set()
    for rid in label:
        s = stats.get(rid)
        if s is None:
            continue
        lost = sorted(set(s['lost']))
        total_lost |= set(lost)
        print(f"{label[rid]}: {s['readings']} readings, {len(lost)} the final rules lack" + (f": {', '.join(lost[:25])}" if lost else ''))
    print(f'readings the final rules lack: {len(total_lost)}')


def main(argv):
    if len(argv) >= 1 and argv[0] == 'yomitan' and len(argv) == 4:
        cmd_yomitan(*argv[1:])
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
