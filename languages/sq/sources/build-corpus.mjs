#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/sq/tests/corpus.tsv and tests/gaps.tsv from UniMorph sqi
// (docs/languages.md, section 14 step 4):
//
//   node languages/sq/sources/build-corpus.mjs <unimorph sqi file> [--cli build/hoshidicts-cli]
//
// The file is https://github.com/unimorph/sqi at 63fed8f (file `sqi`, sha256
// f0e00a1c…db84), CC BY-SA 3.0, by the UniMorph contributors. The sample, with
// a fixed seed: 450 single-word verb forms, 150 verb forms of two or more
// words (the analytic tenses), 400 noun forms; one row per form, lemma and part
// of speech, forms that differ from their lemma. Rows the pack's
// transforms.json reaches (the lemma among the deinflections of the form, with
// a compatible condition) go to corpus.tsv, the others to gaps.tsv.

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pack = resolve(here, '..');
const args = process.argv.slice(2);
const file = args[0];
const cliIndex = args.indexOf('--cli');
const cli = cliIndex >= 0 ? args[cliIndex + 1] : resolve(pack, '..', '..', 'build', 'hoshidicts-cli');
if (file === undefined) {
    console.error('usage: node languages/sq/sources/build-corpus.mjs <unimorph sqi file> [--cli <hoshidicts-cli>]');
    process.exit(2);
}
const text = readFileSync(file, 'utf8');
const sha = createHash('sha256').update(text).digest('hex');
if (sha !== 'f0e00a1cfb2b07a1b057987edcd8eeb3ba4c57ad8e6bbb978f091292b0cfdb84') {
    throw new Error(`${file} has sha256 ${sha}, not UniMorph sqi at 63fed8f`);
}

// mulberry32, seed 1
let seed = 1;
function random() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function sample(rows, n) {
    const copy = [...rows];
    for (let i = copy.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
}

const seen = new Set();
const groups = {verb: [], verbPhrase: [], noun: []};
for (const line of text.split('\n')) {
    if (line.trim() === '') { continue; }
    const [lemma, form, tags] = line.split('\t');
    const pos = tags.split(';')[0];
    if (form === lemma || form.includes('—')) { continue; }
    const rule = pos === 'V' ? 'v' : pos === 'N' ? 'n' : null;
    if (rule === null || lemma.includes(' ')) { continue; }
    const key = `${form}\t${lemma}\t${rule}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    const row = {category: tags, form, lemma, rule};
    if (rule === 'n') {
        groups.noun.push(row);
    } else if (form.includes(' ')) {
        groups.verbPhrase.push(row);
    } else {
        groups.verb.push(row);
    }
}
const picked = [...sample(groups.verb, 450), ...sample(groups.verbPhrase, 150), ...sample(groups.noun, 400)];

// Which rows the pack reaches, as the conformance test decides it.
const forms = [...new Set(picked.map((r) => r.form))];
const out = execFileSync(cli, ['--languages', resolve(pack, '..'), 'deinflect', 'sq', '--stdin', '--all-options'], {input: forms.join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 28});
const results = new Map(out.split('\n').filter(Boolean).map((l) => { const d = JSON.parse(l); return [d.input, d.results]; }));
const family = {v: new Set(['v']), n: new Set(['n', 'np', 'ns'])};
function reached(row) {
    return (results.get(row.form) ?? []).some((r) => r.text === row.lemma && (r.conditions.length === 0 || r.conditions.some((c) => family[row.rule].has(c))));
}
const header = [
    '# Source: UniMorph sqi (https://github.com/unimorph/sqi) at 63fed8fdd510d14a75d2d2dacb1c5ab1475617e7, file sqi, CC BY-SA 3.0, by the UniMorph contributors (data from English Wiktionary).',
    '# 1,000 rows sampled with seed 1 by sources/build-corpus.mjs: 450 single-word verb forms, 150 analytic verb forms, 400 noun forms; corpus.tsv has the rows the rules reach, gaps.tsv the others.',
    '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)',
];
const line = (r) => `${r.category}\t1\t${r.form}\t${r.lemma}\t${r.rule}\t*`;
const corpus = picked.filter(reached);
const gaps = picked.filter((r) => !reached(r));
writeFileSync(join(pack, 'tests', 'corpus.tsv'), [...header, ...corpus.map(line)].join('\n') + '\n');
writeFileSync(join(pack, 'tests', 'gaps.tsv'), [...header, ...gaps.map(line)].join('\n') + '\n');
console.log(`sq: ${picked.length} rows (${groups.verb.length} single-word verb, ${groups.verbPhrase.length} analytic verb, ${groups.noun.length} noun forms available); corpus.tsv ${corpus.length}, gaps.tsv ${gaps.length}`);
