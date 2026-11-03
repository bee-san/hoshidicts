#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes a copy of a Yomitan dictionary zip whose term rows all carry the
given `rules` tags (default: the pack's four dictionary-form conditions).

wiktionary-to-yomitan leaves the `rules` column of wty-sh-en empty, so a
deinflection with conditions finds none of its terms (docs/languages.md 9.4).
`lookup.untaggedTerms: "pass"` (hachi-lang-engine-j) reads an untagged term as
if it had every dictionary-form condition of the pack; this copy gives every
row exactly those tags, so lookups and eval-language with it measure what
that setting does, before it is on main. Numbers from the copy are labelled
as such in README.md.

    python3 languages/sh/sources/tag-all-rows.py <wty-sh-en.zip> <out.zip> [tags]
"""

import json
import sys
import zipfile


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    source, out = argv[1], argv[2]
    tags = argv[3] if len(argv) > 3 else 'v n adj pron'
    rows = 0
    with zipfile.ZipFile(source) as zin, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename.startswith('term_bank_') and info.filename.endswith('.json'):
                bank = json.loads(data)
                for row in bank:
                    row[3] = tags
                rows += len(bank)
                data = json.dumps(bank, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            elif info.filename == 'index.json':
                index = json.loads(data)
                index['title'] = f"{index['title']} (rules: {tags})"
                data = json.dumps(index, ensure_ascii=False, indent=2).encode('utf-8')
            zout.writestr(info.filename, data)
    print(f'{rows} rows tagged "{tags}" in {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
