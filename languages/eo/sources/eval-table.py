#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The eval-language table of README.md (Measurements, item 1). Not run by
any test.

    python3 eval-table.py <hoshidicts-cli> <languages dir> <imported dictionary> <work dir> \
        own=<transforms file> yomitan=<file> union=<file> final=<file>

For each rule set it runs `hoshidicts-cli eval-language --transforms <file>
--dictionary <dictionary>` on the sample (tests/corpus.tsv and the sampled
rows of tests/gaps.tsv together), tests/cases.tsv, tests/defaults.tsv and
tests/yomitan.tsv, each as committed and in a copy with the
`# options: default` line added (or, for defaults.tsv, removed). The copies
and the joined sample are written to the work directory. Prints one
tab-separated line per rule set, file and mode: recall, negatives passed,
false candidates and first rank.
"""
import json
import os
import subprocess
import sys

cli, languages, dictionary, work = sys.argv[1:5]
sets = [arg.split('=', 1) for arg in sys.argv[5:]]
tests = os.path.join(languages, 'eo', 'tests')
OPTIONS = '# options: default\n'


def body(path):
    return ''.join(line for line in open(path, encoding='utf-8') if not line.startswith('#'))


def write(name, text):
    path = os.path.join(work, name)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    return path


gaps_sampled = ''.join(line for line in body(os.path.join(tests, 'gaps.tsv')).splitlines(True)
                       if line.split('\t')[0].endswith(('(frequent)', '(any)')))
sample = body(os.path.join(tests, 'corpus.tsv')) + gaps_sampled
files = {
    'sample': (write('eval-sample.tsv', sample), write('eval-sample-default.tsv', OPTIONS + sample)),
    'cases': (write('eval-cases.tsv', body(os.path.join(tests, 'cases.tsv'))),
              write('eval-cases-default.tsv', OPTIONS + body(os.path.join(tests, 'cases.tsv')))),
    'defaults': (write('eval-defaults-all.tsv', body(os.path.join(tests, 'defaults.tsv'))),
                 write('eval-defaults.tsv', OPTIONS + body(os.path.join(tests, 'defaults.tsv')))),
    'yomitan': (write('eval-yomitan.tsv', body(os.path.join(tests, 'yomitan.tsv'))),
                write('eval-yomitan-default.tsv', OPTIONS + body(os.path.join(tests, 'yomitan.tsv')))),
}


def fmt(value, percent=True):
    if value is None:
        return '-'
    return f'{value * 100:.1f}%' if percent else f'{value:.3f}'


print('set\tfile\tmode\trows\trecall\tnegatives passed\tfalse candidates\tfirst rank')
for name, transforms in sets:
    for file, (all_on, default) in files.items():
        for mode, path in (('all options', all_on), ('defaults', default)):
            out = subprocess.run([cli, '--languages', languages, 'eval-language', 'eo', path, '--transforms', transforms,
                                  '--dictionary', dictionary], capture_output=True, text=True, check=True).stdout
            d = json.loads(out)
            print(f"{name}\t{file}\t{mode}\t{d['rows']}\t{fmt(d['recall'])}\t{fmt(d['negativesPassed'])}\t"
                  f"{fmt(d.get('falseCandidates'), False)}\t{fmt(d.get('firstRank'))}", flush=True)
