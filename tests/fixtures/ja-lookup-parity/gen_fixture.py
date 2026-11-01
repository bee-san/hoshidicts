#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes the dictionaries of ja-lookup-parity (docs/languages.md, 11.3) as
Yomitan JSON banks, one directory each:

    python3 tests/fixtures/ja-lookup-parity/gen_fixture.py

- main/    term, frequency, pitch (and IPA) and kanji banks: every lemma of
           languages/ja/tests/yomitan.tsv and cases.tsv with its part of
           speech, a second reading for some, kana spellings, nouns that
           shorter prefixes find, entries whose part of speech fails the
           filter, a key longer than 16 code points, and terms only the
           frequency and pitch rows have (for metadata_only_terms).
- second/  a second Japanese dictionary that shares some words with other
           readings and scores, with its own frequencies and kanji.
- english/ a small English dictionary for the Latin generated strings.

The content is synthetic (readings are made up from code points, glosses
name the word), so it carries no third-party data. The test zips each
directory into a stored archive and imports it at run time.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PACK_TESTS = os.path.join(ROOT, "languages", "ja", "tests")

# The long key (20 code points) and the inputs around it live in the test.
LONG_KEY = "長い長い長い長い名前の付いた料理を食べる"


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def is_kana(ch):
    return 0x3040 <= ord(ch) <= 0x30FF


def reading_of(word, salt=0):
    """A made-up hiragana reading: kana kept, every other code point mapped
    to a hiragana by its value (and the salt)."""
    out = []
    for ch in word:
        if 0x3041 <= ord(ch) <= 0x3096:
            out.append(ch)
        elif 0x30A1 <= ord(ch) <= 0x30F6:
            out.append(chr(ord(ch) - 0x60))
        else:
            out.append(chr(0x3042 + (ord(ch) * 7 + salt) % 80))
    return "".join(out)


def corpus_rows():
    rows = []
    for name in ("yomitan.tsv", "cases.tsv"):
        with open(os.path.join(PACK_TESTS, name), encoding="utf-8") as f:
            for line in f:
                line = line.rstrip("\n")
                if not line or line.startswith("#"):
                    continue
                category, valid, source, term, rule, reasons = line.split("\t")
                rows.append((category, valid == "1", source, term, rule, reasons))
    return rows


def write_bank(directory, name, rows, size=500):
    for i in range(0, max(len(rows), 1), size):
        chunk = rows[i:i + size]
        if not chunk:
            break
        with open(os.path.join(directory, f"{name}_{i // size + 1}.json"), "w", encoding="utf-8") as f:
            f.write("[\n" + ",\n".join(dumps(r) for r in chunk) + "\n]\n")


def write_index(directory, title, extra=None):
    index = {"title": title, "format": 3, "revision": "1", "sequenced": False}
    if extra:
        index.update(extra)
    with open(os.path.join(directory, "index.json"), "w", encoding="utf-8") as f:
        f.write(dumps(index) + "\n")


def clean(directory):
    os.makedirs(directory, exist_ok=True)
    for name in os.listdir(directory):
        if name.endswith(".json"):
            os.remove(os.path.join(directory, name))


