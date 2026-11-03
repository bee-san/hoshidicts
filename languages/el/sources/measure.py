#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Measurements of README.md (Measurements 2-4). Not run by any test.
#
#   python3 languages/el/sources/measure.py frequent <el_50k.txt> <wty-el-en JSON banks dir> <lookups.jsonl>
#   python3 languages/el/sources/measure.py hovers <text file> [--sentences tsv] > hovers.txt
#   python3 languages/el/sources/measure.py judge <wty-el-en JSON banks dir> <hovers.txt> <lookups.jsonl> [--sample N]
#   python3 languages/el/sources/measure.py phrases <wty-el-en JSON banks dir> <hovers.txt> <lookups.jsonl>
#   python3 languages/el/sources/measure.py traces <corpus.tsv> <deinflections.jsonl>
#   python3 languages/el/sources/measure.py unimorph <unimorph ell file> <hoshidicts-cli> <languages dir>
#   python3 languages/el/sources/measure.py falsecands <wty-el-en JSON banks dir> <corpus.tsv> <hoshidicts-cli> <languages dir> [--tagged]
#   python3 languages/el/sources/measure.py firstrank <wty-el-en JSON banks dir> <corpus.tsv> <lookups.jsonl>
#   python3 languages/el/sources/measure.py capital-words <el_50k.txt> > capitals.txt
#   python3 languages/el/sources/measure.py capitals <el_50k.txt> <wty-el-en JSON banks dir> <lookups of the words> <lookups of capitals.txt>
#   python3 languages/el/sources/measure.py capital-rows <el_50k.txt> <wty-el-en JSON banks dir> <lookups of the words> [--defaults] > capitals.tsv
#   python3 languages/el/sources/measure.py yomitan-conditions <sources/yomitan.json> <sources/own.json> > yomitan-for-eval.json
#   python3 languages/el/sources/measure.py top <el_50k.txt> <wty-el-en JSON banks dir> <lookups.jsonl> 300
#   python3 languages/el/sources/measure.py ties <wty-el-en JSON banks dir> <hovers.txt> <lookups.jsonl>
#
# lookups.jsonl is the output of languages/en/sources/lookup-batch.cpp (built
# against this checkout) on the words or hover texts, one line each:
#   build/lookup-batch languages el <imported wty-el-en> < words.txt > lookups.jsonl
#
# frequent: for each of the 10,000 most frequent words whose lemma wty-el-en
# names (a form-of row of the word names it), the first result with a
# definition is judged by verdict() below. Prints the counts, the share of the
# list's tokens, and the wrong words by frequency.
# hovers: every Greek word of a text, as a host hovers it: the text from the
# word to the end of its sentence (one per line).
# phrases: the hover positions at a clitic, pronoun, article, particle or
# auxiliary (FUNCTION below) and at the word after one: at the function word,
# whether the first result reads past it (a phrase of the dictionary, or a
# wrong reading of the two words); after it, the judge's verdict on the word,
# by the function word before it.
# unimorph: recall over every one-word form of UniMorph ell (each form of a
# cell, without θα, να and the auxiliaries, as build-corpus.mjs reads them):
# the share of (form, lemma) pairs whose lemma is among the deinflections of
# a preprocessed variant of the form, by part of speech.
# frequent also counts the words whose lemma a rule reaches (a deinflection
# of a preprocessed variant of the word is a lemma its form-of rows name)
# when given --cli <hoshidicts-cli> --languages <dir>.
# falsecands: the false candidates of each valid row of a corpus file as
# eval-language counts them (docs/languages.md 10.3, formOf "follow"): a
# deinflected text whose row with definitions passes the part-of-speech
# filter, or the text a passing form-of row of a deinflected text names when
# that text has a row with definitions, other than the source and the
# lemma. Every optional processor and transform is on. Untagged rows are read
# as the pack's lookup.untaggedTerms says (with --tagged, always as "v n
# adj"). Prints the mean, which must equal eval-language's falseCandidates,
# and the rows.
# firstrank: why a corpus row's lemma is not the first result (lookups of
# the sources, `lookup-batch ... 16 64`): the lemma has no row with
# definitions, comes after another lemma the source's form-of rows name, or
# after another reading.
# capitals: of the 10,000 words, those whose first card is right in lowercase,
# judged again written in capitals without accents (ΘΑΛΑΣΣΑ).
# yomitan-conditions: Yomitan's rules declare only `v`, so eval-language
# cannot read the files' `n` and `adj` rows with them; this writes a copy of
# sources/yomitan.json with the pack's conditions added (the Yomitan row of
# README, Measurements 1).
# traces: for each verb row of the corpus, the trace a lookup keeps
# (traceSelection "shortest": the fewest steps among the deinflections that
# reach the lemma) and whether its first transform names the row's UniMorph
# tense and aspect, and its person and number. deinflections.jsonl is
# `hoshidicts-cli deinflect el --stdin --all-options` on the corpus sources.
# judge: the first result with a definition at each hover position, judged by
# verdict() where the dictionary names the hovered word's lemma; the rest are
# counted as unjudged, and a random sample of them (seed 1) is printed for
# review by hand.

