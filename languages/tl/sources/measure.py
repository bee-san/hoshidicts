#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The measurements of README.md (Measurements). Not run by any test.

    python3 languages/tl/sources/measure.py <command> --cache <dir> --dictionary <imported dir> [options]

<dir> holds the inputs README.md lists (wty-tl-en.zip, tl_full.txt,
tgl_sentences.tsv.bz2, gutenberg/pg*.txt); <imported dir> is wty-tl-en (or a
labelled copy) imported by `hoshidicts-cli import`. Every command looks
words up as a host does, with build/tl-lookup-batch (sources/lookup-batch.cpp:
16 results, scan length 16, no language options), and runs every rule set:
own (sources/own.json), yomitan (sources/yomitan.json), union (the merge
tool's output) and final (transforms.json).

Commands:

- eval: hoshidicts-cli eval-language on corpus.tsv with gaps.tsv (the whole
  sample), cases.tsv and yomitan.tsv; recall, negatives passed, false
  candidates per row and first rank.
- frequent: the 10,000 most frequent words of tl_full.txt, each looked up
  alone. A word's lemmas are the terms its form-of rows name and the lemmas
  corpus.tsv and gaps.tsv give for it. "Reached" words are those whose lemma
  a rule reaches (a deinflection with a trace). The first result is right when
  it is the word itself (its own entry) or one of its lemmas. A first result
  that a rule made (a trace without dictionary steps) and that is neither is
  listed as "rule first, not named": right or wrong is judged by hand
  (--show prints them).
- tatoeba: every word position of Tatoeba's Tagalog sentences, looked up as
  the text from the word to the end of its sentence. Positions are split by
  the word before them (a marker, pronoun or particle, or other); first
  results are judged as in frequent, and multiword first results that a rule
  made are listed.
- text: the same for Project Gutenberg texts (--texts pg47629.txt,...).
"""

import argparse
import bz2
import collections
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import unicodedata
import zipfile
from pathlib import Path

PACK = Path(__file__).resolve().parent.parent
REPO = PACK.parent.parent
CLI = REPO / 'build' / 'hoshidicts-cli'
BATCH = REPO / 'build' / 'tl-lookup-batch'

# Words that come before a noun or verb phrase: markers, the plural mga,
# pronouns, enclitic particles and the linker-carrying function words.
FUNCTION_WORDS = {
    'marker': ['ang', 'ng', 'sa', 'si', 'ni', 'kay', 'sina', 'nina', 'kina', 'mga', 'ay', 'nang', 'na', 'at', 'o'],
    'pronoun': ['ako', 'ko', 'ikaw', 'ka', 'mo', 'siya', 'niya', 'kami', 'namin', 'tayo', 'natin', 'kayo', 'ninyo', 'nyo',
                'sila', 'nila', 'akin', 'iyo', 'kanya', 'kaniya', 'atin', 'amin', 'inyo', 'kanila', 'ito', 'iyan', 'iyon',
                'nito', 'niyan', 'niyon', 'noon', 'dito', 'diyan', 'doon'],
    'particle': ['ba', 'pa', 'po', 'din', 'rin', 'lang', 'lamang', 'naman', 'nga', 'kasi', 'muna', 'daw', 'raw', 'pala',
                 'yata', 'sana', 'man', 'hindi', 'huwag', 'wag', 'di', 'may', 'mayroon', 'wala', 'kung', 'kapag', 'para'],
}
GROUP_OF = {w: g for g, ws in FUNCTION_WORDS.items() for w in ws}
WORD = re.compile(r"[^\W\d_]+(?:[-'’][^\W\d_]+)*")
END = re.compile(r'(?<=[.!?…])["”’)]*\s+')


def strip_marks(text):
    return unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c)))


def norm(text):
    return strip_marks(text).lower().replace('’', "'")


def rule_sets(work):
    union = Path(work) / 'union.json'
    subprocess.run(['node', str(REPO / 'tools' / 'merge-transforms.mjs'), 'tl', '--out', str(union), '--force'], check=True,
                   capture_output=True)
    return {
        'own': PACK / 'sources' / 'own.json',
        'yomitan': PACK / 'sources' / 'yomitan.json',
        'union': union,
        'final': PACK / 'transforms.json',
    }


def dictionary_lemmas(zip_path):
    """Lemmas each headword's form-of rows name, and the headwords with definitions."""
    lemmas = collections.defaultdict(set)
    defined = set()
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(z.read(name)):
                refs = [d for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0]]
                for ref in refs:
                    lemmas[norm(row[0])].add(norm(ref[0]))
                if len(refs) < len(row[5]):
                    defined.add(norm(row[0]))
    return lemmas, defined


