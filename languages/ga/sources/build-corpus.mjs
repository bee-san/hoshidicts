#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the UniMorph rows of tests/gaps.tsv from
// UniMorph gle, and splits the sample with hoshidicts-cli: rows the pack's
// rules reach go to corpus.tsv, the others to gaps.tsv (docs/languages.md
// 12.2). Hand-written rows already in gaps.tsv (categories without ';') are
// kept. Run from the repository root after building hoshidicts-cli:
//
//   node languages/ga/sources/build-corpus.mjs <unimorph gle file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]
//
// UniMorph gle writes many forms as phrases: the article (na ngreadóg), a
// preposition and the article (leis an ngreadóg), the vocative particle
// (a ghreadóga), a verbal particle (go ngreannaí, dá ngreannaínn, the
// relative a ghreannaíodh) or a subject pronoun (ghreannaigh sé). A reader
// hovers the inflected word itself, so the source is that word, with the
// mutation the phrase gives it: those words are dropped from the form. A
// form of any other shape, a multiword lemma, and a form equal to its lemma
// are left out.

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const COMMIT = 'efdca3ead351c804224b97336c3bcef8c78b6015';
const SHA256 = '88b9c0dee797fc16a20486ff300b70f94770847406364f473a03e86cc30173cb';
const SEED = 1;
const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
if (args.length === 0 || args[0].startsWith('--')) {
    console.error('usage: node languages/ga/sources/build-corpus.mjs <unimorph gle file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]');
    process.exit(2);
}
const cli = option('--cli', resolve(here, '../../../build/hoshidicts-cli'));
const transformsFile = resolve(option('--transforms', join(here, '..', 'transforms.json')));
const outDir = resolve(option('--out', join(here, '..', 'tests')));
const data = readFileSync(args[0]);
const sha = createHash('sha256').update(data).digest('hex');
if (sha !== SHA256) { throw new Error(`${args[0]}: sha256 ${sha}, expected ${SHA256} (UniMorph gle at ${COMMIT})`); }

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

// Words a phrase may put before (leading) or after (trailing) the inflected
// word, by part of speech.
const SHAPES = {
    N: {leading: [[], ['na'], ['an'], ['a'], ['leis', 'an'], ['leis', 'na']], trailing: [[]]},
    V: {leading: [[], ['a'], ['go'], ['dá']], trailing: [[], ['mé'], ['tú'], ['sé'], ['sí'], ['muid'], ['sibh'], ['siad']]},
    ADJ: {leading: [[], ['níos'], ['is'], ['a']], trailing: [[]]},
};
const RULE = {N: 'n', V: 'v', ADJ: 'adj'};
const WORD = /^[A-Za-zÁÉÍÓÚáéíóú'-]+$/u;
// English table headings that the Wiktionary scrape left as forms (85 rows).
const HEADINGS = new Set(['Singular', 'Plural', 'present', 'past']);

function hovered(pos, form) {
    const words = form.split(' ');
    for (const lead of SHAPES[pos].leading) {
        for (const trail of SHAPES[pos].trailing) {
            if (words.length !== lead.length + trail.length + 1) { continue; }
            if (lead.every((w, i) => words[i] === w) && trail.every((w, i) => words[lead.length + 1 + i] === w)) {
                return words[lead.length];
            }
        }
    }
    return null;
}

// Strata: [name, quota, test on the part of speech and tag].
const STRATA = [
    ['verb, finite', 420, (pos, tags) => pos === 'V' && !tags.includes('V.MSDR') && !tags.includes('V.PTCP')],
    ['verb, verbal noun or adjective', 60, (pos, tags) => pos === 'V' && (tags.includes('V.MSDR') || tags.includes('V.PTCP'))],
    ['noun, genitive singular', 130, (pos, tags) => pos === 'N' && tags.includes('GEN') && tags.includes('SG')],
    ['noun, plural', 150, (pos, tags) => pos === 'N' && tags.includes('PL')],
    ['noun, mutated singular', 90, (pos, tags) => pos === 'N' && tags.includes('SG') && !tags.includes('GEN')],
    ['adjective', 150, (pos) => pos === 'ADJ'],
];

const rows = [];
const keys = new Set();
for (const line of data.toString('utf8').split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 3) { continue; }
    const [lemma, form, tag] = parts;
    const tags = tag.split(';');
    const pos = tags[0];
    if (!(pos in SHAPES) || !WORD.test(lemma)) { continue; }
    const word = hovered(pos, form);
    if (word === null || !WORD.test(word) || word === lemma || HEADINGS.has(word)) { continue; }
    const key = `${word}\t${lemma}\t${pos}`;
    if (keys.has(key)) { continue; }
    keys.add(key);
    rows.push({tag, pos, tags, row: [tag, '1', word, lemma, RULE[pos], '*']});
}

const random = mulberry32(SEED);
const sample = [];
STRATA.forEach(([, quota, test]) => {
    const pool = rows.filter((r) => test(r.pos, r.tags));
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    sample.push(...pool.slice(0, quota).map((r) => r.row));
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
const variants = new Map(run(['--languages', languages, 'preprocess', 'ga', '--stdin', '--all-options'], sources)
    .map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(run(['--languages', languages, 'deinflect', 'ga', '--stdin', '--all-options', '--transforms', transformsFile], texts)
    .map((answer) => [answer.input, answer.results]));
const passes = ([, , source, term, rule]) => {
    const allowed = new Set(leaves(rule));
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term && (r.conditions.length === 0 || r.conditions.some((c) => allowed.has(c)))));
};

const header = [
    `# Source: UniMorph gle (https://github.com/unimorph/gle/blob/${COMMIT}/gle, sha256 ${sha.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${STRATA.map(([name, quota]) => `${quota} ${name}`).join(', ')}); the source is the inflected word of UniMorph's form, without the article, particle, preposition or subject pronoun the form writes with it. The rows the pack's rules reach are in corpus.tsv, the others in gaps.tsv.`,
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
const byStratum = (list) => Object.fromEntries(STRATA.map(([name, , test]) => [name, list.filter((r) => {
    const tags = r[0].split(';');
    return test(tags[0], tags);
}).length]));
console.log(JSON.stringify({sha256: sha, eligible: rows.length, sampled: sample.length, corpus: pass.length, gaps: fail.length, recall: pass.length / sample.length,
    reached: byStratum(pass), missed: byStratum(fail)}));
