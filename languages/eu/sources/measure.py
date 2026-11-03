#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The README's real-text measurements (Measurements 2-4).

    python3 languages/eu/sources/measure.py freq <cache> <imported dictionary> [--languages <dir>] [--top N]
    python3 languages/eu/sources/measure.py text <cache> <imported dictionary> [--languages <dir>] [--corpus garoa|wikipedia|tatoeba]
    python3 languages/eu/sources/measure.py sample <cache> <imported dictionary> [--languages <dir>] [--corpus ...] [--n 60]
    python3 languages/eu/sources/measure.py yomitan <cache> <imported dictionary> [--languages <dir>] [--union <file>]

<cache> holds the downloads the README names (MANIFEST in hachi-lang-cache/eu):
wty-eu-en-json/ (the dictionary's banks, unzipped), eu_50k-2018.txt,
eus_sentences.tsv, texts/garoa/*.txt and texts/wikipedia/[0-9]*.txt. The
imported dictionary is wty-eu-en imported by `hoshidicts-cli import`.

Lookups run build/eu-lookup-batch (sources/lookup-batch.cpp): Lookup::lookup
with 16 results, scan length 16 and no options, as a host's hover does.

freq: of the N (10,000) most frequent words of the subtitle list, the words
whose lemma a rule reaches, where the word's form-of rows in the dictionary
or UniMorph eus name the lemma; for each, whether the first result is right:
the word's own headword (a row of it with definitions) or a lemma they name.

yomitan: for each of Yomitan's rules (sources/yomitan.json), forms built
from the ten most frequent lemmas (subtitle list) of the parts of speech the
rule writes whose spelling ends with its deinflected text, with its inflected
ending put in place; how many of them are attested (in the subtitle list or
in kaikki's tables for that lemma), and how many attested ones the pack's
transforms.json and the rule itself reach.

text: every word of the corpus looked up with the rest of its sentence. The
first result is judged by script where the word has form-of rows (right: a
lemma they name, or the word's own headword); a first result that is the
word's own headword is right; the rest are counted as unjudged and `sample`
draws a random sample of them (seed 1) for judging by hand.
"""

import collections
import glob
import json
import os
import random
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
WORD = re.compile(r"[A-Za-zÀ-ÖØ-öø-ɏ]+")


def args_of(argv):
    opts = {'--languages': os.path.join(ROOT, 'languages'), '--top': '10000', '--corpus': 'garoa', '--n': '60'}
    pos = []
    i = 0
    while i < len(argv):
        if argv[i] in opts:
            opts[argv[i]] = argv[i + 1]
            i += 2
        else:
            pos.append(argv[i])
            i += 1
    return pos, opts


# UniMorph's roots of the auxiliaries and wiktionary-to-yomitan's citation
# forms name the same verbs: UniMorph lists the transitive auxiliary as ukan
# and edun, the subjunctive and potential roots as ezan and edin, and the
# dictionary's form-of rows name izan for all of them (dut, dezake, daiteke).
AUX = {'ukan': {'edun', 'izan'}, 'edun': {'edun', 'izan'}, 'ezan': {'ezan', 'edun', 'izan'}, 'edin': {'edin', 'izan'}}


def unimorph_lemmas(cache):
    out = collections.defaultdict(set)
    with open(os.path.join(cache, 'unimorph-eus', 'eus'), encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) == 3:
                out[parts[1]] |= AUX.get(parts[0], {parts[0]})
    return out


def dictionary_rows(cache):
    """headword -> {'lemma': bool (a row with definitions), 'formOf': {target: [rules]}}."""
    out = collections.defaultdict(lambda: {'lemma': False, 'formOf': collections.defaultdict(list)})
    for form, lemmas in unimorph_lemmas(cache).items():
        for lemma in lemmas:
            out[form]['formOf'][lemma].append('UniMorph')
    for path in sorted(glob.glob(os.path.join(cache, 'wty-eu-en-json', 'term_bank_*.json'))):
        with open(path, encoding='utf-8') as f:
            for row in json.load(f):
                refs = [d for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and isinstance(d[1], list)]
                if refs:
                    for target, rules in refs:
                        out[row[0]]['formOf'][target].extend(rules)
                else:
                    out[row[0]]['lemma'] = True
    return out


def lookups(languages, dictionary, texts):
    cli = os.path.join(ROOT, 'build', 'eu-lookup-batch')
    result = subprocess.run([cli, languages, 'eu', dictionary], input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True)
    return [json.loads(line) for line in result.stdout.splitlines()]


def deinflections(languages, words):
    cli = os.path.join(ROOT, 'build', 'hoshidicts-cli')
    result = subprocess.run([cli, '--languages', languages, 'deinflect', 'eu', '--stdin'], input='\n'.join(words) + '\n',
                            capture_output=True, text=True, check=True)
    return {d['input']: d['results'] for d in map(json.loads, result.stdout.splitlines())}


def named_lemmas(word, rows):
    """The lemmas the word's form-of rows name, and the lemmas those name in
    turn (one more hop): wty-eu-en names ikuste for ikustera and ikusi for
    ikuste, handien for handiena and handi for handien."""
    named = set()
    for w in {word, word.lower(), word[:1].upper() + word[1:]}:
        if w in rows:
            named |= set(rows[w]['formOf'])
    for lemma in list(named):
        if lemma in rows:
            named |= set(rows[lemma]['formOf'])
    return named


def judge(word, first, rows):
    """'right', 'wrong' or None (no form-of rows name a lemma, and the first
    result is not the word's own headword)."""
    if first is None:
        return 'none'
    named = named_lemmas(word, rows)
    if first['expression'] in (word, word.lower(), word[:1].upper() + word[1:]) and first['matched'].lower() == word.lower():
        return 'right'
    if first['matched'].lower() != word.lower():
        # A match longer than the word (a multiword entry) or shorter.
        return None
    if named:
        return 'right' if first['expression'] in named else 'wrong'
    return None


def freq(cache, dictionary, opts):
    rows = dictionary_rows(cache)
    top = int(opts['--top'])
    words = []
    with open(os.path.join(cache, 'eu_50k-2018.txt'), encoding='utf-8') as f:
        for line in f:
            w, c = line.split()
            words.append((w, int(c)))
            if len(words) == top:
                break
    total_tokens = sum(c for _, c in words)
    dein = deinflections(opts['--languages'], [w for w, _ in words])
    reached = []
    for w, c in words:
        named = named_lemmas(w, rows)
        texts = {r['text'] for r in dein[w] if r['trace']}
        if named & texts:
            reached.append((w, c, named))
    looked = lookups(opts['--languages'], dictionary, [w for w, _, _ in reached])
    wrong = []
    for (w, c, named), d in zip(reached, looked):
        first = d['results'][0] if d['results'] else None
        own = rows[w]['lemma'] and first is not None and first['expression'] == w
        if first is None or not (own or first['expression'] in named):
            wrong.append((w, c, first['expression'] if first else None, first['trace'] if first else None, sorted(named)))
    reached_tokens = sum(c for _, c, _ in reached)
    wrong_tokens = sum(c for _, c, *_ in wrong)
    print(json.dumps({'words': len(words), 'tokens': total_tokens, 'reached': len(reached), 'reachedTokens': reached_tokens,
                      'wrongFirst': len(wrong), 'wrongTokens': wrong_tokens,
                      'wrongShareOfReachedTokens': round(wrong_tokens / max(reached_tokens, 1), 5),
                      'wrongShareOfListTokens': round(wrong_tokens / total_tokens, 5)}, ensure_ascii=False))
    for item in sorted(wrong, key=lambda x: -x[1]):
        print(json.dumps(item, ensure_ascii=False))


def sentences(cache, corpus):
    if corpus == 'tatoeba':
        with open(os.path.join(cache, 'eus_sentences.tsv'), encoding='utf-8') as f:
            for line in f:
                parts = line.rstrip('\n').split('\t')
                if len(parts) == 3:
                    yield parts[2]
        return
    pattern = {'garoa': 'texts/garoa/*.txt', 'wikipedia': 'texts/wikipedia/[0-9]*.txt'}[corpus]
    for path in sorted(glob.glob(os.path.join(cache, pattern))):
        with open(path, encoding='utf-8') as f:
            text = f.read()
        for paragraph in re.split(r'\n\s*\n', text):
            paragraph = ' '.join(paragraph.split())
            for s in re.split(r'(?<=[.!?…])\s+', paragraph):
                if s:
                    yield s


def positions(cache, corpus):
    """(word, text from the word to the end of its sentence) for every word."""
    out = []
    for s in sentences(cache, corpus):
        for m in WORD.finditer(s):
            out.append((m.group(0), s[m.start():]))
    return out


def text(cache, dictionary, opts, sample=False):
    rows = dictionary_rows(cache)
    pos = positions(cache, opts['--corpus'])
    looked = lookups(opts['--languages'], dictionary, [t for _, t in pos])
    counts = collections.Counter()
    wrong = collections.Counter()
    rules = collections.Counter()
    unjudged = []
    for (word, t), d in zip(pos, looked):
        first = d['results'][0] if d['results'] else None
        verdict = judge(word, first, rows)
        if verdict is None:
            counts['unjudged'] += 1
            unjudged.append((word, t, first))
        else:
            counts[verdict] += 1
            if verdict == 'wrong':
                wrong[(word.lower(), first['expression'])] += 1
                rules[' > '.join(first['trace'])] += 1
    if sample:
        random.seed(1)
        picked = random.sample(unjudged, min(int(opts['--n']), len(unjudged)))
        for word, t, first in picked:
            print(json.dumps({'word': word, 'text': t[:80], 'first': first and {k: first[k] for k in ('expression', 'matched', 'trace')}},
                             ensure_ascii=False))
        return
    print(json.dumps({'corpus': opts['--corpus'], 'positions': len(pos), **counts,
                      'wrongRate': round(counts['wrong'] / max(len(pos), 1), 5)}, ensure_ascii=False))
    print('wrong (word, first result): ' + json.dumps(wrong.most_common(60), ensure_ascii=False))
    print('traces of wrong first results: ' + json.dumps(rules.most_common(25), ensure_ascii=False))


def kaikki_forms(cache):
    out = collections.defaultdict(set)
    with open(os.path.join(cache, 'kaikki.org-dictionary-Basque.jsonl'), encoding='utf-8') as f:
        for line in f:
            entry = json.loads(line)
            for form in entry.get('forms', []):
                out[entry.get('word', '')].add(form.get('form', ''))
    return out


def deinflect_with(languages, transforms, words):
    cli = os.path.join(ROOT, 'build', 'hoshidicts-cli')
    args = [cli, '--languages', languages, 'deinflect', 'eu', '--stdin', '--all-options']
    if transforms:
        args += ['--transforms', transforms]
    result = subprocess.run(args, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True)
    return {d['input']: d['results'] for d in map(json.loads, result.stdout.splitlines())}


def yomitan(cache, dictionary, opts):
    languages = opts['--languages']
    pack = os.path.join(languages, 'eu')
    with open(os.path.join(pack, 'sources', 'yomitan.json'), encoding='utf-8') as f:
        yrules = json.load(f)
    freq = {}
    with open(os.path.join(cache, 'eu_full-2018.txt'), encoding='utf-8') as f:
        for rank, line in enumerate(f):
            w, c = line.split()
            freq[w] = int(c)
    lemmas = collections.defaultdict(list)
    for path in sorted(glob.glob(os.path.join(cache, 'wty-eu-en-json', 'term_bank_*.json'))):
        with open(path, encoding='utf-8') as f:
            for row in json.load(f):
                if row[2] != 'non-lemma' and row[3] in ('n', 'adj', 'adv', 'v') and ' ' not in row[0] and row[0].islower():
                    lemmas[row[3]].append(row[0])
    for pos in lemmas:
        lemmas[pos] = sorted(set(lemmas[pos]), key=lambda w: -freq.get(w, 0))
    kk = kaikki_forms(cache)
    built = []
    for t in yrules['transforms']:
        for i, rule in enumerate(t['rules']):
            pos = [p for p in rule['conditionsOut'] if p in lemmas]
            pool = []
            for p in pos:
                pool += [w for w in lemmas[p] if w.endswith(rule['deinflected']) and len(w) > len(rule['deinflected'])]
            pool = sorted(set(pool), key=lambda w: -freq.get(w, 0))[:10]
            for lemma in pool:
                form = lemma[:len(lemma) - len(rule['deinflected'])] + rule['inflected']
                attested = form in freq or form in kk.get(lemma, set())
                built.append((t['id'], i, lemma, form, attested))
    words = sorted({b[3] for b in built})
    own = deinflect_with(languages, os.path.join(pack, 'transforms.json'), words)
    yom = deinflect_with(languages, os.path.join(pack, 'sources', 'yomitan.json'), words)
    by = collections.OrderedDict()
    for tid, i, lemma, form, attested in built:
        e = by.setdefault((tid, i), {'built': 0, 'attested': 0, 'ownReaches': 0, 'yomitanReaches': 0, 'unreachedByOwn': []})
        e['built'] += 1
        if attested:
            e['attested'] += 1
            if any(r['text'] == lemma for r in own[form]):
                e['ownReaches'] += 1
            else:
                e['unreachedByOwn'].append(f'{form} > {lemma}')
            if any(r['text'] == lemma for r in yom[form]):
                e['yomitanReaches'] += 1
    totals = collections.Counter()
    for (tid, i), e in by.items():
        totals.update({k: v for k, v in e.items() if isinstance(v, int)})
        print(json.dumps({'transform': tid, 'rule': i, **e}, ensure_ascii=False))
    print(json.dumps(dict(totals)))


def main(argv):
    pos, opts = args_of(argv)
    if len(pos) != 3:
        raise SystemExit(__doc__)
    command, cache, dictionary = pos
    if command == 'freq':
        freq(cache, dictionary, opts)
    elif command == 'text':
        text(cache, dictionary, opts)
    elif command == 'sample':
        text(cache, dictionary, opts, sample=True)
    elif command == 'yomitan':
        yomitan(cache, dictionary, opts)
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
