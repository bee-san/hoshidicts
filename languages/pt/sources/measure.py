#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of README.md (Measurements 2-4). Not run by any test.

    python3 measure.py frequent <lookup-batch> <languages dir> <wty-pt-en.zip> <imported wty-pt-en> <FrequencyWords list> [--top 10000] [--out <file>]
    python3 measure.py text     <lookup-batch> <languages dir> <wty-pt-en.zip> <imported wty-pt-en> <text>... [--sample 60] [--out <file>]
    python3 measure.py phrases  <lookup-batch> <languages dir> <wty-pt-en.zip> <imported wty-pt-en> <por_sentences.tsv> [--out <file>]
    python3 measure.py homographs <lookup-batch> <languages dir> <wty-pt-en.zip> <imported wty-pt-en> <FrequencyWords list>... [--out <file>]

<lookup-batch> is languages/en/sources/lookup-batch.cpp built as its header
says: Lookup::lookup with 16 results, scan length 16 and no options, as a
host's hover. A result is visible unless all its glossaries are form-of rows
(non-lemma). The judge uses the dictionary's own form-of rows:

- L1(w): the lemmas w's form-of rows name (for a verb with an attached
  pronoun and no row of its own, those of the verb form before the hyphen, or
  the infinitive itself: fazê-lo → fazer); L2(w): L1(w) and the lemmas the
  rows of those name (one more hop, for spellings: tá → está → estar).
- The first visible result is "own" when it is the matched text's own entry
  (no trace; for some words that headword is another word, such as era
  "age" for the verb form era), "right" when its trace is not empty and it is
  in L2 of the matched text, "wrong" when it is not but the matched text has
  form-of rows, and "unjudged" when the matched text has none (sampled for a
  hand check).
- A right result is "rare" instead (a wrong lemma first, counted with the
  wrong ones) when a rule made it, the matched text's rows name another lemma
  the lookup also lists, and the first lemma's citation form is at least ten
  times rarer in the frequency lists (--freq) than that other lemma's: `sua`
  shown as suar (to sweat) before seu. The frequent mode uses its own list.
  An adjective (a headword with an `adj` entry) that the dictionary also
  gives as the other lemma's past participle is not counted against it
  (falada shown as falado, then falar): the participle's feminine and plural
  are adjectives or passives.
- Two kinds of right result need the context to judge, so they are counted
  apart and sampled for a hand check: "nounOrParticiple", a word in
  -ado/-ada/-ido/-ida (or their plurals) shown as a noun-only headword through
  the plural or the feminine while the lookup also lists the participle's
  verb (criada as criado, a servant, before criar); and "nounOrTu", a word in
  -as/-es shown as a noun's plural while the lookup also lists a tu form
  (falas as fala, a speech, before falar).

frequent: the list's first <top> words; a word counts as reached when a
deinflection of it (hoshidicts-cli deinflect, next to lookup-batch) is in its
L1. Reports how many reached words show a wrong lemma first, and their share
of the list's tokens; and the verdicts of the first result of every word,
reached or not (allWords). text: every word of the texts, each looked up with the
rest of its sentence (Project Gutenberg texts between the START and END
lines). phrases: Tatoeba sentences, every place where a proclitic pronoun,
article or auxiliary is followed by a word, looked up from the pronoun,
article or auxiliary and from the word after it (each with the rest of the
sentence), reported by kind of word before; and every hyphenated verb form
with a pronoun.

