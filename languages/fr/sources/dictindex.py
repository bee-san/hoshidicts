# SPDX-License-Identifier: GPL-3.0-or-later
# Index of a wiktionary-to-yomitan dictionary, shared by the measurement
# scripts of README.md (not run by any test): for each headword, the parts of
# speech of its rows with definitions, and the form-of targets of its
# reference rows with the reference row's parts of speech and rules. Cached
# as JSON beside the zip, or where --index says.
#   python3 dictindex.py <dictionary zip> <cache.json>
import json, os, sys, zipfile

def build(zip_path, cache_path):
    if os.path.exists(cache_path):
        return json.load(open(cache_path))
    z = zipfile.ZipFile(zip_path)
    idx = {}
    for n in sorted(z.namelist()):
        if not n.startswith('term_bank_'):
            continue
        for r in json.loads(z.read(n)):
            term, rules, defs = r[0], (r[3] or '').split(), r[5]
            refs = [d for d in defs if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0] and isinstance(d[1], list)]
            e = idx.setdefault(term, {'def': [], 'ref': []})
            if refs and len(refs) == len(defs):
                for d in refs:
                    e['ref'].append([d[0], rules, d[1]])
            else:
                e['def'].append(rules)
    json.dump(idx, open(cache_path, 'w'), ensure_ascii=False)
    return idx

def lemmas(idx, word, hops=2):
    """The word's own lemmas: itself when it has a row with definitions, and
    the terms its form-of rows name, and theirs, up to `hops` references
    (wiktionary-to-yomitan names venu for venus, and venir for venu)."""
    e = idx.get(word)
    if e is None:
        return set()
    out = set()
    if e['def']:
        out.add(word)
    frontier = {t for t, _, _ in e['ref']}
    for _ in range(hops):
        out |= frontier
        nxt = set()
        for t in frontier:
            f = idx.get(t)
            if f is not None:
                nxt |= {u for u, _, _ in f['ref']}
        frontier = nxt - out
    return out

if __name__ == '__main__':
    idx = build(sys.argv[1], sys.argv[2])
    print(len(idx))
