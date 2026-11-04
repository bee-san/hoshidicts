#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of README.md (Measurements) that need a real dictionary.

Not run by any test. Inputs (not committed; README.md, Sources and licences):
the wty-ru-en zip and its import by `hoshidicts-cli import`, the FrequencyWords
list ru_50k.txt, Tatoeba's Russian sentences and public-domain texts. Build
sources/lookup-batch.cpp first (its header has the command).

  python3 languages/ru/sources/measure.py frequent --zip wty-ru-en.zip --dict <imported dir>
      --freq ru_50k.txt --batch build/lookup-batch-ru [--languages languages] [--exempt] [--top 10000]
  python3 languages/ru/sources/measure.py text --zip wty-ru-en.zip --dict <imported dir>
      --batch build/lookup-batch-ru --text <file>... [--exempt] [--sample 60]

frequent: for each of the --top most frequent words whose wty-ru-en form-of rows
name a lemma that the pack's rules reach from the word, the word is looked up as
a host does (lookup-batch-ru: 16 results, scan length 16, default options) and
the first result with a definition (not a form-of row) is compared with the
lemmas its form-of rows name. A result is right only when it is one of those
lemmas, or the word itself when it is also a lemma.

text: every word of the texts is looked up as a host does, the text from the
word to the end of its sentence; the first result with a definition is judged
by the same rule where the word has form-of rows, and the rest are counted and
sampled for judging by hand.

Words written with е whose only headword is their ё spelling (вперед: вперёд)
have no rows of their own; both subcommands judge them against that headword
(frequent lists them apart as yoHeadword*).

Capital entries (MAJOR-3 of audit-hachi-lang-ru-b): at the start of a sentence
the text as written matches the capital's own headword (the letter Я, the river
По) with no processor step, before the small-letter word. `text` counts these
positions (CAPITAL_ENTRY below) and the own-lemma rate with them counted wrong;
`frequent --capitalised` looks each word up with a capital first letter.

--exempt runs lookup-batch-ru with the dictionary exempt from the part-of-speech
filter (LookupOptions::pos_filter_exempt), which stands in for the pack field
lookup.untaggedTerms "pass" until it is on main; results whose conditions only
an intermediate rule state gives are not counted as reached (see --help of
each subcommand).
"""

import argparse
import collections
import json
import os
import re
import subprocess
import sys
import zipfile

ROOT = __file__.rsplit('/languages/', 1)[0]
HERE = os.path.dirname(os.path.abspath(__file__))
CLI = __import__('os').environ.get('HOSHIDICTS_CLI', f'{ROOT}/build/hoshidicts-cli')


def load_dictionary(path):
    """Form-of references and lemma rows of a wiktionary-to-yomitan zip."""
    refs = collections.defaultdict(set)  # word -> lemmas its form-of rows name
    lemmas = set()  # terms with a row that has definitions
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(z.read(name)):
                term, defs = row[0], row[5]
                is_ref = lambda d: isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0] != '' and isinstance(d[1], list)
                if any(is_ref(d) for d in defs):
                    for d in defs:
                        if is_ref(d):
                            refs[term].add(strip_stress(d[0]))
                if any(not is_ref(d) for d in defs):
                    lemmas.add(term)
    return refs, lemmas


def strip_stress(text):
    """The text without the stress marks wiktionary-to-yomitan leaves in some references."""
    import unicodedata
    return unicodedata.normalize('NFC', re.sub('[\u0300\u0301]', '', unicodedata.normalize('NFD', text)))


def run_lines(args, lines):
    out = subprocess.run(args, input='\n'.join(lines) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def deinflections(languages, words):
    """Every text the pack's processors and rules give for each word."""
    pre = run_lines([CLI, '--languages', languages, 'preprocess', 'ru', '--stdin'], words)
    variants = {p['input']: [v['text'] for v in p['variants']] for p in pre}
    texts = sorted({t for v in variants.values() for t in v})
    res = run_lines([CLI, '--languages', languages, 'deinflect', 'ru', '--stdin'], texts)
    by_text = {r['input']: r['results'] for r in res}
    out = {}
    for word in words:
        out[word] = [r for t in variants[word] for r in by_text[t]]
    return out


def lookups(batch, languages, dictionary, texts, exempt):
    args = [batch, languages, 'ru', dictionary] + (['--exempt'] if exempt else [])
    return run_lines(args, texts)


