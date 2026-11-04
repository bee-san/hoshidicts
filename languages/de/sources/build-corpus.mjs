#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Samples tests/corpus.tsv and the UniMorph rows of tests/gaps.tsv from
// UniMorph deu, and splits the sample with hoshidicts-cli: rows the pack's
// rules reach go to corpus.tsv, the others to gaps.tsv (docs/languages.md
// 12.2). Hand-written rows already in gaps.tsv (categories without ';') are
// kept.
//
//   node languages/de/sources/build-corpus.mjs <unimorph deu file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]
//
// The file is https://github.com/unimorph/deu/blob/d226d2112d3490d8f04ece10d4538123d4297a39/deu
// (sha256 8bc98487e3caf86188e2c072ebf2dc734f2ca35afef016bb399eb5a43e69d7c0),
// CC BY-SA 3.0, by the UniMorph contributors (from English Wiktionary).
//
// Eligible rows: a form that differs from its lemma, both of German letters
// only (no table noise such as {{{1}}}es or Dreikäsehoch(s)), one row per
// form, lemma and part of speech. Three kinds of rows are changed or left
// out:
// - UniMorph writes a separated particle after its verb (rufe an). Such a
//   row's source gets a full stop (rufe an.), which is how a lookup from the
//   verb receives it at the end of a main clause.
// - UniMorph writes the superlative with am (am schönsten). The row's source
//   is the adjective (schönsten).
// - Rows of a verb with a separable particle whose form lacks the particle
//   (zurückwollen: will, mitleiden: leide, gelitten) are left out: they are
//   forms of the verb without the particle. So are separated forms whose
//   particle is not the lemma's (herunterstoßen: stoße an).
// The comparative of a predicative adjective (schöner) is also a declined
// form of the positive; such a row is counted as a comparative.

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHA256 = '8bc98487e3caf86188e2c072ebf2dc734f2ca35afef016bb399eb5a43e69d7c0';
const COMMIT = 'd226d2112d3490d8f04ece10d4538123d4297a39';
const SEED = 1;
// Strata by kind of form, in order of precedence for a row that fits two;
// within each, rows are drawn uniformly.
const STRATA = [
    ['adjective, superlative', 50, (t) => t[0] === 'ADJ' && t.includes('SPRL')],
    ['adjective, comparative', 70, (t) => t[0] === 'ADJ' && t.includes('CMPR')],
    ['adjective, declined', 180, (t) => t[0] === 'ADJ'],
    ['noun, dative plural', 100, (t) => t[0] === 'N' && t.includes('DAT') && t.includes('PL')],
    ['noun, plural', 220, (t) => t[0] === 'N' && t.includes('PL')],
    ['noun, genitive', 120, (t) => t[0] === 'N' && t.includes('GEN')],
    ['noun, other singular', 30, (t) => t[0] === 'N'],
    ['verb, separated', 150, (t, form) => t[0] === 'V' && form.includes(' ')],
    ['verb, participle', 160, (t) => t[0] === 'V.PTCP'],
    ['verb, zu-infinitive', 60, (t) => t[0] === 'V' && t.includes('NFIN') && t.includes('LGSPEC01')],
    ['verb, imperative', 80, (t) => t[0] === 'V' && t.includes('IMP')],
    ['verb, subjunctive', 160, (t) => t[0] === 'V' && t.includes('SBJV')],
    ['verb, past', 200, (t) => t[0] === 'V' && t.includes('IND') && t.includes('PST')],
    ['verb, present', 220, (t) => t[0] === 'V' && t.includes('IND') && t.includes('PRS')],
];
const POS = {N: 'n', V: 'v', 'V.PTCP': 'v', ADJ: 'adj'};
const WORD = /^[A-Za-zÄÖÜäöüß]+$/u;
const SEPARATED = /^([a-zäöüß]+) ([a-zäöüß]+)$/u;
// The separable particles of sources/own.json (the zu-infinitive rule's
// prefixes), longest first.
const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
const PARTICLES = own.transforms.find((t) => t.id === 'zu-infinitive').rules[0].prefixes.map(([, p]) => p)
    .sort((a, b) => b.length - a.length);

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const file = args[0];
if (file === undefined || file.startsWith('--')) {
    console.error('usage: node languages/de/sources/build-corpus.mjs <unimorph deu file> [--cli <hoshidicts-cli>] [--transforms <file>] [--out <dir>]');
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

/** The row's source text, or null when the row is left out. */
function sourceOf(lemma, form, tags) {
    if (tags[0] === 'ADJ' && tags.includes('SPRL')) {
        const match = /^am ([a-zäöüß]+)$/u.exec(form);
        return match === null ? null : match[1];
    }
    const separated = SEPARATED.exec(form);
    if (separated !== null) {
        if (tags[0] !== 'V' || !lemma.startsWith(separated[2])) { return null; }
        return `${form}.`;
    }
    if (!WORD.test(form)) { return null; }
    if (tags[0] === 'V' || tags[0] === 'V.PTCP') {
        const particle = PARTICLES.find((p) => lemma.startsWith(p) && lemma.length - p.length >= 3);
        if (particle !== undefined && !form.includes(particle)) { return null; }
    }
    return form;
}

const candidates = new Map();  // key -> [stratum, row]
for (const line of data.toString('utf8').split('\n')) {
    const [lemma, form, feats] = line.split('\t');
    if (!lemma || !form || !feats || form === lemma || !WORD.test(lemma)) { continue; }
    const tags = feats.split(';');
    if (POS[tags[0]] === undefined) { continue; }
    const s = STRATA.findIndex(([, , test]) => test(tags, form));
    if (s < 0) { continue; }
    const source = sourceOf(lemma, form, tags);
    if (source === null || source === lemma) { continue; }
    const key = `${source}\t${lemma}\t${POS[tags[0]]}`;
    const known = candidates.get(key);
    if (known === undefined || s < known[0]) { candidates.set(key, [s, [feats, '1', source, lemma, POS[tags[0]], '*']]); }
}
const pools = STRATA.map(() => []);
for (const [s, row] of candidates.values()) { pools[s].push(row); }
const random = mulberry32(SEED);
const sample = [];
STRATA.forEach(([, quota], s) => {
    const pool = pools[s];
    for (let i = pool.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    sample.push(...pool.slice(0, quota).map((row) => ({stratum: s, row})));
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
const sources = [...new Set(sample.map(({row}) => row[2]))];
const variants = new Map(run(['--languages', languages, 'preprocess', 'de', '--stdin', '--all-options'], sources)
    .map((answer) => [answer.input, answer.variants.map((v) => v.text)]));
const texts = [...new Set([...variants.values()].flat())];
const deinflections = new Map(run(['--languages', languages, 'deinflect', 'de', '--stdin', '--all-options', '--transforms', transformsFile], texts)
    .map((answer) => [answer.input, answer.results]));
const passes = ({row: [, , source, term, rule]}) => {
    const allowed = new Set(leaves(rule));
    return variants.get(source).some((text) => deinflections.get(text).some((r) => r.text === term && (r.conditions.length === 0 || r.conditions.some((c) => allowed.has(c) || leaves(c).some((l) => allowed.has(l))))));
};

const header = [
    `# Source: UniMorph deu (https://github.com/unimorph/deu/blob/${COMMIT}/deu, sha256 ${SHA256.slice(0, 16)}), CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), by the UniMorph contributors, from English Wiktionary.`,
    `# ${sample.length} rows sampled with seed ${SEED} by sources/build-corpus.mjs (${STRATA.map(([name, quota]) => `${quota} ${name}`).join(', ')}); a separated particle's row ends with a full stop (rufe an.), a superlative's row is the adjective without am (schönsten). The rows the pack's rules reach are in corpus.tsv, the others in gaps.tsv.`,
];
const columns = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)';
const pass = sample.filter(passes);
const fail = sample.filter((r) => !passes(r));
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'corpus.tsv'), [...header, columns, ...pass.map(({row}) => row.join('\t'))].join('\n') + '\n');
const gapsFile = join(outDir, 'gaps.tsv');
const handRows = existsSync(gapsFile)
    ? readFileSync(gapsFile, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#') && !line.split('\t')[0].includes(';'))
    : [];
const gapsHeader = [
    '# Known gaps: run by the conformance test and counted, not enforced.',
    '# Rows whose category has no ";" are not UniMorph\'s: the row yomitan-separated prefix is the row of tests/yomitan.tsv (Yomitan\'s test, GPL-3.0-or-later,',
    '# Copyright (C) 2023-2026 Yomitan Authors, 2020-2022 Yomichan Authors) that only Yomitan\'s separated-prefix rule passes: it writes the verb and its particle',
    '# as two words, which only a dictionary\'s multi-word rows read; this pack\'s rule needs the end of the clause and joins them (räum den Tisch auf. -> aufräumen,',
    '# tests/cases.tsv). sources/build-final.mjs moves it here.',
    ...header,
];
writeFileSync(gapsFile, [...gapsHeader, columns, ...handRows, ...fail.map(({row}) => row.join('\t'))].join('\n') + '\n');
const byStratum = (rows) => Object.fromEntries(STRATA.map(([name], s) => [name, rows.filter((r) => r.stratum === s).length]));
console.log(JSON.stringify({sampled: sample.length, corpus: pass.length, gaps: fail.length, recall: pass.length / sample.length, reached: byStratum(pass), missed: byStratum(fail)}));
