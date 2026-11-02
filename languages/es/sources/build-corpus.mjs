#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the UniMorph rows of tests/gaps.tsv from
// UniMorph spa, and splits the sample with hoshidicts-cli: rows the pack's
// rules reach go to corpus.tsv, the others to gaps.tsv (docs/languages.md
// 12.2). Hand-written rows already in gaps.tsv (categories without ';') are
// kept.
//
//   node languages/es/sources/build-corpus.mjs <unimorph spa file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]
//
// The file is https://github.com/unimorph/spa/blob/b9655efb0e5ce0f99809badaa7f4e93017ab8430/spa
// (sha256 7a165d4b44eb078d23964f3eee3813f5140c5df0ffab0143c806c562e67f8771),
// CC BY-SA 3.0, by the UniMorph contributors (from English Wiktionary).

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHA256 = '7a165d4b44eb078d23964f3eee3813f5140c5df0ffab0143c806c562e67f8771';
const COMMIT = 'b9655efb0e5ce0f99809badaa7f4e93017ab8430';
const SEED = 1;
// Strata by kind of form; within each, rows are drawn uniformly.
const STRATA = [
    ['verb, finite', 800, (t) => t[0] === 'V' && !t.includes('PRO') && ['IND', 'SBJV', 'COND', 'IMP'].some((x) => t.includes(x))],
    ['verb, gerund or participle', 150, (t) => t[0] === 'V' && !t.includes('PRO') && (t.includes('V.CVB') || t.includes('V.PTCP'))],
    ['verb with pronouns', 250, (t) => t[0] === 'V' && t.includes('PRO')],
    ['noun, plural', 250, (t) => t[0] === 'N' && t.includes('PL')],
    ['noun, singular', 50, (t) => t[0] === 'N' && t.includes('SG')],
    ['adjective', 200, (t) => t[0] === 'ADJ'],
];
const POS = {N: 'n', V: 'v', ADJ: 'adj'};
const WORD = /^[a-zñáéíóúü]+$/u;

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const file = args[0];
if (file === undefined || file.startsWith('--')) {
    console.error('usage: node languages/es/sources/build-corpus.mjs <unimorph spa file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]');
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

// Eligible rows: one word, a form that differs from its lemma, only Spanish
// lowercase letters (no acronyms, old spellings or table noise); NEG rows are
// "no" + subjunctive, two words.
const pools = STRATA.map(() => []);
const seen = new Set();
for (const line of data.toString('utf8').split('\n')) {
    const [lemma, form, feats] = line.split('\t');
    if (!lemma || !form || !feats || form === lemma || !WORD.test(form) || !WORD.test(lemma)) { continue; }
    const tags = feats.split(';');
    const s = STRATA.findIndex(([, , test]) => test(tags));
    if (s < 0) { continue; }
    const key = `${form}\t${lemma}\t${POS[tags[0]]}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    pools[s].push([feats, '1', form, lemma, POS[tags[0]], '*']);
}
const random = mulberry32(SEED);
const sample = [];
STRATA.forEach(([, quota], s) => {
    const pool = pools[s];
    for (let i = pool.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    sample.push(...pool.slice(0, quota));
});

// A row passes when a preprocessed variant of the source deinflects to the
// term with compatible conditions (12.2), every optional processor and
// transform on, as the conformance test runs it.
function run(cliArgs, inputs) {
    const result = spawnSync(cli, cliArgs, {input: inputs.join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 30});
    if (result.status !== 0) { throw new Error(`${cli} ${cliArgs.join(' ')} failed: ${result.stderr}`); }
    return result.stdout.trimEnd().split('\n').map((line) => JSON.parse(line));
}
const languages = resolve(here, '..', '..');
const transforms = JSON.parse(readFileSync(transformsFile, 'utf8'));
const leaves = (name) => {
    const condition = transforms.conditions[name];
    return condition.subConditions === undefined ? [name] : condition.subConditions.flatMap(leaves);
};
const sources = [...new Set(sample.map((row) => row[2]))];
const variants = new Map(run(['--languages', languages, 'preprocess', 'es', '--stdin', '--all-options'], sources)
    .map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(run(['--languages', languages, 'deinflect', 'es', '--stdin', '--all-options', '--transforms', transformsFile], texts)
    .map((answer) => [answer.input, answer.results]));
const passes = ([, , source, term, rule]) => {
    const allowed = new Set(leaves(rule));
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term && (r.conditions.length === 0 || r.conditions.some((c) => allowed.has(c)))));
};

const header = [
    `# Source: UniMorph spa (https://github.com/unimorph/spa/blob/${COMMIT}/spa, sha256 ${SHA256.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${STRATA.map(([name, quota]) => `${quota} ${name}`).join(', ')}); the rows the pack's rules reach are in corpus.tsv, the others in gaps.tsv.`,
];
const columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)';
const pass = sample.filter(passes);
const fail = sample.filter((row) => !passes(row));
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'corpus.tsv'), [...header, columns, ...pass.map((r) => r.join('\t'))].join('\n') + '\n');
const gapsFile = join(outDir, 'gaps.tsv');
const handRows = existsSync(gapsFile)
    ? readFileSync(gapsFile, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#') && !line.split('\t')[0].includes(';'))
    : [];
const gapsHeader = ['# Known gaps: run by the conformance test and counted, not enforced.', '# Hand-written rows (categories without ";"): written for this pack, no third-party data.', ...header];
writeFileSync(gapsFile, [...gapsHeader, columns, ...handRows, ...fail.map((r) => r.join('\t'))].join('\n') + '\n');
const byStratum = (rows) => Object.fromEntries(STRATA.map(([name, , test]) => [name, rows.filter((r) => test(r[0].split(';'))).length]));
console.log(JSON.stringify({sampled: sample.length, corpus: pass.length, gaps: fail.length, recall: pass.length / sample.length, reached: byStratum(pass), missed: byStratum(fail)}));
