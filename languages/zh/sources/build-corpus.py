#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes tests/corpus.tsv and tests/gaps.tsv for the Chinese pack.

    python3 languages/zh/sources/build-corpus.py --wty wty-zh-en.zip --cedict CC-CEDICT.zip \
        [--cli build/hoshidicts-cli] [--seed 1] [--erhua 300]

The pairs come from what the two dictionaries' sources say, never from the
pack's rules:

- erhua (Wiktionary): an entry of wty-zh-en (English Wiktionary through
  kaikki.org) whose gloss says "erhua form of X": the entry's headword and X,
  in traditional characters, and the simplified headword of its
  "Simplified-Chinese" form-of row with the simplified X the gloss gives
  ("erhua form of 一點／一点" gives 一點兒 → 一點 and 一点儿 → 一点).
- erhua (CC-CEDICT): a CC-CEDICT entry whose gloss says "erhua variant of X"
  or "erhua form of X": its headword and the X of the same script.
- usage (Wiktionary): an example sentence of a wty-zh-en entry in which
  Wiktionary's editors marked the headword's parts in bold where they are not
  written together, or wrote it longer: the text from the first bold part to
  the last (洗個澡 for 洗澡, 生她的氣 for 生氣, 壓壓驚 for 壓驚), and the
  headword in the sentence's script. Sentences in Cantonese, Wu or Hokkien
  (recognised by characters only those write) and sentences with a citation
  before 1900 (Classical Chinese) are left out, and so are texts with
  anything but Han characters.