homographs: the candidates of the preferred readings in build-own.mjs, with
the first visible lemma of each. (a) Words in -a whose rows name an -o
adjective or noun as its feminine and an -ar verb's present or imperative:
the adjective's score is the frequency of the masculine plural (-os), the
verb's that of its infinitive, -ou, -ando, -am, -ei and -ava forms, summed
over the lists. (b) Forms whose rows name two verbs of one stem (unar and
unir): flagged when the first is ten times rarer than the other.
"""
import argparse
import json
import random
import re
import subprocess
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

WORD = re.compile(r"[A-Za-zÀ-ÖØ-öø-ɏ][A-Za-zÀ-ÖØ-öø-ɏ'’-]*")
END = re.compile(r'(?<=[.!?…])["”’»)]*\s+')
# The words before a verb or noun that the phrase measurement looks at, by kind;
# each word is in one kind (o, a, os and as are articles and object pronouns).
KINDS = [
    ('pronoun (me te se lhe lhes nos vos)', {'me', 'te', 'se', 'lhe', 'lhes', 'nos', 'vos'}),
    ('article or pronoun (o a os as)', {'o', 'a', 'os', 'as'}),
    ('article (um uma uns umas)', {'um', 'uma', 'uns', 'umas'}),
    ('auxiliary (ir, ter, estar, ser, haver, poder, querer, dever)', {
        'vou', 'vai', 'vamos', 'vão', 'tenho', 'tem', 'temos', 'têm', 'tinha', 'estou', 'está', 'estamos', 'estão', 'estava',
        'foi', 'era', 'é', 'sou', 'ser', 'há', 'hei', 'havia', 'pode', 'posso', 'podemos', 'quero', 'quer', 'deve', 'devo'}),
]
PRONOUNS = {'me', 'te', 'se', 'lhe', 'lhes', 'nos', 'vos', 'o', 'a', 'os', 'as', 'lo', 'la', 'los', 'las', 'no', 'na', 'nas',
            'mo', 'ma', 'mos', 'mas', 'to', 'ta', 'tos', 'tas', 'lho', 'lha', 'lhos', 'lhas'}
ENCLITIC = re.compile(r'^[a-zà-öø-ÿ]+(-(me|te|se|lhe|lhes|nos|vos|o|a|os|as|lo|la|los|las|no|na|nas|mo|ma|to|ta|lho|lha))+(-[a-zàáâãéêíóôõúç]+)?$')


def load_dictionary(zip_path):
    z = zipfile.ZipFile(zip_path)
    refs = defaultdict(set)
    lemmas = set()
    for name in sorted(n for n in z.namelist() if n.startswith('term_bank')):
        for row in json.loads(z.read(name)):
            expression, tags, definitions = row[0], row[2].split(), row[5]
            if 'non-lemma' in tags:
                for d in definitions:
                    if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0]:
                        refs[expression].add(d[0])
            else:
                lemmas.add(expression)
    return refs, lemmas


def load_participles(zip_path):
    """(form, verb) for each row that gives a form as a verb's past participle."""
    z = zipfile.ZipFile(zip_path)
    out = set()
    for name in sorted(n for n in z.namelist() if n.startswith('term_bank')):
        for row in json.loads(z.read(name)):
            if 'non-lemma' in row[2].split():
                for d in row[5]:
                    if isinstance(d, list) and len(d) == 2 and any('participle' in why for why in d[1]):
                        out.add((row[0], d[0]))
    return out


def load_tags(zip_path):
    """term -> the part-of-speech tags of its own entries (not of its form-of rows)."""
    z = zipfile.ZipFile(zip_path)
    out = defaultdict(set)
    for name in sorted(n for n in z.namelist() if n.startswith('term_bank')):
        for row in json.loads(z.read(name)):
            tags = row[2].split()
            if 'non-lemma' not in tags:
                out[row[0]] |= set(tags)
    return out


PARTICIPLE_ENDING = re.compile(r'(ad|id|íd)(o|a|os|as)$')


def norm(text):
    return unicodedata.normalize('NFKC', text).lower()


def read_freq(paths):
    """Word counts of FrequencyWords lists, summed over the lists."""
    freq = Counter()
    for path in paths:
        for line in open(path, encoding='utf-8'):
            word, count = line.split()
            freq[word] += int(count)
    return freq


