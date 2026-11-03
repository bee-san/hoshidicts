#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes texts/sr-gutenberg.txt, the Serbian text that measure-all.sh looks
up, from the plain-text UTF-8 files of Project Gutenberg #11291, #11292 and
#15008 (README.md, Sources and licences): for each, the lines between its
"*** START OF" and "*** END OF" lines, with Windows line ends made Unix ones
and Gutenberg's markup characters ~ _ [ ] = * made spaces; the three are
joined by an empty line.

    python3 gutenberg-text.py <dir with pg11291.txt, pg11292.txt, pg15008.txt> <out>
"""
import os
import re
import sys


def body(path):
    with open(path, 'rb') as f:
        text = f.read().decode('utf-8-sig').replace('\r\n', '\n')
    start = text.find('\n', text.find('*** START OF')) + 1
    end = text.rfind('\n', 0, text.find('*** END OF')) + 1
    return re.sub(r'[~_\[\]=*]', ' ', text[start:end])


def main():
    source, out = sys.argv[1:3]
    parts = [body(os.path.join(source, f'pg{n}.txt')) for n in (11291, 11292, 15008)]
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n\n'.join(parts))


if __name__ == '__main__':
    main()
