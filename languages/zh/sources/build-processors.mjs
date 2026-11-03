#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the character tables of three processors into
// languages/zh/language.json (docs/languages.md, section 6). Run from the
// repository root:
//
//   node languages/zh/sources/build-processors.mjs [--unihan <Unihan_Variants.txt>]
//       [--radicals <EquivalentUnifiedIdeograph.txt>] [--freq-tw <zh_tw_50k.txt>] [--freq-cn <zh_cn_50k.txt>]
//
// - normalizeRadicals: every CJK radical (Kangxi Radicals and CJK Radicals
//   Supplement) that Unicode's EquivalentUnifiedIdeograph.txt (17.0) maps to
//   a unified ideograph becomes that ideograph. Text copied from PDFs often
//   has ⻔ (U+2ED4) for 门 or ⾼ (U+2FBC) for 高. NFKC already maps the Kangxi
//   radicals; the supplement has no decompositions.
// - simplifiedToTraditional (optional): every simplified character that
//   simplified-character subtitles use (FrequencyWords zh_cn_50k) and that
//   Unihan gives a traditional form (kTraditionalVariant, and the characters
//   whose kSimplifiedVariant it is) becomes the form traditional-character
//   subtitles use most (zh_tw_50k), in a first variant; a second variant
//   takes the second most used form of the characters that have two in use
//   (发 → 發, then 髮: 头发 → 頭髮; 干 → 幹, then 乾: 干净 → 乾淨) and
//   converts the rest as the first does.
//   For dictionaries that list words only in traditional characters.
// - traditionalToSimplified (optional): every traditional character that
//   zh_tw_50k has and that Unihan gives a simplified form (kSimplifiedVariant)
//   becomes the form zh_cn_50k uses most. For dictionaries that list words
//   only in simplified characters.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, parseJson} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = '/local/home/skerraut/herd-synth3/clones/hachi-lang-cache/zh';
const argument = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
};
const UNIHAN = argument('--unihan', join(CACHE, 'Unihan_Variants.txt'));
const RADICALS = argument('--radicals', join(CACHE, 'EquivalentUnifiedIdeograph-17.0.0.txt'));
const FREQ_TW = argument('--freq-tw', join(CACHE, 'zh_tw_50k.txt'));
const FREQ_CN = argument('--freq-cn', join(CACHE, 'zh_cn_50k.txt'));

const fromHex = (hex) => String.fromCodePoint(parseInt(hex, 16));

function charFrequency(file) {
    const frequency = new Map();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const space = line.lastIndexOf(' ');
        if (space < 0) { continue; }
        const count = Number(line.slice(space + 1));
        for (const c of line.slice(0, space)) { frequency.set(c, (frequency.get(c) ?? 0) + count); }
    }
    return frequency;
}
const tw = charFrequency(FREQ_TW);
const cn = charFrequency(FREQ_CN);

// --- Radicals ---------------------------------------------------------------
const radicals = {};
for (const line of readFileSync(RADICALS, 'utf8').split('\n')) {
    const data = line.split('#')[0].trim();
    if (data === '') { continue; }
    const [range, target] = data.split(';').map((s) => s.trim());
    const [first, last] = range.split('..').map((h) => parseInt(h, 16));
    for (let cp = first; cp <= (last ?? first); ++cp) {
        if (cp >= 0x2E80 && cp <= 0x2FDF) { radicals[String.fromCodePoint(cp)] = fromHex(target); }
    }
}

// --- Simplified and traditional ---------------------------------------------
const forward = new Map();
const simplifiedOf = new Map();
for (const line of readFileSync(UNIHAN, 'utf8').split('\n')) {
    if (line.startsWith('#') || line.trim() === '') { continue; }
    const [cp, field, value] = line.split('\t');
    if (field !== 'kTraditionalVariant' && field !== 'kSimplifiedVariant') { continue; }
    const c = fromHex(cp.slice(2));
    const values = value.split(' ').map((v) => fromHex(v.slice(2)));
    if (field === 'kTraditionalVariant') { forward.set(c, values); } else { simplifiedOf.set(c, values); }
}
const inverse = new Map();
for (const [t, ss] of simplifiedOf) {
    for (const s of ss) {
        if (s === t) { continue; }
        if (!inverse.has(s)) { inverse.set(s, []); }
        inverse.get(s).push(t);
    }
}

// Unihan gives 净 only 凈 and 淨 no simplified form; both are in use.
const EXTRA_TRADITIONAL = new Map([['净', ['淨', '凈']]]);
const EXTRA_SIMPLIFIED = new Map([['淨', ['净']]]);
for (const [t, ss] of EXTRA_SIMPLIFIED) { simplifiedOf.set(t, ss); }

// The traditional forms of a simplified character, most used first, without
// forms used less than 3% as often as the first (and at least 50 times).
function traditionalForms(s) {
    const candidates = EXTRA_TRADITIONAL.get(s) ?? [...new Set([...(forward.get(s) ?? []), ...(inverse.get(s) ?? [])])];
    if (candidates.length === 0) { return []; }
    const counted = candidates.map((t, i) => ({t, n: tw.get(t) ?? 0, i}));
    counted.sort((a, b) => b.n - a.n || a.i - b.i);
    const top = counted[0].n;
    if (top === 0) {
        // Not in the subtitles: the character itself when Unihan lists it as
        // its own traditional form, else Unihan's first form.
        return candidates.includes(s) ? [s] : [candidates[0]];
    }
    return counted.filter(({n}, k) => k === 0 || (n >= 50 && n >= top * 0.03)).map(({t}) => t);
}

// Only characters the subtitles use are converted: simplified characters
// that zh_cn_50k has, traditional ones that zh_tw_50k has.
const toTraditional = {};
const toTraditionalSecond = {};
for (const s of new Set([...forward.keys(), ...inverse.keys()])) {
    if (!cn.has(s)) { continue; }
    const ts = traditionalForms(s);
    if (ts.length === 0) { continue; }
    if (ts[0] !== s) { toTraditional[s] = ts[0]; }
    const second = ts.slice(1).find((t) => t !== s);
    if (second !== undefined) { toTraditionalSecond[s] = second; }
}

const toSimplified = {};
for (const [t, ss] of simplifiedOf) {
    if (!tw.has(t)) { continue; }
    const counted = ss.map((s, i) => ({s, n: cn.get(s) ?? 0, i}));
    counted.sort((a, b) => b.n - a.n || a.i - b.i);
    const best = counted[0].s;
    if (best !== t) { toSimplified[t] = best; }
}

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.codePointAt(0) - b.codePointAt(0)));

const file = join(here, '..', 'language.json');
const language = parseJson(readFileSync(file, 'utf8'), file);
const tables = {
    normalizeRadicals: [[{map: sorted(radicals)}]],
    // The second variant first writes the second form of the characters
    // that have two, then converts the rest as the first does.
    simplifiedToTraditional: [[{map: sorted(toTraditional)}], [{map: sorted(toTraditionalSecond)}, {map: sorted(toTraditional)}]],
    traditionalToSimplified: [[{map: sorted(toSimplified)}]],
};
for (const processor of language.lookup.preprocessors) {
    if (processor.id in tables) { processor.variants = tables[processor.id]; }
}
// Maps are written one entry per line, like any other object.
writeFileSync(file, formatJson(language));
console.log(`${file}: ${Object.keys(radicals).length} radicals, ${Object.keys(toTraditional).length} + ${Object.keys(toTraditionalSecond).length} to traditional, ${Object.keys(toSimplified).length} to simplified`);
