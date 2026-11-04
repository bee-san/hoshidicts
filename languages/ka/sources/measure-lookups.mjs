#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Lookup measurements of README.md (Measurements 2-4). Not run by any test.
//
//   node languages/ka/sources/measure-lookups.mjs <wty-ka-en term banks dir> <lookup-batch output> <words.txt> [--labels <file>] [--counts <freq.tsv>] [--deinflections <file>] [--sample N] [--seed S]
//
// <wty-ka-en term banks dir> is the unzipped dictionary (its term_bank_*.json).
// <lookup-batch output> has one JSON line per hover (sources/lookup-batch.cpp),
// and <words.txt> the hovered word on the same line (sources/make-hovers.py),
// or, for a word list, the word itself. A hover is judged by script when the
// dictionary knows the word: the first result with a definition (not a
// form-of row) is right when it is a term one of the word's own form-of rows
// names (or, when that term has no definition, a term its own form-of rows
// name), or the word itself when the dictionary has it as a lemma; it is
// wrong otherwise. A word whose rows name more than one lemma (იყო names იყი and
// არის) is right only when the first result is its own lemma, as section 14
// step 5 asks: --labels gives, for each such (word, first result) pair, W
// (wrong), A (ambiguous: context decides; reported apart) or R (right), and
// a pair with no label is reported as unlabelled. Hovers whose word the
// dictionary does not know are counted, and
// --sample N prints N of them (seeded) for judging by hand. --counts weighs
// each word by its count in a frequency list (word<TAB>count) for the share
// of tokens. --deinflections (hoshidicts-cli deinflect ka --stdin output for
// the words) judges only the words whose own lemma a rule reaches: a term
// one of the word's form-of rows names is among its deinflections.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const [dir, resultsFile, wordsFile, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : fallback; };
const sampleN = +opt('--sample', 0);
const seed = +opt('--seed', 1);
const countsFile = opt('--counts');
const deinflectionsFile = opt('--deinflections');
const labelsFile = opt('--labels');
const labels = new Map();
if (labelsFile) {
    for (const line of readFileSync(labelsFile, 'utf8').split('\n')) {
        if (!line || line.startsWith('#')) { continue; }
        const [word, first, label] = line.split('\t');
        labels.set(`${word}\t${first}`, label);
    }
}
const deinflections = new Map();
if (deinflectionsFile) {
    for (const line of readFileSync(deinflectionsFile, 'utf8').split('\n').filter(Boolean)) {
        const j = JSON.parse(line);
        deinflections.set(j.input, new Set(j.results.slice(1).map((r) => r.text)));
    }
}

const isRef = (d) => Array.isArray(d) && d.length === 2 && typeof d[0] === 'string' && d[0] && Array.isArray(d[1]);
const lemma = new Set();
const targets = new Map();
for (const f of readdirSync(dir).filter((name) => name.startsWith('term_bank_'))) {
    for (const row of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
        const refs = row[5].filter(isRef);
        if (refs.length < row[5].length || refs.length === 0) { lemma.add(row[0]); }
        for (const [target] of refs) { (targets.get(row[0]) ?? targets.set(row[0], new Set()).get(row[0])).add(target); }
    }
}
const counts = new Map();
if (countsFile) {
    for (const line of readFileSync(countsFile, 'utf8').split('\n')) {
        const [word, count] = line.split('\t');
        if (word) { counts.set(word, +count); }
    }
}

const results = readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const words = readFileSync(wordsFile, 'utf8').split('\n').slice(0, results.length);
let found = 0, entry = 0, judged = 0, wrong = 0, unknown = 0, wrongTokens = 0, judgedTokens = 0, allTokens = 0;
let ambiguous = 0, ambiguousTokens = 0;
const unlabelled = new Map();
const byRule = new Map();
const wrongList = [];
const unknownList = [];
for (let i = 0; i < results.length; i++) {
    const word = words[i].toLowerCase();
    const weight = countsFile ? (counts.get(word) ?? 0) : 1;
    allTokens += weight;
    const res = results[i].results;
    if (res.length) { found++; }
    const first = res.find((r) => !r.formOf);
    if (first) { entry++; }
    // The word's lemma: a term its form-of rows name, or one such a term's own
    // form-of rows name when it has no definition itself (ეწოდა names
    // ეწოდება, which names უწოდებს), or the word itself when it is a lemma.
    const right = new Set(targets.get(word) ?? []);
    for (const t of [...right]) { if (!lemma.has(t)) { for (const u of targets.get(t) ?? []) { right.add(u); } } }
    if (lemma.has(word)) { right.add(word); }
    if (deinflectionsFile && ![...(targets.get(word) ?? [])].some((t) => deinflections.get(word)?.has(t))) { unknown++; continue; }
    if (right.size === 0) {
        unknown++;
        if (first) { unknownList.push({i, word, first}); }
        continue;
    }
    judged++;
    judgedTokens += weight;
    if (!first) { continue; }
    if (right.has(first.expression)) {
        if (right.size < 2 || first.expression === word) { continue; }
        const label = labels.get(`${word}\t${first.expression}`);
        if (label === 'A') { ambiguous++; ambiguousTokens += weight; continue; }
        if (label !== 'W') {
            if (label === undefined) { const k = `${word}\t${first.expression}`; unlabelled.set(k, (unlabelled.get(k) ?? 0) + 1); }
            continue;
        }
    }
    // A longer match (a phrase the dictionary has) is not a wrong lemma of the word.
    if ([...first.matched].length > [...words[i]].length) { continue; }
    wrong++;
    wrongTokens += weight;
    const key = first.trace.join('>') || '(as written)';
    byRule.set(key, (byRule.get(key) ?? 0) + 1);
    wrongList.push(`${word} → ${first.expression} [${first.trace.join(' > ')}] (right: ${[...right].slice(0, 3).join(', ')})`);
}
console.log(JSON.stringify({lookups: results.length, found, firstEntry: entry, judged, wrong, wrongRate: wrong / judged, ambiguous, unknownWord: unknown,
    unlabelledPairs: unlabelled.size,
    ...(countsFile ? {tokens: allTokens, judgedTokens, wrongTokens, wrongTokenShare: wrongTokens / allTokens, ambiguousTokens} : {})}));
if (unlabelled.size) {
    console.log('unlabelled (word, first result) pairs whose word names several lemmas:', [...unlabelled].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replace('\t', ' → ')} (${n})`).join('; '));
}
console.log('wrong first results by trace:', [...byRule].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}: ${v}`).join('; '));
const freq = new Map();
for (const w of wrongList) { freq.set(w, (freq.get(w) ?? 0) + 1); }
console.log('most frequent wrong first results:');
for (const [w, n] of [...freq].sort((a, b) => b[1] - a[1]).slice(0, 30)) { console.log(`  ${n}\t${w}`); }
if (sampleN) {
    let a = seed >>> 0;
    const random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pool = unknownList.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    console.log(`sample of ${sampleN} hovers whose word the dictionary does not know (of ${unknownList.length} with a result):`);
    for (const {i, word, first} of pool.slice(0, sampleN)) {
        console.log(`  ${i}\t${word}\t→ ${first.expression}\t[${first.trace.join(' > ')}]\t${results[i].text.slice(0, 60)}`);
    }
}