def corpus_lemmas():
    lemmas = collections.defaultdict(set)
    for name in ('corpus.tsv', 'gaps.tsv'):
        for line in (PACK / 'tests' / name).read_text(encoding='utf-8').splitlines():
            cells = line.split('\t')
            if line.startswith('#') or len(cells) != 6 or cells[1] != '1':
                continue
            lemmas[norm(cells[2])].add(norm(cells[3]))
    return lemmas


def run_batch(transforms, dictionary, texts):
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', delete=False) as f:
        f.write('\n'.join(texts) + '\n')
        name = f.name
    try:
        with open(name, encoding='utf-8') as stdin:
            out = subprocess.run([str(BATCH), str(REPO / 'languages'), 'tl', str(dictionary), '--transforms', str(transforms)],
                                 stdin=stdin, capture_output=True, text=True, check=True).stdout
    finally:
        os.unlink(name)
    answers = [json.loads(line) for line in out.splitlines()]
    assert len(answers) == len(texts), (len(answers), len(texts))
    return answers


def run_deinflect(transforms, words):
    out = subprocess.run([str(CLI), '--languages', str(REPO / 'languages'), 'deinflect', 'tl', '--stdin', '--transforms', str(transforms)],
                         input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    answers = [json.loads(line) for line in out.splitlines()]
    assert len(answers) == len(words)
    return answers


def judge(word, result, lemmas):
    """right / own entry / dictionary (a form-of step) / rule-not-named."""
    expression = norm(result['expression'])
    trace = result['trace']
    if expression == norm(word) or not trace:
        return 'own entry'
    if expression in lemmas:
        return 'right lemma'
    if any(from_dictionary for _, from_dictionary in trace):
        return 'dictionary step'
    return 'rule, not named'


def cmd_eval(args, sets):
    tests = PACK / 'tests'
    sample = Path(args.work) / 'sample.tsv'
    corpus = (tests / 'corpus.tsv').read_text(encoding='utf-8').splitlines()
    lines = (tests / 'gaps.tsv').read_text(encoding='utf-8').splitlines()
    mark = next(i for i, l in enumerate(lines) if l.startswith('# sampled rows'))
    gaps = [l for l in lines[mark:] if not l.startswith('#')]
    hand = [l for l in lines[:mark] if not l.startswith('#')]
    sample.write_text('\n'.join(corpus + gaps) + '\n', encoding='utf-8')
    hand_file = Path(args.work) / 'gaps-hand.tsv'
    hand_file.write_text('\n'.join(corpus[:1] + hand) + '\n', encoding='utf-8')
    files = {'sample (corpus + gaps)': sample, 'cases.tsv': tests / 'cases.tsv', 'gaps.tsv, hand-written': hand_file,
             'yomitan.tsv': tests / 'yomitan.tsv'}
    print(f'| Rule set | File | Rows | Recall | Negatives passed | False candidates per row | First rank |')
    print('| --- | --- | ---: | ---: | ---: | ---: | ---: |')
    for set_name, transforms in sets.items():
        for file_name, path in files.items():
            out = subprocess.run([str(CLI), '--languages', str(REPO / 'languages'), 'eval-language', 'tl', str(path),
                                  '--transforms', str(transforms), '--dictionary', str(args.dictionary)],
                                 capture_output=True, text=True)
            if out.returncode != 0:
                print(f'| {set_name} | {file_name} | error: {out.stderr.strip()} |||||')
                continue
            r = json.loads(out.stdout)
            pct = lambda v: '-' if v is None else f'{100 * v:.2f}%'
            num = lambda v: '-' if v is None else f'{v:.3f}'
            print(f"| {set_name} | {file_name} | {r['positives']} + {r['negatives']} | {pct(r['recall'])} | {pct(r['negativesPassed'])} | "
                  f"{num(r.get('falseCandidates'))} | {pct(r.get('firstRank'))} |")


def frequent_words(args):
    words, counts = [], []
    for line in (Path(args.cache) / 'tl_full.txt').read_text(encoding='utf-8').splitlines():
        word, count = line.split(' ')
        if WORD.fullmatch(word):
            words.append(word)
            counts.append(int(count))
        if len(words) == 10000:
            break
    return words, counts


def cmd_frequent(args, sets):
    lemmas, _ = dictionary_lemmas(Path(args.cache) / 'wty-tl-en.zip')
    for word, extra in corpus_lemmas().items():
        lemmas[word] |= extra
    words, counts = frequent_words(args)
    total = sum(counts)
    print(f'{len(words)} words, {total} tokens; {sum(1 for w in words if lemmas.get(norm(w)))} have a lemma named by a form-of row or the corpus')
    print('| Rule set | Words a rule reaches | Their tokens | Wrong first (words) | Wrong first (share of tokens) | Rule first, not named (words) |')
    print('| --- | ---: | ---: | ---: | ---: | ---: |')
    listed = {}
    for set_name, transforms in sets.items():
        deinflections = run_deinflect(transforms, [norm(w) for w in words])
        answers = run_batch(transforms, args.dictionary, words)
        reached = wrong = wrong_tokens = reached_tokens = 0
        unnamed = []
        for word, count, d, a in zip(words, counts, deinflections, answers):
            named = lemmas.get(norm(word), set())
            hits = named and any(r['trace'] and norm(r['text']) in named for r in d['results'])
            first = a['results'][0] if a['results'] else None
            verdict = judge(word, first, named) if first else 'nothing'
            if hits:
                reached += 1
                reached_tokens += count
                if verdict not in ('own entry', 'right lemma'):
                    wrong += 1
                    wrong_tokens += count
            if verdict == 'rule, not named':
                unnamed.append((count, word, first['expression'], [t for t, _ in first['trace']]))
        listed[set_name] = unnamed
        print(f'| {set_name} | {reached} | {100 * reached_tokens / total:.2f}% | {wrong} | {100 * wrong_tokens / total:.3f}% | {len(unnamed)} |')
    if args.show:
        for set_name, unnamed in listed.items():
            print(f'\n{set_name}: rule first, not named ({len(unnamed)}):')
            for count, word, expression, trace in sorted(unnamed, reverse=True)[:args.show]:
                print(f'  {count}\t{word}\t{expression}\t{"|".join(trace)}')


def sentences_tatoeba(args):
    with bz2.open(Path(args.cache) / 'tgl_sentences.tsv.bz2', 'rt', encoding='utf-8') as f:
        return [line.rstrip('\n').split('\t')[2] for line in f]


def sentences_text(args):
    out = []
    for name in args.texts.split(','):
        text = (Path(args.cache) / 'gutenberg' / name).read_text(encoding='utf-8', errors='replace')
        start = text.find('*** START')
        if start >= 0:
            text = text[text.find('\n', start) + 1:]
        end = text.find('*** END')
        if end > 0:
            text = text[:end]
        for paragraph in re.split(r'\n\s*\n', text):
            flat = ' '.join(paragraph.split())
            out.extend(s for s in END.split(flat) if s)
    return out


def hovers(sentences):
    """(hover text, hovered word, word before it) for every word of every sentence."""
    out = []
    for sentence in sentences:
        previous = ''
        for m in WORD.finditer(sentence):
            out.append((sentence[m.start():], m.group(0), previous))
            previous = m.group(0)
    return out


def cmd_positions(args, sets, sentences, label):
    lemmas, _ = dictionary_lemmas(Path(args.cache) / 'wty-tl-en.zip')
    for word, extra in corpus_lemmas().items():
        lemmas[word] |= extra
    positions = hovers(sentences)
    texts = [h for h, _, _ in positions]
    print(f'{label}: {len(sentences)} sentences, {len(positions)} positions')
    print('| Rule set | Positions found | First result a rule made | of those, not named by a form-of row | Multiword, made by a rule | Not named, after a marker / pronoun / particle |')
    print('| --- | ---: | ---: | ---: | ---: | ---: |')
    listed = {}
    rng = random.Random(1)
    for set_name, transforms in sets.items():
        answers = run_batch(transforms, args.dictionary, texts)
        if args.dump:
            with open(f'{args.dump}.{set_name}.jsonl', 'w', encoding='utf-8') as f:
                for (text, word, previous), a in zip(positions, answers):
                    f.write(json.dumps({'word': word, 'previous': previous, 'text': text, 'results': a['results'][:3]},
                                       ensure_ascii=False) + '\n')
        found = by_rule = unnamed = multi = 0
        after = collections.Counter()
        items = []
        for (text, word, previous), a in zip(positions, answers):
            if not a['results']:
                continue
            found += 1
            first = a['results'][0]
            trace = first['trace']
            if not trace or all(d for _, d in trace):
                continue
            by_rule += 1
            matched = first['matched']
            if ' ' in matched:
                multi += 1
            verdict = judge(matched, first, lemmas.get(norm(matched), set()))
            if verdict == 'rule, not named':
                unnamed += 1
                after[GROUP_OF.get(norm(previous), 'other')] += 1
                items.append((matched, first['expression'], '|'.join(t for t, _ in trace), text[:60]))
        listed[set_name] = items
        print(f"| {set_name} | {found} | {by_rule} | {unnamed} | {multi} | {after['marker']} / {after['pronoun']} / {after['particle']} |")
    if args.show:
        for set_name, items in listed.items():
            groups = collections.Counter((m.lower(), e) for m, e, _, _ in items)
            print(f'\n{set_name}: not named by a form-of row, by (matched, expression), most frequent first:')
            for (m, e), c in groups.most_common(args.show):
                trace = next(t for mm, ee, t, _ in items if mm.lower() == m and ee == e)
                print(f'  {c}\t{m}\t{e}\t{trace}')
            if args.sample:
                print(f'\n{set_name}: a random sample of {args.sample} of those positions (seed 1):')
                for item in rng.sample(items, min(args.sample, len(items))):
                    print('  ' + '\t'.join(item))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['eval', 'frequent', 'tatoeba', 'text'])
    parser.add_argument('--cache', required=True)
    parser.add_argument('--dictionary', required=True)
    parser.add_argument('--work', default=None)
    parser.add_argument('--sets', default='own,yomitan,union,final')
    parser.add_argument('--texts', default='pg47629.txt,pg46639.txt')
    parser.add_argument('--show', type=int, default=0)
    parser.add_argument('--sample', type=int, default=0)
    parser.add_argument('--dump', default=None, help='write every position and its first three results to <dump>.<set>.jsonl')
    args = parser.parse_args()
    work = args.work or tempfile.mkdtemp(prefix='tl-measure-')
    args.work = work
    sets = {k: v for k, v in rule_sets(work).items() if k in args.sets.split(',')}
    if args.command == 'eval':
        cmd_eval(args, sets)
    elif args.command == 'frequent':
        cmd_frequent(args, sets)
    elif args.command == 'tatoeba':
        cmd_positions(args, sets, sentences_tatoeba(args), 'Tatoeba')
    else:
        cmd_positions(args, sets, sentences_text(args), args.texts)


if __name__ == '__main__':
    main()
