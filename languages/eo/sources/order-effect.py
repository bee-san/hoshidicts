#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# What a change of transform order does to real lookups (README.md,
# Measurements 6). Not run by any test. Run from the repository root:
#
#   python3 languages/eo/sources/order-effect.py <hover dir> <imported dict> <scratch dir>
#       [--options <ids>] [--moves <a>:<b>,...]
#
# Rules that match at one index node apply in file order (docs/languages.md
# 7.4), so the order of the transforms can decide which of two results that
# tie on every ranking key comes first. For every pair of adjacent
# transforms of transforms.json swapped, and for every move <a>:<b> (a put
# right after b), the words of the hover directory (make-hovers.py) are
# deinflected with hoshidicts-cli, every option on, and the ordered results
# (text, conditions, trace) compared with those of the committed order. The
# hovers at words whose results change order are then looked up with the
# batch tool (sources/lookup-batch.cpp), with the defaults or --options, and
# their first results compared. Prints, per change: the words whose results
# change order, the hovers whose first result changes, and examples.
import collections
import json
import os
import shutil
import subprocess
import sys

args = sys.argv[1:]


def option(name):
    if name in args:
        i = args.index(name)
        value = args[i + 1]
        del args[i:i + 2]
        return value
    return None


options = option('--options')
moves = option('--moves')
hover_dir, imported, scratch = args
repo = os.getcwd()
pack = os.path.join(repo, 'languages', 'eo')
cli = os.path.join(repo, 'build', 'hoshidicts-cli')
tool = os.path.join(repo, 'build', 'eo-lookup-batch')
base = json.load(open(os.path.join(pack, 'transforms.json'), encoding='utf-8'))
ids = [t['id'] for t in base['transforms']]

hovers = open(os.path.join(hover_dir, 'hover.txt'), encoding='utf-8').read().split('\n')[:-1]
words = open(os.path.join(hover_dir, 'words.txt'), encoding='utf-8').read().split('\n')[:-1]
unique = sorted(set(words))
at = collections.defaultdict(list)
for i, word in enumerate(words):
    at[word].append(i)

root = os.path.join(scratch, 'order-effect')
shutil.rmtree(root, ignore_errors=True)
os.makedirs(os.path.join(root, 'eo'))
shutil.copy(os.path.join(pack, 'language.json'), os.path.join(root, 'eo', 'language.json'))
transforms_file = os.path.join(root, 'eo', 'transforms.json')


def deinflect(transforms):
    json.dump(transforms, open(transforms_file, 'w', encoding='utf-8'), ensure_ascii=False)
    out = subprocess.run([cli, '--languages', os.path.join(repo, 'languages'), 'deinflect', 'eo', '--stdin',
                          '--all-options', '--transforms', transforms_file], input='\n'.join(unique) + '\n',
                         capture_output=True, text=True, check=True).stdout
    return [[(r['text'], tuple(r['conditions']), tuple(r['trace'])) for r in json.loads(line)['results']]
            for line in out.splitlines()]


def first_results(transforms, indices):
    json.dump(transforms, open(transforms_file, 'w', encoding='utf-8'), ensure_ascii=False)
    command = [tool, root, 'eo', imported] + (['--options', options] if options else [])
    out = subprocess.run(command, input='\n'.join(hovers[i] for i in indices) + '\n', capture_output=True,
                         text=True, check=True).stdout
    return [(lambda r: r[0]['expression'] if r else None)(json.loads(line)['results']) for line in out.splitlines()]


reference = deinflect(base)
changes = []
for i in range(len(ids) - 1):
    changes.append((f'{ids[i]} <-> {ids[i + 1]}', lambda d, i=i: d['transforms'].insert(i, d['transforms'].pop(i + 1))))
for move in (moves.split(',') if moves else []):
    a, b = move.split(':')

    def edit(d, a=a, b=b):
        ts = d['transforms']
        t = ts.pop([x['id'] for x in ts].index(a))
        ts.insert([x['id'] for x in ts].index(b) + 1, t)
    changes.append((f'{a} after {b}', edit))

print(f'{len(hovers)} hovers, {len(unique)} words; options: {options or "defaults"}')
same = []
for name, edit in changes:
    mutant = json.loads(json.dumps(base))
    edit(mutant)
    results = deinflect(mutant)
    moved = [w for w, a, b in zip(unique, reference, results) if a != b]
    if not moved:
        same.append(name)
        continue
    indices = sorted(i for w in moved for i in at[w])
    before = first_results(base, indices)
    after = first_results(mutant, indices)
    changed = collections.Counter((words[i], x, y) for i, x, y in zip(indices, before, after) if x != y)
    examples = ', '.join(f'{w}: {x} → {y}' + (f' ×{n}' if n > 1 else '') for (w, x, y), n in changed.most_common(6))
    print(f'{name}\t{len(moved)} words change order\t{sum(changed.values())} first results change\t{examples}')
print(f'the same order for every word: {len(same)} of {len(changes)} ({"; ".join(same)})')
shutil.rmtree(root)
