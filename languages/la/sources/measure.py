#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of README.md (Measurements 2-4). Not run by any test.

    python3 measure.py headwords <wty-la-en.zip> <out.pickle>
    python3 measure.py freq <out.tsv> <pg*.txt>...
    python3 measure.py hovers <out.txt> (<pg*.txt> | --tatoeba <lat_sentences.tsv>)...
    python3 measure.py judge <headwords.pickle> <hover.txt> <lookups.jsonl> --transforms <transforms.json> [--freq <freq.tsv>] [--top N] [--show N]
        [--homographs <tsv>] [--reach <cli> [--languages <dir>] [--corpus <tsv>,...]] [--kinds 1]
        [--sample N --sample-out <file> [--sample-of ambiguous|own|changed] [--seed S]] [--same-as <lookups.jsonl>]
    python3 measure.py first <corpus.tsv> <lookups.jsonl>

headwords keeps each term's parts of speech (rows with definitions) and the
lemmas its form-of rows name, with their kind (ref_kind). freq counts the words
of Project Gutenberg ebooks under their most frequent spelling. hovers writes,
for every word, the text to the end of its sentence (one per line), from
ebooks or a Tatoeba export. judge judges the first result of each answer of
languages/en/sources/lookup-batch.cpp as README.md, Measurements, says;
--reach keeps the words whose lemma a rule reaches, --kinds counts enclitic,
esse, pronoun and esse-form positions, --sample draws positions to judge by
hand, --freq weights by frequency, --same-as counts the wrong first results
other lookups (with no rules) also give. first breaks first rank down.
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


SPELLING = ('alternative', 'alt-of', 'misspelling', 'contraction', 'syncop', 'spelling', 'lowercase', 'uppercase')


def ref_kind(rules):
    """A form-of reference's kind: 'spell' (another spelling of the lemma),
    'parent' (a participle or gerundive of a verb, a comparative or
    superlative of an adjective or adverb) or 'form'."""
    names = ' '.join(rules)
    if any(word in names for word in SPELLING):
        return 'spell'
    if any(word in names for word in ('participle', 'gerundive', 'comparative', 'superlative')):
        return 'parent'
    return 'form'


def headwords(zip_path, out_path):
    lemma, refs = collections.defaultdict(set), collections.defaultdict(set)
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if not name.startswith('term_bank_'):
                continue
            for row in json.loads(z.read(name)):
                term, glossary = row[0], row[5]
                found = [g for g in glossary if isinstance(g, list) and len(g) == 2 and isinstance(g[0], str) and g[0]]
                if len(found) < len(glossary):
                    lemma[term].add(row[3])
                for ref in found:
                    refs[term].add((plain(ref[0]), ref_kind(ref[1] if isinstance(ref[1], list) else [])))
    with open(out_path, 'wb') as f:
        pickle.dump({'lemma': dict(lemma), 'refs': dict(refs)}, f)
    print(f'{len(lemma)} lemmas, {len(refs)} terms with form-of rows', file=sys.stderr)


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


def keys_of(word, enclitics=True):
    word = word.replace('æ', 'ae').replace('Æ', 'Ae').replace('œ', 'oe').replace('Œ', 'Oe')
    base = plain(word).lower().replace('j', 'i')
    keys = [word, word.lower(), plain(word), base]
    for enclitic in ('que', 'ne', 've') if enclitics else ():
        if base.endswith(enclitic) and len(base) > len(enclitic) + 1:
            keys.append(base[:-len(enclitic)])
    keys += [k[:1].upper() + k[1:] for k in keys]
    return list(dict.fromkeys(keys))


RULE_IDS = set()
PRONOUNS = {'ego', 'tu', 'sui', 'nos', 'vos', 'is', 'hic', 'ille', 'iste', 'ipse', 'idem', 'qui', 'quis'}


def reach(cli, languages, hover_lines, refs):
    """The hovered words whose form-of lemma a rule's deinflection reaches."""
    import subprocess
    words = sorted({m.group(0) for line in hover_lines if (m := WORD.match(line))})
    def run(command, inputs):
        out = subprocess.run(command, input='\n'.join(inputs) + '\n', capture_output=True, text=True, check=True).stdout
        return [json.loads(line) for line in out.splitlines()]
    variants = {d['input']: [v['text'] for v in d['variants']]
                for d in run([cli, '--languages', languages, 'preprocess', 'la', '--stdin', '--all-options'], words)}
    texts = sorted({t for vs in variants.values() for t in vs})
    found = {d['input']: {r['text'] for r in d['results'] if r['trace']}
             for d in run([cli, '--languages', languages, 'deinflect', 'la', '--stdin', '--all-options'], texts)}
    out = set()
    for word in words:
        lemmas = {t for k in keys_of(word) for t, _ in refs.get(k, ())}
        if any(found[t] & lemmas for t in variants[word]):
            out.add(word)
    return out


