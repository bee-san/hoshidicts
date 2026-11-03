#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The measurements of README.md (Measurements) that look words up as a host does.

    python3 languages/ar/sources/measure.py frequent <wty-ar-en.zip> <imported dir> <ar_50k.txt> [--languages dir]
    python3 languages/ar/sources/measure.py text <wty-ar-en.zip> <imported dir> <text file> [--languages dir] [--sample N]
    python3 languages/ar/sources/measure.py sets <imported dir> [--languages dir]

sets: eval-language --dictionary on corpus.tsv + gaps.tsv, cases.tsv,
defaults.tsv and yomitan.tsv for the own, Yomitan, union and final rules,
each file with every option on and with the defaults.

Run from the repository root after building build/hoshidicts-cli and
build/lookup-batch-ar (sources/lookup-batch.cpp). Lookups use the pack's
defaults (no language options), 16 results and scan length 16.

A word's own lemmas are the targets of its form-of rows in wty-ar-en, vowel
marks removed, and the word itself when it has a row with definitions. A
target that has no row with definitions is replaced by its own targets: the
verbal noun عثور has only rows that name its verb عثر, so العثور's lemma is
عثر, as a lookup shows it. A first result is right when its expression is one
of them.

frequent: the 10,000 most frequent entries of a FrequencyWords list, the
Arabic words among them, and of those the words whose lemma a rule reaches
(one of the word's form-of targets is among the deinflections of the word).
Each is looked up alone; the script counts the words, and their share of the
list's tokens, whose first result is not one of the word's own lemmas.

text: every word of a text, looked up as a host does: the text from the word
to the end of its sentence. Positions whose first result matches the whole
word are judged by script: a word wty-ar-en lists by its own lemmas, a word it
does not list by those of its spellings after the default preprocessors (الى
-> إلى) or, failing that (وكتابه), by the lemmas of every way of writing it as proclitics
(و ف ب ك ل س ال لل and their chains) + a listed word + a pronoun, any of which
counts as right. A random sample (seed 1) of the other positions with a
result is printed for judging by hand.
"""
import collections
import json
import random
import re
import subprocess
import sys
import unicodedata
import zipfile

MARKS = re.compile('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]')
WORD = re.compile('[\u0621-\u064A\u064B-\u065F\u0670\u0640]+')
LETTERS = re.compile('^[\u0621-\u064A]+$')
SENTENCE_END = re.compile('[.!?\u061F\u06D4\u2026\n]')


def strip(text):
    return MARKS.sub('', unicodedata.normalize('NFC', text))


def load_dictionary(path):
    targets = collections.defaultdict(set)
    lemma = set()
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(archive.read(name)):
                refs = [d for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str)]
                for ref in refs:
                    targets[row[0]].add(strip(ref[0]))
                if len(refs) < len(row[5]):
                    lemma.add(row[0])
    return targets, lemma


def load_parts_of_speech(path):
    """Each lemma's parts of speech: the rules field of its rows with
    definitions (v, n, or '' for the untagged adjectives, names and particles)."""
    pos = collections.defaultdict(set)
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(archive.read(name)):
                if any(not (isinstance(d, list) and len(d) == 2 and isinstance(d[0], str)) for d in row[5]):
                    pos[row[0]] |= set(row[3].split()) or {''}
    return pos


def load_homographs(path):
    """sources/homographs.tsv: word, then the comma-separated lemmas a reader
    of ordinary prose needs for it, decided by hand."""
    out = {}
    for line in open(path, encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        word, lemmas = line.rstrip('\n').split('\t')[:2]
        out[word] = set(lemmas.split(','))
    return out


def own_lemmas(word, targets, lemma):
    """The targets of the word's form-of rows and the word itself when it has
    a row with definitions; a target without such a row (عثور, whose rows only
    name عثر as its verb) is replaced by its own targets, the entries a lookup
    can show for it."""
    out = set()
    for target in targets.get(word, ()):
        if target in lemma:
            out.add(target)
        else:
            out |= {t for t in targets.get(target, ()) if t in lemma}
    if word in lemma:
        out.add(word)
    return out


def lookup(texts, imported, languages):
    cmd = ['build/lookup-batch-ar', languages, 'ar', imported, '16', '16', '']
    out = subprocess.run(cmd, input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def deinflections(words, languages):
    cmd = ['build/hoshidicts-cli', '--languages', languages, 'preprocess', 'ar', '--stdin']
    out = subprocess.run(cmd, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    variants = {o['input']: [v['text'] for v in o['variants']] for o in map(json.loads, out.splitlines())}
    texts = sorted({t for w in words for t in variants[w]})
    cmd = ['build/hoshidicts-cli', '--languages', languages, 'deinflect', 'ar', '--stdin']
    out = subprocess.run(cmd, input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    results = {o['input']: {r['text'] for r in o['results'] if r['trace']} for o in map(json.loads, out.splitlines())}
    return {w: set().union(*(results[t] for t in variants[w])) for w in words}


def option(args, name, default):
    return args[args.index(name) + 1] if name in args else default


def frequent(args):
    zip_path, imported, freq_path = args[:3]
    languages = option(args, '--languages', 'languages')
    homographs = load_homographs(option(args, '--homographs', '')) if '--homographs' in args else {}
    targets, lemma = load_dictionary(zip_path)
    entries = [line.split() for line in open(freq_path, encoding='utf-8') if line.strip()]
    top = entries[:10000]
    all_tokens = sum(int(c) for _, c in entries)
    top_tokens = sum(int(c) for _, c in top)
    words = [(w, int(c)) for w, c in top if LETTERS.match(w)]
    reached_by_rule = deinflections([w for w, _ in words if targets.get(w)], languages)
    measured = [(w, c) for w, c in words if own_lemmas(w, targets, lemma) & reached_by_rule.get(w, set()) - {w}]
    results = lookup([w for w, _ in measured], imported, languages)
    variants = variants_of([w for w, _ in measured], languages)
    wrong = []
    counts = collections.Counter()
    for (w, c), res in zip(measured, results):
        first = res['results'][0] if res['results'] else None
        right, kind = judge(w, targets, lemma, variants, None, homographs)
        kind = kind_of(right, kind)
        counts[kind] += 1
        if first is None or first['expression'] not in right:
            counts[kind + ' wrong'] += 1
            wrong.append((w, c, first, right))
    measured_tokens = sum(c for _, c in measured)
    wrong_tokens = sum(c for _, c, _, _ in wrong)
    print('list: %d entries, %d tokens; top 10,000: %d tokens (%.1f%%)' % (len(entries), all_tokens, top_tokens, 100 * top_tokens / all_tokens))
    print('Arabic words in the top 10,000: %d' % len(words))
    print('words whose lemma a rule reaches: %d (%.1f%% of the list\'s tokens)' % (len(measured), 100 * measured_tokens / all_tokens))
    print('first result wrong: %d words, %.2f%% of the list\'s tokens' % (len(wrong), 100 * wrong_tokens / all_tokens))
    for k, label in KINDS[:3]:
        print('  %s: %d words, wrong %d' % (label, counts[k], counts[k + ' wrong']))
    made = {}
    if '--split' in args:
        for (w, c, first, right), cause in zip(wrong, causes([(w, right, 'listed', first) for w, _, first, right in wrong], imported, languages)):
            made[w] = cause
        r = [x for x in wrong if made[x[0]] == 'rules']
        print('wrong: %d words (%.2f%% of tokens) made by the rules, %d (%.2f%%) by the dictionary' % (
            len(r), 100 * sum(c for _, c, _, _ in r) / all_tokens, len(wrong) - len(r),
            100 * (wrong_tokens - sum(c for _, c, _, _ in r)) / all_tokens))
    for w, c, first, right in sorted(wrong, key=lambda x: -x[1])[:80]:
        got = '-' if first is None else '%s {%s}' % (first['expression'], '>'.join(reversed(first['trace'])))
        tag = ' [%s]' % made[w] if made else ''
        print('  %s (%d): %s; right %s%s' % (w, c, got, ' '.join(sorted(right)), tag))


def positions(text):
    """(word, text from the word to the end of its sentence) for every word."""
    out = []
    for m in WORD.finditer(text):
        end = SENTENCE_END.search(text, m.end())
        rest = text[m.start():end.start() if end else len(text)]
        out.append((strip(m.group()), ' '.join(rest.split())))
    return out


PROCLITICS = ['', 'و', 'ف', 'ب', 'ك', 'ل', 'س', 'وب', 'وك', 'ول', 'وس', 'فب', 'فك', 'فل', 'فس',
              'ال', 'وال', 'فال', 'بال', 'كال', 'وبال', 'وكال', 'فبال', 'فكال', 'لل', 'ولل', 'فلل']
PRONOUNS = ['', 'ي', 'ني', 'نا', 'ك', 'كما', 'كم', 'كن', 'ه', 'ها', 'هما', 'هم', 'هن']


def bases(stem, pronoun, lemma=()):
    """The spellings a word may have without its pronoun: ة written ت (قوته,
    أمته; where both are words, homographs.tsv decides: صوته is صوت, not
    صوة), ى written ا or ي (معناه, عليه) or merged with the pronoun ي (إليّ),
    and a verb's ـوا without its alif (كتبوه)."""
    out = [stem]
    if pronoun:
        if stem.endswith('ت'):
            out.append(stem[:-1] + 'ة')
        if stem.endswith('ا') or stem.endswith('ي'):
            out.append(stem[:-1] + 'ى')
        if stem.endswith('و'):
            out.append(stem + 'ا')
        if stem.endswith('تمو'):
            out.append(stem[:-1])
        if pronoun == 'ي':
            # ى and the pronoun ي are written as one ي (إليّ, عليّ, لديّ).
            out.append(stem + 'ى')
    return out


def variants_of(words, languages):
    """Each word's spellings after the pack's default preprocessors (اذا -> إذا)."""
    cmd = ['build/hoshidicts-cli', '--languages', languages, 'preprocess', 'ar', '--stdin']
    out = subprocess.run(cmd, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    return {o['input']: [v['text'] for v in o['variants']] for o in map(json.loads, out.splitlines())}


def fits(lemma_pos, prefix, pronoun):
    """Whether a lemma with these parts of speech can take the proclitics and
    the pronoun: الـ, بـ and كـ do not go before a verb, سـ goes only before
    one, a verb does not take ـي (my) and a noun does not take ـني (me). An
    untagged lemma (adjectives, names, particles) fits anything."""
    if not lemma_pos or '' in lemma_pos:
        return True
    clitic = prefix.lstrip('وف')
    if lemma_pos == {'v'} and ('ال' in prefix or prefix.endswith('لل') or clitic in ('ب', 'ك') or pronoun == 'ي'):
        return False
    if 'v' not in lemma_pos and (clitic == 'س' or pronoun == 'ني'):
        return False
    return True


def split_lemmas(word, targets, lemma, pos, homographs):
    """The lemmas of every way of writing the word as proclitics + a listed
    word + a pronoun that fit the lemma's part of speech, a hand decision for
    the listed word counting instead of its own lemmas."""
    found = set()
    for prefix in PROCLITICS:
        if not word.startswith(prefix):
            continue
        for pronoun in PRONOUNS:
            if not word.endswith(pronoun) or len(word) - len(prefix) - len(pronoun) < 1 or (prefix == '' and pronoun == ''):
                continue
            stem = word[len(prefix):len(word) - len(pronoun)]
            if prefix.endswith('لل'):
                stem = 'ال' + stem
            for base in bases(stem, pronoun, lemma):
                candidates = [base]
                if prefix.endswith('ال') or prefix.endswith('لل'):
                    candidates.append(base[2:] if base.startswith('ال') else base)
                for b in candidates:
                    right = homographs.get(b) or own_lemmas(b, targets, lemma)
                    found |= {x for x in right if fits(pos.get(x), prefix, pronoun)}
    return found


def judge(word, targets, lemma, variants=None, pos=None, homographs=None):
    """The lemmas that count as right for a word, and how they were found:
    'homograph' (decided by hand in homographs.tsv), 'listed' (the word's own
    lemmas, or those of its spellings after the default preprocessors, الى ->
    إلى), or 'clitic' (a word wty-ar-en does not list, by the lemmas of every
    way of writing it as proclitics + a listed word + a pronoun that fit the
    lemma's part of speech, a hand decision for that word counting instead of
    its own lemmas). (None, None) when nothing is found."""
    homographs = homographs or {}
    pos = pos or {}
    if word in homographs:
        return homographs[word], 'homograph'
    own = own_lemmas(word, targets, lemma)
    if own and word.startswith('ا'):
        # Written without its hamza (احد, اريد): the lemmas of its spellings
        # with the hamza count too.
        for spelling in (variants or {}).get(word, ()):
            if spelling != word:
                own = own | (homographs.get(spelling) or own_lemmas(spelling, targets, lemma))
    if own:
        return own, 'listed'
    found = set()
    for spelling in (variants or {}).get(word, ()):
        found |= homographs.get(spelling) or own_lemmas(spelling, targets, lemma)
    if found:
        return found, 'listed'
    found = split_lemmas(word, targets, lemma, pos, homographs)
    return (found, 'clitic') if found else (None, None)


KINDS = [('homograph', 'decided by hand (homographs.tsv)'), ('listed', 'listed, one lemma'),
         ('listed, several', 'listed, several lemmas not decided by hand (any counts)'),
         ('clitic', 'not listed, one lemma by its clitic splits'),
         ('clitic, several', 'not listed, several lemmas by its clitic splits (any counts)')]


def norules_languages(languages):
    """A scratch copy of the pack with no deinflection rules (lookup.transforms
    null, no setting that turns transforms on): what the dictionary's own rows
    give."""
    import shutil
    import tempfile
    out = tempfile.mkdtemp(prefix='ar-norules-')
    shutil.copytree(languages + '/ar', out + '/ar')
    path = out + '/ar/language.json'
    d = json.load(open(path, encoding='utf-8'))
    d['lookup']['transforms'] = None
    d['settings'] = [x for x in d.get('settings', []) if 'transforms' not in x.get('effect', {})]
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return out


CLITIC_IDS = {'wa', 'fa', 'bi', 'ka', 'li', 'la', 'al', 'sa', 'p1s', 'p1sObj', 'p1p', 'p2s', 'p2d', 'p2mp', 'p2fp',
              'p3ms', 'p3fs', 'p3d', 'p3mp', 'p3fp'}


def causes(items, imported, languages):
    """For (hover, right lemmas, kind, first result) of wrong first results:
    'rules' where the pack's rules make it, 'dictionary' where the
    dictionary's rows do. A word wty-ar-en lists is the rules' when, looked
    up with no rules, its first result is right; one it does not list (only
    the rules reach it) when every step of the first result's trace is a
    transform of the pack, not a form-of row."""
    if not items:
        return []
    ids = {t['id'] for t in json.load(open(languages + '/ar/transforms.json', encoding='utf-8'))['transforms']}
    res = lookup([h for h, _, _, _ in items], imported, norules_languages(languages))
    out = []
    for (_, right, kind, first), r in zip(items, res):
        if kind.startswith('clitic'):
            # Only proclitics and pronouns: the word behind them is a headword
            # or names a form-of target (وأرى -> أرى, سأذهب -> أذهب), as
            # looked up alone; the dictionary's rows choose the lemma.
            steps = [t for t in first['trace'] if t not in CLITIC_IDS]
            out.append('rules' if steps and all(step in ids for step in steps) else 'dictionary')
        else:
            out.append('rules' if r['results'] and r['results'][0]['expression'] in right else 'dictionary')
    return out


def kind_of(right, kind):
    return kind + ', several' if kind in ('listed', 'clitic') and len(right) > 1 else kind


def text_measure(args):
    zip_path, imported, text_path = args[:3]
    languages = option(args, '--languages', 'languages')
    sample_size = int(option(args, '--sample', '60'))
    seed = int(option(args, '--seed', '1'))
    homographs = load_homographs(option(args, '--homographs', '')) if '--homographs' in args else {}
    targets, lemma = load_dictionary(zip_path)
    pos_ = load_parts_of_speech(zip_path)
    text = open(text_path, encoding='utf-8').read()
    pos = positions(text)
    results = lookup([hover for _, hover in pos], imported, languages)
    variants = variants_of(sorted({word for word, _ in pos}), languages)
    counts = collections.Counter()
    wrong = collections.Counter()
    judged, unjudged, judged_right = [], [], []
    for (word, hover), res in zip(pos, results):
        first = res['results'][0] if res['results'] else None
        if first is None:
            counts['no result'] += 1
            continue
        right, kind = judge(word, targets, lemma, variants, pos_, homographs)
        if right is None or strip(first['matched']) != word:
            unjudged.append((word, hover, first, None))
            continue
        kind = kind_of(right, kind)
        counts[kind] += 1
        ok = first['expression'] in right
        judged.append((word, hover, first, ok))
        judged_right.append((right, kind))
        if not ok:
            counts[kind + ' wrong'] += 1
            wrong[(word, first['expression'], '>'.join(reversed(first['trace'])))] += 1
    total = sum(counts[k] for k, _ in KINDS)
    bad = sum(counts[k + ' wrong'] for k, _ in KINDS)
    print('positions %d, without a result %d, not judged by script %d' % (len(pos), counts['no result'], len(unjudged)))
    print('judged by script %d (first result matching the whole word): wrong %d (%.2f%%)' % (total, bad, 100 * bad / max(total, 1)))
    for k, label in KINDS:
        print('  %s: %d, wrong %d (%.2f%%)' % (label, counts[k], counts[k + ' wrong'], 100 * counts[k + ' wrong'] / max(counts[k], 1)))
    made = {}
    if '--split' in args:
        bad_items = [(word, hover, first, right, kind) for (word, hover, first, ok), (right, kind) in zip(judged, judged_right) if not ok]
        cs = causes([(hover, right, kind, first) for _, hover, first, right, kind in bad_items], imported, languages)
        per = collections.Counter()
        for (word, hover, first, right, kind), c in zip(bad_items, cs):
            made[(word, first['expression'], '>'.join(reversed(first['trace'])))] = c
            per[c] += 1
        print('wrong: %d made by the rules, %d by the dictionary (a listed word: with no rules the first result is right or not; one not listed: its trace has a transform of the pack other than proclitics and pronouns, or not)' % (
            per['rules'], per['dictionary']))
    for (word, got, trace), n in wrong.most_common(60):
        tag = ' ' + made[(word, got, trace)] if made else ''
        print('  %4d  %s -> %s {%s}%s' % (n, word, got, trace, tag))
    if made:
        print('made by the rules:')
        for (word, got, trace), n in wrong.most_common():
            if made[(word, got, trace)] == 'rules':
                print('  %4d  %s -> %s {%s}' % (n, word, got, trace))
    if '--sample-out' in args:
        rng = random.Random(seed)
        with open(option(args, '--sample-out', ''), 'w', encoding='utf-8') as out:
            out.write('# %s: %d judged and %d unjudged positions drawn with seed %d by measure.py text --sample-out.\n' % (
                text_path.split('/')[-1], min(sample_size, len(judged)), min(sample_size, len(unjudged)), seed))
            out.write('# set\tword\ttext\tfirst result\tmatched\ttrace\tscript\thand\n')
            for label, group in (('judged', judged), ('unjudged', unjudged)):
                for word, hover, first, ok in rng.sample(group, min(sample_size, len(group))):
                    out.write('\t'.join([label, word, hover[:40], first['expression'], first['matched'],
                                         '>'.join(reversed(first['trace'])), '-' if ok is None else ('right' if ok else 'wrong'), '']) + '\n')


def scratch_pack(languages, transforms_path, out_dir):
    """A copy of the pack whose transforms.json is another rule file, without
    the settings that name transforms that file may lack."""
    import shutil
    from pathlib import Path
    target = Path(out_dir) / 'ar'
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(Path(languages) / 'ar', target)
    shutil.copy(transforms_path, target / 'transforms.json')
    descriptor = json.loads((target / 'language.json').read_text(encoding='utf-8'))
    ids = {t['id'] for t in json.loads(Path(transforms_path).read_text(encoding='utf-8'))['transforms']}
    descriptor['settings'] = [s for s in descriptor['settings']
                              if 'transforms' not in s['effect'] or set(s['effect']['transforms']) <= ids]
    (target / 'language.json').write_text(json.dumps(descriptor, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return str(Path(out_dir))


def with_options_line(path, out_path, default):
    """A copy of a test file with the `# options: default` line added or removed."""
    lines = open(path, encoding='utf-8').read().splitlines()
    lines = [line for line in lines if line != '# options: default']
    if default:
        lines.insert(0, '# options: default')
    open(out_path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


def sets(args):
    """eval-language on each test file for the own, Yomitan, union and final
    rules, with every option on and with the defaults (docs/languages.md 14,
    "What to measure and report", item 1)."""
    import tempfile
    imported = args[0]
    languages = option(args, '--languages', 'languages')
    pack = languages + '/ar'
    tmp = tempfile.mkdtemp(prefix='ar-sets-')
    union = tmp + '/union.json'
    subprocess.run(['node', 'tools/merge-transforms.mjs', 'ar', '--languages', languages, '--out', union],
                   check=True, capture_output=True)
    rule_sets = [('own', pack + '/sources/own.json'), ('Yomitan', pack + '/sources/yomitan.json'),
                 ('union', union), ('final', pack + '/transforms.json')]
    sample = tmp + '/sample.tsv'
    corpus = open(pack + '/tests/corpus.tsv', encoding='utf-8').read().splitlines()
    gaps = [line for line in open(pack + '/tests/gaps.tsv', encoding='utf-8').read().splitlines() if not line.startswith('#')]
    open(sample, 'w', encoding='utf-8').write('\n'.join(corpus + gaps) + '\n')
    files = [('corpus.tsv + gaps.tsv', sample), ('cases.tsv', pack + '/tests/cases.tsv'),
             ('defaults.tsv', pack + '/tests/defaults.tsv'), ('yomitan.tsv', pack + '/tests/yomitan.tsv')]
    print('| Rule set | File | Options | Rows | Recall | Negatives passed | False candidates | First rank |')
    print('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |')
    for name, rules in rule_sets:
        langs = scratch_pack(languages, rules, tmp + '/' + name)
        for label, path in files:
            for default in (False, True):
                copy = '%s/%s-%s-%d.tsv' % (tmp, name, label.split()[0].replace('.', '_'), default)
                with_options_line(path, copy, default)
                cmd = ['build/hoshidicts-cli', '--languages', langs, 'eval-language', 'ar', copy, '--dictionary', imported]
                out = subprocess.run(cmd, capture_output=True, text=True)
                if out.returncode != 0 and not out.stdout:
                    print('| %s | %s | %s | error: %s |' % (name, label, 'defaults' if default else 'all on', out.stderr.strip()[:80]))
                    continue
                r = json.loads(out.stdout.strip().splitlines()[-1])
                fmt = lambda v, p=True: '-' if v is None else ('%.2f%%' % (100 * v) if p else '%.3f' % v)  # noqa: E731
                print('| %s | %s | %s | %d | %s | %s | %s | %s |' % (
                    name, label, 'defaults' if default else 'all on', r['rows'], fmt(r['recall']) if r['positives'] else '-',
                    fmt(r['negativesPassed']), fmt(r.get('falseCandidates'), False), fmt(r.get('firstRank'))))


def untagged(args):
    """lookup.untaggedTerms: eval-language --dictionary on each test file with
    the pack's default (filter) and with pass (a copy differing only by that
    key), and a census of wty-ar-en's rows without part-of-speech rules
    (docs/languages.md 14 step 5)."""
    import shutil
    import tempfile
    zip_path, imported = args[:2]
    languages = option(args, '--languages', 'languages')
    pack = languages + '/ar'
    tmp = tempfile.mkdtemp(prefix='ar-untagged-')
    shutil.copytree(pack, tmp + '/ar')
    d = json.load(open(tmp + '/ar/language.json', encoding='utf-8'))
    d['lookup']['untaggedTerms'] = 'pass'
    json.dump(d, open(tmp + '/ar/language.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    sample = tmp + '/sample.tsv'
    corpus = open(pack + '/tests/corpus.tsv', encoding='utf-8').read().splitlines()
    gaps = [line for line in open(pack + '/tests/gaps.tsv', encoding='utf-8').read().splitlines() if not line.startswith('#')]
    open(sample, 'w', encoding='utf-8').write('\n'.join(corpus + gaps) + '\n')
    files = [('corpus.tsv + gaps.tsv', sample), ('cases.tsv', pack + '/tests/cases.tsv'),
             ('defaults.tsv', pack + '/tests/defaults.tsv'), ('yomitan.tsv', pack + '/tests/yomitan.tsv')]
    print('| File | Recall, filter -> pass | First rank, filter -> pass | False candidates, filter -> pass |')
    print('| --- | --- | --- | --- |')
    for label, path in files:
        r = []
        for langs in (languages, tmp):
            cmd = ['build/hoshidicts-cli', '--languages', langs, 'eval-language', 'ar', path, '--dictionary', imported]
            r.append(json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout.strip().splitlines()[-1]))
        pct = lambda v: '-' if v is None else '%.2f%%' % (100 * v)  # noqa: E731
        print('| %s | %s -> %s | %s -> %s | %.3f -> %.3f |' % (
            label, pct(r[0]['recall'] if r[0]['positives'] else None), pct(r[1]['recall'] if r[1]['positives'] else None),
            pct(r[0]['firstRank']), pct(r[1]['firstRank']), r[0]['falseCandidates'], r[1]['falseCandidates']))
    rows = empty = form_of = 0
    tags = collections.Counter()
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            if not name.startswith('term_bank'):
                continue
            for row in json.loads(archive.read(name)):
                rows += 1
                if row[3].strip():
                    continue
                empty += 1
                if all(isinstance(x, list) and len(x) == 2 and isinstance(x[0], str) for x in row[5]):
                    form_of += 1
                else:
                    tags[(row[2].split() or ['-'])[0]] += 1
    print('\nwty-ar-en: %d rows, %d (%.2f%%) with empty rules, %d of them form-of rows; untagged lemma rows by first tag: %s' % (
        rows, empty, 100 * empty / rows, form_of, ', '.join('%s %d' % kv for kv in tags.most_common(12))))


if __name__ == '__main__':
    command, rest = sys.argv[1], sys.argv[2:]
    {'frequent': frequent, 'text': text_measure, 'sets': sets, 'untagged': untagged}[command](rest)
