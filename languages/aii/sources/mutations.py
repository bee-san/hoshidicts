#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation checks for the aii pack (docs/languages.md, section 14 step 7).

    python3 languages/aii/sources/mutations.py <scratch dir> [--only name,...]

Each mutation edits a copy of languages/aii/transforms.json in
<scratch dir>/<name>/aii/: it deletes one stem constraint from every rule of
one transform that has it, loosens one pattern, adds back a letter the rules
leave out, or drops the conditions that keep chains short. For each, the
script writes the copy's tests/classes.json (tools/check-classes.mjs
--write) and runs build/language-conformance-test on it. A mutation that
every test still passes is a "survivor": either a row is missing, or the
edit changes nothing the tests can see (the README lists those). The
identity mutation (no edit) must survive.
"""
import argparse
import copy
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / 'languages' / 'aii'
CONSTRAINTS = ['stemMinLength', 'stemCharacters', 'stemContains', 'stemStartsWith', 'stemEndsWith',
               'stemNotStartsWith', 'stemNotEndsWith', 'stemStartsWithText', 'stemNotStartsWithText']
NODE = str(Path.home() / '.local/share/mise/installs/node/22.23.1/bin/node')


def mutations(t):
    """(name, function editing a transforms object) pairs."""
    out = [('identity', lambda x: None)]
    for tr in t['transforms']:
        keys = sorted({k for r in tr['rules'] for k in r if k in CONSTRAINTS})
        for k in keys:
            def edit(x, tid=tr['id'], key=k):
                for tt in x['transforms']:
                    if tt['id'] == tid:
                        for r in tt['rules']:
                            r.pop(key, None)
            out.append((f'{tr["id"]}:-{k}', edit))
        if any(r.get('stemMinLength', 0) > 1 for r in tr['rules']):
            def lower(x, tid=tr['id']):
                for tt in x['transforms']:
                    if tt['id'] == tid:
                        for r in tt['rules']:
                            if r.get('stemMinLength', 0) > 1:
                                r['stemMinLength'] -= 1
            out.append((f'{tr["id"]}:stemMinLength-1', lower))
    # The -ē endings and participle: any stem instead of a verb-shaped one.
    def loose_weak(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if r['type'] == 'pattern' and r.get('replacement') == '$1ܐ' and r['pattern'].startswith('^(['):
                    end = r['pattern'][r['pattern'].index(')') + 1:]
                    r['pattern'] = '^([\\u0710-\\u072C]{2,})' + end
    out.append(('weakStem:any', loose_weak))
    # The strong pointed pattern: ܝ allowed as the middle radical.
    def middle_yod(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if r['type'] == 'pattern':
                    r['pattern'] = r['pattern'].replace('\\u071E-\\u072C', '\\u071D-\\u072C')
    out.append(('pointed:middleYod', middle_yod))
    # The pointed patterns: any vowel instead of zqapha after the first radical.
    def any_vowel(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if r['type'] == 'pattern' and '\\u0735' in r['pattern'] and r['pattern'].count('\\u0735') >= 1:
                    r['pattern'] = r['pattern'].replace('*\\u0735[', '*[\\u0730-\\u073F][', 1)
    out.append(('pointed:anyVowel', any_vowel))
    # The Stem III imperative: a stem of any length.
    def imp_any(x):
        for tt in x['transforms']:
            if tt['id'] == 'imperativeM':
                for r in tt['rules']:
                    if r['type'] == 'pattern':
                        r['pattern'] = r['pattern'].replace('{2,4}?', '+?').replace('{2,3}', '+')
    out.append(('imperativeM:anyLength', imp_any))
    # ܐ as a last radical of the strong past base, participle and imperative.
    def alaph_radical(x):
        for tt in x['transforms']:
            if tt['id'] in ('pastBase', 'passiveParticiple', 'imperative', 'hollow') or tt['id'].startswith('past') and len(tt['id']) <= 7:
                extra = []
                for r in tt['rules']:
                    if r['type'] == 'suffix' and 'ܒ' in r['inflected'] and r['deinflected'].endswith('ܒ'):
                        rr = copy.deepcopy(r)
                        rr['inflected'] = r['inflected'].replace('ܒ', 'ܐ')
                        rr['deinflected'] = r['deinflected'][:-1] + 'ܐ'
                        extra.append(rr)
                tt['rules'].extend(extra)
    out.append(('radicals:+alaph', alaph_radical))
    # No conditions: every rule takes any text and gives one.
    def no_conditions(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                r['conditionsIn'] = []
                r['conditionsOut'] = []
    out.append(('conditions:none', no_conditions))
    # Conditions kept on outputs, but every rule takes every text.
    def open_inputs(x):
        names = [c for c in x['conditions']]
        for tt in x['transforms']:
            for r in tt['rules']:
                r['conditionsIn'] = names
    out.append(('conditions:anyInput', open_inputs))
    # The L-suffix outputs are not verbs: noun rules may read them.
    def lsuf_open(x):
        for tt in x['transforms']:
            if tt['id'] in ('l1s', 'l2ms', 'l2fs', 'l3s', 'l1p', 'l2p', 'l3p', 'lJoined'):
                for r in tt['rules']:
                    r['conditionsOut'] = []
    out.append(('lsuffix:noCondition', lsuf_open))
    # Each optional transform made non-optional (defaults.tsv must notice).
    for tid in ('lJoined', 'pastBaseUrmia'):
        def required(x, tid=tid):
            for tt in x['transforms']:
                if tt['id'] == tid:
                    tt.pop('optional', None)
        out.append((f'{tid}:notOptional', required))
    # The Stem II imperative before the noun rules.
    def imp2_first(x):
        ts = x['transforms']
        i = next(i for i, tt in enumerate(ts) if tt['id'] == 'imperativeII')
        tt = ts.pop(i)
        j = next(i for i, t2 in enumerate(ts) if t2['id'] == 'poss1s')
        ts.insert(j, tt)
    out.append(('imperativeII:beforeNouns', imp2_first))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scratch')
    ap.add_argument('--only')
    args = ap.parse_args()
    base = json.loads((PACK / 'transforms.json').read_text(encoding='utf-8'))
    only = set(args.only.split(',')) if args.only else None
    survivors = []
    for name, edit in mutations(base):
        if only and name not in only:
            continue
        safe = name.replace(':', '_').replace('/', '_')
        target = Path(args.scratch) / safe
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(PACK, target / 'aii')
        t = copy.deepcopy(base)
        edit(t)
        if name != 'identity' and t == base:
            print(f'{name}: no change (skipped)')
            continue
        (target / 'aii' / 'transforms.json').write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        w = subprocess.run([NODE, str(ROOT / 'tools/check-classes.mjs'), 'aii', '--write', '--languages', str(target)],
                           capture_output=True, text=True)
        if w.returncode != 0:
            print(f'{name}: KILLED (classes: {w.stderr.strip()[:200]})')
            continue
        r = subprocess.run([str(ROOT / 'build/language-conformance-test'), str(target / 'aii')], capture_output=True, text=True)
        fails = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith('FAIL')]
        if r.returncode == 0:
            survivors.append(name)
            print(f'{name}: SURVIVED')
        else:
            print(f'{name}: killed by {len(fails)} failures, e.g. {fails[0][:160] if fails else (r.stdout + r.stderr)[-200:]}')
        shutil.rmtree(target)
    print(f'survivors: {survivors}')


if __name__ == '__main__':
    main()
