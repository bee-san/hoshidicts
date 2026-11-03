#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Real-text and frequent-form measurements on the Urmia Bible of 1893 (README.md, Measurements).

    python3 languages/aii/sources/measure-urmia.py <urmia-1893 checkout> <wty-aii-en.zip> <imported dictionary> \
        [--options id,...] [--languages dir] [--sample N --sample-out file] [--report N]

The text: abrahameishow/assyrian-bible-api (books/*/<book>/<chapter>.json,
`verseText`), the 1893 Urmia Bible, public domain; the digital edition is
MIT-licensed. Words are runs of Syriac letters and marks; a sentence ends at
. : ! ? ؟ or a Syriac full stop or colon (U+0700-U+0705).

Two measurements, both looked up with build/aii-lookup-batch as a host does
(16 results, scan length 16; no options unless --options):

  frequent forms: every word type of the text, by frequency (the text's own
    frequency list, 10,410 types), looked up alone;
  hovers: every word of the text, looked up as the text from the word to the
    end of its sentence.

A word's right lemmas come from wty-aii-en's form-of rows: the lemmas the
rows of the word as written name, comparing the edition's dot below and
above with Wiktionary's rukkakha and qushshaya; with --loose also the
lemmas the rows of any form with the word's letters name (a looser judge:
an unpointed form often belongs to several words, so it marks right
readings wrong, such as ܐܸܠܹܗ, to him, against ܐܲܠܵܗ, God). The first result with a definition (a result
not marked formOf) is right when it is one of them, wrong when it is not;
a word whose letters no form-of row has is not judged by script, and
--sample writes a seeded random sample of those for judging by hand.
Wrong first results are grouped by the last transform of their trace.
"""
import argparse
import collections
import glob
import json
import random
import re
import subprocess
import unicodedata
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MARKS = re.compile('[\u0303\u0304\u0307\u0308\u0323\u032E\u0330\u0331\u0711\u0730-\u074A\u00AD\u0640\u200C\u200D\u2060\uFEFF]')
WORD = re.compile('[\u0710-\u074F\u0303-\u0331\u200C\u200D\u0640]+')
END = re.compile('[.:!?\u061F\u0700-\u0705]')


def letters(s):
    return MARKS.sub('', unicodedata.normalize('NFC', s))


# The 1893 edition marks a soft (rukkakha) or hard (qushshaya) consonant with
# a dot below or above the letter (U+0323, U+0307) where Wiktionary uses the
# Syriac marks (U+0742, U+0741); the exact judge compares the two that way.
POINTING = str.maketrans({'\u0323': '\u0742', '\u0307': '\u0741'})


def pointed(s):
    return unicodedata.normalize('NFC', unicodedata.normalize('NFC', s).translate(POINTING))


def is_form_of(d):
    return isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and isinstance(d[1], list)


def form_of_index(path):
    exact = collections.defaultdict(set)
    by_letters = collections.defaultdict(set)
    glosses = {}
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if name.startswith('term_bank_'):
                for row in json.loads(z.read(name)):
                    refs = [d for d in row[5] if is_form_of(d)]
                    for d in refs:
                        exact[pointed(row[0])].add(d[0])
                        by_letters[letters(row[0])].add(d[0])
                    if not refs:
                        glosses.setdefault(row[0], []).append(gloss(row[5]))
    return exact, by_letters, glosses


def gloss(defs):
    """The English of a structured-content glossary, without its grammar and etymology parts."""
    out = []

    def walk(n, skip=False):
        if isinstance(n, str):
            if not skip:
                out.append(n)
        elif isinstance(n, list):
            for m in n:
                walk(m, skip)
        elif isinstance(n, dict):
            data = n.get('data') or {}
            hide = skip or data.get('content') in ('preamble', 'details-entry-Grammar', 'details-entry-Etymology', 'backlink', 'example-sentence', 'extra-info')
            if 'content' in n:
                walk(n['content'], hide)
    walk(defs)
    return ' '.join(' '.join(out).split())[:120]


def sentences(checkout):
    for f in sorted(glob.glob(str(Path(checkout) / 'books' / '*' / '*' / '*.json'))):
        for v in json.load(open(f, encoding='utf-8')).get('verses', []):
            text = unicodedata.normalize('NFC', ' '.join((v.get('verseText') or '').split()))
            start = 0
            for m in END.finditer(text + '.'):
                yield text[start:m.start()]
                start = m.end()


def lookup(texts, dictionary, options, languages):
    cmd = [str(ROOT / 'build' / 'aii-lookup-batch'), languages, dictionary]
    if options:
        cmd += ['--options', options]
    out = subprocess.run(cmd, input=''.join(t + '\n' for t in texts), capture_output=True, text=True, check=True).stdout
    return [json.loads(line)['results'] for line in out.splitlines()]


def first_entry(results):
    for r in results:
        if not r['formOf']:
            return r
    return None


def judge(word, first, exact, by_letters, loose):
    """Right (True/False) or not judged (None), and the right lemmas: the
    lemmas the form-of rows of the word as written name, or with `loose`
    those of any row with the word's letters."""
    right = exact.get(pointed(word))
    if not right and loose:
        right = by_letters.get(letters(word))
    if not right:
        return None, right
    return (first is not None and first['expression'] in right), right


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('checkout')
    ap.add_argument('wty')
    ap.add_argument('dictionary')
    ap.add_argument('--options')
    ap.add_argument('--languages', default=str(ROOT / 'languages'))
    ap.add_argument('--sample', type=int, default=0)
    ap.add_argument('--sample-out')
    ap.add_argument('--report', type=int, default=10)
    ap.add_argument('--loose', action='store_true', help='also judge words by the form-of rows of their letters')
    args = ap.parse_args()
    exact, by_letters, glosses = form_of_index(args.wty)
    hovers, words = [], []
    for s in sentences(args.checkout):
        for m in WORD.finditer(s):
            hovers.append(s[m.start():].strip())
            words.append(m.group(0))
    freq = collections.Counter(words)
    types = [w for w, _ in freq.most_common()]
    tokens = sum(freq.values())
    # Frequent forms: each type alone.
    res = lookup(types, args.dictionary, args.options, args.languages)
    judged = wrong = wrong_tokens = judged_tokens = 0
    groups = collections.Counter()
    examples = collections.defaultdict(list)
    for w, results in zip(types, res):
        first = first_entry(results)
        ok, right = judge(w, first, exact, by_letters, args.loose)
        if ok is None:
            continue
        judged += 1
        judged_tokens += freq[w]
        if not ok:
            wrong += 1
            wrong_tokens += freq[w]
            key = (first['trace'][-1] if first and first['trace'] else ('(no entry)' if first is None else '(as written)'))
            groups[key] += freq[w]
            if len(examples[key]) < 6:
                examples[key].append(f"{w}→{first['expression'] if first else '-'} (want {'/'.join(sorted(right))}) ×{freq[w]}")
    print(f'frequent forms: {len(types)} types ({tokens} tokens); judged {judged} ({judged_tokens} tokens); '
          f'wrong first entry {wrong} types, {wrong_tokens} tokens ({wrong_tokens / tokens:.2%} of the text, '
          f'{wrong_tokens / max(judged_tokens, 1):.2%} of the judged)')
    for key, n in groups.most_common(args.report):
        print(f'  {key}: {n} tokens  e.g. ' + '  '.join(examples[key]))
    # Hovers: each word with the rest of its sentence.
    res = lookup(hovers, args.dictionary, args.options, args.languages)
    h_judged = h_wrong = h_none = 0
    h_groups = collections.Counter()
    h_examples = collections.defaultdict(list)
    unjudged = []
    for w, hover, results in zip(words, hovers, res):
        first = first_entry(results)
        if first is None:
            h_none += 1
        ok, right = judge(w, first, exact, by_letters, args.loose)
        if ok is None:
            unjudged.append((w, hover, first))
            continue
        h_judged += 1
        if not ok:
            h_wrong += 1
            key = (first['trace'][-1] if first and first['trace'] else ('(no entry)' if first is None else '(as written)'))
            h_groups[key] += 1
            if len(h_examples[key]) < 6:
                h_examples[key].append(f"{w}→{first['expression'] if first else '-'}[{first['matched'] if first else ''}] (want {'/'.join(sorted(right))})")
    print(f'hovers: {len(hovers)}; no entry {h_none}; judged by script {h_judged}, wrong {h_wrong} ({h_wrong / max(h_judged, 1):.2%}); '
          f'not judged by script {len(unjudged)}')
    for key, n in h_groups.most_common(args.report):
        print(f'  {key}: {n}  e.g. ' + '  '.join(h_examples[key]))
    if args.sample and args.sample_out:
        rng = random.Random(20261103)
        pick = rng.sample(unjudged, min(args.sample, len(unjudged)))
        with open(args.sample_out, 'w', encoding='utf-8') as f:
            for w, hover, first in pick:
                g = glosses.get(first['expression'], []) if first else []
                f.write(json.dumps({'word': w, 'hover': hover, 'first': first, 'gloss': g[:2]}, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
