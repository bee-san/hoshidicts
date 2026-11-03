#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurements of README.md (Measurements) that eval-language does not make.
Not run by any test. Every command reads the dictionary's term banks
(wiktionary-to-yomitan's wty-eo-en, extracted from its zip) and runs
hoshidicts-cli or the batch lookup tool (sources/lookup-batch.cpp).

    python3 measure.py fc <cli> <languages> <json dir> <file.tsv> [--transforms <file>] [--defaults]
        False candidates of eval-language, split into texts on a path to the
        row's lemma (intermediate forms such as leganta for legantajn →
        legi, which Wiktionary often lists as adjectives) and other texts,
        by the transform that made each, and by whether the trace uses word
        formation. Every option is on, as in eval-language, unless --defaults.

    python3 measure.py frequent <lookup-batch> <languages> <imported dict> <json dir> <frequency list>
        [--top N] [--options <ids>] [--show N]
        The N (10,000) most frequent words of the list, each looked up alone
        as a host does. A word counts when one of its form-of rows names a
        lemma; the first result with a definition is right when it is a
        lemma a form-of row of the word names, or the word itself when it
        has a definition. Prints the counts, the share of the list's tokens,
        and the wrong words with their first result.

    python3 measure.py phrases <lookup-batch> <languages> <imported dict> <json dir> <sentences.tsv.bz2>
        [--limit N] [--seed S] [--options <ids>] [--show N]
        For a sentence corpus (Tatoeba's per-language export: id, language,
        text), every word that follows a pronoun, an article, a
        correlative, a preposition or an auxiliary (FRONT below) is looked
        up from that word to the end of the sentence and also from the word
        in front of it; judged as `frequent` judges.

    python3 measure.py text <lookup-batch> <languages> <imported dict> <json dir> <hover dir> [--options <ids>]
        [--sample N] [--seed S]
        Real text: the hovers of make-hovers.py. Judged by script where the
        hovered word has a form-of row (as `frequent`), and a random sample
        of the others printed for judging by hand. Also prints how the other
        first results split: the hovered word itself, a dictionary step only,
        a phrase or part of a word, and a pack rule.

    python3 measure.py names <lookup-batch> <languages> <imported dict> <json dir> <out.tsv>
        (--hovers <hover dir> | --tatoeba <sentences.tsv.bz2> | --frequent <frequency list> [--top N])
        The first results a pack rule makes at words without a form-of row
        (Known gaps: names and loanwords read as derived words), counted by
        word, with the first result and the rules of its trace, for judging
        by hand: every capitalised word of the hovers; every capitalised word
        inside a Tatoeba sentence (not its first word), looked up from that
        word to the end of the sentence; or the N (10,000) most frequent words
        of the list, looked up alone.
