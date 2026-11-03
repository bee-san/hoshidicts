#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hover texts with gold lemmas from the Perseus Ancient Greek Dependency
Treebank, for the real-text measurements of README.md. Not run by any test.

    python3 make-hovers-agdt.py <out dir> <tlg*.tb.xml>...

Each sentence of the treebank is written out as running text: words joined
by spaces, punctuation attached to the word before it. For every word token
the hover text is the sentence from that word to its end, as a host passes it
to a word lookup. Writes <out>/hover.tsv: hover text, the word as written, the
treebank's lemma (trailing sense digits removed) and its part-of-speech tag.

The treebank writes an elided word's apostrophe as a combining comma above
after the final consonant (δ̓, ἀλλ̓); that is changed to U+2019, as printed
texts write it. Placeholders ([0]) and tokens without a lemma are skipped.
"""
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

CONS = 'βγδζθκλμνξπρσςτφχψ'
PUNCT = set(',.;·:·;!?"\u0387\u037e\u2019\u02bc\u1fbd—–-()[]')


def nfc(s):
    return unicodedata.normalize('NFC', s)


def fix(form):
    d = unicodedata.normalize('NFD', form)
    d = re.sub('([' + CONS + CONS.upper() + '])\u0313$', '\\1\u2019', d)
    return nfc(d)


out_dir, paths = sys.argv[1], sys.argv[2:]
rows = []
for path in paths:
    for sentence in ET.parse(path).iter('sentence'):
        toks = []
        for w in sentence.iter('word'):
            form = w.get('form') or ''
            if not form or form.startswith('['):
                continue
            toks.append((fix(nfc(form)), w.get('lemma') or '', w.get('postag') or ''))
        # running text
        text = ''
        starts = []
        for form, lemma, pos in toks:
            is_punct = pos.startswith('u') or all(c in PUNCT for c in form)
            if text and not is_punct:
                text += ' '
            starts.append((len(text), form, lemma, pos, is_punct))
            text += form
        for start, form, lemma, pos, is_punct in starts:
            if is_punct or not lemma or not re.search('[\u0370-\u03ff\u1f00-\u1fff]', form):
                continue
            hover = text[start:]
            rows.append((hover, form, nfc(re.sub(r'\d+$', '', lemma)), pos))
with open(f'{out_dir}/hover.tsv', 'w', encoding='utf-8') as f:
    for r in rows:
        f.write('\t'.join(x.replace('\t', ' ') for x in r) + '\n')
print(f'{len(rows)} hovers', file=sys.stderr)
