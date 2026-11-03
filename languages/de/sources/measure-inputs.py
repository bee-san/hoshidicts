#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Inputs for the measurements of README.md (Measurements). Not run by any test.

    python3 languages/de/sources/measure-inputs.py <out dir> <wty-de-en.zip> <de_50k.txt> <deu_sentences.tsv.bz2> <pg*.txt>...

Writes into <out dir>:
- headwords.tsv: every expression of the dictionary that has a row with
  definitions, and the rules tags of those rows (space separated);
- redirects.tsv: form, lemma and the row's rules tags for every form-of
  reference of the dictionary (a definition [lemma, [rules]]);
- frequent.tsv: the 10,000 most frequent words of the frequency list, with
  their counts and the word as German text writes it: the list is in small
  letters, so a word gets the case it has most often in the Tatoeba
  sentences, not counting the first word of a sentence (Planeten, Kunden);
  a word Tatoeba lacks there gets a capital letter when the dictionary has
  it only with one;
- tatoeba.txt: the sentences of the Tatoeba file, one per line, in file order
  (at most 60,000, every sentence of German letters, digits and punctuation);
- hovers-<name>.txt and words-<name>.txt for each text (the Project Gutenberg
  books, and tatoeba): for every word, the text from that word to the end of
  its sentence, as a host passes it to a lookup, and the word itself.

A book's text is the part between its *** START and *** END lines, split into
paragraphs at blank lines and into sentences after . ! ? or … (with any
closing quote or bracket) and a space. A word is a run of letters (with
apostrophes and hyphens inside it).
"""
import bz2
import json
import re
import sys
import zipfile
from collections import defaultdict
from os.path import basename, join

out_dir, dictionary, frequency, tatoeba, *books = sys.argv[1:]

headwords = defaultdict(set)
redirects = set()
with zipfile.ZipFile(dictionary) as archive:
    for name in sorted(archive.namelist()):
        if not re.match(r'term_bank_\d+\.json$', name):
            continue
        for expression, _reading, _tags, rules, _score, glossary, *_ in json.loads(archive.read(name)):
            definitions = False
            for item in glossary:
                if isinstance(item, list) and len(item) == 2 and isinstance(item[0], str) and item[0] and isinstance(item[1], list):
                    redirects.add((expression, item[0], rules))
                else:
                    definitions = True
            if definitions:
                headwords[expression].update(rules.split())
with open(join(out_dir, 'headwords.tsv'), 'w', encoding='utf-8') as f:
    for expression in sorted(headwords):
        f.write(f"{expression}\t{' '.join(sorted(headwords[expression]))}\n")
with open(join(out_dir, 'redirects.tsv'), 'w', encoding='utf-8') as f:
    for form, lemma, rules in sorted(redirects):
        f.write(f'{form}\t{lemma}\t{rules}\n')

WORD = re.compile(r"[A-Za-zÀ-ÖØ-öø-ɏẞ][A-Za-zÀ-ÖØ-öø-ɏẞ'’\-]*")
END = re.compile(r'(?<=[.!?…])["»«“”‘’)]*\s+')
GERMAN = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿẞ0-9 .,;:!?…'’\"„“”‚‘»«()\-–]+$")


def hovers(sentences, name):
    texts, words = [], []
    for sentence in sentences:
        for m in WORD.finditer(sentence):
            word = m.group(0).rstrip("'’-")
            if word:
                texts.append(sentence[m.start():])
                words.append(word)
    with open(join(out_dir, f'hovers-{name}.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(texts) + '\n')
    with open(join(out_dir, f'words-{name}.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(words) + '\n')
    print(f'{name}: {len(texts)} hovers', file=sys.stderr)


sentences = []
with bz2.open(tatoeba, 'rt', encoding='utf-8') as f:
    for line in f:
        parts = line.rstrip('\n').split('\t')
        if len(parts) == 3 and GERMAN.match(parts[2]):
            sentences.append(' '.join(parts[2].split()))
            if len(sentences) == 60000:
                break
with open(join(out_dir, 'tatoeba.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(sentences) + '\n')
hovers(sentences, 'tatoeba')

cases = defaultdict(lambda: defaultdict(int))
for sentence in sentences:
    for m in list(WORD.finditer(sentence))[1:]:
        word = m.group(0).rstrip("'’-")
        cases[word.lower()][word] += 1
keys = set(headwords) | {form for form, _, _ in redirects}
with open(frequency, encoding='utf-8') as f, open(join(out_dir, 'frequent.tsv'), 'w', encoding='utf-8') as out:
    for i, line in enumerate(f):
        if i >= 10000:
            break
        word, count = line.split()
        written = cases.get(word)
        if written:
            cased = max(written.items(), key=lambda item: (item[1], item[0] == word))[0]
        elif word not in keys and word[:1].upper() + word[1:] in keys:
            cased = word[:1].upper() + word[1:]
        else:
            cased = word
        out.write(f'{word}\t{count}\t{cased}\n')

for path in books:
    text = open(path, encoding='utf-8', errors='replace').read()
    start = text.find('*** START')
    if start >= 0:
        text = text[text.find('\n', start) + 1:]
    end = text.find('*** END')
    if end > 0:
        text = text[:end]
    book = []
    for paragraph in re.split(r'\n\s*\n', text):
        flat = ' '.join(paragraph.split())
        book.extend(s for s in END.split(flat) if s)
    hovers(book, basename(path).removesuffix('.txt'))
