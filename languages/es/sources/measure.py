#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The measurements of README.md that need data this repository does not hold.

    python3 languages/es/sources/measure.py <command> --dictionary wty-es-en.zip [options]

Commands (each prints its numbers):

  real      The N most frequent words of a frequency list (--frequency, lines
            "word count"; FrequencyWords es_50k.txt): recall and false
            candidates of --transforms against the dictionary. A word's gold
            lemmas are those its form-of rows name. A deinflected text with a
            trace is a candidate when it is a headword whose part of speech the
            text's conditions allow, as a lookup would show it; it is right when
            it is a gold lemma, or one with -se added or removed. Recall: words
            with gold lemmas for which some candidate is right. False
            candidates: the other candidates, per word and per token.
  yomitan   Every rule of sources/yomitan.json that sources/yomitan-provenance.tsv
            maps to no own rule, applied alone to the frequency list, a UniMorph
            sample (--unimorph, --sample) and Yomitan's test sources: its headword
            outputs the final rules also give, the readings it adds (gold or
            UniMorph lemmas) and the false candidates it adds.
  pronouns  Places in the dictionary's Spanish example sentences where me, te,
            se, nos or os is followed by a word, looked up from the pronoun: how
            often the first result is a -se verb reached through the pronominal
            rule (--transforms for the rules to compare).
  traces    The verb rows of tests/corpus.tsv and tests/gaps.tsv: the share whose
            trace (the shortest, as traceSelection "shortest" keeps) names the
            row's UniMorph tense or mood, and also its person.

