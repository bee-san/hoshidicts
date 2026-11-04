# SPDX-License-Identifier: GPL-3.0-or-later
# Real-text measurements of README.md (Measurements 2-4; the judge is
# described in its Measure notes). Needs build/lookup-batch-uk
# (sources/lookup-batch.cpp):
#
#   python3 languages/uk/sources/measure.py words|text|phrases <wty-uk-en json dir> <imported wty-uk-en> <file>...
#       [--frequencies <list>]... [--languages <dir>] [--verdicts <file>]
#
# words: the 10,000 most frequent words of a frequency list, each looked up
#   alone. text: every word of the texts with the rest of its sentence.
#   phrases: every word of Tatoeba's sentences after a preposition, a
#   particle, a conjunction, a pronoun or a form of бути.
# --frequencies: lists for the frequency proxy, the first that knows a
#   lemma deciding (in words mode the word list comes first). --verdicts:
#   one line per lookup (word, verdict, first result, its rules, weight,
#   what judged it). --languages: another copy of the pack.

import collections, glob, json, os, re, subprocess, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BATCH = os.path.join(ROOT, 'build', 'lookup-batch-uk')
WORD = re.compile(r"[а-щьюяєіїґА-ЩЬЮЯЄІЇҐ][а-щьюяєіїґА-ЩЬЮЯЄІЇҐ'’ʼ\u0300\u0301]*")
SENTENCE_END = re.compile(r'[.!?…]|\n\s*\n')
APOSTROPHES = str.maketrans({'’': "'", 'ʼ': "'", '‘': "'", '`': "'", '´': "'"})
PRONOUNS = {
    'я': ['мене', 'мені', 'мною'], 'ти': ['тебе', 'тобі', 'тобою'], 'він': ['його', 'нього', 'йому', 'ньому', 'ним', 'нім'],
    'вона': ['її', 'неї', 'їй', 'ній', 'нею'], 'ми': ['нас', 'нам', 'нами'], 'ви': ['вас', 'вам', 'вами'],
    'вони': ['їх', 'них', 'їм', 'ними'], 'себе': ['собі', 'собою'],
}
PRONOUN_LEMMAS = collections.defaultdict(set)
for lemma, forms in PRONOUNS.items():
    for form in forms:
        PRONOUN_LEMMAS[form].add(lemma)
for form in ['його', 'нього', 'йому', 'ньому', 'ним', 'нім']:
    PRONOUN_LEMMAS[form].add('воно')
FUNCTION_GROUPS = {
    'preposition': ['в', 'у', 'на', 'з', 'із', 'зі', 'до', 'від', 'по', 'за', 'при', 'про', 'під', 'над', 'перед', 'між', 'через', 'без',
                    'для', 'біля', 'коло', 'після'],
    'particle': ['не', 'ні', 'б', 'би', 'ж', 'же', 'то', 'ще', 'вже', 'уже'],
    'conjunction': ['і', 'й', 'та', 'а', 'але', 'що', 'як'],
    'pronoun': ['я', 'ти', 'він', 'вона', 'воно', 'ми', 'ви', 'вони', 'це', 'той', 'цей', 'мене', 'тебе', 'його', 'її', 'нас', 'вас', 'їх',
                'мені', 'тобі', 'йому', 'їй', 'нам', 'вам', 'їм', 'себе', 'собі'],
    'бути': ['буду', 'будеш', 'буде', 'будемо', 'будете', 'будуть', 'був', 'була', 'було', 'були'],
}
FUNCTION = {w: group for group, words in FUNCTION_GROUPS.items() for w in words}
DOUBLET = re.compile(r'([гкхзс])нути(ся)?$')
LABELS = {}
for line in open(os.path.join(HERE, 'homographs.tsv'), encoding='utf-8'):
    if line.strip() and not line.startswith('#'):
        word, label = line.rstrip('\n').split('\t')
        LABELS[word] = set(label.split(','))
FREQUENCIES = []  # frequency lists, the first that knows a lemma decides
KNOWN = set()  # the spellings that have rows (filled by main)
CHARS = set()  # the letters' own entries, tagged char (А: the first letter)


def load_frequencies(path):
    counts = {}
    for line in open(path, encoding='utf-8'):
        parts = line.split()
        if len(parts) == 2:
            counts.setdefault(parts[0], int(parts[1]))
    FREQUENCIES.append(counts)


def norm(text):
    """The text without stress marks, with one apostrophe; case kept."""
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if c not in '\u0300\u0301')
    return unicodedata.normalize('NFC', text).translate(APOSTROPHES)


