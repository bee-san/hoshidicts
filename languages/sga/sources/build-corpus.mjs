#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the sampled rows of tests/gaps.tsv from
// Wiktionary's Old Irish inflection and mutation tables (kaikki.org's
// extract) and from UniMorph sga, and splits the sample with hoshidicts-cli:
// rows the pack's rules reach go to corpus.tsv, the others to gaps.tsv
// (docs/languages.md 12.2). Hand-written rows already in gaps.tsv (categories
// that do not start with "kaikki " or "unimorph ") are kept.
//
//   node languages/sga/sources/build-corpus.mjs <kaikki-sga.jsonl> <unimorph sga file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>] [--sample <file>]
//
// - kaikki: https://kaikki.org/dictionary/Old%20Irish/kaikki.org-dictionary-OldIrish.jsonl,
//   extracted 2026-10-30 from the English Wiktionary dump of 2026-10-01
//   (sha256 below), CC BY-SA 4.0 and GFDL, by the Wiktionary contributors;
//   extraction by wiktextract (Tatu Ylonen, kaikki.org).
// - UniMorph: https://github.com/unimorph/sga/blob/de9858d9966879b78d44fcded5287858146a6e16/sga
//   (sha256 below), CC BY-SA 3.0, by the UniMorph contributors.
//
// The rules were written and tuned on the forms of half of the lemmas (the
// lemmas whose MD5 is even); the sample takes only the other half, so the
// recall it gives is measured on lemmas the rules never saw. --sample writes
// the whole sample, before the split, for measuring other rule sets.

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const KAIKKI_SHA256 = '36236d1c6bf278e4d5f8093e190549fef2723e285272d733501c09403825a2e5';
const UNIMORPH_SHA256 = '2234deeed0f585fe41d11295aa637e90c425ccaf27f89931a554265bc13d67e6';
const UNIMORPH_COMMIT = 'de9858d9966879b78d44fcded5287858146a6e16';
const SEED = 1;
const POS = {noun: 'n', verb: 'v', adj: 'adj', N: 'n', V: 'v', ADJ: 'adj'};
// Strata: kind of form and source; within each, rows are drawn uniformly.
const STRATA = [
    ['kaikki noun', 450],
    ['kaikki adjective', 200],
    ['kaikki verb', 450],
    ['kaikki mutation', 250],
    ['unimorph verb', 150],
];
// One word of Old Irish letters, with the middle dot of a verbal complex and
// the hyphen of a nasalised vowel; no notes, brackets or abbreviations.
const WORD = /^[a-záéíóúæǽḟṡḃċḋġṁṗṫṅäëïöü·-]+$/u;
const SKIP_TAGS = new Set(['table-tags', 'inflection-template', 'canonical', 'class', 'romanization', 'alternative', 'misspelling', 'abbreviation']);

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const [kaikkiFile, unimorphFile] = args;
if (kaikkiFile === undefined || unimorphFile === undefined || kaikkiFile.startsWith('--') || unimorphFile.startsWith('--')) {
    console.error('usage: node languages/sga/sources/build-corpus.mjs <kaikki-sga.jsonl> <unimorph sga file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>] [--sample <file>]');
    process.exit(2);
}
const cli = option('--cli', resolve(here, '../../../build/hoshidicts-cli'));
const transformsFile = resolve(option('--transforms', join(here, '..', 'transforms.json')));
const outDir = resolve(option('--out', join(here, '..', 'tests')));
const sampleFile = option('--sample', null);
const read = (file, expected) => {
    const data = readFileSync(file);
    const sha = createHash('sha256').update(data).digest('hex');
    if (sha !== expected) { throw new Error(`${file} has sha256 ${sha}, not ${expected}`); }
    return data.toString('utf8');
};
const nfc = (s) => s.normalize('NFC');
const heldOut = (lemma) => BigInt(`0x${createHash('md5').update(lemma, 'utf8').digest('hex')}`) % 2n === 1n;

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

const pools = new Map(STRATA.map(([name]) => [name, []]));
const seen = new Set();
const push = (stratum, category, form, lemma, pos) => {
    if (form === lemma || !WORD.test(form) || form.startsWith('-') || form.endsWith('-') || form.endsWith('·')) { return; }
    const key = `${form}\t${lemma}\t${pos}`;
    if (seen.has(key)) { return; }
    seen.add(key);
    pools.get(stratum).push([category, '1', form, lemma, pos, '*']);
};

