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
# pack passes and the mutant fails (a reading the mutant adds to a probe's
# deinflections, a headword when one exists) and lists the readings it
# removes. The probes are the given words and inputs built from the mutated
# rules' own affixes on a few stems (constructed()).
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
        out[d['input']] = {(r['text'], tuple(r['conditions'])) for r in d['results']}
    return out


# Stems for the constructed probes: none, one letter of each kind, the stems
# the constraints are about (a space, a hushing consonant before ч, the
# alternating о/е/ьо before a consonant) and two ordinary ones.
STEMS = ['', 'б', 'а', 'ж', 'ш', 'н', 'р', 'т', 'ст', 'дорож', 'кот', 'стол', 'льод', 'вертольот', 'чит', 'біл', 'на б', 'не ст']


def constructed(rules):
    """Inputs built from the mutated rules' affixes on STEMS."""
    out = []
    for rule in rules:
        pairs = [(p, s) for p, _ in rule.get('prefixes', [['', '']]) for s, _ in rule.get('suffixes', [])] if 'suffixes' in rule else \
            [('', rule.get('inflected', ''))] if rule['type'] in ('suffix', 'wholeWord') else \
            [(rule.get('inflected', ''), '')] if rule['type'] == 'prefix' else [(rule.get('inflectedPrefix', ''), rule.get('inflectedSuffix', ''))]
        for prefix, suffix_ in pairs:
            out += [prefix + stem + suffix_ for stem in STEMS]
    return out


def suggest(names, transforms, probes, headwords, tmp):
    """For each named mutant, the probes whose deinflections (text and conditions) it changes: a
    negative row for a reading it adds (the text, with a condition the original never gives it there,
    preferring a headword), and the readings it removes, from which a positive row is chosen by hand."""
    base_file = os.path.join(tmp, 'base.json')
    json.dump(transforms, open(base_file, 'w', encoding='utf-8'), ensure_ascii=False)
    by_name = {name: (ti, rules, key) for name, ti, rules, key in mutants(transforms)}
    extra = sorted({w for name in names for w in constructed([transforms['transforms'][by_name[name][0]]['rules'][r] for r in by_name[name][1]]) if w.strip()})
    probes = list(dict.fromkeys(list(probes) + extra))
    base = deinflections(base_file, probes)
    rows = []
    for name in names:
        ti, rules, key = by_name[name]
        f = os.path.join(tmp, 'mutant.json')
        json.dump(apply(transforms, ti, rules, key), open(f, 'w', encoding='utf-8'), ensure_ascii=False)
        got = deinflections(f, probes)
        best = None
        removed = []
        for text in probes:
            before, after = base.get(text, set()), got.get(text, set())
            for term, conditions in sorted(after - before):
                known = {c for t, cs in before if t == term for c in cs}
                new = [c for c in conditions if c not in known] or ['*']
                if conditions == () and any(t == term for t, _ in before):
                    continue
                score = (term in headwords, -len(text))
                if best is None or score > best[0]:
                    best = (score, text, term, new[0] if known else '*')
            for term, conditions in sorted(before - after):
                if not any(t == term and set(conditions) <= set(cs) for t, cs in after):
                    removed.append(f'{text}→{term} {"|".join(conditions)}')
        if best:
            rows.append(f'constraint\t0\t{best[1]}\t{best[2]}\t{best[3]}\t*\t# {name}{" (headword)" if best[0][0] else ""}')
        if removed:
            rows.append(f'# {name} removes {len(removed)}: ' + '; '.join(removed[:6]))
        if not best and not removed:
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
        source = args[args.index('--transforms') + 1] if '--transforms' in args else os.path.join(PACK, 'transforms.json')
        transforms = json.load(open(source, encoding='utf-8'))
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
