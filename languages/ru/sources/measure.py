#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of README.md (Measurements) that need a real dictionary.

Not run by any test. Inputs (not committed; README.md, Sources and licences):
the wty-ru-en zip and its import by `hoshidicts-cli import`, the FrequencyWords
list ru_50k.txt, Tatoeba's Russian sentences and public-domain texts. Build
sources/lookup-batch.cpp first (its header has the command).

  python3 languages/ru/sources/measure.py frequent --zip wty-ru-en.zip --dict <imported dir>
      --freq ru_50k.txt --batch build/lookup-batch-ru [--languages languages] [--exempt] [--top 10000]
  python3 languages/ru/sources/measure.py text --zip wty-ru-en.zip --dict <imported dir>
      --batch build/lookup-batch-ru --text <file>... [--exempt] [--sample 60]

frequent: for each of the --top most frequent words whose wty-ru-en form-of rows
name a lemma that the pack's rules reach from the word, the word is looked up as
a host does (lookup-batch-ru: 16 results, scan length 16, default options) and
the first result with a definition (not a form-of row) is compared with the
lemmas its form-of rows name. A result is right only when it is one of those
lemmas, or the word itself when it is also a lemma.

text: every word of the texts is looked up as a host does, the text from the
word to the end of its sentence; the first result with a definition is judged
by the same rule where the word has form-of rows, and the rest are counted and
sampled for judging by hand.

--exempt runs lookup-batch-ru with the dictionary exempt from the part-of-speech
filter (LookupOptions::pos_filter_exempt), which stands in for the pack field
lookup.untaggedTerms "pass" until it is on main; results whose conditions only
an intermediate rule state gives are not counted as reached (see --help of
each subcommand).
"""

import argparse
import collections
import json
import re
import subprocess
import sys
import zipfile

ROOT = __file__.rsplit('/languages/', 1)[0]
CLI = __import__('os').environ.get('HOSHIDICTS_CLI', f'{ROOT}/build/hoshidicts-cli')


def load_dictionary(path):
    """Form-of references and lemma rows of a wiktionary-to-yomitan zip."""
    refs = collections.defaultdict(set)  # word -> lemmas its form-of rows name
    lemmas = set()  # terms with a row that has definitions
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(z.read(name)):
                term, defs = row[0], row[5]
                is_ref = lambda d: isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0] != '' and isinstance(d[1], list)
                if any(is_ref(d) for d in defs):
                    for d in defs:
                        if is_ref(d):
                            refs[term].add(strip_stress(d[0]))
                if any(not is_ref(d) for d in defs):
                    lemmas.add(term)
    return refs, lemmas


def strip_stress(text):
    """The text without the stress marks wiktionary-to-yomitan leaves in some references."""
    import unicodedata
    return unicodedata.normalize('NFC', re.sub('[\u0300\u0301]', '', unicodedata.normalize('NFD', text)))


def run_lines(args, lines):
    out = subprocess.run(args, input='\n'.join(lines) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def deinflections(languages, words):
    """Every text the pack's processors and rules give for each word."""
    pre = run_lines([CLI, '--languages', languages, 'preprocess', 'ru', '--stdin'], words)
    variants = {p['input']: [v['text'] for v in p['variants']] for p in pre}
    texts = sorted({t for v in variants.values() for t in v})
    res = run_lines([CLI, '--languages', languages, 'deinflect', 'ru', '--stdin'], texts)
    by_text = {r['input']: r['results'] for r in res}
    out = {}
    for word in words:
        out[word] = [r for t in variants[word] for r in by_text[t]]
    return out


def lookups(batch, languages, dictionary, texts, exempt):
    args = [batch, languages, 'ru', dictionary] + (['--exempt'] if exempt else [])
    return run_lines(args, texts)


def yo_spellings(word):
    """The word and its spellings with one е written ё."""
    out = [word]
    if 'ё' not in word:
        for i, c in enumerate(word):
            if c == 'е':
                out.append(word[:i] + 'ё' + word[i + 1:])
    return out


def accepted(word, refs, lemmas, yo=False):
    """The lemmas a first result may be for `word`: the lemmas its form-of rows
    name, the lemmas those name in turn (a participle's verb, a diminutive's
    noun: wiktionary-to-yomitan writes сделано → сделанный → сделать), and the
    word itself when it has a definition. With yo, also those of the word's
    spellings with one е written ё (узнает: узнать, and узнаёт: узнавать)."""
    spellings = {word}
    if yo:
        spellings |= {word.replace('ё', 'е')}
        for i, c in enumerate(word):
            if c == 'е':
                spellings.add(word[:i] + 'ё' + word[i + 1:])
    named = set()
    for s in spellings:
        named |= refs.get(s, set())
        if s in lemmas:
            named.add(s)
    if not named and not yo:
        # No row of its own: the word stands for its ё spellings.
        return accepted(word, refs, lemmas, yo=True)
    second = set()
    for n in named:
        second |= refs.get(n, set())
    return named | second


