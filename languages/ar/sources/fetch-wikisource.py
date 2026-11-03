#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fetches the subpages of a Wikisource book as plain text, for the real-text
measurements of README.md (Measurements), and cleans them.

    python3 languages/ar/sources/fetch-wikisource.py <out.txt> <book title>
    python3 languages/ar/sources/fetch-wikisource.py --clean <raw.txt> <out.txt>

The first form writes the pages of https://ar.wikisource.org/wiki/<book
title>/... in title order to <out.txt> and their revision ids to
<out.txt>.revisions (one "title<TAB>revid" per line), pausing 3 seconds per
page. The second drops what is not the book's text: the navigation lines at
the top of a page (→ previous, next ←, the book title between zero-width
spaces, المؤلف ..., ../ ...), and every sentence of five words or more that
already occurred (where pages overlap).
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request

API = 'https://ar.wikisource.org/w/api.php'
UA = {'User-Agent': 'hachi-lang-ar/1.0 (hoshidicts Arabic pack measurements)'}


def get(params):
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            time.sleep(min(120, 10 * 2 ** attempt))
            err = e
    raise err


def main():
    out, prefix = sys.argv[1], sys.argv[2]
    pages = get({'action': 'query', 'list': 'allpages', 'apprefix': prefix + '/', 'aplimit': '500', 'format': 'json'})['query']['allpages']
    titles = [p['title'] for p in pages]
    texts = []
    revisions = []
    for title in titles:
        d = get({'action': 'parse', 'page': title, 'prop': 'text|revid', 'format': 'json', 'disabletoc': '1'})
        revisions.append('%s\t%s' % (title, d['parse']['revid']))
        body = d['parse']['text']['*']
        body = re.sub(r'<(script|style|table)[^>]*>.*?</\1>', ' ', body, flags=re.S)
        body = re.sub(r'<sup[^>]*>.*?</sup>', ' ', body, flags=re.S)
        body = re.sub(r'<br\s*/?>|</p>|</div>|</li>|</h\d>', '\n', body)
        body = re.sub(r'<[^>]+>', ' ', body)
        texts.append(html.unescape(body))
        time.sleep(3)
    text = '\n'.join(texts)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(text)
    with open(out + '.revisions', 'w', encoding='utf-8') as f:
        f.write('\n'.join(revisions) + '\n')
    words = re.findall('[\u0621-\u064A\u064B-\u065F\u0670\u0640]+', text)
    print('%d pages, %d Arabic words' % (len(titles), len(words)))


WORD = re.compile('[\u0621-\u064A\u064B-\u065F\u0670\u0640]+')
SENTENCE_END = re.compile('([.!?\u061F\u06D4\u2026:\u061B]+)')


def clean(text):
    out, seen = [], set()
    navigation = repeated = 0
    for line in text.split('\n'):
        s = ' '.join(line.replace('\u200b', ' ').split())
        if '\u2192' in s or '\u2190' in s or s.startswith('../') or s.startswith('\u0627\u0644\u0645\u0624\u0644\u0641') or '\u200b' in line:
            navigation += len(WORD.findall(s))
            continue
        parts = SENTENCE_END.split(line)
        keep = []
        for i in range(0, len(parts), 2):
            words = WORD.findall(parts[i])
            key = ' '.join(words)
            if len(words) >= 5 and key in seen:
                repeated += len(words)
                continue
            if len(words) >= 5:
                seen.add(key)
            keep.append(parts[i] + (parts[i + 1] if i + 1 < len(parts) else ''))
        out.append(''.join(keep))
    return '\n'.join(out), navigation, repeated


if __name__ == '__main__':
    if sys.argv[1] == '--clean':
        raw = open(sys.argv[2], encoding='utf-8').read()
        text, navigation, repeated = clean(raw)
        open(sys.argv[3], 'w', encoding='utf-8').write(text)
        print('%d -> %d Arabic words: %d in navigation lines, %d in repeated sentences' % (
            len(WORD.findall(raw)), len(WORD.findall(text)), navigation, repeated))
    else:
        main()
