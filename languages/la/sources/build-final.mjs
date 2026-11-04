#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/la/transforms.json (the final set: sources/own.json with
// the own rules that make a Yomitan rule's deinflection marked both),
// sources/yomitan-provenance.tsv and the reasons of tests/yomitan.tsv.
// Run from the repository root after sources/build-own.mjs:
//
//   node languages/la/sources/build-final.mjs
//
// README.md, Rule provenance, says why all eight Yomitan rules are left out.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));

// Yomitan's rule (transform, inflected, deinflected) → the own rule that makes
// its deinflection (transform id, inflected, deinflected, conditionsOut), or
// null when none does.
const PAIRS = [
    [['plural', 'i', 'us', ['n2s']], ['n-gen-sg+n-nom-pl', 'i', 'us', ['n2s']]],
    [['plural', 'i', 'us', ['adj12']], ['adj-i', 'i', 'us', ['adj12', 'ptc', 'v']]],
    [['plural', 'e', '', ['n1s']], ['n-gen-sg+n-dat-sg+n-nom-pl', 'ae', 'a', ['n1s']]],
    [['plural', 'ae', 'a', ['adj12']], null],
    [['plural', 'a', 'um', ['adj12']], null],
    [['feminine', 'a', 'us', ['adj12']], ['adj-a', 'a', 'us', ['adj12', 'ptc', 'v']]],
    [['neuter', 'um', 'us', ['adj12']], ['adj-um', 'um', 'us', ['adj12', 'ptc', 'v']]],
    [['ablative', 'o', 'um', ['n2s']], ['n-dat-sg+n-abl-sg', 'o', 'um', ['n2s']]],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const out = JSON.parse(JSON.stringify(own));
const lines = ['# Yomitan rule (transform, inflected → deinflected, conditionsOut)\town rule that makes the same deinflection (transform id), or - when none does'];
let both = 0;
for (const [[transform, inflected, deinflected, conditionsOut], mine] of PAIRS) {
    const theirs = yomitan.transforms.find((t) => t.id === transform)?.rules
        .find((r) => r.inflected === inflected && r.deinflected === deinflected && same(r.conditionsOut, conditionsOut));
    if (theirs === undefined) { throw new Error(`Yomitan has no rule ${transform} ${inflected} → ${deinflected}`); }
    let target = '-';
    if (mine !== null) {
        const [id, i, d, out2] = mine;
        const t = out.transforms.find((x) => x.id === id);
        const rule = t?.rules.find((r) => r.type === 'suffix' && r.inflected === i && r.deinflected === d && same(r.conditionsOut, out2));
        if (rule === undefined) { throw new Error(`no own rule ${id} ${i} → ${d}`); }
        if (rule.source !== 'both') { rule.source = 'both'; ++both; }
        target = id;
    }
    lines.push(`${transform}: ${inflected} → ${deinflected || '""'} ${JSON.stringify(conditionsOut)}\t${target}`);
}
writeFileSync(join(here, '..', 'transforms.json'), formatTransforms(out));
// tests/yomitan.tsv names Yomitan's transforms in its reasons; the final set
// reaches every lemma through its own, so the reasons become * (any trace).
// tools/port-yomitan-tests.mjs writes the file with Yomitan's reasons.
const testFile = join(here, '..', 'tests', 'yomitan.tsv');
const test = readFileSync(testFile, 'utf8').split('\n').map((line) => {
    if (line === '' || line.startsWith('#')) { return line; }
    const cells = line.split('\t');
    cells[5] = '*';
    return cells.join('\t');
});
writeFileSync(testFile, test.join('\n'));
writeFileSync(join(here, 'yomitan-provenance.tsv'), lines.join('\n') + '\n');
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`la: ${out.transforms.length} transforms, ${rules} rules (${rules - both} own, ${both} both, 0 yomitan) in transforms.json`);
