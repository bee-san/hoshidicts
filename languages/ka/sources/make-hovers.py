#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hover texts for the real-text measurements of README.md, adapted from
languages/en/sources/make-hovers.py for the Georgian script. Not run by any test.

    python3 make-hovers.py <out dir> text <file.txt>...
    python3 make-hovers.py <out dir> tatoeba <kat_sentences.tsv.bz2>

text inputs are plain texts (wiki-text.py pages writes them from a
Wikisource dump; the first line, the title, is skipped); they are split into
paragraphs at blank lines and into sentences after . ! ? or … (with any
closing quote) and a space. tatoeba reads Tatoeba's per-language export, one
sentence per line. For every word (a run of Georgian letters) the hover text
is the sentence from that word to its end, as a host passes it to a word
lookup. Writes <out>/hover.txt (one text per line) and <out>/words.txt (the
hovered word on the same line).
"""
import bz2
import re
import sys

out_dir, mode, paths = sys.argv[1], sys.argv[2], sys.argv[3:]
WORD = re.compile(r'[\u10D0-\u10FA\u10FC-\u10FF\u1C90-\u1CBA\u1CBD-\u1CBF]+')
END = re.compile(r'(?<=[.!?\u2026])["\u201C\u201D\u00BB)]*\s+')


def sentences():
    if mode == 'tatoeba':
        for path in paths:
            with bz2.open(path, 'rt', encoding='utf-8') as f:
                for line in f:
                    parts = line.rstrip('\n').split('\t')
                    if len(parts) == 3:
                        yield ' '.join(parts[2].split())
        return
    for path in paths:
        text = open(path, encoding='utf-8', errors='replace').read()
        text = text.split('\n', 1)[1] if '\n' in text else ''
        for paragraph in re.split(r'\n\s*\n', text):
            flat = ' '.join(paragraph.split())
            yield from END.split(flat)


hovers, words = [], []
for sentence in sentences():
    for m in WORD.finditer(sentence):
        hovers.append(sentence[m.start():])
        words.append(m.group(0))
with open(f'{out_dir}/hover.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(hovers) + '\n')
with open(f'{out_dir}/words.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(words) + '\n')
print(f'{len(hovers)} hovers', file=sys.stderr)
