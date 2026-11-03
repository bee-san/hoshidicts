#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The measurements of README.md (Measurements). Not run by any test.

    python3 languages/tl/sources/measure.py <command> --cache <dir> --dictionary <imported dir> [options]

<dir> holds the inputs README.md lists (wty-tl-en.zip, tl_full.txt,
tgl_sentences.tsv.bz2, gutenberg/pg*.txt); <imported dir> is wty-tl-en
imported by `hoshidicts-cli import`. --untagged filter|pass runs the pack
with that lookup.untaggedTerms (a copy in --work); without it the pack's
own, pass, applies. Every command looks
words up as a host does, with build/tl-lookup-batch (sources/lookup-batch.cpp:
16 results, scan length 16, no language options), and runs every rule set:
own (sources/own.json), yomitan (sources/yomitan.json), union (the merge
tool's output) and final (transforms.json).

Commands:

- eval: hoshidicts-cli eval-language on corpus.tsv with gaps.tsv (the whole
  sample), cases.tsv and yomitan.tsv; recall, negatives passed, false
  candidates per row and first rank.
- frequent: the 10,000 most frequent words of tl_full.txt, each looked up
  alone. A word's lemmas are the terms its form-of rows name and the lemmas
  corpus.tsv and gaps.tsv give for it. "Reached" words are those whose lemma
  a rule reaches (a deinflection with a trace). The first result is right when
  it is the word itself (its own entry) or one of its lemmas. The other words
  whose first result is a rule reading other than the linker's or a
  contraction's are counted and listed (--show) to judge by hand.
- tatoeba: every word position of Tatoeba's Tagalog sentences, looked up as
  the text from the word to the end of its sentence. The first result is the
  text as written or a term a form-of row names for it; or a rule reading
  whose term a form-of row of the matched text names (or corpus.tsv gives);
  or a reading of the linker or a contraction only (akong -> ako), which
  leaves the word itself; or another rule reading, split by the word before
  the position (a marker, pronoun or particle). --show lists the largest
  groups of other readings and the multiword ones, --sample N a random sample
  of them and one of the linker, contraction or hyphen readings (seed 1) to
  judge by hand.
- text: the same for Project Gutenberg texts (--texts pg47629.txt,...).
- traces: for the sampled rows of corpus.tsv and gaps.tsv whose aspect is
  known, the share whose shortest trace to the lemma names it.
- sentences: the words of sources/sentences.tsv, each looked up as the text
  from it to the end of its sentence; the first result must be the lemma the
  file gives. --dump writes those texts, one per line.
- positions: every word position of sources/sentences.tsv, as the text from
  the word to the end of its sentence, one per line (the word list of
  benchmark-lookup; needs no --cache or --dictionary).
"""

import argparse
import bz2
import collections
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import zipfile
from pathlib import Path

PACK = Path(__file__).resolve().parent.parent
REPO = PACK.parent.parent
CLI = REPO / 'build' / 'hoshidicts-cli'
BATCH = REPO / 'build' / 'tl-lookup-batch'
# The languages directory every command loads the pack from: the checkout's,
# or with --untagged a copy of the pack with that lookup.untaggedTerms.
LANGUAGES = REPO / 'languages'

# Words that come before a noun or verb phrase: markers, the plural mga,
# pronouns, enclitic particles and the linker-carrying function words.
FUNCTION_WORDS = {
    'marker': ['ang', 'ng', 'sa', 'si', 'ni', 'kay', 'sina', 'nina', 'kina', 'mga', 'ay', 'nang', 'na', 'at', 'o'],
    'pronoun': ['ako', 'ko', 'ikaw', 'ka', 'mo', 'siya', 'niya', 'kami', 'namin', 'tayo', 'natin', 'kayo', 'ninyo', 'nyo',
                'sila', 'nila', 'akin', 'iyo', 'kanya', 'kaniya', 'atin', 'amin', 'inyo', 'kanila', 'ito', 'iyan', 'iyon',
                'nito', 'niyan', 'niyon', 'noon', 'dito', 'diyan', 'doon'],
    'particle': ['ba', 'pa', 'po', 'din', 'rin', 'lang', 'lamang', 'naman', 'nga', 'kasi', 'muna', 'daw', 'raw', 'pala',
                 'yata', 'sana', 'man', 'hindi', 'huwag', 'wag', 'di', 'may', 'mayroon', 'wala', 'kung', 'kapag', 'para'],
}
GROUP_OF = {w: g for g, ws in FUNCTION_WORDS.items() for w in ws}
# A word: letters and the combining marks after them (the tilde of ng̃, the
# accents of old text, the Baybayin vowel signs), as the pack's
# text.wordCharacters has them, joined by hyphens and apostrophes.
LETTERS = r"(?:[^\W\d_]|[\u0300-\u036f\u1712-\u1715])+"
WORD = re.compile(LETTERS + r"(?:[-'’]" + LETTERS + r")*")
END = re.compile(r'(?<=[.!?…])["”’)]*\s+')


def strip_marks(text):
    return unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c)))


def norm(text):
    return strip_marks(text).lower().replace('’', "'")


def untagged_pack(work, value):
    """A languages directory holding a copy of the pack whose
    lookup.untaggedTerms is <value> (docs/languages.md section 14 step 5
    reports both values)."""
    root = Path(work) / f'languages-{value}'
    if root.exists():
        shutil.rmtree(root)
    (root / 'tl').mkdir(parents=True)
    shutil.copy(PACK / 'transforms.json', root / 'tl' / 'transforms.json')
    descriptor = json.loads((PACK / 'language.json').read_text(encoding='utf-8'))
    descriptor['lookup']['untaggedTerms'] = value
    (root / 'tl' / 'language.json').write_text(json.dumps(descriptor, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return root


def rule_sets(work):
    union = Path(work) / 'union.json'
    subprocess.run(['node', str(REPO / 'tools' / 'merge-transforms.mjs'), 'tl', '--out', str(union), '--force'], check=True,
                   capture_output=True)
    return {
        'own': PACK / 'sources' / 'own.json',
        'yomitan': PACK / 'sources' / 'yomitan.json',
        'union': union,
        'final': PACK / 'transforms.json',
    }


def written(text):
    """The text without marks, letter case kept."""
    return strip_marks(text).replace('’', "'")


def dictionary_lemmas(zip_path):
    """Lemmas each headword's form-of rows name, and every headword as written
    (without marks, letter case kept)."""
    lemmas = collections.defaultdict(set)
    defined = set()
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(z.read(name)):
                refs = [d for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0]]
                for ref in refs:
                    lemmas[norm(row[0])].add(norm(ref[0]))
                defined.add(written(row[0]))
    return lemmas, defined


def corpus_lemmas():
    lemmas = collections.defaultdict(set)
    for name in ('corpus.tsv', 'gaps.tsv'):
        for line in (PACK / 'tests' / name).read_text(encoding='utf-8').splitlines():
            cells = line.split('\t')
            if line.startswith('#') or len(cells) != 6 or cells[1] != '1':
                continue
            lemmas[norm(cells[2])].add(norm(cells[3]))
    return lemmas


def run_batch(transforms, dictionary, texts):
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', delete=False) as f:
        f.write('\n'.join(texts) + '\n')
        name = f.name
    try:
        with open(name, encoding='utf-8') as stdin:
            out = subprocess.run([str(BATCH), str(LANGUAGES), 'tl', str(dictionary), '--transforms', str(transforms)],
                                 stdin=stdin, capture_output=True, text=True, check=True).stdout
    finally:
        os.unlink(name)
    answers = [json.loads(line) for line in out.splitlines()]
    assert len(answers) == len(texts), (len(answers), len(texts))
    return answers


def run_deinflect(transforms, words):
    out = subprocess.run([str(CLI), '--languages', str(LANGUAGES), 'deinflect', 'tl', '--stdin', '--transforms', str(transforms)],
                         input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    answers = [json.loads(line) for line in out.splitlines()]
    assert len(answers) == len(words)
    return answers


def judge(word, result, lemmas):
    """right / own entry / dictionary (a form-of step) / rule-not-named."""
    expression = norm(result['expression'])
    trace = result['trace']
    if expression == norm(word) or not trace:
        return 'own entry'
    if expression in lemmas:
        return 'right lemma'
    if any(from_dictionary for _, from_dictionary in trace):
        return 'dictionary step'
    return 'rule, not named'


def cmd_eval(args, sets):
    tests = PACK / 'tests'
    sample = Path(args.work) / 'sample.tsv'
    corpus = (tests / 'corpus.tsv').read_text(encoding='utf-8').splitlines()
    gaps = [l for l in (tests / 'gaps.tsv').read_text(encoding='utf-8').splitlines() if not l.startswith('#')]
    sample.write_text('\n'.join(corpus + gaps) + '\n', encoding='utf-8')
    files = {'sample (corpus + gaps)': sample, 'cases.tsv': tests / 'cases.tsv', 'yomitan.tsv': tests / 'yomitan.tsv'}
    print(f'| Rule set | File | Rows | Recall | Negatives passed | False candidates per row | First rank |')
    print('| --- | --- | ---: | ---: | ---: | ---: | ---: |')
    for set_name, transforms in sets.items():
        for file_name, path in files.items():
            out = subprocess.run([str(CLI), '--languages', str(LANGUAGES), 'eval-language', 'tl', str(path),
                                  '--transforms', str(transforms), '--dictionary', str(args.dictionary)],
                                 capture_output=True, text=True)
            if out.returncode != 0:
                print(f'| {set_name} | {file_name} | error: {out.stderr.strip()} |||||')
                continue
            r = json.loads(out.stdout)
            pct = lambda v: '-' if v is None else f'{100 * v:.2f}%'
            num = lambda v: '-' if v is None else f'{v:.3f}'
            print(f"| {set_name} | {file_name} | {r['positives']} + {r['negatives']} | {pct(r['recall'])} | {pct(r['negativesPassed'])} | "
                  f"{num(r.get('falseCandidates'))} | {pct(r.get('firstRank'))} |")


def frequent_words(args):
    words, counts = [], []
    for line in (Path(args.cache) / 'tl_full.txt').read_text(encoding='utf-8').splitlines():
        word, count = line.split(' ')
        if WORD.fullmatch(word):
            words.append(word)
            counts.append(int(count))
        if len(words) == 10000:
            break
    return words, counts


def cmd_frequent(args, sets):
    lemmas, headwords = dictionary_lemmas(Path(args.cache) / 'wty-tl-en.zip')
    for word, extra in corpus_lemmas().items():
        lemmas[word] |= extra
    words, counts = frequent_words(args)
    total = sum(counts)
    print(f'{len(words)} words, {total} tokens; {sum(1 for w in words if lemmas.get(norm(w)))} have a lemma named by a form-of row or the corpus')
    print('| Rule set | Words a rule reaches | Their tokens | Wrong first (words) | Wrong first (share of tokens) | Other rule readings first (words) | Capitalised: a capitalised headword first |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    listed = {}
    wrong_listed = {}
    cap_words = {}
    for set_name, transforms in sets.items():
        deinflections = run_deinflect(transforms, [norm(w) for w in words])
        answers = run_batch(transforms, args.dictionary, words)
        reached = wrong = wrong_tokens = reached_tokens = 0
        unnamed, wrong_words = [], []
        for word, count, d, a in zip(words, counts, deinflections, answers):
            named = lemmas.get(norm(word), set())
            hits = named and any(r['trace'] and norm(r['text']) in named for r in d['results'])
            first = a['results'][0] if a['results'] else None
            verdict = judge(word, first, named) if first else 'nothing'
            if hits:
                reached += 1
                reached_tokens += count
                if verdict not in ('own entry', 'right lemma'):
                    wrong += 1
                    wrong_tokens += count
                    wrong_words.append((count, word, first['expression'] if first else '-'))
            if first and classify(first, lemmas) == 'other rule reading':
                unnamed.append((count, word, first['expression'], [t for t, _ in first['trace']]))
        listed[set_name] = unnamed
        wrong_listed[set_name] = wrong_words
        # The same words written with a capital letter, as at a sentence start.
        capitalised = run_batch(transforms, args.dictionary, [w[:1].upper() + w[1:] for w in words])
        caps = [(c, w, a['results'][0]['expression']) for w, c, a in zip(words, counts, capitalised)
                if a['results'] and capital_at_start(a['results'][0], w[:1].upper() + w[1:], '', headwords)]
        cap_words[set_name] = caps
        print(f'| {set_name} | {reached} | {100 * reached_tokens / total:.2f}% | {wrong} | {100 * wrong_tokens / total:.3f}% | {len(unnamed)} | '
              f'{len(caps)} ({100 * sum(c for c, _, _ in caps) / total:.2f}% of tokens) |')
    if args.show:
        for set_name, wrong_words in wrong_listed.items():
            print(f'\n{set_name}: a rule reaches the lemma, the first result is not it ({len(wrong_words)}; - is nothing found):')
            print('  ' + ' | '.join(f'{c}:{w}->{e}' for c, w, e in sorted(wrong_words, reverse=True)[:args.show]))
        for set_name, caps in cap_words.items():
            print(f'\n{set_name}: written with a capital, a capitalised headword first ({len(caps)}):')
            print('  ' + ' | '.join(f'{c}:{w}->{e}' for c, w, e in sorted(caps, reverse=True)[:args.show]))
        for set_name, unnamed in listed.items():
            print(f'\n{set_name}: other rule readings first ({len(unnamed)}):')
            for count, word, expression, trace in sorted(unnamed, reverse=True)[:args.show]:
                print(f'  {count}\t{word}\t{expression}\t{"|".join(trace)}')


def sentences_tatoeba(args):
    with bz2.open(Path(args.cache) / 'tgl_sentences.tsv.bz2', 'rt', encoding='utf-8') as f:
        return [line.rstrip('\n').split('\t')[2] for line in f]


def sentences_text(args):
    out = []
    for name in args.texts.split(','):
        text = (Path(args.cache) / 'gutenberg' / name).read_text(encoding='utf-8', errors='replace')
        start = text.find('*** START')
        if start >= 0:
            text = text[text.find('\n', start) + 1:]
        end = text.find('*** END')
        if end > 0:
            text = text[:end]
        for paragraph in re.split(r'\n\s*\n', text):
            flat = ' '.join(paragraph.split())
            out.extend(s for s in END.split(flat) if s)
    return out


def hovers(sentences):
    """(hover text, hovered word, word before it) for every word of every sentence."""
    out = []
    for sentence in sentences:
        previous = ''
        for m in WORD.finditer(sentence):
            out.append((sentence[m.start():], m.group(0), previous))
            previous = m.group(0)
    return out


# Readings that leave the word itself: the linker (own linker, Yomitan's -ng),
# contractions, and the hyphen put back or taken out.
GRAMMAR = {'linker', '-ng', 'contractionAy', 'contractionAt', 'contractionAng', 'apostropheSpelling', 'prefixHyphen', 'hyphenated'}


def capital_at_start(first, word, previous, headwords):
    """A capitalised headword (a name, an abbreviation) first for a word that
    starts its sentence, whose lowercase spelling is a headword too: Ang (a
    surname) for the article ang, May for may. The text as written needs no
    processor step and decapitalize one, so such a row comes first (README.md,
    Known gaps). Counted as wrong; right only where the capital is meant at the
    start of a sentence, as for Diyos."""
    if previous != '' or not word[:1].isupper() or not first['expression'][:1].isupper():
        return False
    return written(word[:1].lower() + word[1:]) in headwords


def classify(first, lemmas, word=None, previous=None, headwords=None):
    """own entry / named lemma / linker or contraction / other rule reading,
    or a capitalised headword at a sentence start."""
    if headwords is not None and capital_at_start(first, word, previous, headwords):
        return 'capital at sentence start'
    trace = first['trace']
    rule_steps = [t for t, from_dictionary in trace if not from_dictionary]
    if not rule_steps:
        return 'own entry or dictionary'
    verdict = judge(first['matched'], first, lemmas.get(norm(first['matched']), set()))
    if verdict in ('own entry', 'right lemma'):
        return 'named lemma'
    if set(rule_steps) <= GRAMMAR:
        return 'linker, contraction or spelling'
    return 'other rule reading'


def cmd_positions(args, sets, sentences, label):
    lemmas, headwords = dictionary_lemmas(Path(args.cache) / 'wty-tl-en.zip')
    for word, extra in corpus_lemmas().items():
        lemmas[word] |= extra
    positions = hovers(sentences)
    texts = [h for h, _, _ in positions]
    print(f'{label}: {len(sentences)} sentences, {len(positions)} positions')
    print('| Rule set | Positions found | Capitalised headword at a sentence start | First result as written or by a form-of row | A lemma a form-of row names | Linker, contraction or hyphen only | Other rule reading | of which multiword | Other, after a marker / pronoun / particle |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    listed = {}
    for set_name, transforms in sets.items():
        answers = run_batch(transforms, args.dictionary, texts)
        if args.dump:
            with open(f'{args.dump}.{set_name}.jsonl', 'w', encoding='utf-8') as f:
                for (text, word, previous), a in zip(positions, answers):
                    f.write(json.dumps({'word': word, 'previous': previous, 'text': text, 'results': a['results'][:3]},
                                       ensure_ascii=False) + '\n')
        found = 0
        kinds = collections.Counter()
        capitals = collections.Counter()
        multi = 0
        after = collections.Counter()
        items, linkers = [], []
        for (text, word, previous), a in zip(positions, answers):
            if not a['results']:
                continue
            found += 1
            first = a['results'][0]
            kind = classify(first, lemmas, word, previous, headwords)
            kinds[kind] += 1
            if kind == 'capital at sentence start':
                capitals[(word, first['expression'])] += 1
            if kind == 'other rule reading':
                multi += ' ' in first['matched']
                after[GROUP_OF.get(norm(previous), 'other')] += 1
                items.append((first['matched'], first['expression'], '|'.join(t for t, _ in first['trace']), text[:60]))
            if kind == 'linker, contraction or spelling':
                linkers.append((first['matched'], first['expression'], '|'.join(t for t, _ in first['trace']), text[:60]))
        listed[set_name] = (items, capitals, linkers)
        print(f"| {set_name} | {found} | {kinds['capital at sentence start']} | {kinds['own entry or dictionary']} | {kinds['named lemma']} | "
              f"{kinds['linker, contraction or spelling']} | {kinds['other rule reading']} | {multi} | {after['marker']} / {after['pronoun']} / {after['particle']} |")
    if args.show:
        for set_name, (items, capitals, linkers) in listed.items():
            print(f'\n{set_name}: capitalised headwords at a sentence start, by (word, expression), most frequent first:')
            for (w, e), c in capitals.most_common(args.show):
                print(f'  {c}\t{w}\t{e}')
            groups = collections.Counter((m.lower(), e) for m, e, _, _ in items)
            print(f'\n{set_name}: other rule readings by (matched, expression), most frequent first:')
            for (m, e), c in groups.most_common(args.show):
                trace = next(t for mm, ee, t, _ in items if mm.lower() == m and ee == e)
                print(f'  {c}\t{m}\t{e}\t{trace}')
            multis = collections.Counter((m.lower(), e) for m, e, _, _ in items if ' ' in m)
            print(f'\n{set_name}: multiword other rule readings ({sum(multis.values())}):')
            for (m, e), c in multis.most_common(args.show):
                print(f'  {c}\t{m}\t{e}')
            if args.sample:
                rng = random.Random(1)
                print(f'\n{set_name}: a random sample of {args.sample} other rule readings (seed 1), for judging by hand:')
                for item in rng.sample(items, min(args.sample, len(items))):
                    print('  ' + '\t'.join(item))
                rng = random.Random(1)
                print(f'\n{set_name}: a random sample of {args.sample} linker, contraction or hyphen readings (seed 1), for judging by hand:')
                for item in rng.sample(linkers, min(args.sample, len(linkers))):
                    print('  ' + '\t'.join(item))


ASPECTS = {'PFV': 'completive', 'IPFV': 'progressive', 'LGSPEC1': 'contemplative',
           'verb, completive': 'completive', 'verb, progressive': 'progressive', 'verb, contemplative': 'contemplative'}


def cmd_traces(args, sets):
    """Trace quality: for the sampled rows whose aspect is known, the share whose
    shortest trace to the lemma names it. A completive of an -um- verb is its
    infinitive (kumain), so rows whose form starts like an -um- infinitive
    (C + um, or um + vowel) count only for the other aspects."""
    rows = []
    lines = (PACK / 'tests' / 'corpus.tsv').read_text(encoding='utf-8').splitlines()
    lines += (PACK / 'tests' / 'gaps.tsv').read_text(encoding='utf-8').splitlines()
    for line in lines:
        cells = line.split('\t')
        if line.startswith('#') or len(cells) != 6:
            continue
        feature = next((ASPECTS[f] for f in ASPECTS if f in cells[0].split(';') or f == cells[0]), None)
        if feature is None:
            continue
        um = re.match(r'^(?:[bcdfghjklmnprstwy]|ng)um[aeiou]|^um[aeiou]', cells[2]) is not None
        if feature == 'completive' and um:
            continue
        rows.append((cells[2], cells[3], feature))
    print(f'{len(rows)} sampled rows with a completive, progressive or contemplative feature (the completive of -um- verbs left out)')
    print('| Rule set | Rows reached | Shortest trace names the aspect |')
    print('| --- | ---: | ---: |')
    for set_name, transforms in sets.items():
        answers = run_deinflect(transforms, [r[0] for r in rows])
        reached = named = 0
        for (form, lemma, aspect), a in zip(rows, answers):
            paths = [r['trace'] for r in a['results'] if r['text'] == lemma]
            if not paths:
                continue
            reached += 1
            named += aspect in min(paths, key=len)
        print(f'| {set_name} | {reached} | {named} ({100 * named / max(reached, 1):.1f}%) |')


def sentence_rows():
    rows = []
    for line in (PACK / 'sources' / 'sentences.tsv').read_text(encoding='utf-8').splitlines():
        if line.startswith('#') or not line.strip():
            continue
        sentence, word, lemma = line.split('\t')
        rows.append((sentence, word, lemma, sentence[sentence.index(word):]))
    return rows


def cmd_positions_list(args):
    """Every word position of sources/sentences.tsv, as the text from the word
    to the end of its sentence: the word list of the lookup benchmarks."""
    texts = [h for h, _, _ in hovers([sentence for sentence, _, _, _ in sentence_rows()])]
    assert not any(',' in t for t in texts), 'benchmark-lookup reads a comma as a CSV separator'
    print('\n'.join(texts))


def cmd_sentences(args, sets):
    rows = sentence_rows()
    if args.dump:
        Path(args.dump).write_text('\n'.join(h for _, _, _, h in rows) + '\n', encoding='utf-8')
    for set_name, transforms in sets.items():
        answers = run_batch(transforms, args.dictionary, [h for _, _, _, h in rows])
        right = own = 0
        lines = []
        for (sentence, word, lemma, hover), a in zip(rows, answers):
            first = a['results'][0] if a['results'] else None
            ok = first is not None and norm(first['expression']) == norm(lemma)
            # The word's own entry first (wty-tl-en defines many aspect forms
            # as "progressive aspect of kumain"), with the lemma after it.
            entry = (first is not None and not ok and norm(first['expression']) == norm(word)
                     and any(norm(r['expression']) == norm(lemma) for r in a['results'][1:]))
            right += ok
            own += entry
            got = f"{first['expression']} ({first['matched']}; {' > '.join(t for t, _ in first['trace']) or 'as written'})" if first else 'nothing'
            second = ', '.join(r['expression'] for r in a['results'][1:4])
            lines.append(f"| {word} | {lemma} | {got} | {second} | {'yes' if ok else 'own entry, then the lemma' if entry else 'no'} |")
        print(f'\n{set_name}: the expected entry first for {right} of {len(rows)} words, the word\'s own entry first and the expected one after it for {own}\n')
        if args.show:
            print('| Word | Expected | First result (matched; trace) | Next results | Expected first |')
            print('| --- | --- | --- | --- | --- |')
            print('\n'.join(lines))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['eval', 'frequent', 'tatoeba', 'text', 'sentences', 'traces', 'positions'])
    parser.add_argument('--cache')
    parser.add_argument('--dictionary')
    parser.add_argument('--work', default=None)
    parser.add_argument('--sets', default='own,yomitan,union,final')
    parser.add_argument('--texts', default='pg47629.txt,pg46639.txt')
    parser.add_argument('--show', type=int, default=0)
    parser.add_argument('--sample', type=int, default=0)
    parser.add_argument('--dump', default=None, help='write every position and its first three results to <dump>.<set>.jsonl')
    parser.add_argument('--untagged', choices=['filter', 'pass'], default=None,
                        help="lookup.untaggedTerms for the run (default: the pack's own, pass)")
    args = parser.parse_args()
    if args.command == 'positions':
        cmd_positions_list(args)
        return
    if not args.cache or not args.dictionary:
        parser.error('--cache and --dictionary are required')
    work = args.work or tempfile.mkdtemp(prefix='tl-measure-')
    args.work = work
    if args.untagged:
        global LANGUAGES
        LANGUAGES = untagged_pack(work, args.untagged)
    sets = {k: v for k, v in rule_sets(work).items() if k in args.sets.split(',')}
    if args.command == 'eval':
        cmd_eval(args, sets)
    elif args.command == 'frequent':
        cmd_frequent(args, sets)
    elif args.command == 'traces':
        cmd_traces(args, sets)
    elif args.command == 'sentences':
        cmd_sentences(args, sets)
    elif args.command == 'tatoeba':
        cmd_positions(args, sets, sentences_tatoeba(args), 'Tatoeba')
    else:
        cmd_positions(args, sets, sentences_text(args), args.texts)


if __name__ == '__main__':
    main()
