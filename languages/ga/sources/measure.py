#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of README.md (Measurements 2-4) for the Irish pack.

Not run by any test. It looks words up as a host does with
languages/en/sources/lookup-batch.cpp (Lookup::lookup, 16 results, scan
length 16, no language options) and judges the first result that has a
definition:

  python3 languages/ga/sources/measure.py frequent  --cache <dir> --batch <lookup-batch> [--languages <dir>] [--out <dir>]
  python3 languages/ga/sources/measure.py realtext  --cache <dir> --batch <lookup-batch> [--languages <dir>] [--out <dir>]
  python3 languages/ga/sources/measure.py particles --cache <dir> --batch <lookup-batch> [--languages <dir>] [--out <dir>]

<cache> holds the inputs README.md names (Sources and licences), none of
which is committed:

  wty-ga-en/                      wty-ga-en 2026.10.22 imported by hoshidicts-cli import
  wty-ga-en-banks/                the same release unzipped (its term banks)
  gawiki-20261101-pages-articles.xml.bz2
  ud-irish-idt/ga_idt-ud-{train,dev,test}.conllu
  gle_sentences.tsv.bz2           Tatoeba's Irish sentences

frequent: the 10,000 most frequent word forms of the Irish Wikipedia
(articles, markup removed). A form's lemmas are those its wty-ga-en form-of
rows name, and the lemma UD Irish-IDT gives it most often. A form counts
when the pack's rules reach one of its lemmas from it; its first result is
right when it is the form's own entry or one of its lemmas.

realtext: every word of UD Irish-IDT (4,910 sentences of news, fiction,
web, legal and government text), looked up from the word to the end of its
sentence and judged against the treebank's lemma.

particles: the words of realtext and of Tatoeba's sentences that follow a
particle, article, possessive or preposition that mutates them, by
particle, judged as above (Tatoeba's words by their form-of rows).
"""

import argparse
import bz2
import collections
import glob
import json
import os
import re
import subprocess
import sys

LETTERS = 'A-Za-zÁÉÍÓÚáéíóú'
WORD = re.compile(f"[{LETTERS}]+(?:['’\\-][{LETTERS}]+)*")
LETTER_RUN = re.compile(f'[{LETTERS}]')


MUTATION_GLOSS = re.compile(r'^(?:eclipsed|lenited|h-prothesized|t-prothesized|prothesized|mutated) form of (\S+)')


def gloss_text(node):
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return ''.join(gloss_text(n) for n in node)
    if isinstance(node, dict):
        if node.get('data', {}).get('content') in ('preamble', 'details-entry-Etymology', 'details-entry-Grammar', 'backlink', 'examples'):
            return ''
        return gloss_text(node.get('content', ''))
    return ''


def read_banks(path):
    """Form-of targets of wty-ga-en's rows, with the targets of its "eclipsed
    form of X" entries, and its lemma headwords, from its term banks."""
    form_of = collections.defaultdict(set)
    lemmas = set()
    for bank in sorted(glob.glob(os.path.join(path, 'term_bank_*.json'))):
        for row in json.load(open(bank, encoding='utf-8')):
            definitions = row[5]
            references = [d for d in definitions if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0]]
            if references:
                for target, _rules in references:
                    form_of[row[0]].add(target)
            entries = [d for d in definitions if not isinstance(d, list)]
            if entries:
                lemmas.add(row[0])
                for d in entries:
                    m = MUTATION_GLOSS.match(gloss_text(d.get('content') if isinstance(d, dict) else d).strip())
                    if m:
                        form_of[row[0]].add(m.group(1).rstrip('.,;'))
    return form_of, lemmas


