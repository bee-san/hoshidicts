#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Writes sources/yomitan-removed.tsv, the Yomitan rules build-final.mjs leaves
# out (README, Rule provenance):
#
#   python3 languages/uk/sources/select-removals.py <measure.tsv> <wty-uk-en imported> [--rounds 3]
#
# <measure.tsv> is the measurement set: every form of the kaikki tables
# (`build-corpus.mjs <kaikki> --all <file>`), then tests/cases.tsv and
# Yomitan's test with any trace. The union of own.json and yomitan.json is
# written with one entry per Yomitan rule (cross products split), and
# `hoshidicts-cli eval-language --per-rule` counts for each rule the rows
# only it recovers, the false candidates only it adds and the negatives it
# breaks. A Yomitan rule is left out when it breaks a negative, when it adds
# false candidates and recovers nothing, or when it adds at least 5 false
# candidates and more than three for each row it recovers. The Yomitan rules are measured as build-final.mjs writes them,
# each limited to one word (stemCharacters {stem}). Removing rules changes the counts of the others (a candidate two
# rules make counts for neither), so the selection runs again on the rules
# left until no rule is removed, at most --rounds times.

import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CLI = os.path.join(ROOT, 'build', 'hoshidicts-cli')


def expand(rule):
    if rule.get('type') == 'circumfix' and 'suffixes' in rule:
        rest = {k: v for k, v in rule.items() if k not in ('type', 'prefixes', 'suffixes')}
        return [{'type': 'circumfix', 'inflectedPrefix': p, 'deinflectedPrefix': dp, 'inflectedSuffix': s, 'deinflectedSuffix': ds, **rest}
                for p, dp in rule['prefixes'] for s, ds in rule['suffixes']]
    return [rule]


def key(rule):
    """transform-independent (inflected, deinflected), as build-final.mjs names a rule."""
    t = rule['type']
    if t in ('suffix', 'prefix', 'wholeWord'):
        return rule['inflected'], rule['deinflected']
    if rule.get('stemCharacters') == '[]':
        return rule['inflectedPrefix'] + rule['inflectedSuffix'], rule['deinflectedPrefix'] + rule['deinflectedSuffix']
    if rule['inflectedPrefix'] == '' and rule['deinflectedPrefix'] == '':
        return rule['inflectedSuffix'], rule['deinflectedSuffix']
    return rule['inflectedPrefix'] + '…' + rule['inflectedSuffix'], rule['deinflectedPrefix'] + '…' + rule['deinflectedSuffix']


def detail(rule):
    """What else tells a rule apart from another with the same affixes; build-final.mjs computes the same."""
    parts = []
    if 'stemChange' in rule:
        parts.append('change ' + '|'.join(rule['stemChange']['from']) + '>' + rule['stemChange']['to'])
    if rule.get('stemMinLength'):
        parts.append(f"min {rule['stemMinLength']}")
    if 'stemEndsWith' in rule:
        parts.append('ends ' + rule['stemEndsWith'])
    if 'stemContains' in rule:
        parts.append('has ' + rule['stemContains'])
    parts.append('in ' + ','.join(rule['conditionsIn']) + ' out ' + ','.join(rule['conditionsOut']))
    return '; '.join(parts)


def main():
    args = sys.argv[1:]
    rounds = 3
    if '--rounds' in args:
        i = args.index('--rounds')
        rounds = int(args[i + 1])
        del args[i:i + 2]
    measure, dictionary = args
    own = json.load(open(os.path.join(HERE, 'own.json'), encoding='utf-8'))
    yomitan = json.load(open(os.path.join(HERE, 'yomitan.json'), encoding='utf-8'))
    for t in yomitan['transforms']:
        t['rules'] = [r for rule in t['rules'] for r in expand(rule)]
        # As build-final.mjs writes them: a Yomitan rule reads one word.
        for r in t['rules']:
            if r['type'] in ('suffix', 'prefix', 'circumfix') and 'stemCharacters' not in r:
                r['stemCharacters'] = '{stem}'
    removed = []
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'union.json')
        for round_ in range(rounds):
            conditions = {**yomitan['conditions'], **own['conditions']}
            union = {'schema': 1, 'conditions': conditions, 'transforms': own['transforms'] + yomitan['transforms']}
            json.dump(union, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
            out = subprocess.run([CLI, '--languages', os.path.join(ROOT, 'languages'), 'eval-language', 'uk', measure,
                                  '--transforms', path, '--dictionary', dictionary, '--per-rule'],
                                 capture_output=True, text=True, encoding='utf-8', check=True).stdout
            stats = {(e['transform'], e['rule']): e for e in json.loads(out)['perRule']}
            n = 0
            for t in yomitan['transforms']:
                keep = []
                for i, rule in enumerate(t['rules']):
                    e = stats[(t['id'], i)]
                    if e['breaks'] > 0 or (e['falseCandidates'] > 0 and e['recovers'] == 0) or (e['falseCandidates'] >= 5 and e['falseCandidates'] > 3 * e['recovers']):
                        why = 'breaks' if e['breaks'] > 0 else 'fc only' if e['recovers'] == 0 else 'fc'
                        removed.append((t['id'], *key(rule), detail(rule), e['recovers'], e['falseCandidates'], e['breaks'], f'{why}, round {round_ + 1}'))
                        n += 1
                    else:
                        keep.append(rule)
                t['rules'] = keep
            print(f'round {round_ + 1}: {n} rules removed', file=sys.stderr)
            if n == 0:
                break
    with open(os.path.join(HERE, 'yomitan-removed.tsv'), 'w', encoding='utf-8') as f:
        f.write('# Yomitan rules transforms.json leaves out, written by sources/select-removals.py.\n')
        f.write('# reason: breaks (a negative), fc (more than three false candidates per row recovered), fc only (false candidates, nothing recovered).\n')
        f.write('# transform\tinflected\tdeinflected\trule\trecovers\tfalseCandidates\tbreaks\treason\n')
        for row in sorted(removed):
            f.write('\t'.join(map(str, row)) + '\n')
    print(f'{len(removed)} rules in sources/yomitan-removed.tsv', file=sys.stderr)


if __name__ == '__main__':
    main()
