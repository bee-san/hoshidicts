#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The real-use measurements of README.md (Measurements 2-4).

    python3 languages/zh/sources/measure.py hovers <text file> [--tatoeba] > hovers.txt
    python3 languages/zh/sources/measure.py compare --dictionary <imported>[,<imported>] --hovers hovers.txt \
        [--base <languages dir>] [--with <languages dir>] [--exempt] [--out diffs.tsv]
    python3 languages/zh/sources/measure.py frequent --dictionary <imported> --frequency zh_cn_50k.txt [--top 10000]
        [--with <languages dir>] [--exempt]
    python3 languages/zh/sources/measure.py sample --files hovers-a.txt hovers-b.txt --counts 200 100 [--seed 1]

hovers: what a host looks up when the pointer is on each Han character of a
text, scanStart "cursor": the text from that character to the end of its
sentence (。！？!?… and line ends), at most 32 code points. --tatoeba reads
Tatoeba's sentences.tsv format (id, lang, text); --gutenberg a Project
Gutenberg text, whose wrapped lines it joins (Chinese joins lines without a
space).

compare: looks every hover text up with build/zh-lookup-batch twice, with the
pack of --base (default: a copy of languages/ without rules, transforms
null) and of --with (default: languages/), and prints how often the first
result differs, by the transforms of the --with result's trace. Each
difference is written to --out with the hover text and both first results,
for judging.

frequent: the --top most frequent words of a frequency list ("word count"
lines), each looked up alone as a host does. A word "reaches a lemma" when
the first result came through a rule (its trace is not empty). Prints those
words and their share of the list's tokens, and the words whose first result
is not the word itself.