"""
import bz2
import collections
import glob
import json
import random
import re
import subprocess
import sys

INFLECTION = {'accusative', 'plural', 'present', 'past', 'future', 'conditional', 'volitive', 'elision'}
INFLECTION |= {f'{m}{e}' for m in ('ant', 'int', 'ont', 'at', 'it', 'ot') for e in 'aoe'}


def option(args, name, default=None, cast=str):
    if name in args:
        i = args.index(name)
        value = cast(args[i + 1])
        del args[i:i + 2]
        return value
    return default


class Dictionary:
    """The rows of a term-bank directory: definition rows and form-of rows."""

    def __init__(self, json_dir):
        self.defined = collections.defaultdict(set)   # expression -> rules of rows with definitions
        self.refs = collections.defaultdict(list)     # expression -> [(rules, target, inflection)]
        self.tags = collections.defaultdict(set)
        for path in sorted(glob.glob(f'{json_dir}/term_bank_*.json')):
            for row in json.load(open(path, encoding='utf-8')):
                expression, tags, rules, glossary = row[0], row[2], row[3], row[5]
                refs = [g for g in glossary if isinstance(g, list) and len(g) == 2 and isinstance(g[0], str) and g[0]]
                if len(refs) < len(glossary):
                    self.defined[expression].add(rules)
                    self.tags[expression] |= set(tags.split())
                for target, inflections in refs:
                    self.refs[expression].append((rules, target, ' '.join(inflections)))

    @staticmethod
    def passes(rules, conditions):
        return not conditions or bool(set(rules.split()) & set(conditions))

    def candidates(self, text, conditions):
        """Texts a lookup shows for a deinflection: the text when a row with
        definitions passes the filter, and the targets of its form-of rows
        that pass it and have definitions."""
        out = set()
        if any(self.passes(rules, conditions) for rules in self.defined.get(text, ())):
            out.add(text)
        for rules, target, _ in self.refs.get(text, ()):
            if self.passes(rules, conditions) and target in self.defined:
                out.add(target)
        return out

    def lemmas_of(self, word):
        """Lemmas the form-of rows of a word (as written, or decapitalised)
        name, and the lemmas the form-of rows of a named spelling name in
        turn (audis is an H-system spelling of aŭdis, the past of aŭdi)."""
        names = set()
        for key in {word, word.lower(), word[:1].lower() + word[1:]}:
            for _, target, inflection in self.refs.get(key, ()):
                names.add(target)
        for name in list(names):
            if name not in self.defined:
                for _, target, _ in self.refs.get(name, ()):
                    names.add(target)
        return names


def deinflect(cli, languages, words, transforms=None, all_options=True):
    command = [cli, '--languages', languages, 'deinflect', 'eo', '--stdin']
    if transforms:
        command += ['--transforms', transforms]
    if all_options:
        command.append('--all-options')
    out = subprocess.run(command, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def preprocess(cli, languages, words, all_options=True):
    command = [cli, '--languages', languages, 'preprocess', 'eo', '--stdin']
    if all_options:
        command.append('--all-options')
    out = subprocess.run(command, input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def read_tsv(path):
    rows = []
    for line in open(path, encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        cells = line.rstrip('\n').split('\t')
        rows.append(cells)
    return rows


def command_fc(args):
    transforms = option(args, '--transforms')
    defaults = '--defaults' in args
    if defaults:
        args.remove('--defaults')
    cli, languages, json_dir, tsv = args
    dictionary = Dictionary(json_dir)
    rows = [r for r in read_tsv(tsv) if r[1] == '1']
    sources = sorted({r[2] for r in rows})
    variants = {v['input']: v['variants'] for v in preprocess(cli, languages, sources, not defaults)}
    texts = sorted({x['text'] for s in sources for x in variants[s]})
    results = {d['input']: d['results'] for d in deinflect(cli, languages, texts, transforms, not defaults)}
    on_path = collections.Counter()
    other = collections.Counter()
    examples = collections.defaultdict(list)
    total_on = total_other = 0
    kinds = collections.Counter()
    for category, valid, source, lemma, rule, reasons in rows:
        found = []
        for variant in variants[source]:
            for r in results[variant['text']]:
                found.append(r)
        # texts on a path to the lemma: prefixes of a trace that reaches it
        path_texts = set()
        by_text = collections.defaultdict(list)
        for r in found:
            by_text[r['text']].append(r)
        # Traces list the newest transform first, so the trace of a text on
        # the way to the lemma is a tail of the lemma's trace.
        lemma_traces = [r['trace'] for r in found if r['text'] == lemma]
        for r in found:
            for trace in lemma_traces:
                if len(r['trace']) < len(trace) and trace[len(trace) - len(r['trace']):] == r['trace']:
                    path_texts.add(r['text'])
        seen = set()
        for r in found:
            for text in dictionary.candidates(r['text'], r['conditions']):
                if text in (source, lemma) or text in seen:
                    continue
                seen.add(text)
                # The transform that made the text (the newest), and whether
                # its trace uses word formation.
                key = r['trace'][0] if r['trace'] else '(none)'
                kind = 'formation' if any(t not in INFLECTION for t in r['trace']) else 'inflection'
                kinds[kind] += 1
                if r['text'] in path_texts and text == r['text']:
                    on_path[key] += 1
                    total_on += 1
                else:
                    other[key] += 1
                    total_other += 1
                    if len(examples[key]) < 8:
                        examples[key].append(f'{source} → {text}')
    n = len(rows)
    print(f'rows {n}: false candidates {(total_on + total_other) / n:.3f} per row, '
          f'{total_on / n:.3f} on a path to the lemma, {total_other / n:.3f} other')
    print(f"by the rules of the text's trace: inflection only {kinds['inflection'] / n:.3f} per row, "
          f"word formation {kinds['formation'] / n:.3f} per row")
    print('on a path, by the newest transform:', dict(on_path.most_common()))
    print('other, by the newest transform:')
    for key, count in other.most_common():
        print(f'  {key}\t{count}\t{"; ".join(examples[key])}')


def batch(tool, languages, dictionary_dir, texts, options=None):
    command = [tool, languages, 'eo', dictionary_dir]
    if options:
        command += ['--options', options]
    out = subprocess.run(command, input='\n'.join(texts) + '\n', capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


def first_defined(results, dictionary):
    """The first result a host shows with a definition (form-of-only rows are
    never terms with formOf follow, so every result has one)."""
    return results[0] if results else None


def judge(word, result, dictionary):
    """right / wrong / none for a word and its first result."""
    if result is None:
        return 'none'
    names = dictionary.lemmas_of(word)
    if result['expression'] in names:
        return 'right'
    keys = {word, word.lower(), word[:1].lower() + word[1:]}
    if result['expression'] in keys and result['expression'] in dictionary.defined:
        return 'right'
    return 'wrong'


def command_frequent(args):
    top = option(args, '--top', 10000, int)
    options = option(args, '--options')
    show = option(args, '--show', 60, int)
    tool, languages, imported, json_dir, frequency_file = args
    dictionary = Dictionary(json_dir)
    words, counts = [], {}
    for line in open(frequency_file, encoding='utf-8'):
        word, count = line.split()
        words.append(word)
        counts[word] = int(count)
        if len(words) == top:
            break
    total_tokens = sum(int(line.split()[1]) for line in open(frequency_file, encoding='utf-8'))
    results = batch(tool, languages, imported, words, options)
    verdicts = collections.Counter()
    tokens = collections.Counter()
    wrong = []
    for word, result in zip(words, results):
        if not dictionary.lemmas_of(word):
            verdicts['no form-of row'] += 1
            continue
        first = first_defined(result['results'], dictionary)
        verdict = judge(word, first, dictionary)
        verdicts[verdict] += 1
        tokens[verdict] += counts[word]
        if verdict == 'wrong':
            wrong.append((counts[word], word, first['expression'], first['matched'], first['trace']))
        elif verdict == 'none':
            wrong.append((counts[word], word, '(no result)', '', []))
    reached = verdicts['right'] + verdicts['wrong'] + verdicts['none']
    print(f'{len(words)} words ({sum(counts.values())} of {total_tokens} tokens); {reached} have a form-of row naming a lemma')
    for verdict in ('right', 'wrong', 'none'):
        print(f'  {verdict}: {verdicts[verdict]} words, {tokens[verdict]} tokens ({tokens[verdict] / total_tokens:.3%} of the list)')
    for count, word, expression, matched, trace in sorted(wrong, reverse=True)[:show]:
        print(f'  {count}\t{word}\t→ {expression}\t{matched}\t{trace}')


FRONT = {
    'pronoun': ['mi', 'vi', 'li', 'ŝi', 'ĝi', 'ni', 'ili', 'oni', 'si', 'ci', 'min', 'vin', 'lin', 'ŝin', 'ĝin', 'nin', 'ilin', 'sin'],
    'article': ['la', "l'"],
    'correlative': ['kiu', 'kiun', 'kiuj', 'kiujn', 'tiu', 'tiun', 'tiuj', 'tiujn', 'ĉiu', 'ĉiuj', 'kio', 'kion', 'tio', 'tion', 'kie', 'tie', 'kiam', 'tiam', 'kiel', 'tiel'],
    'preposition': ['al', 'de', 'en', 'el', 'kun', 'por', 'pri', 'sur', 'sub', 'per', 'ĉe', 'je', 'da', 'ĝis', 'tra', 'sen', 'post', 'antaŭ', 'inter', 'pro'],
    'auxiliary': ['estas', 'estis', 'estos', 'estus', 'estu', 'esti', 'povas', 'povis', 'devas', 'devis', 'volas', 'volis', 'ne', 'ĉu', 'ke', 'kaj', 'sed'],
}
FRONT_OF = {word: kind for kind, words in FRONT.items() for word in words}
WORD = re.compile("[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F'\u2019\u02BC]+")


def command_phrases(args):
    limit = option(args, '--limit', 0, int)
    seed = option(args, '--seed', 1, int)
    options = option(args, '--options')
    show = option(args, '--show', 40, int)
    tool, languages, imported, json_dir, corpus = args
    dictionary = Dictionary(json_dir)
    sentences = []
    with bz2.open(corpus, 'rt', encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) >= 3:
                sentences.append(parts[2])
    if limit:
        random.Random(seed).shuffle(sentences)
        sentences = sentences[:limit]
    places = []  # (kind, front word, word, text from front, text from word)
    for sentence in sentences:
        matches = list(WORD.finditer(sentence))
        for a, b in zip(matches, matches[1:]):
            kind = FRONT_OF.get(a.group(0).lower())
            if kind and sentence[a.end():b.start()] == ' ':
                places.append((kind, a.group(0), b.group(0), sentence[a.start():], sentence[b.start():]))
    from_front = batch(tool, languages, imported, [p[3] for p in places], options)
    from_word = batch(tool, languages, imported, [p[4] for p in places], options)
    stats = collections.defaultdict(collections.Counter)
    wrong = collections.Counter()
    for (kind, front, word, _, _), at_front, at_word in zip(places, from_front, from_word):
        # From the word: judged as the frequent forms are, unless the first
        # result matches more than the word (a phrase the dictionary has).
        first_word = first_defined(at_word['results'], dictionary)
        if first_word is not None and first_word['matched'] != word:
            stats[kind]['word phrase'] += 1
        elif dictionary.lemmas_of(word):
            verdict = judge(word, first_word, dictionary)
            stats[kind][f'word {verdict}'] += 1
            if verdict == 'wrong':
                r = at_word['results'][0]
                wrong[(kind, 'word', word, r['expression'], r['matched'])] += 1
        # From the word in front: the first result must not join the two
        # words into a reading of the second word alone or of a phrase the
        # dictionary does not have.
        first = at_front['results'][0] if at_front['results'] else None
        if first is None:
            stats[kind]['front none'] += 1
            continue
        matched_words = len(first['matched'].split(' '))
        if matched_words == 1:
            verdict = judge(front, first, dictionary) if dictionary.lemmas_of(front) else 'single'
            stats[kind][f'front {verdict}'] += 1
            if verdict == 'wrong':
                wrong[(kind, 'front', front, first['expression'], first['matched'])] += 1
        else:
            # A phrase is the dictionary's when no rule of the pack made it
            # (steps a form-of reference names are the dictionary's own).
            pack_steps = [t for t, d in zip(first['trace'], first['dictionaryRules']) if not d]
            phrase_ok = first['expression'] in dictionary.defined and not pack_steps
            stats[kind]['front phrase' if phrase_ok else 'front phrase (rule-made)'] += 1
            if not phrase_ok:
                wrong[(kind, 'phrase', first['matched'], first['expression'], first['matched'])] += 1
    print(f'{len(sentences)} sentences, {len(places)} places')
    for kind in FRONT:
        print(f'  {kind}: ' + ', '.join(f'{k} {v}' for k, v in sorted(stats[kind].items())))
    for key, count in wrong.most_common(show):
        print(f'  {count}\t{key}')


def command_text(args):
    options = option(args, '--options')
    sample = option(args, '--sample', 60, int)
    seed = option(args, '--seed', 1, int)
    tool, languages, imported, json_dir, hover_dir = args
    dictionary = Dictionary(json_dir)
    hovers = open(f'{hover_dir}/hover.txt', encoding='utf-8').read().split('\n')[:-1]
    words = open(f'{hover_dir}/words.txt', encoding='utf-8').read().split('\n')[:-1]
    results = batch(tool, languages, imported, hovers, options)
    verdicts = collections.Counter()
    wrong = collections.Counter()
    unjudged = []
    by_rule = collections.Counter()
    for word, result in zip(words, results):
        first = result['results'][0] if result['results'] else None
        if first is None:
            verdicts['none'] += 1
            continue
        if ' ' in first['matched'] or first['matched'] != word:
            # A phrase, or a match of part of the word.
            verdicts['phrase'] += 1
            unjudged.append((word, first))
            continue
        if dictionary.lemmas_of(word):
            verdict = judge(word, first, dictionary)
            verdicts[verdict] += 1
            if verdict == 'wrong':
                wrong[(word, first['expression'], tuple(first['trace']))] += 1
                rules = tuple(t for t, d in zip(first['trace'], first['dictionaryRules']) if not d)
                by_rule[rules] += 1
        else:
            verdicts['unjudged'] += 1
            unjudged.append((word, first))
    print(f'{len(hovers)} lookups: ' + ', '.join(f'{k} {v}' for k, v in sorted(verdicts.items())))
    split = collections.Counter()
    for word, result in zip(words, results):
        first = result['results'][0] if result['results'] else None
        if first is None or first['matched'] != word or dictionary.lemmas_of(word):
            continue
        if any(not d for d in first['dictionaryRules']):
            split['a pack rule'] += 1
        elif first['expression'].lower() == word.lower():
            split['the word itself'] += 1
        else:
            split['a dictionary step only'] += 1
    print('first results at words without a form-of row (not phrases): ' + ', '.join(f'{k} {v}' for k, v in sorted(split.items())))
    print('wrong, by the rules of the trace:', by_rule.most_common(15))
    for key, count in wrong.most_common(40):
        print(f'  {count}\t{key}')
    rng = random.Random(seed)
    derived = [(w, r) for w, r in unjudged if any(not d for d in r['dictionaryRules'])]
    plain = [(w, r) for w, r in unjudged if not any(not d for d in r['dictionaryRules'])]
    print(f'not judged by script: {len(unjudged)}, of which {len(derived)} through a rule; a sample of those for judging by hand:')
    for word, r in rng.sample(derived, min(sample, len(derived))):
        print(f"  {word}\t→ {r['expression']}\t{r['matched']}\t{r['trace']}")


def command_names(args):
    hover_dir = option(args, '--hovers')
    tatoeba = option(args, '--tatoeba')
    frequent = option(args, '--frequent')
    top = option(args, '--top', 10000, int)
    tool, languages, imported, json_dir, out_file = args
    dictionary = Dictionary(json_dir)
    texts, words = [], []
    if hover_dir:
        hovers = open(f'{hover_dir}/hover.txt', encoding='utf-8').read().split('\n')[:-1]
        hovered = open(f'{hover_dir}/words.txt', encoding='utf-8').read().split('\n')[:-1]
        for text, word in zip(hovers, hovered):
            if word[:1].isupper():
                texts.append(text)
                words.append(word)
    elif tatoeba:
        with bz2.open(tatoeba, 'rt', encoding='utf-8') as f:
            for line in f:
                parts = line.rstrip('\n').split('\t')
                if len(parts) < 3:
                    continue
                sentence = parts[2]
                for m in list(WORD.finditer(sentence))[1:]:
                    if m.group(0)[:1].isupper():
                        texts.append(sentence[m.start():])
                        words.append(m.group(0))
    elif frequent:
        for line in open(frequent, encoding='utf-8'):
            words.append(line.split()[0])
            if len(words) == top:
                break
        texts = list(words)
    else:
        sys.exit('names needs --hovers, --tatoeba or --frequent')
    results = batch(tool, languages, imported, texts)
    found = collections.Counter()
    shown = {}
    for word, result in zip(words, results):
        first = result['results'][0] if result['results'] else None
        if first is None or first['matched'] != word or dictionary.lemmas_of(word):
            continue
        rules = [t for t, d in zip(first['trace'], first['dictionaryRules']) if not d]
        if rules:
            found[word] += 1
            shown[word] = (first['expression'], ' '.join(rules))
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write('count\tword\tfirst result\ttrace\n')
        for word, count in sorted(found.items(), key=lambda x: (-x[1], x[0])):
            f.write(f'{count}\t{word}\t{shown[word][0]}\t{shown[word][1]}\n')
    print(f'{len(texts)} lookups; a pack rule made the first result at {sum(found.values())} of them '
          f'({len(found)} distinct words) without a form-of row; listed in {out_file}')


COMMANDS = {'fc': command_fc, 'frequent': command_frequent, 'phrases': command_phrases, 'text': command_text,
            'names': command_names}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](sys.argv[2:])
