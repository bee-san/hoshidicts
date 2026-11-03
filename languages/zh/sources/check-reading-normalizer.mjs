#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Compares the pack's lookup.readingNormalizer with Yomitan's normalizePinyin
// (ext/js/language/zh/chinese.js at d3c54c1) on Yomitan's own test cases and
// on every reading of the dictionaries given, and prints the readings on
// which they differ, grouped by the reason. The steps run in JavaScript
// (tools/lib/steps.mjs); tests/classes.json and the conformance test check
// that the engine gives the same output for the pattern and case steps.
//
//   node languages/zh/sources/check-reading-normalizer.mjs <yomitan checkout> [dictionary.zip ...]

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {ClassSet} from '../../../tools/lib/classes.mjs';
import {loadPack} from '../../../tools/lib/pack.mjs';
import {applyVariant} from '../../../tools/lib/steps.mjs';

const [yomitanDir, ...zips] = process.argv.slice(2);
if (yomitanDir === undefined) {
    console.error('usage: node languages/zh/sources/check-reading-normalizer.mjs <yomitan checkout> [dictionary.zip ...]');
    process.exit(2);
}
const {normalizePinyin} = await import(pathToFileURL(join(yomitanDir, 'ext/js/language/zh/chinese.js')).href);
const pack = loadPack('zh');
const classes = new ClassSet(pack.language.classes);
const steps = pack.language.lookup.readingNormalizer;
// The step list has no `alternatives` step, so it gives one output.
const ours = (text) => applyVariant(steps, text, classes)[0];

// Yomitan's test/language/chinese-reading-normalizer.test.js.
const yomitanTests = [
    ['rìwén', 'rìwén'], ['Rì wén', 'rìwén'], ['Wéi jī Bǎi kē', 'wéijībǎikē'], ['wán:zhěng', 'wánzhěng'],
    ['fān・yì', 'fānyì'], ['fān//yì', 'fānyì'], ['fān’yì', 'fānyì'], ['fān\'yì', 'fānyì'], ['fān-yì', 'fānyì'],
];
let failed = 0;
for (const [input, expected] of yomitanTests) {
    const got = ours(input);
    if (got !== expected) {
        console.log(`Yomitan test ${JSON.stringify(input)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
        ++failed;
    }
}
console.log(`Yomitan's tests: ${yomitanTests.length - failed}/${yomitanTests.length} pass`);

/** The term-bank rows of a Yomitan zip (stored or deflated entries). */
function* termRows(file) {
    const data = readFileSync(file);
    let end = data.length - 22;
    while (end >= 0 && data.readUInt32LE(end) !== 0x06054b50) { --end; }
    const count = data.readUInt16LE(end + 10);
    let offset = data.readUInt32LE(end + 16);
    for (let i = 0; i < count; ++i) {
        const method = data.readUInt16LE(offset + 10);
        const size = data.readUInt32LE(offset + 20);
        const nameLength = data.readUInt16LE(offset + 28);
        const extraLength = data.readUInt16LE(offset + 30);
        const commentLength = data.readUInt16LE(offset + 32);
        const local = data.readUInt32LE(offset + 42);
        const name = data.toString('utf8', offset + 46, offset + 46 + nameLength);
        offset += 46 + nameLength + extraLength + commentLength;
        if (!/^term_bank_\d+\.json$/.test(name)) { continue; }
        const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
        const raw = data.subarray(start, start + size);
        const text = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
        yield* JSON.parse(text);
    }
}

for (const zip of zips) {
    const readings = new Set();
    for (const row of termRows(zip)) { readings.add(row[1]); }
    const groups = new Map();
    let differ = 0;
    for (const reading of readings) {
        const theirs = normalizePinyin(reading);
        const mine = ours(reading);
        if (theirs === mine) { continue; }
        ++differ;
        const reason = /[(（]/.test(reading) ? 'parenthesized part removed' : /[·‧ʼ]/.test(reading) ? '· ‧ or ʼ removed' : 'other';
        if (!groups.has(reason)) { groups.set(reason, []); }
        groups.get(reason).push([reading, theirs, mine]);
    }
    console.log(`${zip}: ${readings.size} distinct readings, ${differ} normalized differently`);
    for (const [reason, items] of groups) {
        console.log(`  ${reason}: ${items.length}, e.g. ${items.slice(0, 3).map(([r, t, m]) => `${JSON.stringify(r)} → Yomitan ${JSON.stringify(t)}, pack ${JSON.stringify(m)}`).join('; ')}`);
    }
}
process.exitCode = failed === 0 ? 0 : 1;