sample: a seeded random sample of hover texts from each file, the input of
benchmark-lookup (the README's speed numbers).

--exempt passes --exempt to zh-lookup-batch: every dictionary is exempt from
the part-of-speech filter, which is what lookup.untaggedTerms "pass" gives
for dictionaries without rules tags.
"""
import argparse, collections, json, os, random, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PACK))
BATCH = os.path.join(REPO, 'build', 'zh-lookup-batch')

HAN = re.compile(r'[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\U00020000-\U0003FFFF]')
END = set('。！？!?…\n')


def hovers(lines, limit=32):
    for line in lines:
        line = line.rstrip('\n')
        for i, c in enumerate(line):
            if not HAN.match(c):
                continue
            j = i
            while j < len(line) and line[j] not in END and j - i < limit:
                j += 1
            yield line[i:j]


def no_rules_copy():
    """A languages directory whose zh pack has no rules."""
    d = tempfile.mkdtemp(prefix='zh-norules-')
    shutil.copytree(PACK, os.path.join(d, 'zh'), ignore=shutil.ignore_patterns('tests', 'sources'))
    path = os.path.join(d, 'zh', 'language.json')
    language = json.load(open(path, encoding='utf-8'))
    language['lookup']['transforms'] = None
    json.dump(language, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    os.remove(os.path.join(d, 'zh', 'transforms.json'))
    return d


def lookup(languages, dictionary, texts, exempt, max_results=4, options=None):
    args = [BATCH, languages, 'zh', dictionary, '--max-results', str(max_results)]
    if exempt:
        args.append('--exempt')
    if options:
        args += ['--options', options]
    out = subprocess.run(args, input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def rule_ids(languages):
    """The transform ids of the zh pack in a languages directory."""
    language = json.load(open(os.path.join(languages, 'zh', 'language.json'), encoding='utf-8'))
    name = language['lookup']['transforms']
    if not name:
        return set()
    return {t['id'] for t in json.load(open(os.path.join(languages, 'zh', name), encoding='utf-8'))['transforms']}


def rules_of(result, ids):
    return [t for t in result['trace'] if t in ids]


def first(result):
    """The first result with a definition (not a form-of row only)."""
    for r in result['results']:
        if not r['formOf']:
            return r
    return result['results'][0] if result['results'] else None


def gutenberg_lines(text):
    """The body of a Project Gutenberg text, its wrapped lines joined: one line
    per paragraph, a paragraph ending at a blank line before an indented line
    or at a line that ends a sentence."""
    start = text.find('*** START')
    end = text.find('*** END')
    body = text[text.find('\n', start) + 1:end]
    out = []
    for line in body.split('\n'):
        line = line.strip()
        if not line:
            continue
        out.append(line)
    joined = ''.join(out)
    return re.split(r'(?<=[。！？!?…])', joined)


def cmd_hovers(args):
    with open(args.text, encoding='utf-8') as f:
        if args.gutenberg:
            lines = gutenberg_lines(f.read())
        elif args.tatoeba:
            lines = (l.split('\t')[2] for l in f)
        else:
            lines = f
        for h in hovers(lines):
            print(h)


def cmd_sample(args):
    """A seeded sample of hover texts, one per line (sample <n> <hovers file>...)."""
    rng = random.Random(args.seed)
    out = []
    for path, n in zip(args.files, args.counts):
        texts = [l.rstrip('\n') for l in open(path, encoding='utf-8') if l.strip()]
        out += rng.sample(texts, n)
    print('\n'.join(out))


def cmd_compare(args):
    texts = [l.rstrip('\n') for l in open(args.hovers, encoding='utf-8') if l.strip()]
    base = args.base or no_rules_copy()
    with_dir = args.__dict__['with'] or os.path.join(REPO, 'languages')
    a = lookup(base, args.dictionary, texts, args.exempt, options=args.options)
    b = lookup(with_dir, args.dictionary, texts, args.exempt, options=args.options)
    ids = rule_ids(with_dir)
    by_transform = collections.Counter()
    rule_first = collections.Counter()
    diffs = []
    for text, ra, rb in zip(texts, a, b):
        fa, fb = first(ra), first(rb)
        if fb is not None and rules_of(fb, ids):
            rule_first['|'.join(rules_of(fb, ids))] += 1
        key_a = (fa['expression'], fa['matched']) if fa else None
        key_b = (fb['expression'], fb['matched']) if fb else None
        if key_a != key_b:
            transform = '|'.join(rules_of(fb, ids)) if fb else '(none)'
            by_transform[transform or '(no rule)'] += 1
            diffs.append((transform, text, fa, fb))
    print(f'{len(texts)} hovers; first result differs at {len(diffs)} ({100 * len(diffs) / max(1, len(texts)):.2f}%)')
    for transform, n in by_transform.most_common():
        print(f'  {transform}\t{n}')
    print('first results through a rule, by its first transform:', dict(rule_first.most_common()))
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write('transform\thover\tbase first\tbase matched\twith first\twith matched\twith gloss\n')
            for transform, text, fa, fb in diffs:
                f.write('\t'.join([transform, text,
                                   fa['expression'] if fa else '', fa['matched'] if fa else '',
                                   fb['expression'] if fb else '', fb['matched'] if fb else '',
                                   (fb['gloss'] if fb else '')[:80]]) + '\n')


def cmd_frequent(args):
    words, counts = [], []
    for line in open(args.frequency, encoding='utf-8'):
        w, n = line.rsplit(' ', 1)
        if HAN.match(w[0]):
            words.append(w)
            counts.append(int(n))
        if len(words) >= args.top:
            break
    with_dir = args.__dict__['with'] or os.path.join(REPO, 'languages')
    results = lookup(with_dir, args.dictionary, words, args.exempt, options=args.options)
    ids = rule_ids(with_dir)
    total = sum(counts)
    reached, not_self = [], []
    for w, n, r in zip(words, counts, results):
        f = first(r)
        if f is None:
            continue
        if rules_of(f, ids) and f['matched'] == w:
            reached.append((w, n, f))
        if f['expression'] != w and f['matched'] == w:
            not_self.append((w, n, f))
    print(f'{len(words)} words, {total} tokens')
    print(f'first result through a rule over the whole word: {len(reached)} words, {sum(n for _, n, _ in reached)} tokens '
          f'({100 * sum(n for _, n, _ in reached) / total:.3f}%)')
    for w, n, f in reached:
        print(f'  {w}\t{n}\t{f["expression"]}\t{"|".join(f["trace"])}\t{f["gloss"][:60]}')
    print(f'first result over the whole word is another word: {len(not_self)} words')
    for w, n, f in not_self[:args.show]:
        print(f'  {w}\t{n}\t{f["expression"]}\t{"|".join(f["trace"])}\t{f["gloss"][:60]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('hovers')
    p.add_argument('text')
    p.add_argument('--tatoeba', action='store_true')
    p.add_argument('--gutenberg', action='store_true')
    p = sub.add_parser('sample')
    p.add_argument('--files', nargs='+', required=True)
    p.add_argument('--counts', nargs='+', type=int, required=True)
    p.add_argument('--seed', type=int, default=1)
    for name in ('compare', 'frequent'):
        p = sub.add_parser(name)
        p.add_argument('--dictionary', required=True)
        p.add_argument('--with')
        p.add_argument('--exempt', action='store_true')
        p.add_argument('--options')
        if name == 'compare':
            p.add_argument('--hovers', required=True)
            p.add_argument('--base')
            p.add_argument('--out')
        else:
            p.add_argument('--frequency', required=True)
            p.add_argument('--top', type=int, default=10000)
            p.add_argument('--show', type=int, default=40)
    args = parser.parse_args()
    {'hovers': cmd_hovers, 'sample': cmd_sample, 'compare': cmd_compare, 'frequent': cmd_frequent}[args.command](args)


if __name__ == '__main__':
    main()
