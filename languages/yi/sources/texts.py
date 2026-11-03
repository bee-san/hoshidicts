#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Texts for the Yiddish measurements: pages of a Yiddish Wikisource or
Wikipedia dump as plain text, Tatoeba sentences, and the words of a text as
a host segments them (runs of the pack's word characters, gershayim inside a
word kept). Nothing these functions read is committed."""

import bz2
import json
import re
import xml.etree.ElementTree as ET

NS = '{http://www.mediawiki.org/xml/export-0.11/}'
LETTERS = '\u05D0-\u05EA\u05F0-\u05F2\uFB1D-\uFB28\uFB2A-\uFB4F'
POINTS = '\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7'
WORD = re.compile(f'[{LETTERS}{POINTS}]+(?:[\u05F4"][{LETTERS}{POINTS}]+)*')
SENTENCE_END = re.compile(r'[.!?…]')

# Pages of Yiddish Wikisource used as real text: works published before 1931
# (public domain in the United States) in Wikisource's modern (YIVO) spelling.
REAL_TEXT_PAGES = [
    'קיצור מסעות בנימין השלישי/מאָדערנער אויסלייג',              # Mendele Moykher-Sforim, 1878
    'הערשעלע אָסטראָפּאָלער און מאָטקע חב״ד/מאָדערנער אויסלייג',  # M. Stern, New York, 1920s
    'מאָטקע חב״ד/מאָדערנער אויסלייג',                            # M. Stern, New York, 1920s
]


def clean(text):
    """Wikitext as rough plain text."""
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    text = re.sub(r'<ref[^>]*/>', '', text)
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.S)
    for _ in range(3):
        text = re.sub(r'\{\{[^{}]*\}\}', '', text)
    text = re.sub(r'\{\|.*?\|\}', '', text, flags=re.S)
    text = re.sub(r'\[\[(?:קאַטעגאָריע|קאטעגאריע|Category|טעקע|בילד|File|Image|Media)[^\]]*\]\]', '', text)
    text = re.sub(r'\[\[[^\]|]*\|([^\]]*)\]\]', r'\1', text)
    text = re.sub(r'\[\[([^\]]*)\]\]', r'\1', text)
    text = re.sub(r'\[https?://[^\s\]]*\s*([^\]]*)\]', r'\1', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r"'''?", '', text)
    text = re.sub(r'^[=*#:;]+', '', text, flags=re.M)
    return re.sub(r'=+\s*$', '', text, flags=re.M)


def dump_pages(path):
    """(title, revision id, plain text) of every main-namespace article of a dump."""
    with bz2.open(path, 'rb') as f:
        for _, el in ET.iterparse(f):
            if el.tag != NS + 'page':
                continue
            if el.find(NS + 'ns').text == '0':
                title = el.find(NS + 'title').text
                revision = el.find(NS + 'revision')
                text = revision.find(NS + 'text').text or ''
                if not re.match(r'\s*#(redirect|ווייטערפירן)', text, flags=re.I):
                    yield title, revision.find(NS + 'id').text, clean(text)
            el.clear()


def tatoeba(path):
    """Sentences of a Tatoeba per-language export (id, lang, text)."""
    with bz2.open(path, 'rt', encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) == 3:
                yield parts[2]


def words(text):
    """(start, end, word) of the words of a text."""
    for m in WORD.finditer(text):
        yield m.start(), m.end(), m.group()


# Reference rules of wty-yi-en that name another spelling or another word, not an inflection.
SPELLING_TAGS = {'alternative', 'alt-of', 'nonstandard', 'obsolete', 'Daytshmerish', 'female equivalent', 'dialectal',
                 'misspelling', 'abbreviation', 'Clitic form', 'alternative contraction', 'contracted-dem-form'}


def gloss_text(node):
    """The visible text of a structured-content node, without examples and backlinks."""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return ' '.join(gloss_text(n) for n in node)
    if isinstance(node, dict):
        if node.get('data', {}).get('content') in ('backlink', 'preamble', 'details-entry-examples', 'extra-info'):
            return ''
        return gloss_text(node.get('content', ''))
    return ''


UNPOINTED = re.compile(r'Unpointed form of (\S+)')


def unpointed_of(bank_dir):
    """{headword: the pointed lemma} for wty-yi-en's entries defined as "Unpointed form of <lemma>"."""
    import glob
    import os
    out = {}
    for path in sorted(glob.glob(os.path.join(bank_dir, 'term_bank_*.json'))):
        with open(path, encoding='utf-8') as f:
            for row in json.load(f):
                for d in row[5]:
                    if not isinstance(d, list):
                        m = UNPOINTED.search(gloss_text(d))
                        if m:
                            out.setdefault(row[0], set()).add(m.group(1))
    return out


def headwords(bank_dir, inflection_only=False):
    """wty-yi-en: {headword: [(rules, [form-of lemma, ...], has definitions)]}; with inflection_only, only the
    references whose rules name an inflection."""
    import glob
    import os
    out = {}
    for path in sorted(glob.glob(os.path.join(bank_dir, 'term_bank_*.json'))):
        with open(path, encoding='utf-8') as f:
            for row in json.load(f):
                refs = [d[0] for d in row[5] if isinstance(d, list) and len(d) == 2 and isinstance(d[0], str) and d[0]
                        and (not inflection_only or not SPELLING_TAGS & set(d[1]))]
                defs = any(not isinstance(d, list) for d in row[5])
                out.setdefault(row[0], []).append((row[3], refs, defs))
    return out
