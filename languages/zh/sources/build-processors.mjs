#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the character tables of three processors into
// languages/zh/language.json (docs/languages.md, section 6). Run from the
// repository root:
//
//   node languages/zh/sources/build-processors.mjs [--cedict <CC-CEDICT.zip>] [--unihan <Unihan_Variants.txt>]
//       [--radicals <EquivalentUnifiedIdeograph.txt>] [--freq-tw <zh_tw_50k.txt>] [--freq-cn <zh_cn_50k.txt>]
//
// - normalizeRadicalCharacters: Yomitan's processor of this id
//   (ext/js/language/CJK-util.js at d3c54c1), NFKD on the CJK Radicals
//   Supplement, Kangxi Radicals and CJK Strokes blocks, which maps the 214
//   Kangxi radicals and two supplement radicals to ideographs (⾼ U+2FBC →
//   高), then a map of the other CJK Radicals Supplement characters that
//   Unicode's EquivalentUnifiedIdeograph.txt (17.0) maps to an ideograph:
//   they have no decomposition, and text copied from PDFs often has them (⻔
//   U+2ED4 for 门). Yomitan leaves those as they are
//   (sources/yomitan-differences.tsv).
// - simplifiedToTraditional (optional): each simplified character of the
//   simplified-character subtitles (FrequencyWords zh_cn_50k) becomes the
//   traditional form CC-CEDICT's headword pairs give it most, weighted by the
//   traditional words' counts in traditional-character subtitles (zh_tw_50k;
//   sources/variants.mjs): 说 → 說, 发 → 發. A second variant writes the second
//   form of the characters that have two meanings in traditional writing
//   (发 → 髮: 头发 → 頭髮; 干 → 乾: 干净 → 乾淨) and converts the others as the
//   first does. A second form counts when its weight is at least 3% of the
//   first's (and at least 50) and Unihan does not list the two as variants of one character
//   (kSemanticVariant, kZVariant, kSpecializedSemanticVariant: 淨 and 凈, 裡 and
//   裏). For dictionaries that list words only in traditional characters.
// - traditionalToSimplified (optional): each traditional character of zh_tw_50k
//   becomes the simplified form CC-CEDICT's pairs give it most, weighted by the
//   simplified words' counts in zh_cn_50k. For dictionaries that list words
//   only in simplified characters.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, parseJson} from '../../../tools/lib/json.mjs';
import {cedictTables, wordCounts} from './variants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = '/local/home/skerraut/herd-synth3/clones/hachi-lang-cache/zh';
const argument = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
};
const CEDICT = argument('--cedict', join(CACHE, 'CC-CEDICT.zip'));
const UNIHAN = argument('--unihan', join(CACHE, 'Unihan_Variants.txt'));
const RADICALS = argument('--radicals', join(CACHE, 'EquivalentUnifiedIdeograph-17.0.0.txt'));
const FREQ_TW = argument('--freq-tw', join(CACHE, 'zh_tw_50k.txt'));
const FREQ_CN = argument('--freq-cn', join(CACHE, 'zh_cn_50k.txt'));

const fromHex = (hex) => String.fromCodePoint(parseInt(hex, 16));
const charsOf = (file) => new Set([...wordCounts(file).keys()].flatMap((w) => [...w]));
const cnChars = charsOf(FREQ_CN);
const twChars = charsOf(FREQ_TW);

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

// --- Unihan: characters that are variants of one another --------------------
const sameCharacter = new Set();
for (const line of readFileSync(UNIHAN, 'utf8').split('\n')) {
    if (line.startsWith('#') || line.trim() === '') { continue; }
    const [cp, field, value] = line.split('\t');
    if (!['kSemanticVariant', 'kZVariant', 'kSpecializedSemanticVariant'].includes(field)) { continue; }
    const a = fromHex(cp.slice(2));
    for (const v of value.split(' ')) {
        const b = fromHex(v.split('<')[0].slice(2));
        sameCharacter.add(`${a}${b}`).add(`${b}${a}`);
    }
}

// --- Simplified and traditional ---------------------------------------------
const {forms, simplified} = cedictTables(CEDICT, FREQ_TW, FREQ_CN);
const toTraditional = {};
const toTraditionalSecond = {};
for (const [s, list] of forms) {
    if (!cnChars.has(s)) { continue; }
    const [first, top] = list[0];
    if (first !== s) { toTraditional[s] = first; }
    const second = list.find(([t, w], i) => i > 0 && w >= top * 0.03 && w >= 50 && t !== s && t !== first && !sameCharacter.has(`${t}${first}`));
    if (second !== undefined) { toTraditionalSecond[s] = second[0]; }
}
// The second variant converts with the second map, then the first; a second
// form that the first map would convert again is left out.
for (const [s, t] of Object.entries(toTraditionalSecond)) {
    if (t in toTraditional) { delete toTraditionalSecond[s]; }
}
const toSimplified = {};
for (const [t, list] of simplified) {
    if (!twChars.has(t)) { continue; }
    if (list[0][0] !== t) { toSimplified[t] = list[0][0]; }
}

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.codePointAt(0) - b.codePointAt(0)));

// A map of single characters as steps of at most 128 keys each, applied in
// turn. A value that is also a key would be converted twice, so such a value
// is checked to map to itself, and is left out otherwise.
function mapSteps(object) {
    const entries = Object.entries(sorted(object));
    const keys = new Set(entries.map(([k]) => k));
    const kept = entries.filter(([, v]) => !keys.has(v));
    if (kept.length !== entries.length) {
        console.error(`left out ${entries.length - kept.length} entries whose value is a key: ${entries.filter(([, v]) => keys.has(v)).map(([k, v]) => k + v).join(' ')}`);
    }
    const steps = [];
    for (let i = 0; i < kept.length; i += 128) { steps.push({map: Object.fromEntries(kept.slice(i, i + 128))}); }
    return steps;
}

const file = join(here, '..', 'language.json');
const language = parseJson(readFileSync(file, 'utf8'), file);
const supplement = Object.fromEntries(Object.entries(radicals).filter(([k, v]) => k.normalize('NFKD') !== v));
const tables = {
    normalizeRadicalCharacters: [[
        {normalize: 'NFKD', within: '[\\u2E80-\\u2EFF\\u2F00-\\u2FDF\\u31C0-\\u31EF]'},
        {map: sorted(supplement)},
    ]],
    simplifiedToTraditional: [mapSteps(toTraditional), [...mapSteps(toTraditionalSecond), ...mapSteps(toTraditional)]],
    traditionalToSimplified: [mapSteps(toSimplified)],
};
for (const processor of language.lookup.preprocessors) {
    if (processor.id in tables) { processor.variants = tables[processor.id]; }
}
writeFileSync(file, formatJson(language));
console.log(`${file}: ${Object.keys(radicals).length} radicals (${Object.keys(supplement).length} in the map), `
    + `${Object.keys(toTraditional).length} + ${Object.keys(toTraditionalSecond).length} to traditional, ${Object.keys(toSimplified).length} to simplified`);
console.log(`second forms: ${Object.entries(sorted(toTraditionalSecond)).map(([s, t]) => s + t).join(' ')}`);