def read_conllu(paths):
    """Sentences of UD Irish-IDT: text and tokens (form, lemma, upos, start)."""
    sentences = []
    for path in paths:
        text, tokens = None, []
        for line in open(path, encoding='utf-8'):
            line = line.rstrip('\n')
            if line.startswith('# text = '):
                text = line[len('# text = '):]
            elif line == '':
                if text is not None and tokens:
                    sentences.append((text, place(text, tokens)))
                text, tokens = None, []
            elif not line.startswith('#'):
                cols = line.split('\t')
                if '-' in cols[0] or '.' in cols[0]:
                    continue
                tokens.append((cols[1], cols[2], cols[3]))
    return sentences


def place(text, tokens):
    """Finds each token in the sentence text, left to right."""
    out, at = [], 0
    for form, lemma, upos in tokens:
        i = text.find(form, at)
        if i < 0:
            continue
        out.append((form, lemma, upos, i))
        at = i + len(form)
    return out


def run_batch(args, texts):
    """Looks each text up with lookup-batch; returns its JSON answers in order."""
    result = subprocess.run([args.batch, args.languages, 'ga', os.path.join(args.cache, 'wty-ga-en')],
                            input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True)
    answers = [json.loads(line) for line in result.stdout.splitlines()]
    if len(answers) != len(texts):
        raise RuntimeError(f'lookup-batch answered {len(answers)} of {len(texts)} texts')
    return answers


def first_entry(answer):
    """The first result with a definition (form-of rows never appear with formOf follow)."""
    for result in answer['results']:
        if not result.get('formOf'):
            return result
    return None


def deinflections(args, words):
    """The texts the pack's rules reach from each word, with every option off."""
    result = subprocess.run([args.cli, '--languages', args.languages, 'deinflect', 'ga', '--stdin'],
                            input='\n'.join(words) + '\n', capture_output=True, text=True, check=True)
    reached = {}
    for line in result.stdout.splitlines():
        answer = json.loads(line)
        reached[answer['input']] = {r['text'] for r in answer['results']}
    return reached


def preprocessed(args, words):
    result = subprocess.run([args.cli, '--languages', args.languages, 'preprocess', 'ga', '--stdin'],
                            input='\n'.join(words) + '\n', capture_output=True, text=True, check=True)
    return {json.loads(line)['input']: [v['text'] for v in json.loads(line)['variants']] for line in result.stdout.splitlines()}


def wiki_text(path):
    """Plain text of the main-namespace articles of a MediaWiki XML dump."""
    page, ns, redirect, in_text, text = [], None, False, False, []
    with bz2.open(path, 'rt', encoding='utf-8') as f:
        for line in f:
            if '<page>' in line:
                ns, redirect, text = None, False, []
            elif '<ns>' in line:
                ns = line.strip()[4:-5]
            elif '<redirect' in line:
                redirect = True
            elif '<text' in line:
                in_text = True
                text.append(line[line.find('>') + 1:])
                if '</text>' in line:
                    in_text = False
            elif in_text:
                text.append(line)
                if '</text>' in line:
                    in_text = False
            elif '</page>' in line and ns == '0' and not redirect:
                yield strip_markup(''.join(text).replace('</text>', ''))
    del page


TEMPLATE = re.compile(r'\{\{[^{}]*\}\}')
TABLE = re.compile(r'\{\|.*?\|\}', re.S)
REF = re.compile(r'&lt;ref[^&]*?/&gt;|&lt;ref.*?&lt;/ref&gt;', re.S)
TAG = re.compile(r'&lt;[^&]*?&gt;')
FILE_LINK = re.compile(r'\[\[(?:File|Íomhá|Image|Pictiúr|Catagóir|Category)[^\[\]]*(?:\[\[[^\[\]]*\]\][^\[\]]*)*\]\]', re.I)
LINK = re.compile(r'\[\[(?:[^\[\]|]*\|)?([^\[\]]*)\]\]')
EXTERNAL = re.compile(r'\[https?://[^\s\]]*\s?([^\]]*)\]')
ENTITY = re.compile(r'&(?:amp;)?[a-z]+;')