import bz2, collections, glob, json, os, random, re, sys, unicodedata

GREEK = r"[\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03CE\u1F00-\u1FFF]"
# A word as a host's word scan finds it: letters and the apostrophes in and
# around them (the pack's class `apostrophe`: ' ’ ʼ ᾽ and the tonos ΄), so
# 'ρθει, απ' and σ΄αγαπώ are words.
APOSTROPHE = "['\u2019\u02BC\u1FBD\u0384]"
WORD = re.compile(APOSTROPHE + "?" + GREEK + "(?:" + GREEK + "|" + APOSTROPHE + GREEK + ")*" + APOSTROPHE + "?")
TERMINATORS = re.compile(r"[.!;;…\n]")


def is_ref(d):
    return isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0] and isinstance(d[1], list)


# The judge (section 14 step 5): a first card is right only when it is the
# word's own lemma. Three kinds of wty-el-en data are not taken as naming one:
# - the references to τα under rule names with "possessive" (a misread table
#   of the possessive pronoun: αυτό → τα "accusative third-person singular
#   masculine strong possessive"; 34 strong pronouns, and weak forms such as
#   το and του);
# - the references between the forms of the article, under rule names with
#   "definite" (οι → η, το, τις … "nominative plural definite"), except to
#   the article's headword ο;
# - terms whose only rows with definitions are a letter (tag `char`: η, Ο),
#   which no word of running text means; such a card is always wrong.
# A word's own row with definitions counts as its lemma (ο → ο, καλά → καλά),
# except for the homographs in HOMOGRAPH_WRONG, judged by hand: their own row
# is a rarer word than the lemma they are a form of (παιδιά "childish play"
# before the plural of παιδί, πας "every" before πάω; the other eight were
# found by audit-hachi-lang-el-b: ήλιο "helium" before ήλιος, θείο "sulphur",
# νεκρό "neutral gear", πόση "drinking", μαλάκα "a cheese", κόκκινη
# "quaffle", σκάφη "wash tub", γυναικών "ladies' toilet").
# In the subtitle list (frequent, top) a bare consonant or απ is an elided word
# whose apostrophe the list's tokenizer removed (μ' αρέσει, απ' το); its own
# row (the letter, "metre", the interjection απ) is not its lemma there.
LETTERS = set()
ARTICLE = 'ο'
HOMOGRAPH_WRONG = {'παιδιά', 'πας', 'ήλιο', 'θείο', 'νεκρό', 'πόση', 'μαλάκα', 'κόκκινη', 'σκάφη', 'γυναικών'}
ELIDED_BARE = set('βγδζθκλμνξπρσςτφχψ') | {'απ'}


def bogus_reference(target, rule_names):
    names = [r for r in rule_names if isinstance(r, str)]
    if target == 'τα' and any('possessive' in r for r in names):
        return True
    return target != ARTICLE and any(re.search(r'\bdefinite\b', r) for r in names)