`--erhua` rows of each erhua source are sampled with `--seed`; every usage row
is kept. Each source text is deinflected with the pack's rules (every option
off, as tests/corpus.tsv runs): rows whose term is among the results go to
tests/corpus.tsv, the others to tests/gaps.tsv.
"""
import argparse, json, os, random, re, subprocess, sys, zipfile
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PACK))

HAN = re.compile(r'^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\U00020000-\U0003FFFF]+$')
# Characters that only Cantonese, Wu and Hokkien text uses.
DIALECT = set('咗嘅唔冇喺嗰啲佢哋嚟咁噉乜睇嘢咩㗎喎囉嘞啱攞俾畀揾搵嗮晒冚冧𠮶啩嚿嘥諗谂掟揼撳揿瞓攰餸㖭噃啫'  # Cantonese
              '侬儂覅搿伲𠲎'  # Wu
              '𣍐𫧃袂佮遐𪜶')  # Hokkien
YEAR = re.compile(r'(\d{1,4})\s*(BCE|CE)?')


def term_rows(path):
    with zipfile.ZipFile(path) as z:
        for name in sorted(n for n in z.namelist() if re.fullmatch(r'term_bank_\d+\.json', n)):
            yield from json.loads(z.read(name))


def flat(node):
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return ''.join(flat(n) for n in node)
    if isinstance(node, dict):
        return flat(node.get('content', ''))
    return ''


def find(node, key, out):
    if isinstance(node, list):
        for n in node:
            find(n, key, out)
    elif isinstance(node, dict):
        if (node.get('data') or {}).get('content') == key:
            out.append(node)
        elif 'content' in node:
            find(node['content'], key, out)


def segments(node):
    """The (text, bold) pieces of an example sentence, in order."""
    out = []

    def walk(n, bold):
        if isinstance(n, str):
            out.append((n, bold))
        elif isinstance(n, list):
            for x in n:
                walk(x, bold)
        elif isinstance(n, dict):
            b = bold or (n.get('data') or {}).get('content') == 'bold-text'
            if 'content' in n:
                walk(n['content'], b)
    walk(node.get('content'), False)
    return out


def premodern(citation):
    """True when a citation dates the sentence before 1900."""
    for m in YEAR.finditer(citation):
        year = int(m.group(1))
        if m.group(2) == 'BCE' or (100 <= year < 1900):
            return True
    return False


def is_subsequence(short, long):
    it = iter(long)
    return all(c in it for c in short)


def wiktionary(path):
    rows = list(term_rows(path))
    simplified = defaultdict(set)  # traditional headword -> its simplified headwords
    for r in rows:
        if 'non-lemma' in r[2].split() and isinstance(r[5], list):
            for d in r[5]:
                if isinstance(d, list) and len(d) == 2 and d[1] == ['Simplified-Chinese']:
                    simplified[d[0]].add(r[0])
    erhua, usage = [], []
    for r in rows:
        head = r[0]
        if 'non-lemma' in r[2].split() or not HAN.match(head):
            continue
        text = flat(r[5])
        for m in re.finditer(r'erhua form of ([^\s(（,;]+)', text):
            bases = m.group(1).split('／')
            base_t = bases[0]
            if len(bases) > 1:
                base_s = bases[-1]
            else:
                # One form: the same in both scripts unless the base has a
                # simplified form-of row of its own.
                forms = simplified.get(base_t, set())
                base_s = base_t if not forms else (next(iter(forms)) if len(forms) == 1 else None)
            if HAN.match(base_t):
                erhua.append((head, base_t))
                if base_s is not None and HAN.match(base_s):
                    for s in simplified.get(head, ()):
                        erhua.append((s, base_s))
        examples = []
        find(r[5], 'example-sentence', examples)
        for e in examples:
            a = []
            find(e, 'example-sentence-a', a)
            c = []
            find(e, 'example-sentence-c', c)
            if not a or a[0].get('lang') not in ('zh-Hant', 'zh-Hans') or any(premodern(flat(x)) for x in c):
                continue
            segs = segments(a[0])
            sentence = ''.join(s for s, _ in segs)
            if any(ch in DIALECT for ch in sentence):
                continue
            if a[0]['lang'] == 'zh-Hant':
                terms = {head}
            else:
                terms = simplified.get(head, set()) | ({head} if not simplified.get(head) else set())
            pos, bolds = 0, []
            for s, b in segs:
                if b and s:
                    bolds.append((pos, pos + len(s), s))
                pos += len(s)
            length = len(head)
            group, total = [], 0
            for b in bolds:
                piece = b[2]
                if len(piece) > length:
                    # Written longer than the headword: 壓壓驚, 開著口.
                    for term in terms:
                        if piece != term and is_subsequence(term, piece) and len(piece) <= length + 4 and HAN.match(piece):
                            usage.append((piece, term))
                    group, total = [], 0
                    continue
                group.append(b)
                total += len(piece)
                if total == length:
                    form = sentence[group[0][0]:group[-1][1]]
                    term = ''.join(x[2] for x in group)
                    if form != term and len(group) > 1 and term in terms and HAN.match(form) and len(form) <= 12:
                        usage.append((form, term))
                    group, total = [], 0
                elif total > length:
                    group, total = [], 0
    return erhua, usage


def cedict(path):
    from urllib.parse import unquote

    def walk(node):
        if isinstance(node, list):
            for n in node:
                yield from walk(n)
        elif isinstance(node, dict):
            yield node
            if 'content' in node:
                yield from walk(node['content'])

    pairs = []
    for r in term_rows(path):
        head = r[0]
        if not HAN.match(head):
            continue
        nodes = list(walk(r[5]))
        trad = next((flat(n) for n in nodes if (n.get('data') or {}).get('cccedict') == 'headword-trad'), None)
        script = 'trad' if trad == head else 'simp'
        for li in (n for n in nodes if n.get('tag') == 'li'):
            if not re.match(r'^\s*erhua (variant|form) of', flat(li)):
                continue
            links = [unquote(n['href'][len('?query='):]) for n in walk(li)
                     if n.get('tag') == 'a' and isinstance(n.get('href'), str) and n['href'].startswith('?query=')]
            if not links:
                continue
            base = links[0] if script == 'trad' or len(links) == 1 else links[1]
            if HAN.match(base):
                pairs.append((head, base))
            break
    return pairs


def deinflect(cli, sources):
    """The deinflected texts of each source with the pack's rules, every option off."""
    out = subprocess.run([cli, '--languages', os.path.join(REPO, 'languages'), 'deinflect', 'zh', '--stdin'],
                         input='\n'.join(sources) + '\n', capture_output=True, text=True, check=True).stdout
    results = {}
    for line in out.splitlines():
        d = json.loads(line)
        results[d['input']] = {r['text'] for r in d['results']}
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--wty', required=True)
    parser.add_argument('--cedict', required=True)
    parser.add_argument('--cli', default=os.path.join(REPO, 'build', 'hoshidicts-cli'))
    parser.add_argument('--seed', type=int, default=1)
    parser.add_argument('--erhua', type=int, default=300)
    args = parser.parse_args()

    w_erhua, w_usage = wiktionary(args.wty)
    c_erhua = cedict(args.cedict)
    rng = random.Random(args.seed)
    rows, seen = [], set()

    def add(category, pairs, limit=None):
        unique = []
        for p in pairs:
            if p not in seen and p[0] != p[1]:
                seen.add(p)
                unique.append(p)
        unique.sort()
        if limit is not None and len(unique) > limit:
            unique = sorted(rng.sample(unique, limit))
        rows.extend((category, s, t) for s, t in unique)
        return len(unique)

    counts = {
        'usage (Wiktionary)': add('usage', w_usage),
        'erhua (Wiktionary)': add('erhua', w_erhua, args.erhua),
        'erhua (CC-CEDICT)': add('erhua-cedict', c_erhua, args.erhua),
    }
    results = deinflect(args.cli, sorted({s for _, s, _ in rows}))
    reached = [r for r in rows if r[2] in results.get(r[1], ())]
    missed = [r for r in rows if r[2] not in results.get(r[1], ())]
    header = (
        '# options: default\n'
        f'# Source: {counts["usage (Wiktionary)"]} usage rows from the example sentences of English Wiktionary (wty-zh-en 2026.10.22,\n'
        f'# kaikki.org), {counts["erhua (Wiktionary)"]} erhua rows from its "erhua form of" glosses and {counts["erhua (CC-CEDICT)"]} from CC-CEDICT\'s\n'
        '# "erhua variant of" glosses (2026-11-02), CC BY-SA 4.0, by the Wiktionary contributors and the CC-CEDICT\n'
        f'# editors; erhua rows sampled with seed {args.seed} by sources/build-corpus.py. Rows the rules reach are here,\n'
        '# the others in tests/gaps.tsv.\n'
        '# category\tvalid\tsource\tterm\trule\treasons\n')
    for name, items in (('corpus.tsv', reached), ('gaps.tsv', missed)):
        with open(os.path.join(PACK, 'tests', name), 'w', encoding='utf-8') as f:
            f.write(header)
            for category, source, term in items:
                f.write(f'{category}\t1\t{source}\t{term}\t*\t*\n')
    print(f'{counts}; corpus.tsv {len(reached)} rows, gaps.tsv {len(missed)} rows', file=sys.stderr)


if __name__ == '__main__':
    main()
