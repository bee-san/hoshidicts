#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The lookup measurements of README.md (Measurements 2-4). Not run by any test.

    python3 measure.py text <hover.tsv> [--sample 60]   real text: first results judged against the treebank
    python3 measure.py behind <hover.tsv>               the same at words after an article, pronoun, particle or εἰμί
    python3 measure.py frequent <agdt dir>              the 10,000 most frequent forms of the whole treebank
    python3 measure.py compare <hover.tsv> --other <languages dir> [--trace <transform id>]
                                                        the first results that change between --languages and --other,
                                                        and the lookups of --other with a result through the transform
    python3 measure.py benchmark <hover.tsv>            sources/benchmark-words.txt: 60 texts from inflected words

hover.tsv is what make-hovers-agdt.py writes. Options: --batch build/lookup-batch, --cli build/hoshidicts-cli,
--languages languages, --dictionary <wty-grc-en imported>. A lookup is a host's hover: the text from the word to
the end of its sentence, 16 results, scan length 16, default options (lookup-batch). The first result is judged
against the treebank's lemma(s) of the word: exact (NFC), diacritics (the same letters), own (the dictionary's
entry for the word as written, such as δ' or the adverb αὐτοῦ), or wrong; a wrong first result is `listed` when
the lemma is among the 16. Groups are by the first result's trace.
"""
import argparse, collections, json, random, re, subprocess, sys, unicodedata
from pathlib import Path
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument('command', choices=['text', 'behind', 'frequent', 'compare', 'benchmark'])
ap.add_argument('input')
ap.add_argument('--batch', default='build/lookup-batch')
ap.add_argument('--cli', default='build/hoshidicts-cli')
ap.add_argument('--languages', default='languages')
ap.add_argument('--dictionary', required=True)
ap.add_argument('--sample', type=int, default=0)
ap.add_argument('--show', type=int, default=10)
ap.add_argument('--n', type=int, default=10000)
ap.add_argument('--other')
ap.add_argument('--trace')
a = ap.parse_args()

NFC = lambda s: unicodedata.normalize('NFC', s)
bare = lambda s: ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.combining(c)).lower()


def lookup(texts, languages=None):
    p = subprocess.run([a.batch, languages or a.languages, 'grc', a.dictionary, '16', '16'], input=('\n'.join(texts) + '\n').encode(), capture_output=True)
    if p.returncode != 0:
        sys.exit(f'lookup-batch exit {p.returncode}: {p.stderr.decode(errors="replace")[:300]}')
    out = [json.loads(l)['results'] for l in p.stdout.decode().splitlines()]
    assert len(out) == len(texts)
    return out


def judge(results, golds, word):
    if not results:
        return 'none'
    first = NFC(results[0]['expression'])
    if first in golds:
        return 'exact'
    if bare(first) in {bare(g) for g in golds}:
        return 'diacritics'
    if first.replace("'", '\u2019') == NFC(word).replace("'", '\u2019') and not results[0]['trace']:
        return 'own'
    return 'wrong-listed' if any(NFC(r['expression']) in golds for r in results) else 'wrong'


def trace(r):
    return ' > '.join(r['trace']) or ('form-of row' if r.get('formOf') else 'as written')


def summary(name, verdicts, items, results, weights=None):
    weights = weights or [1] * len(items)
    total = sum(weights)
    c = collections.Counter()
    for v, w in zip(verdicts, weights):
        c[v] += w
    wrong = sum(c[k] for k in ('wrong', 'wrong-listed'))
    print(f'{name}: {len(items)} lookups ({total} weighted); ' + ', '.join(f'{k} {c[k]} ({c[k] / total:.4f})' for k in ('exact', 'diacritics', 'own', 'wrong-listed', 'wrong', 'none')) +
          f'; wrong first {wrong} ({wrong / total:.4f})')
    groups = collections.Counter()
    ex = collections.defaultdict(collections.Counter)
    for v, it, res, w in zip(verdicts, items, results, weights):
        if v.startswith('wrong'):
            k = trace(res[0])
            groups[k] += w
            ex[k][f'{it["word"]} → {res[0]["expression"]} (treebank {"/".join(sorted(it["golds"]))})'] += w
    for k, n in groups.most_common(a.show):
        print(f'  {n:6d} {k}: ' + '; '.join(f'{e} ×{m}' for e, m in ex[k].most_common(3)))


def read_hovers(path):
    items = []
    for line in open(path, encoding='utf-8'):
        c = line.rstrip('\n').split('\t')
        items.append({'text': c[0], 'word': c[1], 'golds': {NFC(c[2])}, 'pos': c[3], 'prev': c[4] if len(c) > 4 else '-', 'prevpos': c[5] if len(c) > 5 else '-'})
    return items


if a.command == 'benchmark':
    rnd = random.Random(1)
    items = [it for it in read_hovers(a.input) if NFC(it['word']) not in it['golds'] and len(it['word']) >= 4 and not it['pos'][:1] in 'lgcdr']
    for it in rnd.sample(items, 60):
        print(' '.join(it['text'].split(' ')[:6]))
elif a.command == 'compare':
    items = read_hovers(a.input)
    texts = [it['text'] for it in items]
    mine, other = lookup(texts), lookup(texts, a.other)
    c = collections.Counter()
    ex = collections.defaultdict(list)
    for it, x, y in zip(items, mine, other):
        fx, fy = (x[0]['expression'] if x else None), (y[0]['expression'] if y else None)
        if fx != fy:
            k = 'right here' if fx in it['golds'] else 'right in --other' if fy in it['golds'] else 'neither'
            c[k] += 1
            if len(ex[k]) < 5:
                ex[k].append(f'{it["word"]}: {fx} / {fy}')
    print(f'{sum(c.values())} of {len(items)} first results differ: ' + ', '.join(f'{k} {v}' for k, v in c.most_common()))
    for k, v in ex.items():
        print(f'  {k}: ' + '; '.join(v))
    if a.trace:
        hits = [(it, y) for it, y in zip(items, other) if any(a.trace in r['trace'] for r in y)]
        first = sum(1 for _, y in hits if a.trace in y[0]['trace'])
        right = sum(1 for it, y in hits if any(a.trace in r['trace'] and r['expression'] in it['golds'] for r in y))
        print(f'--other: {len(hits)} lookups have a result through {a.trace}; it is first in {first}; it is the treebank lemma in {right}')
elif a.command in ('text', 'behind'):
    items = read_hovers(a.input)
    results = lookup([it['text'] for it in items])
    verdicts = [judge(r, it['golds'], it['word']) for r, it in zip(results, items)]
    if a.command == 'text':
        summary('real text', verdicts, items, results)
        if a.sample:
            rnd = random.Random(1)
            wrong = [i for i, v in enumerate(verdicts) if v.startswith('wrong')]
            for i in sorted(rnd.sample(wrong, min(a.sample, len(wrong)))):
                it, r = items[i], results[i]
                print(f'SAMPLE\t{i}\t{it["word"]}\t{"/".join(it["golds"])}\t{it["pos"]}\t{r[0]["expression"]}\t{trace(r[0])}\t{" ".join(x["expression"] for x in r[1:6])}')
    else:
        EIMI = {'εἰμί'}
        classes = {
            'after the article': lambda it: it['prevpos'].startswith('l'),
            'after a pronoun': lambda it: it['prevpos'].startswith('p'),
            'after a particle': lambda it: it['prevpos'].startswith('g') or it['prevpos'].startswith('d') and it['prev'] in {'οὐ', 'μή', 'ἄν', 'οὐκ'},
            'after εἰμί': lambda it: it['prev'] in EIMI,
        }
        for name, test in classes.items():
            idx = [i for i, it in enumerate(items) if test(it)]
            summary(name, [verdicts[i] for i in idx], [items[i] for i in idx], [results[i] for i in idx])
else:
    count = collections.Counter()
    golds = collections.defaultdict(collections.Counter)
    for path in sorted(Path(a.input).glob('*.tb.xml')):
        for w in ET.parse(path).iter('word'):
            form, lemma, pos = NFC(w.get('form') or ''), w.get('lemma') or '', w.get('postag') or ''
            if not form or not lemma or pos.startswith('u') or form.startswith('[') or not re.search('[\u0370-\u03ff\u1f00-\u1fff]', form):
                continue
            form = re.sub('([βγδζθκλμνξπρστφχψ])\u0313$', '\\1\u2019', unicodedata.normalize('NFD', form))
            form = NFC(form)
            count[form] += 1
            golds[form][NFC(re.sub(r'\d+$', '', lemma))] += 1
    top = [w for w, _ in count.most_common(a.n)]
    tokens = sum(count[w] for w in top)
    pre = subprocess.run([a.cli, '--languages', a.languages, 'preprocess', 'grc', '--stdin'], input='\n'.join(top) + '\n', capture_output=True, text=True, check=True).stdout
    variants = {json.loads(l)['input']: [v['text'] for v in json.loads(l)['variants']] for l in pre.splitlines()}
    allv = sorted({v for vs in variants.values() for v in vs})
    p = subprocess.run([a.cli, '--languages', a.languages, 'deinflect', 'grc', '--stdin'], input=('\n'.join(allv) + '\n').encode(), capture_output=True)
    if p.returncode != 0:
        sys.exit(f'deinflect exit {p.returncode}')
    reach = {}
    for l in p.stdout.decode().splitlines():
        d = json.loads(l)
        reach[d['input']] = {r['text'] for r in d['results'] if r['trace']}
    reached = [w for w in top if any(g in reach.get(v, ()) for v in variants[w] for g in golds[w])]
    results = lookup(reached)
    items = [{'word': w, 'golds': set(golds[w])} for w in reached]
    verdicts = [judge(r, it['golds'], it['word']) for r, it in zip(results, items)]
    print(f'{len(top)} most frequent forms of the treebank, {tokens} tokens; a rule reaches a treebank lemma of {len(reached)} '
          f'({sum(count[w] for w in reached)} tokens, {sum(count[w] for w in reached) / tokens:.4f})')
    summary('reached forms', verdicts, items, results)
    summary('reached forms by tokens', verdicts, items, results, [count[w] for w in reached])
    wt = sum(count[w] for w, v in zip(reached, verdicts) if v.startswith('wrong'))
    print(f'wrong first: {wt} tokens, {wt / tokens:.4f} of the list\'s tokens')
