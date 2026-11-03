#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Samples inflected form -> lemma pairs for languages/ar/tests from UniMorph ara.

    python3 languages/ar/sources/sample-corpus.py <unimorph ara file> <out dir>

Reads the file `ara` of https://github.com/unimorph/ara (UniMorph's Modern
Standard Arabic data from English Wiktionary, CC BY-SA 3.0). Its lemmas are
written without vowel marks and its forms with them; each form is NFC
normalised and its vowel marks, tanwin, shadda, sukun, the dagger alif and the
Quranic marks are removed, as running text writes it. Rows whose form or lemma
has anything but Arabic letters U+0621-U+064A are dropped, and so are rows
whose form is then the lemma itself. One row is kept per (form, lemma, part
of speech); a form two tags spell the same keeps the first tag in file order.

Writes <out dir>/sample.tsv (the strata below, seed 1, in the corpus format of
docs/languages.md 12.2) and <out dir>/dev-pool.tsv (every other row, same
format), which is never committed.

With a third argument, the path of wty-ar-en.zip, a row is kept only when a
form-of row of that dictionary spells the form and names the lemma (its target
compared without vowel marks), which drops UniMorph's errors (الراكب given as a
form of جزية) and lemmas spelled without the hamza the dictionary writes (اباحي
for إباحي). Nothing from the dictionary is written.
"""

import hashlib
import json
import random
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

MARKS = re.compile('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]')
LETTERS = re.compile('^[\u0621-\u064A]+$')

# Stratum -> rows to sample. 1,500 rows in all.
STRATA = {
    'verb perfect active': 200,
    'verb perfect passive': 40,
    'verb imperfect indicative active': 200,
    'verb imperfect indicative passive': 40,
    'verb imperfect jussive active': 120,
    'verb imperfect jussive passive': 20,
    'verb imperative': 120,
    'verb participle': 30,
    'verbal noun': 20,
    'noun singular definite': 150,
    'noun singular indefinite': 60,
    'noun singular construct': 10,
    'noun dual': 120,
    'noun plural definite': 80,
    'noun plural indefinite': 80,
    'noun plural construct': 10,
    'adjective singular definite': 40,
    'adjective singular indefinite': 50,
    'adjective dual': 40,
    'adjective plural': 70,
}

RULE = {'N': 'n', 'V': 'v', 'ADJ': '*'}


def strip(text):
    return MARKS.sub('', unicodedata.normalize('NFC', text))


def stratum(tag):
    f = tag.split(';')
    pos = f[0]
    if pos == 'V':
        if 'V.PTCP' in f:
            return 'verb participle'
        if 'V.MSDR' in f:
            return 'verbal noun'
        if 'IMP' in f:
            return 'verb imperative'
        voice = 'passive' if 'PASS' in f else 'active'
        if 'PST' in f:
            return 'verb perfect ' + voice
        if 'LGSPEC1' in f:
            return 'verb imperfect jussive ' + voice
        return 'verb imperfect indicative ' + voice
    number = 'singular' if 'SG' in f else 'dual' if 'DU' in f else 'plural'
    state = 'definite' if 'DEF' in f else 'construct' if 'PSSD' in f else 'indefinite'
    if pos == 'N':
        return 'noun dual' if number == 'dual' else 'noun %s %s' % (number, state)
    if number == 'singular':
        return 'adjective singular ' + ('definite' if state == 'definite' else 'indefinite')
    return 'adjective ' + number


def confirmed_pairs(zip_path):
    pairs = set()
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(archive.read(name)):
                for definition in row[5]:
                    if isinstance(definition, list) and len(definition) == 2 and isinstance(definition[0], str):
                        pairs.add((row[0], strip(definition[0])))
    return pairs


def main():
    source, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    confirmed = confirmed_pairs(sys.argv[3]) if len(sys.argv) > 3 else None
    data = source.read_bytes()
    seen = {}
    dropped = 0
    for line in data.decode('utf-8').splitlines():
        cells = line.split('\t')
        if len(cells) != 3:
            continue
        lemma, form, tag = cells
        form = strip(form)
        lemma = strip(lemma)
        pos = tag.split(';')[0]
        if pos not in RULE or not LETTERS.match(form) or not LETTERS.match(lemma) or form == lemma:
            continue
        key = (form, lemma, pos)
        if confirmed is not None and (form, lemma) not in confirmed:
            dropped += 1
            continue
        if key not in seen:
            seen[key] = stratum(tag)
    by_stratum = {name: [] for name in STRATA}
    for key, name in seen.items():
        by_stratum[name].append(key)
    rng = random.Random(1)
    sample = []
    taken = set()
    for name, count in STRATA.items():
        rows = sorted(by_stratum[name])
        picked = rng.sample(rows, min(count, len(rows)))
        sample.extend((name, key) for key in picked)
        taken.update(picked)
    sha = hashlib.sha256(data).hexdigest()
    header = (
        '# Source: UniMorph ara (https://github.com/unimorph/ara), commit e9b7521ab75e3a7da6f996a428031164993e6f19, file ara\n'
        '# (sha256 %s), CC BY-SA 3.0, by the UniMorph contributors, from English Wiktionary.\n' % sha
    )
    columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)\n'

    def write(path, rows, note):
        with open(path, 'w', encoding='utf-8') as out:
            out.write(header + note + columns)
            for name, (form, lemma, pos) in rows:
                out.write('%s\t1\t%s\t%s\t%s\t*\n' % (name, form, lemma, RULE[pos]))

    write(out_dir / 'sample.tsv', sample,
          '# %d rows sampled with seed 1 by sources/sample-corpus.py from the rows whose form wty-ar-en 2026.10.22 lists as a form of the lemma (README.md).\n' % len(sample))
    pool = sorted((name, key) for key, name in seen.items() if key not in taken)
    write(out_dir / 'dev-pool.tsv', pool, '# The rows not sampled (never committed).\n')
    print('pairs', len(seen), 'dropped (rows not confirmed)', dropped, 'sample', len(sample), 'pool', len(pool))
    for name in STRATA:
        print('  %-36s %6d available, %4d sampled' % (name, len(by_stratum[name]), sum(1 for n, _ in sample if n == name)))


if __name__ == '__main__':
    main()
