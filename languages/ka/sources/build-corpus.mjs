#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the UniMorph rows of tests/gaps.tsv from
// UniMorph kat, and splits the sample with hoshidicts-cli: rows the pack's
// rules reach go to corpus.tsv, the others to gaps.tsv (docs/languages.md
// 12.2). Hand-written rows already in gaps.tsv (categories without ';') are
// kept.
//
//   node languages/ka/sources/build-corpus.mjs <unimorph kat file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]
//
// The file is https://github.com/unimorph/kat/blob/25a1350977ae1f9c5cadf6267276260fc9eb9a21/kat
// (sha256 0525c4946cc86618a9c5af2681f5befff29aad5822da0e5c1bdcebf4b6607822),
// CC BY-SA 3.0, by the UniMorph contributors; Georgian annotators Simon
// Guriel, Silvia Guriel-Agiashvili and Nona Atanelov (verbs semi-automatically
// generated and verified by native speakers; nouns and adjectives from
// English Wiktionary).

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHA256 = '0525c4946cc86618a9c5af2681f5befff29aad5822da0e5c1bdcebf4b6607822';
const COMMIT = '25a1350977ae1f9c5cadf6267276260fc9eb9a21';
const SEED = 1;
const objectOf = (t) => t.includes('ARGAC1') || t.includes('ARGAC2') || t.includes('ARGDA1') || t.includes('ARGDA2');
// Strata by kind of form; within each, rows are drawn uniformly.
const STRATA = [
    ['verb, third-person or no object', 450, (t) => t[0] === 'V' && !t.includes('V.MSDR') && !objectOf(t)],
    ['verb, first- or second-person object', 150, (t) => t[0] === 'V' && !t.includes('V.MSDR') && objectOf(t)],
    ['verb, verbal noun', 20, (t) => t[0] === 'V' && t.includes('V.MSDR')],
    ['noun, singular', 260, (t) => t[0] === 'N' && t.includes('SG')],
    ['noun, plural', 150, (t) => t[0] === 'N' && t.includes('PL') && !t.includes('LGSPEC2')],
    ['noun, archaic plural', 50, (t) => t[0] === 'N' && t.includes('LGSPEC2')],
    ['adjective', 120, (t) => t[0] === 'ADJ'],
];
const POS = {N: 'n', V: 'v', ADJ: 'adj'};
const WORD = /^[\u10D0-\u10FA]+$/u;

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const file = args[0];
if (file === undefined || file.startsWith('--')) {
    console.error('usage: node languages/ka/sources/build-corpus.mjs <unimorph kat file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]');
    process.exit(2);
}
const cli = option('--cli', resolve(here, '../../../build/hoshidicts-cli'));
const transformsFile = resolve(option('--transforms', join(here, '..', 'transforms.json')));
const outDir = resolve(option('--out', join(here, '..', 'tests')));
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

// Distinct (form, lemma, tags) rows of Georgian letters only (the file has a
// few Latin letters typed for Georgian ones), the form differing from the
// lemma.
const seen = new Set();
const rows = [];
for (const line of data.toString('utf8').split('\n')) {
    const [lemma, form, tags] = line.split('\t');
    if (!tags || !WORD.test(lemma) || !WORD.test(form) || lemma === form) { continue; }
    const key = `${form}\t${lemma}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    rows.push({lemma, form, tags: tags.trim()});
}

const random = mulberry32(SEED);
const sample = [];
for (const [label, count, test] of STRATA) {
    const pool = rows.filter((row) => test(row.tags.split(';')));
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const row of pool.slice(0, count)) { sample.push({...row, stratum: label}); }
}

// Which rows the rules reach: the lemma among the deinflections of the form.
const forms = [...new Set(sample.map((row) => row.form))];
const run = spawnSync(cli, ['--languages', resolve(here, '../..'), 'deinflect', 'ka', '--stdin', '--transforms', transformsFile, '--all-options'],
    {input: forms.join('\n') + '\n', maxBuffer: 1 << 30});
if (run.status !== 0) { throw new Error(`hoshidicts-cli failed: ${run.stderr}`); }
const reached = new Map();
for (const line of run.stdout.toString('utf8').split('\n').filter(Boolean)) {
    const result = JSON.parse(line);
    reached.set(result.input, new Set(result.results.map((r) => r.text)));
}

const header = [
    `# Source: UniMorph kat (https://github.com/unimorph/kat/blob/${COMMIT}/kat, sha256 ${SHA256.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors (annotators Simon Guriel, Silvia Guriel-Agiashvili and Nona Atanelov).`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${STRATA.map(([label, count]) => `${count} ${label}`).join(', ')}); the rows the pack's rules reach are in corpus.tsv, the others in gaps.tsv.`,
    '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)',
];
const line = (row) => `${row.tags}\t1\t${row.form}\t${row.lemma}\t${POS[row.tags.split(';')[0]]}\t*`;
const corpus = sample.filter((row) => reached.get(row.form)?.has(row.lemma));
const gaps = sample.filter((row) => !reached.get(row.form)?.has(row.lemma));

if (!existsSync(outDir)) { mkdirSync(outDir, {recursive: true}); }
writeFileSync(join(outDir, 'corpus.tsv'), [...header, ...corpus.map(line)].join('\n') + '\n');
const gapsFile = join(outDir, 'gaps.tsv');
const handWritten = existsSync(gapsFile)
    ? readFileSync(gapsFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#') && !l.split('\t')[0].includes(';'))
    : [];
writeFileSync(gapsFile, [
    '# Known gaps: run by the conformance test and counted, not enforced.',
    '# Hand-written rows (categories without ";"): written for this pack, no third-party data.',
    ...header, ...handWritten, ...gaps.map(line)].join('\n') + '\n');
console.log(`corpus.tsv: ${corpus.length} rows; gaps.tsv: ${gaps.length} UniMorph rows and ${handWritten.length} hand-written rows (of ${sample.length} sampled from ${rows.length})`);