class Judge:
    def __init__(self, refs, lemmas, transform_ids=(), freq=None, participles=(), tags=None):
        self.refs, self.lemmas = refs, lemmas
        self.transform_ids = set(transform_ids)
        self.freq = freq or {}
        self.participles = set(participles)
        self.tags = tags or {}

    def l1(self, text):
        out = set()
        for t in {text, norm(text), text[:1].upper() + text[1:]}:
            out |= self.refs.get(t, set())
        # A verb with an attached pronoun (deixa-me, fá-lo, dir-te-ei) that has
        # no row of its own: the rows of the verb form before the hyphen, or of
        # the infinitive it was cut from (fazê- → fazer).
        if not out and '-' in text and norm(text).split('-')[1] in PRONOUNS:
            parts = norm(text).split('-')
            verb, pronoun = parts[0], parts[1]
            candidates = {verb}
            plain = verb.translate(str.maketrans('áâêéíóôú', 'aaeeiooo'))
            if pronoun in ('lo', 'la', 'los', 'las'):
                # The r, s or z the pronoun dropped: fazê-lo, fá-lo (faz), fi-lo (fiz), pô-lo (pôs), fazemo-lo.
                candidates |= {verb + 's', verb + 'z', verb + 'r', plain + 'z', plain + 's', plain + 'r'}
            if pronoun == 'nos' and verb.endswith('mo'):
                candidates.add(verb + 's')                 # sentamo-nos
            for t in candidates:
                out |= self.refs.get(t, set()) | ({t} if t in self.lemmas else set())
        return out

    def l2(self, text):
        first = self.l1(text)
        out = set(first)
        for lemma in first:
            out |= self.refs.get(lemma, set())
        return out

    def verdict(self, result, answer=None):
        """own / right / rare / wrong / unjudged for a visible result."""
        if not result['trace']:
            return 'own'
        matched = result['matched']
        names = self.l2(matched)
        if result['expression'] in names or norm(result['expression']) in {norm(n) for n in names}:
            if answer is not None and self.rare_first(result, answer):
                return 'rare'
            if answer is not None:
                kind = self.needs_context(result, answer)
                if kind:
                    return kind
            return 'right'
        return 'wrong' if self.l1(matched) else 'unjudged'

    def needs_context(self, result, answer):
        """nounOrParticiple / nounOrTu (see the header) or None."""
        step = result['trace'][0] if result['trace'] else ''
        if 'adj' in self.tags.get(result['expression'], ()) or step not in ('plural', 'feminine'):
            return None
        later = [r['trace'][0] for r in answer['results'] if not r['formOf'] and r['trace'] and r is not result]
        word = norm(result['matched'])
        if PARTICIPLE_ENDING.search(word) and 'participle' in later:
            return 'nounOrParticiple'
        if step == 'plural' and re.search(r'(as|es)$', word) and ('present-tu' in later or 'subjunctive-tu' in later):
            return 'nounOrTu'
        return None

    def rare_first(self, result, answer):
        """A rule-made first lemma at least ten times rarer than another lemma the matched text's rows name."""
        if not self.freq or not any(t in self.transform_ids for t in result['trace']):
            return False
        named = self.l1(result['matched'])
        adjective = 'adj' in self.tags.get(result['expression'], ())
        others = {r['expression'] for r in answer['results'] if not r['formOf'] and r['expression'] != result['expression'] and r['expression'] in named
                  and not (adjective and (result['expression'], r['expression']) in self.participles)}
        if not others:
            return False
        first = self.freq.get(norm(result['expression']), 0)
        return max(self.freq.get(norm(e), 0) for e in others) >= 10 * max(first, 1)


def lookups(batch, languages, imported, texts):
    p = subprocess.run([batch, str(languages), 'pt', str(imported)], input='\n'.join(texts) + '\n',
                       capture_output=True, text=True, check=True)
    out = [json.loads(line) for line in p.stdout.splitlines()]
    if len(out) != len(texts):
        sys.exit(f'lookup-batch answered {len(out)} of {len(texts)} texts')
    return out


def first_visible(answer):
    return next((r for r in answer['results'] if not r['formOf']), None)


def deinflections(cli, languages, words):
    p = subprocess.run([cli, '--languages', str(languages), 'deinflect', 'pt', '--stdin'], input='\n'.join(words) + '\n',
                       capture_output=True, text=True, check=True)
    return {d['input']: {r['text'] for r in d['results'] if r['trace']} for d in map(json.loads, p.stdout.splitlines())}


def rule_of(result):
    return '>'.join(result['trace']) if result else '-'


