#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the UniMorph part of tests/gaps.tsv from
// UniMorph ara, and splits the sample with hoshidicts-cli: rows the pack's
// final rules reach go to corpus.tsv, the others to gaps.tsv.
//
//   node languages/ar/sources/build-corpus.mjs <unimorph ara file> [--cli <hoshidicts-cli>]
//
// The file is https://github.com/unimorph/ara/blob/e9b7521ab75e3a7da6f996a428031164993e6f19/ara
// (sha256 01663d08dbc6bb2a4207749cb4c000926c72c7cf9ec3faa8521e4cb5e9d690f1),
// CC BY-SA 3.0, by the UniMorph contributors.

import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../tools/check-yomitan.mjs';
import {readDeinflectionTsv} from '../../../tools/lib/pack.mjs';

const SHA256 = '01663d08dbc6bb2a4207749cb4c000926c72c7cf9ec3faa8521e4cb5e9d690f1';
const SEED = 1;
// Strata are parts of speech; verbal nouns and participles (V.MSDR, V.PTCP) are left out:
// they are dictionary words of their own, not forms a deinflector should reduce to the verb.
const STRATA = {N: 900, ADJ: 300, V: 800};
// Yomitan's Arabic conditions have no adjective: adjectives take the noun affixes.
const POS = {N: 'n', V: 'v', ADJ: 'n'};

const args = process.argv.slice(2);
const file = args[0];
const cliIndex = args.indexOf('--cli');
const cli = cliIndex >= 0 ? args[cliIndex + 1] : fileURLToPath(new URL('../../../build/hoshidicts-cli', import.meta.url));
if (file === undefined) {
    console.error('usage: node languages/ar/sources/build-corpus.mjs <unimorph ara file> [--cli <hoshidicts-cli>]');
    process.exit(2);
}
const data = readFileSync(file);
const sha = createHash('sha256').update(data).digest('hex');
if (sha !== SHA256) { throw new Error(`${file} has sha256 ${sha}, not ${SHA256}`); }

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const byStratum = new Map(Object.keys(STRATA).map((k) => [k, []]));
const seen = new Set();
for (const line of data.toString('utf8').split('\n')) {
    const [lemma, form, feats] = line.split('\t');
    const pos = (feats ?? '').split(';')[0];
    if (!byStratum.has(pos) || !lemma || !form || /\s/.test(lemma + form) || /V\.(?:MSDR|PTCP)/.test(feats)) { continue; }
    const key = `${lemma}\t${form}\t${feats}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    byStratum.get(pos).push({lemma, form, feats});
}
const random = mulberry32(SEED);
const sample = [];
const taken = new Set();
for (const [pos, quota] of Object.entries(STRATA)) {
    const pool = byStratum.get(pos);
    for (let i = pool.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let n = 0;
    for (const {lemma, form, feats} of pool) {
        if (n >= quota) { break; }
        const rule = POS[pos];
        const key = `${form}\t${lemma}\t${rule}`;
        if (taken.has(key)) { continue; }
        taken.add(key);
        sample.push([feats, '1', form, lemma, rule, '*']);
        ++n;
    }
}

// Split with the engine: a row passes when some preprocessed variant
// deinflects to the term with compatible conditions (section 12.2).
const transforms = JSON.parse(readFileSync(new URL('../transforms.json', import.meta.url), 'utf8'));
const leaves = (name) => {
    const condition = transforms.conditions[name];
    return condition.subConditions === undefined ? [name] : condition.subConditions.flatMap(leaves);
};
const sources = [...new Set(sample.map((row) => row[2]))];
const variants = new Map(runCli(cli, ['preprocess', 'ar', '--stdin'], sources).map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(runCli(cli, ['deinflect', 'ar', '--stdin'], texts).map((answer) => [answer.input, answer.results]));
const passes = ([, , source, term, rule]) => {
    const allowed = new Set(leaves(rule));
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term && (r.conditions.length === 0 || r.conditions.some((c) => allowed.has(c)))));
};

const header = [
    `# Source: UniMorph ara (https://github.com/unimorph/ara/blob/e9b7521ab75e3a7da6f996a428031164993e6f19/ara, sha256 ${SHA256.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${Object.entries(STRATA).map(([k, v]) => `${v} ${k}`).join(', ')}); those the final rules reach are in corpus.tsv, the others in gaps.tsv.`,
];
const columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)';
const pass = sample.filter(passes);
const fail = sample.filter((row) => !passes(row));
const tests = new URL('../tests/', import.meta.url);
writeFileSync(new URL('corpus.tsv', tests), [...header, columns, ...pass.map((r) => r.join('\t'))].join('\n') + '\n');
const handWritten = readDeinflectionTsv(fileURLToPath(new URL('gaps.tsv', tests))).rows.filter((r) => !r.category.includes(';'));
const gapsHeader = ['# Known gaps: run by the conformance test and counted, not enforced.', '# Hand-written rows: written for this pack, no third-party data.', ...header];
const handRows = handWritten.map((r) => [r.category, r.valid ? '1' : '0', r.source, r.term, r.rule ?? '*', r.reasons === null ? '*' : r.reasons.join('|')].join('\t'));
writeFileSync(new URL('gaps.tsv', tests), [...gapsHeader, columns, ...handRows, ...fail.map((r) => r.join('\t'))].join('\n') + '\n');
const byFeats = (rows) => Object.fromEntries(Object.keys(STRATA).map((k) => [k, rows.filter((r) => r[0].split(';')[0] === k).length]));
console.log(JSON.stringify({sampled: sample.length, corpus: pass.length, gaps: fail.length, recall: pass.length / sample.length, reached: byFeats(pass), missed: byFeats(fail)}));
