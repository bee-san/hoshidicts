#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Builds the sample behind tests/corpus.tsv and tests/gaps.tsv. Not run by any test.

    python3 build-corpus.py <unimorph grc file> <agdt dir> <wty-grc-en term banks dir> > sample.tsv

Inputs (not committed; README.md "Sources and licences" has their revisions):
- UniMorph grc (https://github.com/unimorph/grc, file `grc`), CC BY-SA 3.0:
  noun and adjective paradigms from Wiktionary. A form is cleaned as a reader
  meets it: the article before it is dropped, vowel-length marks (macron,
  breve) are removed, `X / Y` gives both, `(ν)` gives the form with and
  without ν.
- Perseus Ancient Greek Dependency Treebank 2.1
  (https://github.com/PerseusDL/treebank_data, v2.1/Greek/texts), CC BY-SA 3.0
  US: word forms of real texts with their lemma and part of speech. An elided
  word's apostrophe, which the treebank writes as a combining comma above
  after the last consonant, is written U+2019.
- wiktionary-to-yomitan's wty-grc-en term banks: a row is kept only when its
  lemma is one of the dictionary's headwords, so that it says something about
  a lookup, and a treebank row is left out when the dictionary has a form-of
  entry for the form that names other lemmas only (the two lemmatise it
  differently; ἐπίστασθαι is ἐπίσταμαι there and ἐφίστημι in the treebank).

Rows are distinct (form, lemma) pairs that differ from their lemma, sampled
with seed 1: 300 from UniMorph (220 nouns, 80 adjectives) and 700 from the
treebank (300 finite verbs, 160 participles, 130 nouns, 80 adjectives, 30
pronouns and other words).
"""
import collections
import glob
import json
import random
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

UNIMORPH, AGDT, WTY = sys.argv[1], sys.argv[2], sys.argv[3]
GREEK = re.compile(r"^[\u0370-\u03ff\u1f00-\u1fff\u0300-\u036f\u2019]+$")
ARTICLE = {'ὁ', 'ἡ', 'τό', 'τοῦ', 'τῆς', 'τῷ', 'τῇ', 'τόν', 'τήν', 'οἱ', 'αἱ', 'τά', 'τῶν', 'τοῖς', 'ταῖς', 'τούς', 'τάς',
           'τώ', 'τοῖν', 'ταῖν', 'τὸ', 'τὸν', 'τὴν', 'τὰ', 'τοὺς', 'τὰς', 'τὼ', 'τὼ'}
CONS = 'βγδζθκλμνξπρσςτφχψ'


def nfc(s):
    return unicodedata.normalize('NFC', s)


def no_length_marks(s):
    return nfc(unicodedata.normalize('NFD', s).replace('\u0304', '').replace('\u0306', ''))


def strip_all(s):
    return nfc(''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.combining(c)))


# The dictionary: headwords with their parts of speech, and the lemmas each form-of row names.
lemmas = collections.defaultdict(set)
form_of = collections.defaultdict(set)
for path in glob.glob(f'{WTY}/term_bank_*.json'):
    for row in json.load(open(path, encoding='utf-8')):
        refs = [d[0] for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str)]
        if refs:
            for key in {row[0], row[1] or row[0]}:
                form_of[key].update(refs)
        else:
            lemmas[row[0]].add(row[3] or '*')

rows = []
# UniMorph
for line in open(UNIMORPH, encoding='utf-8'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) != 3:
        continue
    lemma, forms, feats = nfc(parts[0]), parts[1], parts[2]
    pos = feats.split(';')[0]
    if pos not in ('N', 'ADJ') or lemma not in lemmas:
        continue
    for alt in forms.split(' / '):
        words = alt.strip().split(' ')
        if len(words) == 2 and nfc(words[0]) in ARTICLE:
            words = words[1:]
        if len(words) != 1:
            continue
        w = no_length_marks(nfc(words[0]))
        for v in ([w.replace('(ν)', ''), w.replace('(ν)', 'ν')] if '(ν)' in w else [w]):
            if v and v != lemma and GREEK.match(v):
                rows.append(('um-' + ('noun' if pos == 'N' else 'adj'), v, lemma, 'n' if pos == 'N' else 'adj', feats))

# Treebank
def fix(form):
    d = unicodedata.normalize('NFD', form)
    d = re.sub('([' + CONS + CONS.upper() + '])\u0313$', '\\1\u2019', d)
    return nfc(d)


CATS = {'v': 'verb', 'n': 'noun', 'a': 'adj', 'p': 'pronoun', 'l': 'article', 'd': 'adverb', 'm': 'numeral'}
for path in sorted(glob.glob(f'{AGDT}/*.tb.xml')):
    for w in ET.parse(path).iter('word'):
        form, lemma, tag = w.get('form') or '', w.get('lemma') or '', w.get('postag') or ''
        if not form or not lemma or not tag or tag[0] not in CATS:
            continue
        form, lemma = fix(nfc(form)), nfc(re.sub(r'\d+$', '', lemma))
        if form == lemma or form.lower() == lemma or not GREEK.match(form) or lemma not in lemmas:
            continue
        named = form_of.get(strip_all(form).lower(), set()) | form_of.get(form, set())
        if named and lemma not in named:
            continue
        cat = CATS[tag[0]]
        if cat == 'verb' and len(tag) > 4 and tag[4] == 'p':
            cat = 'participle'
        rule = {'verb': 'v', 'participle': 'v', 'noun': 'n', 'adj': 'adj'}.get(cat, '*')
        if rule != '*' and rule not in lemmas[lemma]:
            rule = '*'
        rows.append(('agdt-' + cat, form, lemma, rule, tag))

# One row per (form, lemma); the first source keeps it.
seen = set()
pools = collections.defaultdict(list)
for row in rows:
    if (row[1], row[2]) in seen:
        continue
    seen.add((row[1], row[2]))
    pools[row[0]].append(row)
QUOTA = {'um-noun': 220, 'um-adj': 80, 'agdt-verb': 300, 'agdt-participle': 160, 'agdt-noun': 130, 'agdt-adj': 80,
         'agdt-pronoun': 15, 'agdt-adverb': 10, 'agdt-numeral': 3, 'agdt-article': 2}
random.seed(1)
out = []
for cat, n in QUOTA.items():
    pool = pools.get(cat, [])
    random.shuffle(pool)
    out += pool[:n]
# Short category names in the files (um: UniMorph, tb: the treebank), which keeps tests/ small.
SHORT = {'um-noun': 'um-n', 'um-adj': 'um-adj', 'agdt-verb': 'tb-v', 'agdt-participle': 'tb-ptc', 'agdt-noun': 'tb-n',
         'agdt-adj': 'tb-adj', 'agdt-pronoun': 'tb-pron', 'agdt-adverb': 'tb-adv', 'agdt-numeral': 'tb-num', 'agdt-article': 'tb-art'}
print('# category\tvalid\tsource\tterm\trule\treasons')
for cat, form, lemma, rule, feats in out:
    print(f'{SHORT[cat]}\t1\t{form}\t{lemma}\t{rule}\t*')
print(f'{len(out)} rows: ' + ', '.join(f'{c} {min(n, len(pools.get(c, [])))}' for c, n in QUOTA.items()), file=sys.stderr)
