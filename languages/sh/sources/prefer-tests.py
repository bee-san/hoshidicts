#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes a test that fails without each PREFER entry of sources/build-own.mjs.

For every PREFER word, the word is looked up in wty-sh-en with the pack and
with a copy whose rules lack the PREFER whole-word rules (`build-own.mjs
--no-prefer`). The copy's first result is the reading the entry overrides.
Where wty-sh-en's form-of rows already put the PREFER lemma first, the
overridden reading is the copy's first deinflection with the same trace
length that is a wty-sh-en headword with definitions: the test dictionary
has no form-of rows, so there it would come first.

The Cyrillic twins (`build-own.mjs --all-twins`) are looked up in Cyrillic
with every candidate twin and without PREFER. A twin is kept, in
sources/cyrillic-twins.tsv, when it puts its lemma first and the lookup
without it shows another: the test dictionary then gets the Cyrillic word as
a form-of row naming the other lemma first and the twin's lemma second, as
wty-sh-en's references tie in bank order, and a `prefer` row. Run
`build-own.mjs --transforms` again afterwards, so that transforms.json has
the kept twins.
The script replaces the block of tests/lookup.tsv after MARKER with one
`prefer` row per word (the pack's first result) and writes
tests/dictionary/term_bank_2.json with an entry for both readings (the
headword and the gloss "(test entry)"; nothing of wty-sh-en is copied). A
word whose two first results agree, or whose pack result is not its PREFER
lemma, is reported and gets no row.

    python3 prefer-tests.py <lookup-batch> <hoshidicts-cli> <wty-sh-en.zip> <imported wty-sh-en>
"""
import json
import os
import re
import zipfile
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
LANGUAGES = os.path.dirname(PACK)
MARKER = '# --- One row per PREFER word of sources/build-own.mjs, written by sources/prefer-tests.py (no third-party data) ---'


def first_results(batch, languages, dictionary, words):
    out = subprocess.run([batch, languages, 'sh', dictionary], input='\n'.join(words) + '\n',
                         capture_output=True, text=True, check=True).stdout.splitlines()
    return [(json.loads(line)['results'] or [None])[0] for line in out]


def defined_headwords(zip_path):
    """The headwords of wty-sh-en with a definition that is not a form-of reference."""
    out = set()
    with zipfile.ZipFile(zip_path) as z:
        for name in (n for n in z.namelist() if re.fullmatch(r'term_bank_\d+\.json', n)):
            for row in json.loads(z.read(name)):
                if any(not (isinstance(g, list) and len(g) == 2) for g in row[5]):
                    out.add(row[0])
    return out


def deinflections(cli, languages, words):
    out = subprocess.run([cli, '--languages', languages, 'deinflect', 'sh', '--stdin'], input='\n'.join(words) + '\n',
                         capture_output=True, text=True, check=True).stdout.splitlines()
    return {d['input']: d['results'] for d in map(json.loads, out)}


def main():
    batch, cli, zip_path, dictionary = sys.argv[1:5]
    with tempfile.TemporaryDirectory(prefix='sh-prefer-') as tmp:
        listing = os.path.join(tmp, 'prefer.tsv')
        subprocess.run(['node', os.path.join(HERE, 'build-own.mjs'), '--prefer-list', listing], check=True, capture_output=True)
        os.makedirs(os.path.join(tmp, 'sh'))
        shutil.copy(os.path.join(PACK, 'language.json'), os.path.join(tmp, 'sh', 'language.json'))
        subprocess.run(['node', os.path.join(HERE, 'build-own.mjs'), '--no-prefer', os.path.join(tmp, 'sh', 'transforms.json')],
                       check=True, capture_output=True)
        prefer = [line.rstrip('\n').split('\t') for line in open(listing, encoding='utf-8') if line.strip()]
        words = [w for w, _ in prefer]
        with_prefer = first_results(batch, LANGUAGES, dictionary, words)
        without = first_results(batch, tmp, dictionary, words)
        order = deinflections(cli, tmp, words)
        os.makedirs(os.path.join(tmp, 'twins', 'sh'))
        shutil.copy(os.path.join(PACK, 'language.json'), os.path.join(tmp, 'twins', 'sh', 'language.json'))
        twins_json = os.path.join(tmp, 'twins', 'sh', 'transforms.json')
        subprocess.run(['node', os.path.join(HERE, 'build-own.mjs'), '--all-twins', twins_json], check=True, capture_output=True)
        candidates = [line.rstrip('\n').split('\t') for line in open(twins_json + '.candidates.tsv', encoding='utf-8') if line.strip()]
        cyrillic = [c[2] for c in candidates]
        twin_with = first_results(batch, os.path.join(tmp, 'twins'), dictionary, cyrillic)
        twin_without = first_results(batch, tmp, dictionary, cyrillic)
    headwords = defined_headwords(zip_path)
    rows, entries, skipped = [], [], []
    for (word, lemmas), a, b in zip(prefer, with_prefer, without):
        if a is None or b is None or a['matched'] != word or a['expression'] not in lemmas.split('|'):
            skipped.append(f"{word}: first {a and a['expression']}, PREFER {lemmas}")
        else:
            other = b['expression']
            if other == a['expression']:
                found = [r['text'] for r in order.get(word, []) if len(r['trace']) == len(a['trace'])]
                before = found[:found.index(other)] if other in found else []
                other = next((t for t in before if t in headwords), None)
            if other is None:
                skipped.append(f"{word}: {a['expression']} first without the entry too")
                continue
            rows.append(f"prefer\t1\t{word}\t{a['expression']}\t{word}")
            entries += [a['expression'], other]
    kept, references = [], []
    for (word, lemma, cw, cl), a, b in zip(candidates, twin_with, twin_without):
        if a is not None and b is not None and a['matched'] == cw and a['expression'] == cl and b['expression'] != cl:
            kept.append((word, lemma, cw, cl))
            rows.append(f"prefer\t1\t{cw}\t{cl}\t{cw}")
            entries += [b['expression'], cl]
            # A Cyrillic competitor is a reference of the word's own rows; a
            # Latin one is a rule's reading of its transliteration.
            if any('\u0400' <= ch <= '\u04ff' for ch in b['expression']):
                references.append((cw, b['expression'], cl))
    with open(os.path.join(HERE, 'cyrillic-twins.tsv'), 'w', encoding='utf-8') as f:
        f.write('# Cyrillic twins of build-own.mjs (word, lemma, Cyrillic word, Cyrillic lemma), written by sources/prefer-tests.py:'
                ' the candidates that change a lookup of wty-sh-en.\n')
        f.write(''.join('\t'.join(k) + '\n' for k in kept))
    hand = {row[0] for row in json.load(open(os.path.join(PACK, 'tests', 'dictionary', 'term_bank_1.json'), encoding='utf-8'))}
    bank = [[h, '', '', '', 0, ['(test entry)'], 1000 + i, ''] for i, h in enumerate(sorted(set(entries) - hand))]
    bank += [[cw, '', 'non-lemma', '', 0, [[other, ['(test)']], [cl, ['(test)']]], 5000 + i, ''] for i, (cw, other, cl) in enumerate(references)]
    with open(os.path.join(PACK, 'tests', 'dictionary', 'term_bank_2.json'), 'w', encoding='utf-8') as f:
        f.write('[\n' + ',\n'.join('  ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in bank) + '\n]\n')
    path = os.path.join(PACK, 'tests', 'lookup.tsv')
    text = open(path, encoding='utf-8').read()
    head = text[:text.index(MARKER)] if MARKER in text else text.rstrip('\n') + '\n'
    with open(path, 'w', encoding='utf-8') as f:
        f.write(head + MARKER + '\n' + '\n'.join(rows) + '\n')
    print(json.dumps({'prefer': len(prefer), 'cyrillicCandidates': len(candidates), 'cyrillicKept': len(kept), 'rows': len(rows),
                      'dictionaryRows': len(bank), 'skipped': len(skipped)}, ensure_ascii=False))
    for s in skipped:
        print('  skipped:', s)


if __name__ == '__main__':
    main()
