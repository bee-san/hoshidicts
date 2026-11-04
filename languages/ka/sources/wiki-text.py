#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measurement inputs for README.md (Measurements) from Wikimedia dumps. Not run by any test.

    python3 wiki-text.py freq <kawiki-...-pages-articles.xml.bz2> <out.tsv>
    python3 wiki-text.py pages <kawikisource-...-pages-articles.xml.bz2> <out dir> <title regex>
    python3 wiki-text.py hyphen <kawiki-...-pages-articles.xml.bz2> <out.tsv>

freq counts the Georgian words (runs of Mkhedruli letters, lower-cased from
Mtavruli) of every article (namespace 0) after removing templates, tables,
references, links' targets and other markup, and writes "word<TAB>count",
most frequent first. pages writes the text of each main-namespace page whose
title matches the regex to <out dir>/<n>.txt, with the title on the first
line, markup removed the same way. hyphen writes "word<TAB>count<TAB>after
<TAB>before": a word's tokens right after a hyphen that follows a non-space
(Apple-ის) and right before "-" and a digit (მე-19).
"""
import bz2
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter

NS = '{http://www.mediawiki.org/xml/export-0.11/}'
WORD = re.compile(r'[\u10D0-\u10FA\u10FC-\u10FF\u1C90-\u1CBA\u1CBD-\u1CBF]+')


def clean(text):
    text = re.sub(r'<!--.*?-->', ' ', text, flags=re.S)
    text = re.sub(r'<ref[^>]*/>', ' ', text)
    text = re.sub(r'<ref.*?</ref>', ' ', text, flags=re.S)
    for _ in range(4):  # nested templates
        text = re.sub(r'\{\{[^{}]*\}\}', ' ', text)
    text = re.sub(r'\{\|.*?\|\}', ' ', text, flags=re.S)
    text = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', text)
    text = re.sub(r'\[https?://[^\s\]]*\s?([^\]]*)\]', r'\1', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r"'{2,}", '', text)
    text = re.sub(r'^[=*#:;|!].*$', lambda m: m.group(0).lstrip('=*#:;|!').rstrip('='), text, flags=re.M)
    return text


def pages(path):
    with bz2.open(path, 'rb') as f:
        title, ns = None, None
        for _, elem in ET.iterparse(f, events=('end',)):
            tag = elem.tag[len(NS):] if elem.tag.startswith(NS) else elem.tag
            if tag == 'title':
                title = elem.text
            elif tag == 'ns':
                ns = elem.text
            elif tag == 'text':
                if ns == '0' and elem.text and not elem.text.lstrip().lower().startswith('#redirect') and not elem.text.lstrip().startswith('#გადამისამართება'):
                    yield title, elem.text
            elif tag == 'page':
                elem.clear()


def main():
    mode = sys.argv[1]
    if mode == 'freq':
        counts = Counter()
        n = 0
        for _, text in pages(sys.argv[2]):
            counts.update(w.lower() for w in WORD.findall(clean(text)))
            n += 1
        with open(sys.argv[3], 'w', encoding='utf-8') as out:
            for word, count in counts.most_common():
                out.write(f'{word}\t{count}\n')
        print(f'{n} articles, {sum(counts.values())} tokens, {len(counts)} types', file=sys.stderr)
    elif mode == 'hyphen':
        counts, after, before = Counter(), Counter(), Counter()
        for _, text in pages(sys.argv[2]):
            text = clean(text)
            for m in WORD.finditer(text):
                w = m.group(0).lower()
                counts[w] += 1
                i, j = m.start(), m.end()
                if i > 1 and text[i - 1] == '-' and not text[i - 2].isspace():
                    after[w] += 1
                if re.match(r'-\s?\d', text[j:j + 3]):
                    before[w] += 1
        with open(sys.argv[3], 'w', encoding='utf-8') as out:
            for word, count in counts.most_common():
                if after[word] or before[word]:
                    out.write(f'{word}\t{count}\t{after[word]}\t{before[word]}\n')
    elif mode == 'pages':
        pattern = re.compile(sys.argv[4])
        n = 0
        for title, text in pages(sys.argv[2]):
            if pattern.search(title):
                n += 1
                with open(f'{sys.argv[3]}/{n}.txt', 'w', encoding='utf-8') as out:
                    out.write(title + '\n' + clean(text))
        print(f'{n} pages', file=sys.stderr)


main()
