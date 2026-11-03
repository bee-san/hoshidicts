#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The measurements of README.md that need data this repository does not hold.

    python3 languages/sh/sources/measure.py <command> --zip wty-sh-en.zip --dictionary <imported dir> [options]

--zip is the published dictionary (read for its headwords and form-of rows),
--dictionary the same dictionary imported by `hoshidicts-cli import` (or the
labelled copy of sources/tag-all-rows.py imported). Lookups run through
build/lookup-batch (languages/en/sources/lookup-batch.cpp built as its header
says): Lookup::lookup with no language options, 16 results, scan length 16,
as a host's hover does.

A text's gold lemmas are the lemmas the form-of rows of the text name, and
of its lower-case, capitalised, Latin (for Cyrillic) and accent-stripped
spellings; a text that is itself a headword with definitions names itself.
wty-sh-en writes many references with accent marks (davati → dȁti) and to
lemmas that are themselves only references (daje → davati → dȁti), so a
gold lemma is also the accent-stripped spelling and what up to two more
references of a reference-only lemma name.
A first result is right when its expression is a gold lemma of the matched
text (a lookup's first result may match several words, such as the
dictionary's `vidio sam`).

Commands:

  frequent  The --top most frequent words of --frequency (FrequencyWords
            lines "word count"). A rule reaches a word when a gold lemma of
            it is among its deinflections with at least one rule, after the
            pack's processors. For those words: how many show a wrong first
            result, and their share of the list's tokens; the wrong ones are
            listed with the rule of the first result (--show).
  text      Every word of a plain-text file (--text), looked up with the text
            from the word to the end of its sentence. First results whose
            matched text has gold lemmas are judged by script; a random
            sample (--sample, seed 1) of the others is written to --out for
            judging by hand. Groups the wrong ones by the transforms of their
            trace.
  clitics   Tatoeba sentences (--tatoeba, one or more of srp/hrv/bos
            *_sentences.tsv.bz2): every place where a clitic, auxiliary or
            short pronoun is followed by a word, looked up from the clitic,
            and every word followed by one, looked up from the word. Counts
            first results that match more than one word and are not a gold
            lemma of the matched text, by rule.
  nothing   The --top most frequent words of --frequency looked up alone: how
            many find nothing, and their share of the list's tokens.
  traces    tests/corpus.tsv: each source looked up alone; the share of rows
            whose shown trace (of the result with the row's lemma) names the
            row's UniMorph case and number, or tense and person.
  ties      Ties of the frequent words (--frequency) or of a text (--text):
            first results a rule made while another lemma the matched text's
            form-of rows name comes later, judged by lemma frequency
            (--lemma-lists, see LemmaFrequency).
  tiesample A seeded sample of a text's ties, for judging in context (--out).
  nogold    Frequent words whose rule-made first result has no form-of row or
            entry to judge it by, with a seeded sample to judge (--out).
  compare   The pack against another version of it (--other) on the
            frequent words: words only one finds, first results that differ.

--languages loads the packs of another directory (another version of the
pack, for comparisons). --cli and --batch are build/hoshidicts-cli and
build/lookup-batch.
"""
import argparse, bz2, collections, json, os, random, re, subprocess, sys, unicodedata, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PACK))

CYR = dict(zip('АБВГДЂЕЖЗИЈКЛМНОПРСТЋУФХЦЧШабвгдђежзијклмнопрстћуфхцчш',
               'ABVGDĐEŽZIJKLMNOPRSTĆUFHCČŠabvgdđežzijklmnoprstćufhcčš'))
CYR.update({'Љ': 'Lj', 'Њ': 'Nj', 'Џ': 'Dž', 'љ': 'lj', 'њ': 'nj', 'џ': 'dž'})


def to_latin(text):
    return unicodedata.normalize('NFC', ''.join(CYR.get(c, c) for c in unicodedata.normalize('NFD', text)))


def strip_accents(text):
    """Yomitan's removeSerboCroatianAccentMarks: one mark after a vowel or r."""
    return unicodedata.normalize('NFC', re.sub(r'([aeiourAEIOURаеиоуАЕИОУрР])[\u0300-\u036F]', r'\1', unicodedata.normalize('NFD', text)))


def spellings(text):
    out = {text}
    for t in list(out):
        out |= {t.lower(), t[:1].upper() + t[1:], to_latin(t), to_latin(t).lower(), strip_accents(t), strip_accents(t).lower()}
    return out


class Dictionary:
    def __init__(self, zip_path):
        self.lemmas = set()
        self.gold = collections.defaultdict(set)
        with zipfile.ZipFile(zip_path) as z:
            for name in sorted(n for n in z.namelist() if re.fullmatch(r'term_bank_\d+\.json', n)):
                for row in json.loads(z.read(name)):
                    refs = [d for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0]]
                    if refs:
                        self.gold[row[0]].update(r[0] for r in refs)
                    if len(refs) < len(row[5]):
                        self.lemmas.add(row[0])

    def gold_of(self, text):
        out = set()
        for t in spellings(text):
            out |= self.gold.get(t, set())
            if t in self.lemmas:
                out.add(t)
        out |= {strip_accents(g) for g in out}
        # A lemma that is itself only references (an aspect partner such as
        # davati, a spelling such as dvije) names the lemma it points to:
        # follow up to two more references.
        for _ in range(2):
            more = set()
            for g in out:
                if g not in self.lemmas:
                    more |= self.gold.get(g, set())
            more |= {strip_accents(g) for g in more}
            if more <= out:
                break
            out |= more
        return out

    def right(self, expression, matched):
        return expression in self.gold_of(matched) or strip_accents(expression) in self.gold_of(matched)


class LemmaFrequency:
    """How often each lemma's forms occur in frequency lists: a form's count
    is shared among the lemmas its gold names. A tie between two lemmas the
    matched text's gold both names is judged by it: the first result is
    wrong when another such lemma occurs at least RATIO times as often, right
    when it occurs at least RATIO times as often as every other, and
    undecided otherwise."""
    RATIO = 3

    def __init__(self, d, paths):
        self.count = collections.Counter()
        for path in paths:
            with open(path, encoding='utf-8') as f:
                for line in f:
                    word, n = line.split()
                    gold = d.gold_of(word)
                    for lemma in gold:
                        self.count[lemma] += int(n) / len(gold)

    def judge(self, first, others):
        """'right', 'wrong' or 'undecided' for the first lemma against the others."""
        a = self.count[first]
        best = max(others, key=lambda o: self.count[o])
        if self.count[best] >= self.RATIO * max(a, 1):
            return 'wrong', best
        if all(a >= self.RATIO * max(self.count[o], 1) for o in others):
            return 'right', first
        return 'undecided', best


def ties(d, entry):
    """For a lookup whose first result a pack rule made: the other lemmas the
    matched text's gold names, among the results for the same matched text."""
    results = entry['results']
    if not results or not by_rule(results[0]):
        return None
    first = results[0]
    if not d.right(first['expression'], first['matched']):
        return None
    others = sorted({r['expression'] for r in results[1:] if r['matched'] == first['matched']
                     and r['expression'] != first['expression'] and d.right(r['expression'], r['matched'])})
    return others or None


def lookup_batch(args, texts):
    batch = args.batch or os.path.join(REPO, 'build', 'lookup-batch')
    result = subprocess.run([batch, args.languages, 'sh', args.dictionary], input='\n'.join(texts) + '\n',
                            capture_output=True, text=True, check=True)
    return [json.loads(line) for line in result.stdout.splitlines()]


def cli(args, command, texts, *extra):
    binary = args.cli or os.path.join(REPO, 'build', 'hoshidicts-cli')
    result = subprocess.run([binary, '--languages', args.languages, command, 'sh', '--stdin', *extra],
                            input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True)
    return [json.loads(line) for line in result.stdout.splitlines()]


def deinflections(args, words):
    """For each word: (text, conditions, trace) of every deinflection of every processor variant."""
    variants = cli(args, 'preprocess', words, '--all-options')
    every = sorted({v['text'] for d in variants for v in d['variants']})
    by_text = {d['input']: d['results'] for d in cli(args, 'deinflect', every, '--all-options')}
    return [[(r['text'], r['conditions'], r['trace']) for v in d['variants'] for r in by_text.get(v['text'], [])] for d in variants]


def frequent(path, n):
    words = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            word, count = line.split()
            words.append((word, int(count)))
            if len(words) >= n:
                break
    return words


PACK_IDS = set()


def rule_of(result):
    """The pack transform that first changed the matched text. A lookup's
    trace is in application order (docs/languages.md 7.4); a step that is not
    a pack transform is a form-of reference of the dictionary (9.10)."""
    for step in result['trace']:
        if step in PACK_IDS:
            return step
    return '(form-of reference)' if result['trace'] else '(as written)'


def by_rule(result):
    """Whether a pack rule made the result (its first step is a pack transform)."""
    return bool(result['trace']) and result['trace'][0] in PACK_IDS


def cmd_judged(args, d):
    """First results for hand-judged words (sources/judged-ties-hr.tsv: word, the lemmas of its
    dominant reading separated by |, its count): wrong when the first result is none of them."""
    rows = [line.rstrip('\n').split('\t') for line in open(args.judged, encoding='utf-8') if line.strip() and not line.startswith('#')]
    total = sum(c for _, c in frequent(args.frequency, args.top))
    wrong = []
    for (word, lemmas, count), result in zip(rows, lookup_batch(args, [r[0] for r in rows])):
        first = result['results'][0] if result['results'] else None
        if first is None or first['expression'] not in lemmas.split('|'):
            wrong.append((int(count), word, first['expression'] if first else '(nothing)', lemmas))
    tokens = sum(w[0] for w in wrong)
    print(json.dumps({'judged': len(rows), 'wrongFirst': len(wrong), 'wrongTokens': tokens, 'shareOfListTokens': round(tokens / total, 5)}))
    print('wrong: ' + ' '.join(f'{w}→{f} (not {l}, {c})' for c, w, f, l in sorted(wrong, reverse=True)[:args.show]))


def cmd_frequent(args, d):
    words = frequent(args.frequency, args.top)
    total = sum(c for _, c in words)
    reached = []
    for (word, count), results in zip(words, deinflections(args, [w for w, _ in words])):
        gold = d.gold_of(word) - {word}
        if any(text in gold and trace for text, _, trace in results):
            reached.append((word, count))
    looked = lookup_batch(args, [w for w, _ in reached])
    wrong, above = [], 0
    for (word, count), entry in zip(reached, looked):
        results = entry['results']
        if not results:
            wrong.append((count, word, '(nothing)', '', ''))
            continue
        first = results[0]
        if not d.right(first['expression'], first['matched']):
            wrong.append((count, word, first['expression'], first['matched'], rule_of(first)))
        rank = next((i for i, r in enumerate(results) if d.right(r['expression'], r['matched'])), None)
        if rank is not None and rank > 0 and not d.right(results[0]['expression'], results[0]['matched']):
            above += 1
    wrong.sort(reverse=True)
    reached_tokens = sum(c for _, c in reached)
    wrong_tokens = sum(w[0] for w in wrong)
    print(json.dumps({'words': len(words), 'tokens': total, 'reached': len(reached), 'reachedTokens': reached_tokens,
                      'wrongFirst': len(wrong), 'wrongFirstTokens': wrong_tokens,
                      'wrongFirstShareOfListTokens': round(wrong_tokens / total, 5), 'wrongAboveRight': above}))
    by_rule = collections.Counter(w[4] for w in wrong)
    print('rules of the wrong first results:', by_rule.most_common(15))
    for count, word, expression, matched, rule in wrong[:args.show]:
        print(f'  {count:>9}  {word} -> {expression} ({matched}; {rule})')


SENTENCE_END = re.compile(r'[.!?…]+')
WORD = re.compile(r"[A-Za-zÀ-ÖØ-öø-ɏЀ-ӿ\u0300-\u036F]+(?:['’][A-Za-zÀ-ÖØ-öø-ɏЀ-ӿ]+)*")


def hovers(text):
    """(word, text from the word to the end of its sentence) for every word."""
    for paragraph in re.split(r'\n\s*\n', text):
        paragraph = ' '.join(paragraph.split())
        for sentence in re.split(r'(?<=[.!?…])\s+', paragraph):
            for m in WORD.finditer(sentence):
                rest = sentence[m.start():]
                end = SENTENCE_END.search(rest)
                yield m.group(0), rest[:end.end()] if end else rest


def judge(d, entry, word):
    """right, wrong or unjudged (no gold lemma for the matched text), and the first result."""
    if not entry['results']:
        return 'nothing', None
    first = entry['results'][0]
    gold = d.gold_of(first['matched'])
    if not gold:
        return 'unjudged', first
    return ('right' if d.right(first['expression'], first['matched']) else 'wrong'), first


def cmd_text(args, d):
    with open(args.text, encoding='utf-8') as f:
        pairs = list(hovers(f.read()))
    looked = lookup_batch(args, [rest for _, rest in pairs])
    counts = collections.Counter()
    wrong = collections.Counter()
    by_rule = collections.Counter()
    unjudged = []
    for (word, rest), entry in zip(pairs, looked):
        verdict, first = judge(d, entry, word)
        counts[verdict] += 1
        if verdict == 'wrong':
            wrong[(first['matched'], first['expression'], rule_of(first))] += 1
            by_rule[rule_of(first)] += 1
        elif verdict == 'unjudged':
            unjudged.append((word, rest, first))
    print(json.dumps({'lookups': len(pairs), **counts, 'wrongRate': round(counts['wrong'] / max(1, len(pairs)), 5)}))
    print('rules of the wrong first results:', by_rule.most_common(12))
    for (matched, expression, rule), n in wrong.most_common(args.show):
        print(f'  {n:>5}  {matched} -> {expression} ({rule})')
    unjudged_by_rule = collections.Counter(rule_of(f) for _, _, f in unjudged)
    print('unjudged first results by rule:', unjudged_by_rule.most_common(10))
    if args.out:
        rng = random.Random(1)
        sample = rng.sample(unjudged, min(args.sample, len(unjudged)))
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write('# word\ttext\tmatched\texpression\ttrace\tjudgement (fill in: right, wrong)\n')
            for word, rest, first in sample:
                f.write(f"{word}\t{rest[:60]}\t{first['matched']}\t{first['expression']}\t{'|'.join(first['trace'])}\t\n")
        print(f'{len(sample)} unjudged first results sampled to {args.out}')


CLITICS = ('se', 'si', 'je', 'sam', 'smo', 'ste', 'su', 'ću', 'ćeš', 'će', 'ćemo', 'ćete', 'bih', 'bi', 'bismo', 'biste',
           'mi', 'ti', 'mu', 'joj', 'nam', 'vam', 'im', 'me', 'te', 'ga', 'ju', 'nas', 'vas', 'ih', 'li', 'ne', 'ni', 'da',
           'ja', 'on', 'ona', 'ono', 'oni', 'one', 'vi')


def tatoeba(paths):
    for path in paths:
        with bz2.open(path, 'rt', encoding='utf-8') as f:
            for line in f:
                parts = line.rstrip('\n').split('\t')
                if len(parts) >= 3:
                    yield parts[2]


def cmd_clitics(args, d):
    places = []
    for sentence in tatoeba(args.tatoeba):
        words = list(WORD.finditer(sentence))
        for i, m in enumerate(words[:-1]):
            clitic = to_latin(m.group(0)).lower()
            following = to_latin(words[i + 1].group(0)).lower()
            # From the clitic (se vratio, je li), and from the word before a
            # clitic (vidio sam, radit ću, kući ću), where a phrase rule or a
            # multi-word row may match more than the word.
            for start, kind in ((m, clitic if clitic in CLITICS else None), (m, f'_ {following}' if following in CLITICS else None)):
                if kind is None:
                    continue
                rest = sentence[start.start():]
                end = SENTENCE_END.search(rest)
                places.append((kind, rest[:end.end()] if end else rest))
    looked = lookup_batch(args, [rest for _, rest in places])
    counts = collections.Counter()
    longer = collections.Counter()
    by_clitic = collections.Counter()
    alone = collections.Counter()
    for (clitic, rest), entry in zip(places, looked):
        if not entry['results']:
            counts['nothing'] += 1
            continue
        first = entry['results'][0]
        multi = ' ' in first['matched']
        if not multi:
            if d.right(first['expression'], first['matched']):
                counts['the word alone, right'] += 1
            elif d.gold_of(first['matched']):
                counts['the word alone, wrong'] += 1
                alone[(first['matched'], first['expression'], rule_of(first))] += 1
            else:
                counts['the word alone, unjudged'] += 1
        elif d.right(first['expression'], first['matched']):
            counts['a longer text, its gold lemma'] += 1
        elif d.gold_of(first['matched']):
            counts['a longer text, wrong'] += 1
            longer[(first['matched'], first['expression'], rule_of(first))] += 1
            by_clitic[clitic] += 1
        else:
            counts['a longer text, unjudged'] += 1
            longer[(first['matched'], first['expression'], rule_of(first))] += 1
            by_clitic[clitic] += 1
    print(json.dumps({'places': len(places), **counts}))
    print('places (clitic, or _ before a clitic) of a longer first result that is not a gold lemma:', by_clitic.most_common(12))
    for (matched, expression, rule), n in longer.most_common(args.show):
        print(f'  {n:>5}  {matched} -> {expression} ({rule})')
    print('the word alone, wrong (the most frequent):')
    for (matched, expression, rule), n in alone.most_common(args.show):
        print(f'  {n:>5}  {matched} -> {expression} ({rule})')


def cmd_ties(args, d):
    """Ties of the frequent words (--frequency, --top) or of a text (--text):
    first results a pack rule made while another lemma the matched text's
    gold names comes later. Judged with the lemma frequency of --lemma-lists
    (default: --frequency)."""
    lf = LemmaFrequency(d, args.lemma_lists or [args.frequency])
    if args.text:
        with open(args.text, encoding='utf-8') as f:
            items = [(w, rest, 1) for w, rest in hovers(f.read())]
        total = len(items)
    else:
        words = frequent(args.frequency, args.top)
        items = [(w, w, c) for w, c in words]
        total = sum(c for _, c in words)
    looked = lookup_batch(args, [rest for _, rest, _ in items])
    verdicts = collections.Counter()
    weight = collections.Counter()
    wrong = collections.Counter()
    by_pair = collections.Counter()
    for (word, rest, count), entry in zip(items, looked):
        others = ties(d, entry)
        if others is None:
            continue
        first = entry['results'][0]
        verdict, best = lf.judge(first['expression'], others)
        verdicts[verdict] += 1
        weight[verdict] += count
        if verdict == 'wrong':
            wrong[(first['matched'].lower(), first['expression'], best, rule_of(first))] += count
            rival = next(r for r in entry['results'] if r['expression'] == best)
            by_pair[(rule_of(first), rule_of(rival))] += count
    print(json.dumps({'items': len(items), 'ties': sum(verdicts.values()), **{k: verdicts[k] for k in ('right', 'wrong', 'undecided')},
                      'wrongWeight': weight['wrong'], 'wrongShare': round(weight['wrong'] / max(1, total), 5)}))
    print('wrong ties by (first result\'s rule, the better lemma\'s rule):', by_pair.most_common(12))
    for (matched, expression, best, rule), n in wrong.most_common(args.show):
        print(f'  {n:>9}  {matched} -> {expression} ({rule}) before {best}')


def cmd_nothing(args, d):
    words = frequent(args.frequency, args.top)
    total = sum(c for _, c in words)
    looked = lookup_batch(args, [w for w, _ in words])
    none = sorted(((c, w) for (w, c), entry in zip(words, looked) if not entry['results']), reverse=True)
    print(json.dumps({'words': len(words), 'nothing': len(none), 'nothingTokens': sum(c for c, _ in none),
                      'shareOfTokens': round(sum(c for c, _ in none) / total, 5)}))
    print('most frequent:', ' '.join(w for _, w in none[:args.show]))


CASES = {'NOM': 'nom.', 'GEN': 'gen.', 'DAT': 'dat.', 'ACC': 'acc.', 'VOC': 'voc.', 'ESS': 'loc.', 'INS': 'ins.'}


def names(tags, name):
    t = tags.split(';')
    name = name.lower()
    if t[0] in ('N', 'ADJ'):
        case = next((CASES[x] for x in t if x in CASES), None)
        number = 'pl.' if 'PL' in t else 'sg.'
        if 'CMPR' in t or 'SPRL' in t:
            return ('comparative' in name or 'superlative' in name)
        return case is not None and any(case in part and number in part for part in re.split(r', ', name)) or (case is None)
    if t[0] == 'V' and 'PRS' in t:
        person = next(x for x in t if x in ('1', '2', '3')) + ('sg' if 'SG' in t else 'pl')
        return f'present {person}' in name or (person == '3pl' and 'present 3pl' in name)
    if t[0] == 'V' and 'IMP' in t:
        return 'imperative' in name
    if t[0] == 'V' and ('PROG' in t or 'LGSPEC2' in t):
        return 'imperfect' in name
    if t[0] == 'V' and 'FUT' in t:
        return 'future' in name
    if t[0] == 'V.PTCP':
        return ('passive' in name) if 'PASS' in t else ('l-participle' in name)
    return False


def cmd_traces(args, d):
    """What a lookup shows: each corpus source looked up alone; the trace of
    the result whose expression is the row's lemma, its first pack transform
    named against the row's UniMorph features."""
    with open(os.path.join(args.languages, 'sh', 'transforms.json'), encoding='utf-8') as f:
        transform_names = {t['id']: t['name'] for t in json.load(f)['transforms']}
    rows = [line.rstrip('\n').split('\t') for line in open(os.path.join(args.languages, 'sh', 'tests', 'corpus.tsv'), encoding='utf-8')
            if not line.startswith('#')]
    rows = [r for r in rows if ' ' not in r[2]]
    looked = lookup_batch(args, [r[2] for r in rows])
    kinds = collections.Counter()
    good = collections.Counter()
    misses = collections.defaultdict(list)
    for row, entry in zip(rows, looked):
        tags, source, lemma = row[0], row[2], row[3]
        shown = next((r for r in entry['results'] if r['expression'] == lemma and r['matched'] == source), None)
        if shown is None or not by_rule(shown):
            continue
        kind = tags.split(';')[0] + (';' + tags.split(';')[1] if tags.startswith('V;') else '')
        kinds[kind] += 1
        name = transform_names.get(rule_of(shown), '')
        if names(tags, name):
            good[kind] += 1
        else:
            misses[kind].append((source, lemma, name))
    total = sum(kinds.values())
    print(json.dumps({'rows': total, 'named': sum(good.values()), 'share': round(sum(good.values()) / max(1, total), 4),
                      'byKind': {k: f'{good[k]}/{n}' for k, n in sorted(kinds.items())}}, ensure_ascii=False))
    for kind, items in misses.items():
        print(kind, items[:args.show])


def cmd_compare(args, d):
    """The pack (--languages) against another version of it (--other) on the
    --top words of --frequency, looked up alone: words only one of them finds
    something for, and words whose first results differ."""
    words = frequent(args.frequency, args.top)
    total = sum(c for _, c in words)
    a = lookup_batch(args, [w for w, _ in words])
    other = argparse.Namespace(**{**vars(args), 'languages': args.other})
    b = lookup_batch(other, [w for w, _ in words])
    only_a, only_b, differ = [], [], []
    for (word, count), x, y in zip(words, a, b):
        fx = x['results'][0]['expression'] if x['results'] else None
        fy = y['results'][0]['expression'] if y['results'] else None
        if fx and not fy:
            only_a.append((count, word, fx))
        elif fy and not fx:
            only_b.append((count, word, fy))
        elif fx != fy:
            differ.append((count, word, fx, fy))
    share = lambda xs: round(sum(x[0] for x in xs) / total, 5)
    print(json.dumps({'words': len(words), 'onlyThis': len(only_a), 'onlyThisShare': share(only_a), 'onlyOther': len(only_b),
                      'onlyOtherShare': share(only_b), 'firstDiffers': len(differ), 'firstDiffersShare': share(differ)}))
    for label, xs in (('only this', only_a), ('only the other', only_b), ('first differs', differ)):
        print(f'{label}:', ' '.join(f'{x[1]}→{"/".join(x[2:])}' for x in sorted(xs, reverse=True)[:args.show]))


def cmd_nogold(args, d):
    """The --top words of --frequency whose first result a pack rule made and
    whose matched text has no form-of row or entry, so that `frequent` cannot
    judge it; a random sample (--sample, seed 1) is written to --out for
    judging by hand."""
    words = frequent(args.frequency, args.top)
    total = sum(c for _, c in words)
    looked = lookup_batch(args, [w for w, _ in words])
    found = []
    for (word, count), entry in zip(words, looked):
        if not entry['results']:
            continue
        first = entry['results'][0]
        if by_rule(first) and not d.gold_of(first['matched']):
            found.append((word, count, first))
    print(json.dumps({'words': len(words), 'noGold': len(found), 'noGoldShare': round(sum(c for _, c, _ in found) / total, 5)}))
    if args.out:
        rng = random.Random(1)
        sample = rng.sample(found, min(args.sample, len(found)))
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write('# word\tcount\tmatched\texpression\ttrace\tjudgement (fill in: right, wrong)\n')
            for word, count, first in sorted(sample, key=lambda x: -x[1]):
                f.write(f"{word}\t{count}\t{first['matched']}\t{first['expression']}\t{'|'.join(first['trace'])}\t\n")
        print(f'{len(sample)} of them sampled to {args.out}')


def cmd_tiesample(args, d):
    """A random sample (--sample, seed 1) of the tie positions of a text
    (--text): first results a pack rule made while another lemma the matched
    text's form-of rows name comes later, with the text, for judging in
    context (--out)."""
    with open(args.text, encoding='utf-8') as f:
        items = list(hovers(f.read()))
    looked = lookup_batch(args, [rest for _, rest in items])
    found = []
    for (word, rest), entry in zip(items, looked):
        others = ties(d, entry)
        if others:
            found.append((word, rest, entry['results'][0], others))
    print(json.dumps({'lookups': len(items), 'ties': len(found)}))
    if args.out:
        rng = random.Random(1)
        sample = rng.sample(found, min(args.sample, len(found)))
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write('# word\ttext\tfirst\tothers\tjudgement (fill in: right, wrong)\n')
            for word, rest, first, others in sample:
                f.write(f"{word}\t{rest[:70]}\t{first['expression']}\t{' '.join(others)}\t\n")
        print(f'{len(sample)} sampled to {args.out}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['frequent', 'text', 'clitics', 'traces', 'nothing', 'ties', 'compare', 'nogold', 'tiesample', 'judged'])
    parser.add_argument('--zip', required=True)
    parser.add_argument('--dictionary', required=True)
    parser.add_argument('--languages', default=os.path.join(REPO, 'languages'))
    parser.add_argument('--cli')
    parser.add_argument('--batch')
    parser.add_argument('--frequency')
    parser.add_argument('--top', type=int, default=10000)
    parser.add_argument('--text')
    parser.add_argument('--tatoeba', nargs='+')
    parser.add_argument('--sample', type=int, default=60)
    parser.add_argument('--out')
    parser.add_argument('--show', type=int, default=40)
    parser.add_argument('--judged', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'judged-ties-hr.tsv'))
    parser.add_argument('--other', help='another languages directory, for compare')
    parser.add_argument('--lemma-lists', nargs='+', help='frequency lists for the lemma frequency of ties (default: --frequency)')
    args = parser.parse_args()
    d = Dictionary(args.zip)
    with open(os.path.join(args.languages, 'sh', 'transforms.json'), encoding='utf-8') as f:
        PACK_IDS.update(t['id'] for t in json.load(f)['transforms'])
    {'judged': cmd_judged, 'compare': cmd_compare, 'nogold': cmd_nogold, 'tiesample': cmd_tiesample, 'ties': cmd_ties, 'frequent': cmd_frequent, 'text': cmd_text, 'clitics': cmd_clitics, 'traces': cmd_traces, 'nothing': cmd_nothing}[args.command](args, d)


if __name__ == '__main__':
    main()
