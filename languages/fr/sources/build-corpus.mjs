#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the UniMorph rows of tests/gaps.tsv from
// UniMorph fra (fra.um4), and splits the sample with hoshidicts-cli: rows the
// pack's rules reach go to corpus.tsv, the others to gaps.tsv
// (docs/languages.md 12.2). Hand-written rows already in gaps.tsv (categories
// without ';') are kept.
//
//   node languages/fr/sources/build-corpus.mjs <fra.um4> <fr_50k.txt> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]
//
// fra.um4 is https://github.com/unimorph/fra/blob/f672f8cceb2d5f5a1e2241b5622c8845f8274635/fra.um4
// (sha256 4365f2f4660b9f933c6b76ee81c1445e8a02b67ee2526a84575e7f8e656ac9ce),
// CC BY-SA 3.0, by the UniMorph contributors (from English Wiktionary).
// fr_50k.txt is the 2018 French subtitle list of FrequencyWords
// (https://github.com/hermitdave/FrequencyWords/blob/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/fr/fr_50k.txt,
// sha256 f81f7c570b6433764da99aa30f4dfb08d81c5926301377b709af23a13b1f9596,
// content CC BY-SA 4.0); it only chooses which lemmas count as frequent.

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHA256 = '4365f2f4660b9f933c6b76ee81c1445e8a02b67ee2526a84575e7f8e656ac9ce';
const FREQUENCY_SHA256 = 'f81f7c570b6433764da99aa30f4dfb08d81c5926301377b709af23a13b1f9596';
const COMMIT = 'f672f8cceb2d5f5a1e2241b5622c8845f8274635';
const SEED = 1;
// A lemma is frequent when it is among the first FREQUENT words of the list.
const FREQUENT = 10000;
// Strata by kind of form; half of each from frequent lemmas, half from all,
// uniformly within each half.
const has = (t, ...xs) => xs.every((x) => t.includes(x));
const STRATA = [
    // Imperatives are left out: every French imperative is spelt as a
    // present or subjunctive form, which the sample already has (one row per
    // form); tests/cases.tsv tests them.
    ['verb, present', 110, (t) => t[0] === 'V' && has(t, 'IND', 'PRS')],
    ['verb, imperfect', 70, (t) => t[0] === 'V' && has(t, 'IND', 'PST', 'IPFV')],
    ['verb, simple past', 80, (t) => t[0] === 'V' && has(t, 'IND', 'PST', 'PFV')],
    ['verb, future', 70, (t) => t[0] === 'V' && has(t, 'IND', 'FUT')],
    ['verb, conditional', 60, (t) => t[0] === 'V' && has(t, 'COND')],
    ['verb, present subjunctive', 80, (t) => t[0] === 'V' && has(t, 'SBJV', 'PRS')],
    ['verb, imperfect subjunctive', 50, (t) => t[0] === 'V' && has(t, 'SBJV', 'PST')],
    ['verb, present participle', 40, (t) => t[0] === 'V' && has(t, 'V.PTCP', 'PRS')],
    ['verb, past participle', 60, (t) => t[0] === 'V' && has(t, 'V.PTCP', 'PST')],
    ['verb, past participle agreeing', 70, (t) => t[0] === 'V.PTCP' && !has(t, 'MASC', 'SG')],
    ['noun, plural', 150, (t) => t[0] === 'N' && has(t, 'PL')],
    ['noun, feminine singular', 30, (t) => t[0] === 'N' && has(t, 'FEM', 'SG')],
    ['adjective', 130, (t) => t[0] === 'ADJ'],
];
const POS = {N: 'n', V: 'v', 'V.PTCP': 'v', ADJ: 'adj'};
const WORD = /^[a-zàâäæçéèêëîïôöœùûüÿ]+$/u;

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const [file, frequencyFile] = args;
if (file === undefined || frequencyFile === undefined || file.startsWith('--') || frequencyFile.startsWith('--')) {
    console.error('usage: node languages/fr/sources/build-corpus.mjs <fra.um4> <fr_50k.txt> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]');
    process.exit(2);
}
const cli = option('--cli', resolve(here, '../../../build/hoshidicts-cli'));
const transformsFile = resolve(option('--transforms', join(here, '..', 'transforms.json')));
const outDir = resolve(option('--out', join(here, '..', 'tests')));
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const data = readFileSync(file);
if (sha(data) !== SHA256) { throw new Error(`${file} has sha256 ${sha(data)}, not ${SHA256}`); }
const frequencyData = readFileSync(frequencyFile);
if (sha(frequencyData) !== FREQUENCY_SHA256) { throw new Error(`${frequencyFile} has sha256 ${sha(frequencyData)}, not ${FREQUENCY_SHA256}`); }
const frequent = new Set(frequencyData.toString('utf8').split('\n').slice(0, FREQUENT).map((line) => line.split(' ')[0]));

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

