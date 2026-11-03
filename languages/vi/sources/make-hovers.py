#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hover texts for the real-text measurements of README.md. Not run by any test.

    python3 make-hovers.py <out dir> <text>...      (plain UTF-8 text files)
    python3 make-hovers.py --tatoeba <out dir> <vie_sentences.tsv>

Each line of a text is a paragraph; it is split into sentences after . ! ? or
… (with any closing quote or bracket) and a space. For every word (a run of
Latin letters and combining marks, as the pack's text.wordCharacters reads
it) the hover text is the sentence from that word to its end, as a host
passes it to a word lookup. Writes <out>/hover.txt (one text per line) and
<out>/words.txt (the hovered word on the same line).
"""
import re
import sys
import unicodedata

LETTER = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F'
WORD = re.compile(f'[{LETTER}]+')
END = re.compile(r'(?<=[.!?\u2026])["\u201D\u2019\u00BB)]*\s+')


def sentences_of(paths, tatoeba):
    for path in paths:
        with open(path, encoding='utf-8', errors='replace') as f:
            for line in f:
                if tatoeba:
                    parts = line.rstrip('\n').split('\t')
                    if len(parts) < 3:
                        continue
                    line = parts[2]
                flat = ' '.join(unicodedata.normalize('NFC', line).split())
                yield from (s for s in END.split(flat) if s)


def main(argv):
    tatoeba = argv[0] == '--tatoeba'
    if tatoeba:
        argv = argv[1:]
    out_dir, paths = argv[0], argv[1:]
    hovers, words = [], []
    for sentence in sentences_of(paths, tatoeba):
        for m in WORD.finditer(sentence):
            hovers.append(sentence[m.start():])
            words.append(m.group(0))
    with open(f'{out_dir}/hover.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(hovers) + '\n')
    with open(f'{out_dir}/words.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(words) + '\n')
    print(f'{len(hovers)} hovers', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1:])
