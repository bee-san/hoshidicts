#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Precision of the word-formation rules on the dictionary's own words, judged
by Wiktionary's etymologies. Not run by any test (README.md, Measurements).

    python3 measure-derivation.py <hoshidicts-cli> <languages dir> <wty-eo-en json dir> \
        <kaikki.org-dictionary-Esperanto.jsonl> [--transforms <file>] [--examples N]

For every single-word headword of the dictionary that has a definition and a
part of speech (n, v, adj, adv), the word is deinflected as written. A
reading counts when its trace is exactly one word-formation transform, its
text is a headword with a definition, and the headword's part of speech
passes the reading's condition (what a lookup shows). Each such reading is
judged by the word's English Wiktionary etymology (kaikki.org's extraction):

- right: an etymology template of the word names the affix (-et-, -eto, et,
  mal-, ...), or a word with the affix at the same place (abortigo: from
  abortigi + -o, so its -ig- is right; malagrablaĵo: from malagrabla + -aĵo,
  so its mal- is right);
- wrong: the word has an etymology template, and none names the affix;
- unknown: the word has no etymology template.

Prints one line per transform (readings, right, wrong, unknown, precision
over the judged ones) and some wrong examples.
"""
import collections
import glob
import json
import re
import subprocess
import sys

args = sys.argv[1:]
cli, languages, json_dir, kaikki = args[:4]
transforms_file = None
examples = 8
rest = args[4:]
while rest:
    if rest[0] == '--transforms':
        transforms_file, rest = rest[1], rest[2:]
    elif rest[0] == '--examples':
        examples, rest = int(rest[1]), rest[2:]
    else:
        sys.exit(f'unknown argument {rest[0]}')

pack_transforms = json.load(open(transforms_file or f'{languages}/eo/transforms.json', encoding='utf-8'))
INFLECTION = {'accusative', 'plural', 'present', 'past', 'future', 'conditional', 'volitive', 'elision'}
INFLECTION |= {f'{m}{e}' for m in ('ant', 'int', 'ont', 'at', 'it', 'ot') for e in 'aoe'}
FORMATION = {t['id']: t for t in pack_transforms['transforms'] if t['id'] not in INFLECTION}
# The affix a transform removes, as an etymology names it: the suffix id
# (et, eg, ...) or the prefix id (mal, ek, ...).
PREFIX_IDS = {t['id'] for t in FORMATION.values() if any(r['type'] == 'circumfix' for r in t['rules'])}

pos_of = collections.defaultdict(set)
for f in sorted(glob.glob(f'{json_dir}/term_bank_*.json')):
    for row in json.load(open(f, encoding='utf-8')):
        expression, rules, glossary = row[0], row[3], row[5]
        if all(isinstance(g, list) for g in glossary):
            continue  # a form-of row: never a term
        pos_of[expression] |= set(rules.split()) or {''}

affixes_of = {}
for line in open(kaikki, encoding='utf-8'):
    entry = json.loads(line)
    if entry.get('lang_code') != 'eo':
        continue
    found = affixes_of.setdefault(entry['word'], set())
    for template in entry.get('etymology_templates', []):
        for key, value in template.get('args', {}).items():
            if key.isdigit() and int(key) >= 2:
                value = re.sub(r'<.*', '', value).strip()
                found.add(value)

def names_affix(word, base, affix, prefix):
    """True when an etymology template of `word` names the affix, or names a
    word that has the affix at the same place (abortigo: abortigi + -o, so
    the -ig- of abortigo is right); None without a template."""
    values = affixes_of.get(word)
    if not values:
        return None
    if prefix:
        rest = word[len(affix):]
        for value in values:
            bare = value.strip('-').lower()
            if bare == affix:
                return True
            if bare.startswith(affix) and len(bare) > len(affix) + 1 and rest.startswith(bare[len(affix):len(affix) + 2]):
                return True
        return False
    stem = word[:word.rfind(affix, 0, len(word) - 1)]
    for value in values:
        bare = value.strip('-').lower()
        if bare == affix or (len(bare) == len(affix) + 1 and bare.startswith(affix) and bare[-1] in 'oaie'):
            return True
        if len(stem) >= 2 and bare.startswith(stem + affix) and len(bare) > len(stem + affix):
            return True
    return False

CONDITION_POS = {'n': 'n', 'v': 'v', 'adj': 'adj', 'adv': 'adv'}
words = sorted(w for w, pos in pos_of.items() if ' ' not in w and pos & {'n', 'v', 'adj', 'adv'} and w.islower())
command = [cli, '--languages', languages, 'deinflect', 'eo', '--stdin']
if transforms_file:
    command += ['--transforms', transforms_file]
out = subprocess.run(command, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
counts = collections.defaultdict(collections.Counter)
wrong = collections.defaultdict(list)
for line in out.splitlines():
    result = json.loads(line)
    word = result['input']
    seen = set()
    for r in result['results']:
        if len(r['trace']) != 1 or r['trace'][0] not in FORMATION:
            continue
        text, tid = r['text'], r['trace'][0]
        pos = pos_of.get(text)
        if not pos or text == word or (tid, text) in seen:
            continue
        if r['conditions'] and not any(CONDITION_POS[c] in pos for c in r['conditions']):
            continue
        seen.add((tid, text))
        verdict = names_affix(word, text, tid, tid in PREFIX_IDS)
        key = 'unknown' if verdict is None else ('right' if verdict else 'wrong')
        counts[tid][key] += 1
        if key == 'wrong':
            wrong[tid].append(f'{word} → {text}')

print('transform\treadings\tright\twrong\tunknown\tprecision')
for tid in FORMATION:
    c = counts[tid]
    judged = c['right'] + c['wrong']
    precision = f"{c['right'] / judged:.1%}" if judged else '-'
    print(f"{tid}\t{sum(c.values())}\t{c['right']}\t{c['wrong']}\t{c['unknown']}\t{precision}\t{'; '.join(wrong[tid][:examples])}")
