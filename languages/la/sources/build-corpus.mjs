#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the sampled rows of tests/gaps.tsv, and splits
// the sample with hoshidicts-cli: rows the pack's rules reach go to
// corpus.tsv, the others to gaps.tsv (docs/languages.md 12.2).
//
//   node languages/la/sources/build-corpus.mjs <unimorph lat file> <kaikki Latin jsonl.gz> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]
//
// Sources (both from English Wiktionary):
// - UniMorph lat, https://github.com/unimorph/lat/blob/050924c9f013e6aba4d7c87be243a1d79b6c5b10/lat
//   (sha256 7aed5a2fd17c29474e85e315d42654d1794a3d3efc956b387714ca601a608a2b),
//   CC BY-SA 3.0, by the UniMorph contributors: nouns, proper nouns,
//   adjectives, participles, and verbs in their present system. UniMorph lat
//   has almost no perfect forms (13 rows).
// - kaikki.org's Latin extract of English Wiktionary,
//   https://kaikki.org/dictionary/Latin/kaikki.org-dictionary-Latin.jsonl.gz
//   (2026-10-30, sha256 621efbea7ffcec747aa39d03fbf54eb316de47a9af9cf7fa5a0a95a9fbf19b1a),
//   CC BY-SA 4.0 and GFDL, by the Wiktionary contributors, extracted by
//   wiktextract (Tatu Ylonen): the perfect system of verbs, comparison of
//   adjectives, and pronouns and determiners.

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {createGunzip} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const UNIMORPH_SHA256 = '7aed5a2fd17c29474e85e315d42654d1794a3d3efc956b387714ca601a608a2b';
const UNIMORPH_COMMIT = '050924c9f013e6aba4d7c87be243a1d79b6c5b10';
const KAIKKI_SHA256 = '621efbea7ffcec747aa39d03fbf54eb316de47a9af9cf7fa5a0a95a9fbf19b1a';
const SEED = 1;

// Strata; within each, rows are drawn uniformly.
const UNIMORPH_STRATA = [
    ['noun', 230, (t) => t[0] === 'N'],
    ['proper noun', 50, (t) => t[0] === 'PROPN'],
    ['adjective', 110, (t) => t[0] === 'ADJ'],
    ['participle', 90, (t) => t[0] === 'V.PTCP'],
    ['verb, active', 150, (t) => t[0] === 'V' && t.includes('ACT') && !t.includes('NFIN') && !t.includes('V.MSDR') && !t.includes('V.PTCP')],
    ['verb, passive', 70, (t) => t[0] === 'V' && t.includes('PASS') && !t.includes('NFIN') && !t.includes('V.PTCP')],
    ['verb, infinitive, gerund, supine or participle', 40, (t) => t[0] === 'V' && (t.includes('NFIN') || t.includes('V.MSDR') || t.includes('V.PTCP'))],
];
const KAIKKI_STRATA = [
    ['verb, perfect system', 160, (pos, tags) => pos === 'verb' && tags.includes('active') && (tags.includes('perfect') || tags.includes('pluperfect'))],
    ['adjective, comparison', 25, (pos, tags) => pos === 'adj' && (tags.includes('comparative') || tags.includes('superlative'))],
    ['pronoun or determiner', 25, (pos, tags) => (pos === 'pron' || pos === 'det') && ['genitive', 'dative', 'accusative', 'ablative', 'nominative'].some((c) => tags.includes(c))],
];
const UNIMORPH_POS = {N: 'n', PROPN: '*', ADJ: 'adj', V: 'v', 'V.PTCP': 'v'};
// kaikki's tags, written as UniMorph writes features, to keep the files short.
const KAIKKI_FEATURES = {
    active: 'ACT', passive: 'PASS', indicative: 'IND', subjunctive: 'SBJV', imperative: 'IMP', infinitive: 'NFIN', present: 'PRS',
    imperfect: 'IPFV', future: 'FUT', perfect: 'PRF', pluperfect: 'PLPF', 'first-person': '1', 'second-person': '2', 'third-person': '3',
    singular: 'SG', plural: 'PL', nominative: 'NOM', genitive: 'GEN', dative: 'DAT', accusative: 'ACC', ablative: 'ABL', vocative: 'VOC',
    locative: 'LOC', masculine: 'MASC', feminine: 'FEM', neuter: 'NEUT', comparative: 'CMPR', superlative: 'SPRL', common: 'COM',
};
const ORDER = ['comparative', 'superlative', 'active', 'passive', 'indicative', 'subjunctive', 'imperative', 'infinitive', 'present', 'imperfect',
               'future', 'perfect', 'pluperfect', 'nominative', 'genitive', 'dative', 'accusative', 'ablative', 'vocative', 'locative', 'masculine',
               'feminine', 'neuter', 'common', 'first-person', 'second-person', 'third-person', 'singular', 'plural'];