def load_dictionary(banks):
    """term -> set of rules tags of rows with definitions; term -> lemmas its form-of rows name."""
    defined, refs = collections.defaultdict(set), collections.defaultdict(set)
    tags = collections.defaultdict(list)
    for f in sorted(glob.glob(banks.rstrip('/') + '/term_bank_*.json')):
        for row in json.load(open(f, encoding='utf-8')):
            if any(not is_ref(d) for d in row[5]):
                defined[row[0]].add(row[3])
                tags[row[0]].append(row[2].split()[:1])
            for d in row[5]:
                if is_ref(d) and not bogus_reference(d[0], d[1]):
                    refs[row[0]].add(d[0])
    LETTERS.update(t for t, ts in tags.items() if all(x == ['char'] for x in ts))
    return defined, refs


def named_lemmas(word, refs, defined):
    """The lemmas a form-of row of the word names, and, for a named form that has
    no definitions of its own (μιλά → μιλάει, μέρες → μέρα), the lemmas it names
    in turn; letters left out."""
    named = set(refs.get(word, set()))
    for n in list(named):
        if n not in defined:
            named |= refs.get(n, set())
    return {n for n in named if n not in LETTERS}


def right_lemmas(word, refs, defined):
    """The word's own lemmas: those its form-of rows name, and the word itself
    when it has definitions (not a letter, not a hand-judged homograph)."""
    right = named_lemmas(word, refs, defined)
    if word in defined and word not in LETTERS and word.lower() not in HOMOGRAPH_WRONG:
        right.add(word)
    return right


def verdict(word, first, refs, defined):
    """right, wrong or unjudged (no lemma known) for the first card with a definition."""
    if first['expression'] in LETTERS:
        return 'wrong'
    right = right_lemmas(word, refs, defined) | right_lemmas(word.lower(), refs, defined)
    if not right:
        return 'unjudged'
    if first['expression'] in right or first['expression'].lower() in {r.lower() for r in right if r not in LETTERS}:
        return 'right'
    return 'wrong'


def first_defined(results):
    for r in results:
        if not r['formOf']:
            return r
    return None




def deinflect_variants(cli, languages, words, options=()):
    """word -> set of texts its preprocessed variants deinflect to."""
    import subprocess
    run = lambda cmd, inputs: [json.loads(l) for l in subprocess.run([cli, '--languages', languages] + cmd, input='\n'.join(inputs) + '\n',
                                                                      capture_output=True, text=True, check=True).stdout.splitlines()]
    pre = {d['input']: [v['text'] for v in d['variants']] for d in run(['preprocess', 'el', '--stdin', *options], words)}
    texts = sorted({t for v in pre.values() for t in v})
    de = {d['input']: {r['text'] for r in d['results'][1:]} for d in run(['deinflect', 'el', '--stdin', *options], texts)}
    return {w: set().union(*(de[t] for t in pre[w])) for w in words}


def frequent(freq_file, banks, lookups, cli=None, languages=None):
    defined, refs = load_dictionary(banks)
    words = [line.split() for line in open(freq_file, encoding='utf-8')][:10000]
    reached_by_rule = deinflect_variants(cli, languages, [w for w, _ in words]) if cli else None
    results = [json.loads(line) for line in open(lookups, encoding='utf-8')]
    assert len(results) == len(words)
    total = sum(int(c) for _, c in words)
    counts = collections.Counter()
    tokens = collections.Counter()
    wrong_list = []
    empty_list = []
    for (word, count), answer in zip(words, results):
        count = int(count)
        if not named_lemmas(word, refs, defined):
            continue
        counts['reached'] += 1
        tokens['reached'] += count
        right = right_lemmas(word, refs, defined)
        first = first_defined(answer['results'])
        if reached_by_rule is not None and reached_by_rule[word] & named_lemmas(word, refs, defined):
            counts['ruleReached'] += 1
            tokens['ruleReached'] += count
            if first is not None and verdict(word, first, refs, defined) == 'wrong':
                counts['ruleReachedWrong'] += 1
                tokens['ruleReachedWrong'] += count
        if first is None:
            kind = 'empty'
            empty_list.append((count, word, sorted(right)[:3]))
        else:
            kind = verdict(word, first, refs, defined)
            if kind == 'unjudged':
                kind = 'right' if first['expression'] == word else 'wrong'
            if word in ELIDED_BARE and first['expression'] == word:
                kind = 'wrong'
            if kind == 'wrong':
                wrong_list.append((count, word, first['expression'], '/'.join(first['trace']), sorted(right)[:3]))
        counts[kind] += 1
        tokens[kind] += count
    print(json.dumps({'words': len(words), **counts, 'ruleReachedTokenShare': tokens['ruleReached'] / total,
                      'ruleReachedWrongTokenShare': tokens['ruleReachedWrong'] / total, 'reachedTokenShare': tokens['reached'] / total,
                      'wrongTokenShare': tokens['wrong'] / total, 'emptyTokenShare': tokens['empty'] / total}, ensure_ascii=False))
    print('--- wrong first card (count, word, first, trace, right lemmas)')
    for item in sorted(wrong_list, reverse=True):
        print('\t'.join(str(x) for x in item))
    print('--- no card with a definition')
    for item in sorted(empty_list, reverse=True)[:40]:
        print('\t'.join(str(x) for x in item))