def keys(word, initial=False, rows=None):
    """The spellings whose rows judge a hovered word: its own and, when
    capitalised, the lowercase one; at a sentence start only the lowercase
    one when it has rows (Мені: мені, not the town Мена)."""
    w = norm(word)
    if w == w.lower():
        return [w]
    if initial and rows is not None and w.lower() in rows:
        return [w.lower()]
    return [w, w.lower()]


# Links a lemma's rows may name that keep the lemma: other spellings and the
# other aspect. A link that makes the named lemma an inflected form or a
# derivative of another (мило, the neuter past of мити; копа, the genitive of
# коп) is another lemma, which a word naming it does not mean.
SAME_LEMMA = re.compile(r'^(?:alternative|alt-of|rare alternative|alternative dialectal|alternative abbreviation|misspelling|nonstandard|'
                        r'dated|archaic|obsolete|proscribed|lowercase|uppercase|(?:im)?perfective(?: rare| semelfactive)?)$')
LINKS = collections.defaultdict(set)


def load_rows(json_dir):
    lemmas, targets = set(), collections.defaultdict(set)
    for path in sorted(glob.glob(os.path.join(json_dir, 'term_bank_*.json'))):
        for row in json.load(open(path, encoding='utf-8')):
            term = norm(row[0])
            refs = [g for g in row[5] if isinstance(g, list) and len(g) == 2 and isinstance(g[0], str)]
            others = [g for g in row[5] if not isinstance(g, list)]
            if others:
                lemmas.add(term)
                if 'char' in (row[2] or '').split() and term != term.lower():
                    CHARS.add(term)
            for ref in refs:
                # wiktionary-to-yomitan writes some targets with their aspect
                # (знайти́ pf); the lemma is the word before it.
                target = re.sub(r' (?:pf|impf)(?: (?:pf|impf))?$', '', norm(ref[0]))
                targets[term].add(target)
                LINKS[(term, target)] |= set(ref[1])
    return lemmas, targets


def same_lemma(name, target, lemmas):
    """Whether a reader who means the lemma `name` also means `target`, which
    `name`'s rows name: always when `name` is only a reference, else when
    every link is another spelling or the other aspect."""
    links = LINKS.get((name, target), set())
    return name not in lemmas or (bool(links) and all(SAME_LEMMA.match(l) for l in links))


def lookups(texts, languages, dictionary):
    proc = subprocess.run([BATCH, languages, 'uk', dictionary, '16', '16'], input='\n'.join(texts) + '\n',
                          capture_output=True, text=True, encoding='utf-8', check=True)
    return [json.loads(line) for line in proc.stdout.splitlines()]


def meant(word, lemmas, targets, initial=False):
    """(the lemmas the hovered word means, what decided them)."""
    known = KNOWN if KNOWN else None
    for w in keys(word, initial, known):
        if w.lower() in LABELS:
            return LABELS[w.lower()], 'label'
    right, how = set(), 'rows'
    for w in keys(word, initial, known):
        if w in lemmas:
            right.add(w)
        if PRONOUN_LEMMAS.get(w):
            right |= PRONOUN_LEMMAS[w]
            continue
        # One group per lemma a row names, with the lemmas that lemma's own
        # rows name as the same lemma (вміти → уміти, вдавати → вдати).
        groups = [{n} | {t for t in targets.get(n, ()) if same_lemma(n, t, lemmas)} for n in sorted(targets.get(w, ()))]
        groups = [g for g in groups if g & lemmas] or groups
        # Doublets of one verb (досягти, досягнути; вдягти, вдягнути) are
        # one lemma.
        merged = {}
        for g in groups:
            key = frozenset(DOUBLET.sub(r'\1ти\2', x) for x in g)
            merged[key] = merged.get(key, set()) | g
        groups = list(merged.values())
        distinct = {frozenset(g & lemmas) or frozenset(g) for g in groups}
        if len(distinct) > 1 and FREQUENCIES:
            how = 'tie'
            for counts in FREQUENCIES:
                score = lambda g: max(counts.get(x, 0) for x in g)
                best = max(score(g) for g in groups)
                if best > 0:
                    groups = [g for g in groups if score(g) == best]
                    how = 'proxy'
                    break
        for g in groups:
            right |= g
    return right, how


