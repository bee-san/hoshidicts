#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Lookup measurements of README.md (Measurements 2-4). Not run by any test.
//
//   node languages/ka/sources/measure-lookups.mjs <wty-ka-en term banks dir> <lookup-batch output> <words.txt> [--labels <file>]... [--counts <freq.tsv>] [--deinflections <file>] [--top N] [--suspects <freq.tsv>] [--hyphen <hyphen.tsv>] [--sample N] [--seed S]
//
// Inputs: the unzipped wty-ka-en, one lookup-batch.cpp JSON line per hover and
// words.txt (make-hovers.py) with the hovered word on each line. A hover of a
// word the dictionary knows is right when its first result with a definition
// is a lemma the word's form-of rows name (one hop further when that lemma has
// no definition) or the word itself as a lemma. Where that leaves a choice
// (several lemmas; the word's own entry while its rows name another, the
// "ownEntry" class), the (word, first result) label decides: W wrong, A
// ambiguous, R right, X not a word (not judged); a missing label is reported.
// A label decides wherever it exists, later --labels files win, and = is the
// word itself. --top N lists the N most frequent unknown words with a result,
// --sample N a seeded sample of unknown words. --counts weighs words by a
// frequency list; --deinflections (hoshidicts-cli deinflect ka --stdin) judges
// only words whose lemma a rule reaches or whose pair has a label.
// --suspects <freq.tsv>: first results only the word's own rows reach (no pack
// transform in the trace) whose next result is a rule reading of a lemma at
// least three times as frequent (ერთ → ერი before ერთი).
// Case endings after a hyphen (Apple-ის, 1990-ში) and the ordinal მე- (მე-19)
// are counted apart: in a text set, a word of ENDINGS whose previous hover
// shows a hyphen after a non-space (not drawn-out speech: the same word, a
// single letter or a single vowel after a Georgian word), or მე before "-"
// and a digit; for a word list, --hyphen gives the tokens (wiki-text.py hyphen).
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const [dir, resultsFile, wordsFile, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : fallback; };
const sampleN = +opt('--sample', 0);
const seed = +opt('--seed', 1);
const countsFile = opt('--counts');
const deinflectionsFile = opt('--deinflections');
const labelsFiles = rest.flatMap((a, i) => (a === '--labels' ? [rest[i + 1]] : []));
const topN = +opt('--top', 0);
const suspectsFile = opt('--suspects');
const hyphenFile = opt('--hyphen');
const ENDINGS = new Set(['ის', 'ს', 'მა', 'მ', 'ე', 'სა', 'ში', 'ზე', 'თან', 'ით', 'დან', 'იან', 'იანი', 'იანმა', 'იანის', 'მდე', 'ად', 'თვის', 'ისთვის',
    'ზედ', 'ა', 'ი', 'ელი', 'ლი', 'გან', 'ისგან', 'კენ', 'ებში', 'ებს', 'ები', 'ების', 'ზეც', 'შიც', 'საც', 'მაც', 'იც', 'ც', 'ელმა', 'ისა', 'ზედა']);
