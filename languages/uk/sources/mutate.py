#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# The checks of docs/languages.md 14 step 7: in scratch copies of the pack,
# delete each stem constraint and exclusion of the own rules, rewrite
# tests/classes.json and run language-conformance-test; a mutant no test
# catches is printed (README, Measurements 7).
#
#   python3 languages/uk/sources/mutate.py [--jobs 8] [--only <transform id prefix>] > report
#   python3 languages/uk/sources/mutate.py --suggest report <probe words> <headwords>
#
# --suggest proposes, for each mutant that survives, a negative row the
# pack passes and the mutant fails (a text the mutant adds to a probe
# word's deinflections, a headword when one exists).
#
# One mutant per transform and constraint: the constraint deleted from every
# rule of the transform that has it (stemMinLength lowered by one, the
# others removed), plus the exclusions named in EXTRA. Nothing is written
# outside a temporary directory.

import concurrent.futures, copy, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(PACK, '..', '..'))
NODE = shutil.which('node')
CONSTRAINTS = ['stemMinLength', 'stemCharacters', 'stemEndsWith', 'stemNotEndsWith', 'stemContains', 'stemChange', 'stemStartsWith',
               'stemNotStartsWith', 'stemStartsWithText', 'stemNotStartsWithText']


def mutants(transforms):
    out = []
    for ti, t in enumerate(transforms['transforms']):
        if t.get('source') == 'yomitan':
            continue
        for key in CONSTRAINTS:
            rules = [ri for ri, r in enumerate(t['rules']) if key in r and (r.get('source', t.get('source')) != 'yomitan')]
            if key == 'stemCharacters':
                rules = [ri for ri in rules if t['rules'][ri][key] != '[]']
            if not rules:
                continue
            out.append((f'{t["id"]}: {key}', ti, rules, key))
    return out


def apply(transforms, ti, rules, key):
    m = copy.deepcopy(transforms)
    for ri in rules:
        r = m['transforms'][ti]['rules'][ri]
        if key == 'stemMinLength':
            r[key] -= 1
            if r[key] <= 0:
                del r[key]
        else:
            del r[key]
    return m


def run(name, mutant, tmp):
    work = tempfile.mkdtemp(dir=tmp)
    langs = os.path.join(work, 'languages')
    shutil.copytree(PACK, os.path.join(langs, 'uk'))
    with open(os.path.join(langs, 'uk', 'transforms.json'), 'w', encoding='utf-8') as f:
        json.dump(mutant, f, ensure_ascii=False)
    w = subprocess.run([NODE, os.path.join(ROOT, 'tools', 'check-classes.mjs'), 'uk', '--write', '--languages', langs],
                       capture_output=True, text=True)
    if w.returncode != 0:
        return name, 'check-classes failed: ' + w.stderr.strip()[:200]
    c = subprocess.run([os.path.join(ROOT, 'build', 'language-conformance-test'), os.path.join(langs, 'uk'), os.path.join(work, 'scratch')],
                       capture_output=True, text=True)
    shutil.rmtree(work, ignore_errors=True)
    if c.returncode == 0:
        return name, 'SURVIVES'
    fails = [l for l in c.stdout.splitlines() if l.startswith('FAIL')] or (c.stdout + c.stderr).strip().splitlines()[-1:] or ['exit status %d' % c.returncode]
    return name, 'caught: ' + fails[0][:140]


def deinflections(transforms_file, inputs):
    proc = subprocess.run([os.path.join(ROOT, 'build', 'hoshidicts-cli'), '--languages', os.path.join(ROOT, 'languages'), 'deinflect', 'uk',
                           '--stdin', '--all-options', '--transforms', transforms_file],
                          input='\n'.join(inputs) + '\n', capture_output=True, text=True, encoding='utf-8', check=True)
    out = {}
    for line in proc.stdout.splitlines():
        d = json.loads(line)
        out[d['input']] = {r['text'] for r in d['results']}
    return out


def suggest(names, transforms, probes, headwords, tmp):
    """For each named mutant, a negative row the original passes and the mutant fails: an input whose
    deinflections the mutant extends with a text the original never gives it, preferring a headword."""
    base_file = os.path.join(tmp, 'base.json')
    json.dump(transforms, open(base_file, 'w', encoding='utf-8'), ensure_ascii=False)
    base = deinflections(base_file, probes)
    by_name = {name: (ti, rules, key) for name, ti, rules, key in mutants(transforms)}
    rows = []
    for name in names:
        ti, rules, key = by_name[name]
        f = os.path.join(tmp, 'mutant.json')
        json.dump(apply(transforms, ti, rules, key), open(f, 'w', encoding='utf-8'), ensure_ascii=False)
        got = deinflections(f, probes)
        best = None
        for text in probes:
            added = got.get(text, set()) - base.get(text, set())
            for a in sorted(added):
                score = (a in headwords, -len(text))
                if best is None or score > best[0]:
                    best = (score, text, a)
        if best:
            rows.append(f'constraint\t0\t{best[1]}\t{best[2]}\t*\t*\t# {name}{" (headword)" if best[0][0] else ""}')
        else:
            rows.append(f'# no probe shows {name}')
    return rows


def main():
    args = sys.argv[1:]
    if '--suggest' in args:
        # --suggest <mutate output> <probe words file> <headwords file>: rows for the surviving mutants.
        i = args.index('--suggest')
        report, probes_file, headwords_file = args[i + 1:i + 4]
        names = [l.split('\t')[1] for l in open(report, encoding='utf-8') if l.startswith('SURVIVES')]
        probes = [l.strip() for l in open(probes_file, encoding='utf-8') if l.strip()]
        headwords = {l.strip() for l in open(headwords_file, encoding='utf-8')}
        transforms = json.load(open(os.path.join(PACK, 'transforms.json'), encoding='utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            for row in suggest(names, transforms, probes, headwords, tmp):
                print(row)
        return
    jobs = int(args[args.index('--jobs') + 1]) if '--jobs' in args else 8
    only = args[args.index('--only') + 1] if '--only' in args else ''
    # --transforms <file> mutates another rule file as the pack's transforms
    # (sources/own.json: the own rules without Yomitan's).
    source = args[args.index('--transforms') + 1] if '--transforms' in args else os.path.join(PACK, 'transforms.json')
    transforms = json.load(open(source, encoding='utf-8'))
    todo = [(name, apply(transforms, ti, rules, key)) for name, ti, rules, key in mutants(transforms) if name.startswith(only)]
    print(f'{len(todo)} mutants', file=sys.stderr)
    survivors = 0
    with tempfile.TemporaryDirectory() as tmp, concurrent.futures.ThreadPoolExecutor(jobs) as pool:
        for name, verdict in pool.map(lambda item: run(item[0], item[1], tmp), todo):
            if verdict == 'SURVIVES':
                survivors += 1
            print(f'{verdict == "SURVIVES" and "SURVIVES" or "caught"}\t{name}\t{verdict}')
    print(f'{survivors} of {len(todo)} mutants survive', file=sys.stderr)


if __name__ == '__main__':
    main()
