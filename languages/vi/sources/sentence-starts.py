#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The sentence-start count of README.md (Measurements 4, Known gaps). Not
run by any test.

    python3 sentence-starts.py <vie_sentences.tsv> <dictionary banks dir> <pack run> <Yomitan's run>

The runs are lookup-batch-vi outputs over make-hovers.py --tatoeba hovers. A
sentence start is a hover whose text is a whole sentence. Counts the starts
whose first result with a definition is the capitalised word as written (a
name or letter entry) while the word with a lower-case first letter has a
row with definitions, and how many of them Yomitan's processors show alike.
"""
import collections
import glob
import json
import sys
import unicodedata


def first(results):
    return next((r for r in results if not r['formOf']), None)


def main(sentences_path, banks, pack_run, yomitan_run):
    defined = set()
    for path in glob.glob(f'{banks}/term_bank_*.json'):
        for row in json.load(open(path, encoding='utf-8')):
            if row[2] != 'non-lemma':
                defined.add(row[0])
    sentences = set()
    for line in open(sentences_path, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) >= 3:
            sentences.add(' '.join(unicodedata.normalize('NFC', parts[2]).split()))
    starts, same, words = 0, 0, collections.Counter()
    with open(pack_run, encoding='utf-8') as fp, open(yomitan_run, encoding='utf-8') as fy:
        for lp, ly in zip(fp, fy):
            row = json.loads(lp)
            if row['text'] not in sentences:
                continue
            starts += 1
            r = first(row['results'])
            if not r or not r['matched'][:1].isupper() or r['expression'] != r['matched']:
                continue
            lower = r['matched'][0].lower() + r['matched'][1:]
            if lower != r['matched'] and lower in defined:
                words[r['matched']] += 1
                y = first(json.loads(ly)['results'])
                same += y is not None and y['expression'] == r['expression']
    print(f'sentence starts {starts}; a capitalised entry first while the lower-case word is a headword: '
          f'{sum(words.values())}; the same with Yomitan\'s processors: {same}')
    print('  ' + ', '.join(f'{w} {n}' for w, n in words.most_common(12)))


if __name__ == '__main__':
    main(*sys.argv[1:])