def first_with_definition(results):
    for r in results:
        if not r['formOf']:
            return r
    return None


def frequent(a):
    refs, lemmas = load_dictionary(a.zip)
    words = []
    counts = {}
    for line in open(a.freq, encoding='utf-8'):
        word, count = line.split()
        if word in counts:
            continue
        counts[word] = int(count)
        words.append(word)
        if len(words) >= a.top:
            break
    total_tokens = sum(counts.values())
    de = deinflections(a.languages, words)
    # Reached: a lemma the word's form-of rows name is among the deinflections
    # with a dictionary-form condition (not only an intermediate state).
    dictionary_forms = {'v', 'n', 'name', 'adj', 'pron', 'num'}
    # A word written with е where wiktionary-to-yomitan writes ё (узнает, its
    # row узнаёт) has form-of rows only under its ё spelling; those name the
    # lemmas of the word's readings (узнаёт: узнавать), and its е spelling's
    # rows, when they exist, name the others (узнает: узнать). Both count for
    # reach; the judge accepts only the word's own rows (see accepted).
    reached = []
    for w in words:
        named = set()
        for sp in yo_spellings(w):
            named |= refs.get(sp, set())
        if not named:
            continue
        got = {r['text'] for r in de[w] if r['trace'] and set(r['conditions']) & dictionary_forms}
        if got & named:
            reached.append(w)
    looked = lookups(a.batch, a.languages, a.dict, reached, a.exempt)
    wrong = []
    missing = []
    for w, o in zip(reached, looked):
        first = first_with_definition(o['results'])
        if first is None:
            missing.append(w)
            continue
        if first['expression'] not in accepted(w, refs, lemmas):
            via_yo = first['expression'] in accepted(w, refs, lemmas, yo=True)
            wrong.append((w, counts[w], first['expression'], first['trace'], sorted(refs[w]), via_yo))
    reached_tokens = sum(counts[w] for w in reached)
    wrong_tokens = sum(c for _, c, *_ in wrong)
    print(json.dumps({
        'words': len(words), 'tokens': total_tokens,
        'withFormOf': sum(1 for w in words if any(refs.get(sp) for sp in yo_spellings(w))),
        'reached': len(reached), 'reachedTokens': reached_tokens,
        'noDefinitionFirst': len(missing), 'noDefinitionTokens': sum(counts[w] for w in missing),
        'wrongFirst': len(wrong), 'wrongTokens': wrong_tokens,
        'wrongButAnotherYoSpelling': sum(1 for x in wrong if x[5]), 'wrongButAnotherYoSpellingTokens': sum(x[1] for x in wrong if x[5]),
        'wrongShareOfReachedTokens': wrong_tokens / reached_tokens if reached_tokens else 0,
        'wrongShareOfListTokens': wrong_tokens / total_tokens,
        'exempt': a.exempt,
    }, ensure_ascii=False))
    for w, c, got, trace, want, via_yo in sorted(wrong, key=lambda x: -x[1])[: a.show]:
        print(f'  {w}\t{c}\tfirst={got}\ttrace={trace}\twant={want}' + ('\t(a form of its ё spelling)' if via_yo else ''))


WORD = re.compile(r'[А-Яа-яЁё\u0300\u0301]+(?:-[А-Яа-яЁё\u0300\u0301]+)*')
END = re.compile(r'[.!?…]')


def hovers(text):
    """(word, the text from the word to the end of its sentence) for every word,
    as a host scans it (docs/languages.md 9.1; scanStart word)."""
    out = []
    for para in text.split('\n'):
        for m in WORD.finditer(para):
            rest = para[m.start():]
            end = END.search(rest)
            out.append((m.group(0), rest[: end.start() + 1] if end else rest))
    return out


def text(a):
    import random
    refs, lemmas = load_dictionary(a.zip)
    positions = []
    for path in a.text:
        positions += hovers(open(path, encoding='utf-8').read())
    texts = [h for _, h in positions]
    looked = lookups(a.batch, a.languages, a.dict, texts, a.exempt)
    judged = wrong = none = 0
    groups = collections.Counter()
    rest = []
    wrong_rows = []
    for (word, hover), o in zip(positions, looked):
        first = first_with_definition(o['results'])
        if first is None:
            none += 1
            continue
        key = strip_stress(word)
        lower = key[0].lower() + key[1:]
        cands = [k for k in (key, lower, key.lower()) if any(refs.get(sp) for sp in yo_spellings(k)) or k in lemmas]
        if first['matched'].lower() != word.lower() or not cands:
            rest.append((word, hover, first['expression'], first['matched'], first['trace']))
            continue
        judged += 1
        ok = set()
        for k in cands:
            ok |= accepted(k, refs, lemmas)
        if first['expression'] not in ok and first['expression'].lower() not in ok:
            wrong += 1
            groups[tuple(first['trace'][:1])] += 1
            wrong_rows.append((word, first['expression'], first['trace'], sorted(ok)[:4]))
    print(json.dumps({'lookups': len(positions), 'noResult': none, 'judgedByScript': judged, 'wrongByScript': wrong,
                      'wrongRate': wrong / judged if judged else 0, 'notJudgedByScript': len(rest), 'exempt': a.exempt}, ensure_ascii=False))
    print('rules behind the wrong first results:', groups.most_common(12))
    counts = collections.Counter((w.lower(), e) for w, e, *_ in wrong_rows)
    for (w, e), c in counts.most_common(a.show):
        trace = next(t for ww, ee, t, _ in wrong_rows if ww.lower() == w and ee == e)
        want = next(k for ww, ee, _, k in wrong_rows if ww.lower() == w and ee == e)
        print(f'  {c}\t{w}\tfirst={e}\ttrace={trace}\twant={want}')
    rng = random.Random(a.seed)
    print(f'sample of {a.sample} positions the script does not judge (judge by hand):')
    for word, hover, expr, matched, trace in rng.sample(rest, min(a.sample, len(rest))):
        print(f'  {word}\t{matched}\t{expr}\t{trace}\t{hover[:60]}')


