#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Fetches the public-domain texts of README.md (Measurements 4) from
# Ukrainian Wikisource as plain text, one '### <page title> (revid N)'
# section per page, in title order:
#
#   python3 languages/uk/sources/fetch-wikisource.py "<page title prefix>" <out.txt>
#
# The two prefixes measured are "Твори (Коцюбинський, 1955)/2/" and
# "Твори (Франко, 1956–1962)/13/Захар Беркут". The text is the parsed page
# with markup, footnote markers and page numbers removed.

import html, json, re, sys, time, urllib.parse, urllib.request

API = 'https://uk.wikisource.org/w/api.php'
HEADERS = {'User-Agent': 'hoshidicts languages/uk measurements (https://github.com/bee-san/hoshidicts)'}


def get(params):
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
                return json.load(r)
        except OSError:
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f'cannot fetch {url}')


def main():
    prefix, out = sys.argv[1:3]
    pages, cont = [], {}
    while True:
        d = get({'action': 'query', 'list': 'allpages', 'apprefix': prefix, 'apnamespace': 0, 'aplimit': 500, 'format': 'json', **cont})
        pages += [p['title'] for p in d['query']['allpages']]
        if 'continue' not in d:
            break
        cont = d['continue']
    texts = []
    for title in pages:
        d = get({'action': 'parse', 'page': title, 'prop': 'text|revid', 'format': 'json', 'formatversion': 2})
        h = d['parse']['text']
        h = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h, flags=re.S)
        h = re.sub(r'<sup[^>]*class="reference"[^>]*>.*?</sup>', ' ', h, flags=re.S)
        h = re.sub(r'<span[^>]*class="pagenum[^"]*"[^>]*>.*?</span>', ' ', h, flags=re.S)
        h = re.sub(r'<(br|p|div|li|tr|h\d)[^>]*>', '\n', h)
        h = html.unescape(re.sub(r'<[^>]+>', '', h))
        texts.append(f"### {title} (revid {d['parse']['revid']})\n{h}")
        time.sleep(0.5)
    open(out, 'w', encoding='utf-8').write('\n'.join(texts))
    print(f'{len(pages)} pages to {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
