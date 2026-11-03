#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The frequent-forms check of docs/languages.md section 14 step 5. Not run by
any test.

    python3 measure-frequent.py <hoshidicts-cli> <lookup-batch> <languages dir> <imported dictionary>
                                <dictionary zip dir (term_bank_*.json)> <frequency list> <sample.tsv> [top]

For each of the `top` (10,000) most frequent words of the list (word count
per line), the lemmas a form-of row of the word or a sample row names are
taken, and those the pack reaches from the word (a deinflection of one of its
processor variants) are kept. Each word with such a lemma is looked up alone
(lookup-batch: Lookup::lookup with the pack's defaults) and its first result
with a definition is judged: right when it is one of those lemmas or the word
itself where the dictionary defines the word. Prints the counts, their share
of the list's tokens, and the wrong ones.
"""
import collections
import glob
import json
import subprocess
import sys


def run_cli(cli, languages, command, inputs):
    out = subprocess.run([cli, '--languages', languages, command, 'vi', '--stdin'], input='\n'.join(inputs) + '\n',
                         capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def main(cli, batch, languages, imported, banks, freq, sample, top='10000'):
    top = int(top)
    form_of = collections.defaultdict(set)
    defined = set()
    for path in glob.glob(f'{banks}/term_bank_*.json'):
        for row in json.load(open(path, encoding='utf-8')):
            refs = [d for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str)]
            if refs:
                form_of[row[0]].update(r[0] for r in refs)
            if len(refs) < len(row[5]):
                defined.add(row[0])
    named = collections.defaultdict(set)
    for line in open(sample, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) >= 4 and not line.startswith('#') and parts[1] == '1':
            named[parts[2]].add(parts[3])
    words, counts = [], {}
    for line in open(freq, encoding='utf-8'):
        parts = line.split()
        if len(parts) == 2 and parts[0] not in counts:
            words.append(parts[0])
            counts[parts[0]] = int(parts[1])
        if len(words) == top:
            break
    total_tokens = sum(counts.values())
    variants = run_cli(cli, languages, 'preprocess', words)
    flat = sorted({v['text'] for p in variants for v in p['variants']})
    reach = {d['input']: {r['text'] for r in d['results']} for d in run_cli(cli, languages, 'deinflect', flat)}
    reached = {}
    for word, p in zip(words, variants):
        texts = set().union(*(reach[v['text']] for v in p['variants']))
        lemmas = {l for l in form_of[word] | named[word] if l != word and l in texts}
        if lemmas:
            reached[word] = lemmas
    looked = list(reached)
    out = subprocess.run([batch, languages, 'vi', imported], input='\n'.join(looked) + '\n', capture_output=True,
                         text=True, check=True).stdout.splitlines()
    wrong = []
    for word, line in zip(looked, out):
        first = next((r for r in json.loads(line)['results'] if not r['formOf']), None)
        expression = first['expression'] if first else None
        if expression in reached[word] or (expression == word and word in defined):
            continue
        wrong.append((word, expression, sorted(reached[word])))
    reached_tokens = sum(counts[w] for w in reached)
    wrong_tokens = sum(counts[w] for w, _, _ in wrong)
    print(f'words {len(words)} ({total_tokens} tokens); a rule reaches a named lemma for {len(reached)} '
          f'({reached_tokens / total_tokens:.2%} of tokens); wrong first result {len(wrong)} '
          f'({wrong_tokens / total_tokens:.3%} of tokens)')
    for word, expression, lemmas in sorted(wrong, key=lambda w: -counts[w[0]]):
        print(f'  {word} ({counts[word]}): first {expression}, lemma {" / ".join(lemmas)}')


if __name__ == '__main__':
    main(*sys.argv[1:])