const features = (pos, tags) => [({verb: 'V', adj: 'ADJ', pron: 'PRON', det: 'DET'})[pos],
    ...ORDER.filter((t) => tags.includes(t)).map((t) => KAIKKI_FEATURES[t])].join(';');
const KAIKKI_POS = {verb: 'v', adj: 'adj', pron: '*', det: '*'};
const plain = (text) => text.normalize('NFD').replace(/[\u0300-\u036F]/gu, '').normalize('NFC');
// Dictionaries write consonantal i as i (iūs, not jūs).
const headword = (text) => plain(text).replace(/j/gu, 'i').replace(/J/gu, 'I');
const LETTERS = /^[A-Za-z\u00C0-\u024F\u0300-\u036F]+( [A-Za-z\u00C0-\u024F\u0300-\u036F]+)*$/u;

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const [unimorphFile, kaikkiFile] = args;
if (unimorphFile === undefined || kaikkiFile === undefined || unimorphFile.startsWith('--') || kaikkiFile.startsWith('--')) {
    console.error('usage: node languages/la/sources/build-corpus.mjs <unimorph lat file> <kaikki Latin jsonl.gz> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]');
    process.exit(2);
}
const cli = option('--cli', resolve(here, '../../../build/hoshidicts-cli'));
const transformsFile = resolve(option('--transforms', join(here, '..', 'transforms.json')));
const outDir = resolve(option('--out', join(here, '..', 'tests')));

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}
for (const [file, expected] of [[unimorphFile, UNIMORPH_SHA256], [kaikkiFile, KAIKKI_SHA256]]) {
    const sha = sha256(file);
    if (sha !== expected) { throw new Error(`${file} has sha256 ${sha}, not ${expected}`); }
}

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

// Eligible rows: words of Latin letters (with their macrons), a form that
// differs from its lemma once macrons are removed, one row per form, lemma
// and part of speech.
const seen = new Set();
function eligible(form, lemma, pos) {
    if (!LETTERS.test(form) || !LETTERS.test(lemma)) { return false; }
    if (headword(form) === headword(lemma)) { return false; }
    const key = `${headword(form)}\t${headword(lemma)}\t${pos}`;
    if (seen.has(key)) { return false; }
    seen.add(key);
    return true;
}

const unimorphPools = UNIMORPH_STRATA.map(() => []);
for (const line of readFileSync(unimorphFile, 'utf8').split('\n')) {
    const [lemma, form, feats] = line.split('\t');
    if (!lemma || !form || !feats) { continue; }
    const tags = feats.split(';');
    const s = UNIMORPH_STRATA.findIndex(([, , test]) => test(tags));
    if (s < 0 || !eligible(form, lemma, UNIMORPH_POS[tags[0]])) { continue; }
    unimorphPools[s].push([`UniMorph ${feats}`, '1', form, headword(lemma), UNIMORPH_POS[tags[0]], '*']);
}

