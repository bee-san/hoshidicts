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
      the word itself, which has definitions of its own. When the rows name
      two lemmas or more (a homograph: dita, day or I knew), either passes,
      so those words are listed apart for judging by hand, and so are the
      words whose first result is the word itself while their rows name
      another lemma (ka: the preposition, or has). Two more classes are
      listed for judging by hand: words whose rows name a lemma no rule
      reaches (mostly function words), and words without rows whose first
      result comes through a rule and then a dictionary row.

  python3 languages/sq/sources/measure.py real <wty-sq-en.zip> <imported dir> <unimorph sqi> <out dir> <text>...
      Every word of the texts (runs of letters; an apostrophe or hyphen ends a
      word, as in a lookup) is looked up with the text from it to the end of
      its sentence. The first result is right by script when the matched
      text's own rows name it (a form-of row, or UniMorph sqi), or it is the
      matched text itself with definitions; wrong by script when the
      matched text has rows that name other lemmas and the result comes from
      the rules; a homograph when the rows name it and another lemma, so the
      script cannot tell (<out dir>/homographs.tsv, grouped by word and first
      result, judged by hand); the matched text itself, a headword of its own,
      while its rows name another lemma (<out dir>/itself.tsv, grouped, judged
      by hand: ka, the preposition, or has); the rest are written to <out dir>/unjudged.tsv,
      from which a random sample is judged by hand. Apart from those counts,
      <out dir>/capitalized.tsv lists the capitalized words whose first result
      is a capitalized headword (a name: no processor step reaches it before
      the text as written) while the same text with a lower-case first letter
      shows another lemma first (Drita, light or the name), grouped for
      judging by hand.

  python3 languages/sq/sources/measure.py phrases <wty-sq-en.zip> <imported dir> <unimorph sqi> <sqi_sentences.tsv.bz2>
      Every place in Tatoeba's Albanian sentences where an article, particle,
      auxiliary or pronoun is followed by a word: looked up from that word
      (as a hover there does), the first result is a phrase reading when it
      matches more than the word itself; the phrase reading is right when
      the following word's own rows name its lemma, or the phrase's own rows
      name it, or (except after ç', which also stands inside words: ç'farë)
      it is the following word itself; the rest are listed for judging by
      hand.

  python3 languages/sq/sources/measure.py traces <sample.tsv>
      For the rows of corpus.tsv and gaps.tsv that the rules reach, the trace
      a lookup shows (the deinflection with the fewest steps, the first among
      equals) is compared with the row's UniMorph features: a verb's trace
      must name its tense or mood and person (V;3;SG;IND;PST: aor-3sg), a
      noun's its case and definiteness (N;ACC;SG;DEF: n-def-acc-m or -f).

  python3 languages/sq/sources/measure.py order <imported dir> <sq_50k.txt> <text>...
      The lookups of `real` and the 10,000 most frequent words alone, with
      transforms.json as written (nouns, verbs, adjectives) and with two
      other orders: the adjective transforms before the verbs (after vn, the
      order before audit-hachi-lang-sq), and the noun transforms (n-*) after
      the verbs; and with traceSelection first instead of shortest. Every
      lookup whose first result differs, with its count, for judging by hand,
      then those whose first result keeps its lemma and changes its trace.

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
    provenance = {}
    for line in open(os.path.join(PACK, 'sources', 'yomitan-provenance.tsv'), encoding='utf-8'):
        if not line.startswith('#'):
            cells = line.rstrip('\n').split('\t')
            provenance[f'{cells[0]}#{cells[1]}'] = cells[4]
    table = ['# Each Yomitan rule left out of transforms.json, applied alone to the words of `measure.py yomitan`: the words for which it gives a headword with a compatible part of speech, how many of those no final deinflection gives, examples, and the own rules that make its deinflection (sources/yomitan-provenance.tsv). Written by sources/measure.py yomitan.',
             '# transform\trule\tinflected\tdeinflected\treadings\tfinal rules lack\texamples\town rules']
    for rid in label:
        s = stats.get(rid, {'readings': 0, 'lost': []})
        lost = sorted(set(s['lost']))
        total_lost |= set(lost)
        print(f"{label[rid]}: {s['readings']} readings, {len(lost)} the final rules lack" + (f": {', '.join(lost[:25])}" if lost else ''))
        tid, index = rid.split('#')
        rule = next(t for t in data['transforms'] if t['id'] == tid)['rules'][int(index)]
        table.append('\t'.join([tid, index, rule.get('inflected', ''), rule.get('deinflected', ''), str(s['readings']), str(len(lost)),
                                ', '.join(lost[:8]) or '-', provenance.get(rid, '(none)')]))
    print(f'readings the final rules lack: {len(total_lost)}')
    print('\n'.join(table))


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
    homographs = []
    itself = []
    for (w, c, named), res in zip(reached, results):
        first = res['results'][0] if res['results'] else None
        if first is None:
            wrong.append((w, c, None, None))
            continue
        e = first['expression']
        if e in named and len(named) >= 2 and e != w:
            homographs.append((w, c, e, first['trace'], sorted(named - {e})))
            continue
        if e in named:
            continue
        if e == w and w in lemmas:
            itself.append((w, c, sorted(named)))
            continue
        wrong.append((w, c, e, first['trace']))
    tokens_reached = sum(c for _, c, _ in reached)
    tokens_wrong = sum(c for _, c, _, _ in wrong)
    print(f'{len(words)} words ({total_tokens} tokens); a rule reaches the lemma of {len(reached)} ({100*tokens_reached/total_tokens:.1f}% of the tokens)')
    print(f'first result wrong for {len(wrong)} of them, {tokens_wrong} tokens ({100*tokens_wrong/total_tokens:.2f}% of the list)')
    for w, c, e, trace in sorted(wrong, key=lambda x: -x[1]):
        print(f'  {w} ({c}) -> {e} {trace}  [named: {", ".join(sorted({l for l, _ in forms.get(w, [])} | um.get(w, set())))}]')
    print(f'{len(homographs)} of them are homographs, whose rows name two lemmas or more ({sum(h[1] for h in homographs)} tokens): '
          'the first result is one of those lemmas, judged by hand:')
    for w, c, e, trace, others in homographs:
        print(f'  {w} ({c}) -> {e} {trace}  [also: {", ".join(others)}]')
    print(f'{len(itself)} of them show the word itself, a headword of its own, while their rows name another lemma '
          f'({sum(x[1] for x in itself)} tokens), judged by hand:')
    for w, c, named in itself:
        print(f'  {w} ({c}) -> {w}  [rows name: {", ".join(named)}]')
    # Words whose rows name a lemma that no rule reaches: the lookup follows
    # the rows (or shows the word itself).
    reached_set = {x[0] for x in reached}
    unreached = [(w, c) for w, c in words if w not in reached_set and (forms.get(w) or w in um)]
    res = lookup_batch([w for w, _ in unreached], imported)
    print(f'{len(unreached)} words have rows that name a lemma no rule reaches ({sum(c for _, c in unreached)} tokens), judged by hand:')
    for (w, c), r in zip(unreached, res):
        f = r['results'][0] if r['results'] else None
        named = sorted({l for l, _ in forms.get(w, [])} | um.get(w, set()))
        print(f'  {w} ({c}) -> {f["expression"] if f else None} {f["trace"] if f else ""}  [rows name: {", ".join(named)}]')
    # Words no form-of row or UniMorph row names a lemma for, whose first result
    # comes from the pack's rules (a trace of transform ids): judged by hand.
    ids = {t['id'] for t in json.load(open(os.path.join(PACK, 'transforms.json'), encoding='utf-8'))['transforms']}
    reached_words = {w for w, _, _ in reached}
    rest = [(w, c) for w, c in words if w not in reached_words and not forms.get(w) and w not in um]
    res = lookup_batch([w for w, _ in rest], imported)
    by_rule = [(w, c, r['results'][0]) for (w, c), r in zip(rest, res) if r['results'] and r['results'][0]['trace'] and set(r['results'][0]['trace']) <= ids]
    mixed = [(w, c, r['results'][0]) for (w, c), r in zip(rest, res) if r['results'] and set(r['results'][0]['trace']) & ids
             and not set(r['results'][0]['trace']) <= ids]
    print(f'{len(rest)} words have no form-of or UniMorph row; for {len(by_rule)} the first result comes through the rules ({sum(c for _, c, _ in by_rule)} tokens):')
    for w, c, first in by_rule:
        print(f'  {w} ({c}) -> {first["expression"]} {first["trace"]}')
    print(f'for {len(mixed)} of them the first result comes through a rule and then a dictionary row ({sum(c for _, c, _ in mixed)} tokens), judged by hand:')
    for w, c, first in mixed:
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
    homographs = collections.Counter()
    homograph_text = {}
    itself = collections.Counter()
    itself_text = {}
    for (word, text), res in zip(hovers, results):
        if not res['results']:
            counts['nothing'] += 1
            continue
        first = res['results'][0]
        matched = first['matched'].lower()
        e = first['expression']
        named = {l for l, _ in forms.get(matched, [])} | {l for l, _ in forms.get(first['matched'], [])} | um.get(matched, set())
        own_trace = first['trace'] and set(first['trace']) <= ids
        if e in named and len(named) >= 2 and e.lower() != matched:
            counts['homograph'] += 1
            key = (matched, e, ', '.join(sorted(named - {e})))
            homographs[key] += 1
            homograph_text.setdefault(key, text[:80])
        elif e not in named and named and e.lower() == matched and (e in lemmas or e.lower() in lemmas):
            counts['itself'] += 1
            key = (matched, e, ', '.join(sorted(named)))
            itself[key] += 1
            itself_text.setdefault(key, text[:80])
        elif e in named or (e.lower() == matched and (e in lemmas or e.lower() in lemmas)):
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
    with open(os.path.join(out_dir, 'itself.tsv'), 'w', encoding='utf-8') as f:
        f.write('# lookups\tmatched\tfirst result (the matched text itself)\tlemmas its rows name\ttext\n')
        for key, n in itself.most_common():
            f.write(f'{n}\t' + '\t'.join(key) + f'\t{itself_text[key]}\n')
    with open(os.path.join(out_dir, 'homographs.tsv'), 'w', encoding='utf-8') as f:
        f.write('# lookups\tmatched\tfirst result\tother lemmas the rows name\ttext\n')
        for key, n in homographs.most_common():
            f.write(f'{n}\t' + '\t'.join(key) + f'\t{homograph_text[key]}\n')
    capital = [(word, text, res['results'][0]) for (word, text), res in zip(hovers, results)
               if res['results'] and res['results'][0]['matched'][:1].isupper() and res['results'][0]['expression'][:1].isupper()]
    lowered = lookup_batch([text[:1].lower() + text[1:] for _, text, _ in capital], imported)
    groups = collections.Counter()
    for (word, text, first), low in zip(capital, lowered):
        other = low['results'][0]['expression'] if low['results'] else None
        if other and other.lower() != first['expression'].lower():
            groups[(first['matched'], first['expression'], other)] += 1
    with open(os.path.join(out_dir, 'capitalized.tsv'), 'w', encoding='utf-8') as f:
        f.write('# lookups\tmatched\tfirst result as written\tfirst result in lower case\n')
        for key, n in groups.most_common():
            f.write(f'{n}\t' + '\t'.join(key) + '\n')
    total = len(hovers)
    print(f'capitalized words shown as written while the lower-case word reads as another lemma: {sum(groups.values())} lookups ({len(groups)} groups)')
    # Participle adjectives in -ura, -uara traced as an aorist of the pack and
    # then a participle row (e bashkuara: aorist (1sg) + participle).
    aor_ptcp = collections.Counter()
    for res in results:
        t = res['results'][0]['trace'] if res['results'] else []
        if t and t[0].startswith('aor-') and any('participle' in x for x in t[1:]):
            aor_ptcp[res['results'][0]['matched'].lower()] += 1
    print(f'first results traced as an aorist and then a participle row: {sum(aor_ptcp.values())} lookups ({len(aor_ptcp)} words; '
          + ', '.join(f'{w} {n}' for w, n in aor_ptcp.most_common(5)) + ')')
    print(f'{total} lookups: {counts["right"]} right by script, {counts["wrong"]} wrong by script, {counts["homograph"]} homographs '
          f'({len(homographs)} groups), {counts["itself"]} the matched text itself while its rows name another lemma '
          f'({len(itself)} groups) and {counts["unjudged"]} others to judge, {counts["nothing"]} with no result')
    for trace, n in wrong_rules.most_common(15):
        print(f'  wrong via {trace}: {n}')


