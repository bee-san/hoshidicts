#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Looks up the words of Wiktionary's usage examples as a host does (README.md, Measurements).

    python3 languages/aii/sources/measure-examples.py <kaikki-aii.jsonl> <imported dictionary> \
        [--lookup build/aii-lookup-batch] [--languages dir] [--options id,...] [--unpointed] [--report N] [--out file.jsonl]

Each usage example of English Wiktionary's Assyrian Neo-Aramaic entries
(kaikki.org's extract) marks the entry's word in bold. The hover text is the
example from the start of the bold span to the end of its sentence, and the
expected lemma is the entry's headword. Examples of the proclitic entries
(ܒ-, ܕ-, ...) and spans of one letter are left out, and a span that starts
with ܟܹܐ, ܒܸܬ, ܠܵܐ or another particle of tense or negation is hovered at
the word after it. With --unpointed every vowel point and other mark is
removed from the hover text first, as unpointed text writes it. A first
result is right when its expression is the lemma; the script also counts
lookups that find the lemma anywhere in their results, and groups the wrong
first results by the last rule of their trace.
"""
import argparse
import collections
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MARKS = re.compile('[\u0303\u0304\u0307\u0308\u0323\u032E\u0330\u0331\u0711\u0730-\u074A\u00AD\u0640\u200C\u200D\u2060\uFEFF]')
END = re.compile(r'[.!?\u061F\u0700\u0701\u0702\u2026]')
# Particles of tense and negation that a bold span may start with.
PARTICLES = {'ܟܐ', 'ܟܝ', 'ܒܬ', 'ܒܕ', 'ܠܐ', 'ܠܝܬ'}


def strip(s):
    return MARKS.sub('', unicodedata.normalize('NFC', s))


def hovers(path):
    out = []
    seen = set()
    with open(path, encoding='utf-8') as f:
        for line in f:
            e = json.loads(line)
            for sense in e.get('senses', []):
                for ex in sense.get('examples', []) or []:
                    text = ex.get('text') or ''
                    offsets = ex.get('bold_text_offsets') or []
                    if not offsets or not re.search('[\u0710-\u072F]', text):
                        continue
                    a, b = offsets[0]
                    span = text[a:b]
                    if not re.search('[\u0710-\u072F]', span) or e['word'].endswith('-') or len(strip(span)) < 2:
                        continue
                    # A span that starts with a particle of tense or negation
                    # (ܟܹܐ ܡܲܣܬܹܐ, he gives to drink) is hovered at its verb.
                    words = span.split()
                    while len(words) > 1 and strip(words[0]) in PARTICLES:
                        a = text.index(words[1], a)
                        words = words[1:]
                    span = ' '.join(words)
                    rest = text[a:]
                    m = END.search(rest, len(span))
                    hover = rest[:m.start()] if m else rest
                    key = (hover, e['word'])
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append({'lemma': e['word'], 'pos': e.get('pos'), 'span': span, 'hover': ' '.join(hover.split())})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('kaikki')
    ap.add_argument('dictionary')
    ap.add_argument('--lookup', default=str(ROOT / 'build' / 'aii-lookup-batch'))
    ap.add_argument('--languages', default=str(ROOT / 'languages'))
    ap.add_argument('--options')
    ap.add_argument('--unpointed', action='store_true')
    ap.add_argument('--report', type=int, default=0)
    ap.add_argument('--out')
    args = ap.parse_args()
    items = hovers(args.kaikki)
    texts = [strip(i['hover']) if args.unpointed else i['hover'] for i in items]
    cmd = [args.lookup, args.languages, args.dictionary]
    if args.options:
        cmd += ['--options', args.options]
    res = subprocess.run(cmd, input=''.join(t + '\n' for t in texts), capture_output=True, text=True, check=True).stdout.splitlines()
    first_right = found = nothing = 0
    wrong = collections.Counter()
    examples = collections.defaultdict(list)
    out = []
    for item, line in zip(items, res):
        results = json.loads(line)['results']
        lemmas = [r['expression'] for r in results]
        lemma = item['lemma']
        if not results:
            nothing += 1
        if results and results[0]['expression'] == lemma:
            first_right += 1
        elif results:
            r = results[0]
            key = r['trace'][-1] if r['trace'] else '(as written)'
            if r['fromDictionary'] and r['fromDictionary'][-1]:
                key = '(form-of row)'
            wrong[key] += 1
            examples[key].append(f"{strip(item['span'])}→{r['expression']} (want {lemma})")
        if lemma in lemmas:
            found += 1
        out.append({**item, 'first': results[0] if results else None, 'found': lemma in lemmas})
    n = len(items)
    print(f'{"unpointed" if args.unpointed else "pointed"} hovers {n}: first result right {first_right} ({first_right / n:.3f}), '
          f'lemma among results {found} ({found / n:.3f}), no result {nothing}')
    for key, count in wrong.most_common(args.report or 0):
        print(f'  {key}: {count}  e.g. ' + '  '.join(examples[key][:6]))
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            for o in out:
                f.write(json.dumps(o, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
