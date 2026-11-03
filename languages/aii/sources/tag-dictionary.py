#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes a copy of wty-aii-en whose rows all carry the pack's part-of-speech tags.

    python3 languages/aii/sources/tag-dictionary.py <wty-aii-en.zip> <out.zip>

wiktionary-to-yomitan leaves the `rules` column of every Assyrian
Neo-Aramaic row empty, and a form with conditions matches no such term
(docs/languages.md 7.2, 9.4), so the published dictionary hides every
deinflection that carries a condition until `lookup.untaggedTerms: "pass"`
reaches main (hachi-lang-engine-j). This copy writes `v n adj prep` into the
`rules` column of every row: those four conditions are the parents of every
condition the pack uses, so every deinflection passes the filter for every
term, which is what "pass" does for an untagged dictionary. Numbers measured
with it are labelled "tagged copy" in README.md. Nothing else changes; the
title gets " (tagged)" so it imports next to the original.
"""
import json
import sys
import zipfile

TAGS = 'v n adj prep'


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == 'index.json':
                index = json.loads(data)
                index['title'] = index['title'] + ' (tagged)'
                index.pop('indexUrl', None)
                index.pop('downloadUrl', None)
                index['isUpdatable'] = False
                data = json.dumps(index, ensure_ascii=False).encode('utf-8')
            elif info.filename.startswith('term_bank_'):
                rows = json.loads(data)
                for row in rows:
                    row[3] = TAGS
                data = json.dumps(rows, ensure_ascii=False).encode('utf-8')
            zout.writestr(info.filename, data)


if __name__ == '__main__':
    main()
