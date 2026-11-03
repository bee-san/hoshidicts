#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# lookup.untaggedTerms numbers of README.md (Measurements 1; docs/languages.md
# section 14 step 5). Not run by any test.
#
#   python3 languages/de/sources/untagged-terms.py count <wty-de-en.zip>
#     rows whose rules column is empty, grouped by their first definition tag
#   python3 languages/de/sources/untagged-terms.py copies <scratch dir>
#     writes <scratch>/filter/de and <scratch>/pass/de, copies of this pack
#     with lookup.untaggedTerms set; eval-language reads them with
#     hoshidicts-cli --languages <scratch>/<value> eval-language de <file> --dictionary <wty-de-en>
#   python3 languages/de/sources/untagged-terms.py compare <inputs> <wty-de-en> <lookup-batch> <scratch dir>
#     looks up the hovers of measure-inputs.py (frequent words and the four
#     texts) with both copies and counts the lookups whose first result
#     differs, grouped as README.md reports them
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

PACK = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TEXTS = ['frequent', 'tatoeba', 'pg69327', 'pg22367', 'pg5323']


def count(zip_path):
    z = zipfile.ZipFile(zip_path)
    total = 0
    empty = collections.Counter()
    form_of = collections.Counter()
    tagged = collections.Counter()
    examples = collections.defaultdict(list)
    for name in sorted(z.namelist()):
        if not re.match(r'term_bank_\d+\.json$', name):
            continue
        for row in json.loads(z.read(name)):
            total += 1
            tags = (row[2] or '').split()
            first = tags[0] if tags else '(none)'
            if (row[3] or '').strip() == '':
                empty[first] += 1
                if any(isinstance(g, list) for g in row[5]):
                    form_of[first] += 1
                if len(examples[first]) < 4:
                    examples[first].append(row[0])
            else:
                tagged[first] += 1
    n = sum(empty.values())
    print(f'rows {total}; rules empty {n} ({100 * n / total:.2f}%)')
    for tag, c in empty.most_common():
        print(f'  {tag}\t{c}\tform-of {form_of[tag]}\ttagged rows with this first tag {tagged[tag]}\te.g. {", ".join(examples[tag])}')


def copies(scratch):
    for value in ('filter', 'pass'):
        target = os.path.join(scratch, value, 'de')
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(PACK, target, ignore=shutil.ignore_patterns('sources', 'tests'))
        path = os.path.join(target, 'language.json')
        with open(path, encoding='utf-8') as f:
            pack = json.load(f)
        pack['lookup']['untaggedTerms'] = value
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(pack, f, ensure_ascii=False, indent=2)
            f.write('\n')


def first(line):
    results = json.loads(line)['results']
    return (results[0]['expression'], results[0]['matched']) if results else (None, None)


def compare(inputs, dictionary, batch, scratch):
    copies(scratch)
    groups = collections.Counter()
    examples = collections.defaultdict(collections.Counter)
    lookups = 0
    for text in TEXTS:
        hovers = os.path.join(inputs, f'hovers-{text}.txt')
        with open(os.path.join(inputs, f'words-{text}.txt'), encoding='utf-8') as f:
            words = [line.rstrip('\n') for line in f]
        out = {}
        for value in ('filter', 'pass'):
            with open(hovers, encoding='utf-8') as f:
                out[value] = subprocess.run([batch, os.path.join(scratch, value), 'de', dictionary, '16', '16'],
                                            stdin=f, capture_output=True, text=True, check=True).stdout.splitlines()
        for word, a, b in zip(words, out['filter'], out['pass']):
            lookups += 1
            (fa, ma), (fb, mb) = first(a), first(b)
            if (fa, ma) == (fb, mb):
                continue
            w = word.lower()
            if fa == fb:
                group = 'same lemma, another matched text'
            elif w == 'dies':
                group = 'wrong: dies read as the imperative of diesen'
            elif w.startswith('innstetten'):
                group = 'wrong: Innstetten read as in'
            elif w.startswith('niemeyer') or w.startswith('nienkerken'):
                group = 'wrong: Niemeyer, Nienkerken read as nie'
            elif fb in ('zehnte', 'zwei', 'drei'):
                group = 'right: a numeral instead of its noun'
            else:
                group = 'other'
            groups[group] += 1
            examples[group][f'{word} {fa} -> {fb}'] += 1
    print(f'{lookups} lookups; the first result differs at {sum(groups.values())} between filter and pass')
    for group, c in groups.most_common():
        shown = '; '.join(f'{k} ×{n}' for k, n in examples[group].most_common(12))
        print(f'  {c}\t{group}\t{shown}')


if __name__ == '__main__':
    command = sys.argv[1] if len(sys.argv) > 1 else ''
    if command == 'count' and len(sys.argv) == 3:
        count(sys.argv[2])
    elif command == 'copies' and len(sys.argv) == 3:
        copies(sys.argv[2])
    elif command == 'compare' and len(sys.argv) == 6:
        compare(*sys.argv[2:6])
    else:
        sys.exit(__doc__ if __doc__ else 'usage: see the header of this file')