def main():
    rows = corpus_rows()
    lemmas = []  # (term, rule) in first-seen order
    seen = set()
    sources = []
    for _, valid, source, term, rule, _ in rows:
        sources.append(source)
        if valid and term not in seen:
            seen.add(term)
            lemmas.append((term, rule if rule in ("v1", "v5", "vk", "vs", "vz", "adj-i") else ""))
    extra_words = [
        ("そんな", ""), ("こんにゃく", "n"), ("出来る", "v1"), ("分かる", "v5"), ("凝る", "v5"), ("俺", "n"),
        ("東京", "n"), ("日本語", "n"), ("勉強", "vs n"), ("景色", "n"), ("美しい", "adj-i"), ("走り出す", "v5"),
        ("走る", "v5"), ("食", "n"), ("食べ物", "n"), ("辞書", "n"), ("言葉", "n"), ("見つける", "v1"),
        ("にゃあ", ""), ("竹刀", "n"), ("市内", "n"), ("次第", "n"), ("姉妹", "n"), ("おじゃん", "n"),
        ("球菜", "n"), ("なぁ", ""), ("まぁ", ""), ("です", ""), ("ですら", ""), (LONG_KEY, "v1"),
    ]
    for word, rule in extra_words:
        if word not in seen:
            seen.add(word)
            lemmas.append((word, rule))

    # --- main -------------------------------------------------------------
    main_dir = os.path.join(HERE, "main")
    clean(main_dir)
    terms = []
    for i, (word, rule) in enumerate(lemmas):
        reading = word if all(is_kana(c) for c in word) else reading_of(word)
        score = [0, 1, 5, -1, 3, 0, 2][i % 7]
        tags = ["", "common", "P", ""][i % 4]
        glossary = [f"{word} ({i})"] if i % 3 else [f"{word} first", f"{word} second"]
        terms.append([word, reading, tags, rule, score, glossary, i + 1, "P" if i % 5 == 0 else ""])
        if i % 7 == 3:
            # A second reading of the same spelling.
            terms.append([word, reading_of(word, 13), "", rule, score + 1, [f"{word} other reading"], i + 1, ""])
        if i % 5 == 1 and not all(is_kana(c) for c in word):
            # The kana spelling, found through the kana processor.
            terms.append([reading, reading, "", rule, 0, [f"{word} in kana"], i + 1, ""])
        if i % 6 == 2:
            # A second glossary row of the same term, lower score.
            terms.append([word, reading, "", rule, score - 2, [f"{word} more"], i + 1, ""])
    # Nouns that shorter prefixes find, and entries whose part of speech fails.
    nouns = []
    for k, source in enumerate(sources):
        for length in (1, 2):
            head = source[:length]
            if len(head) == length and head not in seen:
                seen.add(head)
                nouns.append(head)
    for k, noun in enumerate(nouns):
        rule = ["n", "", "n", "adj-na"][k % 4]
        terms.append([noun, reading_of(noun, 3), "", rule, k % 3, [f"{noun} noun"], 10000 + k, ""])
    wrong = 0
    for _, valid, source, term, rule, _ in rows:
        if not valid or wrong >= 200:
            continue
        # The lemma spelled with another part of speech: the filter must
        # decide it again.
        if rule == "v5":
            terms.append([term, reading_of(term, 5), "", "adj-i", 0, [f"{term} as adjective"], 20000 + wrong, ""])
            wrong += 1
        elif rule == "v1":
            terms.append([term, reading_of(term, 5), "", "v5", 0, [f"{term} as godan"], 20000 + wrong, ""])
            wrong += 1
    write_bank(main_dir, "term_bank", terms)

    meta = []
    for i, (word, rule) in enumerate(lemmas):
        reading = word if all(is_kana(c) for c in word) else reading_of(word)
        if i % 3 == 0:
            meta.append([word, "freq", {"reading": reading, "frequency": {"value": 100 + i, "displayValue": f"{100 + i}"}}])
        elif i % 3 == 1:
            meta.append([word, "freq", 5000 - i])
        if i % 11 == 4:
            meta.append([word, "freq", {"value": 40 + i % 9, "displayValue": f"{40 + i % 9}㋕"}])
        if i % 4 == 0:
            meta.append([word, "pitch", {"reading": reading, "pitches": [{"position": i % 4}, {"position": (i + 1) % 5, "nasal": 1}]}])
        if i % 9 == 2:
            meta.append([word, "ipa", {"reading": reading, "transcriptions": [{"ipa": f"[{reading}]", "tags": []}]}])
    # Terms only the frequency and pitch rows have, longer than the words
    # around them: 東京タワー (with 東京 a term), 食べ放題 (食べ), the corpus
    # sources' first three code points for some.
    for k, (word, reading) in enumerate([("東京タワー", "とうきょうたわー"), ("食べ放題", "たべほうだい"),
                                         ("日本語学校", "にほんごがっこう"), ("辞書引き", ""),
                                         ("美しい景色", "うつくしいけしき")]):
        if reading:
            meta.append([word, "freq", {"reading": reading, "frequency": 70 + k}])
            meta.append([word, "pitch", {"reading": reading, "pitches": [{"position": k}]}])
        else:
            meta.append([word, "freq", 90 + k])
    for k, source in enumerate(sources[::37]):
        head = source[:3]
        if len(head) == 3 and head not in seen:
            seen.add(head)
            meta.append([head, "freq", 3000 + k])
    write_bank(main_dir, "term_meta_bank", meta)

    kanji = []
    kanji_seen = set()
    for word, _ in lemmas:
        for ch in word:
            if 0x4E00 <= ord(ch) <= 0x9FFF and ch not in kanji_seen:
                kanji_seen.add(ch)
    kanji_meta = []
    for k, ch in enumerate(sorted(kanji_seen)):
        kanji.append([ch, "オン" if k % 2 else "オン ヨミ", "くん" if k % 3 else "", "jouyou" if k % 2 else "",
                      [f"meaning of {ch}", "second"] if k % 4 == 0 else [f"meaning of {ch}"],
                      {"strokes": str(k % 20 + 1), "grade": str(k % 9)}])
        if k % 2 == 0:
            kanji_meta.append([ch, "freq", k + 1])
    write_bank(main_dir, "kanji_bank", kanji)
    write_bank(main_dir, "kanji_meta_bank", kanji_meta)
    write_index(main_dir, "Parity A", {"frequencyMode": "rank-based"})

    # --- second -----------------------------------------------------------
    second_dir = os.path.join(HERE, "second")
    clean(second_dir)
    second_terms = []
    second_meta = []
    for i, (word, rule) in enumerate(lemmas):
        if i % 4 == 1:
            # Same reading: merges with Parity A's term.
            reading = word if all(is_kana(c) for c in word) else reading_of(word)
            second_terms.append([word, reading, "", rule, i % 4, [f"{word} (B)"], i + 1, ""])
        elif i % 4 == 2:
            # Another reading: a term of its own.
            second_terms.append([word, reading_of(word, 29), "", rule, 2, [f"{word} (B, other)"], i + 1, ""])
        if i % 5 == 0:
            second_meta.append([word, "freq", 1000 + i])
    for k, noun in enumerate(nouns[::3]):
        second_terms.append([noun, reading_of(noun, 3), "", "n", 1, [f"{noun} (B noun)"], 30000 + k, ""])
    write_bank(second_dir, "term_bank", second_terms)
    write_bank(second_dir, "term_meta_bank", second_meta)
    write_bank(second_dir, "kanji_bank", [[ch, "セカンド", "", "", [f"{ch} in B"], {}] for ch in sorted(kanji_seen)[::5]])
    write_index(second_dir, "Parity B")

    # --- english ----------------------------------------------------------
    english_dir = os.path.join(HERE, "english")
    clean(english_dir)
    words = ["walk", "walked", "run", "a", "ab", "abc", "test", "kana", "neko", "Walk", "xyz", "ｗａｌｋ", "ａｂｃ",
             "1", "１２", "go", "went", "cat", "cats", "nya"]
    english = [[w, "", "", "v" if w in ("walk", "run", "go") else "", 0, [f"English {w}"], k + 1, ""]
               for k, w in enumerate(words)]
    write_bank(english_dir, "term_bank", english)
    write_bank(english_dir, "term_meta_bank", [["walk", "freq", 7], ["cat", "freq", 9]])
    write_index(english_dir, "Parity E")

    print(f"main: {len(terms)} terms, {len(meta)} meta rows, {len(kanji)} kanji; "
          f"second: {len(second_terms)} terms; english: {len(english)} terms")


if __name__ == "__main__":
    main()