def strip_markup(text):
    for _ in range(5):
        text, n = TEMPLATE.subn(' ', text)
        if n == 0:
            break
    text = TABLE.sub(' ', text)
    text = REF.sub(' ', text)
    text = TAG.sub(' ', text)
    text = FILE_LINK.sub(' ', text)
    text = LINK.sub(r'\1', text)
    text = EXTERNAL.sub(r'\1', text)
    text = ENTITY.sub(' ', text)
    return text.replace("'''", '').replace("''", '')


def frequency_list(path, top):
    counts = collections.Counter()
    for text in wiki_text(path):
        counts.update(m.group(0).replace('’', "'") for m in WORD.finditer(text))
    merged = collections.Counter()
    spelling = {}
    for form, n in counts.most_common():
        key = form.lower()
        merged[key] += n
        spelling.setdefault(key, form)  # the most frequent spelling
    return [(spelling[k], n) for k, n in merged.most_common(top)], sum(counts.values())


def gold_lemmas(sentences):
    """The lemma UD Irish-IDT gives each form most often (forms compared in lower case)."""
    by_form = collections.defaultdict(collections.Counter)
    for _text, tokens in sentences:
        for form, lemma, _upos, _start in tokens:
            by_form[form.lower()][lemma] += 1
    return {form: c.most_common(1)[0][0] for form, c in by_form.items()}


def judge(first, form, lemmas, named=frozenset()):
    """right-entry (the form's own entry) / right-lemma (the corpus lemma or
    one of the form's lemmas) / right-named (a lemma only the dictionary's
    form-of rows name) / multiword / none / wrong."""
    if first is None:
        return 'none'
    if len(first['matched']) > len(form):
        return 'multiword'
    expression = first['expression'].lower()
    if expression == form.lower():
        return 'right-entry'
    if expression in {l.lower() for l in lemmas}:
        return 'right-lemma'
    if expression in {l.lower() for l in named}:
        return 'right-named'
    return 'wrong'


def named_lemmas(form_of, form):
    """What wty-ga-en's form-of rows say a form is a form of, two references deep
    (bhaineann → baineann (lenited) → bain), as written and in lower case."""
    out = set()
    frontier = {form, form.lower()}
    for _ in range(2):
        nxt = set()
        for f in frontier:
            for target in form_of.get(f, ()):
                if target not in out:
                    out.add(target)
                    nxt.add(target)
        frontier = nxt
    return out


def rule_made(row, transform_ids):
    """Whether a pack rule (not only a dictionary's form-of reference) made the first result."""
    return any(step in transform_ids for step in row['trace'].split('|') if step)


class Judge:
    """Classifies a lookup's first result with a definition (README, Measurements):

    right-entry   the word's own entry (an exact match ranks first);
    right-lemma   the expected lemma (the treebank's, or the word's form-of rows' for the frequency list);
    right-named   a lemma the dictionary connects to the word: named by its form-of rows or by an
                  "eclipsed form of X" entry, two references deep, or a word whose own form-of rows
                  name the expected lemma;
    wrong         a lemma a pack rule made, other than the above, where the expected lemma is a headword;
    wrong-missing the same where the dictionary has no entry for the expected lemma;
    wrong-reference  a wrong lemma no pack rule made (a dictionary reference or an exact match of
                  another spelling);
    multiword     the first result matched more than the word (an expression such as go léir);
    none          no result.
    """

    def __init__(self, args):
        self.form_of, headwords = read_banks(os.path.join(args.cache, 'wty-ga-en-banks'))
        self.headwords = {h.lower() for h in headwords}
        self.ids = transform_ids(args)

    def named(self, form):
        first = named_lemmas(self.form_of, form)
        return first | {t for l in first for t in self.form_of.get(l, ())}

    def __call__(self, row, first, expected):
        verdict = judge(first, row['form'], expected, self.named(row['form']))
        if verdict != 'wrong':
            return verdict
        expected_lower = {e.lower() for e in expected}
        if expected_lower & {t.lower() for t in self.form_of.get(first['expression'], ())}:
            return 'right-named'
        if first['expression'] in {t for e in expected for t in self.form_of.get(e, ())}:
            return 'right-named'
        if not rule_made(row, self.ids):
            return 'wrong-reference'
        if not expected_lower & self.headwords:
            return 'wrong-missing'
        return 'wrong'


