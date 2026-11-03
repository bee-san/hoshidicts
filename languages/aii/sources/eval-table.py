#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The eval-language table of README.md (Measurements, item 1).

    python3 languages/aii/sources/eval-table.py <dictionary dir>... [--transforms F] [--cli build/hoshidicts-cli]
        [--languages DIR] [--label TEXT]

Runs `hoshidicts-cli eval-language aii` on corpus.tsv with gaps.tsv (the
whole sample), cases.tsv and defaults.tsv, each as it is and as a copy with
its `# options: default` line added or removed, against each dictionary
given, and prints one JSON line per run. The copies are written to a
temporary directory. `--languages` runs a copy of the pack (the README's
`untaggedTerms: "filter"` column is a copy with that one field changed);
`--label` names the run in the output.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TESTS = ROOT / 'languages' / 'aii' / 'tests'
LINE = '# options: default'


def lines(name):
    return (TESTS / name).read_text(encoding='utf-8').splitlines()


def flip(rows):
    """The other mode: drop the options line, or add it."""
    if rows and rows[0] == LINE:
        return rows[1:]
    return [LINE] + rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dictionaries', nargs='+')
    ap.add_argument('--transforms')
    ap.add_argument('--cli', default=str(ROOT / 'build' / 'hoshidicts-cli'))
    ap.add_argument('--languages', default=str(ROOT / 'languages'))
    ap.add_argument('--label', default='')
    args = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        files = {}
        sample = lines('corpus.tsv') + [l for l in lines('gaps.tsv') if not l.startswith('#')]
        files['sample (corpus + gaps)'] = sample
        files['cases.tsv'] = lines('cases.tsv')
        files['defaults.tsv'] = lines('defaults.tsv')
        for name, rows in list(files.items()):
            for mode, content in (('as is', rows), ('flipped', flip(rows))):
                path = Path(tmp) / f'{len(list(Path(tmp).iterdir()))}.tsv'
                path.write_text('\n'.join(content) + '\n', encoding='utf-8')
                options = 'defaults' if content and content[0] == LINE else 'all options'
                for d in args.dictionaries:
                    cmd = [args.cli, '--languages', args.languages, 'eval-language', 'aii', str(path), '--dictionary', d]
                    if args.transforms:
                        cmd += ['--transforms', args.transforms]
                    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
                    r = json.loads(out)
                    print(json.dumps({'file': name, 'mode': mode, 'options': options, 'dictionary': Path(d).name, 'label': args.label,
                                      'rows': r['rows'], 'recall': r['recall'], 'negativesPassed': r['negativesPassed'],
                                      'falseCandidates': r.get('falseCandidates'), 'firstRank': r.get('firstRank')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