// The rows of fra.um4, with the verbs whose conditional is not modern French
// (8 lemmas with Old French endings such as cuiderois) left out, and the
// agreeing participles (whose lemma is the masculine participle) given the
// infinitive of their verb.
const rows = [];
const conditional = new Map();
const infinitiveOf = new Map();
for (const line of data.toString('utf8').split('\n')) {
    const [lemma, form, feats] = line.split('\t');
    if (!lemma || !form || !feats) { continue; }
    rows.push([lemma, form, feats]);
    if (feats === 'V;COND;1;SG') { conditional.set(lemma, form); }
    if (feats === 'V;V.PTCP;PST') { infinitiveOf.set(form, lemma); }
}
const old = new Set([...conditional].filter(([, form]) => !form.endsWith('rais')).map(([lemma]) => lemma));

// Eligible rows: one word of lowercase French letters, a form that differs
// from its lemma; one row per form, lemma and part of speech.
const pools = STRATA.map(() => ({frequent: [], all: []}));
const seen = new Set();
for (const [lemma0, form, feats] of rows) {
    const tags = feats.split(';');
    const lemma = tags[0] === 'V.PTCP' ? infinitiveOf.get(lemma0) : lemma0;
    if (lemma === undefined || old.has(lemma) || form === lemma || !WORD.test(form) || !WORD.test(lemma)) { continue; }
    const s = STRATA.findIndex(([, , test]) => test(tags));
    if (s < 0) { continue; }
    const key = `${form}\t${lemma}\t${POS[tags[0]]}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    const row = [feats, '1', form, lemma, POS[tags[0]], '*'];
    pools[s].all.push(row);
    if (frequent.has(lemma)) { pools[s].frequent.push(row); }
}
const random = mulberry32(SEED);
const shuffle = (pool) => {
    for (let i = pool.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
};
const sample = [];
const taken = new Set();
STRATA.forEach(([, quota], s) => {
    const half = Math.ceil(quota / 2);
    let got = 0;
    for (const row of shuffle(pools[s].frequent)) {
        if (got >= half) { break; }
        const key = `${row[2]}\t${row[3]}\t${row[4]}`;
        if (taken.has(key)) { continue; }
        taken.add(key);
        sample.push(row);
        ++got;
    }
    for (const row of shuffle(pools[s].all)) {
        if (got >= quota) { break; }
        const key = `${row[2]}\t${row[3]}\t${row[4]}`;
        if (taken.has(key)) { continue; }
        taken.add(key);
        sample.push(row);
        ++got;
    }
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
const variants = new Map(run(['--languages', languages, 'preprocess', 'fr', '--stdin', '--all-options'], sources)
    .map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(run(['--languages', languages, 'deinflect', 'fr', '--stdin', '--all-options', '--transforms', transformsFile], texts)
    .map((answer) => [answer.input, answer.results]));
const passes = ([, , source, term, rule]) => {
    const allowed = new Set(leaves(rule));
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term && (r.conditions.length === 0 || r.conditions.some((c) => allowed.has(c)))));
};

const header = [
    `# Source: UniMorph fra (https://github.com/unimorph/fra/blob/${COMMIT}/fra.um4, sha256 ${SHA256.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${STRATA.map(([name, quota]) => `${quota} ${name}`).join(', ')}), half of each from lemmas among the first ${FREQUENT} words of FrequencyWords fr_50k.txt; the rows the pack's rules reach are in corpus.tsv, the others in gaps.tsv.`,
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
const byStratum = (list) => Object.fromEntries(STRATA.map(([name, , test]) => [name, list.filter((r) => test(r[0].split(';'))).length]));
console.log(JSON.stringify({sampled: sample.length, corpus: pass.length, gaps: fail.length, recall: pass.length / sample.length, reached: byStratum(pass), missed: byStratum(fail)}));