def judge(word, answer, lemmas, targets, initial=False):
    """(verdict, first result, what judged it) for one hovered word."""
    results = answer['results']
    if not results:
        return 'none', None, None
    first = results[0]
    if len(norm(first['matched'])) > len(norm(word)):
        return 'phrase', first, None
    # At a sentence start a letter's own entry (Я, А) is wrong when the
    # lowercase word has rows; another capitalised entry of the same
    # spelling (Сонце, Ви) is judged as before.
    expression = norm(first['expression'])
    if initial and expression in CHARS and expression != norm(word).lower() and norm(word).lower() in KNOWN:
        return 'wrong', first, 'rows'
    same = expression.lower() == norm(word).lower()
    right, how = meant(word, lemmas, targets, initial and not same)
    # A tie no frequency list decides is counted apart, unless the result is
    # the word itself.
    if how == 'tie' and expression in right and not same:
        return 'tie', first, how
    if not right:
        return 'unknown', first, None
    expression = norm(first['expression'])
    if expression in right:
        return 'right', first, how
    if expression.endswith('о') and norm(word).lower().endswith(('ше', 'ще', 'че')) and any(expression[:-1] + e in right for e in ('ий', 'ій')):
        return 'right', first, how
    return 'wrong', first, how


def reached(words, languages, lemmas, targets):
    """The words a rule reaches: a deinflection of the word (or of its
    lowercase spelling) other than the word itself is a lemma its rows name."""
    cli = os.path.join(ROOT, 'build', 'hoshidicts-cli')
    inputs = sorted({k for w in words for k in keys(w)})
    out = subprocess.run([cli, '--languages', languages, 'deinflect', 'uk', '--stdin'], input='\n'.join(inputs) + '\n',
                         capture_output=True, text=True, encoding='utf-8', check=True).stdout.splitlines()
    texts = {}
    for line in out:
        d = json.loads(line)
        texts[d['input']] = {norm(r['text']) for r in d['results'] if r['trace']}
    result = []
    for w in words:
        right = set()
        for k in keys(w):
            right |= PRONOUN_LEMMAS.get(k, set())
            if not PRONOUN_LEMMAS.get(k):
                named = set(targets.get(k, ()))
                right |= named | {t for n in named for t in targets.get(n, ())}
        result.append(any(right & texts.get(k, set()) for k in keys(w)))
    return result


def blame(first):
    steps = [step for step, from_dict in zip(first['trace'], first['dict']) if not from_dict]
    return '|'.join(steps) if steps else '(dictionary only)'


VERDICTS = None


def report(name, items, lemmas, targets, weights=None, show=25, record=True, initials=None):
    verdicts = collections.Counter()
    weighted = collections.Counter()
    wrong = collections.Counter()
    phrases = collections.Counter()
    examples = collections.defaultdict(list)
    for i, (word, answer) in enumerate(items):
        verdict, first, how = judge(word, answer, lemmas, targets, bool(initials and initials[i]))
        weight = weights[i] if weights else 1
        if VERDICTS is not None and record:
            VERDICTS.write(f"{word}\t{verdict}\t{first['expression'] if first else ''}\t{blame(first) if first else ''}\t{weight}\t{how or ''}\n")
        verdicts[verdict] += 1
        weighted[verdict] += weight
        if how:
            verdicts['by' + how.capitalize()] += 1
            if verdict == 'wrong':
                verdicts['wrongBy' + how.capitalize()] += 1
        if verdict in ('right', 'wrong') and blame(first) != '(dictionary only)':
            verdicts[verdict + 'ByRules'] += 1
            weighted[verdict + 'ByRules'] += weight
        if verdict == 'wrong':
            key = blame(first)
            wrong[key] += weight
            if len(examples[key]) < 6:
                examples[key].append(f"{word}→{first['expression']}")
        elif verdict == 'phrase' and blame(first) != '(dictionary only)':
            key = 'phrase by rules: ' + blame(first)
            phrases[key] += weight
            if len(examples[key]) < 6:
                examples[key].append(f"{first['matched']}→{first['expression']}")
    total = sum(verdicts[k] for k in ('right', 'wrong', 'tie', 'unknown', 'phrase', 'none'))
    out = {'set': name, 'lookups': total, **{k: verdicts[k] for k in ('right', 'wrong', 'tie', 'unknown', 'phrase', 'none', 'rightByRules', 'wrongByRules',
                                                              'byLabel', 'wrongByLabel', 'byProxy', 'wrongByProxy', 'byRows', 'wrongByRows')}}
    if weights:
        tokens = sum(weights)
        out['wrongTokenShare'] = weighted['wrong'] / tokens
        out['rightByRulesTokenShare'] = weighted['rightByRules'] / tokens
    judged = verdicts['right'] + verdicts['wrong']
    out['wrongRate'] = verdicts['wrong'] / judged if judged else None
    print(json.dumps(out, ensure_ascii=False))
    for key, n in wrong.most_common(show):
        print(f"  {n}\t{key}\t{' '.join(examples[key])}")
    for key, n in phrases.most_common(show):
        print(f"  {n}\t{key}\t{' '.join(examples[key])}")