FRONT = ['i', 'e', 'të', 'së', 'më', 'do', 'u', 'duke', 'pa', 'për', 'kam', 'ke', 'ka', 'kemi', 'keni', 'kanë',
         'kisha', 'kishte', 'kishin', 'jam', 'je', 'është', 'jemi', 'jeni', 'janë', 'ishte', 'ishin', 'ta', 'ma', 'ia',
         'na', 'ju', 'nuk', 'mos', "s'", "ç'"]


def cmd_phrases(dictionary, imported, unimorph, sentences):
    import bz2
    lemmas, forms = load_dictionary(dictionary)
    um = unimorph_lemmas(unimorph)
    ids = {t['id'] for t in json.load(open(os.path.join(PACK, 'transforms.json'), encoding='utf-8'))['transforms']}
    texts = []
    for line in bz2.open(sentences, 'rt', encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) < 3:
            continue
        sentence = parts[2].replace('’', "'")
        tokens = list(re.finditer(r"[A-Za-zÀ-ÖØ-öø-ɏ]+'?", sentence))
        for k, m in enumerate(tokens[:-1]):
            front = m.group(0).lower()
            if front in FRONT:
                texts.append((front, tokens[k + 1].group(0).rstrip("'"), sentence[m.start():]))
    results = lookup_batch([t for _, _, t in texts], imported)
    per = collections.defaultdict(collections.Counter)
    unjudged = []
    for (front, nxt, text), res in zip(texts, results):
        c = per[front]
        c['places'] += 1
        if not res['results']:
            c['nothing'] += 1
            continue
        first = res['results'][0]
        if len(first['matched']) <= len(front) + 1:
            c['word'] += 1
            continue
        c['phrase'] += 1
        e = first['expression']
        named = {l for l, _ in forms.get(nxt.lower(), [])} | um.get(nxt.lower(), set()) | {l for l, _ in forms.get(first['matched'].lower(), [])}
        # The following word itself is right after s' (s'kam → kam) but not
        # after ç', which also stands inside words (ç'farë is çfarë, not farë).
        if e in named or (e.lower() == nxt.lower() and front != "ç'"):
            c['right'] += 1
        else:
            unjudged.append((front, first['matched'], e, ' '.join(first['trace'])))
    total = collections.Counter()
    for front in FRONT:
        if per[front]['places']:
            c = per[front]
            total.update(c)
            print(f"{front}: {c['places']} places, first result a phrase reading at {c['phrase']} ({c['right']} right by script), the word itself at {c['word']}, nothing at {c['nothing']}")
    print(f"all: {total['places']} places, phrase readings {total['phrase']}, right by script {total['right']}, to judge {len(unjudged)}")
    for u in unjudged:
        print('  ' + ' | '.join(u))


