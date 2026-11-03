#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of languages/sga/README.md (Measurements). Not run by any test.

    python3 languages/sga/sources/measure.py <command> --cache <dir> --work <dir>

<cache> holds the inputs, downloaded once and never committed (README.md,
Sources and licences): wty-sga-en.zip and its import wty-sga-en/ (hoshidicts-cli
import), kaikki-sga.jsonl, unimorph-sga/sga, UD_Old_Irish-DipWBG/ and
UD_Old_Irish-DipSGG/, wurzburg/glosses.json and tain/pages.json. <work> is a
scratch directory for rule-set copies and outputs. Commands:

  scratch   copies of the pack with each rule set (norules, own, yomitan,
            union, final) and with untaggedTerms "filter" (filter-own, ...)
  eval      hoshidicts-cli eval-language --dictionary for every set, both
            untaggedTerms values and both option modes, on the sample
            (corpus.tsv with gaps.tsv) and cases.tsv
  text      every word of the Táin, the Würzburg glosses and the UD
            treebanks looked up as a host does, for every set; the Táin's
            first results classed against the dictionary alone (no rules)
  perrule   eval-language --per-rule for the union and the final set on the
            sample, summed by transform (README.md, Rule provenance)
  frequent  the Würzburg glosses' word forms as a frequency list
  contexts  forms right after an article or a conjunct particle
  judge     the readings judged by hand in sources/judged-tain.tsv: every
            Táin first result a rule puts in place of the dictionary's own,
            the 70 most frequent where the dictionary alone has nothing, a
            random sample of 100 of the other lookups of that class, and
            every first result the union reaches through Yomitan's lenited
  tally     the verdicts of sources/judged-tain.tsv counted by set