def hovers(text, initials=None):
    """Each word of the text with the rest of its sentence, as a host passes it.
    With a list, also records whether each word starts a sentence (nothing
    but spaces, quotes, dashes and brackets since the last sentence end)."""
    out = []
    last = 0
    for m in WORD.finditer(text):
        end = SENTENCE_END.search(text, m.end())
        stop = end.end() if end else len(text)
        out.append((m.group(0), re.sub(r'\s+', ' ', text[m.start():min(stop, m.start() + 64)]).strip()))
        if initials is not None:
            gap = text[last:m.start()]
            initials.append(last == 0 or bool(re.fullmatch(r'.*(?:[.!?…]|\n\s*\n)[\s«»„“”"\'(\[—–-]*', gap, re.S)))
        last = m.end()
    return out


def main():
    args = sys.argv[1:]
    languages = os.path.join(ROOT, 'languages')
    if '--languages' in args:
        i = args.index('--languages')
        languages = args[i + 1]
        del args[i:i + 2]
    global VERDICTS
    if '--verdicts' in args:
        i = args.index('--verdicts')
        VERDICTS = open(args[i + 1], 'w', encoding='utf-8')
        del args[i:i + 2]
    extra = []
    while '--frequencies' in args:
        i = args.index('--frequencies')
        extra.append(args[i + 1])
        del args[i:i + 2]
    mode, json_dir, dictionary, *files = args
    if mode == 'words':
        load_frequencies(files[0])
    for path in extra:
        load_frequencies(path)
    lemmas, targets = load_rows(json_dir)
    KNOWN.update(lemmas)
    KNOWN.update(targets)
    if mode == 'words':
        words, counts = [], []
        for line in open(files[0], encoding='utf-8'):
            parts = line.split()
            if len(parts) == 2 and WORD.fullmatch(parts[0]):
                words.append(parts[0])
                counts.append(int(parts[1]))
            if len(words) == 10000:
                break
        answers = lookups(words, languages, dictionary)
        report('frequent words', list(zip(words, answers)), lemmas, targets, weights=counts)
        hit = reached(words, languages, lemmas, targets)
        items = [(w, a) for w, a, h in zip(words, answers, hit) if h]
        report('frequent words a rule reaches', items, lemmas, targets, weights=[c for c, h in zip(counts, hit) if h], record=False)
        print(json.dumps({'reachedWords': len(items), 'reachedTokenShare': sum(c for c, h in zip(counts, hit) if h) / sum(counts)}))
    elif mode == 'text':
        for path in files:
            text = open(path, encoding='utf-8').read()
            # Wikisource pages are separated by '### <title>' lines; the
            # editors' notes (Примітки) are not the author's text.
            sections = re.split(r'^### (.*)$', text, flags=re.M)
            if len(sections) > 1:
                text = '\n'.join(body for title, body in zip(sections[1::2], sections[2::2]) if not title.split(' (revid')[0].endswith('Примітки'))
            initials = []
            items = hovers(text, initials)
            answers = lookups([h for _, h in items], languages, dictionary)
            report(os.path.basename(path), [(w, a) for (w, _), a in zip(items, answers)], lemmas, targets, initials=initials)
    elif mode == 'phrases':
        items = []
        for line in open(files[0], encoding='utf-8'):
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 3:
                continue
            words = hovers(parts[2])
            for (word, hover), (prev, _) in zip(words[1:], words):
                if norm(prev).lower() in FUNCTION:
                    items.append((FUNCTION[norm(prev).lower()], word, hover))
        answers = lookups([h for _, _, h in items], languages, dictionary)
        report('words after a function word', [(w, a) for (_, w, _), a in zip(items, answers)], lemmas, targets)
        for group in FUNCTION_GROUPS:
            report(f'words after a {group}', [(w, a) for (g, w, _), a in zip(items, answers) if g == group], lemmas, targets, show=5, record=False)
    else:
        sys.exit(f'unknown mode {mode}')


if __name__ == '__main__':
    main()
