#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Writes the measurement copy `wty-el-en-tagged` of README.md: wty-el-en with
# every empty part-of-speech (`rules`) column set to "v n adj", which is what
# `lookup.untaggedTerms: "pass"` (bee-san/hoshidicts#58) makes of those rows
# for this pack: an untagged row then carries every dictionary-form condition
# of transforms.json (v, n, adj). Not run by any test; not for distribution.
#
#   python3 languages/el/sources/tag-dictionary.py <wty-el-en.zip> <out.zip>
#   build/hoshidicts-cli import <out.zip>      # writes wty-el-en-tagged/ beside it

import json, sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
changed = 0
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_STORED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'index.json':
            index = json.loads(data)
            index['title'] = 'wty-el-en-tagged'
            index['description'] = 'wty-el-en with every empty part-of-speech column set to "v n adj" (measurement copy).'
            data = json.dumps(index, ensure_ascii=False).encode()
        elif item.filename.startswith('term_bank_'):
            rows = json.loads(data)
            for row in rows:
                if row[3] == '':
                    row[3] = 'v n adj'
                    changed += 1
            data = json.dumps(rows, ensure_ascii=False).encode()
        zout.writestr(item.filename, data)
print(f'{dst}: {changed} rows tagged')
