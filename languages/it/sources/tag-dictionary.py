#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""A copy of a Yomitan dictionary whose term rows carry every dictionary-form
condition of the pack in their `rules` column. Not run by any test.

    python3 tag-dictionary.py <in.zip> <out.zip> <title> [conditions]

wiktionary-to-yomitan writes no `rules` for Italian (wty-it-en has none on
any of its rows), so a deinflection with conditions finds no term of it
(docs/languages.md 7.2, 9.4). The framework change `lookup.untaggedTerms:
"pass"` (hachi-lang-engine-j, adopted by hachi-lang-lead on 2026-11-03) lets
an untagged term pass as if it carried every condition with
`isDictionaryForm: true`; for this pack those are v, n, adj and adv (the
default). A copy with exactly those tags on every row gives the same
lookups, so the README's labelled "pass" numbers are measured with it until
the field is on main. Rows that already have a `rules` value are left alone.
"""
import json
import sys
import zipfile

src, dst, title = sys.argv[1:4]
tags = sys.argv[4] if len(sys.argv) > 4 else "v n adj adv"
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "index.json":
            index = json.loads(data)
            index["title"] = title
            index.pop("indexUrl", None)
            index.pop("downloadUrl", None)
            index["isUpdatable"] = False
            data = json.dumps(index, ensure_ascii=False, indent=2).encode()
        elif item.filename.startswith("term_bank_"):
            rows = json.loads(data)
            for row in rows:
                if not row[3]:
                    row[3] = tags
            data = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode()
        zout.writestr(item.filename, data)
print(f"{dst}: rules '{tags}' on every untagged row, title {title!r}")