def top(freq_file, banks, lookups, n):
    # The first n words of the frequency list, every one of them (frequent
    # counts only those with a form-of row): right or wrong as judge says, no
    # card, or unjudged (another headword than the word, which the dictionary
    # does not name as its lemma: listed to be judged by hand). lookups are
    # those of the whole list.
    defined, refs = load_dictionary(banks)
    words = [line.split()[0] for line in open(freq_file, encoding='utf-8')][:n]
    results = [json.loads(line) for line in open(lookups, encoding='utf-8')][:n]
    counts = collections.Counter()
    listed = collections.defaultdict(list)
    for word, answer in zip(words, results):
        first = first_defined(answer['results'])
        if first is None:
            kind = 'empty'
        else:
            kind = verdict(word, first, refs, defined)
            if kind == 'unjudged' and first['expression'] == word:
                kind = 'right'
            if word in ELIDED_BARE and first['expression'] == word:
                kind = 'wrong'
        counts[kind] += 1
        if kind != 'right':
            listed[kind + 'Words'].append(word if first is None else f"{word} → {first['expression']}")
    print(json.dumps({'words': len(words), **counts, **listed}, ensure_ascii=False))


def ties(banks, hovers_file, lookups):
    # First cards that are a verb the rules reach, over the whole word, with a
    # noun of the same matched text after them (part of speech: the first
    # definition tag of the headword's rows with definitions).
    defined, refs = load_dictionary(banks)
    pos = collections.defaultdict(set)
    for path in sorted(glob.glob(os.path.join(banks, 'term_bank_*.json'))):
        for row in json.load(open(path, encoding='utf-8')):
            if any(not is_ref(d) for d in row[5]):
                pos[row[0]].add((row[2].split() or [''])[0])
    pairs = collections.Counter()
    for text, line in zip(open(hovers_file, encoding='utf-8'), open(lookups, encoding='utf-8')):
        m = WORD.match(text.rstrip('\n'))
        found = [r for r in json.loads(line)['results'] if not r['formOf']]
        if m is None or len(found) < 2:
            continue
        first = found[0]
        if 'v' not in pos.get(first['expression'], set()) or not first['trace'] or first['matched'].lower() != m.group(0).lower():
            continue
        nouns = [r for r in found[1:] if 'n' in pos.get(r['expression'], set()) and r['matched'] == first['matched']]
        if nouns:
            pairs[(m.group(0).lower(), first['expression'], nouns[0]['expression'])] += 1
    print(json.dumps({'verbFirstNounAfter': sum(pairs.values())}))
    for (word, verb, noun), count in pairs.most_common(20):
        print(f'{count}\t{word}\t{verb}\t{noun}')


