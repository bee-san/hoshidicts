#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
r"""Fetches a work from ru.wikisource.org as plain text (the texts of README.md,
Measurements), with a manifest of page titles, revision ids, the text's sha256
and its word count in <out>.json. Not run by any test.

  python3 languages/ru/sources/fetch-wikisource.py <work title> <out.txt> [<page title regex>]

  "Капитанская дочка (Пушкин)" kapitanskaya-dochka.txt '/1960 \(СО\)/Глава [IVX]+$'
  "Дуэль (Чехов)" duel.txt '^Дуэль \(Чехов\)$'
  "Палата № 6 (Чехов)" palata6.txt '/Глава [IVX]+$'

The pages are fetched at their current revision; the manifest records which.
"""
import hashlib, html, json, re, sys, time, urllib.parse, urllib.request

API = 'https://ru.wikisource.org/w/api.php'
UA = 'hoshidicts-ru-pack/1.0 (language pack measurement; https://github.com/bee-san/hoshidicts)'


def api(**params):
    params['format'] = 'json'
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # retry with backoff
            time.sleep(2 ** attempt)
            last = e
    raise last


def subpages(prefix):
    out, cont = [], {}
    while True:
        d = api(action='query', list='allpages', apprefix=prefix + '/', apnamespace=0, aplimit=500, **cont)
        out += [p['title'] for p in d['query']['allpages']]
        if 'continue' not in d:
            return out
        cont = {'apcontinue': d['continue']['apcontinue']}


def text_of(title):
    d = api(action='parse', page=title, prop='text|revid', disabletoc=1, disableeditsection=1)
    if 'error' in d:
        return None, None
    h = d['parse']['text']['*']
    h = re.sub(r'<(style|script)[^>]*>.*?</\1>', ' ', h, flags=re.S)
    h = re.sub(r'<(table|sup)[^>]*>.*?</\1>', ' ', h, flags=re.S)  # navigation boxes, footnote marks
    h = re.sub(r'<br\s*/?>|</p>|</div>|</h\d>', '\n', h)
    t = html.unescape(re.sub(r'<[^>]+>', '', h))
    t = re.sub(r'[ \t\u00A0]+', ' ', t)
    t = re.sub(r'\n\s*\n+', '\n', t)
    return t.strip(), d['parse']['revid']


def main():
    work, out = sys.argv[1], sys.argv[2]
    keep = re.compile(sys.argv[3]) if len(sys.argv) > 3 else None
    titles = [work] + sorted(subpages(work))
    if keep is not None:
        titles = [t for t in titles if keep.search(t)]
    parts, manifest = [], []
    for t in titles:
        text, rev = text_of(t)
        if not text:
            continue
        parts.append(text)
        manifest.append({'title': t, 'revid': rev})
        time.sleep(0.3)
    body = '\n\n'.join(parts) + '\n'
    open(out, 'w', encoding='utf-8').write(body)
    sha = hashlib.sha256(body.encode('utf-8')).hexdigest()
    words = len(re.findall(r'[А-Яа-яЁё]+', body))
    json.dump({'work': work, 'pages': manifest, 'sha256': sha, 'words': words}, open(out + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(work, len(manifest), 'pages', words, 'words', sha[:16])


if __name__ == '__main__':
    main()
