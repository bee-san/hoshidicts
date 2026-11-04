#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the UniMorph rows of tests/gaps.tsv from
// UniMorph hbs, and splits the sample with hoshidicts-cli: rows the pack's
// rules reach go to corpus.tsv, the others to gaps.tsv (docs/languages.md
// 12.2). Hand-written rows already in gaps.tsv (categories without ';') are
// kept. It also writes the reasons of the rows that `build-own.mjs --cases`
// writes at the end of tests/cases.tsv (one example of each transform): the
// trace of the shortest deinflection that reaches the row's lemma (the CLI
// prints it in the order of the reasons column), so that
// each transform id is tested (run build-own.mjs --cases first). A row is reached as the conformance test decides it: the source
// through every preprocessor (all options on), each variant deinflected, and
// the lemma among the results with no conditions or the row's part of
// speech.
//
//   node languages/sh/sources/build-corpus.mjs <unimorph hbs file> [--cli <hoshidicts-cli>] [--languages <dir>] [--out <dir>]
//
// The file is https://github.com/unimorph/hbs/blob/f41348090bf8ec35e41fee61d7c52d12ae1feff1/hbs
// (sha256 736bf8f0cb726f2c6f88af67c01cd72271889169b227e05a1f665af874a54bf0),
// CC BY-SA 3.0, by the UniMorph contributors (from English Wiktionary).

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHA256 = '736bf8f0cb726f2c6f88af67c01cd72271889169b227e05a1f665af874a54bf0';
const COMMIT = 'f41348090bf8ec35e41fee61d7c52d12ae1feff1';
const SEED = 1;
const has = (t, x) => t.split(';').includes(x);
const MARKS = /[\u0300-\u036F]/u;
const plain = (s) => !MARKS.test(s.normalize('NFD').replace(/[\u030C\u0301]/gu, ''));
const accented = (s) => /[\u0300-\u036F]/u.test(s.normalize('NFD').replace(/(?<=[cCzZsS])\u030C|(?<=[cC])\u0301/gu, ''));
const WORD = /^[A-Za-zčćžšđČĆŽŠĐ]+$/u;
// Strata by kind of form; within each, rows are drawn uniformly. Forms are
// one word of Latin letters without accent marks, except the future (two
// words, radit ću) and the last stratum (forms written with accent marks,
// such as grȁđani, which the accent processor reads).
const STRATA = [
    ['noun, singular', 155, (r) => r.pos === 'N' && has(r.tags, 'SG')],
    ['noun, plural', 155, (r) => r.pos === 'N' && has(r.tags, 'PL')],
    ['adjective', 150, (r) => r.pos === 'ADJ' && !has(r.tags, 'CMPR') && !has(r.tags, 'SPRL')],
    ['adjective, comparative or superlative', 60, (r) => r.pos === 'ADJ' && (has(r.tags, 'CMPR') || has(r.tags, 'SPRL'))],
    ['verb, present', 150, (r) => r.tags.startsWith('V;PRS;')],
    ['verb, imperative', 50, (r) => r.tags.startsWith('V;IMP;')],
    ['verb, imperfect', 40, (r) => r.tags.startsWith('V;PROG;PST;') || (r.tags.startsWith('V;PST;') && has(r.tags, 'LGSPEC2'))],
    ['verb, l-participle', 100, (r) => r.tags.startsWith('V.PTCP;ACT;PST')],
    ['verb, passive participle', 60, (r) => r.tags.startsWith('V.PTCP;PASS;PST')],
    ['verb, future', 50, (r) => r.tags.startsWith('V;FUT;') && !has(r.tags, 'LGSPEC1')],
    ['form with accent marks', 30, (r) => r.accented],
];
const POS = {N: 'n', V: 'v', 'V.PTCP': 'v', ADJ: 'adj'};

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const file = args[0];
if (file === undefined || file.startsWith('--')) {
    console.error('usage: node languages/sh/sources/build-corpus.mjs <unimorph hbs file> [--cli <hoshidicts-cli>] [--languages <dir>] [--out <dir>]');
    process.exit(2);
}
const cli = option('--cli', resolve(here, '../../../build/hoshidicts-cli'));
const languages = resolve(option('--languages', join(here, '..', '..')));
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

