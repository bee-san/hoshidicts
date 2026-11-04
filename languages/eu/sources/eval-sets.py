#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The README's eval-language table (Measurements 1).

    python3 languages/eu/sources/eval-sets.py <imported dictionary> [--cli build/hoshidicts-cli] [--work <dir>]

For each rule set (own: sources/own.json, Yomitan: sources/yomitan.json, the
union written by tools/merge-transforms.mjs, and the final transforms.json)
and each test file (corpus.tsv with gaps.tsv, which is the whole sample, and
cases.tsv, as written and with every expected trace replaced by *, since
Yomitan's transforms have other ids), runs `hoshidicts-cli eval-language
--dictionary` in four modes:
every option on (the files as they are) and the pack's defaults (a copy with
`# options: default` as its first line), each with the pack's
`lookup.untaggedTerms` ("filter") and with "pass" (a scratch copy of the pack
under <work>). The pack has no optional feature, so both option modes give
the same numbers. Prints one JSON line per run.
"""

import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(PACK))


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    dictionary = argv[0]
    cli = argv[argv.index('--cli') + 1] if '--cli' in argv else os.path.join(ROOT, 'build', 'hoshidicts-cli')
    work = argv[argv.index('--work') + 1] if '--work' in argv else os.path.join(ROOT, 'build', 'eu-eval')
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    union = os.path.join(work, 'union.json')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'merge-transforms.mjs'), 'eu', '--out', union, '--force'], check=True,
                   capture_output=True)
    sets = {'own': os.path.join(PACK, 'sources', 'own.json'), 'yomitan': os.path.join(PACK, 'sources', 'yomitan.json'),
            'union': union, 'final': os.path.join(PACK, 'transforms.json')}

    def body(name):
        with open(os.path.join(PACK, 'tests', name), encoding='utf-8') as f:
            return [line for line in f if not line.startswith('#')]

    def any_trace(rows):
        return ['\t'.join(r.rstrip('\n').split('\t')[:5] + ['*']) + '\n' for r in rows]

    files = {'sample (corpus + gaps)': body('corpus.tsv') + body('gaps.tsv'), 'cases': body('cases.tsv'),
             'cases-any-trace': any_trace(body('cases.tsv'))}
    header = '# category\tvalid\tsource\tterm\trule\treasons\n'
    paths = {}
    for name, rows in files.items():
        for mode in ('all', 'default'):
            path = os.path.join(work, f'{name.split()[0]}-{mode}.tsv')
            with open(path, 'w', encoding='utf-8') as f:
                f.write(('# options: default\n' if mode == 'default' else '') + header + ''.join(rows))
            paths[(name, mode)] = path

    # A copy of the pack with untaggedTerms "pass".
    languages_pass = os.path.join(work, 'languages-pass')
    shutil.copytree(PACK, os.path.join(languages_pass, 'eu'))
    descriptor = os.path.join(languages_pass, 'eu', 'language.json')
    with open(descriptor, encoding='utf-8') as f:
        d = json.load(f)
    d['lookup']['untaggedTerms'] = 'pass'
    with open(descriptor, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    for untagged, languages in (('filter', os.path.dirname(PACK)), ('pass', languages_pass)):
        for set_name, transforms in sets.items():
            for (name, mode), path in paths.items():
                out = subprocess.run([cli, '--languages', languages, 'eval-language', 'eu', path, '--transforms', transforms,
                                      '--dictionary', dictionary], capture_output=True, text=True, check=True)
                result = json.loads(out.stdout)
                print(json.dumps({'set': set_name, 'file': name, 'options': mode, 'untaggedTerms': untagged,
                                  **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in result.items() if k != 'options'}}))


if __name__ == '__main__':
    main(sys.argv[1:])