def hovers(text_file, sentences_tsv=False):
    if sentences_tsv:
        opener = bz2.open if text_file.endswith('.bz2') else open
        texts = [line.rstrip('\n').split('\t')[2] for line in opener(text_file, 'rt', encoding='utf-8')]
    else:
        raw = open(text_file, encoding='utf-8').read()
        start = raw.find('*** START OF')
        end = raw.find('*** END OF')
        raw = raw[raw.find('\n', start) + 1 if start >= 0 else 0: end if end >= 0 else len(raw)]
        texts = [re.sub(r'\s+', ' ', p) for p in re.split(r'\n\s*\n', raw)]
    for text in texts:
        for m in WORD.finditer(text):
            rest = text[m.start():]
            stop = TERMINATORS.search(rest)
            print(rest[:stop.start() if stop else len(rest)].strip())


def judge(banks, hover_file, lookups, sample=60):
    defined, refs = load_dictionary(banks)
    hover_lines = [line.rstrip('\n') for line in open(hover_file, encoding='utf-8')]
    results = [json.loads(line) for line in open(lookups, encoding='utf-8')]
    assert len(results) == len(hover_lines)
    counts = collections.Counter()
    wrong = collections.Counter()
    wrong_examples = collections.defaultdict(list)
    unjudged = []
    for text, answer in zip(hover_lines, results):
        word = WORD.match(text).group(0)
        first = first_defined(answer['results'])
        if first is None:
            counts['nothing'] += 1
            continue
        matched_word = first['matched'] == word or first['matched'].lower() == word.lower()
        if not matched_word:
            counts['longer match'] += 1
            continue
        kind = verdict(word, first, refs, defined)
        counts[kind] += 1
        if kind == 'unjudged':
            unjudged.append((text[:40], first['expression'], first['matched'], '/'.join(first['trace'])))
        elif kind == 'wrong':
            key = (word.lower(), first['expression'])
            wrong[key] += 1
            wrong_examples[key].append('/'.join(first['trace']))
    judged = counts['right'] + counts['wrong']
    print(json.dumps({'lookups': len(hover_lines), **counts, 'wrongRateOfJudged': counts['wrong'] / judged if judged else None}, ensure_ascii=False))
    for (w, e), n in wrong.most_common(40):
        print(f'{n}\t{w}\t{e}\t{collections.Counter(wrong_examples[(w, e)]).most_common(1)[0][0]}')
    random.seed(1)
    print('--- unjudged sample')
    for item in random.sample(unjudged, min(sample, len(unjudged))):
        print('\t'.join(item))


FUNCTION = ('θα να ας δεν μην μη ο η το οι τα τον την τη του της των τους τις ένας μια μία ένα ενός μιας '
            'μου σου μας σας τον τη την το τους τις τα του της με σε στο στη στην στον στα στους στις '
            'έχω έχεις έχει έχουμε έχετε έχουν είχα είχες είχε είχαμε είχατε είχαν').split()


def phrases(banks, hover_file, lookups):
    defined, refs = load_dictionary(banks)
    hover_lines = [line.rstrip('\n') for line in open(hover_file, encoding='utf-8')]
    results = [json.loads(line) for line in open(lookups, encoding='utf-8')]
    at = collections.Counter()
    longer = collections.Counter()
    after = collections.defaultdict(collections.Counter)
    wrong_after = collections.Counter()
    for i, (text, answer) in enumerate(zip(hover_lines, results)):
        words = text.split(' ')
        first = first_defined(answer['results'])
        w0 = words[0].lower().rstrip("'’,.")
        if w0 in FUNCTION:
            at[w0] += 1
            if first and len(first['matched']) > len(words[0]):
                longer[(w0, first['matched'], first['expression'], '/'.join(first['trace']))] += 1
        prev = hover_lines[i - 1] if i > 0 else ''
        if prev.endswith(text) and prev != text:
            p0 = prev.split(' ')[0].lower()
            if p0 in FUNCTION:
                word = WORD.match(text).group(0)
                if first is None:
                    kind = 'nothing'
                elif first['matched'].lower() != word.lower():
                    kind = 'longer match'
                else:
                    kind = verdict(word, first, refs, defined)
                    if kind == 'wrong':
                        wrong_after[(p0, word.lower(), first['expression'], '/'.join(first['trace']))] += 1
                after[p0][kind] += 1
    total_after = collections.Counter()
    for c in after.values():
        total_after.update(c)
    print(json.dumps({'atFunctionWord': sum(at.values()), 'readPastIt': sum(longer.values()), 'afterFunctionWord': dict(total_after)}, ensure_ascii=False))
    print('--- read past the function word (count, word, matched, first, trace)')
    for (w, m, e, t), n in longer.most_common(30):
        print(f'{n}\t{w}\t{m}\t{e}\t{t}')
    print('--- after each function word: right / wrong / unjudged / nothing / longer match')
    for w in sorted(after, key=lambda w: -sum(after[w].values()))[:40]:
        c = after[w]
        print(f"{w}\t{c['right']}\t{c['wrong']}\t{c['unjudged']}\t{c['nothing']}\t{c['longer match']}")
    print('--- wrong after a function word')
    for (p0, w, e, t), n in wrong_after.most_common(30):
        print(f'{n}\t{p0} {w}\t{e}\t{t}')