Build build/hoshidicts-cli and build/lookup-batch-sga first (sources/lookup-batch.cpp).
"""

import argparse
import collections
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(PACK))
CLI = os.path.join(ROOT, 'build', 'hoshidicts-cli')
BATCH = os.path.join(ROOT, 'build', 'lookup-batch-sga')
SETS = ['norules', 'own', 'yomitan', 'union', 'final']
SHA256 = {
    'wty-sga-en.zip': '92b53b71c2200892a5eefce5e14f48e54f78e2a74b76927a18cb3a7d89fdb9fb',
    'wurzburg/glosses.json': 'fbf6e70c844dcd14c4c42bf9db20639f87c1f3a09381224d4ad7cd3ff2b8d786',
    'tain/pages.json': '04d4283a02efde8f564e6ff17b8caecd919ac47b414df1622fd683d26b95badd',
    'UD_Old_Irish-DipWBG/sga_dipwbg-ud-test.conllu': 'f04fd8e44c60be16b68f8ced77cbcd34a304f5986671c48f10e92ad6b9ac161a',
    'UD_Old_Irish-DipSGG/sga_dipsgg-ud-test.conllu': '0eaf7cb819c15935557859d84bf50300ce8622478b299924f00bdbc419b6b64f',
}


def check_inputs(cache):
    for name, expected in SHA256.items():
        with open(os.path.join(cache, name), 'rb') as f:
            got = hashlib.sha256(f.read()).hexdigest()
        if got != expected:
            sys.exit(f'{name}: sha256 {got}, expected {expected}')


def strip_marks(text):
    return unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', text) if not '\u0300' <= c <= '\u036f'))


def norm(text):
    """A lemma compared loosely: lower case, no marks, dot or hyphen, ae for æ;
    the UD and Würzburg lemmas number homographs (a_2, é_1)."""
    text = re.sub(r'_\d+$', '', text)
    return strip_marks(text.lower()).replace('·', '').replace('-', '').replace('æ', 'ae')


def load_dictionary(cache):
    rows = []
    for f in sorted(glob.glob(os.path.join(cache, 'wty-sga-en-unz', 'term_bank_*.json'))):
        with open(f, encoding='utf-8') as fh:
            rows += json.load(fh)
    lemmas, refs = set(), collections.defaultdict(set)
    for r in rows:
        targets = [g[0] for g in r[5] if isinstance(g, list)]
        if targets:
            refs[r[0]].update(targets)
        else:
            lemmas.add(r[0])
    return rows, lemmas, refs


def unzip_dictionary(cache):
    target = os.path.join(cache, 'wty-sga-en-unz')
    if not os.path.isdir(target):
        subprocess.run(['unzip', '-q', '-o', os.path.join(cache, 'wty-sga-en.zip'), '-d', target], check=True)


# --- Scratch rule sets --------------------------------------------------------

def scratch(args):
    work = os.path.join(args.work, 'scratch')
    shutil.rmtree(work, ignore_errors=True)
    for untagged in ['pass', 'filter']:
        for name in SETS:
            label = name if untagged == 'pass' else f'filter-{name}'
            target = os.path.join(work, label, 'sga')
            shutil.copytree(PACK, target)
            path = os.path.join(target, 'language.json')
            with open(path, encoding='utf-8') as f:
                descriptor = json.load(f)
            descriptor['lookup']['untaggedTerms'] = untagged
            if name == 'norules':
                descriptor['lookup']['transforms'] = None
                os.remove(os.path.join(target, 'transforms.json'))
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(descriptor, f, ensure_ascii=False, indent=2)
            rules = {'own': 'sources/own.json', 'yomitan': 'sources/yomitan.json'}.get(name)
            if rules:
                shutil.copy(os.path.join(PACK, rules), os.path.join(target, 'transforms.json'))
            if name == 'union':
                subprocess.run(['node', os.path.join(ROOT, 'tools', 'merge-transforms.mjs'), 'sga', '--languages', os.path.dirname(target),
                                '--out', os.path.join(target, 'transforms.json'), '--force'], check=True, capture_output=True)
    print(f'scratch packs in {work}')


def pack_dir(args, name):
    return os.path.join(args.work, 'scratch', name)


# --- eval-language ------------------------------------------------------------

def tsv_copy(src, dst, star=False, defaults=None):
    """A copy of a test file: rule column `*` (for Yomitan's rules, which give
    no conditions) and the options line added (defaults=True) or removed."""
    with open(src, encoding='utf-8') as f:
        lines = f.read().splitlines()
    lines = [l for l in lines if l != '# options: default']
    out = []
    for line in lines:
        if not line.startswith('#') and star:
            cells = line.split('\t')
            cells[4] = '*'
            line = '\t'.join(cells)
        out.append(line)
    if defaults:
        out.insert(0, '# options: default')
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')


def evaluate(args):
    dictionary = os.path.join(args.cache, 'wty-sga-en')
    files = os.path.join(args.work, 'eval')
    os.makedirs(files, exist_ok=True)
    sample = os.path.join(files, 'sample.tsv')
    with open(os.path.join(PACK, 'tests', 'corpus.tsv'), encoding='utf-8') as f:
        text = f.read()
    with open(os.path.join(PACK, 'tests', 'gaps.tsv'), encoding='utf-8') as f:
        text += ''.join(l for l in f.read().splitlines(True) if not l.startswith('#'))
    with open(sample, 'w', encoding='utf-8') as f:
        f.write(text)
    results = []
    for name in SETS[1:]:
        for untagged in ['pass', 'filter']:
            label = name if untagged == 'pass' else f'filter-{name}'
            for base in ['sample', 'cases']:
                src = sample if base == 'sample' else os.path.join(PACK, 'tests', 'cases.tsv')
                for mode in ['all options', 'defaults']:
                    dst = os.path.join(files, f'{base}-{label}-{mode[0]}.tsv')
                    tsv_copy(src, dst, star=(name == 'yomitan'), defaults=(mode == 'defaults'))
                    out = subprocess.run([CLI, '--languages', pack_dir(args, label), 'eval-language', 'sga', dst, '--dictionary', dictionary],
                                         capture_output=True, text=True, check=True)
                    r = json.loads(out.stdout.strip().splitlines()[-1])
                    r.update(set=name, untaggedTerms=untagged, file=base, mode=mode)
                    results.append(r)
                    print(json.dumps(r, ensure_ascii=False))
    with open(os.path.join(args.work, 'eval.json'), 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)


# --- Real text ----------------------------------------------------------------

LETTER = r'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F0-9\u0254\u0186\u2183\u2184\u204A\uA749\u026B'
WORD = re.compile(rf'[{LETTER}]+(?:[\u00B7\u0387\u2027\u2219\u22C5][{LETTER}]+)*')
END = re.compile(r'[.!?…]')


def hovers(text):
    """(word, the text from the word to the end of its sentence) at each word
    start, as a host with scanStart "word" passes it."""
    text = re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text))
    out = []
    for m in WORD.finditer(text):
        e = END.search(text, m.end())
        out.append((m.group(0), text[m.start():e.start() if e else len(text)]))
    return out


def tain_text(cache):
    with open(os.path.join(cache, 'tain', 'pages.json'), encoding='utf-8') as f:
        pages = json.load(f)
    keys = sorted((k for k in pages if 15 <= int(k.split('/')[-1]) <= 134), key=lambda k: int(k.split('/')[-1]))
    parts = []
    for k in keys:
        t = pages[k]['text']
        t = re.sub(r'<noinclude>.*?</noinclude>', '', t, flags=re.S)
        t = re.sub(r'<ref[^>/]*/>', '', t)
        t = re.sub(r'<ref[^>]*>.*?</ref>', '', t, flags=re.S)
        t = re.sub(r'\[\d+<sup>[^<]*</sup>\]', '', t)
        t = re.sub(r'<sup>.*?</sup>', '', t, flags=re.S)
        for _ in range(3):
            t = re.sub(r'\{\{[^{}]*\}\}', '', t)
        t = re.sub(r'</?(poem|div|span|center|big|small|br|p)[^>]*>', ' ', t)
        t = re.sub(r'<[^>]+>', '', t)
        t = t.replace("'''", '').replace("''", '')
        t = re.sub(r'\[([a-zA-ZáéíóúāēīōūǣǽæḟṡṅṁḃċḋġṗṫÁÉÍÓÚĀĒĪŌŪ]{1,3})\]', r'\1', t)
        t = re.sub(r'\[[^\]]*\]', '', t)
        parts.append(t)
    return unicodedata.normalize('NFC', '\n'.join(parts))


GOLD_SKIP = {'<Latin>', '<Latin CCONJ>', 'PUNCT', '<Greek>', 'X', 'NUM', 'SYM', '<unknown>'}


def gold_hovers(cache):
    """(source, text, form, lemma, pos, previous token) at each Old Irish token
    of the Würzburg glosses (CC BY 4.0) and the UD treebanks, with the gold
    lemma."""
    out = []
    with open(os.path.join(cache, 'wurzburg', 'glosses.json'), encoding='utf-8') as f:
        data = json.load(f)
    for epistle in data:
        for folio in epistle['folios']:
            for gloss in folio['glosses']:
                tokens = gloss['glossTokens']
                forms = [t[0] for t in tokens]
                for i, (form, pos, lemma, _feats) in enumerate(tokens):
                    if pos in GOLD_SKIP or not lemma:
                        continue
                    previous = tokens[i - 1] if i else None
                    out.append(('wb', ' '.join(forms[i:]), form, lemma, pos, previous[2] if previous else '', previous[1] if previous else ''))
    for path in sorted(glob.glob(os.path.join(cache, 'UD_Old_Irish-*', '*.conllu'))):
        sentence = []
        with open(path, encoding='utf-8') as f:
            lines = f.read().splitlines() + ['']
        for line in lines:
            if not line.strip():
                forms = [t[1] for t in sentence]
                for i, t in enumerate(sentence):
                    if t[3] in ('PUNCT', 'X', 'NUM', 'SYM'):
                        continue
                    previous = sentence[i - 1] if i else None
                    out.append(('ud', ' '.join(forms[i:]), t[1], t[2], t[3], previous[2] if previous else '', previous[3] if previous else ''))
                sentence = []
                continue
            if line.startswith('#'):
                continue
            cells = line.split('\t')
            if '-' in cells[0] or '.' in cells[0]:
                continue
            sentence.append(cells)
    return out


def batch(args, name, texts, tag):
    path = os.path.join(args.work, 'lookups', f'{tag}-{name}.jsonl')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = subprocess.run([BATCH, '--languages', pack_dir(args, name), os.path.join(args.cache, 'wty-sga-en'), '16'],
                         input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True)
    lines = [json.loads(l) for l in out.stdout.splitlines()]
    assert len(lines) == len(texts)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(out.stdout)
    return lines


def rule_ids():
    ids = set()
    for name in ['own.json', 'yomitan.json']:
        with open(os.path.join(HERE, name), encoding='utf-8') as f:
            ids |= {t['id'] for t in json.load(f)['transforms']}
    return ids


def first_results(args, name, texts, tag):
    return [r['results'][0] if r['results'] else None for r in batch(args, name, texts, tag)]


def tain_classes(args, name, tain, rules, base=None):
    """The class of each Táin lookup's first result for one rule set,
    against the first result of the dictionary alone (`norules`):
    - nothing;
    - the dictionary's reading: no rule in the trace (the text as written or
      a form-of row of the text);
    - a rule's reading the dictionary alone also puts first;
    - a rule's reading that replaces the dictionary's own first result;
    - a rule's reading where the dictionary alone has nothing."""
    firsts = first_results(args, name, [h for _, h in tain], 'tain')
    if base is None:
        base = firsts
    out = []
    for first, alone in zip(firsts, base):
        if first is None:
            out.append(('nothing', first, alone))
        elif not any(t in rules for t in first['trace']):
            out.append(('the dictionary\'s reading', first, alone))
        elif alone is not None and alone['expression'] == first['expression']:
            out.append(('a rule, the dictionary alone puts it first', first, alone))
        elif alone is not None:
            out.append(('a rule, replaces the dictionary\'s first result', first, alone))
        else:
            out.append(('a rule, the dictionary alone has nothing', first, alone))
    return out