FUNCTION_WORDS = ['в', 'во', 'на', 'с', 'со', 'к', 'ко', 'о', 'об', 'обо', 'по', 'за', 'из', 'от', 'у', 'до', 'для', 'без', 'под', 'над', 'при', 'про', 'через', 'не', 'ни']


def phrases(a):
    """Hovers that start at a preposition or negation before an inflected word
    (в доме, с матерью, не знаю), from Tatoeba sentences. The first result
    should be the preposition, a phrase the dictionary lists, or the next word's
    lemma never: a rule reading that spans the two words is a collision."""
    import bz2, random
    refs, lemmas = load_dictionary(a.zip)
    rng = random.Random(a.seed)
    sentences = [line.split('\t', 2)[2].rstrip('\n') for line in bz2.open(a.tatoeba, 'rt', encoding='utf-8')]
    rng.shuffle(sentences)
    picked = []
    for sent in sentences[: a.sentences]:
        for word, hover in hovers(sent):
            if word.lower() in FUNCTION_WORDS:
                nxt = WORD.search(hover, len(word))
                if nxt and hover[len(word):nxt.start()] == ' ':
                    picked.append((word, nxt.group(0), hover))
    looked = lookups(a.batch, a.languages, a.dict, [h for *_, h in picked], a.exempt)
    kinds = collections.Counter()
    spans = collections.Counter()
    for (fw, nxt, hover), o in zip(picked, looked):
        first = first_with_definition(o['results'])
        if first is None:
            kinds['no result'] += 1
        elif first['matched'].lower() == fw.lower():
            kinds['the function word'] += 1
        elif first['trace'] == [] or all(not t.startswith(('noun-', 'adj-', 'verb-', 'pron-', 'num-')) for t in first['trace']):
            kinds['a phrase the dictionary lists'] += 1
        else:
            kinds['a rule reading over two words'] += 1
            spans[(first['matched'].lower(), first['expression'], tuple(first['trace']))] += 1
    print(json.dumps({'sentences': a.sentences, 'positions': len(picked), 'first': dict(kinds), 'exempt': a.exempt}, ensure_ascii=False))
    for (m, e, t), c in spans.most_common(a.show):
        print(f'  {c}\t{m}\tfirst={e}\ttrace={list(t)}')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    f = sub.add_parser('frequent')
    f.add_argument('--zip', required=True)
    f.add_argument('--dict', required=True)
    f.add_argument('--freq', required=True)
    f.add_argument('--batch', required=True)
    f.add_argument('--languages', default=f'{ROOT}/languages')
    f.add_argument('--exempt', action='store_true')
    f.add_argument('--top', type=int, default=10000)
    f.add_argument('--show', type=int, default=60)
    t = sub.add_parser('text')
    t.add_argument('--zip', required=True)
    t.add_argument('--dict', required=True)
    t.add_argument('--text', nargs='+', required=True)
    t.add_argument('--batch', required=True)
    t.add_argument('--languages', default=f'{ROOT}/languages')
    t.add_argument('--exempt', action='store_true')
    t.add_argument('--sample', type=int, default=60)
    t.add_argument('--seed', type=int, default=1)
    t.add_argument('--show', type=int, default=40)
    ph = sub.add_parser('phrases')
    ph.add_argument('--zip', required=True)
    ph.add_argument('--dict', required=True)
    ph.add_argument('--tatoeba', required=True)
    ph.add_argument('--batch', required=True)
    ph.add_argument('--languages', default=f'{ROOT}/languages')
    ph.add_argument('--exempt', action='store_true')
    ph.add_argument('--sentences', type=int, default=40000)
    ph.add_argument('--seed', type=int, default=20261103)
    ph.add_argument('--show', type=int, default=30)
    a = p.parse_args()
    if a.cmd == 'phrases':
        phrases(a)
    if a.cmd == 'frequent':
        frequent(a)
    elif a.cmd == 'text':
        text(a)


if __name__ == '__main__':
    main()
