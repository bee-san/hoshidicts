#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements for the Albanian pack (README, Measurements). Run from the
repository root with a built hoshidicts-cli:

  python3 languages/sq/sources/measure.py yomitan <wty-sq-en.zip> <sq_50k.txt> <unimorph sqi>
      Applies Yomitan's rules (sources/yomitan.json, each rule alone) to the
      word list and lists the readings the final rules (transforms.json) lack:
      a deinflected text with a row that has definitions and passes the
      part-of-speech filter, which no final deinflection of the word gives.

  python3 languages/sq/sources/measure.py frequent <wty-sq-en.zip> <imported dir> <sq_50k.txt> <unimorph sqi> [N]
      The N (default 10,000) most frequent words: those whose lemma a rule
      reaches (a form-of row of the word, or UniMorph sqi, names a lemma that a deinflection of
      the word gives with a compatible part of speech), each looked up alone
      as a host does (build/lookup-batch, from languages/en/sources); the
      first result is right when the word's form-of rows name it, or it is
      the word itself, which has definitions of its own (a homograph).

  python3 languages/sq/sources/measure.py real <wty-sq-en.zip> <imported dir> <unimorph sqi> <out dir> <text>...
      Every word of the texts (runs of letters; an apostrophe or hyphen ends a
      word, as in a lookup) is looked up with the text from it to the end of
      its sentence. The first result is right by script when the matched
      text's own rows name it (a form-of row, or UniMorph sqi), or it is the
      matched text itself with definitions; wrong by script when the
      matched text has rows that name other lemmas and the result comes from
      the rules; the rest are written to <out dir>/unjudged.tsv, from which a
      random sample is judged by hand.

