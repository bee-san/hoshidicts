#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hover texts for the real-text measurements of README.md. Not run by any test.

    python3 make-hovers.py <out dir> <text>...

The inputs are Project Gutenberg plain-text ebooks (pg<number>.txt from
https://www.gutenberg.org/cache/epub/<number>/pg<number>.txt) or any UTF-8
text. For a Gutenberg file, only the text between the *** START and *** END
lines is used. The text is split into paragraphs at blank lines and into
sentences after . ! ? or … (with any closing quote or bracket) and a space.

A word is a run of the pack's word characters (text.wordCharacters: letters,
combining marks, digits and the apostrophes ' ’ ʼ) that holds a letter, as a
host with scanStart "word" finds it. For every word the hover text is the
sentence from that word to its end. Writes <out>/hover.txt (one text per
line) and <out>/words.txt (the word, on the same line).
"""
import re
import sys

out_dir, paths = sys.argv[1], sys.argv[2:]
LETTER = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F'
WORD = re.compile(f"[{LETTER}'\u2019\u02BC\u0300-\u036F0-9]+")
HAS_LETTER = re.compile(f'[{LETTER}]')
END = re.compile(r'(?<=[.!?\u2026])["\u201C\u201D\u2019\u00BB)]*\s+')
hovers, words = [], []
for path in paths:
    text = open(path, encoding='utf-8', errors='replace').read()
    start = text.find('*** START')
    if start >= 0:
        text = text[text.find('\n', start) + 1:]
    end = text.find('*** END')
    if end > 0:
        text = text[:end]
    for paragraph in re.split(r'\n\s*\n', text):
        flat = ' '.join(paragraph.split())
        for sentence in END.split(flat):
            for m in WORD.finditer(sentence):
                if HAS_LETTER.search(m.group(0)):
                    hovers.append(sentence[m.start():])
                    words.append(m.group(0))
with open(f'{out_dir}/hover.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(hovers) + '\n')
with open(f'{out_dir}/words.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(words) + '\n')
print(f'{len(hovers)} hovers', file=sys.stderr)
