// SPDX-License-Identifier: GPL-3.0-or-later
// The traditional forms of simplified characters, for sources/build-own.mjs
// and sources/build-processors.mjs: every CC-CEDICT entry pairs a simplified
// headword with its traditional one, character by character (头发 / 頭髮,
// 理发 / 理髮, 发现 / 發現). Each pair counts once, plus the traditional word's
// count in a traditional-character frequency list (FrequencyWords zh_tw_50k),
// so the form a character takes in frequent words comes first, and the forms
// of rare variant entries (祇 and 衹 for 只) count for little.

import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';

/** The term-bank rows of a Yomitan zip (stored or deflated entries). */
export function* termRows(file) {
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
        yield* JSON.parse((method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
    }
}

/** Word counts of a FrequencyWords list ("word count" lines). */
export function wordCounts(file) {
    const counts = new Map();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const space = line.lastIndexOf(' ');
        if (space > 0) { counts.set(line.slice(0, space), Number(line.slice(space + 1))); }
    }
    return counts;
}

function spans(node, out) {
    if (Array.isArray(node)) {
        for (const n of node) { spans(n, out); }
    } else if (node !== null && typeof node === 'object') {
        const key = node.data?.cccedict;
        if ((key === 'headword-trad' || key === 'headword-simp') && typeof node.content === 'string') { out[key] = node.content; }
        if ('content' in node) { spans(node.content, out); }
    }
    return out;
}

const HAN = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u{20000}-\u{3FFFF}]$/u;

/**
 * For each simplified character, its traditional forms in CC-CEDICT with
 * their weights, heaviest first: Map<char, [form, weight][]>. A character
 * CC-CEDICT writes the same in both scripts maps to itself.
 */
export function cedictForms(cedictZip, traditionalFrequencyFile) {
    return cedictTables(cedictZip, traditionalFrequencyFile).forms;
}

/**
 * `forms` as cedictForms gives it; `words`, each simplified headword's
 * traditional headwords (Map<word, Set<word>>); and with a simplified
 * frequency list, `simplified`: for each traditional character its simplified
 * forms, weighted as `forms` but by the simplified word's count.
 */
export function cedictTables(cedictZip, traditionalFrequencyFile, simplifiedFrequencyFile = null) {
    const counts = wordCounts(traditionalFrequencyFile);
    const simplifiedCounts = simplifiedFrequencyFile === null ? null : wordCounts(simplifiedFrequencyFile);
    const weights = new Map();
    const back = new Map();
    const words = new Map();
    const seen = new Set();
    for (const row of termRows(cedictZip)) {
        // A word written the same in both scripts has only its simplified span.
        const found = spans(row[5], {});
        const simp = found['headword-simp'] ?? found['headword-trad'];
        const trad = found['headword-trad'] ?? simp;
        if (trad === undefined) { continue; }
        const s = [...simp];
        const t = [...trad];
        if (s.length !== t.length) { continue; }
        const key = `${row[6]}\u0000${trad}\u0000${simp}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        if (!words.has(simp)) { words.set(simp, new Set()); }
        words.get(simp).add(trad);
        const weight = 1 + (counts.get(trad) ?? 0);
        const backWeight = simplifiedCounts === null ? 0 : 1 + (simplifiedCounts.get(simp) ?? 0);
        s.forEach((c, i) => {
            if (!HAN.test(c)) { return; }
            if (!weights.has(c)) { weights.set(c, new Map()); }
            const m = weights.get(c);
            m.set(t[i], (m.get(t[i]) ?? 0) + weight);
            if (simplifiedCounts !== null && HAN.test(t[i])) {
                if (!back.has(t[i])) { back.set(t[i], new Map()); }
                const b = back.get(t[i]);
                b.set(c, (b.get(c) ?? 0) + backWeight);
            }
        });
    }
    const sortedForms = (table) => new Map([...table].map(([c, m]) => [c, [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))]));
    return {forms: sortedForms(weights), words, simplified: sortedForms(back)};
}

/** The forms of `c` whose weight is at least `share` of the heaviest form's. */
export function formsAbove(table, c, share) {
    const forms = table.get(c);
    if (forms === undefined) { return [c]; }
    const top = forms[0][1];
    return forms.filter(([, w]) => w >= top * share).map(([f]) => f);
}