def falsecands(banks, corpus, cli, languages, tagged=False):
    import subprocess
    # With lookup.untaggedTerms "pass" an untagged row carries every
    # dictionary-form condition (v, n, adj), as --tagged reads it.
    pack = json.load(open(f'{languages}/el/language.json', encoding='utf-8'))
    tagged = tagged or pack['lookup'].get('untaggedTerms') == 'pass'
    rows_of = collections.defaultdict(list)  # term -> [(tags, has definitions, referenced terms)]
    for f in sorted(glob.glob(banks.rstrip('/') + '/term_bank_*.json')):
        for row in json.load(open(f, encoding='utf-8')):
            tags = row[3] if row[3] or not tagged else 'v n adj'
            rows_of[row[0]].append((set(tags.split()), any(not is_ref(d) for d in row[5]), [d[0] for d in row[5] if is_ref(d)]))
    bits = {'v', 'n', 'adj'}
    passes = lambda tags, conditions: not conditions or bool(tags & bits & set(conditions))
    rows = [l.rstrip('\n').split('\t') for l in open(corpus, encoding='utf-8') if l.strip() and not l.startswith('#')]
    rows = [r for r in rows if r[1] == '1']
    run = lambda cmd, inputs: [json.loads(l) for l in subprocess.run([cli, '--languages', languages] + cmd, input='\n'.join(inputs) + '\n',
                                                                      capture_output=True, text=True, check=True).stdout.splitlines()]
    pre = {d['input']: [v['text'] for v in d['variants']] for d in run(['preprocess', 'el', '--stdin', '--all-options'], sorted({r[2] for r in rows}))}
    texts = sorted({t for v in pre.values() for t in v})
    de = {d['input']: d['results'] for d in run(['deinflect', 'el', '--stdin', '--all-options'], texts)}
    total = 0
    listed = []
    for _, _, source, term, _, _ in rows:
        found = set()
        for text in pre[source]:
            for r in de[text]:
                for tags, defined, refs in rows_of.get(r['text'], []):
                    if not passes(tags, r['conditions']):
                        continue
                    if defined:
                        found.add(r['text'])
                    for ref in refs:
                        if any(d for _, d, _ in rows_of.get(ref, [])):
                            found.add(ref)
        found -= {source, term}
        total += len(found)
        if found:
            listed.append((source, term, sorted(found)))
    def plain(w):
        return ''.join(c for c in unicodedata.normalize('NFD', w) if unicodedata.category(c) != 'Mn')
    def stem(w):
        p = plain(w)
        for e in ('ιεμαι', 'ουμαι', 'ωμαι', 'αμαι', 'ομαι', 'αω', 'ω'):
            if p.endswith(e):
                return p[:-len(e)]
        return None
    refs = {t: {x for _, _, rs in v for x in rs} for t, v in rows_of.items()}
    kinds = collections.Counter()
    for source, term, found in listed:
        for f in found:
            if stem(f) is not None and stem(f) == stem(term):
                kinds['the same verb in the other voice or conjugation'] += 1
            elif plain(f).lower() == plain(term).lower():
                kinds['the same word with another accent or a capital'] += 1
            elif term in refs.get(f, ()) or f in refs.get(term, ()):
                kinds['a variant the dictionary links to the lemma'] += 1
            elif refs.get(f):
                kinds['a form of another headword'] += 1
            else:
                kinds['another word'] += 1
    print(json.dumps({'rows': len(rows), 'falseCandidates': total / len(rows), 'rowsWithOne': len(listed), 'kinds': dict(kinds)}, ensure_ascii=False))
    for source, term, found in listed:
        print(f'{source}\t{term}\t{" ".join(found)}')


