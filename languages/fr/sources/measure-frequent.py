#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Frequent forms (docs/languages.md 14 step 5, "Check the frequent forms").
# For each of the first N words of a frequency list whose lemma a rule
# reaches (a lemma the word's own form-of rows in the dictionary name, among
# the word's deinflections), look the word up as a host does and check that
# the first result with a definition is one of the word's own lemmas: the
# word itself when the dictionary has a row with definitions for it, or a
# lemma its form-of rows name.
#
#   python3 measure-frequent.py <languages dir> <code> <imported dictionary> <dictionary zip> <frequency list> \
#       [--n 10000] [--cli build/hoshidicts-cli] [--lookup build/lookup-batch] [--transforms <file>] [--index <cache.json>] [--wrong <out.tsv>]
#
# Prints one JSON object; --wrong writes the words whose first result is wrong.
import argparse, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dictindex import build, lemmas


def run(cmd, lines):
    p = subprocess.run(cmd, input='\n'.join(lines) + '\n', capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(f'{cmd[0]} failed: {p.stderr[:2000]}')
    return [json.loads(line) for line in p.stdout.splitlines()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('languages'); ap.add_argument('code'); ap.add_argument('dictionary'); ap.add_argument('zip'); ap.add_argument('frequency')
    ap.add_argument('--n', type=int, default=10000)
    ap.add_argument('--cli', default='build/hoshidicts-cli')
    ap.add_argument('--lookup', default='build/lookup-batch')
    ap.add_argument('--transforms')
    ap.add_argument('--index')
    ap.add_argument('--wrong')
    a = ap.parse_args()
    idx = build(a.zip, a.index or a.zip + '.index.json')
    words = []
    for line in open(a.frequency, encoding='utf-8'):
        w, c = line.rstrip('\n').rsplit(' ', 1)
        words.append((w, int(c)))
        if len(words) >= a.n:
            break
    texts = [w for w, _ in words]
    pre = run([a.cli, '--languages', a.languages, 'preprocess', a.code, '--stdin'], texts)
    variants = {p['input']: [v['text'] for v in p['variants']] for p in pre}
    allv = sorted({v for vs in variants.values() for v in vs})
    dcmd = [a.cli, '--languages', a.languages, 'deinflect', a.code, '--stdin']
    if a.transforms:
        dcmd += ['--transforms', a.transforms]
    deinf = {d['input']: d['results'] for d in run(dcmd, allv)}
    lookup = {d['text']: d['results'] for d in run([a.lookup, a.languages, a.code, a.dictionary], texts)}
    total_tokens = sum(c for _, c in words)
    reached = []
    for w, c in words:
        targets = lemmas(idx, w) - {w}
        rule_texts = {r['text'] for v in variants[w] for r in deinf[v] if r['trace']}
        if targets & rule_texts:
            reached.append((w, c))
    wrong = []
    for w, c in reached:
        first = next((r for r in lookup[w] if not r['formOf']), None)
        own = lemmas(idx, w)
        if first is None or first['expression'] not in own:
            wrong.append((w, c, first, sorted(own)))
    reached_tokens = sum(c for _, c in reached)
    wrong_tokens = sum(c for _, c, _, _ in wrong)
    if a.wrong:
        with open(a.wrong, 'w', encoding='utf-8') as f:
            f.write('# word\tcount\tfirst result\tmatched\ttrace\tthe word\'s own lemmas\n')
            for w, c, first, own in wrong:
                f.write(f"{w}\t{c}\t{first['expression'] if first else '-'}\t{first['matched'] if first else '-'}\t{'|'.join(first['trace']) if first else '-'}\t{','.join(own)}\n")
    print(json.dumps({'words': len(words), 'tokens': total_tokens, 'reached': len(reached), 'reachedTokens': reached_tokens,
                      'wrongFirst': len(wrong), 'wrongTokens': wrong_tokens,
                      'wrongShareOfReachedTokens': wrong_tokens / reached_tokens if reached_tokens else 0,
                      'wrongShareOfTokens': wrong_tokens / total_tokens}))


main()
