#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements for README.md (Measurements). Inputs are read from a cache
directory and never committed (README.md, Sources and licences).

    python3 languages/yi/sources/measure.py forms <cache> <out.tsv>
        every single-word form-of row of wty-yi-en whose lemma has a row
        with definitions, as rows for eval-language (what the dictionary
        says each inflected form is a form of)
    python3 languages/yi/sources/measure.py freq <cache> <languages dir> <out dir>
        the 10,000 most frequent words of Yiddish Wikipedia, looked up
    python3 languages/yi/sources/measure.py text <cache> <languages dir> <out dir>
        every word of the real texts (texts.REAL_TEXT_PAGES), looked up from
        the word to the end of its sentence
    python3 languages/yi/sources/measure.py phrases <cache> <languages dir> <out dir>
        Tatoeba's words after a pronoun, clitic, article or auxiliary
    python3 languages/yi/sources/measure.py tables <cache> <out dir>
        eval-language --dictionary for the own, Yomitan, union and final rules (the Measurements table)

<cache> holds wty-yi-en.zip's term banks (wty-yi-en-json/), the imported
dictionary (wty-yi-en/), kaikki.org-dictionary-Yiddish.jsonl,
yid_sentences.tsv.bz2 and the yiwiki and yiwikisource dumps of 2026-11-01.
Lookups run build/lookup-batch (languages/en/sources/lookup-batch.cpp).
"""

import collections
import json
import os
import random
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texts  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
BATCH = os.path.join(REPO, 'build', 'lookup-batch')
SINGLE = re.compile(r'^[\u05D0-\u05EA\u05F0-\u05F2\u05B0-\u05C7]+$')
POS = {'v': 'v', 'n': 'n', 'adj': 'adj'}


def forms(cache, out):
    """Rows `tag 1 form lemma pos *` for the form-of rows of wty-yi-en."""
    heads = texts.headwords(os.path.join(cache, 'wty-yi-en-json'), inflection_only=True)
    lemmas = {h for h, rows in heads.items() if any(defs for _, _, defs in rows)}
    seen = set()
    n = 0
    with open(out, 'w', encoding='utf-8') as f:
        f.write('# The single-word inflection references of wty-yi-en 2026.10.22 (measure.py forms); not committed.\n')
        for word, rows in sorted(heads.items()):
            if not SINGLE.match(word):
                continue
            for rules, refs, _ in rows:
                pos = POS.get(rules)
                for lemma in refs:
                    key = (word, lemma, pos)
                    if pos is None or lemma == word or lemma not in lemmas or key in seen or not SINGLE.match(lemma):
                        continue
                    seen.add(key)
                    f.write(f'{pos}\t1\t{word}\t{lemma}\t{pos}\t*\n')
                    n += 1
    print(f'{n} rows in {out}')


UNPOINTED = {}
SPLIT = set()  # (phrase, lemma) of wty-yi-en rows that name a lemma the phrase does not contain


def lookup(languages, cache, lines):
    """build/lookup-batch on the lines: one result list per line."""
    run = subprocess.run([BATCH, languages, 'yi', os.path.join(cache, 'wty-yi-en')], input='\n'.join(lines) + '\n',
                         capture_output=True, text=True, check=True)
    return [json.loads(line)['results'] for line in run.stdout.splitlines()]


def first_defined(results, heads):
    """The first result whose term has a row with definitions."""
    for r in results:
        if any(defs for _, _, defs in heads.get(r['expression'], [])) and not r['formOf']:
            return r
    return None


def own_lemmas(word, heads):
    """The lemmas the word's own form-of rows name, and the word itself when it is a lemma. A named
    lemma whose rows are only references stands for the lemmas they name (wty-yi-en writes
    בעסטער → בעסט → גוט and אידישער → אידיש → ייִדיש), one hop more."""
    out = set()
    for _, refs, defs in heads.get(word, []):
        if defs:
            out.add(word)
        for lemma in refs:
            if ' ' in word and ' ' in lemma and not set(lemma.split(' ')) & set(word.split(' ')):
                SPLIT.add((word, lemma))
                continue  # a row of a split table (מיר זענען → מסביר זײַן): not the phrase's lemma
            rows = heads.get(lemma, [])
            if any(d for _, _, d in rows):
                out.add(lemma)
            for _, more, _ in rows:
                out.update(m for m in more if any(d for _, _, d in heads.get(m, [])))
    return out


def variants(languages, words):
    """The pack's processor variants of each word (hoshidicts-cli preprocess)."""
    cli = os.path.join(REPO, 'build', 'hoshidicts-cli')
    run = subprocess.run([cli, '--languages', languages, 'preprocess', 'yi', '--stdin'], input='\n'.join(words) + '\n',
                         capture_output=True, text=True, check=True)
    return {w: [v['text'] for v in json.loads(line)['variants']] for w, line in zip(words, run.stdout.splitlines())}