def yo_spellings(word):
    """The word and its spellings with one е written ё."""
    out = [word]
    if 'ё' not in word:
        for i, c in enumerate(word):
            if c == 'е':
                out.append(word[:i] + 'ё' + word[i + 1:])
    return out


def accepted(word, refs, lemmas, yo=False):
    """The lemmas a first result may be for `word`: the lemmas its form-of rows
    name, the lemmas those name in turn (a participle's verb, a diminutive's
    noun: wiktionary-to-yomitan writes сделано → сделанный → сделать), and the
    word itself when it has a definition. With yo, also those of the word's
    spellings with one е written ё (узнает: узнать, and узнаёт: узнавать)."""
    spellings = {word}
    if yo:
        spellings |= {word.replace('ё', 'е')}
        for i, c in enumerate(word):
            if c == 'е':
                spellings.add(word[:i] + 'ё' + word[i + 1:])
    named = set()
    for s in spellings:
        named |= refs.get(s, set())
        if s in lemmas:
            named.add(s)
    if not named and not yo:
        # No row of its own: the word stands for its ё spellings.
        return accepted(word, refs, lemmas, yo=True)
    second = set()
    for n in named:
        second |= refs.get(n, set())
    return named | second


def lemma_proxy(refs, lemmas, counts):
    """A frequency for each lemma: the tokens of the list's words whose form-of
    rows name only that lemma, plus the lemma's own tokens when it is a headword
    no row names as a form of something else."""
    proxy = collections.Counter()
    for w, c in counts.items():
        named = refs.get(w, set())
        if w in lemmas and not named:
            proxy[w] += c
        elif len(named) == 1 and w not in lemmas:
            proxy[next(iter(named))] += c
    return proxy


