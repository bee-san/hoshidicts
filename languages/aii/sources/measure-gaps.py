#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The counts of README.md's Known gaps, each with the definition it uses.

    python3 languages/aii/sources/measure-gaps.py <urmia checkout> <wty-aii-en.zip> \\
        <imported wty-aii-en> <imported wty-aii-en (tagged)> <kaikki-aii.jsonl> [--dev dev.tsv] [--languages DIR]

Lookups are build/aii-lookup-batch's, as in measure-urmia.py (16 results,
scan length 16, the pack's defaults): every word of the Urmia Bible hovered
with the rest of its sentence. "First entry" is the first result with
definitions (not a form-of row). It prints:

- ties: hovers (tagged copy) whose first entry is reached by one rule that is
  not a proclitic and not from the dictionary, where a later result with the
  same matched text and processor steps is reached by one proclitic alone.
  Each word is listed with its count, both lemmas and both traces, for
  judging by hand;
- stacks: first entries (both dictionaries) whose trace has two or more of
  ܘ- ܕ- ܒ- ܠ- not in the grammar's order (ܘ-, then ܕ-, then ܒ- or ܠ-, each
  once);
- non-verbs: first entries (tagged copy) that a verb rule reaches (a trace
  with a verb transform and no noun transform) whose lemma has no verb row
  in wty-aii-en, grouped by word;
- citation forms: kaikki's pointed citation forms whose first entry (tagged
  copy) is another lemma, read with no processor step by one pattern
  transform, after a proclitic or not;
- contracted-past homographs: the pointed forms of kaikki's tables, alone
  and after ܕ-, ܒ- or ܠ-, that a `pastContracted` pattern matches, whose
  first entry (tagged copy) comes through `pastContracted` with a lemma that
  is not the form's own;
- contractions: the hovers of the shapes of the Urmia contracted pasts the
  pack does not read, a base of two letters (C + zlama + ܪ/ܠ + ending,
  after a proclitic or not) and Stems II and III (C ܘܼ C + zlama + ܪ/ܠ +
  ending), leaving out the words whose first entry (tagged copy) comes
  through `pastContracted`; the list shows the words, nouns of the same
  shape included, for judging by hand;
- trace labels (with --dev): unpointed dev-pool rows whose lemma comes first
  through the rules (tagged copy), and of those the noun and adjective rows
  whose trace names only verb transforms.
