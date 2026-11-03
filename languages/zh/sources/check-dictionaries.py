#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The dictionary facts of README.md: why lookup.untaggedTerms is "pass" and
why CC-CEDICT is recommended before wty-zh-en.

    python3 languages/zh/sources/check-dictionaries.py --dictionary CC-CEDICT.zip --dictionary wty-zh-en.zip \\
        --frequency zh_cn_50k.txt [--top 300]

For each Yomitan dictionary zip it reads every term bank and prints the term
rows, the rows whose rules column (the part of speech the lookup filter reads)
is not empty, the rows with an empty rules column grouped by their first
definition tag (docs/languages.md 14 step 5), and the rows whose definitions
are all form-of references ([term, [rules]]). Then, for the --top most frequent one-character Han words
of the frequency list, how each dictionary has them: a row of their own with
definitions, only form-of rows that reach the character's traditional form
(the simplifiedToTraditional map of language.json), only form-of rows that
reach other characters, or no row.
"""
import argparse, collections, json, os, re, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
HAN = re.compile(r'[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\U00020000-\U0003FFFF]$')


def rows(path):
    with zipfile.ZipFile(path) as z:
        for name in sorted(z.namelist()):
            if re.fullmatch(r'term_bank_\d+\.json', os.path.basename(name)):
                yield from json.loads(z.read(name))


def traditional_forms():
    """Simplified character -> its traditional forms, from the optional processor."""
    language = json.load(open(os.path.join(PACK, 'language.json'), encoding='utf-8'))
    forms = collections.defaultdict(set)
    for p in language['lookup']['preprocessors']:
        if p['id'] == 'simplifiedToTraditional':
            for variant in p['variants']:
                for step in variant:
                    for k, v in step.get('map', {}).items():
                        if len(k) == 1:
                            forms[k].update(v if isinstance(v, list) else [v])
    return forms


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dictionary', action='append', required=True)
    parser.add_argument('--frequency', required=True)
    parser.add_argument('--top', type=int, default=300)
    args = parser.parse_args()

    top = []
    for line in open(args.frequency, encoding='utf-8'):
        w = line.rsplit(' ', 1)[0]
        if len(w) == 1 and HAN.match(w):
            top.append(w)
            if len(top) == args.top:
                break
    wanted = set(top)
    forms = traditional_forms()

    for path in args.dictionary:
        total = tagged = form_of = 0
        own, targets = set(), collections.defaultdict(set)
        untagged_by_tag = collections.Counter()
        for r in rows(path):
            total += 1
            if r[3].strip():
                tagged += 1
            else:
                untagged_by_tag[(r[2].split() or ['(none)'])[0]] += 1
            references = [d for d in r[5] if isinstance(d, list)]
            only_references = bool(references) and len(references) == len(r[5])
            form_of += only_references
            if r[0] in wanted:
                if only_references:
                    targets[r[0]].update(d[0] for d in references)
                else:
                    own.add(r[0])
        print(f'{os.path.basename(path)}: {total} term rows, {tagged} with a rules value, '
              f'{form_of} with only form-of references')
        print('  rows without a rules value, by first definition tag: '
              + ', '.join(f'{tag} {n}' for tag, n in untagged_by_tag.most_common(12)))
        groups = collections.defaultdict(list)
        for c in top:
            if c in own:
                groups['own row'].append(c)
            elif targets[c] & forms.get(c, set()):
                groups['form-of to its traditional form'].append(c)
            elif targets[c]:
                groups['form-of to other characters only'].append(c)
            else:
                groups['no row'].append(c)
        print(f'  the {len(top)} most frequent one-character words of {os.path.basename(args.frequency)}:')
        for name in ('own row', 'form-of to its traditional form', 'form-of to other characters only', 'no row'):
            chars = groups[name]
            examples = ' '.join(f'{c}→{"/".join(sorted(targets[c]))}' if name.startswith('form-of to other') else c
                                for c in chars[:12])
            print(f'    {name}: {len(chars)}' + (f' ({examples})' if chars else ''))


if __name__ == '__main__':
    main()
