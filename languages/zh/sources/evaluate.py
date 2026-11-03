#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The eval-language table of README.md (Measurements 1).

    python3 languages/zh/sources/evaluate.py --dictionary <imported> [--dictionary <imported>] \
        [--first <own.json of the first own rules>] [--cli build/hoshidicts-cli] [--per-rule]

For each rule set (the final transforms.json; with --first, also that file,
run on copies of the test files whose rule column is *, as the first own
rules had no conditions),
each test file (tests/corpus.tsv with tests/gaps.tsv, cases.tsv,
defaults.tsv, each as it is and as a copy with its "# options: default" line
added or removed), each dictionary and both values of lookup.untaggedTerms
(the pack's "pass" and a copy with "filter"), it runs hoshidicts-cli
eval-language and prints one Markdown table row: recall, negatives passed,
false candidates per row and first rank. Yomitan has no Chinese rules, so
there is no Yomitan or union row: the union is the own rules.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PACK))
OPTIONS_LINE = '# options: default'


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read().splitlines()


def test_files(tmp):
    """(name, path) of each test file as it is and with its mode flipped."""
    corpus = read(os.path.join(PACK, 'tests', 'corpus.tsv'))
    gaps = [l for l in read(os.path.join(PACK, 'tests', 'gaps.tsv')) if not l.startswith('#')]
    files = {
        'corpus+gaps': corpus + gaps,
        'cases': read(os.path.join(PACK, 'tests', 'cases.tsv')),
        'defaults': read(os.path.join(PACK, 'tests', 'defaults.tsv')),
    }
    out = []
    for name, lines in files.items():
        default = bool(lines) and lines[0] == OPTIONS_LINE
        flipped = lines[1:] if default else [OPTIONS_LINE] + lines
        for mode, content in ((('defaults' if default else 'all options'), lines),
                              (('all options' if default else 'defaults'), flipped)):
            path = os.path.join(tmp, f'{name}-{mode.replace(" ", "-")}.tsv')
            with open(path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(content) + '\n')
            out.append((name, mode, path))
    return out


def without_conditions(path):
    """A copy of a test file whose rule column is * (the first own rules had no conditions)."""
    out = path.replace('.tsv', '-any.tsv')
    with open(path, encoding='utf-8') as f, open(out, 'w', encoding='utf-8') as g:
        for line in f:
            cells = line.rstrip('\n').split('\t')
            if not line.startswith('#') and len(cells) == 6:
                cells[4] = '*'
            g.write('\t'.join(cells) + '\n')
    return out


def languages_with(tmp, untagged):
    """A languages directory whose zh pack has lookup.untaggedTerms = untagged."""
    d = os.path.join(tmp, f'languages-{untagged}')
    if not os.path.isdir(d):
        shutil.copytree(PACK, os.path.join(d, 'zh'), ignore=shutil.ignore_patterns('sources'))
        path = os.path.join(d, 'zh', 'language.json')
        with open(path, encoding='utf-8') as f:
            language = json.load(f)
        language['lookup']['untaggedTerms'] = untagged
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(language, f, ensure_ascii=False, indent=2)
    return d


def evaluate(cli, languages, path, dictionary, transforms, per_rule):
    args = [cli, '--languages', languages, 'eval-language', 'zh', path, '--dictionary', dictionary]
    if transforms:
        args += ['--transforms', transforms]
    if per_rule:
        args.append('--per-rule')
    out = subprocess.run(args, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def pct(x):
    return '–' if x is None else f'{100 * x:.2f}%'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dictionary', action='append', required=True)
    parser.add_argument('--first')
    parser.add_argument('--cli', default=os.path.join(REPO, 'build', 'hoshidicts-cli'))
    parser.add_argument('--per-rule', action='store_true')
    args = parser.parse_args()
    rule_sets = [('final', None)] + ([('first own rules', os.path.abspath(args.first))] if args.first else [])
    tmp = tempfile.mkdtemp(prefix='zh-evaluate-')
    try:
        files = test_files(tmp)
        print('| Rules | File | Options | Dictionary | untaggedTerms | Rows | Recall | Negatives passed | False candidates | First rank |')
        print('| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |')
        for rules, transforms in rule_sets:
            for name, mode, path in files:
                for dictionary in args.dictionary:
                    for untagged in ('pass', 'filter'):
                        source = without_conditions(path) if transforms else path
                        r = evaluate(args.cli, languages_with(tmp, untagged), source, dictionary, transforms, args.per_rule)
                        print(f'| {rules} | {name} | {mode} | {os.path.basename(dictionary)} | {untagged} | {r["rows"]} | '
                              f'{pct(r.get("recall"))} | {pct(r.get("negativesPassed"))} | '
                              f'{r.get("falseCandidates", 0):.3f} | {pct(r.get("firstRank"))} |')
                        if args.per_rule and rules == 'final' and untagged == 'pass' and name == 'corpus+gaps':
                            with open(os.path.join(tmp, '..', f'zh-per-rule-{os.path.basename(dictionary)}.json'), 'w') as f:
                                json.dump(r.get('perRule', r), f, ensure_ascii=False)
                        sys.stdout.flush()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
