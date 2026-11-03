#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// For the constraint check of docs/languages.md section 14 step 7: for each
// stem constraint of each transform, the words of a list for which the rules
// without that constraint give a dictionary lemma the pack's rules do not
// give and that is not the word's own lemma (a term its form-of rows name, or
// itself). Those words are candidates for the negative rows of
// tests/cases.tsv that make the deletion fail; each one is checked by hand
// before it is added. Not run by any test.
//
//   node languages/ka/sources/mutation-rows.mjs <hoshidicts-cli> <wty-ka-en term banks dir> <words file> <scratch dir> [transform:key ...]

import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';

const repo = resolve(new URL('../../..', import.meta.url).pathname);
const [cli, dictDir, wordsFile, scratchArg, ...only] = process.argv.slice(2);
const scratch = resolve(scratchArg);
mkdirSync(scratch, {recursive: true});
const KEYS = ['stemMinLength', 'stemCharacters', 'stemEndsWith', 'stemNotEndsWith', 'stemStartsWith', 'stemNotStartsWith', 'stemChange'];

const isRef = (d) => Array.isArray(d) && d.length === 2 && typeof d[0] === 'string' && d[0] && Array.isArray(d[1]);
const lemma = new Set();
const targets = new Map();
for (const f of readdirSync(dictDir).filter((name) => name.startsWith('term_bank_'))) {
    for (const row of JSON.parse(readFileSync(join(dictDir, f), 'utf8'))) {
        const refs = row[5].filter(isRef);
        if (refs.length < row[5].length || refs.length === 0) { lemma.add(row[0]); }
        for (const [t] of refs) { (targets.get(row[0]) ?? targets.set(row[0], new Set()).get(row[0])).add(t); }
    }
}
const words = [...new Set(readFileSync(wordsFile, 'utf8').split('\n').map((w) => w.trim()).filter(Boolean))];

function deinflect(transformsFile) {
    const out = spawnSync(cli, ['--languages', join(repo, 'languages'), 'deinflect', 'ka', '--stdin', '--transforms', transformsFile],
        {input: words.join('\n') + '\n', maxBuffer: 1 << 30});
    const map = new Map();
    for (const line of out.stdout.toString().split('\n').filter(Boolean)) {
        const j = JSON.parse(line);
        map.set(j.input, new Set(j.results.map((r) => r.text)));
    }
    return map;
}

const baseFile = join(repo, 'languages/ka/transforms.json');
const base = JSON.parse(readFileSync(baseFile, 'utf8'));
const before = deinflect(baseFile);
for (const [ti, t] of base.transforms.entries()) {
    for (const key of KEYS) {
        if (!t.rules.some((rule) => key in rule)) { continue; }
        if (only.length && !only.includes(`${t.id}:${key}`)) { continue; }
        const copy = structuredClone(base);
        for (const rule of copy.transforms[ti].rules) { delete rule[key]; }
        const file = join(scratch, 'mutant.json');
        writeFileSync(file, JSON.stringify(copy));
        const after = deinflect(file);
        const harm = [];
        for (const w of words) {
            const own = new Set([...(targets.get(w) ?? []), w]);
            for (const x of after.get(w) ?? []) {
                if (!before.get(w)?.has(x) && lemma.has(x) && !own.has(x)) { harm.push(`${w}→${x}`); }
            }
        }
        console.log(`${t.id}:${key}\t${harm.length}\t${harm.slice(0, 12).join(' ')}`);
    }
}