def readings(keys, lemma, refs):
    """A word's own lemmas (keys that are lemmas and the lemmas their form-of
    rows name), the lemmas right for it (those, their other spellings, the
    verbs of participles and the positives of comparatives among them), and
    how many words the own lemmas are: lemmas joined by such a reference
    count once."""
    own = {k for k in keys if k in lemma} | {t for k in keys for t, _ in refs.get(k, ())}
    spelled = own | {t for x in own for t, kind in refs.get(x, ()) if kind == 'spell'}
    right = spelled | {t for x in spelled for t, kind in refs.get(x, ()) if kind == 'parent'}
    parent = {x: x for x in right}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for x in spelled:
        for t, kind in refs.get(x, ()):
            if kind != 'form' and t in parent:
                parent[find(x)] = find(t)
    return own, right, len({find(x) for x in own})


def judge(args):
    data = pickle.load(open(args[0], 'rb'))
    opts = dict(zip(args[3::2], args[4::2]))
    for path in opts.get('--transforms', '').split(','):
        if path:
            RULE_IDS.update(t['id'] for t in json.load(open(path, encoding='utf-8'))['transforms'])
    lemma, refs = data['lemma'], data['refs']
    for path in opts.get('--corpus', '').split(','):
        for line in open(path, encoding='utf-8') if path else ():
            row = line.rstrip('\n').split('\t')
            if not line.startswith('#') and len(row) > 3 and row[1] == '1':
                for k in {row[2], plain(row[2])}:
                    refs[k] = refs.get(k, set()) | {(row[3], 'form')}
    needed = {}
    for line in open(opts['--homographs'], encoding='utf-8') if '--homographs' in opts else ():
        if not line.startswith('#') and line.strip():
            word, lemmas = line.rstrip('\n').split('\t')[:2]
            needed[word] = set(lemmas.split(','))
    hover_lines = open(args[1], encoding='utf-8').read().split('\n')
    answers = [json.loads(line) for line in open(args[2], encoding='utf-8') if line.strip()]
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
    reached = reach(opts['--reach'], opts.get('--languages', 'languages'), hover_lines, refs) if '--reach' in opts else None
    kinds = collections.Counter() if '--kinds' in opts else None
    totals = collections.Counter()
    wrong_groups = collections.Counter()
    examples = collections.defaultdict(list)
    same = [json.loads(line) for line in open(opts['--same-as'], encoding='utf-8')] if '--same-as' in opts else None
    unjudged, ambiguous, own_entries, changed = [], [], [], []
    nominal = lambda k: bool(lemma.get(k, set()) - {'v'})
    for index, (text, answer) in enumerate(zip(hover_lines, answers)):
        assert answer['text'] == text, (answer['text'], text)
        m = WORD.match(text)
        if m is None:
            continue
        word = m.group(0)
        if reached is not None and word not in reached:
            continue
        weight = weights.get(word, 0) if weights is not None else 1
        totals['lookups'] += 1
        totals['tokens'] += weight
        results = answer['results']
        keys = keys_of(word)
        known = [k for k in keys if k in lemma or k in refs]
        kind = []
        if kinds is not None:
            whole = [k for k in keys_of(word, enclitics=False) if k in lemma or k in refs]
            own = {k for k in whole if k in lemma} | {t for k in whole for t, _ in refs.get(k, ())}
            if results and ' ' in results[0]['matched'] and 'esse' in results[0]['trace']:
                kind.append('esse')
            if not whole and known:
                kind.append('enclitic')
            if own & PRONOUNS:
                kind.append('pronoun')
            if 'sum' in own:
                kind.append('form of esse')
            for k in kind:
                kinds[f'{k} lookups'] += 1
        if not results:
            totals['nothing'] += 1
            totals['nothing tokens'] += weight
            continue
        first = results[0]
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
        if not known:
            totals['unjudged'] += 1
            unjudged.append((text, first))
            continue
        totals['judged'] += 1
        own, right, count = readings(keys, lemma, refs)
        if ' ' in matched:
            # A rule read several words as one verb (a participle and esse):
            # right for the verb of the first word's participle, but open when
            # that word, or a lemma it is a form of, is also a noun or adjective.
            first_keys = keys_of(matched.split(' ')[0])
            own, right, count = readings(first_keys, lemma, refs)
            right = {x for x in right if 'v' in lemma.get(x, ()) or any(t == x and k == 'parent' for y in own for t, k in refs.get(y, ()))}
            count = 2 if any(nominal(x) for x in set(first_keys) | own) else 1
        found = expression in right or plain(expression) in right
        verdict = 'wrong' if not found else 'right' if count == 1 else 'ambiguous'
        key = plain(word.replace('æ', 'ae').replace('Æ', 'Ae').replace('œ', 'oe').replace('Œ', 'Oe')).lower().replace('j', 'i')
        if verdict == 'ambiguous' and key in needed:
            verdict = 'right' if expression in needed[key] or plain(expression) in needed[key] else 'wrong'
            totals['decided by the homograph list'] += 1
        elif verdict == 'ambiguous' and ' ' not in matched and expression in keys and expression in lemma:
            # The word's own entry, as written (modo the adverb, also the
            # ablative of modus): right, but counted and sampled apart.
            verdict = 'right'
            totals['own entry'] += 1
            totals['own entry tokens'] += weight
            own_entries.append((text, first))
        totals[verdict] += 1
        totals[f'{verdict} tokens'] += weight
        for k in kind:
            kinds[f'{k} {verdict}'] += 1
        if verdict == 'ambiguous':
            ambiguous.append((text, first))
            if same is not None and same[index]['results'][:1] and same[index]['results'][0]['expression'] != expression:
                changed.append((text, first, same[index]['results'][0]['expression']))
                totals['ambiguous, the rules change it'] += 1
        if verdict == 'wrong':
            if same is not None and same[index]['results'][:1] and same[index]['results'][0]['expression'] == expression:
                totals['wrong, the same without rules'] += 1
                totals['wrong tokens, the same without rules'] += weight
            if any((r['expression'] in right or plain(r['expression']) in right) and r['matched'] == matched
                   and len(r['trace']) == len(first['trace']) for r in results[1:]):
                totals['wrong, a right lemma tied'] += 1
            group = first['trace'][0] if first['trace'] else '(as written)'
            wrong_groups[group] += 1
            if len(examples[group]) < 6:
                examples[group].append(f'{word} -> {expression} [{"<".join(first["trace"])}] matched "{first["matched"]}"')
    print(json.dumps(totals, sort_keys=True))
    if kinds is not None:
        print(json.dumps(kinds, sort_keys=True))
    for group, n in wrong_groups.most_common(show or 15):
        print(f'{n:6d}  {group}: {"; ".join(examples[group])}')
    if '--sample' in opts:
        random.seed(int(opts.get('--seed', '1')))
        pool = {'ambiguous': ambiguous, 'own': own_entries, 'changed': changed}.get(opts.get('--sample-of'), unjudged)
        sample = random.sample(pool, min(int(opts['--sample']), len(pool)))
        with open(opts['--sample-out'], 'w', encoding='utf-8') as f:
            for text, first, *norules in sample:
                f.write(json.dumps({'text': text[:60], 'expression': first['expression'], 'matched': first['matched'], 'trace': first['trace'], 'norules': norules[:1]}, ensure_ascii=False) + '\n')


def first(corpus, lookups):
    rows = [line.rstrip('\n').split('\t') for line in open(corpus, encoding='utf-8') if not line.startswith('#')]
    counts = collections.Counter()
    for row, line in zip(rows, open(lookups, encoding='utf-8')):
        answer = json.loads(line)
        assert answer['text'] == row[2], (answer['text'], row[2])
        found = [plain(r['expression']).lower() for r in answer['results'] if r['matched'] == row[2]]
        counts['no result for the whole source' if not found else 'first' if found[0] == row[3].lower()
               else 'after another term' if row[3].lower() in found else 'not among the results'] += 1
    print(json.dumps(counts, sort_keys=True))


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
    elif command == 'first':
        first(*rest)
    else:
        sys.exit(__doc__)
