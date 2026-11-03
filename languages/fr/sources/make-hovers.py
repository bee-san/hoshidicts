#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hover texts for the real-text measurements of README.md. Not run by any test.

    python3 make-hovers.py <out dir> <pg*.txt>...

The inputs are Project Gutenberg plain-text ebooks (pg<number>.txt from
https://www.gutenberg.org/cache/epub/<number>/pg<number>.txt). The text
between the *** START and *** END lines is split into paragraphs at blank
lines and into sentences after . ! ? or … (with any closing quote) and a
space. Words are runs of letters, as the pack's text.wordCharacters has them:
apostrophes and hyphens separate words, so l'homme has two (l, homme). For
every word the hover text is the sentence from that word to its end, as a
host passes it to a word lookup. Writes <out>/hover.txt (one text per line)
and <out>/words.txt (the hovered word on the same line).
"""
import re
import sys

out_dir, paths = sys.argv[1], sys.argv[2:]
WORD = re.compile(r"[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]+")
END = re.compile(r'(?<=[.!?\u2026])["\u201D\u00BB)]*\s+')
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
                hovers.append(sentence[m.start():])
                words.append(m.group(0))
with open(f'{out_dir}/hover.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(hovers) + '\n')
with open(f'{out_dir}/words.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(words) + '\n')
print(f'{len(hovers)} hovers', file=sys.stderr)
