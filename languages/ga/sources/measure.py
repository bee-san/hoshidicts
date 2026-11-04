#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of README.md (Measurements 1-4) for the Irish pack.

Not run by any test. eval and dictpairs run hoshidicts-cli eval-language;
frequent, realtext, particles and traces look words up as a host does with
build/lookup-batch-ga (languages/ga/sources/lookup-batch.cpp: Lookup::lookup,
16 results, scan length 16, no language options) and judge the first result
that has a definition (class Judge):

  python3 languages/ga/sources/measure.py eval      --cache <dir> [--languages <dir>] [--out <dir>]
  python3 languages/ga/sources/measure.py dictpairs --cache <dir> [--out <dir>]
  python3 languages/ga/sources/measure.py frequent  --cache <dir> --batch build/lookup-batch-ga [--languages <dir>] [--out <dir>]
  python3 languages/ga/sources/measure.py realtext  --cache <dir> --batch build/lookup-batch-ga [--languages <dir>] [--out <dir>]
  python3 languages/ga/sources/measure.py particles --cache <dir> --batch build/lookup-batch-ga [--languages <dir>] [--out <dir>]
  python3 languages/ga/sources/measure.py traces    --cache <dir> --batch build/lookup-batch-ga [--languages <dir>]

--languages <dir> measures a scratch copy of the pack (another
transforms.json, or untaggedTerms "pass"). <cache> holds the inputs README.md
names (Sources and licences), none of which is committed:

  wty-ga-en/                      wty-ga-en 2026.10.22 imported by hoshidicts-cli import
  wty-ga-en-banks/                the same release unzipped (its term banks)
  gawiki-20261101-pages-articles.xml.bz2
  ud-irish-idt/ga_idt-ud-{train,dev,test}.conllu
  gle_sentences.tsv.bz2           Tatoeba's Irish sentences

eval: eval-language --dictionary on the sample (corpus.tsv with gaps.tsv),
cases.tsv, defaults.tsv and yomitan.tsv, for the own, Yomitan, union and
final rules, with every option on and with the pack's defaults.

dictpairs: eval-language --per-rule on wty-ga-en's single-word form-of pairs.

frequent: the 10,000 most frequent word forms of the Irish Wikipedia
(articles, markup removed). A form's lemmas are those its wty-ga-en form-of
rows name, and the lemma UD Irish-IDT gives it most often. A form counts
when the pack's rules reach one of its lemmas from it.

realtext: every word of UD Irish-IDT (4,910 sentences of news, fiction,
web, legal and government text), looked up from the word to the end of its
sentence and judged against the treebank's lemma.

