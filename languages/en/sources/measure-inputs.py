#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Inputs of sources/measure-frequent-words.mjs (README.md, Measurements). Not
run by any test.

    python3 measure-inputs.py <wty-en-en.zip> <out dir>

Writes, from the dictionary's term banks:
- headwords.tsv: expression, rules (one line per term row);
- redirects.tsv: form, lemma, labels joined by | (the rows whose glossary is a
  form-of reference [lemma, [labels]]);
and, with wordfreq 3.1.1 (pip install wordfreq==3.1.1):
- frequent-words.tsv: word, Zipf frequency: the 20,000 most frequent English
  words of wordfreq that are lowercase letters, apostrophes and hyphens and
  headwords of the dictionary.
"""
import json
import re
import sys
import zipfile

from wordfreq import top_n_list, zipf_frequency

zip_path, out_dir = sys.argv[1:3]
heads = set()
with zipfile.ZipFile(zip_path) as z, \
        open(f'{out_dir}/headwords.tsv', 'w', encoding='utf-8') as hw, \
        open(f'{out_dir}/redirects.tsv', 'w', encoding='utf-8') as rd:
    banks = sorted((n for n in z.namelist() if n.startswith('term_bank_')), key=lambda n: int(n[10:-5]))
    for name in banks:
        for row in json.loads(z.read(name)):
            expression, _, _, rules, _, glossary = row[:6]
            heads.add(expression)
            hw.write(f'{expression}\t{rules}\n')
            for g in glossary:
                if isinstance(g, list) and len(g) == 2 and isinstance(g[0], str) and isinstance(g[1], list):
                    rd.write(f"{expression}\t{g[0]}\t{'|'.join(g[1])}\n")

words = []
for word in top_n_list('en', 40000):
    if re.fullmatch(r"[a-z][a-z'-]*", word) and word in heads:
        words.append((word, zipf_frequency(word, 'en')))
        if len(words) == 20000:
            break
with open(f'{out_dir}/frequent-words.tsv', 'w', encoding='utf-8') as f:
    for word, zipf in words:
        f.write(f'{word}\t{zipf}\n')
print(f'{len(heads)} headwords, {len(words)} frequent words', file=sys.stderr)
