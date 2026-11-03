#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hover texts behind clitics, pronouns, articles and auxiliaries (README.md, Measurements). Not run by any test.

    python3 tatoeba-hovers.py <fra_sentences.tsv> <out dir> [every]

<fra_sentences.tsv> is Tatoeba's per-language export
(https://downloads.tatoeba.org/exports/per_language/fra/fra_sentences.tsv.bz2,
CC BY 2.0 FR); with [every] (default 7) only every [every]th sentence of
the file is used. Words are runs of letters, as in make-hovers.py. For every
word that follows one of the words below (an elided word before its
apostrophe, a subject or object pronoun, an article, a form of avoir or
être), two hover texts are written: the sentence from the word before (the
clitic, pronoun, article or auxiliary) to its end, and from the word itself.
Writes <out>/hover.txt, <out>/words.txt (the hovered word) and
<out>/classes.txt (the class and which of the two texts it is).
"""
import re
import sys

src, out_dir = sys.argv[1], sys.argv[2]
every = int(sys.argv[3]) if len(sys.argv) > 3 else 7
WORD = re.compile(r"[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]+")
CLASSES = {
    'elided': {"l'", "d'", "j'", "m'", "t'", "s'", "n'", "c'", "qu'", "jusqu'", "lorsqu'", "puisqu'", "quoiqu'"},
    'pronoun': {'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'lui', 'leur', 'y', 'en', 'ne'},
    'article': {'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux'},
    'auxiliary': {'ai', 'as', 'a', 'avons', 'avez', 'ont', 'avait', 'avaient', 'suis', 'es', 'est', 'sommes', 'êtes', 'sont', 'était', 'étaient'},
}
hovers, words, classes = [], [], []
sentences = 0
for n, line in enumerate(open(src, encoding='utf-8')):
    if n % every:
        continue
    sentences += 1
    parts = line.rstrip('\n').split('\t')
    if len(parts) < 3:
        continue
    sentence = ' '.join(parts[2].split())
    ms = list(WORD.finditer(sentence))
    for prev, cur in zip(ms, ms[1:]):
        between = sentence[prev.end():cur.start()]
        token = prev.group(0).lower()
        if between in ("'", '\u2019'):
            token += "'"
        elif between != ' ':
            continue
        cls = next((c for c, ws in CLASSES.items() if token in ws), None)
        if cls is None:
            continue
        hovers.append(sentence[prev.start():]); words.append(prev.group(0)); classes.append(f'{cls}\tfrom the {cls}')
        hovers.append(sentence[cur.start():]); words.append(cur.group(0)); classes.append(f'{cls}\tfrom the word after it')
for name, rows in (('hover', hovers), ('words', words), ('classes', classes)):
    with open(f'{out_dir}/{name}.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(rows) + '\n')
print(f'{sentences} sentences, {len(hovers)} hovers', file=sys.stderr)