def frequent(args, judge):
    words, counts = [], []
    for line in open(args.inputs[0], encoding='utf-8'):
        w, n = line.split()
        words.append(w)
        counts.append(int(n))
        if len(words) == args.top:
            break
    total_tokens = sum(counts)
    cli = str(Path(args.batch).with_name('hoshidicts-cli'))
    reached_by_rule = deinflections(args.cli or cli, args.languages, words)
    answers = lookups(args.batch, args.languages, args.imported, words)
    stats = Counter()
    tokens = Counter()
    wrong = []
    above = []
    every = Counter()
    every_examples = {'wrong': [], 'unjudged': []}
    for w, n, answer in zip(words, counts, answers):
        first = first_visible(answer)
        verdict = judge.verdict(first, answer) if first else 'nothing'
        every[verdict] += 1
        if verdict in every_examples or verdict == 'rare':
            every_examples['wrong' if verdict == 'rare' else verdict].append((n, w, first['expression'], rule_of(first), verdict))
        lemmas = judge.l1(w)
        if not lemmas or not (reached_by_rule.get(w, set()) & lemmas):
            continue
        stats['reached'] += 1
        tokens['reached'] += n
        first = first_visible(answer)
        verdict = judge.verdict(first, answer) if first else 'nothing'
        stats[verdict] += 1
        tokens[verdict] += n
        if verdict in ('wrong', 'rare'):
            wrong.append((n, w, first['expression'], rule_of(first), verdict))
        # A wrong lemma reached by deinflection listed above the first right one.
        for r in answer['results']:
            if r['formOf']:
                continue
            v = judge.verdict(r, answer)
            if v == 'right' or v == 'own':
                break
            if v in ('wrong', 'rare'):
                above.append((n, w, r['expression'], rule_of(r)))
                tokens['above'] += n
                stats['above'] += 1
                break
    report = {
        'list': Path(args.inputs[0]).name, 'top': len(words), 'tokens': total_tokens,
        'reached': stats['reached'], 'reachedTokenShare': round(tokens['reached'] / total_tokens, 4),
        'firstVisible': {k: stats[k] for k in ('own', 'right', 'nounOrParticiple', 'nounOrTu', 'rare', 'wrong', 'unjudged', 'nothing')},
        'needsContextTokenShare': {k: round(tokens[k] / total_tokens, 5) for k in ('nounOrParticiple', 'nounOrTu')},
        'wrongFirst': stats['wrong'] + stats['rare'], 'wrongFirstTokenShare': round((tokens['wrong'] + tokens['rare']) / total_tokens, 5),
        'wrongAboveRight': stats['above'], 'wrongAboveRightTokenShare': round(tokens['above'] / total_tokens, 5),
        'wrongExamples': sorted(wrong, reverse=True)[:60], 'aboveExamples': sorted(above, reverse=True)[:60],
        # The first visible result of every one of the words, reached or not.
        'allWords': dict(every), 'allWrong': sorted(every_examples['wrong'], reverse=True)[:60],
        'allUnjudged': sorted(every_examples['unjudged'], reverse=True)[:60],
    }
    return report


def sentences_of(path):
    text = open(path, encoding='utf-8', errors='replace').read()
    if path.endswith('.txt') and '*** START' in text:
        text = text[text.find('\n', text.find('*** START')) + 1:]
        end = text.find('*** END')
        text = text[:end] if end > 0 else text
    for paragraph in re.split(r'\n\s*\n', text):
        flat = ' '.join(paragraph.split())
        if flat:
            yield from END.split(flat)


def hovers_of(sentence):
    for m in WORD.finditer(sentence):
        word = m.group(0).rstrip("'’-")
        if word:
            yield word, sentence[m.start():]


def judge_hovers(args, judge, items, label):
    answers = lookups(args.batch, args.languages, args.imported, [h for _, h in items])
    stats = Counter()
    wrong_rules = Counter()
    wrong_examples = defaultdict(list)
    unjudged = []
    context = defaultdict(list)
    for (word, hover), answer in zip(items, answers):
        first = first_visible(answer)
        verdict = judge.verdict(first, answer) if first else 'nothing'
        stats[verdict] += 1
        if verdict in ('wrong', 'rare'):
            key = rule_of(first)
            wrong_rules[key] += 1
            if len(wrong_examples[key]) < 8:
                wrong_examples[key].append(f"{first['matched']} → {first['expression']}")
        elif verdict == 'unjudged':
            unjudged.append({'hover': hover[:60], 'matched': first['matched'], 'expression': first['expression'], 'trace': first['trace']})
        elif verdict in ('nounOrParticiple', 'nounOrTu'):
            context[verdict].append({'hover': hover[:60], 'matched': first['matched'], 'expression': first['expression'],
                                     'next': next((r['expression'] for r in answer['results'][1:] if not r['formOf']), None)})
    rng = random.Random(1)
    sample = rng.sample(unjudged, min(args.sample, len(unjudged)))
    return {
        'label': label, 'lookups': len(items), 'firstVisible': dict(stats),
        'wrongRate': round((stats['wrong'] + stats['rare']) / max(1, len(items)), 5),
        'wrongByTrace': [(k, n, wrong_examples[k]) for k, n in wrong_rules.most_common(30)],
        'unjudgedSample': sample,
        'needsContext': {k: v for k, v in context.items()},
    }


def text(args, judge):
    reports = []
    for path in args.inputs:
        items = [h for s in sentences_of(path) for h in hovers_of(s)]
        reports.append(judge_hovers(args, judge, items, Path(path).name))
    return reports


