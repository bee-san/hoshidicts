#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The lookup measurements of README.md (Measurements 2-4). Not run by any test.

    python3 measure.py text <hover.tsv> [--sample 60]   real text: first results judged against the treebank
    python3 measure.py behind <hover.tsv>               the same at words after an article, pronoun, particle or εἰμί
    python3 measure.py frequent <agdt dir>              the 10,000 most frequent forms of the whole treebank
    python3 measure.py rules <hover.tsv | agdt dir>     the first results the rules change: the pack against the same
                                                        pack without rules (the dictionary's form-of rows alone)
    python3 measure.py compare <hover.tsv> --other <languages dir> [--trace <transform id>]
                                                        the first results that change between --languages and --other,
                                                        and the lookups of --other with a result through the transform
    python3 measure.py benchmark <hover.tsv>            sources/benchmark-words.txt: 60 texts from inflected words
    python3 measure.py traces <hover.tsv>               right first results whose trace starts with a case: does the
                                                        case and number agree with the treebank's tag?

hover.tsv is what make-hovers-agdt.py writes. Options: --batch build/lookup-batch, --cli build/hoshidicts-cli,
--languages languages, --dictionary <wty-grc-en imported>. A lookup is a host's hover: the text from the word to the
end of its sentence, 16 results, scan length 16, default options (lookup-batch). Every token is judged against its
own treebank lemma (sense digits removed):

- right: the first result is the lemma;
- variant: the same word written otherwise: other accents, vowel-length marks or capitals (not another breathing,
  which makes another word: οἷος, οἶος), or the dictionary's own entry for the word as written whose definition
  names the lemma or says it is the word elided or contracted (δ' "apocopic form of δέ");
- wrong: another lemma, or the word's own entry for another word (τῷ "then", for the article); `listed` when the
  lemma is among the 16 results;
- none: no result.

The frequent forms weigh each form by its tokens, each token with its own lemma.
"""
import argparse, collections, json, random, re, shutil, subprocess, sys, tempfile, unicodedata
from pathlib import Path
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument('command', choices=['text', 'behind', 'frequent', 'rules', 'compare', 'benchmark', 'traces'])
ap.add_argument('input')
ap.add_argument('--batch', default='build/lookup-batch')
ap.add_argument('--cli', default='build/hoshidicts-cli')
ap.add_argument('--languages', default='languages')
ap.add_argument('--dictionary')
ap.add_argument('--sample', type=int, default=0)
ap.add_argument('--show', type=int, default=10)
ap.add_argument('--n', type=int, default=10000)
ap.add_argument('--other')
ap.add_argument('--trace')
a = ap.parse_args()

NFC = lambda s: unicodedata.normalize('NFC', s)
ACCENTS = re.compile('[\u0300\u0301\u0342\u0304\u0306]')


def same_word(x, y):
    """The same letters and breathings: accents, vowel length and capitals aside."""
    f = lambda s: NFC(ACCENTS.sub('', unicodedata.normalize('NFD', s))).lower().replace('ς', 'σ')
    return f(x) == f(y)


def lookup(texts, languages=None):
    p = subprocess.run([a.batch, languages or a.languages, 'grc', a.dictionary, '16', '16'], input=('\n'.join(texts) + '\n').encode(), capture_output=True)
    if p.returncode != 0:
        sys.exit(f'lookup-batch exit {p.returncode}: {p.stderr.decode(errors="replace")[:300]}')
    out = [json.loads(l)['results'] for l in p.stdout.decode().splitlines()]
    assert len(out) == len(texts)
    return out


def names(gloss, lemma):
    """The definition names the lemma, or says the entry is an elided or contracted form (μ' "apocopic form of με")."""
    return (re.search(r'(^|[^\w])' + re.escape(lemma) + r'($|[^\w])', gloss) is not None
            or re.search(r'apocopic|elided|elision|crasis|contraction of', gloss) is not None)


def judge(results, gold, word):
    if not results:
        return 'none'
    r = results[0]
    first = NFC(r['expression'])
    if first == gold:
        return 'right'
    own = not r['trace'] and first.replace("'", '\u2019') == NFC(word).replace("'", '\u2019')
    if same_word(first, gold) or (own and names(r.get('gloss', ''), gold)):
        return 'variant'
    return 'wrong-listed' if any(NFC(x['expression']) == gold for x in results) else 'wrong'


def trace(r):
    return ' > '.join(r['trace']) or ('form-of row' if r.get('formOf') else 'as written')


ORDER = ('right', 'variant', 'wrong-listed', 'wrong', 'none')


def summary(name, rows):
    """rows: (verdict, weight, word, gold, results)."""
    c = collections.Counter()
    for v, w, *_ in rows:
        c[v] += w
    total = sum(c.values())
    wrong = c['wrong'] + c['wrong-listed']
    print(f'{name}: {total} ' + ', '.join(f'{k} {c[k]} ({c[k] / total:.4f})' for k in ORDER) + f'; wrong first {wrong} ({wrong / total:.4f})')
    groups = collections.Counter()
    ex = collections.defaultdict(collections.Counter)
    for v, w, word, gold, res in rows:
        if v.startswith('wrong'):
            k = trace(res[0])
            groups[k] += w
            ex[k][f'{word} → {res[0]["expression"]} (treebank {gold})'] += w
    for k, n in groups.most_common(a.show):
        print(f'  {n:6d} {k}: ' + '; '.join(f'{e} ×{m}' for e, m in ex[k].most_common(3)))
    return c


def read_hovers(path):
    items = []
    for line in open(path, encoding='utf-8'):
        c = line.rstrip('\n').split('\t')
        items.append({'text': c[0], 'word': c[1], 'gold': NFC(c[2]), 'pos': c[3], 'prev': c[4] if len(c) > 4 else '-', 'prevpos': c[5] if len(c) > 5 else '-'})
    return items


def frequent_forms(agdt):
    count = collections.Counter()
    golds = collections.defaultdict(collections.Counter)
    for path in sorted(Path(agdt).glob('*.tb.xml')):
        for w in ET.parse(path).iter('word'):
            form, lemma, pos = NFC(w.get('form') or ''), w.get('lemma') or '', w.get('postag') or ''
            if not form or not lemma or pos.startswith('u') or form.startswith('[') or not re.search('[\u0370-\u03ff\u1f00-\u1fff]', form):
                continue
            form = NFC(re.sub('([βγδζθκλμνξπρστφχψ])\u0313$', '\\1\u2019', unicodedata.normalize('NFD', form)))
            count[form] += 1
            golds[form][NFC(re.sub(r'\d+$', '', lemma))] += 1
    top = [w for w, _ in count.most_common(a.n)]
    return top, count, golds


def no_rules_pack():
    """A copy of the pack whose transforms are only those its settings name (off by default): its lookups show
    what the processors and the dictionary's form-of rows give alone."""
    tmp = Path(tempfile.mkdtemp(prefix='grc-norules-'))
    src = Path(a.languages) / 'grc'
    (tmp / 'grc').mkdir()
    shutil.copy(src / 'language.json', tmp / 'grc' / 'language.json')
    lang = json.loads((src / 'language.json').read_text(encoding='utf-8'))
    keep = {t for s in lang.get('settings', []) for t in s.get('effect', {}).get('transforms', [])}
    rules = json.loads((src / 'transforms.json').read_text(encoding='utf-8'))
    rules['transforms'] = [t for t in rules['transforms'] if t['id'] in keep]
    (tmp / 'grc' / 'transforms.json').write_text(json.dumps(rules, ensure_ascii=False), encoding='utf-8')
    return tmp


CASE_OF = {'gen-sg': ('s', 'g'), 'dat-sg': ('s', 'd'), 'acc-sg': ('s', 'a'), 'voc-sg': ('s', 'v'), 'nom-pl': ('p', 'nv'), 'gen-pl': ('p', 'g'),
           'dat-pl': ('p', 'd'), 'acc-pl': ('p', 'a'), 'na-pl': ('p', 'nav'), 'nav-du': ('d', 'nav'), 'gd-du': ('d', 'gd')}

if a.command == 'traces':
    items = read_hovers(a.input)
    results = lookup([it['text'] for it in items])
    c = collections.Counter()
    ex = collections.Counter()
    for it, r in zip(items, results):
        if not r or NFC(r[0]['expression']) != it['gold'] or not r[0]['trace'] or len(it['pos']) < 8:
            continue
        step = r[0]['trace'][0]
        if step not in CASE_OF:
            continue
        number, cases = CASE_OF[step]
        ok = it['pos'][2] == number and it['pos'][7] in cases
        c['agree' if ok else 'disagree'] += 1
        if not ok:
            ex[f'{step} for {it["pos"][2]}{it["pos"][7]} ({it["word"]})'] += 1
    print(f'right first results whose first step is a case: {sum(c.values())}; the case and number agree with the treebank for {c["agree"]}, not for {c["disagree"]}')
    for k, n in ex.most_common(a.show):
        print(f'  {n:5d} {k}')
elif a.command == 'benchmark':
    rnd = random.Random(1)
    items = [it for it in read_hovers(a.input) if NFC(it['word']) != it['gold'] and len(it['word']) >= 4 and not it['pos'][:1] in 'lgcdr']
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
            k = 'right here' if fx == it['gold'] else 'right in --other' if fy == it['gold'] else 'neither'
            c[k] += 1
            if len(ex[k]) < 5:
                ex[k].append(f'{it["word"]}: {fx} / {fy}')
    print(f'{sum(c.values())} of {len(items)} first results differ: ' + ', '.join(f'{k} {v}' for k, v in c.most_common()))
    for k, v in ex.items():
        print(f'  {k}: ' + '; '.join(v))
    if a.trace:
        hits = [(it, y) for it, y in zip(items, other) if any(a.trace in r['trace'] for r in y)]
        first = sum(1 for _, y in hits if a.trace in y[0]['trace'])
        right = sum(1 for it, y in hits if any(a.trace in r['trace'] and r['expression'] == it['gold'] for r in y))
        print(f'--other: {len(hits)} lookups have a result through {a.trace}; it is first in {first}; it is the treebank lemma in {right}')
elif a.command == 'rules':
    bare = no_rules_pack()
    if Path(a.input).is_dir():
        top, count, golds = frequent_forms(a.input)
        items = [(w, g, n) for w in top for g, n in golds[w].items()]
        res_pack = dict(zip(top, lookup(top)))
        res_bare = dict(zip(top, lookup(top, str(bare))))
        triples = [(w, g, n, res_pack[w], res_bare[w]) for w, g, n in items]
    else:
        hov = read_hovers(a.input)
        rp, rb = lookup([h['text'] for h in hov]), lookup([h['text'] for h in hov], str(bare))
        triples = [(h['word'], h['gold'], 1, x, y) for h, x, y in zip(hov, rp, rb)]
    shutil.rmtree(bare)
    made, lost = collections.Counter(), collections.Counter()
    ex = collections.defaultdict(collections.Counter)
    for word, gold, n, x, y in triples:
        ok_pack = judge(x, gold, word) in ('right', 'variant')
        ok_bare = judge(y, gold, word) in ('right', 'variant')
        if ok_pack and not ok_bare:
            made['n'] += n
        elif ok_bare and not ok_pack:
            lost['n'] += n
            k = trace(x[0]) if x else 'none'
            lost[k] += n
            ex[k][f'{word} → {x[0]["expression"] if x else None} (without rules {y[0]["expression"]})'] += n
    total = sum(t[2] for t in triples)
    print(f'{total} tokens: the rules make {made["n"]} right that the dictionary alone gets wrong, and {lost["n"]} wrong that it gets right')
    for k, n in lost.most_common(a.show + 1):
        if k == 'n':
            continue
        print(f'  {n:6d} {k}: ' + '; '.join(f'{e} ×{m}' for e, m in ex[k].most_common(4)))
elif a.command in ('text', 'behind'):
    items = read_hovers(a.input)
    results = lookup([it['text'] for it in items])
    rows = [(judge(r, it['gold'], it['word']), 1, it['word'], it['gold'], r) for r, it in zip(results, items)]
    if a.command == 'text':
        summary('real text', rows)
        if a.sample:
            rnd = random.Random(1)
            wrong = [i for i, row in enumerate(rows) if row[0].startswith('wrong')]
            for i in sorted(rnd.sample(wrong, min(a.sample, len(wrong)))):
                it, r = items[i], results[i]
                print(f'SAMPLE\t{i}\t{it["word"]}\t{it["gold"]}\t{it["pos"]}\t{r[0]["expression"]}\t{trace(r[0])}\t{" ".join(x["expression"] for x in r[1:6])}')
    else:
        classes = {
            'after the article': lambda it: it['prevpos'].startswith('l'),
            'after a pronoun': lambda it: it['prevpos'].startswith('p'),
            'after a particle': lambda it: it['prevpos'].startswith('g') or it['prevpos'].startswith('d') and it['prev'] in {'οὐ', 'μή', 'ἄν', 'οὐκ'},
            'after εἰμί': lambda it: it['prev'] == 'εἰμί',
        }
        for name, test in classes.items():
            summary(name, [row for row, it in zip(rows, items) if test(it)])
else:
    top, count, golds = frequent_forms(a.input)
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
    results = dict(zip(reached, lookup(reached)))
    rtokens = sum(count[w] for w in reached)
    print(f'{len(top)} most frequent forms of the treebank, {tokens} tokens; a rule reaches a treebank lemma of {len(reached)} forms '
          f'({rtokens} tokens, {rtokens / tokens:.4f})')
    rows = [(judge(results[w], g, w), n, w, g, results[w]) for w in reached for g, n in golds[w].items()]
    c = summary('their tokens, each judged against its own lemma', rows)
    wrong = c['wrong'] + c['wrong-listed']
    print(f'wrong first: {wrong} tokens, {wrong / tokens:.4f} of the list\'s tokens')