def deinflections(languages, words):
    """The texts hoshidicts-cli deinflect gives for each word (the word as written, no processors)."""
    cli = os.path.join(REPO, 'build', 'hoshidicts-cli')
    run = subprocess.run([cli, '--languages', languages, 'deinflect', 'yi', '--stdin'], input='\n'.join(words) + '\n',
                         capture_output=True, text=True, check=True)
    return [{r['text'] for r in json.loads(line)['results']} for line in run.stdout.splitlines()]


def judge(word, matched, result, heads, spellings=None):
    """'right', 'wrong', 'right-variant', 'wrong-variant' (judged by the rows of a processor variant of the
    matched text, for text the dictionary spells otherwise) or None (the dictionary does not say)."""
    if result is None:
        return 'none'
    lemmas = own_lemmas(matched, heads)
    if (matched, result['expression']) in SPLIT:
        return 'wrong-dictionary'
    suffix = ''
    if not lemmas and spellings:
        for v in spellings.get(matched, []):
            lemmas |= own_lemmas(v, heads)
        suffix = '-variant'
    if not lemmas:
        return None
    expression = result['expression']
    same = expression in lemmas or bool(UNPOINTED.get(expression, set()) & lemmas)
    return ('right' if same else 'wrong') + suffix


def frequency_pages(cache):
    """Wikisource pages in YIVO spelling, other than the real-text pages: the frequency corpus."""
    heads = texts.headwords(os.path.join(cache, 'wty-yi-en-json'))
    for title, revision, text in texts.dump_pages(os.path.join(cache, 'yiwikisource-20261101-pages-articles.xml.bz2')):
        if title in texts.REAL_TEXT_PAGES:
            continue
        tokens = [w for _, _, w in texts.words(text)]
        if len(tokens) < 1000:
            continue
        known = sum(1 for t in tokens if t in heads) / len(tokens)
        pointed = sum(1 for t in tokens if re.search('[\u05B4-\u05BF\u05C2]', t)) / len(tokens)
        if known >= 0.70 and pointed >= 0.25:
            yield title, revision, tokens


def freq(cache, languages, out):
    heads = texts.headwords(os.path.join(cache, 'wty-yi-en-json'))
    counts = collections.Counter()
    pages = []
    for title, revision, tokens in frequency_pages(cache):
        counts.update(tokens)
        pages.append((title, revision, len(tokens)))
    total = sum(counts.values())
    top = [w for w, _ in counts.most_common(10000)]
    reach = deinflections(languages, top)
    checked = [(w, counts[w]) for w, r in zip(top, reach)
               if any(lemma != w and lemma in r for _, refs, _ in heads.get(w, []) for lemma in refs)]
    results = lookup(languages, cache, [w for w, _ in checked])
    rows = []
    for (word, n), res in zip(checked, results):
        first = first_defined(res, heads)
        verdict = judge(word, first['matched'] if first else word, first, heads)
        rows.append((verdict, n, word, first['expression'] if first else '', '|'.join(first['trace']) if first else ''))
    wrong = [r for r in rows if r[0] != 'right']
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'freq.tsv'), 'w', encoding='utf-8') as f:
        for r in sorted(rows, key=lambda r: -r[1]):
            f.write('\t'.join(map(str, r)) + '\n')
    report = {'pages': len(pages), 'tokens': total, 'top': len(top), 'topTokens': sum(counts[w] for w in top),
              'reached': len(checked), 'reachedTokens': sum(n for _, n in checked),
              'wrongFirst': len(wrong), 'wrongFirstTokens': sum(r[1] for r in wrong),
              'wrongTokenShare': round(sum(r[1] for r in wrong) / total, 5)}
    print(json.dumps(report, ensure_ascii=False))
    for r in sorted(wrong, key=lambda r: -r[1])[:40]:
        print('  ' + '\t'.join(map(str, r)))


