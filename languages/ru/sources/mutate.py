#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The mutation check of docs/languages.md section 14 step 7: in a scratch copy
of the pack, remove one kind of stem constraint from the rows of one transform
(or one generator decision listed in EXTRA below), write tests/classes.json
again and run language-conformance-test on the copy. A mutant that still
conforms is a constraint no test needs.

  python3 languages/ru/sources/mutate.py --conformance build/language-conformance-test
      [--pack languages/ru] [--scratch <dir>] [--only <substring>]

Prints one line per mutant: `caught` or `SURVIVES`, and a summary. The pack has
no word lists, so every mutant is a constraint.
"""

import argparse
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PACK = os.path.join(ROOT, 'languages', 'ru')
# stemChange is left out: in this pack it only marks the rows that read a stem's
# last е as ё, which are rules, not constraints (README.md, Measurements).
KEYS = ['stemMinLength', 'stemEndsWith', 'stemNotStartsWith', 'stemNotStartsWithText', 'stemCharacters']


def mutants(transforms):
    """(name, mutated transforms) for every transform and constraint kind its rows use."""
    for i, t in enumerate(transforms['transforms']):
        present = [k for k in KEYS if any(k in r for r in t['rules'])]
        for key in present:
            m = copy.deepcopy(transforms)
            for r in m['transforms'][i]['rules']:
                r.pop(key, None)
            yield f"{t['id']} without {key}", m


def run(mutant, pack, scratch, conformance):
    work = tempfile.mkdtemp(dir=scratch)
    try:
        shutil.copytree(pack, os.path.join(work, 'ru'))
        with open(os.path.join(work, 'ru', 'transforms.json'), 'w', encoding='utf-8') as f:
            json.dump(mutant, f, ensure_ascii=False, indent=1)
        w = subprocess.run(['node', os.path.join(ROOT, 'tools', 'check-classes.mjs'), 'ru', '--write', '--languages', work],
                           capture_output=True, text=True)
        if w.returncode != 0:
            return 'invalid', w.stderr.strip().splitlines()[-1:]
        c = subprocess.run([conformance, os.path.join(work, 'ru'), work], capture_output=True, text=True)
        fails = [l for l in c.stdout.splitlines() + c.stderr.splitlines() if l.startswith('FAIL')]
        return ('caught' if c.returncode != 0 else 'SURVIVES'), fails[:2]
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--conformance', required=True)
    p.add_argument('--scratch', default=tempfile.gettempdir())
    p.add_argument('--only', default='')
    p.add_argument('--pack', default=PACK)
    a = p.parse_args()
    transforms = json.load(open(os.path.join(a.pack, 'transforms.json'), encoding='utf-8'))
    counts = {}
    for name, m in mutants(transforms):
        if a.only not in name:
            continue
        verdict, detail = run(m, a.pack, a.scratch, a.conformance)
        counts[verdict] = counts.get(verdict, 0) + 1
        print(f'{verdict}\t{name}\t{" | ".join(detail)}', flush=True)
    print(json.dumps(counts))


if __name__ == '__main__':
    main()
