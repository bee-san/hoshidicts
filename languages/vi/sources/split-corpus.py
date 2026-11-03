# SPDX-License-Identifier: GPL-3.0-or-later
"""Splits the sample of build-corpus.py into tests/corpus.tsv (rows the pack
reaches) and tests/gaps.tsv (the others), as section 12.2 asks:

    python3 languages/vi/sources/split-corpus.py <hoshidicts-cli> <languages dir> <sample.tsv> <tests dir>

A row is reached when its lemma is among the deinflections of a processor
variant of its source, which is what the conformance test checks (every
row's rule and reasons are *).
"""
import json
import subprocess
import sys

HEADER = """# Source: kaikki.org's extract of English Wiktionary, Vietnamese entries
# (https://kaikki.org/dictionary/Vietnamese/kaikki.org-dictionary-Vietnamese.jsonl, sha256 186cd0a6…d945,
# downloaded 2026-11-03), CC BY-SA 4.0 and GFDL, by the Wiktionary contributors.
# {total} rows written by sources/build-corpus.py (every reduplication pair, a sample of spelling pairs with seed 1);
# the rows the pack's rules and processors reach are in corpus.tsv ({reached}), the others in gaps.tsv ({missed}).
# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)
"""
GAPS = """# Known gaps: run by the conformance test and counted, not enforced.
"""


def run(cli, languages, command, inputs):
    out = subprocess.run([cli, '--languages', languages, command, 'vi', '--stdin', '--all-options'],
                         input='\n'.join(inputs) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def main(cli, languages, sample, tests):
    rows = [line.rstrip('\n').split('\t') for line in open(sample, encoding='utf-8') if line.strip() and not line.startswith('#')]
    variants = run(cli, languages, 'preprocess', [r[2] for r in rows])
    flat = sorted({v['text'] for p in variants for v in p['variants']})
    reach = {d['input']: {r['text'] for r in d['results']} for d in run(cli, languages, 'deinflect', flat)}
    corpus, gaps = [], []
    for row, p in zip(rows, variants):
        texts = set().union(*(reach[v['text']] for v in p['variants']))
        (corpus if row[3] in texts else gaps).append('\t'.join(row))
    head = HEADER.format(total=len(rows), reached=len(corpus), missed=len(gaps))
    with open(f'{tests}/corpus.tsv', 'w', encoding='utf-8') as f:
        f.write(head + '\n'.join(corpus) + '\n')
    with open(f'{tests}/gaps.tsv', 'w', encoding='utf-8') as f:
        f.write(GAPS + head + '\n'.join(gaps) + '\n')
    print(f'corpus {len(corpus)}, gaps {len(gaps)}', file=sys.stderr)


if __name__ == '__main__':
    main(*sys.argv[1:])
