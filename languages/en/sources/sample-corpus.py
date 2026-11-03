#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Samples the English deinflection corpus (tests/corpus.tsv + tests/gaps.tsv)
from UniMorph eng. Not run by any test; it records how the sample was made.

    python3 sample-corpus.py <unimorph eng file> <kty-en-en.zip> <out dir>

Inputs (README.md, Sources and licences):
- UniMorph eng at 66e0e9e8e2dcd196da081a25a48e5c1fe3d8b49b, file `eng`
  (sha256 20a191ce...5c67), CC BY-SA 3.0.
- kty-en-en from kaikki-to-yomitan, release v2025-04-08-10-54-36-00-00
  (sha256 3cf1f90e...3219), used only to check UniMorph's rows.
- wordfreq 3.1.1 (pip), used only to pick the frequent stratum.

The pool is UniMorph's rows whose form differs from the lemma, in seven
categories, both written in lowercase ASCII letters, hyphens and apostrophes,
whose lemma is a kty-en-en headword with the category's part of speech and
whose form kty-en-en lists as that inflection of that lemma (a form-of row
pointing at it with a matching label). The check drops UniMorph rows such as
gas -> uncountable (ADJ;CMPR). For each category, half the rows come from forms
with a wordfreq Zipf frequency of at least 2.5 (about one in 3 million words:
forms a reader meets) and half from the whole pool, with random.Random(1). A
(form, lemma, part of speech) is drawn at most once. Writes <out>/sample.tsv
(tests/corpus.tsv and tests/gaps.tsv: the rows the final rules miss were moved
to gaps.tsv by hand) and <out>/dev.tsv, the "dev pool" of README.md: every
other pool row, by category, leaving out a (form, lemma, part of speech) the
sample has in any category.
"""
import collections
import json
import random
import re
import sys
import zipfile

from wordfreq import zipf_frequency

unimorph, kty_zip, out_dir = sys.argv[1:4]

CATEGORIES = [
    # UniMorph features, corpus category, part of speech, kty form-of label test, rows per stratum
    ("N;PL", "noun plural", "n", lambda l: "plural" in l, 250),
    ("V;PRS;3;SG", "verb third-person singular", "v", lambda l: "third-person singular" in l, 100),
    ("V;PST", "verb past", "v", lambda l: ("past" in l and "participle" not in l), 125),
    ("V;V.PTCP;PST", "verb past participle", "v", lambda l: "past participle" in l, 100),
    ("V;V.PTCP;PRS", "verb present participle", "v", lambda l: ("present participle" in l or "gerund" in l), 125),
    ("ADJ;CMPR", "adjective comparative", "adj", lambda l: "comparative" in l, 50),
    ("ADJ;SPRL", "adjective superlative", "adj", lambda l: "superlative" in l, 50),
]
WORD = re.compile(r"^[a-z][a-z'-]*[a-z]$")

pos_of = collections.defaultdict(set)
labels_of = collections.defaultdict(list)
with zipfile.ZipFile(kty_zip) as z:
    banks = sorted((n for n in z.namelist() if n.startswith("term_bank_")), key=lambda n: int(n[10:-5]))
    for name in banks:
        for row in json.loads(z.read(name)):
            expression, _, _, rules, _, glossary = row[:6]
            pos_of[expression].update(rules.split())
            for g in glossary:
                if isinstance(g, list) and len(g) == 2 and isinstance(g[0], str) and isinstance(g[1], list):
                    labels_of[(expression, g[0])].append("|".join(g[1]))

pools = {c[0]: [] for c in CATEGORIES}
seen = set()
with open(unimorph, encoding="utf-8") as f:
    for line in f:
        lemma, form, feats = line.rstrip("\n").split("\t")
        if feats not in pools or form == lemma or not WORD.match(form) or not WORD.match(lemma):
            continue
        _, _, pos, label_ok, _ = next(c for c in CATEGORIES if c[0] == feats)
        if pos not in pos_of.get(lemma, ()):
            continue
        if not any(label_ok(l) for l in labels_of.get((form, lemma), ())):
            continue
        if (feats, form, lemma) in seen:
            continue
        seen.add((feats, form, lemma))
        pools[feats].append((form, lemma))

rng = random.Random(1)
taken = set()
sample = []
for features, name, pos, _, quota in CATEGORIES:
    pool = sorted(pools[features])
    frequent = [p for p in pool if zipf_frequency(p[0], "en") >= 2.5]
    for stratum, candidates in (("frequent", frequent), ("any", pool)):
        order = candidates[:]
        rng.shuffle(order)
        n = 0
        for form, lemma in order:
            if n == quota:
                break
            if (form, lemma, pos) in taken:
                continue
            taken.add((form, lemma, pos))
            sample.append((f"{name} ({stratum})", form, lemma, pos))
            n += 1

with open(f"{out_dir}/sample.tsv", "w", encoding="utf-8") as f:
    for category, form, lemma, pos in sample:
        f.write(f"{category}\t1\t{form}\t{lemma}\t{pos}\t*\n")
with open(f"{out_dir}/dev.tsv", "w", encoding="utf-8") as f:
    for features, name, pos, _, _ in CATEGORIES:
        for form, lemma in sorted(pools[features]):
            if (form, lemma, pos) not in taken:
                f.write(f"{name}\t1\t{form}\t{lemma}\t{pos}\t*\n")
print(f"{len(sample)} rows", file=sys.stderr)