// One row per form, lemma and part of speech, with the first tag set.
const seen = new Set();
const rows = [];
for (const line of data.toString('utf8').split('\n')) {
    const [lemma, form, tags] = line.split('\t');
    if (tags === undefined || lemma === form) { continue; }
    const pos = tags.split(';')[0];
    if (!(pos in POS) || !WORD.test(lemma) || !plain(lemma)) { continue; }
    const words = form.split(' ');
    const future = tags.startsWith('V;FUT;') && words.length === 2 && /^ć(?:u|eš|e|emo|ete)$/u.test(words[1]) && WORD.test(words[0]) && plain(words[0]);
    const isAccented = words.length === 1 && accented(form) && WORD.test(form.normalize('NFD').replace(/[\u0300-\u036F]/gu, '').normalize('NFC'));
    if (!future && !isAccented && !(words.length === 1 && WORD.test(form) && plain(form))) { continue; }
    const key = `${form}\t${lemma}\t${POS[pos]}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    rows.push({lemma, form, tags, pos, accented: isAccented});
}

// Draw each stratum without replacement, in file order of the draws.
const random = mulberry32(SEED);
const taken = new Set();
const sample = [];
for (const [name, count, test] of STRATA) {
    const pool = rows.filter((r) => !taken.has(r) && (name === 'form with accent marks' ? r.accented : !r.accented) && test(r));
    for (let i = 0; i < count && pool.length > 0; ++i) {
        const j = Math.floor(random() * pool.length);
        const [row] = pool.splice(j, 1);
        taken.add(row);
        sample.push({...row, stratum: name});
    }
}

function run(command, inputs) {
    const result = spawnSync(cli, ['--languages', languages, command, 'sh', '--stdin', '--all-options'], {input: `${inputs.join('\n')}\n`, maxBuffer: 1 << 30});
    if (result.status !== 0) { throw new Error(`${cli} ${command} failed: ${result.stderr}`); }
    return result.stdout.toString('utf8').trim().split('\n').map((l) => JSON.parse(l));
}

// Split: preprocess every source, deinflect every variant.
const variants = run('preprocess', sample.map((r) => r.form));
const allVariants = [...new Set(variants.flatMap((v) => v.variants.map((x) => x.text)))];
const deinflected = new Map(run('deinflect', allVariants).map((d) => [d.input, d.results]));
const reached = (row, i) => variants[i].variants.some((v) => (deinflected.get(v.text) ?? []).some(
    (d) => d.text === row.lemma && (d.conditions.length === 0 || d.conditions.includes(POS[row.pos]))));

const header = [
    `# Source: UniMorph hbs (https://github.com/unimorph/hbs/blob/${COMMIT}/hbs, sha256 ${SHA256.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${STRATA.map(([n, c]) => `${c} ${n}`).join(', ')}); the rows the pack's rules reach are in corpus.tsv, the others in gaps.tsv.`,
];
const line = (r) => `${r.tags}\t1\t${r.form}\t${r.lemma}\t${POS[r.pos]}\t*`;
const corpus = [];
const gaps = [];
sample.forEach((r, i) => (reached(r, i) ? corpus : gaps).push(r));
if (!existsSync(outDir)) { mkdirSync(outDir, {recursive: true}); }
writeFileSync(join(outDir, 'corpus.tsv'), `${[...header, '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)', ...corpus.map(line)].join('\n')}\n`);
const gapsFile = join(outDir, 'gaps.tsv');
const handWritten = existsSync(gapsFile)
    ? readFileSync(gapsFile, 'utf8').split('\n').filter((l) => l !== '' && !l.startsWith('#') && !l.split('\t')[0].includes(';'))
    : [];
writeFileSync(gapsFile, `${[
    '# Known gaps: run by the conformance test and counted, not enforced.',
    '# Hand-written rows (categories without ";"): written for this pack, no third-party data.',
    ...header,
    '# category\tvalid\tsource\tterm\trule\treasons',
    ...handWritten,
    ...gaps.map(line),
].join('\n')}\n`);
// The reasons of the generated example rows of cases.tsv.
const CASES_MARKER = '# --- One example of each transform';
const casesFile = join(outDir, 'cases.tsv');
if (existsSync(casesFile)) {
    const text = readFileSync(casesFile, 'utf8');
    const at = text.indexOf(CASES_MARKER);
    if (at >= 0) {
        const lines = text.slice(at).split('\n').filter((l) => l !== '');
        const rows = lines.slice(1).map((l) => l.split('\t'));
        const pre = run('preprocess', rows.map((r) => r[2]));
        const texts = [...new Set(pre.flatMap((p) => p.variants.map((v) => v.text)))];
        const found = new Map(run('deinflect', texts).map((d) => [d.input, d.results]));
        const pinned = rows.map((r, i) => {
            const paths = pre[i].variants.flatMap((v) => (found.get(v.text) ?? []).filter(
                (d) => d.text === r[3] && (d.conditions.length === 0 || d.conditions.includes(r[4]))).map((d) => d.trace));
            const best = paths.sort((a, b) => a.length - b.length)[0];
            return [...r.slice(0, 5), best === undefined ? '*' : best.join('|')].join('\t');
        });
        writeFileSync(casesFile, `${text.slice(0, at)}${lines[0]}\n${pinned.join('\n')}\n`);
    }
}
const byStratum = (list) => STRATA.map(([n]) => `${n} ${list.filter((r) => r.stratum === n).length}`).join(', ');
console.log(`sample ${sample.length}: corpus ${corpus.length}, gaps ${gaps.length} (${byStratum(gaps)})`);
