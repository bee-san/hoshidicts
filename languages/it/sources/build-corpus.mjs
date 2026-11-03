#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the sampled rows of tests/gaps.tsv, and splits
// the sample with hoshidicts-cli: rows the pack's rules reach go to
// corpus.tsv, the others to gaps.tsv (docs/languages.md 12.2). Hand-written
// rows already in gaps.tsv (categories without ';' or ':') are kept.
//
//   node languages/it/sources/build-corpus.mjs <unimorph ita file> <kaikki.org-dictionary-Italian.jsonl.gz> \
//     [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]
//
// UniMorph ita has only verbs, so nouns and adjectives come from Wiktionary
// through kaikki.org:
// - https://github.com/unimorph/ita/blob/fa2cc6ce173643e748bd8f4162709365bdc98805/ita
//   (sha256 6347bb15b3d2c3dafcbe4adc0e7beaa97a8bc61bcccc345079afb154c03f1321), CC BY-SA 3.0,
//   by the UniMorph contributors (from English Wiktionary);
// - https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl.gz, extracted on
//   2026-10-30 from the enwiktionary dump of 2026-10-01 by wiktextract 19f9a30
//   (sha256 edfb787898b80c6ed20db5601741c8d42ad6f59c1c618e396ab34c702a448b63),
//   English Wiktionary content, CC BY-SA 4.0 and GFDL, by the Wiktionary contributors.
//
// Both files run with the pack's defaults (first line `# options: default`),
// so the optional accent processor cannot reach a lemma a broken rule loses
// (parlo → parlò → parlare).

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {createGunzip} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const UNIMORPH_SHA256 = '6347bb15b3d2c3dafcbe4adc0e7beaa97a8bc61bcccc345079afb154c03f1321';
const UNIMORPH_COMMIT = 'fa2cc6ce173643e748bd8f4162709365bdc98805';
const KAIKKI_SHA256 = 'edfb787898b80c6ed20db5601741c8d42ad6f59c1c618e396ab34c702a448b63';
const SEED = 1;
const LETTERS = 'a-zàèéìíòóùú';
const WORD = new RegExp(`^[${LETTERS}]+$`, 'u');
const PHRASE = new RegExp(`^[${LETTERS}']+( [${LETTERS}']+)*$`, 'u');
// A lemma that is a plain infinitive; the others have attached pronouns
// (lavarsi, andarsene, farcela, entrarci, smetterla).
const PLAIN = /(are|ere|ire|rre)$/u;