def firstrank(banks, corpus, lookups):
    defined, refs = load_dictionary(banks)
    rows = [l.rstrip('\n').split('\t') for l in open(corpus, encoding='utf-8') if l.strip() and not l.startswith('#')]
    answers = [json.loads(l) for l in open(lookups, encoding='utf-8')]
    kinds = collections.Counter()
    for (_, _, source, term, _, _), answer in zip(rows, answers):
        expressions = [r['expression'] for r in answer['results']]
        if expressions[:1] == [term]:
            kinds['first'] += 1
        elif term not in defined:
            kinds['the lemma has no row with definitions'] += 1
        elif not expressions:
            kinds['nothing'] += 1
        elif term not in expressions:
            kinds['not among the results'] += 1
        elif expressions[0] in refs.get(source, ()):
            kinds['after another lemma the source names'] += 1
        else:
            kinds['after another reading'] += 1
    print(json.dumps(dict(kinds), ensure_ascii=False))


def capitals(freq_file, banks, lower_lookups, upper_lookups):
    defined, refs = load_dictionary(banks)
    words = [line.split()[0] for line in open(freq_file, encoding='utf-8')][:10000]
    low = [json.loads(l) for l in open(lower_lookups, encoding='utf-8')]
    up = [json.loads(l) for l in open(upper_lookups, encoding='utf-8')]
    counts = collections.Counter()
    for word, a, b in zip(words, low, up):
        first = first_defined(a['results'])
        if first is None or verdict(word, first, refs, defined) != 'right':
            continue
        counts['words'] += 1
        upper = first_defined(b['results'])
        counts['nothing' if upper is None else verdict(word, upper, refs, defined)] += 1
    print(json.dumps(dict(counts), ensure_ascii=False))


def capital_words(freq_file):
    for line in open(freq_file, encoding='utf-8').readlines()[:10000]:
        word = unicodedata.normalize('NFD', line.split()[0].upper())
        print(unicodedata.normalize('NFC', ''.join(c for c in word if c != '\u0301')))


def capital_rows(freq_file, banks, lower_lookups, defaults):
    """A corpus file of the words whose lowercase first card is right, in capitals:
    eval-language's firstRank then gives the share read right in capitals."""
    defined, refs = load_dictionary(banks)
    words = [line.split()[0] for line in open(freq_file, encoding='utf-8')][:10000]
    low = [json.loads(l) for l in open(lower_lookups, encoding='utf-8')]
    if defaults:
        print('# options: default')
    print('# category\tvalid\tsource\tterm\trule\treasons')
    for word, a in zip(words, low):
        first = first_defined(a['results'])
        if first is not None and verdict(word, first, refs, defined) == 'right':
            upper = unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', word.upper()) if c != '\u0301'))
            print(f"capitals\t1\t{upper}\t{first['expression']}\t*\t*")


def yomitan_conditions(yomitan, own):
    data = json.load(open(yomitan, encoding='utf-8'))
    for key, condition in json.load(open(own, encoding='utf-8'))['conditions'].items():
        data['conditions'].setdefault(key, condition)
    print(json.dumps(data, ensure_ascii=False, indent=2))