def hovers(text):
    """(word, the text from the word to the end of its sentence) for every word of a text."""
    for start, end, word in texts.words(text):
        m = texts.SENTENCE_END.search(text, end)
        stop = m.start() if m else len(text)
        line = text[start:stop].replace('\n', ' ')
        yield word, re.sub(r'\s+', ' ', line)[:200]


def judge_all(cache, languages, items, out, name):
    """Looks up (word, text) items and judges each first result; writes <out>/<name>.tsv."""
    heads = texts.headwords(os.path.join(cache, 'wty-yi-en-json'))
    UNPOINTED.update(texts.unpointed_of(os.path.join(cache, 'wty-yi-en-json')))
    results = lookup(languages, cache, [t for _, t in items])
    matched = sorted({r[0]['matched'] for r in results if r} | {w for w, _ in items})
    spellings = variants(languages, matched)
    tally = collections.Counter()
    by_trace = collections.Counter()
    rows = []
    for (word, line), res in zip(items, results):
        first = first_defined(res, heads)
        verdict = judge(word, first['matched'] if first else word, first, heads, spellings) or 'unjudged'
        tally[verdict] += 1
        trace = '|'.join(first['trace']) if first else ''
        if verdict.startswith('wrong'):
            by_trace[trace.split('|')[0] if trace else '(none)'] += 1
        rows.append((verdict, word, first['matched'] if first else '', first['expression'] if first else '', trace, line))
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, name + '.tsv'), 'w', encoding='utf-8') as f:
        for r in rows:
            f.write('\t'.join(r) + '\n')
    print(json.dumps({'lookups': len(items), **tally, 'wrongByFirstStep': dict(by_trace.most_common(12))}, ensure_ascii=False))
    return rows


def text(cache, languages, out):
    items = []
    for title, revision, page in texts.dump_pages(os.path.join(cache, 'yiwikisource-20261101-pages-articles.xml.bz2')):
        if title in texts.REAL_TEXT_PAGES:
            print(f'{title} (revision {revision})')
            items.extend(hovers(page))
    judge_all(cache, languages, items, out, 'text')


# Words a lookup can start at before an inflected form: pronouns, clitics, articles and auxiliaries.
FRONT = ['איך', 'דו', 'ער', 'זי', 'עס', 'מיר', 'איר', 'זיי', 'מען', 'ס׳', 'כ׳', 'מ׳', 'דער', 'די', 'דאָס', 'דעם', 'אַ', 'אַן',
         'האָב', 'האָסט', 'האָט', 'האָבן', 'בין', 'ביסט', 'איז', 'זענען', 'זײַנען', 'וועל', 'וועסט', 'וועט', 'וועלן', 'וואָלט', 'זיך']


def phrases(cache, languages, out):
    """Lookups that start at a front word of FRONT followed by another word, in Tatoeba."""
    items = []
    for sentence in texts.tatoeba(os.path.join(cache, 'yid_sentences.tsv.bz2')):
        ws = list(texts.words(sentence))
        for (s1, e1, w1), (s2, e2, w2) in zip(ws, ws[1:]):
            gap = sentence[e1:s2]
            if (w1 in FRONT and gap == ' ') or (w1 + gap in FRONT and gap == '׳'):
                m = texts.SENTENCE_END.search(sentence, e2)
                items.append((w1, sentence[s1:m.start() if m else len(sentence)]))
    judge_all(cache, languages, items, out, 'phrases')