// Wiktionary's tables, as kaikki.org extracted them.
for (const line of read(kaikkiFile, KAIKKI_SHA256).split('\n')) {
    if (line === '') { continue; }
    const entry = JSON.parse(line);
    const pos = POS[entry.pos];
    if (pos === undefined) { continue; }
    const lemma = nfc(entry.word);
    if (!heldOut(lemma) || !/^[a-záéíóúæǽ]/u.test(lemma)) { continue; }
    for (const f of entry.forms ?? []) {
        const tags = (f.tags ?? []).filter((t) => t !== 'error-unrecognized-form');
        if (tags.length === 0 || tags.some((t) => SKIP_TAGS.has(t))) { continue; }
        const form = nfc(f.form);
        const mutation = tags.includes('mutation') || tags.includes('lenition');
        const stratum = mutation ? 'kaikki mutation' : {n: 'kaikki noun', adj: 'kaikki adjective', v: 'kaikki verb'}[pos];
        push(stratum, `kaikki ${pos} ${[...tags].sort().join(' ')}`, form, lemma, pos);
    }
}
// UniMorph sga: verbs only.
for (const line of read(unimorphFile, UNIMORPH_SHA256).split('\n')) {
    const [lemmaRaw, formRaw, feats] = line.split('\t');
    if (!lemmaRaw || !formRaw || !feats) { continue; }
    const lemma = nfc(lemmaRaw);
    const tags = feats.split(';');
    if (POS[tags[0]] !== 'v' || !heldOut(lemma)) { continue; }
    push('unimorph verb', `unimorph ${feats}`, nfc(formRaw), lemma, 'v');
}

const random = mulberry32(SEED);
const sample = [];
for (const [name, quota] of STRATA) {
    const pool = pools.get(name);
    for (let i = pool.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    sample.push(...pool.slice(0, quota).map((row) => [name, row]));
}

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
    if (condition === undefined) { return [name]; }
    return condition.subConditions === undefined ? [name] : condition.subConditions.flatMap(leaves);
};
const sources = [...new Set(sample.map(([, row]) => row[2]))];
const variants = new Map(run(['--languages', languages, 'preprocess', 'sga', '--stdin', '--all-options'], sources)
    .map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(run(['--languages', languages, 'deinflect', 'sga', '--stdin', '--all-options', '--transforms', transformsFile], texts)
    .map((answer) => [answer.input, answer.results]));
const passes = ([, , source, term, rule]) => {
    const allowed = new Set(leaves(rule));
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term && (r.conditions.length === 0 || r.conditions.some((c) => allowed.has(c)))));
};

const header = [
    `# Source: Wiktionary's Old Irish inflection and mutation tables as extracted by kaikki.org (https://kaikki.org/dictionary/Old%20Irish/, extracted 2026-10-30 from the English Wiktionary dump of 2026-10-01, sha256 ${KAIKKI_SHA256.slice(0, 16)}), CC BY-SA 4.0 and GFDL, by the Wiktionary contributors; and UniMorph sga (https://github.com/unimorph/sga/blob/${UNIMORPH_COMMIT}/sga, sha256 ${UNIMORPH_SHA256.slice(0, 16)}), CC BY-SA 3.0, by the UniMorph contributors.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs from the lemmas the rules were not written on (odd MD5) (${STRATA.map(([name, quota]) => `${quota} ${name}`).join(', ')}); the rows the pack's rules reach are in corpus.tsv, the others in gaps.tsv.`,
];
const columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)';
const rows = sample.map(([, row]) => row);
if (sampleFile !== null) {
    writeFileSync(resolve(sampleFile), [...header, columns, ...rows.map((r) => r.join('\t'))].join('\n') + '\n');
}
const pass = rows.filter(passes);
const fail = rows.filter((row) => !passes(row));
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'corpus.tsv'), [...header, columns, ...pass.map((r) => r.join('\t'))].join('\n') + '\n');
const gapsFile = join(outDir, 'gaps.tsv');
const sampled = (category) => category.startsWith('kaikki ') || category.startsWith('unimorph ');
const handRows = existsSync(gapsFile)
    ? readFileSync(gapsFile, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#') && !sampled(line.split('\t')[0]))
    : [];
const gapsHeader = ['# Known gaps: run by the conformance test and counted, not enforced.', '# Hand-written rows (categories that do not start with "kaikki " or "unimorph "): written for this pack, no third-party data.', ...header];
writeFileSync(gapsFile, [...gapsHeader, columns, ...handRows, ...fail.map((r) => r.join('\t'))].join('\n') + '\n');
const byStratum = (list) => Object.fromEntries(STRATA.map(([name]) => [name, sample.filter(([s, row]) => s === name && list.includes(row)).length]));
console.log(JSON.stringify({sampled: rows.length, corpus: pass.length, gaps: fail.length, recall: pass.length / rows.length, reached: byStratum(pass), missed: byStratum(fail)}));
