#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/tl/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5), and sets the reasons of tests/yomitan.tsv:
//
//   node languages/tl/sources/build-final.mjs
//
// 1. The union of sources/own.json and sources/yomitan.json, as
//    tools/merge-transforms.mjs makes it.
// 2. A Yomitan rule that makes the deinflection an own rule makes (the same
//    rule type and affixes, whatever its conditions and stem constraints) is
//    left out, and the own rule is marked `both`.
// 3. The Yomitan transforms in REMOVED are left out, each for the harm
//    README.md (Rule provenance) measures.
// 4. The own transforms come first, in sources/own.json's order, then the
//    Yomitan transforms that remain, so that where both reach a term with
//    the same number of steps, the own trace is the one a lookup keeps.
// 5. A row of tests/yomitan.tsv whose reasons name a transform the final set
//    does not have gets the reasons `*` (the final rules reach its term
//    through their own transforms); sources/yomitan.json passes the file with
//    Yomitan's reasons, which README.md reports.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';

const pack = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(join(pack, name), 'utf8'));
const own = read('sources/own.json');
const yomitan = read('sources/yomitan.json');

// Yomitan transforms left out of the final set, with the harm each does in
// the union (README.md, Rule provenance, has the numbers and the commands).
export const REMOVED = {
    '-an': 'on Tatoeba, wrong first results only (Talagang -> Talag, Abenang -> Abe, matandaan -> matanda); the own -an reaches its right readings',
    '-in': 'on Tatoeba, wrong first results only (ring -> d, Alin -> Al, Kunin -> Ko, Basahin -> Basa)',
    '-ng': 'breaks 4 negatives (ang -> a, lang -> la, nang -> na, sang -> sa); malalaking -> lalaki first',
    'ma-': 'breaks the negative mama -> ma; on Tatoeba, wrong first results only (mag -> g, Max -> x, mapo -> po)',
    'i-': 'breaks the negatives ina -> na and isa -> sa; on Tatoeba, wrong first results only (Io -> o, ice -> ce, ID -> d)',
    'ka-': 'breaks the negatives kasi -> si, kaya -> ya and kanya -> nya; the own ka- (a root of four letters) keeps its right readings',
    'pa-': 'breaks the negatives paano -> ano, papa -> pa and pala -> la; paano ba -> ano ba, pay -> y first; the own pa- keeps its right readings',
    'pala-': 'palala -> la and palaga -> ga first; the own pala- keeps palatanong -> tanong',
    'mag-...-an': 'maghapunan -> hapo and magtanghalian -> tanghali first, against 5 right first results',
    'pag-': 'pagbibigay -> bibigay, pagbabayaran -> babayaran and paglalagyan -> lalagyan first, where the own rules give the root',
    'pag-...-in': 'pagbaunin -> bao and pagyamanin -> yama first',
    'ma-...-an': 'Marian -> di and malalakaran -> lumakad first',
    'ma-...-in': 'magasin -> gas, mafin -> f, Makasin -> kas first (33 positions) against 6 right; the own ma- -in needs a root of four letters',
    'magpa-': 'nagpasya -> sya and magpasa -> sa first (no minimum root)',
    'pagka-': 'pagkakaroon -> doon first; the own rules give magkaroon, and pagkarating -> dating',
};

const union = mergeTransforms(own, yomitan).transforms;

// Rule identity for step 2: type and affixes.
const keysOf = (rule) => {
    switch (rule.type) {
        case 'prefix':
        case 'suffix':
        case 'wholeWord':
        case 'replace':
            return [`${rule.type}\u0000${rule.inflected}\u0000${rule.deinflected}`];
        case 'circumfix': {
            const prefixes = rule.prefixes ?? [[rule.inflectedPrefix, rule.deinflectedPrefix]];
            const suffixes = rule.suffixes ?? [[rule.inflectedSuffix, rule.deinflectedSuffix]];
            const change = rule.stemChange ? JSON.stringify(rule.stemChange.from) + rule.stemChange.to : '';
            return prefixes.flatMap(([ip, dp]) => suffixes.map(([is, ds]) => `circumfix\u0000${ip}\u0000${dp}\u0000${is}\u0000${ds}\u0000${change}`));
        }
        default:
            return [];
    }
};
const ownKeys = new Map();
for (const transform of union.transforms) {
    if (transform.source === 'yomitan') { continue; }
    transform.rules.forEach((rule) => {
        for (const key of keysOf(rule)) {
            if (!ownKeys.has(key)) { ownKeys.set(key, rule); }
        }
    });
}

const ownTransforms = [];
const yomitanTransforms = [];
let both = 0;
let duplicates = 0;
let removedRules = 0;
for (const transform of union.transforms) {
    if (transform.source !== 'yomitan') {
        ownTransforms.push(transform);
        continue;
    }
    if (transform.id in REMOVED) {
        removedRules += transform.rules.length;
        continue;
    }
    const rules = [];
    for (const rule of transform.rules) {
        const keys = keysOf(rule);
        const matches = keys.length > 0 && keys.every((key) => ownKeys.has(key));
        if (!matches) {
            rules.push(rule);
            continue;
        }
        ++duplicates;
        for (const key of keys) {
            const mine = ownKeys.get(key);
            if (mine.source !== 'both') {
                mine.source = 'both';
                ++both;
            }
        }
    }
    if (rules.length > 0) { yomitanTransforms.push({...transform, rules}); }
}

// A transform whose rules are all `both` says so itself.
for (const transform of ownTransforms) {
    const sources = new Set(transform.rules.map((r) => r.source ?? transform.source));
    if (sources.size === 1 && sources.has('both')) {
        transform.source = 'both';
        for (const rule of transform.rules) { delete rule.source; }
    }
}

const final = {schema: 1, conditions: union.conditions, wordLists: union.wordLists ?? {}, transforms: [...ownTransforms, ...yomitanTransforms]};
writeFileSync(join(pack, 'transforms.json'), formatTransforms(final));

const count = (pred) => final.transforms.reduce((n, t) => n + t.rules.filter((r) => pred(r.source ?? t.source)).length, 0);
console.log(`transforms.json: ${final.transforms.length} transforms, ${count(() => true)} rules ` +
    `(${count((s) => s === 'own')} own, ${count((s) => s === 'yomitan')} yomitan, ${count((s) => s === 'both')} both); ` +
    `${duplicates} Yomitan rules are own rules too (${both} own rules marked both), ${removedRules} rules of ${Object.keys(REMOVED).length} Yomitan transforms removed`);

// Step 5: tests/yomitan.tsv.
const ids = new Set(final.transforms.map((t) => t.id));
const tsv = join(pack, 'tests', 'yomitan.tsv');
let changed = 0;
const lines = readFileSync(tsv, 'utf8').split('\n').map((line) => {
    const cells = line.split('\t');
    if (line.startsWith('#') || cells.length !== 6 || cells[5] === '*') { return line; }
    if (cells[5].split('|').every((id) => ids.has(id))) { return line; }
    ++changed;
    return [...cells.slice(0, 5), '*'].join('\t');
});
writeFileSync(tsv, lines.join('\n'));
console.log(`tests/yomitan.tsv: ${changed} rows given the reasons * (their Yomitan transform is not in the final set)`);