def scratch_pack(base, out, language_edit=None, transforms=None):
    """A copy of the pack in <out>/yi, its language.json edited and its transforms replaced."""
    import shutil
    shutil.rmtree(os.path.join(out, 'yi'), ignore_errors=True)
    shutil.copytree(os.path.join(base, 'yi'), os.path.join(out, 'yi'))
    if language_edit is not None:
        path = os.path.join(out, 'yi', 'language.json')
        with open(path, encoding='utf-8') as f:
            language = json.load(f)
        language_edit(language)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(language, f, ensure_ascii=False, indent=2)
    if transforms is not None:
        shutil.copy(transforms, os.path.join(out, 'yi', 'transforms.json'))
    return out


def tables(cache, out):
    """eval-language for the own, Yomitan, union and final rules on every measured file."""
    cli = os.path.join(REPO, 'build', 'hoshidicts-cli')
    pack = os.path.join(REPO, 'languages', 'yi')
    os.makedirs(out, exist_ok=True)
    union = os.path.join(out, 'union.json')
    subprocess.run(['node', os.path.join(REPO, 'tools', 'merge-transforms.mjs'), 'yi', '--out', union, '--force'],
                   check=True, capture_output=True)
    sample = os.path.join(out, 'sample.tsv')
    with open(sample, 'w', encoding='utf-8') as f:
        for name in ('corpus.tsv', 'gaps.tsv'):
            with open(os.path.join(pack, 'tests', name), encoding='utf-8') as g:
                f.writelines(line for line in g if not (line.startswith('#') and name == 'gaps.tsv'))
    files = {'corpus+gaps': sample, 'cases': os.path.join(pack, 'tests', 'cases.tsv'),
             'yomitan-tests': os.path.join(HERE, 'yomitan-tests.tsv'), 'constructed': os.path.join(HERE, 'constructed.tsv'),
             'wty forms': os.path.join(cache, 'work', 'forms.tsv')}
    rules = {'own': os.path.join(HERE, 'own.json'), 'yomitan': os.path.join(HERE, 'yomitan.json'), 'union': union,
             'final': os.path.join(pack, 'transforms.json')}
    languages = os.path.dirname(pack)
    passing = scratch_pack(languages, os.path.join(out, 'pass'), lambda l: l['lookup'].__setitem__('untaggedTerms', 'pass'))
    yomitan_processors = os.path.join(out, 'yomitan-processors')
    subprocess.run(['node', os.path.join(HERE, 'scratch-pack.mjs'), yomitan_processors, '--pre', 'yomitan', '--post', 'yomitan'],
                   check=True, capture_output=True)
    yomitan_post = os.path.join(out, 'yomitan-post')
    subprocess.run(['node', os.path.join(HERE, 'scratch-pack.mjs'), yomitan_post, '--post', 'yomitan'], check=True, capture_output=True)
    runs = [(name, languages, path) for name, path in rules.items()]
    runs += [('yomitan with Yomitan\'s postprocessors', yomitan_post, rules['yomitan']),
             ('union with Yomitan\'s postprocessors', yomitan_post, rules['union'])]
    runs += [('final, untaggedTerms pass', passing, rules['final']),
             ('yomitan with Yomitan\'s processors', yomitan_processors, rules['yomitan']),
             ('own with Yomitan\'s processors', yomitan_processors, rules['own'])]
    dictionary = os.path.join(cache, 'wty-yi-en')
    print('rules\tfile\trows\trecall\tnegatives passed\tfalse candidates\tfirst rank')
    for label, dir_, transforms in runs:
        for fname, path in files.items():
            run = subprocess.run([cli, '--languages', dir_, 'eval-language', 'yi', path, '--transforms', transforms,
                                  '--dictionary', dictionary], capture_output=True, text=True, check=True)
            r = json.loads(run.stdout)
            fmt = lambda v: '-' if v is None else f'{v:.4f}'
            print(f"{label}\t{fname}\t{r['rows']}\t{fmt(r['recall'])}\t{fmt(r['negativesPassed'])}\t{fmt(r['falseCandidates'])}\t{fmt(r['firstRank'])}")


def main():
    command, *args = sys.argv[1:] or ['']
    commands = {'forms': forms, 'freq': freq, 'text': text, 'phrases': phrases, 'tables': tables}
    if command not in commands:
        sys.exit(__doc__)
    commands[command](*args)


if __name__ == '__main__':
    main()