def unimorph(file, cli, languages):
    dropped = set('θα να ας έχω έχεις έχει έχουμε έχετε έχουν είχα είχες είχε είχαμε είχατε είχαν'.split())
    word = re.compile(r'^[\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03CE]+$')
    pairs = []
    seen = set()
    for line in open(file, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) != 3 or not word.match(parts[0]):
            continue
        lemma, cell, tag = parts
        for part in cell.split(','):
            ws = [w for w in re.sub(r'[/\d]', ' ', part.replace('\u00a0', ' ')).split() if w not in dropped]
            if len(ws) == 1 and ws[0] != lemma and word.match(ws[0]) and (ws[0], lemma, tag[0]) not in seen:
                seen.add((ws[0], lemma, tag[0]))
                pairs.append((ws[0], lemma, tag.split(';')[0]))
    reached = deinflect_variants(cli, languages, sorted({f for f, _, _ in pairs}), ('--all-options',))
    by = collections.defaultdict(lambda: [0, 0])
    for form, lemma, pos in pairs:
        by[pos][0] += lemma in reached[form] or lemma == form
        by[pos][1] += 1
    total = sum(v[1] for v in by.values())
    print(json.dumps({'pairs': total, 'recall': sum(v[0] for v in by.values()) / total, **{k: v[0] / v[1] for k, v in by.items()}, 'counts': dict(by)}))


def tense_of(tags, passive):
    t = set(tags)
    if 'IMP' in t:
        return 'imperative'
    if 'PTCP' in t:
        return 'gerund'
    if 'IPFV' in t and 'PST' in t:
        return 'imperfect'
    if 'IPFV' in t:
        return 'present'
    if 'PFV' in t and 'PST' in t:
        return 'aorist'
    if 'PFV' in t:
        return 'dependent'
    return None


def traces(corpus, deinflections):
    rows = [l.rstrip('\n').split('\t') for l in open(corpus, encoding='utf-8') if l.strip() and not l.startswith('#')]
    results = {json.loads(l)['input']: json.loads(l)['results'] for l in open(deinflections, encoding='utf-8')}
    counts = collections.Counter()
    for tag, valid, source, term, rule, _ in rows:
        tags = tag.split(';')
        if tags[0] != 'V':
            continue
        reach = [r for r in results.get(source, []) if r['text'] == term and (not r['conditions'] or 'v' in r['conditions'])]
        if not reach:
            continue
        best = min(reach, key=lambda r: len(r['trace']))
        ids = [t for t in best['trace'] if t not in ('accent', 'internal-augment', 'old-augment', 'movable-n', 'ξανα-')]
        counts['reached'] += 1
        tense = tense_of(tags, False)
        first = ids[0] if ids else ''
        if tense and tense in first:
            counts['tense'] += 1
        person = next((f'{p}{n.lower()}' for p in '123' for n in ('SG', 'PL') if p in tags and n in tags), None)
        if person:
            counts['finite'] += 1
            if first.endswith(person):
                counts['person'] += 1
    print(json.dumps(counts))


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'frequent':
        opt = lambda name: sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
        frequent(*sys.argv[2:5], cli=opt('--cli'), languages=opt('--languages'))
    elif cmd == 'firstrank':
        firstrank(*sys.argv[2:5])
    elif cmd == 'capitals':
        capitals(*sys.argv[2:6])
    elif cmd == 'capital-rows':
        capital_rows(*sys.argv[2:5], defaults='--defaults' in sys.argv)
    elif cmd == 'capital-words':
        capital_words(sys.argv[2])
    elif cmd == 'yomitan-conditions':
        yomitan_conditions(*sys.argv[2:4])
    elif cmd == 'falsecands':
        falsecands(*sys.argv[2:6], tagged='--tagged' in sys.argv)
    elif cmd == 'top':
        top(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]))
    elif cmd == 'ties':
        ties(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == 'unimorph':
        unimorph(*sys.argv[2:5])
    elif cmd == 'hovers':
        hovers(sys.argv[2], '--sentences' in sys.argv)
    elif cmd == 'traces':
        traces(sys.argv[2], sys.argv[3])
    elif cmd == 'phrases':
        phrases(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == 'judge':
        n = int(sys.argv[sys.argv.index('--sample') + 1]) if '--sample' in sys.argv else 60
        judge(sys.argv[2], sys.argv[3], sys.argv[4], n)
