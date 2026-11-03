# SPDX-License-Identifier: GPL-3.0-or-later
"""The "first results" of README.md's removal tables (Rule provenance).

- For each Yomitan transform sources/build-final.mjs leaves out (REMOVED): the
  positions of Tatoeba (T) and the Gutenberg texts (G) where the union's first
  result differs from the final set's, attributed to the first such transform
  in the union result's trace, grouped by (matched text, final set's first
  result, union's first result).
- For each single Yomitan rule it leaves out (REMOVED_RULES): the positions
  whose first result changes when that rule alone is added back to the final
  set (looked up again with build/tl-lookup-batch, for the positions whose
  text starts with the rule's affix), grouped the same way.

Not run by any test.

    python3 languages/tl/sources/attribute-removed.py <tatoeba dump> <text dump> [--show N]

<dump> is the --dump prefix of `measure.py tatoeba` or `measure.py text`; the
script reads <dump>.union.jsonl and <dump>.final.jsonl.
"""
import argparse
import collections
import json
import os
import subprocess
import tempfile
from pathlib import Path

PACK = Path(__file__).resolve().parent.parent
REPO = PACK.parent.parent
BATCH = REPO / 'build' / 'tl-lookup-batch'


def removed_ids():
    script = ("import('./sources/build-final.mjs').then((m) => console.log(JSON.stringify("
              "[Object.keys(m.REMOVED), [...new Set(Object.keys(m.REMOVED_RULES).map((k) => k.split(' ')[0]))]])))")
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=PACK, capture_output=True, text=True, check=True)
    transforms, single = json.loads(out.stdout)
    return transforms, single


def removed_rules():
    """{key: [transform without its other rules, the rule]} for REMOVED_RULES."""
    script = ("import {readFileSync} from 'node:fs'; import('./sources/build-final.mjs').then((m) => {"
              "const y = JSON.parse(readFileSync('sources/yomitan.json', 'utf8')); const out = {};"
              "for (const key of Object.keys(m.REMOVED_RULES)) { for (const t of y.transforms) { for (const r of t.rules) {"
              "if (m.ruleKey(t, r) === key) { out[key] = [t.id, t.name, r]; } } } }"
              "console.log(JSON.stringify(out)); })")
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=PACK, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def plain(text):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c)).lower()


def single_rule(prefix, key, entry, work):
    """Positions whose first result changes when the rule is added back."""
    tid, name, rule = entry
    affix = plain(rule.get('inflected') or rule.get('inflectedPrefix') or '')
    final = json.loads((PACK / 'transforms.json').read_text(encoding='utf-8'))
    final['transforms'].append({'id': f'{tid} (removed rule)', 'name': f'{name} (removed rule)', 'source': 'yomitan',
                                'rules': [rule]})
    transforms = Path(work) / 'with-rule.json'
    transforms.write_text(json.dumps(final, ensure_ascii=False), encoding='utf-8')
    positions = []
    with open(f'{prefix}.final.jsonl', encoding='utf-8') as f:
        for line in f:
            d = json.loads(line)
            if plain(d['text']).startswith(affix):
                positions.append(d)
    by = collections.Counter()
    if not positions:
        return by
    texts = Path(work) / 'texts.txt'
    texts.write_text('\n'.join(d['text'] for d in positions) + '\n', encoding='utf-8')
    with open(texts, encoding='utf-8') as stdin:
        out = subprocess.run([str(BATCH), str(REPO / 'languages'), 'tl', DICTIONARY, '--transforms', str(transforms)],
                             stdin=stdin, capture_output=True, text=True, check=True).stdout.splitlines()
    assert len(out) == len(positions)
    for d, line in zip(positions, out):
        results = json.loads(line)['results']
        old = d['results'][0] if d['results'] else None
        new = results[0] if results else None
        key_old = (old['expression'], old['matched']) if old else None
        key_new = (new['expression'], new['matched']) if new else None
        if key_old != key_new and new is not None:
            by[(new['matched'].lower(), old['expression'] if old else '-', new['expression'])] += 1
    return by


DICTIONARY = None


def attribute(prefix, ids):
    by = collections.defaultdict(collections.Counter)
    with open(f'{prefix}.final.jsonl', encoding='utf-8') as ff, open(f'{prefix}.union.jsonl', encoding='utf-8') as fu:
        for line_final, line_union in zip(ff, fu):
            final, union = json.loads(line_final), json.loads(line_union)
            first_final = final['results'][0] if final['results'] else None
            first_union = union['results'][0] if union['results'] else None
            if first_union is None:
                continue
            key_final = (first_final['expression'], first_final['matched']) if first_final else None
            key_union = (first_union['expression'], first_union['matched'])
            if key_final == key_union:
                continue
            hit = next((t for t, from_dictionary in first_union['trace'] if not from_dictionary and t in ids), None)
            if hit:
                by[hit][(key_union[1].lower(), key_final[0] if key_final else '-', key_union[0])] += 1
    return by


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('tatoeba')
    parser.add_argument('text')
    parser.add_argument('--show', type=int, default=8)
    parser.add_argument('--dictionary', required=True, help='the imported wty-tl-en')
    args = parser.parse_args()
    global DICTIONARY
    DICTIONARY = args.dictionary
    transforms, single = removed_ids()
    ids = set(transforms)
    corpora = {'T': attribute(args.tatoeba, ids), 'G': attribute(args.text, ids)}
    print('## Yomitan transforms left out (REMOVED): union against final')
    for t in transforms:
        counts = ', '.join(f'{c} {sum(corpora[c].get(t, {}).values())}' for c in corpora)
        print(f'{t}: {counts}')
        for c, by in corpora.items():
            for (matched, final, union), n in by.get(t, collections.Counter()).most_common(args.show):
                print(f'  {c} {n}\t{matched}\tfinal {final}\tunion {union}')
    print('## Single Yomitan rules left out (REMOVED_RULES): final against final with the rule')
    with tempfile.TemporaryDirectory(prefix='tl-removed-') as work:
        for key, entry in removed_rules().items():
            found = {'T': single_rule(args.tatoeba, key, entry, work), 'G': single_rule(args.text, key, entry, work)}
            print(f"{key}: {', '.join(f'{c} {sum(by.values())}' for c, by in found.items())}")
            for c, by in found.items():
                for (matched, final, added), n in by.most_common(args.show):
                    print(f'  {c} {n}\t{matched}\tfinal {final}\twith the rule {added}')


if __name__ == '__main__':
    main()
