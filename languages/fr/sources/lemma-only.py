#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""A copy of a wiktionary-to-yomitan dictionary without its form-of rows (README.md, Measurements). Not run by any test.

    python3 lemma-only.py <dictionary zip> <out zip>

Leaves out every term row whose definitions are all form-of references
([term, [rules]]), and adds " (lemma rows only)" to the title. Lookups with
the copy show what the rules alone reach; every number measured with it is
labelled.
"""
import json, sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
zi = zipfile.ZipFile(src)
zo = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
kept = dropped = 0
for n in zi.namelist():
    data = zi.read(n)
    if n.startswith('term_bank_'):
        out = []
        for r in json.loads(data):
            defs = r[5]
            refs = [d for d in defs if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0] and isinstance(d[1], list)]
            if refs and len(refs) == len(defs):
                dropped += 1
            else:
                out.append(r)
                kept += 1
        data = json.dumps(out, ensure_ascii=False).encode()
    elif n == 'index.json':
        index = json.loads(data)
        index['title'] = index['title'] + ' (lemma rows only)'
        data = json.dumps(index, ensure_ascii=False).encode()
    zo.writestr(n, data)
zo.close()
print('kept', kept, 'dropped', dropped)