particles: the words of UD Irish-IDT and of Tatoeba's sentences that follow
a particle, article, possessive or preposition that mutates them, by
particle (Tatoeba's words judged by their form-of rows).

traces: whether the trace shown for each verb row of the sample names its
tense, mood or form.
"""

import argparse
import atexit
import bz2
import collections
import glob
import json
import os
import re
import shutil
import subprocess
import sys

LETTERS = 'A-Za-zÁÉÍÓÚáéíóú'
WORD = re.compile(f"[{LETTERS}]+(?:['’\\-][{LETTERS}]+)*")
LETTER_RUN = re.compile(f'[{LETTERS}]')


MUTATION_GLOSS = re.compile(r'^(?:eclipsed|lenited|h-prothesized|t-prothesized|prothesized|mutated) form of (\S+)')


# Parts of a card that are not its glosses: the preamble (grammar, etymology),
# example sentences, synonym, antonym and related-word lists, and the backlink.
NOT_GLOSS = {'preamble', 'details-entry-Etymology', 'details-entry-Grammar', 'backlink', 'examples', 'details-entry-examples',
             'extra-info', 'synonyms', 'antonyms', 'related-words'}
BLOCK = {'div', 'li', 'ol', 'ul', 'details', 'summary', 'table', 'tr', 'td', 'th', 'p', 'br'}


def gloss_text(node):
    """The text of a structured-content node without the parts NOT_GLOSS names;
    block elements are separated by a space ("that... is" and "2 examples" do
    not run together)."""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return ''.join(gloss_text(n) for n in node)
    if isinstance(node, dict):
        if node.get('data', {}).get('content') in NOT_GLOSS:
            return ''
        text = gloss_text(node.get('content', ''))
        return f' {text} ' if node.get('tag') in BLOCK else text
    return ''


def senses(definition):
    """The senses of one definition of a term-bank row: each item of its glosses
    list, or the whole text when it has none."""
    content = definition.get('content') if isinstance(definition, dict) else definition
    found = []

    def walk(node):
        if isinstance(node, list):
            for n in node:
                walk(n)
        elif isinstance(node, dict):
            if node.get('data', {}).get('content') == 'glosses':
                items = node.get('content')
                found.extend(gloss_text(i) for i in (items if isinstance(items, list) else [items]))
            elif node.get('data', {}).get('content') not in NOT_GLOSS:
                walk(node.get('content'))
    walk(content)
    out = [' '.join(s.split()) for s in (found or [gloss_text(content)])]
    return [s for s in out if s]


# A sense that describes a letter ("The capital form of the letter ó.", "The
# letter a with an acute accent", "the letter C in the Ogham alphabet") names no
# lemma: Ó the letter is not ó "from".
LETTER_SENSE = re.compile(r"\bletter\b.*\balphabet\b|\balphabet\b.*\bletter\b|\bform of the letter\b|\bthe letter \S{1,2}\b|"
                          r"\bscript letter\b|\bOgham letter\b", re.I)
# The copula's lemma is is; Wiktionary's glosses of its forms call it the copula
# (ní "not (present copular form)", gurb "that... is").
COPULA_SENSE = re.compile(r'\bcopula|\bcopular', re.I)


class Banks:
    """What wty-ga-en says about each headword, from its term banks:

    form_of[h]   the targets of h's form-of references, as written (one hop);
    glosses[h]   the gloss texts of h's rows with definitions (what h's card shows);
    cards[h]     the X of h's "eclipsed / lenited / t-prothesized form of X" glosses;
    card_only    the headwords every gloss of which is such a mutation-form gloss;
    headwords    the headwords with a definition, and the first part of each
                 Wiktionary page title written as a headword (i/languages A to L → i).
    """

    def __init__(self, path):
        self.form_of = collections.defaultdict(set)
        self.glosses = collections.defaultdict(list)
        self.cards = collections.defaultdict(set)
        card_glosses = collections.Counter()
        letter_senses = collections.Counter()
        all_glosses = collections.Counter()
        self.headwords = set()
        for bank in sorted(glob.glob(os.path.join(path, 'term_bank_*.json'))):
            for row in json.load(open(bank, encoding='utf-8')):
                head = row[0]
                for d in row[5]:
                    if isinstance(d, list):
                        if len(d) == 2 and isinstance(d[0], str) and d[0]:
                            self.form_of[head].add(d[0])
                        continue
                    self.headwords.add(head)
                    self.headwords.add(page(head))
                    for text in senses(d):
                        self.glosses[head].append(text)
                        all_glosses[head] += 1
                        m = MUTATION_GLOSS.match(text)
                        if m:
                            self.cards[head].add(m.group(1).rstrip('.,;'))
                            card_glosses[head] += 1
                        if LETTER_SENSE.search(text):
                            letter_senses[head] += 1
        self.card_only = {h for h, n in card_glosses.items() if n == all_glosses[h]}
        self.letter_only = {h for h, n in letter_senses.items() if n == all_glosses[h]}

    def names(self, head, lemma):
        """Whether head's card names lemma: a sense of one of head's rows with
        definitions has lemma as a word (not counting senses that describe a
        letter), or lemma is the copula is and a sense calls it the copula. A
        lookup shows these senses; head's form-of references are not on the card
        (formOf follow drops them from it and shows their targets as results of
        their own)."""
        word = re.compile(r'(?<![\w-])' + re.escape(page(lemma)) + r'(?![\w-])')
        for g in self.glosses.get(head, ()):
            if LETTER_SENSE.search(g):
                continue
            if word.search(g) or (lemma == 'is' and COPULA_SENSE.search(g)):
                return True
        return False


def read_banks(path):
    """Form-of targets (one hop, as written) and lemma headwords of wty-ga-en."""
    banks = Banks(path)
    return banks.form_of, banks.headwords


def read_conllu(paths):
    """Sentences of UD Irish-IDT: text and tokens (form, lemma, upos, start, feats)."""
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
                tokens.append((cols[1], cols[2], cols[3], cols[5]))
    return sentences


def place(text, tokens):
    """Finds each token in the sentence text, left to right."""
    out, at = [], 0
    for form, lemma, upos, feats in tokens:
        i = text.find(form, at)
        if i < 0:
            continue
        out.append((form, lemma, upos, i, feats))
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


class Gold(dict):
    """The lemma UD Irish-IDT gives each form most often: as written (baile → baile,
    Baile → Baile in Baile Átha Cliath), else in lower case; and the forms most
    of whose tokens UD marks Foreign=Yes (The, of, Irish)."""

    def __init__(self, sentences):
        super().__init__()
        exact = collections.defaultdict(collections.Counter)
        lower = collections.defaultdict(collections.Counter)
        foreign = collections.Counter()
        total = collections.Counter()
        for _text, tokens in sentences:
            for form, lemma, _upos, _start, feats in tokens:
                exact[form][lemma] += 1
                lower[form.lower()][lemma] += 1
                total[form] += 1
                foreign[form] += 'Foreign=Yes' in feats.split('|')
        self.exact = {f: c.most_common(1)[0][0] for f, c in exact.items()}
        self.update({f: c.most_common(1)[0][0] for f, c in lower.items()})
        self.foreign = {f for f, n in foreign.items() if 2 * n > total[f]}

    def of(self, word):
        return self.exact.get(word) or self.get(word.lower())


def gold_lemmas(sentences):
    return Gold(sentences)


MUTATIONS = {'lenition', 'eclipsis', 'h-prefix', 't-prefix', 'elision'}


def page(head):
    """A Wiktionary page title written as a headword (wty-ga-en's i/languages A to L
    for the preposition i) stands for its first part."""
    return head.split('/')[0] if '/' in head[1:] else head


def same(a, b):
    """Two headwords are the same word: equal as written (case counts: I is the
    letter, i the preposition), or one is a page title of the other."""
    return page(a) == page(b)


def lower_first(s):
    return s[:1].lower() + s[1:]


# First results the categories right-entry and right-named would accept but
# which are wrong, judged by hand (README, Measurements 4): every right-entry and
# right-named group of UD Irish-IDT with 5 or more lookups and every such word of
# the frequency list was read. Keys are (expected lemma or the word as written,
# first result). Names whose element a card gives literally (Ó Cléirigh "clerk",
# Gleann "glen") count as right; these read a word as an unrelated one.
HAND_WRONG = {
    ('foráil', 'foláir'): 'wty-ga-en files foráil (provision) only as an alternative of foláir (ní foláir)',
    ('do', 'dom'): 'the card is do + mo "to my"; the word is "to me"',
    ('gach_uile', 'cuile'): 'chuile "every" shown as cuile "pantry"',
    ('deasca', 'deasc'): 'de dheasca "because of" shown as deasc "desk"',
    ('fud', 'fad'): 'ar fud "throughout" shown as fad "length"',
    ('léig', 'lig'): 'dul i léig "decline" shown as lig "to let"',
    ('aistrithe', 'aistrí'): 'the verbal adjective "translated" shown as aistrí "transferee"',
    ('eagraithe', 'eagraí'): 'the verbal adjective "organised" shown as eagraí "organiser"',
    ('maraithe', 'maraí'): 'the verbal adjective "killed" shown as maraí "mariner"',
    ('saothraithe', 'saothraí'): 'the verbal adjective "cultivated" shown as saothraí "labourer"',
    ('buailte', 'buaile'): 'the verbal adjective "struck" shown as buaile "milking place"',
    ('sealbhaigh', 'sealbhach'): 'the verb "acquired" shown as the adjective sealbhach',
    ('beartas', 'beart'): 'beartas "policy" shown as beart "bundle"',
    ('Láirge', 'láirig'): 'Port Láirge (Waterford) shown as láirig "thigh"',
    ('Garman', 'garma'): 'Loch Garman (Wexford) shown as garma "beam"',
    ('Caoin', 'caoin'): 'Dún Chaoin shown as caoin "smooth; to keen"',
    ('Cadhain', 'cadhan'): 'the surname Ó Cadhain shown as cadhan "brent goose"',
    ('Liatháin', 'liathán'): 'the surname Ó Liatháin shown as liathán "spleen"',
    ('Conaire', 'conair'): 'the name Conaire shown as conair "path"',
    ('cais', 'cas'): 'Dál gCais shown as cas "twisted"',
    ('Theo', 'teo'): 'the name Theo shown as teo "warmth"',
    ('Chris', 'crios'): 'the name Chris shown as crios "belt"',
}


class Judge:
    """Classifies a lookup's first result with a definition (README, Measurements).
    Headwords are compared as written; references are followed one hop, as written.

    right-lemma      the expected lemma: UD Irish-IDT's for the treebank; for the frequency
                     list, the treebank's most frequent lemma of the word or a lemma the
                     word's form-of rows name;
    right-entry      the word's own entry (the word as written, or with a small first letter
                     at the start of a sentence, or with only its mutation removed by a pack
                     rule) whose card names the expected lemma (a gloss, a reference or a
                     mutation-form gloss of it names it: bhíonn → bíonn "habitual present of bí");
    right-named      the expected lemma has no entry in wty-ga-en, and the first result is what
                     the word's or the lemma's own form-of rows name (curtha → cuir, where the
                     treebank's lemma is the verbal adjective curtha);
                     neither right-entry nor right-named applies to a word UD marks
                     Foreign=Yes (The, of), to a card that only describes a letter (Ó,
                     "The capital form of the letter ó"), or to a pair in HAND_WRONG;
    form-entry       a mutation-form card ("eclipsed form of X"): the dictionary's own entry
                     for the mutated word, which names X but defines nothing, also when its
                     headword is the expected lemma (dtí). It is neither right nor wrong;
                     row['card'] says whether X is the expected lemma (gcathair → cathair)
                     or another word (bhfuil → fuil, where the word is bí; mbeidh → beidh,
                     itself a form of bí; dtí → tí);
    wrong            another headword, with a trace step of a pack rule;
    wrong-missing    the same where wty-ga-en has no entry for the expected lemma;
    wrong-reference  another headword reached by the dictionary alone: the exact match of
                     another word or of a capitalised entry (Ní, the surname prefix, at the
                     start of a sentence), or a form-of reference without a pack rule;
    multiword        the first result matched more than the word (go léir);
    none             no result.

    Trace steps are a pack rule's unless lookup-batch-ga marks them as a form-of
    reference's rule (wty-ga-en names its references lenition, genitive, ... too).
    """

    def __init__(self, args):
        self.banks = Banks(os.path.join(args.cache, 'wty-ga-en-banks'))
        self.form_of = self.banks.form_of
        self.headwords = self.banks.headwords
        self.ids = transform_ids(args)

    def missing(self, expected):
        return not any(page(e) in self.headwords for e in expected)

    def __call__(self, row, first, expected):
        if first is None:
            return 'none'
        if len(first['matched']) > len(row['form']):
            return 'multiword'
        flags = first.get('dictionary', [False] * len(first['trace']))
        steps = [s for s, d in zip(first['trace'], flags) if not d]
        rule = any(s in self.ids for s in steps)
        expression = first['expression']
        form = row['form']
        banks = self.banks
        # A mutation card is counted apart even when its headword is the expected
        # lemma (go dtí: UD's lemma dtí, the card "eclipsed form of tí").
        if expression in banks.card_only:
            row['card'] = 'names the lemma' if any(same(t, e) for t in banks.cards[expression] for e in expected) else 'names another word'
            return 'form-entry'
        if any(same(expression, e) for e in expected):
            return 'right-lemma'
        missing = self.missing(expected)
        hand = (form, expression) in HAND_WRONG or any((e, expression) in HAND_WRONG for e in expected)
        if not (row.get('foreign') or expression in banks.letter_only or hand):
            own = expression in (form, lower_first(form)) or (steps and not any(flags) and set(steps) <= MUTATIONS)
            if own and any(banks.names(expression, e) for e in expected):
                return 'right-entry'
            if missing:
                named = set(banks.form_of.get(form, ())) | set(banks.form_of.get(lower_first(form), ()))
                named |= {t for e in expected for t in banks.form_of.get(e, ())}
                if any(same(expression, n) for n in named):
                    return 'right-named'
        if not rule:
            return 'wrong-reference'
        return 'wrong-missing' if missing else 'wrong'


def summarise(rows, weight=None):
    total = collections.Counter()
    tokens = collections.Counter()
    cards = collections.Counter()
    reference = collections.Counter()
    for row in rows:
        total[row['verdict']] += 1
        tokens[row['verdict']] += weight(row) if weight else 1
        if row['verdict'] == 'form-entry':
            cards[row.get('card')] += weight(row) if weight else 1
        if row['verdict'] == 'wrong-reference':
            reference[f"{row['form']} → {row['first']}"] += weight(row) if weight else 1
    return {'rows': len(rows), 'by verdict': dict(total), **({'tokens by verdict': dict(tokens)} if weight else {}),
            'form-entry cards': dict(cards), 'wrong-reference, largest': dict(reference.most_common(25))}


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
    root = args.root
    pack = os.path.join(args.languages, 'ga')
    tmp = tempfile.mkdtemp(prefix='ga-eval-')
    atexit.register(shutil.rmtree, tmp, True)  # the scratch directory goes when the command ends
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
    atexit.register(shutil.rmtree, tmp, True)  # the scratch directory goes when the command ends
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
        f.write('# options: default\n# wty-ga-en form-of rows (form → target), single words; not committed.\n')
        for (form, target, pos), label in sorted(pairs.items()):
            f.write(f'{label.replace(chr(9), " ")}\t1\t{form}\t{target}\t{pos}\t*\n')
    root = args.root
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


TENSE_OF = {
    # transform id → the UniMorph features it names
    'present-1sg': {'PRS', 'IMP'}, 'present': {'PRS'}, 'present-1pl': {'PRS'}, 'present-autonomous': {'PRS', 'IMP'},
    'present-2sg-munster': {'PRS'}, 'present-3pl-munster': {'PRS'},
    'past': {'PST'}, 'past-1sg-munster': {'PST'}, 'past-2sg-munster': {'PST'}, 'past-1pl': {'PST'}, 'past-2pl-munster': {'PST'},
    'past-3pl-munster': {'PST'}, 'adh': {'PST', 'HAB', 'IMP', 'SBJV'},
    'future': {'FUT'}, 'future-1pl': {'FUT'}, 'future-autonomous': {'FUT'}, 'future-1sg-munster': {'FUT'}, 'future-2sg-munster': {'FUT'},
    'future-3pl-munster': {'FUT'}, 'future-relative-munster': {'FUT'},
    'conditional-1sg': {'COND'}, 'conditional-2sg': {'COND'}, 'conditional': {'COND'}, 'conditional-1pl': {'COND'},
    'conditional-3pl': {'COND'}, 'conditional-autonomous': {'COND'},
    'habitual-1sg': {'HAB', 'SBJV'}, 'habitual-2sg': {'HAB', 'SBJV'}, 'habitual-1pl': {'HAB', 'SBJV', 'IMP'},
    'habitual-3pl': {'HAB', 'SBJV', 'IMP'}, 'habitual-autonomous': {'HAB', 'SBJV'},
    'imperative-2pl': {'IMP'}, 'subjunctive': {'SBJV'},
    'verbal-adjective': {'V.PTCP'}, 'verbal-noun': {'V.MSDR'},
}


def cmd_traces(args):
    """Trace quality: for each verb row of the sample (corpus.tsv) a lookup
    reaches, whether the trace it shows for the row's lemma names the row's
    tense, mood or form (UniMorph PRS, PST, FUT, COND, HAB, SBJV, IMP,
    V.PTCP, V.MSDR) and, for the past, whether it names only the lenition or
    elided d' that marks it."""
    tests = os.path.join(args.languages, 'ga', 'tests')
    rows = [l.split('\t') for l in open(os.path.join(tests, 'corpus.tsv'), encoding='utf-8').read().split('\n')
            if l and not l.startswith('#') and l.split('\t')[0].startswith('V;')]
    answers = run_batch(args, [r[2] for r in rows])
    counts = collections.Counter()
    examples = collections.defaultdict(list)
    for (tag, _valid, source, term, *_), answer in zip(rows, answers):
        features = set(tag.split(';'))
        wanted = features & {'PRS', 'PST', 'FUT', 'COND', 'HAB', 'SBJV', 'IMP', 'V.PTCP', 'V.MSDR'}
        if 'HAB' in features:
            wanted -= {'PST'}
        result = next((r for r in answer['results'] if r['expression'] == term), None)
        if result is None:
            counts['lemma not among the results'] += 1
            continue
        steps = [s for s, d in zip(result['trace'], result.get('dictionary', [False] * len(result['trace']))) if not d]
        named = set().union(*(TENSE_OF.get(s, set()) for s in steps)) if steps else set()
        if wanted & named:
            counts['names it'] += 1
        elif 'PST' in wanted and steps and set(steps) <= {'lenition', 'elision'}:
            counts['past shown as lenition or elision only'] += 1
            examples['past shown as lenition or elision only'].append(source)
        elif not steps:
            counts['dictionary reference only'] += 1
            examples['dictionary reference only'].append(f"{source} [{'|'.join(result['trace'])}]")
        else:
            counts['other'] += 1
            examples['other'].append(f"{source} {tag} [{'|'.join(result['trace'])}]")
    print(json.dumps({'verb rows': len(rows), **counts, 'examples': {k: v[:12] for k, v in examples.items()}}, ensure_ascii=False, indent=1))


def transform_ids(args):
    pack = json.load(open(os.path.join(args.languages, 'ga', 'transforms.json'), encoding='utf-8'))
    return {t['id'] for t in pack['transforms']}


def judge_answers(rows, answers, judge_row, expected_of):
    for row, answer in zip(rows, answers):
        first = first_entry(answer)
        row['first'] = first['expression'] if first else ''
        row['matched'] = first['matched'] if first else ''
        row['trace'] = '|'.join(first['trace']) if first else ''
        row['dictionary_steps'] = sum(first.get('dictionary', [])) if first else 0
        row['verdict'] = judge_row(row, first, expected_of(row))
        row['anywhere'] = any(r['expression'].lower() in {e.lower() for e in expected_of(row)} for r in answer['results'])
    return rows


WRONG = ('wrong', 'wrong-missing', 'wrong-reference')  # form-entry is reported apart


def wrong_summary(rows, ids, weight=lambda r: 1):
    by_transform = collections.Counter()
    for r in rows:
        if r['verdict'] in ('wrong', 'wrong-missing'):
            for step in set(r['trace'].split('|')) & ids:
                by_transform[step] += weight(r)
    return dict(by_transform.most_common(20))


def expected_lemmas(judge_row, gold, word):
    """The lemma a frequency-list or Tatoeba word is judged against: the lemma UD
    Irish-IDT gives it most often when the treebank has the word (baile → baile,
    cinn → ceann); otherwise what its form-of rows name, and the word itself when
    it has an entry of its own (a word read alone has no context to choose)."""
    if gold.of(word):
        return [gold.of(word)]
    out = set(judge_row.form_of.get(word, ())) | set(judge_row.form_of.get(word.lower(), ()))
    if word in judge_row.headwords:
        out.add(word)
    return sorted(out)


def cmd_frequent(args):
    judge_row = Judge(args)
    sentences = read_conllu(sorted(glob.glob(os.path.join(args.cache, 'ud-irish-idt', '*.conllu'))))
    gold = gold_lemmas(sentences)
    words, tokens = frequency_list(os.path.join(args.cache, 'gawiki-20261101-pages-articles.xml.bz2'), args.top)
    variants = preprocessed(args, [w for w, _ in words])
    reached_by = deinflections(args, sorted({v for w, _ in words for v in variants[w]}))
    rows = []
    for word, n in words:
        # The word counts when a rule reaches one of its lemmas: what its form-of
        # rows name, or its usual lemma in UD Irish-IDT, other than the word itself.
        lemmas = set(judge_row.form_of.get(word, ())) | set(judge_row.form_of.get(word.lower(), ()))
        if gold.of(word):
            lemmas.add(gold.of(word))
        lemmas.discard(word)
        reached = {t for v in variants[word] for t in reached_by[v] if t != v}
        if not any(same(l, r) for l in lemmas for r in reached):
            continue
        rows.append({'form': word, 'count': n, 'lemmas': sorted(lemmas), 'expected': expected_lemmas(judge_row, gold, word),
                     'foreign': word in gold.foreign})
    judge_answers(rows, run_batch(args, [r['form'] for r in rows]), judge_row, lambda r: set(r['expected']))
    wrong = write_wrong(args.out, 'frequent-wrong.tsv', [dict(r, verdict='wrong' if r['verdict'] in WRONG else r['verdict']) for r in rows],
                        lambda r: (r['form'], ','.join(r['expected']), r['first'], r['trace']))
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
        for i, (form, lemma, upos, start, feats) in enumerate(tokens):
            if not LETTER_RUN.search(form):
                continue
            prev = tokens[i - 1][0].lower() if i > 0 else ''
            if keep(prev, form):
                out.append({'form': form, 'lemma': lemma, 'upos': upos, 'prev': prev, 'text': text[start:],
                            'foreign': 'Foreign=Yes' in feats.split('|')})
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
    gold = gold_lemmas(sentences)
    tatoeba = []
    with bz2.open(os.path.join(args.cache, 'gle_sentences.tsv.bz2'), 'rt', encoding='utf-8') as f:
        for line in f:
            text = line.rstrip('\n').split('\t')[2].replace('’', "'")
            words = list(WORD.finditer(text))
            for i in range(1, len(words)):
                prev, word = words[i - 1].group(0).lower(), words[i].group(0)
                lemmas = judge_row.form_of.get(word) or judge_row.form_of.get(word.lower())
                if prev in PARTICLES and lemmas:
                    tatoeba.append({'form': word, 'prev': prev, 'text': text[words[i].start():], 'lemmas': expected_lemmas(judge_row, gold, word),
                                    'foreign': word in gold.foreign})
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
    parser.add_argument('command', choices=['eval', 'dictpairs', 'frequent', 'realtext', 'particles', 'traces'])
    parser.add_argument('--cache', required=True)
    parser.add_argument('--batch', help='lookup-batch-ga built from languages/ga/sources/lookup-batch.cpp (frequent, realtext, particles)')
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, '..', '..', '..'))
    parser.add_argument('--cli', default=os.path.join(root, 'build', 'hoshidicts-cli'))
    parser.add_argument('--node', default='node')
    parser.add_argument('--languages', default=os.path.join(root, 'languages'))
    parser.add_argument('--top', type=int, default=10000)
    parser.add_argument('--out', default='.')
    args = parser.parse_args()
    args.languages = os.path.abspath(args.languages)
    args.root = root
    os.makedirs(args.out, exist_ok=True)
    if args.command not in ('eval', 'dictpairs') and not args.batch:
        parser.error(f'{args.command} needs --batch')
    {'eval': cmd_eval, 'dictpairs': cmd_dictpairs, 'frequent': cmd_frequent, 'realtext': cmd_realtext,
     'particles': cmd_particles, 'traces': cmd_traces}[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