def summarise(rows, weight=None):
    total = collections.Counter()
    tokens = collections.Counter()
    for row in rows:
        total[row['verdict']] += 1
        tokens[row['verdict']] += weight(row) if weight else 1
    return {'rows': len(rows), 'by verdict': dict(total), **({'tokens by verdict': dict(tokens)} if weight else {})}


def write_wrong(out, name, rows, key):
    groups = collections.Counter(key(r) for r in rows if r['verdict'] == 'wrong')
    with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
        f.write('count\tform\texpected\tfirst result\ttrace\n')
        for k, n in groups.most_common():
            f.write(f'{n}\t' + '\t'.join(k) + '\n')
    return groups


def eval_rows(path):
    """The data rows of a test file, without its comment lines."""
    return [line for line in open(path, encoding='utf-8').read().split('\n') if line and not line.startswith('#')]


def cmd_eval(args):
    """Measurements 1: eval-language on the sample (corpus.tsv with gaps.tsv),
    cases.tsv, defaults.tsv and yomitan.tsv, for the own rules, Yomitan's, their
    union (tools/merge-transforms.mjs) and the final set, with every option on
    and with the pack's defaults (each file once without and once with the
    `# options: default` line)."""
    import tempfile
    root = os.path.abspath(os.path.join(args.languages, '..'))
    pack = os.path.join(args.languages, 'ga')
    tmp = tempfile.mkdtemp(prefix='ga-eval-')
    union = os.path.join(tmp, 'union.json')
    subprocess.run([args.node, os.path.join(root, 'tools', 'merge-transforms.mjs'), 'ga', '--languages', args.languages, '--out', union],
                   check=True, capture_output=True, text=True)
    sets = [('own', os.path.join(pack, 'sources', 'own.json')), ('yomitan', os.path.join(pack, 'sources', 'yomitan.json')),
            ('union', union), ('final', os.path.join(pack, 'transforms.json'))]
    tests = os.path.join(pack, 'tests')
    files = [('sample', eval_rows(os.path.join(tests, 'corpus.tsv')) + eval_rows(os.path.join(tests, 'gaps.tsv'))),
             ('cases.tsv', eval_rows(os.path.join(tests, 'cases.tsv'))),
             ('defaults.tsv', eval_rows(os.path.join(tests, 'defaults.tsv'))),
             ('yomitan.tsv', eval_rows(os.path.join(tests, 'yomitan.tsv')))]
    results = []
    for mode in ('all', 'default'):
        for name, rows in files:
            path = os.path.join(tmp, f'{mode}-{name}')
            with open(path, 'w', encoding='utf-8') as f:
                f.write(('# options: default\n' if mode == 'default' else '') + '\n'.join(rows) + '\n')
            for set_name, transforms in sets:
                out = subprocess.run([args.cli, '--languages', args.languages, 'eval-language', 'ga', path, '--transforms', transforms,
                                      '--dictionary', os.path.join(args.cache, 'wty-ga-en')], check=True, capture_output=True, text=True)
                answer = json.loads(out.stdout)
                results.append({'options': mode, 'file': name, 'rules': set_name, **answer})
    with open(os.path.join(args.out, 'eval.jsonl'), 'w', encoding='utf-8') as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    fmt = lambda v: '-' if v is None else (f'{v:.3f}' if isinstance(v, float) else str(v))
    print('| Options | File | Rules | Rows | Recall | Negatives passed | False candidates | First rank |')
    print('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |')
    for r in results:
        print(f"| {r['options']} | {r['file']} | {r['rules']} | {r['rows']} | {fmt(r['recall'])} | {fmt(r['negativesPassed'])} | "
              f"{fmt(r.get('falseCandidates'))} | {fmt(r.get('firstRank'))} |")