def load_labels(path):
    """(word, first result) -> R (right), W (wrong) or D (debatable), from
    sources/tie-labels.tsv: the hand labels of first results that a word's
    rows name beside a more frequent lemma (judged in context)."""
    labels = {}
    if path is None:
        return labels
    for line in open(path, encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        word, first, label = line.rstrip('\n').split('\t')[:3]
        labels[(word, first)] = label
    return labels


PRONOUN_OF = {}
for _lemma, _forms in {'я': 'меня мне мной мною', 'ты': 'тебя тебе тобой тобою', 'он': 'его него ему нему им ним нём',
                       'она': 'её неё ее нее ей ней ею нею', 'мы': 'нас нам нами', 'вы': 'вас вам вами',
                       'они': 'их них ими ними', 'себя': 'себе собой собою'}.items():
    for _form in _forms.split():
        PRONOUN_OF.setdefault(_form, _lemma)


def own_lemma_ok(word, first, refs, lemmas, proxy, labels, ratio=10):
    """The contract's judge (docs/languages.md 14 step 5): the first result must be
    the word's own lemma. A label decides when there is one; otherwise a first
    result that the word's rows name is right unless another lemma they name is
    `ratio` times more frequent by the proxy (at least 50 tokens), and a result
    the rows do not name is wrong."""
    label = labels.get((word.lower(), first))
    if label is not None:
        return label != 'W'
    spellings = set(yo_spellings(word.lower())) | {word, word.lower(), word.lower().capitalize()}
    if first in spellings or first.lower() in spellings:
        # The word itself, as written or with ё or another capital (это, его,
        # даешь → даёшь, господи → Господи): its own entry.
        return first in lemmas or first.lower() in lemmas
    if word.lower() in PRONOUN_OF:
        # wiktionary-to-yomitan's rows of every personal pronoun's form name
        # every personal pronoun (её → я, она, он, мы …), so the proxy cannot
        # tell them apart: the right one is the form's own pronoun.
        return first == PRONOUN_OF[word.lower()]
    ok = accepted(word, refs, lemmas)
    if first not in ok and first.lower() not in ok:
        return False
    named = set()
    for sp in yo_spellings(word):
        named |= refs.get(sp, set())
    if word in lemmas:
        named.add(word)
    if not named:
        return True
    best = max(named, key=lambda l: proxy.get(l, 0))
    # A lemma the dominant one names in turn (a participle's verb:
    # зарегистрировано → зарегистрированный → зарегистрировать) is that reading.
    if first in refs.get(best, set()):
        return True
    return not (best != first and proxy.get(best, 0) >= ratio * max(proxy.get(first, 0), 1) and proxy.get(best, 0) >= 50)


def first_with_definition(results):
    for r in results:
        if not r['formOf']:
            return r
    return None


# The capital's own headword where a sentence needs the small-letter word: a
# one-letter word that is not an initial (not followed by '.') shown as the
# letter (tag char), and three capitalised names spelled like function words.
CAPITAL_NAMES = {'По', 'Один', 'Или'}


def capital_entry(word, hover, first):
    """Whether the first result is the capital's own headword (as audit-hachi-lang-ru-b counts it)."""
    if first['expression'] != word or first['matched'] != word or not word[:1].isupper():
        return False
    tags = first.get('tags', '').split()
    if len(word) == 1:
        return not hover[len(word):].startswith('.') and 'char' in tags
    return word in CAPITAL_NAMES and 'name' in tags


def yo_headword_only(word, refs, lemmas):
    """A word with no rows of its own whose ё spelling is a headword (вперед: вперёд)."""
    spellings = yo_spellings(word)
    return word not in lemmas and not any(refs.get(sp) for sp in spellings) and any(sp in lemmas for sp in spellings[1:])


def all_counts(path):
    counts = {}
    for line in open(path, encoding='utf-8'):
        word, count = line.split()
        counts.setdefault(word, int(count))
    return counts


def capitalised(a, refs, lemmas, words, counts):
    """Each word looked up with a capital first letter, as at the start of a
    sentence: the words whose first result is a capitalised term while the
    small-letter lookup shows a small-letter one, split by how it was reached."""
    words = [w for w in words if w[:1].islower()]
    caps = [w[0].upper() + w[1:] for w in words]
    small = lookups(a.batch, a.languages, a.dict, words, a.exempt)
    big = lookups(a.batch, a.languages, a.dict, caps, a.exempt)
    rows = []
    for w, c, x, y in zip(words, caps, small, big):
        fx, fy = first_with_definition(x['results']), first_with_definition(y['results'])
        if not fx or not fy:
            continue
        if fy['expression'][:1].isupper() and not fx['expression'][:1].isupper() and fy['expression'] != fx['expression']:
            how = 'own entry as written' if not fy['trace'] and fy['expression'] == c else ('pack rule' if any(t in RULE_IDS for t in fy['trace']) else 'form-of row of the capitalised word')
            rows.append((w, counts[w], fx['expression'], fy['expression'], how, fy['trace']))
    total = sum(counts[w] for w in words)
    split = collections.Counter(); split_tokens = collections.Counter()
    for r in rows:
        split[r[4]] += 1; split_tokens[r[4]] += r[1]
    print(json.dumps({'words': len(words), 'capitalisedFirst': len(rows), 'tokens': sum(r[1] for r in rows),
                      'shareOfListTokens': sum(r[1] for r in rows) / total if total else 0,
                      'byCause': {k: [split[k], split_tokens[k]] for k in split}}, ensure_ascii=False))
    for r in sorted(rows, key=lambda r: -r[1])[: a.show]:
        print(f'  {r[0]}\t{r[1]}\tsmall={r[2]}\tcapital={r[3]}\t{r[4]}\ttrace={r[5]}')


RULE_IDS = set()


def frequent(a):
    refs, lemmas = load_dictionary(a.zip)
    global RULE_IDS
    RULE_IDS = {t['id'] for t in json.load(open(os.path.join(a.languages, 'ru', 'transforms.json'), encoding='utf-8'))['transforms']}
    words = []
    counts = {}
    for line in open(a.freq, encoding='utf-8'):
        word, count = line.split()
        if word in counts:
            continue
        counts[word] = int(count)
        words.append(word)
        if len(words) >= a.top:
            break
    total_tokens = sum(counts.values())
    if a.capitalised:
        return capitalised(a, refs, lemmas, words, counts)
    de = deinflections(a.languages, words)
    # Reached: a lemma the word's form-of rows name is among the deinflections
    # with a dictionary-form condition (not only an intermediate state).
    dictionary_forms = {'v', 'n', 'name', 'adj', 'pron', 'num'}
    # A word written with е where wiktionary-to-yomitan writes ё (узнает, its
    # row узнаёт) has form-of rows only under its ё spelling; those name the
    # lemmas of the word's readings (узнаёт: узнавать), and its е spelling's
    # rows, when they exist, name the others (узнает: узнать). Both count for
    # reach; the judge accepts only the word's own rows (see accepted).
    reached = []
    for w in words:
        named = set()
        for sp in yo_spellings(w):
            named |= refs.get(sp, set())
        if not named:
            continue
        got = {r['text'] for r in de[w] if r['trace'] and set(r['conditions']) & dictionary_forms}
        if got & named:
            reached.append(w)
    # Words whose only headword is their ё spelling (вперед: вперёд) have no
    # rows, so the list above leaves them out; they are judged apart.
    yo_only = [w for w in words if yo_headword_only(w, refs, lemmas)]
    looked = lookups(a.batch, a.languages, a.dict, reached + yo_only, a.exempt)
    looked, yo_looked = looked[: len(reached)], looked[len(reached):]
    proxy = lemma_proxy(refs, lemmas, all_counts(a.freq))
    labels = load_labels(a.labels)
    yo_wrong = []
    for w, o in zip(yo_only, yo_looked):
        first = first_with_definition(o['results'])
        if first is not None and not own_lemma_ok(w, first['expression'], refs, lemmas, proxy, labels):
            yo_wrong.append((w, counts[w], first['expression'], first['trace']))
    wrong = []
    missing = []
    strict_wrong = []
    for w, o in zip(reached, looked):
        first = first_with_definition(o['results'])
        if first is None:
            missing.append(w)
            continue
        if first['expression'] not in accepted(w, refs, lemmas):
            via_yo = first['expression'] in accepted(w, refs, lemmas, yo=True)
            wrong.append((w, counts[w], first['expression'], first['trace'], sorted(refs[w]), via_yo))
        if not own_lemma_ok(w, first['expression'], refs, lemmas, proxy, labels):
            strict_wrong.append((w, counts[w], first['expression'], first['trace']))
    reached_tokens = sum(counts[w] for w in reached)
    wrong_tokens = sum(c for _, c, *_ in wrong)
    print(json.dumps({
        'words': len(words), 'tokens': total_tokens,
        'withFormOf': sum(1 for w in words if any(refs.get(sp) for sp in yo_spellings(w))),
        'reached': len(reached), 'reachedTokens': reached_tokens,
        'noDefinitionFirst': len(missing), 'noDefinitionTokens': sum(counts[w] for w in missing),
        'wrongFirst': len(wrong), 'wrongTokens': wrong_tokens,
        'wrongButAnotherYoSpelling': sum(1 for x in wrong if x[5]), 'wrongButAnotherYoSpellingTokens': sum(x[1] for x in wrong if x[5]),
        'wrongShareOfReachedTokens': wrong_tokens / reached_tokens if reached_tokens else 0,
        'wrongShareOfListTokens': wrong_tokens / total_tokens,
        'ownLemmaWrong': len(strict_wrong), 'ownLemmaWrongTokens': sum(c for _, c, *_ in strict_wrong),
        'ownLemmaWrongShareOfReachedTokens': sum(c for _, c, *_ in strict_wrong) / reached_tokens if reached_tokens else 0,
        'yoHeadwordWords': len(yo_only), 'yoHeadwordTokens': sum(counts[w] for w in yo_only),
        'yoHeadwordWrong': len(yo_wrong), 'yoHeadwordWrongTokens': sum(c for _, c, *_ in yo_wrong),
        'exempt': a.exempt,
    }, ensure_ascii=False))
    for w, c, got, trace, want, via_yo in sorted(wrong, key=lambda x: -x[1])[: a.show]:
        print(f'  {w}\t{c}\tfirst={got}\ttrace={trace}\twant={want}' + ('\t(a form of its ё spelling)' if via_yo else ''))
    # The cause of each: with --no-rules (a copy of the pack without
    # transforms), a word whose first result is also wrong there is wrong
    # through the dictionary's own rows and the ranking keys, not the rules.
    cause = {}
    if a.no_rules:
        bare = lookups(a.batch, a.no_rules, a.dict, [w for w, *_ in strict_wrong], a.exempt)
        for (w, c, got, trace), o in zip(strict_wrong, bare):
            f = first_with_definition(o['results'])
            cause[w] = 'rules' if f is not None and own_lemma_ok(w, f['expression'], refs, lemmas, proxy, labels) else 'dictionary'
        split = collections.Counter(); split_tokens = collections.Counter()
        for w, c, *_ in strict_wrong:
            split[cause[w]] += 1; split_tokens[cause[w]] += c
        print(json.dumps({'ownLemmaWrongByCause': dict(split), 'ownLemmaWrongTokensByCause': dict(split_tokens)}))
    print('wrong by the own-lemma judge (labels, then the frequency proxy):')
    for w, c, got, trace in sorted(strict_wrong, key=lambda x: -x[1])[: a.show]:
        print(f'  {w}\t{c}\tfirst={got}\ttrace={trace}' + (f'\t{cause[w]}' if w in cause else ''))
    print('words whose only headword is their ё spelling, shown another term first:')
    yo_cause = {}
    if a.no_rules and yo_wrong:
        bare = lookups(a.batch, a.no_rules, a.dict, [w for w, *_ in yo_wrong], a.exempt)
        for (w, *_), o in zip(yo_wrong, bare):
            f = first_with_definition(o['results'])
            yo_cause[w] = 'rules' if f is not None and own_lemma_ok(w, f['expression'], refs, lemmas, proxy, labels) else 'dictionary'
    for w, c, got, trace in sorted(yo_wrong, key=lambda x: -x[1])[: a.show]:
        print(f'  {w}\t{c}\tfirst={got}\ttrace={trace}' + (f'\t{yo_cause[w]}' if w in yo_cause else ''))


WORD = re.compile(r'[А-Яа-яЁё\u0300\u0301]+(?:-[А-Яа-яЁё\u0300\u0301]+)*')
END = re.compile(r'[.!?…]')


def hovers(text):
    """(word, the text from the word to the end of its sentence) for every word,
    as a host scans it (docs/languages.md 9.1; scanStart word)."""
    out = []
    for para in text.split('\n'):
        for m in WORD.finditer(para):
            rest = para[m.start():]
            end = END.search(rest)
            out.append((m.group(0), rest[: end.start() + 1] if end else rest))
    return out


def text(a):
    import random
    refs, lemmas = load_dictionary(a.zip)
    positions = []
    for path in a.text:
        positions += hovers(open(path, encoding='utf-8').read())
    texts = [h for _, h in positions]
    looked = lookups(a.batch, a.languages, a.dict, texts, a.exempt)
    proxy = lemma_proxy(refs, lemmas, all_counts(a.freq)) if a.freq else collections.Counter()
    labels = load_labels(a.labels)
    strict = collections.Counter()
    capitals = collections.Counter()
    capital_strict = 0
    judged = wrong = none = 0
    groups = collections.Counter()
    rest = []
    wrong_rows = []
    strict_at = []  # (position, word, first result) wrong by the own-lemma judge or a capital entry

    def candidates(word):
        key = strip_stress(word)
        lower = key[0].lower() + key[1:]
        return [k for k in (key, lower, key.lower()) if any(refs.get(sp) for sp in yo_spellings(k)) or k in lemmas or yo_headword_only(k, refs, lemmas)]

    def own_wrong(word, hover, first, cands):
        return not any(own_lemma_ok(k, first['expression'], refs, lemmas, proxy, labels) for k in cands) or capital_entry(word, hover, first)

    for i, ((word, hover), o) in enumerate(zip(positions, looked)):
        first = first_with_definition(o['results'])
        if first is None:
            none += 1
            continue
        cands = candidates(word)
        if first['matched'].lower() != word.lower() or not cands:
            rest.append((word, hover, first['expression'], first['matched'], first['trace']))
            continue
        judged += 1
        if capital_entry(word, hover, first):
            capitals[word] += 1
        ok = set()
        for k in cands:
            ok |= accepted(k, refs, lemmas)
        if first['expression'] not in ok and first['expression'].lower() not in ok:
            wrong += 1
            groups[tuple(first['trace'][:1])] += 1
            wrong_rows.append((word, first['expression'], first['trace'], sorted(ok)[:4]))
        if a.freq and not any(own_lemma_ok(k, first['expression'], refs, lemmas, proxy, labels) for k in cands):
            strict[(word.lower(), first['expression'])] += 1
            strict_at.append((i, word, first['expression']))
        elif a.freq and capital_entry(word, hover, first):
            # Counted right above (the word's own entry), wrong by the contract's judge.
            capital_strict += 1
            strict_at.append((i, word, first['expression']))
    print(json.dumps({'lookups': len(positions), 'noResult': none, 'judgedByScript': judged, 'wrongByScript': wrong,
                      'wrongRate': wrong / judged if judged else 0, 'notJudgedByScript': len(rest),
                      'ownLemmaWrong': sum(strict.values()) if a.freq else None,
                      'ownLemmaWrongRate': sum(strict.values()) / judged if a.freq and judged else None,
                      'capitalEntryFirst': sum(capitals.values()),
                      'ownLemmaWrongWithCapitals': sum(strict.values()) + capital_strict if a.freq else None,
                      'ownLemmaWrongRateWithCapitals': (sum(strict.values()) + capital_strict) / judged if a.freq and judged else None,
                      'exempt': a.exempt}, ensure_ascii=False))
    print('capital entries first (the letter, По, Один, Или):', capitals.most_common())
    if a.freq and a.no_rules:
        # The cause of each wrong position: also wrong (or not judged) with a copy
        # of the pack without transforms means the dictionary's rows and the
        # ranking keys, not the rules.
        bare = lookups(a.batch, a.no_rules, a.dict, [positions[i][1] for i, *_ in strict_at], a.exempt)
        cause = collections.Counter(); rule_groups = collections.Counter(); dict_groups = collections.Counter()
        for (i, word, expr), o in zip(strict_at, bare):
            f = first_with_definition(o['results'])
            hover = positions[i][1]
            cands = candidates(word)
            if f is not None and f['matched'].lower() == word.lower() and cands and not own_wrong(word, hover, f, cands):
                cause['rules'] += 1; rule_groups[(word.lower(), expr)] += 1
            else:
                cause['dictionary'] += 1; dict_groups[(word.lower(), expr)] += 1
        print(json.dumps({'ownLemmaWrongWithCapitalsByCause': dict(cause)}, ensure_ascii=False))
        print('caused by the rules, largest groups:', rule_groups.most_common(a.show))
        print('wrong without the rules too, largest groups:', dict_groups.most_common(a.show))
    if a.freq:
        print('wrong by the own-lemma judge, largest groups:', strict.most_common(a.show))
    print('rules behind the wrong first results:', groups.most_common(12))
    counts = collections.Counter((w.lower(), e) for w, e, *_ in wrong_rows)
    for (w, e), c in counts.most_common(a.show):
        trace = next(t for ww, ee, t, _ in wrong_rows if ww.lower() == w and ee == e)
        want = next(k for ww, ee, _, k in wrong_rows if ww.lower() == w and ee == e)
        print(f'  {c}\t{w}\tfirst={e}\ttrace={trace}\twant={want}')
    rng = random.Random(a.seed)
    print(f'sample of {a.sample} positions the script does not judge (judge by hand):')
    for word, hover, expr, matched, trace in rng.sample(rest, min(a.sample, len(rest))):
        print(f'  {word}\t{matched}\t{expr}\t{trace}\t{hover[:60]}')


def compare(a):
    """How many positions of the texts change their first result with a definition
    between two copies of the pack (--languages and --other), and the largest
    groups: the measurement of a constraint by removing it (a copy without
    stemCharacters, for example)."""
    positions = []
    for path in a.text:
        positions += hovers(open(path, encoding='utf-8').read())
    texts = [h for _, h in positions]
    first = lambda o: (lambda f: (f['expression'], f['matched']) if f else None)(first_with_definition(o['results']))
    base = lookups(a.batch, a.languages, a.dict, texts, False)
    other = lookups(a.batch, a.other, a.dict, texts, False)
    changes = collections.Counter()
    for (word, _), x, y in zip(positions, base, other):
        fx, fy = first(x), first(y)
        if fx != fy:
            changes[(fy[1] if fy else None, fx[0] if fx else None, fy[0] if fy else None)] += 1
    print(json.dumps({'lookups': len(positions), 'changed': sum(changes.values())}, ensure_ascii=False))
    for (matched, was, now), c in changes.most_common(a.show):
        print(f'  {c}\t{matched}\t{was} -> {now}')


FUNCTION_WORDS = ['в', 'во', 'на', 'с', 'со', 'к', 'ко', 'о', 'об', 'обо', 'по', 'за', 'из', 'от', 'у', 'до', 'для', 'без', 'под', 'над', 'при', 'про', 'через', 'не', 'ни']


def phrases(a):
    """Hovers that start at a preposition or negation before an inflected word
    (в доме, с матерью, не знаю), from Tatoeba sentences. The first result
    should be the preposition, a phrase the dictionary lists, or the next word's
    lemma never: a rule reading that spans the two words is a collision."""
    import bz2, random
    refs, lemmas = load_dictionary(a.zip)
    rng = random.Random(a.seed)
    sentences = [line.split('\t', 2)[2].rstrip('\n') for line in bz2.open(a.tatoeba, 'rt', encoding='utf-8')]
    rng.shuffle(sentences)
    picked = []
    for sent in sentences[: a.sentences]:
        for word, hover in hovers(sent):
            if word.lower() in FUNCTION_WORDS:
                nxt = WORD.search(hover, len(word))
                if nxt and hover[len(word):nxt.start()] == ' ':
                    picked.append((word, nxt.group(0), hover))
    looked = lookups(a.batch, a.languages, a.dict, [h for *_, h in picked], a.exempt)
    kinds = collections.Counter()
    spans = collections.Counter()
    for (fw, nxt, hover), o in zip(picked, looked):
        first = first_with_definition(o['results'])
        if first is None:
            kinds['no result'] += 1
        elif first['matched'].lower() == fw.lower():
            kinds['the function word'] += 1
        elif first['trace'] == [] or all(not t.startswith(('noun-', 'adj-', 'verb-', 'pron-', 'num-')) for t in first['trace']):
            kinds['a phrase the dictionary lists'] += 1
        else:
            kinds['a rule reading over two words'] += 1
            spans[(first['matched'].lower(), first['expression'], tuple(first['trace']))] += 1
    print(json.dumps({'sentences': a.sentences, 'positions': len(picked), 'first': dict(kinds), 'exempt': a.exempt}, ensure_ascii=False))
    for (m, e, t), c in spans.most_common(a.show):
        print(f'  {c}\t{m}\tfirst={e}\ttrace={list(t)}')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    f = sub.add_parser('frequent')
    f.add_argument('--zip', required=True)
    f.add_argument('--dict', required=True)
    f.add_argument('--freq', required=True)
    f.add_argument('--batch', required=True)
    f.add_argument('--languages', default=f'{ROOT}/languages')
    f.add_argument('--exempt', action='store_true')
    f.add_argument('--top', type=int, default=10000)
    f.add_argument('--show', type=int, default=60)
    f.add_argument('--labels', default=os.path.join(HERE, 'tie-labels.tsv'))
    f.add_argument('--no-rules', help='a languages dir whose ru pack has no transforms, to split wrong words by cause')
    f.add_argument('--capitalised', action='store_true', help='look the words up with a capital first letter (capital entries first)')
    t = sub.add_parser('text')
    t.add_argument('--zip', required=True)
    t.add_argument('--dict', required=True)
    t.add_argument('--text', nargs='+', required=True)
    t.add_argument('--batch', required=True)
    t.add_argument('--languages', default=f'{ROOT}/languages')
    t.add_argument('--exempt', action='store_true')
    t.add_argument('--sample', type=int, default=60)
    t.add_argument('--seed', type=int, default=1)
    t.add_argument('--show', type=int, default=40)
    t.add_argument('--freq', help='ru_50k.txt, for the own-lemma judge')
    t.add_argument('--labels', default=os.path.join(HERE, 'tie-labels.tsv'))
    t.add_argument('--no-rules', help='a languages dir whose ru pack has no transforms, to split wrong positions by cause')
    ph = sub.add_parser('phrases')
    ph.add_argument('--zip', required=True)
    ph.add_argument('--dict', required=True)
    ph.add_argument('--tatoeba', required=True)
    ph.add_argument('--batch', required=True)
    ph.add_argument('--languages', default=f'{ROOT}/languages')
    ph.add_argument('--exempt', action='store_true')
    ph.add_argument('--sentences', type=int, default=40000)
    ph.add_argument('--seed', type=int, default=20261103)
    ph.add_argument('--show', type=int, default=30)
    cp = sub.add_parser('compare')
    cp.add_argument('--dict', required=True)
    cp.add_argument('--batch', required=True)
    cp.add_argument('--languages', default=f'{ROOT}/languages')
    cp.add_argument('--other', required=True)
    cp.add_argument('--text', nargs='+', required=True)
    cp.add_argument('--show', type=int, default=30)
    a = p.parse_args()
    if a.cmd == 'compare':
        compare(a)
    if a.cmd == 'phrases':
        phrases(a)
    if a.cmd == 'frequent':
        frequent(a)
    elif a.cmd == 'text':
        text(a)


if __name__ == '__main__':
    main()
