# SPDX-License-Identifier: GPL-3.0-or-later
"""Samples tests/corpus.tsv for the Vietnamese pack from kaikki.org's
English Wiktionary extract (not committed; CC BY-SA 4.0 and GFDL, by the
Wiktionary contributors):

    python3 languages/vi/sources/build-corpus.py <kaikki.org-dictionary-Vietnamese.jsonl> > sample.tsv

Vietnamese words do not inflect, so the pairs are the two kinds of form a
Vietnamese deinflector is for, taken from Wiktionary's own annotations:

- reduplication: an entry whose sense is a form of another word tagged
  "reduplication" (Wiktionary's "diminutive reduplication of đỏ"), or whose
  etymology uses the reduplication template (rdp, redup, reduplication) and
  names the base, and which has more words than the base;
- spelling: an entry whose sense is an alternative form of another word
  (alt_of) and that has the same letters as it once marks, capitals and
  hyphens are set aside and y is read as i. These are the tone-mark
  placements (hòa / hoà), i and y (kỹ thuật / kĩ thuật), hyphenated compounds
  (Việt-Nam / Việt Nam) and also variants of the same letters with another
  tone or vowel mark, which no spelling rule should make.

The selection does not look at the pack's rules; rows they do not reach go to
tests/gaps.tsv. Every reduplication pair and a seeded sample of the spelling
pairs are written, at most 1,000 rows.
"""
import json
import random
import re
import sys
import unicodedata

LIMIT = 1000
SEED = 1
SCRIPT = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ̀-ͯ' \-]+$")


def spelling_key(word):
    decomposed = unicodedata.normalize('NFD', word)
    letters = ''.join(c for c in decomposed if not unicodedata.combining(c))
    letters = letters.lower().replace('y', 'i').replace('-', ' ')
    return ' '.join(letters.split())


def base_word(arg):
    return re.sub(r'<[^>]*>', '', arg or '').strip()


def main(path):
    redup, spelling = {}, {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            entry = json.loads(line)
            if entry.get('lang_code') != 'vi':
                continue
            word = unicodedata.normalize('NFC', entry.get('word', ''))
            if not word or not SCRIPT.match(word):
                continue
            for sense in entry.get('senses', []):
                tags = sense.get('tags', [])
                for form in sense.get('form_of', []) or []:
                    base = unicodedata.normalize('NFC', form.get('word', ''))
                    if 'reduplication' in tags and base and base != word and len(word.split()) > len(base.split()):
                        redup.setdefault((word, base), 'reduplication')
                for form in sense.get('alt_of', []) or []:
                    lemma = unicodedata.normalize('NFC', form.get('word', ''))
                    if lemma and lemma != word and SCRIPT.match(lemma) and spelling_key(word) == spelling_key(lemma):
                        spelling.setdefault((word, lemma), 'spelling')
            for template in entry.get('etymology_templates', []) or []:
                if template.get('name') not in ('reduplication', 'rdp', 'redup'):
                    continue
                base = unicodedata.normalize('NFC', base_word(template.get('args', {}).get('2')))
                if base and base != word and SCRIPT.match(base) and len(word.split()) > len(base.split()):
                    redup.setdefault((word, base), 'reduplication')
    rows = sorted(redup.items())
    rest = sorted(spelling.items())
    random.Random(SEED).shuffle(rest)
    rows += rest[:max(0, LIMIT - len(rows))]
    print(f'# reduplication pairs {len(redup)}, spelling pairs {len(spelling)}, written {len(rows)}', file=sys.stderr)
    for (source, term), category in rows:
        print(f'{category}\t1\t{source}\t{term}\t*\t*')


if __name__ == '__main__':
    main(sys.argv[1])