def cmd_dictpairs(args):
    """Per-rule counts on the dictionary's own inflection pairs: every
    single-word form-of row of wty-ga-en whose target is a single-word
    headword with a definition, as a corpus (form → target, the row's part of
    speech), run with eval-language --per-rule on the expanded final rules
    (sources/build-own.mjs --expanded, with build-final's provenance)."""
    import tempfile
    tmp = tempfile.mkdtemp(prefix='ga-pairs-')
    pairs = {}
    lemma_rows = set()
    banks = sorted(glob.glob(os.path.join(args.cache, 'wty-ga-en-banks', 'term_bank_*.json')))
    for bank in banks:
        for row in json.load(open(bank, encoding='utf-8')):
            if any(not isinstance(d, list) for d in row[5]):
                lemma_rows.add(row[0])
    single = re.compile(f"^[{LETTERS}'-]+$")
    for bank in banks:
        for row in json.load(open(bank, encoding='utf-8')):
            form, pos = row[0], row[3].split(' ')[0] if row[3] else '*'
            if not single.match(form):
                continue
            for d in row[5]:
                if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and single.match(d[0]) and d[0] != form and d[0] in lemma_rows:
                    pairs.setdefault((form, d[0], pos if pos in ('v', 'n', 'adj') else '*'), '/'.join(d[1]))
    corpus = os.path.join(args.out, 'dictpairs.tsv')
    with open(corpus, 'w', encoding='utf-8') as f:
        f.write('# wty-ga-en form-of rows (form → target), single words; not committed.\n')
        for (form, target, pos), label in sorted(pairs.items()):
            f.write(f'{label.replace(chr(9), " ")}\t1\t{form}\t{target}\t{pos}\t*\n')
    root = os.path.abspath(os.path.join(args.languages, '..'))
    expanded = os.path.join(tmp, 'expanded.json')
    subprocess.run([args.node, os.path.join(args.languages, 'ga', 'sources', 'build-own.mjs'), '--expanded', '--out', expanded],
                   check=True, capture_output=True, text=True, cwd=root)
    out = subprocess.run([args.cli, '--languages', args.languages, 'eval-language', 'ga', corpus, '--transforms', expanded, '--per-rule'],
                         check=True, capture_output=True, text=True)
    answer = json.loads(out.stdout)
    with open(os.path.join(args.out, 'dictpairs-perrule.json'), 'w', encoding='utf-8') as f:
        json.dump(answer, f, ensure_ascii=False)
    by_transform = collections.Counter()
    for r in answer['perRule']:
        by_transform[r['transform']] += r['recovers']
    print(json.dumps({'pairs': len(pairs), **{k: v for k, v in answer.items() if k != 'perRule'},
                      'rows only one transform recovers, by transform': dict(by_transform.most_common())}, ensure_ascii=False, indent=1))


def transform_ids(args):
    pack = json.load(open(os.path.join(args.languages, 'ga', 'transforms.json'), encoding='utf-8'))
    return {t['id'] for t in pack['transforms']}


def judge_answers(rows, answers, judge_row, expected_of):
    for row, answer in zip(rows, answers):
        first = first_entry(answer)
        row['first'] = first['expression'] if first else ''
        row['matched'] = first['matched'] if first else ''
        row['trace'] = '|'.join(first['trace']) if first else ''
        row['verdict'] = judge_row(row, first, expected_of(row))
        row['anywhere'] = any(r['expression'].lower() in {e.lower() for e in expected_of(row)} for r in answer['results'])
    return rows


WRONG = ('wrong', 'wrong-missing', 'wrong-reference')


