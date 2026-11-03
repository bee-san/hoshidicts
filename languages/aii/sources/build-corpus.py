#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Builds languages/aii/tests/corpus.tsv and tests/gaps.tsv (docs/languages.md 12.2).

    python3 languages/aii/sources/build-corpus.py <wty-aii-en.zip> <kaikki-aii.jsonl> \
        [--cli build/hoshidicts-cli] [--dev <file>]

Inputs (neither is committed):
  - wty-aii-en.zip, wiktionary-to-yomitan 2026.10.22: its form-of rows
    (`[lemma, [inflection]]` definitions) give inflected forms of Wiktionary's
    declension and conjugation tables;
  - kaikki-aii.jsonl, kaikki.org's Assyrian Neo-Aramaic extract of English
    Wiktionary: the active non-past and passive past forms of the
    conjugation tables, which wty-aii-en leaves out (kaikki tags them
    `error-unrecognized-form`; their order in the table tells them apart).
Both are English Wiktionary content (CC BY-SA 4.0 and GFDL).

A pool row is (pointed form as Wiktionary writes it, lemma headword,
category). Its lemma must be a headword of wty-aii-en with definitions.
Spelling variants (`alternative`, `alt-of`) and agent and instance nouns are
not inflections and are left out, and so are lemmas of several words, whose
rows are the forms of their first word. The sample takes, with seed 1, the number
of rows per category given in SAMPLE; the rest of the pool is the dev pool
(--dev writes it). With --cli, rows whose lemma the pack's rules do not reach
with the pack's defaults (hoshidicts-cli preprocess and deinflect without
options, as a host's lookup runs them) go to gaps.tsv. Both files start with
`# options: default` (docs/languages.md 12.2), so the conformance test and
eval-language read them with the defaults too.
"""
import argparse
import collections
import json
import random
import re
import subprocess
import sys
import unicodedata
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TESTS = HERE.parent / 'tests'
MARKS = re.compile('[\u0303\u0304\u0307\u0308\u0323\u032E\u0330\u0331\u0711\u0730-\u074A\u00AD\u0640\u200C\u200D\u2060\uFEFF]')
SYRIAC = re.compile('^[\u0710-\u074F\u0303-\u0331 ]+$')


def skeleton(s):
    return MARKS.sub('', unicodedata.normalize('NFC', s))


# Rows per category in the sample (seed 1). Categories with fewer pool rows
# give all of them.
PERSONS = ['1s', '2ms', '2fs', '3ms', '3fs', '1p', '2p', '3p']
SAMPLE = {}
for p in PERSONS:
    SAMPLE[f'verb non-past {p}'] = 50
    SAMPLE[f'verb past {p}'] = 30
    SAMPLE[f'verb passive past {p}'] = 12
    SAMPLE[f'noun possessed {p}'] = 40
SAMPLE.update({
    'verb non-past 1fs': 15, 'verb passive past 1fs': 6,
    'verb imperative 2ms': 30, 'verb imperative 2fs': 30, 'verb imperative 2p': 30,
    'verb gerund': 40, 'verb infinitive': 40,
    'verb passive participle ms': 30, 'verb passive participle fs': 30, 'verb passive participle pl': 20,
    'noun plural emphatic': 80, 'noun plural construct': 40, 'noun plural absolute': 30,
    'noun singular construct': 50, 'noun singular absolute': 30,
    'adjective feminine': 50, 'adjective plural': 30,
    'preposition with a pronoun': 40,
})

WTY_TAGS = {
    'first-person singular possessed-form': 'noun possessed 1s',
    'second-person singular masculine possessed-form': 'noun possessed 2ms',
    'second-person singular feminine possessed-form': 'noun possessed 2fs',
    'third-person singular masculine possessed-form': 'noun possessed 3ms',
    'third-person singular feminine possessed-form': 'noun possessed 3fs',
    'first-person plural possessed-form': 'noun possessed 1p',
    'second-person plural possessed-form': 'noun possessed 2p',
    'third-person plural possessed-form': 'noun possessed 3p',
    'plural emphatic': 'noun plural emphatic',
    'plural construct': 'noun plural construct',
    'plural absolute': 'noun plural absolute',
    'singular construct': 'noun singular construct',
    'singular absolute': 'noun singular absolute',
    'first-person singular masculine/feminine past': 'verb past 1s',
    'second-person singular masculine past': 'verb past 2ms',
    'second-person singular feminine past': 'verb past 2fs',
    'third-person singular masculine past': 'verb past 3ms',
    'third-person singular feminine past': 'verb past 3fs',
    'first-person plural masculine/feminine past': 'verb past 1p',
    'second-person plural masculine/feminine past': 'verb past 2p',
    'third-person plural masculine/feminine past': 'verb past 3p',
    'second-person singular masculine imperative': 'verb imperative 2ms',
    'second-person singular feminine imperative': 'verb imperative 2fs',
    'second-person plural masculine/feminine imperative': 'verb imperative 2p',
    'gerund': 'verb gerund',
    'noun-from-verb': 'verb infinitive',
    'singular masculine passive participle': 'verb passive participle ms',
    'singular feminine passive participle': 'verb passive participle fs',
    'plural masculine/feminine passive participle': 'verb passive participle pl',
    'feminine': 'adjective feminine',
    'plural': 'adjective plural',
    'first-person singular stem': 'preposition with a pronoun',
    'second-person singular masculine stem': 'preposition with a pronoun',
    'second-person singular feminine stem': 'preposition with a pronoun',
    'third-person singular masculine stem': 'preposition with a pronoun',
    'third-person singular feminine stem': 'preposition with a pronoun',
    'first-person plural': 'preposition with a pronoun',
    'second-person plural': 'preposition with a pronoun',
    'third-person plural': 'preposition with a pronoun',
}


def is_form_of(d):
    return isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and isinstance(d[1], list)


def read_wty(path):
    rows = []
    with zipfile.ZipFile(path) as z:
        for name in sorted(z.namelist()):
            if name.startswith('term_bank_'):
                rows += json.loads(z.read(name))
    lemmas = {}
    for r in rows:
        if not any(is_form_of(d) for d in r[5]):
            lemmas.setdefault(r[0], set()).update(r[2].split())
    pool = []
    for r in rows:
        refs = [d for d in r[5] if is_form_of(d)]
        for lemma, tags in refs:
            for tag in tags:
                category = WTY_TAGS.get(tag)
                if category is None or lemma not in lemmas:
                    continue
                pos = lemmas[lemma]
                if category.startswith('adjective') and 'adj' not in pos:
                    continue
                if category.startswith('noun') and not pos & {'n', 'name', 'adj', 'num'}:
                    continue
                if category.startswith('verb') and 'v' not in pos:
                    continue
                pool.append((r[0], lemma, category, 'wty-aii-en'))
    return pool, set(lemmas)


PERSON_TAGS = {
    frozenset({'first-person', 'masculine', 'singular'}): '1s',
    frozenset({'first-person', 'feminine', 'singular'}): '1fs',
    frozenset({'second-person', 'masculine', 'singular'}): '2ms',
    frozenset({'second-person', 'feminine', 'singular'}): '2fs',
    frozenset({'third-person', 'masculine', 'singular'}): '3ms',
    frozenset({'third-person', 'feminine', 'singular'}): '3fs',
    frozenset({'first-person', 'masculine', 'plural'}): '1p',
    frozenset({'second-person', 'masculine', 'plural'}): '2p',
    frozenset({'third-person', 'masculine', 'plural'}): '3p',
}


def read_kaikki(path, lemmas):
    """The active non-past and passive past forms of each conjugation table.

    kaikki lists a table's person forms in table order with the same tags for
    both tenses: the first nine (masculine and feminine) are the active
    non-past, the next nine the passive past. The feminine forms of the first
    person plural and of the second and third person plural repeat the
    masculine ones and are skipped.
    """
    pool = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            e = json.loads(line)
            if e.get('pos') != 'verb' or e['word'] not in lemmas:
                continue
            seen = collections.Counter()
            for form in e.get('forms', []):
                tags = set(form.get('tags', []))
                if 'error-unrecognized-form' not in tags:
                    continue
                person = PERSON_TAGS.get(frozenset(tags & {'first-person', 'second-person', 'third-person', 'masculine', 'feminine', 'singular', 'plural'}))
                if person is None:
                    continue
                seen[person] += 1
                tense = {1: 'non-past', 2: 'passive past'}.get(seen[person])
                if tense is None:
                    continue
                pool.append((form['form'], e['word'], f'verb {tense} {person}', 'kaikki'))
    return pool


def deinflects(cli, sources):
    """The deinflected texts of each source, with the pack's defaults (the
    corpus files start with `# options: default`): the processor variants
    of each source, then the deinflections of every variant."""
    languages = str(HERE.parent.parent)
    text = ''.join(s + '\n' for s in sources)
    variants = subprocess.run([cli, '--languages', languages, 'preprocess', 'aii', '--stdin'],
                              input=text, capture_output=True, text=True, check=True).stdout.splitlines()
    owners, texts = [], []
    for i, line in enumerate(variants):
        for v in json.loads(line)['variants']:
            owners.append(i)
            texts.append(v['text'])
    res = subprocess.run([cli, '--languages', languages, 'deinflect', 'aii', '--stdin'],
                         input=''.join(t + '\n' for t in texts), capture_output=True, text=True, check=True).stdout.splitlines()
    out = [set() for _ in sources]
    for i, r in zip(owners, res):
        out[i].update(x['text'] for x in json.loads(r)['results'])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('wty')
    ap.add_argument('kaikki')
    ap.add_argument('--cli')
    ap.add_argument('--dev')
    args = ap.parse_args()
    wty_pool, lemmas = read_wty(args.wty)
    pool = wty_pool + read_kaikki(args.kaikki, lemmas)
    # One row per (form, lemma, category); forms that are not Syriac words.
    seen = set()
    rows = []
    for form, lemma, category, origin in pool:
        form = unicodedata.normalize('NFC', form)
        # A lemma of several words (ܕܵܪܹܐ ܒܵܠܵܐ, to pay attention) lends its
        # first verb's table to the phrase; those forms lack the other words.
        if not SYRIAC.match(form) or ' ' in lemma or (form, lemma, category) in seen:
            continue
        seen.add((form, lemma, category))
        rows.append((form, lemma, category, origin))
    by_category = collections.defaultdict(list)
    for row in rows:
        by_category[row[2]].append(row)
    rng = random.Random(1)
    sample = []
    taken = set()
    for category in sorted(SAMPLE):
        candidates = sorted(by_category.get(category, []))
        rng.shuffle(candidates)
        picked = candidates[:SAMPLE[category]]
        sample += picked
        taken.update((f, l) for f, l, _c, _o in picked)
    # The dev pool leaves out every (form, lemma) the sample has.
    dev = [r for r in rows if (r[0], r[1]) not in taken]
    counts = collections.Counter(r[2] for r in sample)
    header = [
        '# options: default',
        '# Source: English Wiktionary (CC BY-SA 4.0 and GFDL), by the Wiktionary contributors, through',
        '# wiktionary-to-yomitan\'s wty-aii-en 2026.10.22 (form-of rows; sha256 3690c937...9ca8) and kaikki.org\'s',
        '# Assyrian Neo-Aramaic extract of 2026-10-01 (active non-past and passive past forms; sha256 5f35e0fe...09ed).',
        f'# {len(sample)} rows sampled with seed 1 by sources/build-corpus.py (README.md); the rows the pack\'s rules',
        '# do not reach are in gaps.tsv. Sources are pointed as Wiktionary writes them; the pack strips the points.',
        '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)',
    ]
    reached = None
    if args.cli:
        reached = deinflects(args.cli, [r[0] for r in sample])
    corpus, gaps = [], []
    for i, (form, lemma, category, _origin) in enumerate(sorted(sample, key=lambda r: (r[2], r[1], r[0]))):
        line = f'{category}\t1\t{form}\t{lemma}\t*\t*'
        corpus.append(line)
    if reached is not None:
        index = {r[0]: i for i, r in enumerate(sample)}
        corpus, gaps = [], []
        for form, lemma, category, _origin in sorted(sample, key=lambda r: (r[2], r[1], r[0])):
            line = f'{category}\t1\t{form}\t{lemma}\t*\t*'
            (corpus if lemma in reached[index[form]] else gaps).append(line)
    (TESTS / 'corpus.tsv').write_text('\n'.join(header + corpus) + '\n', encoding='utf-8')
    if reached is not None:
        gap_header = ['# options: default',
                      '# Rows of the corpus sample (corpus.tsv, same source and licence) whose lemma the rules do not reach.',
                      '# category\tvalid\tsource\tterm\trule\treasons']
        (TESTS / 'gaps.tsv').write_text('\n'.join(gap_header + gaps) + '\n', encoding='utf-8')
    if args.dev:
        with open(args.dev, 'w', encoding='utf-8') as f:
            f.write('# dev pool (not committed)\n# category\tvalid\tsource\tterm\trule\treasons\n')
            for form, lemma, category, _origin in sorted(dev, key=lambda r: (r[2], r[1], r[0])):
                f.write(f'{category}\t1\t{form}\t{lemma}\t*\t*\n')
    print(f'pool {len(rows)} rows ({len(wty_pool)} wty rows read), sample {len(sample)}, corpus {len(corpus)}, gaps {len(gaps)}, dev {len(dev)}', file=sys.stderr)
    for category in sorted(counts):
        print(f'  {category}: {counts[category]} of {len(by_category[category])}', file=sys.stderr)


if __name__ == '__main__':
    main()