// Strata by kind of form; within each, rows are drawn uniformly.
const STRATA = [
    ['verb, finite', 300, 'unimorph', (r) => r.plain && r.word && /;(IND|SBJV|COND|IMP)(;|$)/u.test(r.tags)],
    ['verb, gerund or participle', 55, 'unimorph', (r) => r.plain && r.word && /^V\.(CVB|PTCP)/u.test(r.tags)],
    ['verb with pronouns', 120, 'unimorph', (r) => !r.plain],
    ['noun, plural', 110, 'kaikki', (r) => r.pos === 'n' && r.tags.includes('plural')],
    ['noun, other gender', 15, 'kaikki', (r) => r.pos === 'n' && !r.tags.includes('plural')],
    ['adjective', 100, 'kaikki', (r) => r.pos === 'adj'],
];
// kaikki form tags that do not make an ordinary inflected form of the lemma.
const SKIP_TAGS = new Set(['table-tags', 'inflection-template', 'romanization', 'archaic', 'obsolete', 'dated', 'alternative',
    'misspelling', 'rare', 'nonstandard', 'dialectal', 'poetic', 'literary', 'error-unknown-tag', 'uncommon', 'sometimes',
    'diminutive', 'augmentative', 'pejorative', 'derogatory', 'endearing', 'relational', 'adjective']);

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const [unimorphFile, kaikkiFile] = args;
if (unimorphFile === undefined || kaikkiFile === undefined || unimorphFile.startsWith('--') || kaikkiFile.startsWith('--')) {
    console.error('usage: node languages/it/sources/build-corpus.mjs <unimorph ita file> <kaikki.org-dictionary-Italian.jsonl.gz> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]');
    process.exit(2);
}
const cli = option('--cli', resolve(here, '../../../build/hoshidicts-cli'));
const transformsFile = resolve(option('--transforms', join(here, '..', 'transforms.json')));
const outDir = resolve(option('--out', join(here, '..', 'tests')));

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}
for (const [file, expected] of [[unimorphFile, UNIMORPH_SHA256], [kaikkiFile, KAIKKI_SHA256]]) {
    const actual = sha256(file);
    if (actual !== expected) { throw new Error(`${file} has sha256 ${actual}, not ${expected}`); }
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

const pools = STRATA.map(() => []);
const seen = new Set();
function offer(source, row, category) {
    const key = `${row.form}\t${row.lemma}\t${row.pos}`;
    if (row.form === row.lemma || seen.has(key)) { return; }
    const s = STRATA.findIndex(([, , from, test]) => from === source && test(row));
    if (s < 0) { return; }
    seen.add(key);
    pools[s].push([category, '1', row.form, row.lemma, row.pos, '*']);
}

// UniMorph: one word, or a pronoun and a verb. UniMorph writes a space after
// an elided pronoun (c' entrava, ce l' ho); the sample writes it as text does
// (c'entrava, ce l'ho). Negative imperatives (non parlare) are left out.
for (const line of readFileSync(unimorphFile, 'utf8').split('\n')) {
    const [lemma, raw, tags] = line.split('\t');
    if (!lemma || !raw || !tags || !WORD.test(lemma)) { continue; }
    const form = raw.replaceAll("' ", "'");
    if (form.startsWith('non ') || !PHRASE.test(form)) { continue; }
    offer('unimorph', {lemma, form, tags, pos: 'v', plain: PLAIN.test(lemma), word: WORD.test(form)}, tags);
}

// kaikki: the forms of noun and adjective entries that are not themselves
// forms of another word, one word of Italian letters.
const lines = createInterface({input: createReadStream(kaikkiFile).pipe(createGunzip()), crlfDelay: Infinity});
for await (const line of lines) {
    const entry = JSON.parse(line);
    const pos = {noun: 'n', adj: 'adj'}[entry.pos];
    if (pos === undefined || !WORD.test(entry.word ?? '')) { continue; }
    const senses = entry.senses ?? [];
    if (senses.length > 0 && senses.every((s) => 'form_of' in s || 'alt_of' in s)) { continue; }
    for (const form of entry.forms ?? []) {
        const tags = form.tags ?? [];
        if (!WORD.test(form.form ?? '') || tags.some((t) => SKIP_TAGS.has(t))) { continue; }
        offer('kaikki', {lemma: entry.word, form: form.form, tags, pos}, `${entry.pos}:${[...tags].sort().join(',') || '-'}`);
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
// term with compatible conditions (12.2), with the pack's defaults.
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
const variants = new Map(run(['--languages', languages, 'preprocess', 'it', '--stdin'], sources)
    .map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(run(['--languages', languages, 'deinflect', 'it', '--stdin', '--transforms', transformsFile], texts)
    .map((answer) => [answer.input, answer.results]));
const passes = ([, , source, term, rule]) => {
    const allowed = new Set(leaves(rule));
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term && (r.conditions.length === 0 || r.conditions.some((c) => allowed.has(c)))));
};

const header = [
    '# options: default',
    `# Source: UniMorph ita (https://github.com/unimorph/ita/blob/${UNIMORPH_COMMIT}/ita, sha256 ${UNIMORPH_SHA256.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary: the verb rows (category: UniMorph tags; a space after an elided pronoun removed).`,
    `# Source: kaikki.org's Italian dictionary (https://kaikki.org/dictionary/Italian/, extracted 2026-10-30 from enwiktionary 2026-10-01, sha256 ${KAIKKI_SHA256.slice(0, 16)}), English Wiktionary content, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) and GFDL, by the Wiktionary contributors: the noun and adjective rows (category: part of speech and form tags).`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${STRATA.map(([name, quota]) => `${quota} ${name}`).join(', ')}); the rows the pack's rules reach with its defaults are in corpus.tsv, the others in gaps.tsv.`,
];
const columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)';
const pass = sample.filter(passes);
const fail = sample.filter((row) => !passes(row));
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'corpus.tsv'), [...header, columns, ...pass.map((r) => r.join('\t'))].join('\n') + '\n');
const gapsFile = join(outDir, 'gaps.tsv');
const handRows = existsSync(gapsFile)
    ? readFileSync(gapsFile, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#') && !/[;:]/u.test(line.split('\t')[0]))
    : [];
const gapsHeader = [header[0], '# Known gaps: run by the conformance test and counted, not enforced.',
    '# Hand-written rows (categories without ";" or ":"): written for this pack, no third-party data.', ...header.slice(1)];
writeFileSync(gapsFile, [...gapsHeader, columns, ...handRows, ...fail.map((r) => r.join('\t'))].join('\n') + '\n');
const byStratum = (rows) => Object.fromEntries(STRATA.map(([name], s) => [name, rows.filter((r) => pools[s].includes(r)).length]));
console.log(JSON.stringify({sampled: sample.length, corpus: pass.length, gaps: fail.length, recall: pass.length / sample.length,
    pools: Object.fromEntries(STRATA.map(([name], s) => [name, pools[s].length])), reached: byStratum(pass), missed: byStratum(fail)}));
