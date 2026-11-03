#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of README.md (Measurements 2-4). Not run by any test.

    python3 measure.py headwords <wty-la-en.zip> <out.pickle>
    python3 measure.py freq <out.tsv> <pg*.txt>...
    python3 measure.py hovers <out.txt> (<pg*.txt> | --tatoeba <lat_sentences.tsv>)...
    python3 measure.py judge <headwords.pickle> <hover.txt> <lookups.jsonl> --transforms <transforms.json> [--freq <freq.tsv>] [--top N] [--show N]
        [--sample N --sample-out <file> [--seed S]]

headwords reads a Yomitan dictionary's term banks and keeps, for every term,
whether it has a row with definitions (a lemma) and the lemmas its form-of
rows name ([term, [rules]] definitions, docs/languages.md 9.10).

freq counts the words of Project Gutenberg ebooks (the text between the
*** START and *** END lines): a frequency list of word forms, the forms that
differ only in case counted together under their most frequent spelling.

hovers writes, for every word of the texts, the text from that word to the
end of its sentence, as a host passes it to a lookup (one per line); with
--tatoeba, the sentences of a Tatoeba export (id, lang, text). Sentences end
after . ! ? or ; and a space.

judge reads the hovers and the answers of lookup-batch (languages/en/sources/
lookup-batch.cpp: one JSON line per hover, results in lookup order) and
judges each first result. The hovered word's keys are the word as written,
lowercased, without macrons, with j written i, and without an enclitic -que,
-ne or -ve. The first result is right when its expression is a key that is a
lemma, or a lemma a key's form-of rows name, or for a match of several words
(a participle and esse) a lemma the first word's form-of rows name; it is
wrong when some key has rows and it is none of those; otherwise it cannot be
judged by script. With --freq, the hovers are the --top most frequent words
of the list (each alone), and counts are also weighted by their frequency.
"""
import collections
import json
import pickle
import random
import re
import sys
import unicodedata
import zipfile

LETTERS = 'A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u0300-\u036F'
WORD = re.compile(f'[{LETTERS}]+')


def plain(text):
    return unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c)))


def headwords(zip_path, out_path):
    lemma, form_of = set(), collections.defaultdict(set)
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if not name.startswith('term_bank_'):
                continue
            for row in json.loads(z.read(name)):
                term, glossary = row[0], row[5]
                refs = [g for g in glossary if isinstance(g, list) and len(g) == 2 and isinstance(g[0], str) and g[0]]
                if len(refs) < len(glossary):
                    lemma.add(term)
                for ref in refs:
                    form_of[term].add(plain(ref[0]))
    with open(out_path, 'wb') as f:
        pickle.dump({'lemma': lemma, 'formOf': dict(form_of)}, f)
    print(f'{len(lemma)} lemmas, {len(form_of)} terms with form-of rows', file=sys.stderr)


def book_text(path):
    text = open(path, encoding='utf-8', errors='replace').read()
    start = text.find('*** START')
    if start >= 0:
        text = text[text.find('\n', start) + 1:]
    end = text.find('*** END')
    if end > 0:
        text = text[:end]
    return text


def freq(out_path, paths):
    counts = collections.Counter()
    spellings = collections.defaultdict(collections.Counter)
    for path in paths:
        for m in WORD.finditer(book_text(path)):
            counts[m.group(0).lower()] += 1
            spellings[m.group(0).lower()][m.group(0)] += 1
    with open(out_path, 'w', encoding='utf-8') as f:
        for word, n in counts.most_common():
            f.write(f'{spellings[word].most_common(1)[0][0]}\t{n}\n')
    print(f'{sum(counts.values())} tokens, {len(counts)} word forms', file=sys.stderr)


END = re.compile(r'(?<=[.!?;])["\u201D\u2019)\]]*\s+')


def sentences_of(text):
    for paragraph in re.split(r'\n\s*\n', text):
        flat = ' '.join(paragraph.split())
        yield from END.split(flat)


def hovers(out_path, args):
    texts = []
    i = 0
    while i < len(args):
        if args[i] == '--tatoeba':
            for line in open(args[i + 1], encoding='utf-8'):
                parts = line.rstrip('\n').split('\t')
                if len(parts) >= 3:
                    texts.extend(sentences_of(parts[2]))
            i += 2
        else:
            texts.extend(sentences_of(book_text(args[i])))
            i += 1
    out = []
    for sentence in texts:
        for m in WORD.finditer(sentence):
            out.append(sentence[m.start():])
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')
    print(f'{len(out)} hovers', file=sys.stderr)


def keys_of(word):
    word = word.replace('æ', 'ae').replace('Æ', 'Ae').replace('œ', 'oe').replace('Œ', 'Oe')
    base = plain(word).lower().replace('j', 'i')
    keys = [word, word.lower(), plain(word), base]
    for enclitic in ('que', 'ne', 've'):
        if base.endswith(enclitic) and len(base) > len(enclitic) + 1:
            keys.append(base[:-len(enclitic)])
    keys += [k[:1].upper() + k[1:] for k in keys]
    return list(dict.fromkeys(keys))


RULE_IDS = set()


def judge(args):
    data = pickle.load(open(args[0], 'rb'))
    opts0 = dict(zip(args[3::2], args[4::2]))
    for path in opts0.get('--transforms', '').split(','):
        if path:
            RULE_IDS.update(t['id'] for t in json.load(open(path, encoding='utf-8'))['transforms'])
    lemma, form_of = data['lemma'], data['formOf']
    hover_lines = open(args[1], encoding='utf-8').read().split('\n')
    answers = [json.loads(line) for line in open(args[2], encoding='utf-8') if line.strip()]
    opts = dict(zip(args[3::2], args[4::2]))
    weights = None
    if '--freq' in opts:
        top = int(opts.get('--top', '10000'))
        weights = {}
        for line in open(opts['--freq'], encoding='utf-8'):
            word, n = line.rstrip('\n').split('\t')
            weights[word] = int(n)
            if len(weights) >= top:
                break
    show = int(opts.get('--show', '0'))
    totals = collections.Counter()
    wrong_groups = collections.Counter()
    examples = collections.defaultdict(list)
    unjudged = []
    for text, answer in zip(hover_lines, answers):
        assert answer['text'] == text, (answer['text'], text)
        m = WORD.match(text)
        if m is None:
            continue
        word = m.group(0)
        weight = weights.get(word, 0) if weights is not None else 1
        totals['lookups'] += 1
        totals['tokens'] += weight
        results = answer['results']
        if not results:
            totals['nothing'] += 1
            totals['nothing tokens'] += weight
            continue
        first = results[0]
        keys = keys_of(word)
        known = [k for k in keys if k in lemma or k in form_of]
        # Right: a key that is a lemma, or a lemma a key's form-of rows name,
        # directly or through one more form-of row (an alternative spelling,
        # a comparative or superlative: hæc → haec → hic).
        right = {k for k in known if k in lemma}
        for k in known:
            for x in form_of.get(k, set()):
                right.add(x)
                right |= form_of.get(x, set())
        expression = first['expression']
        matched = first['matched']
        # A headword of several words or with punctuation that starts with the
        # hovered word (in medio, non modo, I.), or one a form-of row of the
        # matched words names with no rule applied (pulvere pyriō → pulvis
        # pyrius), is the dictionary's own entry.
        dictionary_only = all(step not in RULE_IDS for step in first['trace'])
        if (' ' in matched or not matched[-1:].isalpha()) and (plain(expression).lower().startswith(plain(word).lower()) or dictionary_only):
            totals['phrase'] += 1
            totals['phrase tokens'] += weight
            continue
        if ' ' in matched:
            first_word = matched.split(' ')[0]
            for k in keys_of(first_word):
                for x in form_of.get(k, set()):
                    right.add(x)
                    right |= form_of.get(x, set())
        if not known:
            totals['unjudged'] += 1
            unjudged.append((text, first))
            continue
        totals['judged'] += 1
        if expression in right or plain(expression) in right:
            totals['right'] += 1
            totals['right tokens'] += weight
        else:
            totals['wrong'] += 1
            totals['wrong tokens'] += weight
            group = first['trace'][0] if first['trace'] else '(as written)'
            wrong_groups[group] += 1
            if len(examples[group]) < 6:
                examples[group].append(f'{word} -> {expression} [{"<".join(first["trace"])}] matched "{first["matched"]}"')
    print(json.dumps(totals, sort_keys=True))
    for group, n in wrong_groups.most_common(show or 15):
        print(f'{n:6d}  {group}: {"; ".join(examples[group])}')
    if '--sample' in opts:
        random.seed(int(opts.get('--seed', '1')))
        sample = random.sample(unjudged, min(int(opts['--sample']), len(unjudged)))
        with open(opts['--sample-out'], 'w', encoding='utf-8') as f:
            for text, first in sample:
                f.write(json.dumps({'text': text[:60], 'expression': first['expression'], 'matched': first['matched'], 'trace': first['trace']}, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    command, rest = sys.argv[1], sys.argv[2:]
    if command == 'headwords':
        headwords(*rest)
    elif command == 'freq':
        freq(rest[0], rest[1:])
    elif command == 'hovers':
        hovers(rest[0], rest[1:])
    elif command == 'judge':
        judge(rest)
    else:
        sys.exit(__doc__)