def expected_ids(tags):
    """Transform ids that name the UniMorph features of a row, or None when no rule should be named.
    UniMorph sqi writes the past anterior (pata punuar) IND;PRF;PST, the
    pluperfect subjunctive (të kisha punuar) SBJV;PRF;PST, and PRF;PRF for
    PRF;PST in the second person plural; mediopassive verbs' forms carry the
    tags of the active ones."""
    t = tags.split(';')
    pos = t[0]
    person = next((f'{p}{n.lower()}' for p in '123' for n in ('SG', 'PL') if p in t and n in t), None)
    if pos == 'N':
        sg, defn = 'SG' in t, 'DEF' in t
        case = next(c for c in ('NOM', 'ACC', 'GEN', 'DAT', 'ABL') if c in t)
        if sg and defn:
            return {'NOM': {'n-def-sg-m', 'n-def-nom-f'}, 'ACC': {'n-def-acc-m', 'n-def-acc-f'}}.get(case, {'n-def-obl-m', 'n-def-obl-f'})
        if sg:
            return {'n-def-sg-m', 'n-indef-obl-f'}
        if case in ('NOM', 'ACC'):
            return {'n-def-pl'} if defn else {'n-pl'}
        if case == 'ABL' and not defn:
            return {'n-abl-pl'}
        return {'n-obl-pl'}
    if 'V.PTCP' in t:
        return {'ptcp', 'ger'}
    if 'NFIN' in t:
        return {'inf'}
    if 'IMP' in t:
        return {'imp-2sg', 'cl-e', 'np-imp-2sg'} if person == '2sg' else {'pres-2pl', 'np-imp-2pl'}
    mood = next(m for m in ('IND', 'SBJV', 'OPT', 'ADM', 'COND') if m in t)
    past = 'PST' in t or t.count('PRF') == 2
    if 'PRF' in t:
        aux = {'IND': 'pant' if past else 'perf', 'SBJV': 'plup' if past else 'perf-sbjv', 'COND': 'plup',
               'OPT': 'opt-perf', 'ADM': 'adm-plup' if past else 'adm-perf'}[mood]
        if 'FUT' in t:
            aux = 'perf-sbjv'
        ids = {f'{aux}-{person}', f'np-{aux}-{person}'}
        if aux == 'perf-sbjv':
            ids |= {f'perf-{person}', f'np-perf-{person}'}
        return ids
    np = lambda ids: ids | {f'np-{i}' for i in ids}
    if mood == 'COND':
        return np({f'impf-{person}'})
    if mood == 'ADM':
        return {'adm-impf'} if 'IPFV' in t else {'adm-pres'}
    if mood == 'OPT':
        return {f'opt-{person}'}
    present = {'1sg': set(), '2sg': {'pres-2sg', 'sbjv-2sg'}, '3sg': {'pres-2sg', 'sbjv-3sg'}}.get(person, {f'pres-{person}'})
    if 'FUT' in t:
        return {'fut'} | np(present)
    if 'IPFV' in t or (mood == 'SBJV' and 'PST' in t):
        return np({f'impf-{person}'})
    if 'PST' in t:
        return {f'aor-{person}'} | ({'np-aor-3sg'} if person == '3sg' else set())
    if mood == 'SBJV':
        return {'sbjv'} | np(present)
    return np(present) if present else None