const hyphenTokens = new Map();
if (hyphenFile) {
    for (const line of readFileSync(hyphenFile, 'utf8').split('\n')) {
        const [word, , after, before] = line.split('\t');
        if (word && (ENDINGS.has(word) || word === 'მე')) { hyphenTokens.set(word, word === 'მე' ? +before : +after); }
    }
}
const hyphen = {positions: 0, tokens: 0, suffix: 0, nothing: 0, related: 0, letter: 0, other: 0, letterHidden: 0, otherHidden: 0};
const wrongAt = new Set();
const hyphenAt = [];
const labels = new Map();
for (const labelsFile of labelsFiles) {
    for (const line of readFileSync(labelsFile, 'utf8').split('\n')) {
        if (!line || line.startsWith('#')) { continue; }
        const [word, first, label] = line.split('\t');
        labels.set(`${word}\t${first === '=' ? word : first}`, label);
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
const readCounts = (file) => {
    const m = new Map();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const [word, count] = line.split('\t');
        if (word) { m.set(word, +count); }
    }
    return m;
};
const counts = countsFile ? readCounts(countsFile) : new Map();
const lemmaCounts = suspectsFile ? (suspectsFile === countsFile ? counts : readCounts(suspectsFile)) : null;
const packIds = new Set(JSON.parse(readFileSync(new URL('../transforms.json', import.meta.url), 'utf8')).transforms.map((t) => t.id));
const suspects = new Map();

const results = readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const words = readFileSync(wordsFile, 'utf8').split('\n').slice(0, results.length);
let found = 0, entry = 0, judged = 0, wrong = 0, unknown = 0, wrongTokens = 0, judgedTokens = 0, allTokens = 0;
let ambiguous = 0, ambiguousTokens = 0;
let ownEntryWrong = 0, ownEntryWrongTokens = 0, ownEntryAmbiguous = 0;
const labelledUnknown = {judged: 0, wrong: 0, ambiguous: 0, wrongTokens: 0, ambiguousTokens: 0};
const unknownCounts = new Map();
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
    const pairLabel = first ? labels.get(`${word}\t${first.expression}`) : undefined;
    let inHyphen = 0;
    if (hyphenFile) { inHyphen = hyphenTokens.get(word) ?? 0; } else if (word === 'მე' && /^მე-\s?\d/.test(results[i].text)) { inHyphen = 1; } else if (ENDINGS.has(word) && i > 0) {
        const prev = results[i - 1].text, text = results[i].text, pw = words[i - 1].toLowerCase();
        if (prev.length > text.length && prev.endsWith(text)) {
            const sep = prev.slice(pw.length, prev.length - text.length);
            const before = sep.length > 1 ? sep.at(-2) : pw.at(-1);
            if (sep.endsWith('-') && before && !/\s/.test(before) && !(sep === '-' && (pw === word || [...pw].length === 1 || /^[აეიოუ]$/.test(word)))) { inHyphen = 1; }
        }
    }
    if (inHyphen) { hyphenAt.push([i, inHyphen, first]); }
    if (lemmaCounts && first && first.trace.length && !first.trace.some((id) => packIds.has(id)) && targets.get(word)?.has(first.expression)) {
        const c = Math.max(1, lemmaCounts.get(first.expression) ?? 0);
        const rule = res.filter((r) => !r.formOf)[1];
        if (rule && rule.expression !== first.expression && rule.trace.some((id) => packIds.has(id)) && (lemmaCounts.get(rule.expression) ?? 0) >= 3 * c) {
            const k = `${word}\t${first.expression}`;
            const g = suspects.get(k) ?? suspects.set(k, {word, first: first.expression, trace: first.trace.join(' > '), rule: rule.expression, ruleTrace: rule.trace.join(' > '), c, rc: lemmaCounts.get(rule.expression), n: 0, weight: 0, label: pairLabel ?? '?'}).get(k);
            g.n++; g.weight += weight;
        }
    }
    if (((deinflectionsFile && ![...(targets.get(word) ?? [])].some((t) => deinflections.get(word)?.has(t))) && !(right.size > 0 && pairLabel && pairLabel !== 'X')) || right.size === 0) {
        unknown++;
        if (!first) { continue; }
        if (right.size > 0) { continue; }
        unknownList.push({i, word, first});
        const key = `${word}\t${first.expression}`;
        if (!unknownCounts.has(key)) { unknownCounts.set(key, {word, first: first.expression, trace: first.trace.join(' > '), weight}); }
        const label = labels.get(key);
        if (label && label !== 'X') {
            labelledUnknown.judged++;
            if (label === 'W') { labelledUnknown.wrong++; labelledUnknown.wrongTokens += weight; }
            if (label === 'A') { labelledUnknown.ambiguous++; labelledUnknown.ambiguousTokens += weight; }
        }
        continue;
    }
    if (pairLabel === 'X') { continue; }
    judged++;
    judgedTokens += weight;
    if (!first) { continue; }
    const ownEntry = first.expression === word && (targets.get(word)?.size ?? 0) > 0;
    const own = labels.get(`${word}\t${first.expression}`);
    if (own === 'R') { continue; }
    if (own === 'A') { ambiguous++; ambiguousTokens += weight; if (ownEntry) { ownEntryAmbiguous++; } continue; }
    if (own === 'W' && right.has(first.expression) && right.size < 2 && !ownEntry) {
        // fall through to wrong: a label decides (ტომს → ტომი for the name Tom)
    } else if (right.has(first.expression)) {
        if (right.size < 2 || (first.expression === word && !ownEntry)) { continue; }
        const label = labels.get(`${word}\t${first.expression}`);
        if (label === 'A') { ambiguous++; ambiguousTokens += weight; if (ownEntry) { ownEntryAmbiguous++; } continue; }
        if (label !== 'W') {
            if (label === undefined) { const k = `${word}\t${first.expression}`; unlabelled.set(k, (unlabelled.get(k) ?? 0) + 1); }
            continue;
        }
    }
    // A longer match (a phrase the dictionary has) is not a wrong lemma of the word.
    if ([...first.matched].length > [...words[i]].length) { continue; }
    wrong++;
    wrongAt.add(i);
    wrongTokens += weight;
    if (ownEntry) { ownEntryWrong++; ownEntryWrongTokens += weight; }
    const key = first.trace.join('>') || '(as written)';
    byRule.set(key, (byRule.get(key) ?? 0) + 1);
    wrongList.push(`${word} → ${first.expression} [${first.trace.join(' > ')}] (right: ${[...right].slice(0, 3).join(', ')})`);
}
console.log(JSON.stringify({lookups: results.length, found, firstEntry: entry, judged, wrong, wrongRate: wrong / judged, ambiguous, unknownWord: unknown,
    unlabelledPairs: unlabelled.size, ownEntryWrong, ownEntryAmbiguous, labelledUnknown,
    ...(countsFile ? {tokens: allTokens, judgedTokens, wrongTokens, wrongTokenShare: wrongTokens / allTokens, ambiguousTokens, ownEntryWrongTokens} : {})}));
