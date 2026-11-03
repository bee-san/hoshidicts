#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Rows that pin the stem constraints (docs/languages.md section 14 step 7).
// For each deletion of a constraint kind from a transform that
// sources/mutations.mjs reports as SURVIVES, finds an input whose
// deinflections the deletion changes and prints a negative row for
// tests/cases.tsv: the input must not give the text the deletion adds. Inputs
// are tried in this order: the words and two-word texts of a list (real
// text), preferring a new text that is a dictionary lemma; then inputs built
// from the transform's own affixes on short stems that break only that
// constraint (a Latin letter or digit inside the stem for stemCharacters, a
// stem one letter short for stemMinLength, a letter outside the class for
// the others). Each printed row is checked by hand before it is added. Not
// run by any test.
//
//   node languages/ka/sources/constraint-rows.mjs <hoshidicts-cli> <wty-ka-en term banks dir> <inputs file> <mutations.txt> <scratch dir>

import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const repo = resolve(new URL('../../..', import.meta.url).pathname);
const [cli, dictDir, inputsFile, mutationsFile, scratchArg] = process.argv.slice(2);
const scratch = resolve(scratchArg);
mkdirSync(scratch, {recursive: true});

const isRef = (d) => Array.isArray(d) && d.length === 2 && typeof d[0] === 'string' && d[0] && Array.isArray(d[1]);
const lemma = new Set();
for (const f of readdirSync(dictDir).filter((name) => name.startsWith('term_bank_'))) {
    for (const row of JSON.parse(readFileSync(join(dictDir, f), 'utf8'))) {
        if (row[5].some((d) => !isRef(d))) { lemma.add(row[0]); }
    }
}
const real = [...new Set(readFileSync(inputsFile, 'utf8').split('\n').map((w) => w.trim()).filter(Boolean))];
const surviving = readFileSync(mutationsFile, 'utf8').split('\n').filter((l) => l.startsWith('SURVIVES'))
    .map((l) => l.split('\t')[1]).map((label) => label.match(/^(\S+): without (\S+)$/)).filter(Boolean).map((m) => [m[1], m[2]]);

function deinflect(transformsFile, inputs) {
    const out = spawnSync(cli, ['--languages', join(repo, 'languages'), 'deinflect', 'ka', '--stdin', '--transforms', transformsFile],
        {input: inputs.join('\n') + '\n', maxBuffer: 1 << 30});
    const map = new Map();
    for (const line of out.stdout.toString().split('\n').filter(Boolean)) {
        const j = JSON.parse(line);
        map.set(j.input, new Set(j.results.map((r) => r.text)));
    }
    return map;
}

// Short stems for constructed inputs, Georgian letters with a few others.
const STEMS = ['ბ', 'ა', 'ი', 'ე', 'ო', 'ბა', 'აბ', 'ბი', 'ბე', 'ბო', 'ბუ', 'ბს', 'ბლ', 'ბნ', 'ბრ', 'ბვ', 'ბმ', 'ბაბ', 'ბიბ', 'აბა', 'ბაბა',
    'ბაბაბ', 'ბაბაბა', 'ტყაბ', 'Qბ', 'Qბა', 'Qბაბ', '1ბ', '1ბა', 'ბ ბ', 'ბა ბა', 'ბ.ბ'];
function constructed(t, key) {
    const inputs = [];
    for (const rule of t.rules) {
        if (!(key in rule)) { continue; }
        if (rule.type === 'suffix') { for (const s of STEMS) { inputs.push(s + rule.inflected); } }
        if (rule.type === 'prefix') { for (const s of STEMS) { inputs.push(rule.inflected + s); } }
        if (rule.type === 'circumfix') {
            for (const [p] of rule.prefixes.slice(0, 4)) { for (const [x] of rule.suffixes.slice(0, 3)) { for (const s of STEMS) { inputs.push(p + s + x); } } }
        }
        if (inputs.length > 4000) { break; }
    }
    return [...new Set(inputs)];
}

const finalFile = join(repo, 'languages/ka/transforms.json');
const base = JSON.parse(readFileSync(finalFile, 'utf8'));
for (const [id, key] of surviving) {
    const ti = base.transforms.findIndex((t) => t.id === id);
    if (ti < 0) { console.log(`#\t${id}:${key}\tno such transform`); continue; }
    const copy = structuredClone(base);
    for (const rule of copy.transforms[ti].rules) { delete rule[key]; }
    const file = join(scratch, 'mutant.json');
    writeFileSync(file, JSON.stringify(copy));
    let row = null;
    for (const [kind, inputs] of [['real', real], ['constructed', constructed(base.transforms[ti], key)]]) {
        const before = deinflect(finalFile, inputs);
        const after = deinflect(file, inputs);
        const found = [];
        for (const input of inputs) {
            for (const text of after.get(input) ?? []) {
                if (!before.get(input)?.has(text)) { found.push([input, text, lemma.has(text)]); }
            }
        }
        if (found.length) {
            found.sort((a, b) => Number(b[2]) - Number(a[2]) || a[0].length - b[0].length);
            row = [kind, ...found[0]];
            break;
        }
    }
    if (row) {
        console.log(`constraint\t0\t${row[1]}\t${row[2]}\t*\t*\t# ${id}:${key} (${row[0]}${row[3] ? ', a dictionary lemma' : ''})`);
    } else {
        console.log(`#\t${id}:${key}\tno input found`);
    }
}
