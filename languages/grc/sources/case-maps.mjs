#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the steps of the decapitalize and capitalizeFirstLetter processors in
// languages/grc/language.json as literal maps:
//
//   node languages/grc/sources/case-maps.mjs
//
// Yomitan's processors are `text.toLowerCase()` and
// `text.charAt(0).toUpperCase() + text.slice(1)`. A `case` step gives the same
// results, but the conformance test then pins its output on every corpus
// string in tests/classes.json (docs/languages.md 12.1), 150 KB for this pack.
// A map has nothing to pin: these are JavaScript's mappings of every Greek and
// Latin letter, written out. Final_Sigma (ΛΟΓΟΣ → λογος) is the first step of
// decapitalize: a capital sigma at the end of the text or before a space or
// punctuation is ς. JavaScript also asks for a cased letter before it, so a
// lone Σ gives σ there and ς here (sources/yomitan-differences.tsv).

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, parseJson} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'language.json');
const pack = parseJson(readFileSync(file, 'utf8'), 'language.json');

const RANGES = [[0x41, 0x5A], [0x61, 0x7A], [0xC0, 0xFF], [0x100, 0x17F], [0x370, 0x3FF], [0x1F00, 0x1FFF]];
const lower = {};
const upper = {};
for (const [a, b] of RANGES) {
  for (let cp = a; cp <= b; cp++) {
    const c = String.fromCodePoint(cp);
    if (!/\p{L}/u.test(c)) continue;
    if (c.toLowerCase() !== c) lower[c] = c.toLowerCase();
    if (c.toUpperCase() !== c) upper[c] = c.toUpperCase();
  }
}
const finalSigma = {Σ: 'ς'};
const beforeBreak = {};
for (const p of [' ', ',', '.', ';', '·', '\u0387', ':', '!', '?', ')', '’', "'"]) beforeBreak[`Σ${p}`] = `ς${p}`;

const steps = {
  decapitalize: [{map: finalSigma, at: 'end'}, {map: {...beforeBreak, ...lower}}],
  capitalizeFirstLetter: [{map: upper, at: 'start'}],
};
for (const p of pack.lookup.preprocessors) {
  if (steps[p.id]) p.variants = [steps[p.id]];
}
writeFileSync(file, formatJson(pack, {inline: (path, value) => path[path.length - 1] === 'map' || (Array.isArray(value) && path.includes('ranges'))}));
console.log(`language.json: decapitalize ${Object.keys(lower).length} letters, capitalizeFirstLetter ${Object.keys(upper).length} letters`);