The dictionary is wty-sq-en as published (term banks read from the zip). The
word list of `yomitan` is the 50,000 words of the frequency list, the
single-word forms of UniMorph sqi and the single-word form-of rows of the
dictionary.
"""
import collections
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.getcwd()
CLI = os.environ.get('HOSHIDICTS_CLI', os.path.join(ROOT, 'build', 'hoshidicts-cli'))
PACK = os.path.join(ROOT, 'languages', 'sq')
WORD = re.compile(r"^[a-zçë]+$")


def is_ref(d):
    return isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0] != '' and isinstance(d[1], list)


def load_dictionary(path):
    """headword -> set of POS tags of its rows with definitions; form -> [(lemma, tags)] of its form-of rows."""
    lemmas = collections.defaultdict(set)
    forms = collections.defaultdict(list)
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.startswith('term_bank_'):
                continue
            for row in json.loads(z.read(name)):
                tags = set(row[3].split())
                refs = [d for d in row[5] if is_ref(d)]
                if refs:
                    for d in refs:
                        forms[row[0]].append((d[0], tags))
                else:
                    lemmas[row[0]] |= tags or {''}
    return lemmas, forms


def conditions_of(transforms_file):
    """condition name -> set of leaf names it stands for."""
    data = json.load(open(transforms_file, encoding='utf-8'))
    conds = data['conditions']
    def leaves(name):
        sub = conds[name].get('subConditions')
        return {name} if not sub else set().union(*(leaves(s) for s in sub))
    return {name: leaves(name) for name in conds}, {n for n, c in conds.items() if c.get('isDictionaryForm')}


def passes(conditions, tags, leaves, dictionary_forms):
    """The part-of-speech filter (docs/languages.md 7.2, 9.4)."""
    if not conditions:
        return True
    have = set().union(*(leaves[c] for c in conditions))
    want = set()
    for t in tags:
        if t in dictionary_forms:
            want |= leaves[t]
    return bool(have & want)


def deinflect(words, transforms=None):
    cmd = [CLI, '--languages', os.path.join(ROOT, 'languages'), 'deinflect', 'sq', '--stdin', '--all-options']
    if transforms:
        cmd += ['--transforms', transforms]
    out = subprocess.run(cmd, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    return {d['input']: d['results'] for d in map(json.loads, out.splitlines())}


def word_list(freq, unimorph, forms):
    words = set()
    for line in open(freq, encoding='utf-8'):
        w = line.split(' ')[0].strip().lower()
        if WORD.match(w):
            words.add(w)
    for line in open(unimorph, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) == 3 and WORD.match(parts[1]):
            words.add(parts[1])
    words |= {f for f in forms if WORD.match(f)}
    return sorted(words)


def cmd_yomitan(dictionary, freq, unimorph):
    lemmas, forms = load_dictionary(dictionary)
    words = word_list(freq, unimorph, forms)
    yomitan_file = os.path.join(PACK, 'sources', 'yomitan.json')
    final_file = os.path.join(PACK, 'transforms.json')
    leaves_y, dict_y = conditions_of(yomitan_file)
    leaves_f, dict_f = conditions_of(final_file)
    # Each Yomitan rule as a transform of its own, so a trace names the rule.
    data = json.load(open(yomitan_file, encoding='utf-8'))
    split = {'schema': 1, 'conditions': data['conditions'], 'transforms': []}
    label = {}
    for t in data['transforms']:
        for i, rule in enumerate(t['rules']):
            rid = f"{t['id']}#{i}"
            label[rid] = f"{t['id']} [{i}] {rule.get('inflected')} → {rule.get('deinflected')}"
            split['transforms'].append({'id': rid, 'name': rid, 'description': '', 'source': 'yomitan', 'rules': [rule]})
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(split, f, ensure_ascii=False)
        split_file = f.name
    ours = deinflect(words)
    theirs = deinflect(words, split_file)
    os.unlink(split_file)
    stats = collections.defaultdict(lambda: {'readings': 0, 'lost': [], 'false': 0})
    for w in words:
        final = ours.get(w, [])
        for r in theirs.get(w, []):
            if not r['trace'] or r['text'] == w or r['text'] not in lemmas:
                continue
            if not passes(r['conditions'], lemmas[r['text']], leaves_y, dict_y):
                continue
            kept = any(o['text'] == r['text'] and passes(o['conditions'], lemmas[o['text']], leaves_f, dict_f) for o in final)
            # Attribute the reading to every rule of its trace.
            for rid in set(r['trace']):
                s = stats[rid]
                s['readings'] += 1
                if not kept:
                    s['lost'].append(f"{w} → {r['text']}")
    print(f'{len(words)} words; {len(stats)} of {len(label)} Yomitan rules give a reading')
    total_lost = set()
    for rid in label:
        s = stats.get(rid)
        if s is None:
            continue
        lost = sorted(set(s['lost']))
        total_lost |= set(lost)
        print(f"{label[rid]}: {s['readings']} readings, {len(lost)} the final rules lack" + (f": {', '.join(lost[:25])}" if lost else ''))
    print(f'readings the final rules lack: {len(total_lost)}')


def lookup_batch(texts, dictionary_dir):
    tool = os.environ.get('LOOKUP_BATCH', os.path.join(ROOT, 'build', 'lookup-batch'))
    out = subprocess.run([tool, os.path.join(ROOT, 'languages'), 'sq', dictionary_dir], input='\n'.join(texts) + '\n',
                         capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def read_frequency(path, n):
    words = []
    for line in open(path, encoding='utf-8'):
        w, c = line.rsplit(' ', 1)
        w = w.strip().lower()
        if WORD.match(w):
            words.append((w, int(c)))
        if len(words) >= n:
            break
    return words


def unimorph_lemmas(path):
    named = collections.defaultdict(set)
    for line in open(path, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) == 3 and parts[1] != parts[0]:
            named[parts[1]].add(parts[0])
    return named


def cmd_frequent(dictionary, imported, freq, unimorph, n='10000'):
    lemmas, forms = load_dictionary(dictionary)
    um = unimorph_lemmas(unimorph)
    leaves, dict_forms = conditions_of(os.path.join(PACK, 'transforms.json'))
    words = read_frequency(freq, int(n))
    total_tokens = sum(c for _, c in words)
    ours = deinflect([w for w, _ in words])
    reached = []
    for w, c in words:
        named = {lemma for lemma, tags in forms.get(w, []) if lemma != w} | um.get(w, set())
        hit = {r['text'] for r in ours.get(w, []) if r['trace'] and r['text'] in named and r['text'] in lemmas
               and passes(r['conditions'], lemmas[r['text']], leaves, dict_forms)}
        if hit:
            reached.append((w, c, named))
    results = lookup_batch([w for w, _, _ in reached], imported)
    wrong = []
    for (w, c, named), res in zip(reached, results):
        first = res['results'][0] if res['results'] else None
        if first is None:
            wrong.append((w, c, None, None))
            continue
        e = first['expression']
        if e in named or (e == w and w in lemmas):
            continue
        wrong.append((w, c, e, first['trace']))
    tokens_reached = sum(c for _, c, _ in reached)
    tokens_wrong = sum(c for _, c, _, _ in wrong)
    print(f'{len(words)} words ({total_tokens} tokens); a rule reaches the lemma of {len(reached)} ({100*tokens_reached/total_tokens:.1f}% of the tokens)')
    print(f'first result wrong for {len(wrong)} of them, {tokens_wrong} tokens ({100*tokens_wrong/total_tokens:.2f}% of the list)')
    for w, c, e, trace in sorted(wrong, key=lambda x: -x[1]):
        print(f'  {w} ({c}) -> {e} {trace}  [named: {", ".join(sorted({l for l, _ in forms.get(w, [])} | um.get(w, set())))}]')
    # Words no form-of row or UniMorph row names a lemma for, whose first result
    # comes from the pack's rules (a trace of transform ids): judged by hand.
    ids = {t['id'] for t in json.load(open(os.path.join(PACK, 'transforms.json'), encoding='utf-8'))['transforms']}
    reached_words = {w for w, _, _ in reached}
    rest = [(w, c) for w, c in words if w not in reached_words and not forms.get(w) and w not in um]
    res = lookup_batch([w for w, _ in rest], imported)
    by_rule = [(w, c, r['results'][0]) for (w, c), r in zip(rest, res) if r['results'] and r['results'][0]['trace'] and set(r['results'][0]['trace']) <= ids]
    print(f'{len(rest)} words have no form-of or UniMorph row; for {len(by_rule)} the first result comes through the rules ({sum(c for _, c, _ in by_rule)} tokens):')
    for w, c, first in by_rule:
        print(f'  {w} ({c}) -> {first["expression"]} {first["trace"]}')


SENTENCE_END = re.compile(r'(?<=[.!?…])["”’»)]*\s+')
WORD_RUN = re.compile(r"[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u0300-\u036F]+")


def hovers_of(paths):
    hovers = []
    for path in paths:
        for paragraph in open(path, encoding='utf-8').read().split('\n'):
            paragraph = ' '.join(paragraph.split())
            if not paragraph or paragraph.startswith('='):
                continue
            for sentence in SENTENCE_END.split(paragraph):
                for m in WORD_RUN.finditer(sentence):
                    hovers.append((m.group(0), sentence[m.start():]))
    return hovers


def cmd_real(dictionary, imported, unimorph, out_dir, *texts):
    lemmas, forms = load_dictionary(dictionary)
    um = unimorph_lemmas(unimorph)
    ids = {t['id'] for t in json.load(open(os.path.join(PACK, 'transforms.json'), encoding='utf-8'))['transforms']}
    hovers = hovers_of(texts)
    results = lookup_batch([h for _, h in hovers], imported)
    counts = collections.Counter()
    wrong_rules = collections.Counter()
    wrong = []
    unjudged = []
    for (word, text), res in zip(hovers, results):
        if not res['results']:
            counts['nothing'] += 1
            continue
        first = res['results'][0]
        matched = first['matched'].lower()
        e = first['expression']
        named = {l for l, _ in forms.get(matched, [])} | {l for l, _ in forms.get(first['matched'], [])} | um.get(matched, set())
        own_trace = first['trace'] and set(first['trace']) <= ids
        if e in named or (e.lower() == matched and (e in lemmas or e.lower() in lemmas)):
            counts['right'] += 1
        elif named and own_trace:
            counts['wrong'] += 1
            wrong_rules[' '.join(first['trace'])] += 1
            wrong.append((word, first['matched'], e, ' '.join(first['trace'])))
        else:
            counts['unjudged'] += 1
            unjudged.append((word, first['matched'], e, ' '.join(first['trace']) if first['trace'] else '-', text[:80]))
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'unjudged.tsv'), 'w', encoding='utf-8') as f:
        f.write('# word\tmatched\tfirst result\ttrace\ttext\n' + ''.join('\t'.join(u) + '\n' for u in unjudged))
    with open(os.path.join(out_dir, 'wrong.tsv'), 'w', encoding='utf-8') as f:
        f.write('# word\tmatched\tfirst result\ttrace\n' + ''.join('\t'.join(w) + '\n' for w in wrong))
    total = len(hovers)
    print(f'{total} lookups: {counts["right"]} right by script, {counts["wrong"]} wrong by script, {counts["unjudged"]} to judge, {counts["nothing"]} with no result')
    for trace, n in wrong_rules.most_common(15):
        print(f'  wrong via {trace}: {n}')


def main(argv):
    if len(argv) >= 1 and argv[0] == 'yomitan' and len(argv) == 4:
        cmd_yomitan(*argv[1:])
    elif len(argv) >= 6 and argv[0] == 'real':
        cmd_real(*argv[1:])
    elif len(argv) >= 1 and argv[0] == 'frequent' and len(argv) in (5, 6):
        cmd_frequent(*argv[1:])
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