def text(args):
    _rows, lemmas, refs = load_dictionary(args.cache)
    rules = rule_ids()
    lemma_norm = {norm(l) for l in lemmas}
    summary = {}
    tain = [h for line in tain_text(args.cache).split('\n') if line.strip() for h in hovers(line)]
    base = first_results(args, 'norules', [h for _, h in tain], 'tain')
    for name in SETS:
        classes = tain_classes(args, name, tain, rules, base)
        counts = collections.Counter(c for c, _, _ in classes)
        groups = collections.Counter()
        for c, first, _ in classes:
            if c.startswith('a rule, the dictionary alone has nothing') or c.startswith('a rule, replaces'):
                used = [t for t in first['trace'] if t in rules]
                groups[used[-1]] += 1
        summary[f'tain {name}'] = {'lookups': len(tain), **counts, 'by first rule (judged by hand)': dict(groups.most_common(12))}
    # Gold lemmas: the Würzburg glosses and UD.
    gold = gold_hovers(args.cache)
    for name in SETS + ['filter-final']:
        results = batch(args, name, [g[1] for g in gold], 'gold')
        counts = collections.Counter()
        wrong_by_rule = collections.Counter()
        for g, r in zip(gold, results):
            target = norm(g[3])
            if target not in lemma_norm:
                counts['gold lemma not a headword'] += 1
                continue
            if not r['results']:
                counts['nothing'] += 1
                continue
            first = r['results'][0]
            if norm(first['expression']) == target:
                counts['right first'] += 1
            else:
                counts['wrong first'] += 1
                used = [t for t in first['trace'] if t in rules]
                if used:
                    wrong_by_rule[used[-1]] += 1
        judged = counts['right first'] + counts['wrong first'] + counts['nothing']
        summary[f'gold {name}'] = {'tokens': len(gold), **counts, 'right first share': round(counts['right first'] / judged, 4),
                                   'wrong first by last rule': dict(wrong_by_rule.most_common(12))}
    for k, v in summary.items():
        print(k, json.dumps(v, ensure_ascii=False))
    with open(os.path.join(args.work, 'text.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)


def perrule(args):
    """--per-rule on the sample for the union and the final set, summed by
    transform: rows only it recovers, false candidates only it adds,
    negatives of cases.tsv only it breaks."""
    dictionary = os.path.join(args.cache, 'wty-sga-en')
    files = os.path.join(args.work, 'eval')
    for name in ['union', 'final']:
        for base in ['sample', 'cases']:
            path = os.path.join(files, f'{base}-{name}-a.tsv')
            out = subprocess.run([CLI, '--languages', pack_dir(args, name), 'eval-language', 'sga', path, '--dictionary', dictionary, '--per-rule'],
                                 capture_output=True, text=True, check=True)
            result = json.loads(out.stdout)
            sums = collections.defaultdict(lambda: [0, 0, 0])
            for r in result['perRule']:
                a = sums[r['transform']]
                a[0] += r['recovers']
                a[1] += r['falseCandidates']
                a[2] += r['breaks']
            recovering = sum(1 for r in result['perRule'] if r['recovers'] > 0)
            print(f'{name} {base}: {recovering} rules recover a row only they reach; by transform (recovers, false candidates, breaks):')
            for t, (rec, fc, br) in sorted(sums.items(), key=lambda kv: (-kv[1][1], kv[0])):
                if rec or fc or br:
                    print(f'  {t}\t{rec}\t{fc}\t{br}')


def deinflect_reaches(args, name, words, lemmas_wanted):
    """Whether the set's rules give each word's lemma (any processor variant)."""
    pre = subprocess.run([CLI, '--languages', pack_dir(args, name), 'preprocess', 'sga', '--stdin'], input='\n'.join(words) + '\n',
                         capture_output=True, text=True, check=True)
    variants = {json.loads(l)['input']: [v['text'] for v in json.loads(l)['variants']] for l in pre.stdout.splitlines()}
    texts = sorted({t for v in variants.values() for t in v})
    if name == 'norules':
        outs = {t: [t] for t in texts}
    else:
        de = subprocess.run([CLI, '--languages', pack_dir(args, name), 'deinflect', 'sga', '--stdin'], input='\n'.join(texts) + '\n',
                            capture_output=True, text=True, check=True)
        outs = {json.loads(l)['input']: [r['text'] for r in json.loads(l)['results']] for l in de.stdout.splitlines()}
    return {w: any(norm(x) == norm(lemmas_wanted[w]) for t in variants[w] for x in outs[t]) for w in words}


def frequent(args):
    """Each Old Irish word form of the Würzburg glosses, ranked by its count
    there, with its most frequent gold lemma. A rule reaches the lemma when
    the deinflections give it; the whole word is looked up as a host does."""
    _rows, lemmas, refs = load_dictionary(args.cache)
    lemma_norm = {norm(l) for l in lemmas}
    with open(os.path.join(args.cache, 'wurzburg', 'glosses.json'), encoding='utf-8') as f:
        data = json.load(f)
    counts = collections.Counter()
    lemma_of = collections.defaultdict(collections.Counter)
    for epistle in data:
        for folio in epistle['folios']:
            for gloss in folio['glosses']:
                for form, pos, lemma, _ in gloss['glossTokens']:
                    if pos in GOLD_SKIP or not lemma:
                        continue
                    w = unicodedata.normalize('NFC', form.lower())
                    counts[w] += 1
                    lemma_of[w][lemma] += 1
    ranked = [w for w, _ in counts.most_common(10000)]
    lemma = {w: lemma_of[w].most_common(1)[0][0] for w in ranked}
    tokens = sum(counts[w] for w in ranked)
    summary = {'words': len(ranked), 'tokens': tokens}
    for name in SETS:
        reach = deinflect_reaches(args, name, ranked, lemma) if name != 'norules' else None
        results = batch(args, name, ranked, 'frequent')
        st = collections.Counter()
        wrong = []
        for w, r in zip(ranked, results):
            if norm(lemma[w]) not in lemma_norm:
                continue
            reached = (reach[w] if reach else False) or any(norm(x) == norm(lemma[w]) for x in refs.get(w, set()) | refs.get(strip_marks(w), set()))
            if not reached and norm(w) != norm(lemma[w]):
                continue
            st['words'] += 1
            st['tokens'] += counts[w]
            first = r['results'][0]['expression'] if r['results'] else None
            if first is None or norm(first) != norm(lemma[w]):
                st['wrong or nothing first'] += 1
                st['wrong or nothing first, tokens'] += counts[w]
                if first is not None:
                    st['wrong first'] += 1
                    st['wrong first, tokens'] += counts[w]
                    wrong.append((counts[w], w, lemma[w], first))
        wrong.sort(reverse=True)
        summary[name] = {**st, 'most frequent wrong': wrong[:15]}
        print(name, json.dumps(summary[name], ensure_ascii=False))
    with open(os.path.join(args.work, 'frequent.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)


def contexts(args):
    """First results at the token right after an article (in, ind, int, inna,
    na, a, an: DET in the gold) or a conjunct particle (PART), against the
    gold lemma, for every set."""
    _rows, lemmas, _refs = load_dictionary(args.cache)
    lemma_norm = {norm(l) for l in lemmas}
    gold = gold_hovers(args.cache)
    summary = {}
    for name in SETS:
        path = os.path.join(args.work, 'lookups', f'gold-{name}.jsonl')
        with open(path, encoding='utf-8') as f:
            results = [json.loads(l) for l in f]
        st = collections.defaultdict(collections.Counter)
        for g, r in zip(gold, results):
            prev_pos = g[6]
            kind = {'DET': 'after an article', 'PART': 'after a particle', 'ADP': 'after a preposition'}.get(prev_pos)
            if kind is None or norm(g[3]) not in lemma_norm:
                continue
            first = r['results'][0]['expression'] if r['results'] else None
            st[kind]['positions'] += 1
            st[kind]['right first' if first and norm(first) == norm(g[3]) else ('nothing' if first is None else 'wrong first')] += 1
        summary[name] = {k: dict(v) for k, v in st.items()}
        print(name, json.dumps(summary[name], ensure_ascii=False))
    with open(os.path.join(args.work, 'contexts.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)


def judge(args):
    """The readings judged by hand in sources/judged-tain.tsv. Run `text`
    first. Sets: `replaced` (every first result a rule puts in place of the
    dictionary's own, by reading), `top` (the 70 most frequent readings where
    the dictionary alone has nothing), `sample` (100 lookups drawn with seed
    20261103 from the other lookups of that class, by position, so that a
    reading is drawn as often as it occurs), `lenited` (every first result
    the union reaches through Yomitan's lenited). For `replaced`, the column
    after the dictionary's first result says whether a form-of row of the
    text also names the rules' first result: then both are terms the
    dictionary names, and their order is discovery order (the framework's
    tie, README Known gaps)."""
    import random
    rules = rule_ids()
    _rows, _lemmas, refs = load_dictionary(args.cache)
    macron = str.maketrans('āēīōūǣĀĒĪŌŪǢ', 'áéíóúǽÁÉÍÓÚǼ')
    def named(first):
        w = first['matched']
        forms = {w, w.lower(), w.translate(macron), w.lower().translate(macron)}
        forms |= {strip_marks(x) for x in forms}
        return first['expression'] in set().union(*[refs.get(x, set()) for x in forms])
    tain = [h for line in tain_text(args.cache).split('\n') if line.strip() for h in hovers(line)]
    base = first_results(args, 'norules', [h for _, h in tain], 'tain')
    classes = tain_classes(args, 'final', tain, rules, base)
    def key(first):
        return (first['matched'].lower(), first['expression'])
    def row(kind, i, count, first, alone, context):
        tie = ('yes' if named(first) else 'no') if kind == 'replaced' else ''
        return '\t'.join([kind, str(i), str(count), first['matched'], first['expression'], '|'.join(first['trace']),
                          alone['expression'] if alone else '', tie, context[:70]])
    replaced, nothing = collections.Counter(), collections.Counter()
    seen = {}
    positions = []
    for (_w, h), (c, first, alone) in zip(tain, classes):
        if c.startswith('a rule, replaces'):
            replaced[key(first)] += 1
            seen.setdefault(key(first), (first, alone, h))
        elif c.startswith('a rule, the dictionary alone has nothing'):
            nothing[key(first)] += 1
            seen.setdefault(key(first), (first, alone, h))
            positions.append(key(first))
    print(f'# replaced: {sum(replaced.values())} lookups, {len(replaced)} readings')
    for i, k in enumerate(sorted(replaced, key=lambda k: (-replaced[k], k)), 1):
        print(row('replaced', i, replaced[k], *seen[k]))
    top = sorted(nothing, key=lambda k: (-nothing[k], k))[:70]
    print(f'# nothing: {sum(nothing.values())} lookups, {len(nothing)} readings; top 70 cover {sum(nothing[k] for k in top)}')
    for i, k in enumerate(top, 1):
        print(row('top', i, nothing[k], *seen[k]))
    rest = [k for k in positions if k not in set(top)]
    random.seed(20261103)
    drawn = collections.Counter(random.sample(rest, min(100, len(rest))))
    print(f'# sample: 100 of the other {len(rest)} lookups, {len(drawn)} readings')
    for i, k in enumerate(sorted(drawn, key=lambda k: (-drawn[k], k)), 1):
        print(row('sample', i, drawn[k], *seen[k]))
    # The union through lenited.
    union = tain_classes(args, 'union', tain, rules, base)
    lenited, lseen = collections.Counter(), {}
    for (_w, h), (c, first, alone) in zip(tain, union):
        if first is not None and 'lenited' in first['trace']:
            lenited[key(first)] += 1
            lseen.setdefault(key(first), (first, alone, h))
    print(f'# lenited: {sum(lenited.values())} lookups, {len(lenited)} readings')
    for i, k in enumerate(sorted(lenited, key=lambda k: (-lenited[k], k)), 1):
        print(row('lenited', i, lenited[k], *lseen[k]))


def tally(args):
    """Counts of sources/judged-tain.tsv: per set, readings and lookups by
    verdict; for `replaced`, also by form-of tie and against the verdict of
    the dictionary's own first result."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'judged-tain.tsv')
    readings, lookups = collections.Counter(), collections.Counter()
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('#'):
                continue
            kind, _i, n, _w, _first, _trace, verdict, _reason, _alone, alone_verdict, tie = line.rstrip('\n').split('\t')[:11]
            keys = [(kind, verdict)]
            if kind == 'replaced':
                keys += [(f'{kind}, form-of tie {tie}', verdict), (f'{kind}, dictionary alone {alone_verdict}', verdict)]
            for key in keys:
                readings[key] += 1
                lookups[key] += int(n)
    for kind in sorted({k for k, _ in readings}):
        out = {v: [readings[(kind, v)], lookups[(kind, v)]] for v in ('right', 'wrong', 'unsure')}
        print(kind, json.dumps({'readings': sum(r for r, _ in out.values()), 'lookups': sum(x for _, x in out.values()),
                                '[readings, lookups] by verdict': out}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['scratch', 'eval', 'text', 'perrule', 'frequent', 'contexts', 'judge', 'tally'])
    parser.add_argument('--cache', required=True)
    parser.add_argument('--work', required=True)
    args = parser.parse_args()
    check_inputs(args.cache)
    unzip_dictionary(args.cache)
    {'scratch': scratch, 'eval': evaluate, 'text': text, 'perrule': perrule, 'frequent': frequent, 'contexts': contexts, 'judge': judge, 'tally': tally}[args.command](args)


if __name__ == '__main__':
    main()
