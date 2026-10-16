#!/usr/bin/env python3
"""Writes small_dict.zip, the Yomitan dictionary used by import_equivalence_test.

The archive is deterministic (fixed timestamps, fixed entry order, fixed
compression) so the golden hashes in golden.sha256 stay valid when it is
regenerated. Run from any directory:

    python3 tests/fixtures/yomitan/gen_fixture.py

Every bank kind the importer reads is present, plus a stylesheet and media so
the equivalence test covers blobs.bin, hash.table, bloom.filter, media.bin,
media.idx and dict.zstd.
"""
import json
import os
import zipfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "small_dict.zip")
STAMP = (2020, 1, 1, 0, 0, 0)

# 1x1 PNG, opaque white.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8ffff3f0005fe02fea72d5a5e0000000049454e44ae426082"
)


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def structured(text, extra=None):
    content = [{"tag": "span", "style": {"fontWeight": "bold"}, "content": text}]
    if extra:
        content.append({"tag": "div", "data": {"kind": "note"}, "content": extra})
    return {"type": "structured-content", "content": {"tag": "div", "content": content}}


def term_bank_1():
    terms = []
    # Enough long glossaries to let the zstd trainer produce a dictionary.
    for i in range(48):
        gloss = "語釈 {}: これはテスト用の見出し語の説明文です。".format(i) + "同じ語尾を繰り返します。" * 3
        terms.append(["見出し{}".format(i), "みだし{}".format(i), "n", "", 100 - i, [gloss], i + 1, "P"])
    terms.append(["食べる", "たべる", "v1", "v1", 50, ["to eat", structured("食べる", "Ichidan verb")], 1000, ""])
    terms.append(["食べる", "たべる", "v1", "v1", 40, ["to eat"], 1000, ""])  # duplicate glossary text
    terms.append(["猫", "ねこ", "n", "", 10, [{"type": "image", "path": "img/neko.png", "width": 1, "height": 1}], 1001, ""])
    terms.append(["日本", "にほん", None, "", 0, ["Japan"], 1002, "P"])
    terms.append(["日本", "にっぽん", "n", "", 0, ["Japan"], 1002, ""])
    terms.append(["同形", "", "n", "", 0, ["reading omitted"], 1003, ""])
    return terms


def term_bank_2():
    return [
        ["走る", "はしる", "v5", "v5", 5, ["to run"], 2000, ""],
        ["走る", "はしる", "v5", "v5", 5, ["to run"], 2000, ""],  # exact duplicate entry
        ["\"quoted\" [brackets] \\backslash", "quoted", "", "", 0, ["escapes \"\\ 【】"], 2001, ""],
    ]


def term_meta_bank_1():
    return [
        ["食べる", "freq", 12],
        ["食べる", "freq", {"reading": "たべる", "frequency": {"value": 12, "displayValue": "12㋕"}}],
        ["猫", "freq", {"value": 3, "displayValue": "3"}],
        ["食べる", "pitch", {"reading": "たべる", "pitches": [{"position": 2}, {"position": 0, "nasal": [1], "devoice": []}]}],
        ["日本", "ipa", {"reading": "にほん", "transcriptions": [{"ipa": "ɲihoɰ̃"}]}],
    ]


def kanji_bank_1():
    return [
        ["食", "ショク ジキ", "く.う た.べる", "jouyou", ["eat", "food"], {"grade": "2", "strokes": "9"}],
        ["猫", "ビョウ", "ねこ", "jouyou", ["cat"], {"grade": "8"}],
    ]


def kanji_meta_bank_1():
    return [["食", "freq", 7], ["猫", "freq", {"value": 9, "displayValue": "9"}]]


def tag_bank_1():
    return [["n", "partOfSpeech", -3, "noun", 0], ["v1", "partOfSpeech", -3, "Ichidan verb", 0], ["P", "popular", -10, "common", 10]]


def main():
    entries = [
        ("index.json", dumps({
            "title": "Hoshidicts Fixture",
            "revision": "fixture-1",
            "format": 3,
            "sequenced": True,
            "author": "hoshidicts tests",
            "description": "Deterministic fixture for the import equivalence test.",
            "sourceLanguage": "ja",
            "targetLanguage": "en",
            "frequencyMode": "rank-based",
        }).encode()),
        ("styles.css", b".mdict-yomitan-content { color: #333; }\n"),
        ("term_bank_1.json", dumps(term_bank_1()).encode()),
        ("term_bank_2.json", dumps(term_bank_2()).encode()),
        ("term_meta_bank_1.json", dumps(term_meta_bank_1()).encode()),
        ("kanji_bank_1.json", dumps(kanji_bank_1()).encode()),
        ("kanji_meta_bank_1.json", dumps(kanji_meta_bank_1()).encode()),
        ("tag_bank_1.json", dumps(tag_bank_1()).encode()),
        ("img/", b""),
        ("img/neko.png", PNG),
        ("audio/neko.txt", b"stored, not deflated"),
    ]
    with zipfile.ZipFile(OUT, "w") as zf:
        for name, data in entries:
            info = zipfile.ZipInfo(name, date_time=STAMP)
            info.create_system = 3
            if name.endswith("/"):
                info.external_attr = 0o40755 << 16
                zf.writestr(info, b"")
                continue
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_STORED if name.startswith("audio/") else zipfile.ZIP_DEFLATED
            zf.writestr(info, data, compresslevel=9)
    print(OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