if (unlabelled.size) {
    console.log('unlabelled (word, first result) pairs whose word names several lemmas or whose first result is its own entry:', [...unlabelled].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replace('\t', ' → ')} (${n})`).join('; '));
}
if (topN && countsFile) {
    const top = [...unknownCounts.values()].sort((a, b) => b.weight - a.weight).slice(0, topN);
    let w = 0, wt = 0, un = 0;
    const lines = top.map((u, k) => {
        const label = labels.get(`${u.word}\t${u.first}`) ?? '?';
        if (label === 'W') { w++; wt += u.weight; }
        if (label === '?') { un++; }
        return `  ${k + 1}\t${u.word}\t${u.weight}\t${u.first}\t[${u.trace}]\t${label}`;
    });
    console.log(`the ${top.length} most frequent words the measurement does not judge, with a result: ${w} wrong (${wt} tokens, ${(100 * wt / allTokens).toFixed(2)}% of all), ${un} unlabelled`);
    for (const l of lines) { console.log(l); }
}
if (suspectsFile) {
    const all = [...suspects.values()];
    const sum = (f) => all.filter(f).reduce((a, g) => a + g.n, 0);
    const by = (l) => `${all.filter((g) => g.label === l).length} (${sum((g) => g.label === l)})`;
    console.log(`suspects (first result only the word's own rows reach, next a rule reading of a lemma at least 3 times as frequent): ${all.length} pairs (${sum(() => true)} ${countsFile ? 'words' : 'positions'}${countsFile ? `, ${all.reduce((a, g) => a + g.weight, 0)} tokens` : ''}); labelled W ${by('W')}, A ${by('A')}, X ${by('X')}, R ${by('R')}; without a label (right by the script) ${by('?')}`);
    for (const g of all.filter((x) => x.label === '?').sort((a, b) => b.weight - a.weight).slice(0, 60)) {
        console.log(`  ${g.weight}\t${g.word} → ${g.first} [${g.trace}] (${g.c})\trule reading ${g.rule} [${g.ruleTrace}] (${g.rc})`);
    }
}
for (const [i, n, first] of hyphenAt) {
    const word = words[i].toLowerCase();
    const kind = !first ? 'nothing' : first.expression.startsWith('-') ? 'suffix' : (first.expression === word && (word === 'ზე' || word === 'თან')) ? 'related' : [...first.expression].length === 1 ? 'letter' : 'other';
    hyphen.positions++; hyphen.tokens += n; hyphen[kind] += n;
    if ((kind === 'letter' || kind === 'other') && !wrongAt.has(i)) { hyphen[kind + 'Hidden'] += n; }
}
if (hyphen.positions) {
    const all = hyphenFile ? allTokens : judged, base = hyphenFile ? wrongTokens : wrong, pct = (x) => `${(100 * x / all).toFixed(2)}%`;
    console.log(`case endings after a hyphen and the ordinal მე-: ${hyphen.tokens} ${hyphenFile ? `tokens of ${hyphen.positions} words` : 'positions'}; first result a suffix entry ${hyphen.suffix}, nothing ${hyphen.nothing}, a related adverb (ზე, თან) ${hyphen.related}, a letter ${hyphen.letter}, another word ${hyphen.other}; wrong ${base} (${pct(base)}), with the other words ${base + hyphen.otherHidden} (${pct(base + hyphen.otherHidden)}), with the letters too ${base + hyphen.otherHidden + hyphen.letterHidden} (${pct(base + hyphen.otherHidden + hyphen.letterHidden)})`);
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
