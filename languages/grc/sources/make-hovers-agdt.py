#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Hover texts with the treebank's lemmas, for README.md's real text.   python3 make-hovers-agdt.py <out> <tlg*.tb.xml>...

Each sentence is written as running text; for every word the hover is the sentence from it to its end. <out>/hover.tsv:
hover, word, lemma (sense digits removed), tag, and the previous word's lemma and tag (- for none). The treebank's
elision mark (a combining comma above, δ̓) becomes U+2019; placeholders and tokens without a lemma are skipped.
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
        previous = ('-', '-')
        for start, form, lemma, pos, is_punct in starts:
            if is_punct:
                previous = ('-', '-')
                continue
            if not lemma or not re.search('[\u0370-\u03ff\u1f00-\u1fff]', form):
                previous = ('-', '-')
                continue
            hover = text[start:]
            gold = nfc(re.sub(r'\d+$', '', lemma))
            rows.append((hover, form, gold, pos, previous[0], previous[1]))
            previous = (gold, pos)
with open(f'{out_dir}/hover.tsv', 'w', encoding='utf-8') as f:
    for r in rows:
        f.write('\t'.join(x.replace('\t', ' ') for x in r) + '\n')
print(f'{len(rows)} hovers', file=sys.stderr)
