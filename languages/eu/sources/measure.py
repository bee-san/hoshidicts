#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The README's real-text measurements (Measurements 2-4).

    python3 languages/eu/sources/measure.py freq <cache> <imported dictionary> [--languages <dir>] [--top N] [--capitalized]
    python3 languages/eu/sources/measure.py text <cache> <imported dictionary> [--languages <dir>] [--corpus garoa|wikipedia|tatoeba]
    python3 languages/eu/sources/measure.py sample <cache> <imported dictionary> [--languages <dir>] [--corpus ...] [--n 60]
    python3 languages/eu/sources/measure.py yomitan <cache> <imported dictionary> [--languages <dir>] [--union <file>]
    python3 languages/eu/sources/measure.py contexts <cache> <imported dictionary> [--languages <dir>] [--corpus tatoeba]
    python3 languages/eu/sources/measure.py unimorph <cache> - [--languages <dir>]
    python3 languages/eu/sources/measure.py capitals <cache> <imported dictionary> [--languages <dir>] [--top N]

<cache> holds the downloads the README names (MANIFEST in hachi-lang-cache/eu):
wty-eu-en-json/ (the dictionary's banks, unzipped), eu_50k-2018.txt,
eus_sentences.tsv, texts/garoa/*.txt and texts/wikipedia/[0-9]*.txt. The
imported dictionary is wty-eu-en imported by `hoshidicts-cli import`.

Lookups run build/eu-lookup-batch (sources/lookup-batch.cpp): Lookup::lookup
with 16 results, scan length 16 and no options, as a host's hover does.

freq: of the N (10,000) most frequent words of the subtitle list, the words
whose lemma a rule reaches, where the word's form-of rows in the dictionary
or UniMorph eus name the lemma; for each, whether the first result is the
word's own lemma (judge below): for a word whose rows name one lemma, by
script; for a homograph, by the hand-judged table sources/judged-frequent.tsv.

yomitan: for each of Yomitan's rules (sources/yomitan.json), forms built
from the ten most frequent lemmas (subtitle list) of the parts of speech the
rule writes whose spelling ends with its deinflected text, with its inflected
ending put in place; how many of them are attested (in the subtitle list or
in kaikki's tables for that lemma), and how many attested ones the pack's
transforms.json and the rule itself reach.

capitals: of the N most frequent words, those whose first result written
with a capital (as at the start of a sentence) is a capitalized entry other
than the word's first result in small letters (Lurrean: Lurra, the Earth,
before lur), with their share of the list's tokens.

unimorph: recall over every distinct (form, lemma) of UniMorph eus (ukan read
as edun), and the same weighted by each form's count in the subtitle list.

contexts: the text measurement restricted to the words behind a personal
pronoun or demonstrative (nik, zuk, hark, ...), behind the negation ez, and
in front of a form of the auxiliaries (ikusi dut, nahi dut): where a lookup
from the word could read the phrase.

text: every word of the corpus looked up with the rest of its sentence. The
first result is judged by script where the word's rows name one lemma (or the
word is that lemma's own entry and its rows name nothing else); the rest,
homographs included, are counted as unjudged, and `sample` draws a random
sample of them (seed 1) for judging by hand, in context.
"""

import collections
import glob
import json
import os
import random
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
# A word is a run of the pack's word characters (letters and digits); one
# with a digit (1990ean, XX.) is a number, which no one looks up as a word,
# and is left out.
WORD = re.compile(r"[A-Za-zÀ-ÖØ-öø-ɏ0-9]+")


def args_of(argv):
    opts = {'--languages': os.path.join(ROOT, 'languages'), '--top': '10000', '--corpus': 'garoa', '--n': '60', '--capitalized': None}
    pos = []
    i = 0
    while i < len(argv):
        if argv[i] == '--capitalized':
            opts['--capitalized'] = True
            i += 1
        elif argv[i] in opts:
            opts[argv[i]] = argv[i + 1]
            i += 2
        else:
            pos.append(argv[i])
            i += 1
    return pos, opts


# UniMorph's roots of the auxiliaries and wiktionary-to-yomitan's citation
# forms name the same verbs: UniMorph lists the transitive auxiliary as ukan
# and edun, the subjunctive and potential roots as ezan and edin, and the
# dictionary's form-of rows name izan for all of them (dut, dezake, daiteke).
AUX = {'ukan': {'edun', 'izan'}, 'edun': {'edun', 'izan'}, 'ezan': {'ezan', 'edun', 'izan'}, 'edin': {'edin', 'izan'}}


def unimorph_lemmas(cache):
    out = collections.defaultdict(set)
    with open(os.path.join(cache, 'unimorph-eus', 'eus'), encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) == 3:
                out[parts[1]] |= AUX.get(parts[0], {parts[0]})
    return out


def dictionary_rows(cache):
    """headword -> {'lemma': bool (a row with definitions), 'formOf': {target: [rules]}}."""
    out = collections.defaultdict(lambda: {'lemma': False, 'formOf': collections.defaultdict(list)})
    for form, lemmas in unimorph_lemmas(cache).items():
        for lemma in lemmas:
            out[form]['formOf'][lemma].append('UniMorph')
    for path in sorted(glob.glob(os.path.join(cache, 'wty-eu-en-json', 'term_bank_*.json'))):
        with open(path, encoding='utf-8') as f:
            for row in json.load(f):
                refs = [d for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and isinstance(d[1], list)]
                if refs:
                    for target, rules in refs:
                        out[row[0]]['formOf'][target].extend(rules)
                else:
                    out[row[0]]['lemma'] = True
    return out


def lookups(languages, dictionary, texts):
    cli = os.path.join(ROOT, 'build', 'eu-lookup-batch')
    result = subprocess.run([cli, languages, 'eu', dictionary], input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True)
    return [json.loads(line) for line in result.stdout.splitlines()]


def deinflections(languages, words):
    cli = os.path.join(ROOT, 'build', 'hoshidicts-cli')
    result = subprocess.run([cli, '--languages', languages, 'deinflect', 'eu', '--stdin'], input='\n'.join(words) + '\n',
                            capture_output=True, text=True, check=True)
    return {d['input']: d['results'] for d in map(json.loads, result.stdout.splitlines())}


AUXILIARIES = {'izan', 'edun', 'ezan', 'edin'}


def lemma_class(lemma):
    """izan and *edun and their roots are one lemma for judging: wty-eu-en
    files the auxiliaries' forms under izan, UniMorph under edun and ezan."""
    return 'AUX' if lemma in AUXILIARIES else lemma


def candidates(word, rows):
    """The lemmas a learner may need for the word, as classes: the word's own
    entry, the lemmas its form-of rows name (one more hop where a named lemma
    has only references itself: ikustera names ikuste, whose row names
    ikusi), for the word as written, in small letters and with a capital."""
    out = set()
    for w in {word, word.lower(), word[:1].upper() + word[1:].lower()}:
        if w not in rows:
            continue
        if rows[w]['lemma']:
            out.add(w)
        for lemma in rows[w]['formOf']:
            target = rows.get(lemma)
            if target is not None and not target['lemma'] and target['formOf'] and lemma not in AUXILIARIES:
                out |= set(target['formOf'])
            else:
                out.add(lemma)
    return {lemma_class(lemma) for lemma in out}


def read_judged(path):
    """sources/judged-frequent.tsv: the hand-judged lemmas of ambiguous words."""
    out = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            word, accepted = line.rstrip('\n').split('\t')
            out[word] = set(accepted.split(','))
    return out


def judge(word, first, rows, judged=None):
    """'right', 'wrong', 'none' (nothing found) or None (the script cannot
    judge it). Only the word's own lemma counts as right (section 14 step 5):
    a word whose candidates are one lemma is judged by script; a word with
    several (homographs such as zuen: izan and zuek) only by the hand-judged
    table, or not at all."""
    if first is None:
        return 'none'
    if first['matched'].lower() != word.lower():
        # A match longer than the word (a multiword entry) or shorter.
        return None
    found = candidates(word, rows)
    if not found:
        return None
    if len(found) == 1:
        # The lemma, or a spelling the lemma's own rows send to (dario names
        # jario, whose verb row is an alternative of jariatu).
        (lemma,) = found
        accepted = found | {lemma_class(l) for l in rows.get(lemma, {'formOf': {}})['formOf']}
        return 'right' if lemma_class(first['expression']) in accepted else 'wrong'
    if judged is not None and word in judged:
        return 'right' if lemma_class(first['expression']) in judged[word] else 'wrong'
    return None


def freq(cache, dictionary, opts):
    rows = dictionary_rows(cache)
    top = int(opts['--top'])
    words = []
    with open(os.path.join(cache, 'eu_50k-2018.txt'), encoding='utf-8') as f:
        for line in f:
            w, c = line.split()
            words.append((w, int(c)))
            if len(words) == top:
                break
    total_tokens = sum(c for _, c in words)
    judged = read_judged(os.path.join(HERE, 'judged-frequent.tsv'))
    dein = deinflections(opts['--languages'], [w for w, _ in words])
    reached = []
    for w, c in words:
        found = candidates(w, rows)
        texts = {lemma_class(r['text']) for r in dein[w] if r['trace']}
        if found & texts:
            reached.append((w, c, found))
    # --capitalized: the words as a sentence starts them (Etxean), judged
    # against the same lemmas.
    written = [w[:1].upper() + w[1:] if opts['--capitalized'] else w for w, _, _ in reached]
    looked = lookups(opts['--languages'], dictionary, written)
    wrong = []
    unjudged = []
    ambiguous = 0
    for (w, c, found), d in zip(reached, looked):
        first = d['results'][0] if d['results'] else None
        ambiguous += len(found) > 1
        verdict = judge(w, first, rows, judged)
        if verdict is None and len(found) > 1 and first is not None and first['matched'].lower() == w.lower():
            unjudged.append(w)
        elif verdict in ('wrong', 'none'):
            wrong.append((w, c, first['expression'] if first else None, first['trace'] if first else None, sorted(found)))
    reached_tokens = sum(c for _, c, _ in reached)
    wrong_tokens = sum(c for _, c, *_ in wrong)
    print(json.dumps({'words': len(words), 'tokens': total_tokens, 'reached': len(reached), 'reachedTokens': reached_tokens,
                      'ambiguous': ambiguous, 'notInJudgedTable': unjudged, 'wrongFirst': len(wrong), 'wrongTokens': wrong_tokens,
                      'wrongShareOfReachedTokens': round(wrong_tokens / max(reached_tokens, 1), 5),
                      'wrongShareOfListTokens': round(wrong_tokens / total_tokens, 5)}, ensure_ascii=False))
    for item in sorted(wrong, key=lambda x: -x[1]):
        print(json.dumps(item, ensure_ascii=False))


def sentences(cache, corpus):
    if corpus == 'tatoeba':
        with open(os.path.join(cache, 'eus_sentences.tsv'), encoding='utf-8') as f:
            for line in f:
                parts = line.rstrip('\n').split('\t')
                if len(parts) == 3:
                    yield parts[2]
        return
    pattern = {'garoa': 'texts/garoa/*.txt', 'wikipedia': 'texts/wikipedia/[0-9]*.txt'}[corpus]
    for path in sorted(glob.glob(os.path.join(cache, pattern))):
        with open(path, encoding='utf-8') as f:
            text = f.read()
        for paragraph in re.split(r'\n\s*\n', text):
            paragraph = ' '.join(paragraph.split())
            for s in re.split(r'(?<=[.!?…])\s+', paragraph):
                if s:
                    yield s


def positions(cache, corpus):
    """(word, text from the word to the end of its sentence) for every word."""
    out = []
    for s in sentences(cache, corpus):
        for m in WORD.finditer(s):
            if not any(c.isdigit() for c in m.group(0)):
                out.append((m.group(0), s[m.start():]))
    return out


def text(cache, dictionary, opts, sample=False):
    rows = dictionary_rows(cache)
    pos = positions(cache, opts['--corpus'])
    looked = lookups(opts['--languages'], dictionary, [t for _, t in pos])
    counts = collections.Counter()
    wrong = collections.Counter()
    rules = collections.Counter()
    unjudged = []
    for (word, t), d in zip(pos, looked):
        first = d['results'][0] if d['results'] else None
        verdict = judge(word, first, rows)
        if verdict is None:
            counts['unjudged'] += 1
            unjudged.append((word, t, first))
        else:
            counts[verdict] += 1
            if verdict == 'wrong':
                wrong[(word.lower(), first['expression'])] += 1
                rules[' > '.join(first['trace'])] += 1
    if sample:
        random.seed(1)
        picked = random.sample(unjudged, min(int(opts['--n']), len(unjudged)))
        for word, t, first in picked:
            print(json.dumps({'word': word, 'text': t[:80], 'first': first and {k: first[k] for k in ('expression', 'matched', 'trace')}},
                             ensure_ascii=False))
        return
    print(json.dumps({'corpus': opts['--corpus'], 'positions': len(pos), **counts,
                      'wrongRate': round(counts['wrong'] / max(len(pos), 1), 5)}, ensure_ascii=False))
    print('wrong (word, first result): ' + json.dumps(wrong.most_common(60), ensure_ascii=False))
    print('traces of wrong first results: ' + json.dumps(rules.most_common(25), ensure_ascii=False))


def kaikki_forms(cache):
    out = collections.defaultdict(set)
    with open(os.path.join(cache, 'kaikki.org-dictionary-Basque.jsonl'), encoding='utf-8') as f:
        for line in f:
            entry = json.loads(line)
            for form in entry.get('forms', []):
                out[entry.get('word', '')].add(form.get('form', ''))
    return out


def deinflect_with(languages, transforms, words):
    cli = os.path.join(ROOT, 'build', 'hoshidicts-cli')
    args = [cli, '--languages', languages, 'deinflect', 'eu', '--stdin', '--all-options']
    if transforms:
        args += ['--transforms', transforms]
    result = subprocess.run(args, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True)
    return {d['input']: d['results'] for d in map(json.loads, result.stdout.splitlines())}


def yomitan(cache, dictionary, opts):
    languages = opts['--languages']
    pack = os.path.join(languages, 'eu')
    with open(os.path.join(pack, 'sources', 'yomitan.json'), encoding='utf-8') as f:
        yrules = json.load(f)
    freq = {}
    with open(os.path.join(cache, 'eu_full-2018.txt'), encoding='utf-8') as f:
        for rank, line in enumerate(f):
            w, c = line.split()
            freq[w] = int(c)
    lemmas = collections.defaultdict(list)
    for path in sorted(glob.glob(os.path.join(cache, 'wty-eu-en-json', 'term_bank_*.json'))):
        with open(path, encoding='utf-8') as f:
            for row in json.load(f):
                if row[2] != 'non-lemma' and row[3] in ('n', 'adj', 'adv', 'v') and ' ' not in row[0] and row[0].islower():
                    lemmas[row[3]].append(row[0])
    for pos in lemmas:
        lemmas[pos] = sorted(set(lemmas[pos]), key=lambda w: -freq.get(w, 0))
    kk = kaikki_forms(cache)
    built = []
    for t in yrules['transforms']:
        for i, rule in enumerate(t['rules']):
            pos = [p for p in rule['conditionsOut'] if p in lemmas]
            pool = []
            for p in pos:
                pool += [w for w in lemmas[p] if w.endswith(rule['deinflected']) and len(w) > len(rule['deinflected'])]
            pool = sorted(set(pool), key=lambda w: -freq.get(w, 0))[:10]
            for lemma in pool:
                form = lemma[:len(lemma) - len(rule['deinflected'])] + rule['inflected']
                attested = form in freq or form in kk.get(lemma, set())
                built.append((t['id'], i, lemma, form, attested))
    words = sorted({b[3] for b in built})
    own = deinflect_with(languages, os.path.join(pack, 'transforms.json'), words)
    yom = deinflect_with(languages, os.path.join(pack, 'sources', 'yomitan.json'), words)
    by = collections.OrderedDict()
    for tid, i, lemma, form, attested in built:
        e = by.setdefault((tid, i), {'built': 0, 'attested': 0, 'ownReaches': 0, 'yomitanReaches': 0, 'unreachedByOwn': []})
        e['built'] += 1
        if attested:
            e['attested'] += 1
            if any(r['text'] == lemma for r in own[form]):
                e['ownReaches'] += 1
            else:
                e['unreachedByOwn'].append(f'{form} > {lemma}')
            if any(r['text'] == lemma for r in yom[form]):
                e['yomitanReaches'] += 1
    totals = collections.Counter()
    for (tid, i), e in by.items():
        totals.update({k: v for k, v in e.items() if isinstance(v, int)})
        print(json.dumps({'transform': tid, 'rule': i, **e}, ensure_ascii=False))
    print(json.dumps(dict(totals)))


PRONOUNS = set('ni nik niri nire hi hik hiri hire gu guk guri gure zu zuk zuri zure zuek zuei zuen hura hark hari haren haiek haiei haien '
               'hau honek honi hori horrek horri hauek horiek'.split())
AUXILIARY = set('naiz haiz da gara zara zarete dira nintzen zen ginen zinen ziren dut duk dun du dugu duzu duzue dute ditut ditu ditugu '
                'dituzu dituzte nuen zuen genuen zenuen zuten nituen zituen nuke luke zenuke genuke zait zaio zaizu dit dio dizu digu diot '
                'dizut diogu diozu diote zitzaion zion nion zidan'.split())


def contexts(cache, dictionary, opts):
    rows = dictionary_rows(cache)
    pos = []
    for s in sentences(cache, opts['--corpus'] if opts['--corpus'] != 'garoa' else 'tatoeba'):
        words = [(m.group(0), m.start()) for m in WORD.finditer(s) if not any(c.isdigit() for c in m.group(0))]
        for i, (w, start) in enumerate(words):
            before = words[i - 1][0].lower() if i > 0 else ''
            after = words[i + 1][0].lower() if i + 1 < len(words) else ''
            kinds = []
            if before in PRONOUNS:
                kinds.append('after a pronoun')
            if before == 'ez':
                kinds.append('after ez')
            if after in AUXILIARY:
                kinds.append('before an auxiliary')
            for k in kinds:
                pos.append((k, w, s[start:]))
    looked = lookups(opts['--languages'], dictionary, [t for _, _, t in pos])
    counts = collections.defaultdict(collections.Counter)
    wrong = collections.defaultdict(collections.Counter)
    for (kind, word, t), d in zip(pos, looked):
        first = d['results'][0] if d['results'] else None
        verdict = judge(word, first, rows) or 'unjudged'
        counts[kind][verdict] += 1
        if verdict == 'wrong':
            wrong[kind][(word.lower(), first['expression'], first['matched'])] += 1
    for kind in counts:
        print(json.dumps({'context': kind, 'positions': sum(counts[kind].values()), **counts[kind]}, ensure_ascii=False))
        print('  wrong: ' + json.dumps(wrong[kind].most_common(15), ensure_ascii=False))


def unimorph(cache, opts):
    pairs = set()
    with open(os.path.join(cache, 'unimorph-eus', 'eus'), encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) == 3 and parts[1] != parts[0]:
                pairs.add((parts[1], 'edun' if parts[0] == 'ukan' else parts[0]))
    freq = {}
    with open(os.path.join(cache, 'eu_full-2018.txt'), encoding='utf-8') as f:
        for line in f:
            w, c = line.split()
            freq[w] = int(c)
    dein = deinflections(opts['--languages'], sorted({form for form, _ in pairs}))
    reached = {(form, lemma) for form, lemma in pairs if any(r['text'] == lemma and (not r['conditions'] or 'v' in r['conditions'])
                                                            for r in dein[form])}
    tokens = sum(freq.get(form, 0) for form, _ in pairs)
    hit = sum(freq.get(form, 0) for form, _ in reached)
    print(json.dumps({'pairs': len(pairs), 'reached': len(reached), 'recall': round(len(reached) / len(pairs), 4),
                      'subtitleTokens': tokens, 'reachedTokens': hit, 'tokenRecall': round(hit / max(tokens, 1), 4)}))


def capitals(cache, dictionary, opts):
    top = int(opts['--top'])
    words = []
    with open(os.path.join(cache, 'eu_50k-2018.txt'), encoding='utf-8') as f:
        for line in f:
            w, c = line.split()
            words.append((w, int(c)))
            if len(words) == top:
                break
    total = sum(c for _, c in words)
    lower = lookups(opts['--languages'], dictionary, [w for w, _ in words])
    upper = lookups(opts['--languages'], dictionary, [w[:1].upper() + w[1:] for w, _ in words])
    changed = []
    for (w, c), a, b in zip(words, lower, upper):
        fa = a['results'][0]['expression'] if a['results'] else None
        fb = b['results'][0]['expression'] if b['results'] else None
        if fb is not None and fb != fa and fb[:1].isupper():
            changed.append((w, c, fa, fb))
    print(json.dumps({'words': len(words), 'changed': len(changed), 'tokens': sum(c for _, _, _, _ in changed) if False else sum(x[1] for x in changed),
                      'shareOfListTokens': round(sum(x[1] for x in changed) / total, 5)}))
    for item in sorted(changed, key=lambda x: -x[1]):
        print(json.dumps(item, ensure_ascii=False))


def main(argv):
    pos, opts = args_of(argv)
    if len(pos) != 3:
        raise SystemExit(__doc__)
    command, cache, dictionary = pos
    if command == 'freq':
        freq(cache, dictionary, opts)
    elif command == 'text':
        text(cache, dictionary, opts)
    elif command == 'sample':
        text(cache, dictionary, opts, sample=True)
    elif command == 'yomitan':
        yomitan(cache, dictionary, opts)
    elif command == 'contexts':
        contexts(cache, dictionary, opts)
    elif command == 'unimorph':
        unimorph(cache, opts)
    elif command == 'capitals':
        capitals(cache, dictionary, opts)
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
