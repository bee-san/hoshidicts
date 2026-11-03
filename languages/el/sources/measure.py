#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Measurements of README.md (Measurements 2-4). Not run by any test.
#
#   python3 languages/el/sources/measure.py frequent <el_50k.txt> <wty-el-en JSON banks dir> <lookups.jsonl>
#   python3 languages/el/sources/measure.py hovers <text file> [--sentences tsv] > hovers.txt
#   python3 languages/el/sources/measure.py judge <wty-el-en JSON banks dir> <hovers.txt> <lookups.jsonl> [--sample N]
#
# lookups.jsonl is the output of languages/en/sources/lookup-batch.cpp (built
# against this checkout) on the words or hover texts, one line each:
#   build/lookup-batch languages el <imported wty-el-en> < words.txt > lookups.jsonl
#
# frequent: for each of the 10,000 most frequent words whose lemma a rule
# reaches (wty-el-en has a form-of row for the word that names it), the first
# result with a definition is right when it is that lemma (or the word itself
# when it has its own definitions). Prints the counts, the share of the list's
# tokens, and the wrong words by frequency.
# hovers: every Greek word of a text, as a host hovers it: the text from the
# word to the end of its sentence (one per line).
# judge: the first result with a definition at each hover position, judged by
# script where the hovered word's form-of rows name its lemmas; the rest are
# counted as unjudged and a random sample of them is printed for review.

import bz2, collections, glob, json, random, re, sys, unicodedata

GREEK = r"[\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03CE\u1F00-\u1FFF]"
WORD = re.compile(GREEK + r"(?:" + GREEK + r"|['’]" + GREEK + r")*['’]?")
TERMINATORS = re.compile(r"[.!;;…\n]")


def is_ref(d):
    return isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0] and isinstance(d[1], list)


def load_dictionary(banks):
    """term -> set of rules tags of rows with definitions; term -> lemmas its form-of rows name."""
    defined, refs = collections.defaultdict(set), collections.defaultdict(set)
    for f in sorted(glob.glob(banks.rstrip('/') + '/term_bank_*.json')):
        for row in json.load(open(f, encoding='utf-8')):
            if any(not is_ref(d) for d in row[5]):
                defined[row[0]].add(row[3])
            for d in row[5]:
                if is_ref(d):
                    refs[row[0]].add(d[0])
    return defined, refs


def first_defined(results):
    for r in results:
        if not r['formOf']:
            return r
    return None


def lemmas_of(word, refs, defined):
    """The lemmas a form-of row of the word (or its lowercase) names, one hop, and the word when it is defined."""
    out = set()
    for w in {word, word.lower(), unicodedata.normalize('NFC', word)}:
        out |= refs.get(w, set())
        if w in defined:
            out.add(w)
    return out


def right_lemmas(word, refs, defined):
    """The lemmas a form-of row of the word names, and, for a named form that has
    no definitions of its own (μιλά → μιλάει, μέρες → μέρα), the lemmas it names
    in turn; the word itself when it has definitions."""
    named = set(refs.get(word, set()))
    for n in list(named):
        if n not in defined:
            named |= refs.get(n, set())
    if word in defined:
        named.add(word)
    return named


