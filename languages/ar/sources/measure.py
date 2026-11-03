#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The measurements of README.md (Measurements) that look words up as a host does.

    python3 languages/ar/sources/measure.py frequent <wty-ar-en.zip> <imported dir> <ar_50k.txt> [--languages dir]
    python3 languages/ar/sources/measure.py text <wty-ar-en.zip> <imported dir> <text file> [--languages dir] [--sample N]

Run from the repository root after building build/hoshidicts-cli and
build/lookup-batch-ar (sources/lookup-batch.cpp). Lookups use the pack's
defaults (no language options), 16 results and scan length 16.

A word's own lemmas are the targets of its form-of rows in wty-ar-en, vowel
marks removed, and the word itself when it has a row with definitions. A
target that has no row with definitions is replaced by its own targets: the
verbal noun عثور has only rows that name its verb عثر, so العثور's lemma is
عثر, as a lookup shows it. A first result is right when its expression is one
of them.

frequent: the 10,000 most frequent entries of a FrequencyWords list, the
Arabic words among them, and of those the words whose lemma a rule reaches
(one of the word's form-of targets is among the deinflections of the word).
Each is looked up alone; the script counts the words, and their share of the
list's tokens, whose first result is not one of the word's own lemmas.

text: every word of a text, looked up as a host does: the text from the word
to the end of its sentence. Positions whose first result matches the whole
word are judged by script: a word wty-ar-en lists by its own lemmas, a word it
does not list (وكتابه) by the lemmas of every way of writing it as proclitics
(و ف ب ك ل س ال لل and their chains) + a listed word + a pronoun, any of which
counts as right. A random sample (seed 1) of the other positions with a
result is printed for judging by hand.
"""
import collections
import json
import random
import re
import subprocess
import sys
import unicodedata
import zipfile

MARKS = re.compile('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]')
WORD = re.compile('[\u0621-\u064A\u064B-\u065F\u0670\u0640]+')
LETTERS = re.compile('^[\u0621-\u064A]+$')
SENTENCE_END = re.compile('[.!?\u061F\u06D4\u2026\n]')


def strip(text):
    return MARKS.sub('', unicodedata.normalize('NFC', text))


def load_dictionary(path):
    targets = collections.defaultdict(set)
    lemma = set()
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(archive.read(name)):
                refs = [d for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str)]
                for ref in refs:
                    targets[row[0]].add(strip(ref[0]))
                if len(refs) < len(row[5]):
                    lemma.add(row[0])
    return targets, lemma


def own_lemmas(word, targets, lemma):
    """The targets of the word's form-of rows and the word itself when it has
    a row with definitions; a target without such a row (عثور, whose rows only
    name عثر as its verb) is replaced by its own targets, the entries a lookup
    can show for it."""
    out = set()
    for target in targets.get(word, ()):
        if target in lemma:
            out.add(target)
        else:
            out |= {t for t in targets.get(target, ()) if t in lemma}
    if word in lemma:
        out.add(word)
    return out


def lookup(texts, imported, languages):
    cmd = ['build/lookup-batch-ar', languages, 'ar', imported, '16', '16', '']
    out = subprocess.run(cmd, input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def deinflections(words, languages):
    cmd = ['build/hoshidicts-cli', '--languages', languages, 'preprocess', 'ar', '--stdin']
    out = subprocess.run(cmd, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    variants = {o['input']: [v['text'] for v in o['variants']] for o in map(json.loads, out.splitlines())}
    texts = sorted({t for w in words for t in variants[w]})
    cmd = ['build/hoshidicts-cli', '--languages', languages, 'deinflect', 'ar', '--stdin']
    out = subprocess.run(cmd, input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    results = {o['input']: {r['text'] for r in o['results'] if r['trace']} for o in map(json.loads, out.splitlines())}
    return {w: set().union(*(results[t] for t in variants[w])) for w in words}


def option(args, name, default):
    return args[args.index(name) + 1] if name in args else default


def frequent(args):
    zip_path, imported, freq_path = args[:3]
    languages = option(args, '--languages', 'languages')
    targets, lemma = load_dictionary(zip_path)
    entries = [line.split() for line in open(freq_path, encoding='utf-8') if line.strip()]
    top = entries[:10000]
    all_tokens = sum(int(c) for _, c in entries)
    top_tokens = sum(int(c) for _, c in top)
    words = [(w, int(c)) for w, c in top if LETTERS.match(w)]
    reached_by_rule = deinflections([w for w, _ in words if targets.get(w)], languages)
    measured = [(w, c) for w, c in words if own_lemmas(w, targets, lemma) & reached_by_rule.get(w, set()) - {w}]
    results = lookup([w for w, _ in measured], imported, languages)
    wrong = []
    for (w, c), res in zip(measured, results):
        first = res['results'][0] if res['results'] else None
        if first is None or first['expression'] not in own_lemmas(w, targets, lemma):
            wrong.append((w, c, first))
    measured_tokens = sum(c for _, c in measured)
    wrong_tokens = sum(c for _, c, _ in wrong)
    print('list: %d entries, %d tokens; top 10,000: %d tokens (%.1f%%)' % (len(entries), all_tokens, top_tokens, 100 * top_tokens / all_tokens))
    print('Arabic words in the top 10,000: %d' % len(words))
    print('words whose lemma a rule reaches: %d (%.1f%% of the list\'s tokens)' % (len(measured), 100 * measured_tokens / all_tokens))
    print('first result not the word\'s own lemma: %d words, %.2f%% of the list\'s tokens' % (len(wrong), 100 * wrong_tokens / all_tokens))
    for w, c, first in sorted(wrong, key=lambda x: -x[1])[:40]:
        got = '-' if first is None else '%s {%s}' % (first['expression'], '>'.join(reversed(first['trace'])))
        print('  %s (%d): %s; own lemmas %s' % (w, c, got, ' '.join(sorted(own_lemmas(w, targets, lemma)))))


def positions(text):
    """(word, text from the word to the end of its sentence) for every word."""
    out = []
    for m in WORD.finditer(text):
        end = SENTENCE_END.search(text, m.end())
        rest = text[m.start():end.start() if end else len(text)]
        out.append((strip(m.group()), ' '.join(rest.split())))
    return out


PROCLITICS = ['', 'و', 'ف', 'ب', 'ك', 'ل', 'س', 'وب', 'وك', 'ول', 'وس', 'فب', 'فك', 'فل', 'فس',
              'ال', 'وال', 'فال', 'بال', 'كال', 'وبال', 'وكال', 'فبال', 'فكال', 'لل', 'ولل', 'فلل']
PRONOUNS = ['', 'ي', 'ني', 'نا', 'ك', 'كما', 'كم', 'كن', 'ه', 'ها', 'هما', 'هم', 'هن']


def bases(stem, pronoun):
    """The spellings a word may have without its pronoun: ة written ت, ى
    written ا or ي (معناه, عليه) or merged with the pronoun ي (إليّ), and a
    verb's ـوا without its alif (كتبوه)."""
    out = [stem]
    if pronoun:
        if stem.endswith('ت'):
            out.append(stem[:-1] + 'ة')
        if stem.endswith('ا') or stem.endswith('ي'):
            out.append(stem[:-1] + 'ى')
        if stem.endswith('و'):
            out.append(stem + 'ا')
        if stem.endswith('تمو'):
            out.append(stem[:-1])
        if pronoun == 'ي':
            # ى and the pronoun ي are written as one ي (إليّ, عليّ, لديّ).
            out.append(stem + 'ى')
    return out


def judge(word, targets, lemma):
    """The word's own lemmas, or, for a word the dictionary does not list, the
    lemmas of every way of writing it as proclitics + a listed word + a
    pronoun; and whether such a split was needed. None when neither works."""
    own = own_lemmas(word, targets, lemma)
    if own:
        return own, False
    found = set()
    for prefix in PROCLITICS:
        if not word.startswith(prefix):
            continue
        for pronoun in PRONOUNS:
            if not word.endswith(pronoun) or len(word) - len(prefix) - len(pronoun) < 1 or (prefix == '' and pronoun == ''):
                continue
            stem = word[len(prefix):len(word) - len(pronoun)]
            if prefix.endswith('لل'):
                stem = 'ال' + stem
            for base in bases(stem, pronoun):
                found |= own_lemmas(base, targets, lemma)
                if prefix.endswith('ال') or prefix.endswith('لل'):
                    found |= own_lemmas(base[2:] if base.startswith('ال') else base, targets, lemma)
    return (found, True) if found else (None, False)


def text_measure(args):
    zip_path, imported, text_path = args[:3]
    languages = option(args, '--languages', 'languages')
    sample_size = int(option(args, '--sample', '60'))
    targets, lemma = load_dictionary(zip_path)
    text = open(text_path, encoding='utf-8').read()
    pos = positions(text)
    results = lookup([hover for _, hover in pos], imported, languages)
    counts = collections.Counter()
    wrong = collections.Counter()
    unjudged = []
    for (word, hover), res in zip(pos, results):
        first = res['results'][0] if res['results'] else None
        if first is None:
            counts['no result'] += 1
            continue
        own, clitic = judge(word, targets, lemma)
        if own is None or strip(first['matched']) != word:
            unjudged.append((word, hover, first))
            continue
        kind = 'clitic' if clitic else 'listed'
        counts[kind + ' judged'] += 1
        if first['expression'] not in own:
            counts[kind + ' wrong'] += 1
            wrong[(word, first['expression'], '>'.join(reversed(first['trace'])))] += 1
    judged = counts['listed judged'] + counts['clitic judged']
    bad = counts['listed wrong'] + counts['clitic wrong']
    print('positions %d, without a result %d' % (len(pos), counts['no result']))
    print('judged by script %d (first result matching the whole word): wrong %d (%.2f%%)' % (judged, bad, 100 * bad / max(judged, 1)))
    print('  words wty-ar-en lists: %d, wrong %d (%.2f%%)' % (counts['listed judged'], counts['listed wrong'], 100 * counts['listed wrong'] / max(counts['listed judged'], 1)))
    print('  words it does not list, judged by their proclitic + word + pronoun splits: %d, wrong %d (%.2f%%)' % (
        counts['clitic judged'], counts['clitic wrong'], 100 * counts['clitic wrong'] / max(counts['clitic judged'], 1)))
    for (word, got, trace), n in wrong.most_common(40):
        print('  %4d  %s -> %s {%s}' % (n, word, got, trace))
    rng = random.Random(1)
    print('\nsample of %d of the %d positions not judged by script:' % (min(sample_size, len(unjudged)), len(unjudged)))
    for word, hover, first in rng.sample(unjudged, min(sample_size, len(unjudged))):
        print('  %s | %s -> %s [%s] {%s}' % (word, hover[:40], first['expression'], first['matched'], '>'.join(reversed(first['trace']))))


if __name__ == '__main__':
    command, rest = sys.argv[1], sys.argv[2:]
    {'frequent': frequent, 'text': text_measure}[command](rest)