def cmd_traces(sample):
    rows = [l.rstrip('\n').split('\t') for l in open(sample, encoding='utf-8') if l.strip() and not l.startswith('#')]
    leaves, _ = conditions_of(os.path.join(PACK, 'transforms.json'))
    family = {'v': leaves['v'], 'n': leaves['n']}
    results = deinflect(sorted({r[2] for r in rows}))
    stats = collections.defaultdict(lambda: [0, 0])
    misses = collections.Counter()
    for category, _valid, source, term, rule, _ in rows:
        found = [r for r in results.get(source, []) if r['text'] == term and (not r['conditions'] or set(r['conditions']) & family[rule])]
        if not found:
            continue
        best = min(found, key=lambda r: len(r['trace']))
        want = expected_ids(category)
        if want is None:
            continue
        key = 'verbs' if rule == 'v' else 'nouns'
        stats[key][1] += 1
        if set(best['trace']) & want:
            stats[key][0] += 1
        else:
            misses[(category, ' '.join(best['trace']))] += 1
    for key, (good, total) in stats.items():
        print(f'{key}: the shown trace names the features in {good} of {total} rows ({100*good/total:.1f}%)')
    for (category, trace), n in misses.most_common(15):
        print(f'  {n} {category}: {trace}')


def cmd_order(imported, freq, *texts):
    is_adjective = lambda t: t['id'].startswith('adj-') or t['id'] in ('art', 'cmp')
    pack = json.load(open(os.path.join(PACK, 'transforms.json'), encoding='utf-8'))
    all_t = pack['transforms']
    adjectives = [t for t in all_t if is_adjective(t)]
    rest = [t for t in all_t if not is_adjective(t)]
    at = [t['id'] for t in rest].index('vn') + 1
    nouns = [t for t in rest if t['id'].startswith('n-')]
    head = rest[:[t['id'] for t in rest].index(nouns[0]['id'])]
    verbs = [t for t in rest if t not in nouns and t not in head]
    language = json.load(open(os.path.join(PACK, 'language.json'), encoding='utf-8'))
    first_trace = dict(language, lookup=dict(language['lookup'], traceSelection='first'))
    others = [('adjectives before the verbs', rest[:at] + adjectives + rest[at:], language),
              ('nouns after the verbs', head + verbs + nouns + adjectives, language),
              ('traceSelection first', all_t, first_trace)]
    inputs = [(w, h) for w, h in hovers_of(texts)] + [(w, w) for w, _ in read_frequency(freq, 10000)]
    tool = os.environ.get('LOOKUP_BATCH', os.path.join(ROOT, 'build', 'lookup-batch'))
    texts_in = '\n'.join(h for _, h in inputs) + '\n'
    run = lambda d: [json.loads(line) for line in subprocess.run([tool, d, 'sq', imported], input=texts_in,
                                                                capture_output=True, text=True, check=True).stdout.splitlines()]
    first = lambda r: (r['results'][0]['expression'], '+'.join(r['results'][0]['trace'])) if r['results'] else ('-', '')
    now = [first(r) for r in run(os.path.join(ROOT, 'languages'))]
    print(f'{len(inputs)} lookups')
    for name, order, lang in others:
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, 'sq'))
            with open(os.path.join(tmp, 'sq', 'language.json'), 'w', encoding='utf-8') as f:
                json.dump(lang, f, ensure_ascii=False)
            with open(os.path.join(tmp, 'sq', 'transforms.json'), 'w', encoding='utf-8') as f:
                json.dump(dict(pack, transforms=order), f, ensure_ascii=False)
            other = [first(r) for r in run(tmp)]
        changed = collections.Counter((w, b[0], a[0]) for (w, _), a, b in zip(inputs, now, other) if a[0] != b[0])
        print(f'{name}: {sum(changed.values())} first results differ ({len(changed)} distinct), that order -> as written')
        for (w, before, after), n in changed.most_common():
            print(f'  {n}\t{w}\t{before} -> {after}')
        traces = collections.Counter((w, a[0], b[1], a[1]) for (w, _), a, b in zip(inputs, now, other) if a[0] == b[0] and a[1] != b[1])
        print(f'{name}: {sum(traces.values())} first results keep their lemma and change their trace ({len(traces)} distinct), that order -> as written')
        for (w, lemma, before, after), n in traces.most_common():
            print(f'  {n}\t{w}\t{lemma}\t{before} -> {after}')


def main(argv):
    if len(argv) >= 1 and argv[0] == 'yomitan' and len(argv) == 4:
        cmd_yomitan(*argv[1:])
    elif len(argv) == 2 and argv[0] == 'traces':
        cmd_traces(argv[1])
    elif len(argv) == 5 and argv[0] == 'phrases':
        cmd_phrases(*argv[1:])
    elif len(argv) >= 6 and argv[0] == 'real':
        cmd_real(*argv[1:])
    elif len(argv) >= 4 and argv[0] == 'order':
        cmd_order(*argv[1:])
    elif len(argv) >= 1 and argv[0] == 'frequent' and len(argv) in (5, 6):
        cmd_frequent(*argv[1:])
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