"""
import argparse
import collections
import importlib.util
import json
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('measure_urmia', HERE / 'measure-urmia.py')
mu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mu)

PROCLITICS = ('w-', 'd-', 'b-', 'l-')
ORDER = {'w-': 0, 'd-': 1, 'b-': 2, 'l-': 2}
VERB = {'3fs', '3p', '2ms', '2fs', '2p', '1s', '1p', 'pastBase', 'hollow', 'pastBaseM', 'pastBaseMt', 'pastContracted',
        'imperative', 'imperativeM', 'imperativeII', 'passiveParticiple', 'passiveParticipleM', 'gerund', 'verbalNounM',
        'infinitiveM', 'irregularVerb', 'copula', 'past1s', 'past2ms', 'past2fs', 'past3s', 'past1p', 'past2p', 'past3p'}
NOUN = {'poss1s', 'poss2ms', 'poss2fs', 'poss3s', 'poss1p', 'poss2p', 'poss3p', 'pluralAne', 'pluralWata', 'feminine',
        'pluralYata', 'absolutePlural', 'construct', 'possessiveC', 'pluralC', 'irregularNoun'}
MARKS = re.compile('[\u0303\u0304\u0307\u0308\u0323\u032E\u0330\u0331\u0711\u0730-\u074A\u00AD\u0640\u200C\u200D\u2060\uFEFF]')
JOINERS = re.compile('[\u00AD\u0640\u200C\u200D\u2060\uFEFF\u0711]')
NV = '[\u0303\u0307\u0323\u032E\u0330\u0740-\u0742\u0747]*'
ENDINGS = '(?:\u0739\u0710|\u0735\u0710|\u0718\u073F\u0722|\u071D\u073C|\u0718\u073C\u071F|\u0732\u0722)'
TWO_LETTER_BASE = re.compile(f'^[\u0718\u0715\u0712\u0720]?[\u0712-\u072C]{NV}\u0738{NV}[\u072A\u0720]{NV}{ENDINGS}$')
STEM_II = re.compile(f'^[\u0718\u0715\u0712\u0720]?[\u0710-\u072C]{NV}\u0718\u073C{NV}[\u0710-\u072C]{NV}\u0738{NV}[\u072A\u0720]{NV}{ENDINGS}$')


def norm(s):
    return JOINERS.sub('', unicodedata.normalize('NFC', s))


def unpoint(s):
    return MARKS.sub('', unicodedata.normalize('NFC', s))


def rows(wty):
    import zipfile
    out = []
    with zipfile.ZipFile(wty) as z:
        for name in sorted(z.namelist()):
            if name.startswith('term_bank_'):
                out += json.loads(z.read(name))
    return out


def defined(r):
    return not (r[5] and all(isinstance(g, list) and len(g) == 2 and isinstance(g[0], str) for g in r[5]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('checkout')
    ap.add_argument('wty')
    ap.add_argument('published')
    ap.add_argument('tagged')
    ap.add_argument('kaikki')
    ap.add_argument('--dev')
    ap.add_argument('--languages', default=str(HERE.parents[1]))
    ap.add_argument('--report', type=int, default=12)
    args = ap.parse_args()
    lang = args.languages
    bank = rows(args.wty)
    pos = collections.defaultdict(set)
    for r in bank:
        if defined(r):
            pos[r[0]].add((r[2] or '').split(' ')[0])
    hovers, words = [], []
    for s in mu.sentences(args.checkout):
        for m in mu.WORD.finditer(s):
            hovers.append(s[m.start():].strip())
            words.append(m.group(0))
    tagged = mu.lookup(hovers, args.tagged, None, lang)
    published = mu.lookup(hovers, args.published, None, lang)

    # Ties.
    ties = collections.Counter()
    for w, results in zip(words, tagged):
        d = [r for r in results if not r['formOf']]
        if not d:
            continue
        f = d[0]
        if len(f['trace']) == 1 and f['trace'][0] not in PROCLITICS and not any(f['fromDictionary']):
            alt = [g for g in d[1:] if g['matched'] == f['matched'] and g['steps'] == f['steps']
                   and len(g['trace']) == 1 and g['trace'][0] in PROCLITICS]
            if alt:
                ties[(w, f['expression'], f['trace'][0], alt[0]['expression'], alt[0]['trace'][0])] += 1
    print(f'ties (tagged): {sum(ties.values())} hovers of {len(ties)} words; first entry, then the proclitic reading:')
    for (w, a, ta, b, tb), n in ties.most_common():
        print(f'  {n:4} {w} {a} [{ta}] / {b} [{tb}]')

    # Stacks.
    for name, res in (('published', published), ('tagged', tagged)):
        stacks = collections.Counter()
        for w, results in zip(words, res):
            f = mu.first_entry(results)
            if f is None:
                continue
            p = [t for t in f['trace'] if t in PROCLITICS]
            if len(p) >= 2 and any(ORDER[a] >= ORDER[b] for a, b in zip(p, p[1:])):
                stacks[(w, f['expression'], '>'.join(f['trace']))] += 1
        print(f'stacks ({name}): {sum(stacks.values())} first entries out of the grammar\'s order; '
              + '; '.join(f'{w} → {e} [{t}] {n}' for (w, e, t), n in stacks.most_common(args.report)))

    # Non-verbs a verb rule reaches.
    groups = collections.Counter()
    for w, results in zip(words, tagged):
        f = mu.first_entry(results)
        if f is None or any(f['fromDictionary']):
            continue
        tr = set(f['trace'])
        if tr & VERB and not tr & NOUN and 'v' not in pos.get(f['expression'], set()):
            groups[(w, f['expression'], '>'.join(f['trace']))] += 1
    print(f'non-verbs (tagged): {sum(groups.values())} first entries through a verb rule whose lemma has no verb row; '
          + '; '.join(f'{w} → {e} [{t}] {n}' for (w, e, t), n in groups.most_common(args.report)))

    # Citation forms.
    headwords = {r[0] for r in bank if defined(r)}
    transforms = json.loads((Path(lang) / 'aii' / 'transforms.json').read_text(encoding='utf-8'))
    patterns = {t['id'] for t in transforms['transforms'] if any(r['type'] == 'pattern' for r in t['rules'])}
    items, seen = [], set()
    for line in open(args.kaikki, encoding='utf-8'):
        e = json.loads(line)
        w = e['word']
        if w not in headwords or ' ' in w:
            continue
        for f in e.get('forms', []) or []:
            if 'canonical' in f.get('tags', []):
                form = unicodedata.normalize('NFC', f['form'])
                if ' ' not in form and (form, w) not in seen:
                    seen.add((form, w))
                    items.append((form, w))
    citation = []
    for (form, w), results in zip(items, mu.lookup([f for f, _ in items], args.tagged, None, lang)):
        f = mu.first_entry(results)
        if f is None:
            continue
        core = [t for t in f['trace'] if t not in PROCLITICS]
        if f['expression'] != w and f['steps'] == 0 and len(core) == 1 and core[0] in patterns:
            citation.append(f"{form} → {f['expression']} [{'>'.join(f['trace'])}] (headword {w})")
    print(f'citation forms: {len(items)}; {len(citation)} read first by a pattern as another lemma: ' + '; '.join(citation))

    # Contracted-past homographs.
    pc = [re.compile(r['pattern'].encode().decode('unicode_escape')) for t in transforms['transforms'] if t['id'] == 'pastContracted'
          for r in t['rules']]
    lemmas = collections.defaultdict(set)
    for line in open(args.kaikki, encoding='utf-8'):
        e = json.loads(line)
        for f in e.get('forms', []) or []:
            form = norm(f.get('form', ''))
            if form and ' ' not in form:
                lemmas[form].add(e['word'])
    texts = [(p + form, form) for form in sorted(lemmas) for p in ('', 'ܕ', 'ܒ', 'ܠ') if any(rx.match(p + form) for rx in pc)]
    homographs = []
    for (text, form), results in zip(texts, mu.lookup([t for t, _ in texts], args.tagged, None, lang)):
        f = mu.first_entry(results)
        if f is not None and 'pastContracted' in f['trace'] and f['expression'] not in lemmas[form]:
            homographs.append(f"{text} → {f['expression']} [{'>'.join(f['trace'])}] (a form of {'/'.join(sorted(lemmas[form]))})")
    print(f'contracted-past homographs: {len(texts)} texts of the shape; {len(homographs)} read as another lemma: '
          + '; '.join(homographs))

    # Contractions not read.
    two, stem2 = collections.Counter(), collections.Counter()
    for w, results in zip(words, tagged):
        f = mu.first_entry(results)
        if f is not None and 'pastContracted' in f['trace']:
            continue
        n = norm(w)
        if STEM_II.match(n):
            stem2[w] += 1
        elif TWO_LETTER_BASE.match(n):
            two[w] += 1
    print(f'contractions of the two-letter-base shape: {sum(two.values())} hovers: '
          + ', '.join(f'{w} {n}' for w, n in two.most_common()))
    print(f'contractions of Stems II and III: {sum(stem2.values())} hovers: '
          + ', '.join(f'{w} {n}' for w, n in stem2.most_common(args.report)))

    # Trace labels.
    if args.dev:
        dev = []
        for line in open(args.dev, encoding='utf-8'):
            if line.startswith('#'):
                continue
            p = line.rstrip('\n').split('\t')
            dev.append((p[0], p[2], p[3]))
        res = mu.lookup([unpoint(s) for _, s, _ in dev], args.tagged, None, lang)
        total, bad = 0, collections.Counter()
        for (cat, _, lemma), results in zip(dev, res):
            if not results or results[0]['expression'] != lemma or any(results[0]['fromDictionary']) or not results[0]['trace']:
                continue
            total += 1
            tr = set(results[0]['trace'])
            if cat.startswith(('noun', 'adjective')) and tr & VERB and not tr & NOUN:
                bad['>'.join(results[0]['trace'])] += 1
        print(f'trace labels: {total} unpointed dev rows with the lemma first through rules; {sum(bad.values())} noun or '
              f'adjective rows whose trace names only verb transforms: ' + ', '.join(f'{t} {n}' for t, n in bad.most_common()))


if __name__ == '__main__':
    main()