const kaikkiPools = KAIKKI_STRATA.map(() => []);
const lines = createInterface({input: createReadStream(kaikkiFile).pipe(createGunzip()), crlfDelay: Infinity});
for await (const line of lines) {
    if (!line.includes('"forms"')) { continue; }
    const entry = JSON.parse(line);
    if (entry.lang_code !== 'la' || !(entry.pos in KAIKKI_POS) || !Array.isArray(entry.forms)) { continue; }
    const lemma = entry.word;
    for (const {form, tags = []} of entry.forms) {
        if (typeof form !== 'string' || form === '-' || form.includes('+')) { continue; }
        if (tags.some((t) => ['canonical', 'table-tags', 'inflection-template', 'class', 'romanization', 'alternative'].includes(t))) { continue; }
        const s = KAIKKI_STRATA.findIndex(([, , test]) => test(entry.pos, tags));
        if (s < 0 || !eligible(form, lemma, KAIKKI_POS[entry.pos])) { continue; }
        kaikkiPools[s].push([`kaikki ${features(entry.pos, tags)}`, '1', form, headword(lemma), KAIKKI_POS[entry.pos], '*']);
    }
}

const random = mulberry32(SEED);
const sample = [];
const draw = (strata, pools) => strata.forEach(([, quota], s) => {
    const pool = pools[s];
    for (let i = pool.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    sample.push(...pool.slice(0, quota));
});
draw(UNIMORPH_STRATA, unimorphPools);
draw(KAIKKI_STRATA, kaikkiPools);

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
const variants = new Map(run(['--languages', languages, 'preprocess', 'la', '--stdin', '--all-options'], sources)
    .map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(run(['--languages', languages, 'deinflect', 'la', '--stdin', '--all-options', '--transforms', transformsFile], texts)
    .map((answer) => [answer.input, answer.results]));
const passes = ([, , source, term, rule]) => {
    const allowed = rule === '*' ? null : new Set(leaves(rule));
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term
        && (allowed === null || r.conditions.length === 0 || r.conditions.some((c) => allowed.has(c)))));
};

const header = [
    `# Source: UniMorph lat (https://github.com/unimorph/lat/blob/${UNIMORPH_COMMIT}/lat, sha256 ${UNIMORPH_SHA256.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary; and kaikki.org's Latin extract of English Wiktionary (2026-10-30, sha256 ${KAIKKI_SHA256.slice(0, 16)}), CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), by the Wiktionary contributors via wiktextract.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (strata: README.md); rows the rules reach are in corpus.tsv, the others in gaps.tsv. Terms are lemmas without macrons.`,
];
const columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)';
const pass = sample.filter(passes);
const fail = sample.filter((row) => !passes(row));
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'corpus.tsv'), [...header, columns, ...pass.map((r) => r.join('\t'))].join('\n') + '\n');
const gapsFile = join(outDir, 'gaps.tsv');
const gapsHeader = ['# Known gaps: run by the conformance test and counted, not enforced.', ...header];
writeFileSync(gapsFile, [...gapsHeader, columns, ...fail.map((r) => r.join('\t'))].join('\n') + '\n');
const strata = [...UNIMORPH_STRATA.map(([name]) => name), ...KAIKKI_STRATA.map(([name]) => name)];
const stratumOf = (row) => {
    const [source, feats] = row[0].split(' ');
    if (source === 'UniMorph') { return strata[UNIMORPH_STRATA.findIndex(([, , test]) => test(feats.split(';')))]; }
    const [pos, ...rest] = feats.split(';');
    if (pos === 'V') { return 'verb, perfect system'; }
    return pos === 'ADJ' ? 'adjective, comparison' : 'pronoun or determiner';
};
const count = (rows) => Object.fromEntries(strata.map((name) => [name, rows.filter((r) => stratumOf(r) === name).length]));
console.log(JSON.stringify({sampled: sample.length, corpus: pass.length, gaps: fail.length, recall: pass.length / sample.length, reached: count(pass), missed: count(fail)}));