--default-options runs without the optional processor (a lookup's default);
otherwise every option is on, as eval-language runs. --languages loads the packs
of another directory (another version of the pack). --cli is build/hoshidicts-cli.
"""
import argparse, collections, json, os, random, re, shutil, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PACK))


def term_rows(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        for name in sorted(n for n in z.namelist() if re.fullmatch(r'term_bank_\d+\.json', n)):
            yield from json.loads(z.read(name))


def dictionary(zip_path):
    """Headwords with their rules tags, and the lemmas form-of rows name."""
    heads, gold = collections.defaultdict(set), collections.defaultdict(set)
    for row in term_rows(zip_path):
        heads[row[0]].update(row[3].split())
        if isinstance(row[5], list) and row[5] and all(isinstance(g, list) for g in row[5]):
            gold[row[0]].update(g[0] for g in row[5] if g and isinstance(g[0], str))
    return heads, gold


def languages(default_options):
    """The languages directory to load: a copy without optional processors for --default-options."""
    if not default_options:
        return os.path.join(REPO, 'languages')
    tmp = tempfile.mkdtemp()
    shutil.copytree(PACK, os.path.join(tmp, 'es'))
    path = os.path.join(tmp, 'es', 'language.json')
    lang = json.load(open(path, encoding='utf-8'))
    lang['lookup']['preprocessors'] = [p for p in lang['lookup']['preprocessors'] if not p.get('optional')]
    lang['settings'] = []
    json.dump(lang, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    return tmp


def deinflect(args, words, transforms):
    out = subprocess.run([args.cli, '--languages', args.languages, 'deinflect', 'es', '--stdin', '--all-options', '--transforms', transforms],
                         input='\n'.join(words) + '\n', capture_output=True, text=True, check=True).stdout.splitlines()
    return [json.loads(line)['results'] for line in out]


class Pos:
    """Whether a result's conditions allow a headword's rules tags (docs/languages.md 7.2)."""
    def __init__(self, transforms):
        self.conditions = json.load(open(transforms, encoding='utf-8'))['conditions']
    def leaves(self, name):
        c = self.conditions[name]
        return set().union(*(self.leaves(s) for s in c['subConditions'])) if 'subConditions' in c else {name}
    def allows(self, conditions, tags):
        if not conditions:
            return True
        form = set().union(*(self.leaves(c) for c in conditions))
        dict_tags = set().union(*(self.leaves(t) for t in tags if self.conditions.get(t, {}).get('isDictionaryForm')), set())
        return bool(form & dict_tags)


def right(text, gold):
    return text in gold or (text.endswith('se') and text[:-2] in gold) or text + 'se' in gold


def frequent(path, n):
    words = []
    for line in open(path, encoding='utf-8'):
        word, count = line.split()
        if word.isalpha():
            words.append((word, int(count)))
        if len(words) >= n:
            break
    return words


def cmd_real(args, heads, gold):
    words = frequent(args.frequency, args.words)
    pos = Pos(args.transforms)
    tokens = sum(c for _, c in words)
    inflected = inflected_tokens = reached = reached_tokens = false = false_tokens = 0
    for (word, count), results in zip(words, deinflect(args, [w for w, _ in words], args.transforms)):
        g = gold.get(word, set()) - {word}
        texts = {r['text'] for r in results if r['trace'] and r['text'] != word and r['text'] in heads and pos.allows(r['conditions'], heads[r['text']])}
        if g:
            inflected += 1; inflected_tokens += count
            if any(right(t, g) for t in texts):
                reached += 1; reached_tokens += count
        wrong = [t for t in texts if not right(t, g)]
        false += len(wrong); false_tokens += count * len(wrong)
    print(f'{len(words)} words, {inflected} with form-of lemmas: recall {reached / inflected:.4f} of those words, {reached_tokens / inflected_tokens:.4f} of their tokens; '
          f'false candidates {false / len(words):.4f} per word, {false_tokens / tokens:.4f} per token')


def cmd_yomitan(args, heads, gold):
    words, extra = [w for w, _ in frequent(args.frequency, 50000)], collections.defaultdict(set)
    rows = []
    for line in open(args.unimorph, encoding='utf-8'):
        lemma, form, _ = line.rstrip('\n').split('\t')
        if ' ' not in form and form != lemma:
            rows.append((form, lemma))
    random.seed(args.seed)
    for form, lemma in random.sample(rows, args.sample):
        words.append(form); extra[form].add(lemma)
    for line in open(os.path.join(PACK, 'tests', 'yomitan.tsv'), encoding='utf-8'):
        if line.strip() and not line.startswith('#'):
            cells = line.rstrip('\n').split('\t'); words.append(cells[2]); extra[cells[2]].add(cells[3])
    words = list(dict.fromkeys(words))
    own = os.path.join(PACK, 'transforms.json')
    pos = Pos(own)
    def outputs(transforms):
        return [{r['text'] for r in res if r['trace'] and r['text'] != w and r['text'] in heads and pos.allows(r['conditions'], heads[r['text']])}
                for w, res in zip(words, deinflect(args, words, transforms))]
    final = outputs(own)
    yomitan = json.load(open(os.path.join(HERE, 'yomitan.json'), encoding='utf-8'))
    conditions = json.load(open(own, encoding='utf-8'))['conditions']
    totals = collections.Counter()
    for line in open(os.path.join(HERE, 'yomitan-provenance.tsv'), encoding='utf-8'):
        if line.startswith('#'):
            continue
        tid, index, what, mapped = line.rstrip('\n').split('\t')
        if mapped != '-':
            continue
        rule = next(t for t in yomitan['transforms'] if t['id'] == tid)['rules'][int(index)]
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump({'schema': 1, 'conditions': conditions, 'transforms': [{'id': tid, 'name': tid, 'source': 'yomitan', 'rules': [rule]}]}, f, ensure_ascii=False)
        alone = outputs(f.name); os.unlink(f.name)
        covered, readings, false = 0, [], []
        for w, texts, mine in zip(words, alone, final):
            for t in texts:
                if t in mine: covered += 1
                elif right(t, gold.get(w, set()) | extra[w]): readings.append(f'{w}->{t}')
                else: false.append(f'{w}->{t}')
        totals['rules'] += 1; totals['covered'] += covered; totals['readings'] += len(readings); totals['false'] += len(false)
        if readings or false:
            print(f'{tid}[{index}] {what}: covered {covered}, new readings {len(readings)} {readings[:5]}, false candidates {len(false)} {false[:5]}')
    print(f'{len(words)} words, {totals["rules"]} Yomitan rules without an own counterpart: {totals["covered"]} outputs the final rules also give, '
          f'{totals["readings"]} new readings, {totals["false"]} false candidates')


def cmd_pronouns(args, heads, gold):
    sentences = set()
    def walk(node, out):
        if isinstance(node, str): out.append(node)
        elif isinstance(node, list):
            for x in node: walk(x, out)
        elif isinstance(node, dict): walk(node.get('content'), out)
    def find(node):
        if isinstance(node, list):
            for x in node: find(x)
        elif isinstance(node, dict):
            if node.get('data', {}).get('content') == 'example-sentence-a' and node.get('lang') == 'es':
                out = []; walk(node.get('content'), out); sentences.add(''.join(out).strip())
            else:
                find(node.get('content'))
    for row in term_rows(args.dictionary):
        if row[2] != 'non-lemma':
            find(row[5])
    places = [s[m.start():] for s in sorted(sentences) for m in re.finditer(r'(?<![\wáéíóúñü])(me|te|se|nos|os) [a-záéíóúñü]+', s, re.I)]
    imported = os.path.abspath(args.imported)
    pronominal = 0
    for text in places:
        out = subprocess.run([args.cli, '--languages', args.languages, 'lookup', '--language', 'es', imported, text], capture_output=True, text=True).stdout.split('\n')
        first = next((i for i, l in enumerate(out) if l.startswith('-' * 20)), None)
        if first is not None and ' ' in out[first + 1] and any('-se verb' in l for l in out[first + 2:first + 6] if l.startswith('  ')):
            pronominal += 1
    print(f'{len(sentences)} example sentences, {len(places)} places with a pronoun before a word: the first result is a -se verb through the pronominal rule for {pronominal}')


def cmd_traces(args, heads, gold):
    rows = []
    for name in ('corpus.tsv', 'gaps.tsv'):
        for line in open(os.path.join(PACK, 'tests', name), encoding='utf-8'):
            cells = line.rstrip('\n').split('\t')
            if not line.startswith('#') and cells[0].startswith('V;'):
                rows.append(cells)
    pos = Pos(args.transforms)
    results = deinflect(args, [r[2] for r in rows], args.transforms)
    # Yomitan's transforms name the tense only (sources/yomitan.json).
    yomitan_names = {'present': 'present indicative', 'preterite': 'preterite', 'imperfect': 'imperfect', 'future': 'future', 'conditional': 'conditional',
                     'subjunctive': 'present subjunctive', 'subjunctive-ra': 'imperfect subjunctive', 'subjunctive-se': 'imperfect subjunctive',
                     'imperative': 'imperative', 'gerund': 'progressive', 'participle': 'participle'}
    person_of = {('1', 'SG'): 'yo', ('2', 'SG'): 'tu', ('3', 'SG'): 'el', ('1', 'PL'): 'nosotros', ('2', 'PL'): 'vosotros', ('3', 'PL'): 'ellos'}
    reached = tense_ok = person_ok = finite = 0
    for row, res in zip(rows, results):
        tags = row[0].split(';')
        verb = tags[:tags.index('DAT') if 'DAT' in tags else tags.index('ACC')] if 'PRO' in tags else tags
        if 'V.CVB' in verb: tense = 'gerund'
        elif 'V.PTCP' in verb: tense = 'participle'
        elif 'NFIN' in verb or len(verb) == 1: tense = None
        elif 'IMP' in verb: tense = 'imperative'
        elif 'COND' in verb: tense = 'conditional'
        elif 'SBJV' in verb: tense = 'subjunctive-ra' if 'LGSPEC1' in verb else 'subjunctive-se' if 'LGSPEC2' in verb else 'subjunctive-future' if 'FUT' in verb else 'subjunctive'
        elif 'FUT' in verb: tense = 'future'
        elif 'IPFV' in verb: tense = 'imperfect'
        elif 'PFV' in verb: tense = 'preterite'
        else: tense = 'present'
        number = next((x for x in verb if x in ('SG', 'PL')), None); person = next((x for x in verb if x in ('1', '2', '3')), None)
        if person == '2' and 'FORM' in verb: person = '3'
        expected_person = person_of.get((person, number))
        found = [r for r in res if r['text'] == row[3] and pos.allows(r['conditions'], ['v'])]
        if not found:
            continue
        reached += 1
        trace = min(found, key=lambda r: len(r['trace']))['trace']
        step = next((t for t in trace if not t.startswith('clitic-') and t not in ('pronominal', 'reflexive', 'pronoun substitution')), None)
        if step is not None and step in yomitan_names.values():
            tense_ok += step == yomitan_names.get(tense)
            continue
        if tense is None:
            ok = step is None
        elif tense in ('gerund', 'participle'):
            ok = step == tense
        else:
            ok = step is not None and step.startswith(tense + '-') and not (tense == 'subjunctive' and step.split('-')[1] in ('ra', 'se', 'future'))
        tense_ok += ok
        if ok and expected_person and tense not in ('gerund', 'participle'):
            finite += 1
            slot = step[len(tense) + 1:]
            slot = {'usted': 'el', 'ustedes': 'ellos', 'vos': 'tu'}.get(slot, slot)
            person_ok += slot == expected_person or (slot == 'yo-el' and expected_person in ('yo', 'el'))
    print(f'{reached} verb rows reached: the trace names the tense or mood in {tense_ok / reached:.4f}; '
          + (f'of the {finite} finite rows it names, the person too in {person_ok / finite:.4f}' if finite else 'no trace names a person'))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['real', 'yomitan', 'pronouns', 'traces'])
    parser.add_argument('--dictionary', required=True, help='the dictionary .zip (wty-es-en)')
    parser.add_argument('--imported', help='the imported dictionary directory (pronouns)')
    parser.add_argument('--frequency', help='frequency list, "word count" per line (real, yomitan)')
    parser.add_argument('--unimorph', help='UniMorph spa file (yomitan)')
    parser.add_argument('--transforms', default=os.path.join(PACK, 'transforms.json'))
    parser.add_argument('--words', type=int, default=10000)
    parser.add_argument('--sample', type=int, default=60000)
    parser.add_argument('--seed', type=int, default=5)
    parser.add_argument('--cli', default=os.path.join(REPO, 'build', 'hoshidicts-cli'))
    parser.add_argument('--default-options', action='store_true')
    parser.add_argument('--languages', dest='languages_dir', help='a languages directory other than this checkout\'s')
    args = parser.parse_args()
    args.languages = args.languages_dir or languages(args.default_options)
    heads, gold = dictionary(args.dictionary) if args.command != 'traces' else ({}, {})
    {'real': cmd_real, 'yomitan': cmd_yomitan, 'pronouns': cmd_pronouns, 'traces': cmd_traces}[args.command](args, heads, gold)


if __name__ == '__main__':
    main()
