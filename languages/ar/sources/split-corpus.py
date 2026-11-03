#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Splits the UniMorph sample into tests/corpus.tsv and tests/gaps.tsv.

    python3 languages/ar/sources/split-corpus.py <sample.tsv> [--cli build/hoshidicts-cli]

<sample.tsv> is what sources/sample-corpus.py writes. A row whose lemma is
among the deinflections of its form (every optional processor and transform
on, as the conformance test runs the file, docs/languages.md 12.2) with a
compatible condition goes to tests/corpus.tsv, every other row to
tests/gaps.tsv; recall is reported over both. Run from the repository root.
"""
import json
import subprocess
import sys
from pathlib import Path

PACK = Path(__file__).resolve().parent.parent


def conditions(names, descriptor):
    out, todo = set(), list(names)
    while todo:
        c = todo.pop()
        out.add(c)
        todo.extend(descriptor['conditions'].get(c, {}).get('subConditions', []))
    return out


def run(cli, command, texts):
    cmd = [cli, '--languages', str(PACK.parent), command, 'ar', '--stdin', '--all-options']
    out = subprocess.run(cmd, input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    return {o['input']: o for o in map(json.loads, out.splitlines())}


def main():
    args = sys.argv[1:]
    sample = Path(args[0])
    cli = args[args.index('--cli') + 1] if '--cli' in args else 'build/hoshidicts-cli'
    descriptor = json.loads((PACK / 'transforms.json').read_text(encoding='utf-8'))
    header, rows = [], []
    for line in sample.read_text(encoding='utf-8').splitlines():
        if line.startswith('#'):
            header.append(line)
        elif line.strip():
            rows.append(line.split('\t'))
    sources = sorted({r[2] for r in rows})
    variants = run(cli, 'preprocess', sources)
    texts = sorted({v['text'] for s in sources for v in variants[s]['variants']})
    results = run(cli, 'deinflect', texts)
    reached, gaps = [], []
    for row in rows:
        _, _, source, term, rule, _ = row
        wanted = None if rule == '*' else conditions([rule], descriptor)
        ok = any(
            r['text'] == term and (wanted is None or not r['conditions'] or wanted & set(r['conditions']))
            for v in variants[source]['variants'] for r in results[v['text']]['results'])
        (reached if ok else gaps).append(row)
    note = '# The rows of the sample the final rules reach; the others are in gaps.tsv (sources/split-corpus.py).'
    gap_note = '# The rows of the sample the final rules do not reach (sources/split-corpus.py); reported, not enforced.'
    for path, part, extra in ((PACK / 'tests' / 'corpus.tsv', reached, note), (PACK / 'tests' / 'gaps.tsv', gaps, gap_note)):
        lines = header[:-1] + [extra, header[-1]] + ['\t'.join(r) for r in part]
        path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    total = len(rows)
    print('%d rows: %d in corpus.tsv, %d in gaps.tsv, recall %.2f%%' % (total, len(reached), len(gaps), 100 * len(reached) / total))


if __name__ == '__main__':
    main()