def phrases(args, judge):
    by_kind = {name: [] for name, _ in KINDS}
    enclitic = []
    for line in open(args.inputs[0], encoding='utf-8'):
        sentence = line.rstrip('\n').split('\t')[-1]
        words = list(hovers_of(sentence))
        for i, (word, hover) in enumerate(words):
            lower = word.lower()
            if ENCLITIC.match(lower):
                enclitic.append((word, hover))
            if i + 1 < len(words):
                kind = next((name for name, members in KINDS if lower in members), None)
                if kind is not None:
                    by_kind[kind].append((word, hover))      # from the pronoun, article or auxiliary
                    by_kind[kind].append(words[i + 1])       # from the word after it
    return [judge_hovers(args, judge, items, f'{name} and the word after it') for name, items in by_kind.items()] + \
        [judge_hovers(args, judge, enclitic, 'verb forms with an attached pronoun')]


def load_reasons(zip_path):
    """form -> {(lemma, reason)} from the form-of rows."""
    z = zipfile.ZipFile(zip_path)
    out = defaultdict(set)
    for name in sorted(n for n in z.namelist() if n.startswith('term_bank')):
        for row in json.loads(z.read(name)):
            for d in row[5]:
                if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str):
                    out[row[0]].add((d[0], ' '.join(d[1])))
    return out


def homographs(args, judge):
    reasons = load_reasons(args.wty)
    freq = read_freq(args.inputs)
    feminine, verbs = {}, {}
    for form, rows in reasons.items():
        stem = form[:-1]
        if form.endswith('a') and len(form) >= 4 \
                and any(l == stem + 'o' and 'femin' in why for l, why in rows) \
                and any(l == stem + 'ar' and ('present' in why or 'imperative' in why) for l, why in rows):
            feminine[form] = stem
        by_stem = defaultdict(set)
        for lemma, _ in rows:
            if len(lemma) > 3 and lemma[-2:] in ('ar', 'er', 'ir'):
                by_stem[lemma[:-2]].add(lemma)
        pair = next((sorted(v) for v in by_stem.values() if len(v) >= 2), None)
        if pair:
            verbs[form] = pair
    words = sorted(set(feminine) | set(verbs))
    firsts = {}
    for answer in lookups(args.batch, args.languages, args.imported, words):
        first = first_visible(answer)
        firsts[answer['text']] = first['expression'] if first else None
    a = []
    for form, stem in feminine.items():
        adjective = freq.get(stem + 'os', 0)
        verb = sum(freq.get(stem + e, 0) for e in ('ar', 'ou', 'ando', 'am', 'ei', 'ava'))
        a.append({'form': form, 'count': freq.get(form, 0), 'adjective': stem + 'o', 'adjectiveScore': adjective,
                  'verb': stem + 'ar', 'verbScore': verb, 'proxy': 'adjective' if adjective > verb else 'verb', 'first': firsts.get(form)})
    b = []
    for form, pair in verbs.items():
        first = firsts.get(form)
        best = max(pair, key=lambda v: freq.get(v, 0))
        rarer = first in pair and freq.get(best, 0) >= 10 * max(freq.get(first, 0), 1)
        b.append({'form': form, 'count': freq.get(form, 0), 'verbs': {v: freq.get(v, 0) for v in pair}, 'first': first, 'rarerFirst': rarer})
    key = lambda x: (-x['count'], x['form'])
    return {'feminineOrPresent': sorted(a, key=key), 'twoVerbs': sorted(b, key=key)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['frequent', 'text', 'phrases', 'homographs'])
    parser.add_argument('batch')
    parser.add_argument('languages')
    parser.add_argument('wty')
    parser.add_argument('imported')
    parser.add_argument('inputs', nargs='+')
    parser.add_argument('--top', type=int, default=10000)
    parser.add_argument('--sample', type=int, default=60)
    parser.add_argument('--cli')
    parser.add_argument('--freq', nargs='*', default=[], help='frequency lists for the rare-reading judgement (text, phrases)')
    parser.add_argument('--out')
    args = parser.parse_args()
    transform_ids = [t['id'] for t in json.loads((Path(args.languages) / 'pt' / 'transforms.json').read_text(encoding='utf-8'))['transforms']]
    freq_files = [args.inputs[0]] if args.command == 'frequent' else args.freq
    judge = Judge(*load_dictionary(args.wty), transform_ids, read_freq(freq_files), load_participles(args.wty), load_tags(args.wty))
    report = {'frequent': frequent, 'text': text, 'phrases': phrases, 'homographs': homographs}[args.command](args, judge)
    out = json.dumps(report, ensure_ascii=False, indent=1)
    if args.out:
        Path(args.out).write_text(out + '\n', encoding='utf-8')
    print(out)


if __name__ == '__main__':
    main()
