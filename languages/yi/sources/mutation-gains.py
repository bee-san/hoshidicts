#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""For each stem-constraint mutation of mutations.py, the words whose
deinflections gain a wty-yi-en headword when the constraint is deleted: the
false candidates the constraint prevents. Used to write the negative rows of
tests/cases.tsv that make each mutation fail.

    python3 languages/yi/sources/mutation-gains.py <cache> <labels file> > gains.txt

<labels file> holds mutation labels as mutations.py prints them (one per
line, after SURVIVES). Words: the real texts, the frequency corpus' pages and
Tatoeba (measure.py), and every word's two-word phrase with its next word.
"""

import collections
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texts  # noqa: E402
from mutations import PACK, REPO, mutations  # noqa: E402


def deinflect(transforms_file, words):
    cli = os.path.join(REPO, 'build', 'hoshidicts-cli')
    run = subprocess.run([cli, 'deinflect', 'yi', '--stdin', '--transforms', transforms_file], input='\n'.join(words) + '\n',
                         capture_output=True, text=True, check=True)
    return [{r['text'] for r in json.loads(line)['results']} for line in run.stdout.splitlines()]


def main():
    cache, labels_file = sys.argv[1:3]
    wanted = {line.split('SURVIVES', 1)[1].strip().rsplit(' (', 1)[0] for line in open(labels_file, encoding='utf-8')
              if 'SURVIVES' in line}
    heads = texts.headwords(os.path.join(cache, 'wty-yi-en-json'))
    counts = collections.Counter()
    for _, _, page in texts.dump_pages(os.path.join(cache, 'yiwikisource-20261101-pages-articles.xml.bz2')):
        ws = [w for _, _, w in texts.words(page)]
        counts.update(ws)
        counts.update(f'{a} {b}' for a, b in zip(ws, ws[1:]))
    for sentence in texts.tatoeba(os.path.join(cache, 'yid_sentences.tsv.bz2')):
        ws = [w for _, _, w in texts.words(sentence)]
        counts.update(ws)
        counts.update(f'{a} {b}' for a, b in zip(ws, ws[1:]))
    words = [w for w, n in counts.most_common(150000)]
    with open(os.path.join(PACK, 'transforms.json'), encoding='utf-8') as f:
        transforms = json.load(f)
    base = deinflect(os.path.join(PACK, 'transforms.json'), words)
    scratch = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'yi-mutation-gains.json')
    for label, n, mutated in mutations(transforms):
        if label not in wanted:
            continue
        with open(scratch, 'w', encoding='utf-8') as f:
            json.dump(mutated, f, ensure_ascii=False)
        after = deinflect(scratch, words)
        gains = [(counts[w], w, t) for w, a, b in zip(words, base, after) for t in sorted(b - a) if t in heads and t != w]
        gains.sort(reverse=True)
        print(f'{label}\t{len(gains)}\t' + ' | '.join(f'{w} > {t} ({c})' for c, w, t in gains[:6]))


if __name__ == '__main__':
    main()
