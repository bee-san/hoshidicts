#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Checks that the exact-stem exclusions of sources/excluded-stems.mjs leave
# out the listed stems and nothing else (README.md, Rule provenance). Not run
# by any test. Run from the repository root, with node on PATH and
# build/hoshidicts-cli built:
#
#   python3 languages/eo/sources/check-exclusions.py <scratch dir> [--transforms <file>]
#
# --transforms checks another rule file in place of the pack's transforms.json.
# In a scratch copy, build-own.mjs and build-final.mjs write the rules
# without exclusions (EXCLUDED_STEMS emptied). For every rule an exclusion
# applies to, words are made from many stems: every prefix of each excluded
# stem, that prefix extended by one character of a wide set (the Esperanto
# alphabet, q w x y, letters outside it, capitals, an apostrophe, a hyphen, a
# digit and a space) and by two letters. Both rule sets deinflect the words
# (hoshidicts-cli, every option on). A stem the rules without exclusions take
# in one step of the transform must give the same text and conditions with
# the committed rules, unless it is an excluded stem, which must give
# nothing; the committed rules must take no stem the others do not. Prints
# the counts and every difference, and exits 1 if there is one.
import itertools
import json
import os
import re
import shutil
import subprocess
import sys

repo = os.getcwd()
scratch = os.path.abspath(sys.argv[1])
pack = os.path.join(repo, 'languages', 'eo')
cli = os.path.join(repo, 'build', 'hoshidicts-cli')
node = shutil.which('node') or sys.exit('node is not on PATH')

# The rules without exclusions, built in a scratch copy of the pack and tools/.
root = os.path.join(scratch, 'check-exclusions')
shutil.rmtree(root, ignore_errors=True)
shutil.copytree(pack, os.path.join(root, 'languages', 'eo'))
shutil.copytree(os.path.join(repo, 'tools'), os.path.join(root, 'tools'),
                ignore=shutil.ignore_patterns('node_modules'))
module = os.path.join(root, 'languages', 'eo', 'sources', 'excluded-stems.mjs')
text = open(module, encoding='utf-8').read()
start = text.index('export const EXCLUDED_STEMS = {')
end = text.index('\n};', start)
open(module, 'w', encoding='utf-8').write(text[:start] + 'export const EXCLUDED_STEMS = {' + text[end + 1:])
sources = os.path.join(root, 'languages', 'eo', 'sources')
unsplit_file = os.path.join(root, 'unsplit.json')
subprocess.run([node, os.path.join(sources, 'build-own.mjs')], check=True, capture_output=True, cwd=root)
subprocess.run([node, os.path.join(sources, 'build-final.mjs'), '--out', unsplit_file], check=True,
               capture_output=True, cwd=root)
unsplit = json.load(open(unsplit_file, encoding='utf-8'))
final_file = os.path.join(pack, 'transforms.json')
if '--transforms' in sys.argv:
    final_file = os.path.abspath(sys.argv[sys.argv.index('--transforms') + 1])

script = (f"import {{EXCLUDED_STEMS}} from '{os.path.join(pack, 'sources', 'excluded-stems.mjs')}';"
          "console.log(JSON.stringify(EXCLUDED_STEMS));")
excluded = json.loads(subprocess.run([node, '--input-type=module', '-e', script], check=True,
                                     capture_output=True, text=True).stdout)


def key(transform_id, rule):
    return 'accusativeEn' if transform_id == 'accusative' and rule.get('inflected') == 'en' else transform_id


ALPHABET = list('abcĉdefgĝhĥijĵklmnoprsŝtuŭvz')
ONE = ALPHABET + list('qwxy') + list('éüàñøçőș') + list('BĈŜÉ') + ["'", '-', '1', ' ']
TWO = list('aeioubcrstĉŭ') + ['é', "'"]


def make(rule, stem):
    kind = rule['type']
    if kind == 'suffix':
        return stem + rule['inflected'], stem + rule['deinflected']
    if kind == 'prefix':
        return rule['inflected'] + stem, rule['deinflected'] + stem
    if kind == 'circumfix':
        return (rule['inflectedPrefix'] + stem + rule['inflectedSuffix'],
                rule['deinflectedPrefix'] + stem + rule['deinflectedSuffix'])
    sys.exit(f'rule type {kind} has no stem')


def deinflect(transforms, words):
    out = subprocess.run([cli, '--languages', os.path.join(repo, 'languages'), 'deinflect', 'eo', '--stdin',
                          '--all-options', '--transforms', transforms], input='\n'.join(words) + '\n',
                         check=True, capture_output=True, text=True).stdout
    return {json.loads(line)['input']: json.loads(line)['results'] for line in out.splitlines()}


counts = {'taken by both': 0, 'taken by neither': 0, 'excluded, left out': 0}
problems = []
for transform in unsplit['transforms']:
    for rule in transform['rules']:
        k = key(transform['id'], rule)
        if k not in excluded:
            continue
        stems_left_out = {stem for stem, _ in excluded[k]}
        stems = set()
        for stem in stems_left_out:
            for i in range(1, len(stem) + 1):
                prefix = stem[:i]
                stems.add(prefix)
                stems.update(prefix + c for c in ONE)
                stems.update(prefix + a + b for a, b in itertools.product(TWO, TWO))
        words = {}
        for stem in sorted(stems):
            word, out = make(rule, stem)
            if word not in words:
                words[word] = (stem, out)
        before = deinflect(unsplit_file, list(words))
        after = deinflect(final_file, list(words))
        conditions = sorted(rule['conditionsOut'])

        def taken(results, out):
            return any(r['text'] == out and r['trace'] == [transform['id']] and sorted(r['conditions']) == conditions
                       for r in results)

        for word, (stem, out) in words.items():
            b, a = taken(before[word], out), taken(after[word], out)
            if stem in stems_left_out:
                if a:
                    problems.append(f'{transform["id"]}: excluded stem {stem!r} still taken ({word} -> {out})')
                elif b:
                    counts['excluded, left out'] += 1
            elif b and not a:
                problems.append(f'{transform["id"]}: stem {stem!r} lost ({word} -> {out})')
            elif a and not b:
                problems.append(f'{transform["id"]}: stem {stem!r} gained ({word} -> {out})')
            elif a:
                counts['taken by both'] += 1
            else:
                counts['taken by neither'] += 1

shutil.rmtree(root)
print(', '.join(f'{name} {n}' for name, n in counts.items()) + f'; {len(problems)} differences')
for problem in problems:
    print('  ' + problem)
sys.exit(1 if problems else 0)
