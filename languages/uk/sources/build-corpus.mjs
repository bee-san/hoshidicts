#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the Wiktionary rows of tests/gaps.tsv from the
// declension and conjugation tables of English Wiktionary's Ukrainian
// entries, as kaikki.org extracts them, and splits the sample with
// hoshidicts-cli: rows the pack's rules reach go to corpus.tsv, the others to
// gaps.tsv (docs/languages.md 12.2). Hand-written rows already in gaps.tsv
// (categories that do not start with a part of speech and ":") are kept.
//
//   node languages/uk/sources/build-corpus.mjs <kaikki.org-dictionary-Ukrainian.jsonl.gz> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]
//
// The file is https://kaikki.org/dictionary/Ukrainian/kaikki.org-dictionary-Ukrainian.jsonl.gz
// as downloaded on 2026-11-03 (English Wiktionary dump of 2026-10-01; sha256
// 2b8074025c192314a3906b6bb33587ff1c97f06b398f422308001561124b9586),
// CC BY-SA 4.0 and GFDL, by the Wiktionary contributors, extracted by
// wiktextract (Tatu Ylonen).

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const SHA256 = '2b8074025c192314a3906b6bb33587ff1c97f06b398f422308001561124b9586';
const SEED = 1;
const POS = {noun: 'n', verb: 'v', adj: 'adj', num: 'num', det: '*'};
// Strata by kind of form; within each, rows are drawn uniformly.
const has = (tags, ...names) => names.some((n) => tags.includes(n));
const STRATA = [
    ['verb, present or future', 250, (p, t, lemma) => p === 'verb' && !lemma.endsWith('ся') && has(t, 'present', 'future') && !has(t, 'adverbial', 'passive', 'active')],
    ['verb, past', 120, (p, t, lemma) => p === 'verb' && !lemma.endsWith('ся') && has(t, 'past') && !has(t, 'adverbial', 'passive', 'active')],
    ['verb, imperative', 90, (p, t, lemma) => p === 'verb' && !lemma.endsWith('ся') && has(t, 'imperative')],
    ['verb, participle or infinitive', 100, (p, t, lemma) => p === 'verb' && !lemma.endsWith('ся') && has(t, 'adverbial', 'passive', 'active', 'infinitive')],
    ['reflexive verb', 140, (p, t, lemma) => p === 'verb' && lemma.endsWith('ся')],
    ['noun, singular', 260, (p, t) => p === 'noun' && has(t, 'singular')],
    ['noun, plural', 260, (p, t) => p === 'noun' && has(t, 'plural')],
    ['adjective', 240, (p, t) => p === 'adj' && !has(t, 'comparative', 'superlative')],
    ['adjective, comparative or superlative', 25, (p, t) => p === 'adj' && has(t, 'comparative', 'superlative')],
    ['numeral or determiner', 30, (p) => p === 'num' || p === 'det'],
];
// Forms of a table: one word of Ukrainian letters, with or without
// apostrophes and hyphens, that differs from its lemma.
const WORD = /^[а-щьюяєіїґ][а-щьюяєіїґ'\-]*$/u;
const SKIP_TAGS = new Set(['romanization', 'canonical', 'table-tags', 'inflection-template', 'class', 'error-unrecognized-form',
    'error-unknown-tag', 'dated', 'dialectal', 'archaic', 'obsolete', 'rare', 'alternative', 'nonstandard', 'colloquial', 'poetic',
    'adjective', 'relational', 'diminutive', 'augmentative', 'adverb', 'abstract-noun', 'feminine-noun', 'endearing']);
const CASE_OR_FORM = ['nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'locative', 'vocative', 'present', 'future', 'past',
    'imperative', 'infinitive', 'adverbial', 'passive', 'active', 'comparative', 'superlative'];

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const file = args[0];
if (file === undefined || file.startsWith('--')) {
    console.error('usage: node languages/uk/sources/build-corpus.mjs <kaikki.org-dictionary-Ukrainian.jsonl.gz> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]');
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

const unstressed = (text) => text.normalize('NFD').replace(/[\u0300\u0301]/gu, '').normalize('NFC');

// Pronouns are left out: Wiktionary's table for я lists every personal
// pronoun under я; tests/cases.tsv has the pronouns.
const pools = STRATA.map(() => []);
const seen = new Set();
for (const line of gunzipSync(data).toString('utf8').split('\n')) {
    if (line === '') { continue; }
    const entry = JSON.parse(line);
    const pos = entry.pos;
    if (!(pos in POS)) { continue; }
    const lemma = entry.word;
    if (!WORD.test(lemma)) { continue; }
    for (const form of entry.forms ?? []) {
        const tags = form.tags ?? [];
        if (tags.some((t) => SKIP_TAGS.has(t)) || !tags.some((t) => CASE_OR_FORM.includes(t))) { continue; }
        if (pos !== 'adj' && has(tags, 'comparative', 'superlative')) { continue; }
        const text = unstressed(String(form.form ?? '').replace(/^impersonal: /u, ''));
        if (text === lemma || !WORD.test(text)) { continue; }
        const s = STRATA.findIndex(([, , test]) => test(pos, tags, lemma));
        if (s < 0) { continue; }
        const key = `${text}\t${lemma}\t${pos}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        const category = `${pos}:${[...tags].filter((t) => !['imperfective', 'perfective', 'animate', 'inanimate'].includes(t)).sort().join(',')}`;
        pools[s].push([category, '1', text, lemma, POS[pos], '*']);
    }
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
    if (name === '*') { return null; }
    const condition = transforms.conditions[name];
    return condition.subConditions === undefined ? [name] : condition.subConditions.flatMap(leaves);
};
const sources = [...new Set(sample.map((row) => row[2]))];
const variants = new Map(run(['--languages', languages, 'preprocess', 'uk', '--stdin', '--all-options'], sources)
    .map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(run(['--languages', languages, 'deinflect', 'uk', '--stdin', '--all-options', '--transforms', transformsFile], texts)
    .map((answer) => [answer.input, answer.results]));
const passes = ([, , source, term, rule]) => {
    const allowed = leaves(rule);
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term
        && (allowed === null || r.conditions.length === 0 || r.conditions.some((c) => allowed.includes(c)))));
};

const header = [
    '# Source: English Wiktionary\'s Ukrainian declension and conjugation tables, extracted by kaikki.org (wiktextract;',
    `# https://kaikki.org/dictionary/Ukrainian/, dump of 2026-10-01, sha256 ${SHA256.slice(0, 16)}), CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), by the Wiktionary contributors. Stress marks removed.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${STRATA.map(([name, quota]) => `${quota} ${name}`).join(', ')}); the rows the pack's rules reach are in corpus.tsv, the others in gaps.tsv.`,
];
const columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)';
const pass = sample.filter(passes);
const fail = sample.filter((row) => !passes(row));
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'corpus.tsv'), [...header, columns, ...pass.map((r) => r.join('\t'))].join('\n') + '\n');
const gapsFile = join(outDir, 'gaps.tsv');
const isSampled = (category) => /^(noun|verb|adj|num|det):/u.test(category);
const handRows = existsSync(gapsFile)
    ? readFileSync(gapsFile, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#') && !isSampled(line.split('\t')[0]))
    : [];
const gapsHeader = ['# Known gaps: run by the conformance test and counted, not enforced.', '# Hand-written rows (categories without a part of speech and ":"): written for this pack, no third-party data.', ...header];
writeFileSync(gapsFile, [...gapsHeader, columns, ...handRows, ...fail.map((r) => r.join('\t'))].join('\n') + '\n');
const byStratum = (rows) => Object.fromEntries(STRATA.map(([name, , test]) => [name, rows.filter((r) => {
    const [pos, tags] = r[0].split(':');
    return test(pos, tags.split(','), r[3]);
}).length]));
console.log(JSON.stringify({sampled: sample.length, pools: Object.fromEntries(STRATA.map(([name], s) => [name, pools[s].length])), corpus: pass.length, gaps: fail.length,
    recall: pass.length / sample.length, reached: byStratum(pass), missed: byStratum(fail)}));