def wrong_summary(rows, ids, weight=lambda r: 1):
    by_transform = collections.Counter()
    for r in rows:
        if r['verdict'] in ('wrong', 'wrong-missing'):
            for step in set(r['trace'].split('|')) & ids:
                by_transform[step] += weight(r)
    return dict(by_transform.most_common(20))


def cmd_frequent(args):
    judge_row = Judge(args)
    sentences = read_conllu(sorted(glob.glob(os.path.join(args.cache, 'ud-irish-idt', '*.conllu'))))
    gold = gold_lemmas(sentences)
    words, tokens = frequency_list(os.path.join(args.cache, 'gawiki-20261101-pages-articles.xml.bz2'), args.top)
    variants = preprocessed(args, [w for w, _ in words])
    reached_by = deinflections(args, sorted({v for w, _ in words for v in variants[w]}))
    rows = []
    for word, n in words:
        # A word's lemmas: what its form-of rows name, and its usual lemma in UD Irish-IDT.
        lemmas = set(judge_row.form_of.get(word, ())) | set(judge_row.form_of.get(word.lower(), ()))
        if word.lower() in gold:
            lemmas.add(gold[word.lower()])
        lemmas.discard(word)
        reached = {t for v in variants[word] for t in reached_by[v] if t != v}
        if not {l.lower() for l in lemmas} & {t.lower() for t in reached}:
            continue
        rows.append({'form': word, 'count': n, 'lemmas': sorted(lemmas)})
    judge_answers(rows, run_batch(args, [r['form'] for r in rows]), judge_row, lambda r: set(r['lemmas']))
    wrong = write_wrong(args.out, 'frequent-wrong.tsv', rows, lambda r: (r['form'], ','.join(r['lemmas']), r['first'], r['trace']))
    in_list = sum(n for _, n in words)
    weight = lambda r: r['count']
    summary = {'list': len(words), 'list tokens': in_list, 'wiki tokens': tokens, 'reached': len(rows),
               'reached tokens': sum(r['count'] for r in rows), **summarise(rows, weight),
               'wrong (any kind) share of list tokens': sum(r['count'] for r in rows if r['verdict'] in WRONG) / in_list,
               'rule-made wrong by transform (tokens)': wrong_summary(rows, judge_row.ids, weight),
               'top wrong': [f'{k[0]} → {k[2]} [{k[3]}] (expected {k[1]})' for k, _ in wrong.most_common(25)]}
    with open(os.path.join(args.out, 'frequent-rows.jsonl'), 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(json.dumps(summary, ensure_ascii=False, indent=1))


def hovers(sentences, keep=lambda prev, form: True):
    out = []
    for text, tokens in sentences:
        for i, (form, lemma, upos, start) in enumerate(tokens):
            if not LETTER_RUN.search(form):
                continue
            prev = tokens[i - 1][0].lower() if i > 0 else ''
            if keep(prev, form):
                out.append({'form': form, 'lemma': lemma, 'upos': upos, 'prev': prev, 'text': text[start:]})
    return out


def cmd_realtext(args):
    judge_row = Judge(args)
    sentences = read_conllu(sorted(glob.glob(os.path.join(args.cache, 'ud-irish-idt', '*.conllu'))))
    rows = hovers(sentences)
    judge_answers(rows, run_batch(args, [r['text'] for r in rows]), judge_row, lambda r: {r['lemma']})
    wrong = write_wrong(args.out, 'realtext-wrong.tsv', [dict(r, verdict='wrong' if r['verdict'] in WRONG else r['verdict']) for r in rows],
                        lambda r: (r['form'], r['lemma'], r['first'], r['trace']))
    summary = {'sentences': len(sentences), **summarise(rows),
               'lemma among the results': sum(r['anywhere'] for r in rows),
               'rule-made wrong by transform': wrong_summary(rows, judge_row.ids),
               'top wrong (any kind)': [f'{k[0]} → {k[2]} [{k[3]}] (UD {k[1]}) ×{n}' for k, n in wrong.most_common(30)]}
    with open(os.path.join(args.out, 'realtext-rows.jsonl'), 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(json.dumps(summary, ensure_ascii=False, indent=1))


# Words that mutate the next word, or after which it is elided.
PARTICLES = ['an', 'na', 'a', 'mo', 'do', 'ár', 'bhur', 'i', 'sa', 'san', 'den', 'don', 'ón', 'faoin', 'ag', 'ar', 'le', 'go',
             'ní', 'níor', 'nach', 'nár', 'má', 'dá', 'chomh']


def cmd_particles(args):
    judge_row = Judge(args)
    sentences = read_conllu(sorted(glob.glob(os.path.join(args.cache, 'ud-irish-idt', '*.conllu'))))
    rows = hovers(sentences, lambda prev, form: prev in PARTICLES)
    judge_answers(rows, run_batch(args, [r['text'] for r in rows]), judge_row, lambda r: {r['lemma']})
    tatoeba = []
    with bz2.open(os.path.join(args.cache, 'gle_sentences.tsv.bz2'), 'rt', encoding='utf-8') as f:
        for line in f:
            text = line.rstrip('\n').split('\t')[2].replace('’', "'")
            words = list(WORD.finditer(text))
            for i in range(1, len(words)):
                prev, word = words[i - 1].group(0).lower(), words[i].group(0)
                lemmas = judge_row.form_of.get(word) or judge_row.form_of.get(word.lower())
                if prev in PARTICLES and lemmas:
                    tatoeba.append({'form': word, 'prev': prev, 'text': text[words[i].start():], 'lemmas': sorted(lemmas)})
    judge_answers(tatoeba, run_batch(args, [r['text'] for r in tatoeba]), judge_row, lambda r: set(r['lemmas']))
    by_particle = {}
    for p in PARTICLES:
        sub = [r for r in rows + tatoeba if r['prev'] == p]
        if sub:
            v = collections.Counter(r['verdict'] for r in sub)
            by_particle[p] = {'words': len(sub), 'wrong': v['wrong'], 'wrong-missing': v['wrong-missing'],
                              'wrong-reference': v['wrong-reference'], 'none': v['none']}
    write_wrong(args.out, 'particles-wrong.tsv', [dict(r, verdict='wrong' if r['verdict'] in WRONG else r['verdict']) for r in rows + tatoeba],
                lambda r: (f"{r['prev']} {r['form']}", r.get('lemma') or ','.join(r['lemmas']), r['first'], r['trace']))
    summary = {'UD Irish-IDT': summarise(rows), 'Tatoeba (words with form-of rows)': summarise(tatoeba), 'by particle': by_particle}
    print(json.dumps(summary, ensure_ascii=False, indent=1))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['eval', 'dictpairs', 'frequent', 'realtext', 'particles'])
    parser.add_argument('--cache', required=True)
    parser.add_argument('--batch', help='lookup-batch built from languages/en/sources/lookup-batch.cpp (frequent, realtext, particles)')
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, '..', '..', '..'))
    parser.add_argument('--cli', default=os.path.join(root, 'build', 'hoshidicts-cli'))
    parser.add_argument('--node', default='node')
    parser.add_argument('--languages', default=os.path.join(root, 'languages'))
    parser.add_argument('--top', type=int, default=10000)
    parser.add_argument('--out', default='.')
    args = parser.parse_args()
    args.languages = os.path.abspath(args.languages)
    os.makedirs(args.out, exist_ok=True)
    if args.command not in ('eval', 'dictpairs') and not args.batch:
        parser.error(f'{args.command} needs --batch')
    {'eval': cmd_eval, 'dictpairs': cmd_dictpairs, 'frequent': cmd_frequent, 'realtext': cmd_realtext,
     'particles': cmd_particles}[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