def frequent(freq_file, banks, lookups):
    defined, refs = load_dictionary(banks)
    words = [line.split() for line in open(freq_file, encoding='utf-8')][:10000]
    results = [json.loads(line) for line in open(lookups, encoding='utf-8')]
    assert len(results) == len(words)
    total = sum(int(c) for _, c in words)
    counts = collections.Counter()
    tokens = collections.Counter()
    wrong_list = []
    empty_list = []
    for (word, count), answer in zip(words, results):
        count = int(count)
        if not refs.get(word):
            continue
        counts['reached'] += 1
        tokens['reached'] += count
        right = right_lemmas(word, refs, defined)
        first = first_defined(answer['results'])
        if first is None:
            kind = 'empty'
            empty_list.append((count, word, sorted(right)[:3]))
        elif first['expression'] in right:
            kind = 'right'
        else:
            kind = 'wrong'
            wrong_list.append((count, word, first['expression'], '/'.join(first['trace']), sorted(right)[:3]))
        counts[kind] += 1
        tokens[kind] += count
    print(json.dumps({'words': len(words), **counts, 'reachedTokenShare': tokens['reached'] / total,
                      'wrongTokenShare': tokens['wrong'] / total, 'emptyTokenShare': tokens['empty'] / total}, ensure_ascii=False))
    print('--- wrong first card (count, word, first, trace, right lemmas)')
    for item in sorted(wrong_list, reverse=True):
        print('\t'.join(str(x) for x in item))
    print('--- no card with a definition')
    for item in sorted(empty_list, reverse=True)[:40]:
        print('\t'.join(str(x) for x in item))


def hovers(text_file, sentences_tsv=False):
    if sentences_tsv:
        opener = bz2.open if text_file.endswith('.bz2') else open
        texts = [line.rstrip('\n').split('\t')[2] for line in opener(text_file, 'rt', encoding='utf-8')]
    else:
        raw = open(text_file, encoding='utf-8').read()
        start = raw.find('*** START OF')
        end = raw.find('*** END OF')
        raw = raw[raw.find('\n', start) + 1 if start >= 0 else 0: end if end >= 0 else len(raw)]
        texts = [re.sub(r'\s+', ' ', p) for p in re.split(r'\n\s*\n', raw)]
    for text in texts:
        for m in WORD.finditer(text):
            rest = text[m.start():]
            stop = TERMINATORS.search(rest)
            print(rest[:stop.start() if stop else len(rest)].strip())


def judge(banks, hover_file, lookups, sample=60):
    defined, refs = load_dictionary(banks)
    hover_lines = [line.rstrip('\n') for line in open(hover_file, encoding='utf-8')]
    results = [json.loads(line) for line in open(lookups, encoding='utf-8')]
    assert len(results) == len(hover_lines)
    counts = collections.Counter()
    wrong = collections.Counter()
    wrong_examples = collections.defaultdict(list)
    unjudged = []
    for text, answer in zip(hover_lines, results):
        word = WORD.match(text).group(0).rstrip("'’")
        first = first_defined(answer['results'])
        if first is None:
            counts['nothing'] += 1
            continue
        lemmas = right_lemmas(word, refs, defined) | right_lemmas(word.lower(), refs, defined)
        if not lemmas:
            counts['unjudged'] += 1
            unjudged.append((text[:40], first['expression'], first['matched'], '/'.join(first['trace'])))
            continue
        matched_word = first['matched'] == word or first['matched'].lower() == word.lower()
        if not matched_word:
            counts['longer match'] += 1
            continue
        if first['expression'] in lemmas or first['expression'].lower() in {l.lower() for l in lemmas}:
            counts['right'] += 1
        else:
            counts['wrong'] += 1
            key = (word.lower(), first['expression'])
            wrong[key] += 1
            wrong_examples[key].append('/'.join(first['trace']))
    judged = counts['right'] + counts['wrong']
    print(json.dumps({'lookups': len(hover_lines), **counts, 'wrongRateOfJudged': counts['wrong'] / judged if judged else None}, ensure_ascii=False))
    for (w, e), n in wrong.most_common(40):
        print(f'{n}\t{w}\t{e}\t{collections.Counter(wrong_examples[(w, e)]).most_common(1)[0][0]}')
    random.seed(1)
    print('--- unjudged sample')
    for item in random.sample(unjudged, min(sample, len(unjudged))):
        print('\t'.join(item))


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'frequent':
        frequent(*sys.argv[2:5])
    elif cmd == 'hovers':
        hovers(sys.argv[2], '--sentences' in sys.argv)
    elif cmd == 'judge':
        n = int(sys.argv[sys.argv.index('--sample') + 1]) if '--sample' in sys.argv else 60
        judge(sys.argv[2], sys.argv[3], sys.argv[4], n)
