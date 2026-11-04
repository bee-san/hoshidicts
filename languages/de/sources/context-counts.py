#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Context counts behind the homograph choices of README.md (Rule provenance). Not run by any test.

    python3 languages/de/sources/context-counts.py <inputs dir> <cache dir> <word>...

For each word (in small letters), counts its uses in the Tatoeba sentences of
<inputs dir>/tatoeba.txt and in the three Project Gutenberg books of <cache
dir> (pg69327.txt, pg22367.txt, pg5323.txt), a word at the start of a
sentence left out, by the word before and after it:
- verb: the word before is a personal pronoun or wer, was, man, jemand,
  niemand, or the word after is one (Ich liebe dich, liebe ich), or the word
  before is capitalized and not a determiner (Gott verdammte ihn);
- adjective: the word before is an article, a possessive, a determiner, an
  intensifier, a contraction or und, or the word after is capitalized (a
  noun) and the word before is not a pronoun;
- other: neither.
This is a heuristic, not a judgement: it tells which reading dominates, not
how each use reads.
"""
import re
import sys
from collections import Counter

inputs, cache, *words = sys.argv[1:]
words = {w.lower() for w in words}
DETERMINERS = set('''der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner keines
mein meine meinen meinem meiner meines dein deine deinen deinem deiner sein seine seinen seinem seiner ihr ihre ihren
ihrem ihrer unser unsere unseren unserem unserer euer eure euren eurem eurer dieser diese diesen diesem dieses jener jene
jenen jenem welche welcher welchen welchem jede jeder jeden jedem jedes alle allen aller viele vielen wenige wenigen
einige einigen manche manchen solche solchen zwei drei vier sehr so zu ganz recht ziemlich besonders am im zum zur vom
beim ins ans aufs andere anderen und'''.split())
SUBJECTS = set('ich du er sie es wir ihr man wer was jemand niemand'.split())

texts = open(f'{inputs}/tatoeba.txt', encoding='utf-8').read().split('\n')
for book in ('pg69327', 'pg22367', 'pg5323'):
    text = open(f'{cache}/{book}.txt', encoding='utf-8', errors='replace').read()
    texts += re.split(r'(?<=[.!?])\s+', ' '.join(text.split()))
verb, adjective, other = Counter(), Counter(), Counter()
for text in texts:
    tokens = re.findall(r'[A-Za-zÄÖÜäöüß]+', text)
    for i, token in enumerate(tokens):
        word = token.lower()
        if word not in words or i == 0:
            continue
        before = tokens[i - 1]
        after = tokens[i + 1] if i + 1 < len(tokens) else ''
        if before.lower() in DETERMINERS:
            adjective[word] += 1
        elif before.lower() in SUBJECTS or after.lower() in SUBJECTS or (before[0].isupper() and i > 1):
            verb[word] += 1
        elif after[:1].isupper():
            adjective[word] += 1
        else:
            other[word] += 1
total_verb = total_adjective = 0
for word in sorted(words, key=lambda w: -(verb[w] + adjective[w] + other[w])):
    print(f'{word}\tverb {verb[word]}\tadjective {adjective[word]}\tother {other[word]}\t{"verb" if verb[word] > adjective[word] else "adjective"}')
    total_verb += verb[word]
    total_adjective += adjective[word]
print(f'all\tverb {total_verb}\tadjective {total_adjective}')
