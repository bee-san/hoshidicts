#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/de/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5), and sources/yomitan-provenance.tsv:
//
//   node languages/de/sources/build-final.mjs
//
// The final set is sources/own.json followed by five of Yomitan's seven
// transforms (sources/yomitan.json): nominalization, -bar, negative, past
// participle and -heit. README.md ("Rule provenance") gives the measurements
// behind the choice:
// - Yomitan's separated prefix is left out: its 66 patterns read a
//   preposition as a separated particle and put a wrong verb first (sagte der
//   Auf... -> aufsagen), at 1.13% of the Tatoeba lookups.
// - Yomitan's zu-infinitive is left out: the own zu-infinitive rule makes its
//   deinflections, and its 66 prefix rules, which need no ending, also read
//   dazu ist as da ist and einzu... as ein.
// - The Yomitan transforms come after the own ones, so that where an own and a
//   Yomitan rule reach different words at the same cost, the own reading is
//   found first and wins the tie (docs/languages.md 9.6).
// The conditions both files have are the same (tools/merge-transforms.mjs
// checks them). An own rule that makes the same deinflection as a Yomitan
// rule is marked `both`: the own zu-infinitive rule (Yomitan's 66 prefix
// rules, every one of whose prefixes it has) and the four own participle
// rules of weak verbs (Yomitan's ge...t rules). The Yomitan rules kept are
// marked `yomitan`.
//
// It also moves the one row of tests/yomitan.tsv that only Yomitan's
// separated-prefix rule passes (räum den Tisch auf -> räum auf, two words) to
// tests/gaps.tsv.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms, parseJson} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => parseJson(readFileSync(join(here, name), 'utf8'), name);
const own = read('own.json');
const yomitan = read('yomitan.json');
mergeTransforms(own, yomitan);  // throws when the conditions of the two files disagree

const KEPT = ['nominalization', '-bar', 'negative', 'past participle', '-heit'];
const LEFT_OUT = {
    'separated prefix': 'left out: reads a preposition as a separated particle and puts a wrong verb first (README.md, Rule provenance)',
    'zu-infinitive': 'left out: the own zu-infinitive rule makes this deinflection; the prefix rule also reads dazu ist and einzu... (README.md)',
};

// The own rules that make a Yomitan rule's deinflection.
const zuRule = own.transforms.find((t) => t.id === 'zu-infinitive').rules[0];
const zuPrefixes = new Set(zuRule.prefixes.map(([inflected, deinflected]) => `${inflected}>${deinflected}`));
const participle = own.transforms.find((t) => t.id === 'past-participle');
const weakParticiples = participle.rules
    .map((rule, index) => ({rule, index}))
    .filter(({rule}) => rule.type === 'suffix' && rule.stemChange?.from?.[0] === 'ge' && ['t>en', 'et>en', 'elt>eln', 'ert>ern'].includes(`${rule.inflected}>${rule.deinflected}`));
if (weakParticiples.length !== 4) { throw new Error(`expected 4 own participle rules of weak verbs, found ${weakParticiples.length}`); }

const both = new Set();
const rows = [];
for (const transform of yomitan.transforms) {
    transform.rules.forEach((rule, i) => {
        let what;
        if (rule.type === 'pattern') {
            what = `${rule.pattern} -> ${rule.replacement}`;
        } else if (rule.type === 'circumfix') {
            what = rule.prefixes ? `${rule.prefixes.length} prefixes + ge-, -t -> ${rule.suffixes[0][1]}` : `${rule.inflectedPrefix}-, -${rule.inflectedSuffix} -> ${rule.deinflectedSuffix}`;
        } else {
            what = `${rule.type} ${rule.inflected} -> ${rule.deinflected}`;
        }
        let ownRules = [];
        if (transform.id === 'zu-infinitive') {
            if (!zuPrefixes.has(`${rule.inflected}>${rule.deinflected}`)) { throw new Error(`the own zu-infinitive rule lacks ${rule.inflected}`); }
            ownRules = ['zu-infinitive[0]'];
            both.add('zu-infinitive\u00000');
        } else if (transform.id === 'past participle') {
            ownRules = weakParticiples.map(({index}) => `past-participle[${index}]`);
            for (const {index} of weakParticiples) { both.add(`past-participle\u0000${index}`); }
        }
        const status = KEPT.includes(transform.id) ? 'kept' : LEFT_OUT[transform.id];
        if (status === undefined) { throw new Error(`no decision for Yomitan's ${transform.id}`); }
        rows.push([transform.id, String(i), what, status, ownRules.join(' ') || '-']);
    });
}

const mark = (t) => {
    const marks = t.rules.map((_, j) => both.has(`${t.id}\u0000${j}`));
    const allBoth = marks.every(Boolean);
    const {source: _source, rules, ...fields} = t;
    return {...fields, source: allBoth ? 'both' : 'own', rules: rules.map((r, j) => {
        const {source: _s, ...rest} = r;
        return marks[j] && !allBoth ? {...rest, source: 'both'} : rest;
    })};
};
const kept = yomitan.transforms.filter((t) => KEPT.includes(t.id)).map((t) => ({...t, source: 'yomitan'}));
const out = {schema: 1, conditions: own.conditions, transforms: [...own.transforms.map(mark), ...kept]};
writeFileSync(join(here, '..', 'transforms.json'), formatTransforms(out));

const header = [
    '# Every rule of sources/yomitan.json (Yomitan d3c54c1, GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan Authors), whether',
    '# transforms.json keeps it, and the own rules of transforms.json that make the same deinflection (marked source "both").',
    '# Written by sources/build-final.mjs.',
    '# transform\trule\tdeinflection\tin transforms.json\town rules with that deinflection',
];
writeFileSync(join(here, 'yomitan-provenance.tsv'), [...header, ...rows.map((r) => r.join('\t'))].join('\n') + '\n');

// The row of Yomitan's test that only its separated-prefix rule passes.
const testFile = join(here, '..', 'tests', 'yomitan.tsv');
const gapsFile = join(here, '..', 'tests', 'gaps.tsv');
const lines = readFileSync(testFile, 'utf8').split('\n');
const separated = lines.filter((line) => line.startsWith('separated prefix\t'));
if (separated.length > 0) {
    writeFileSync(testFile, lines.filter((line) => !line.startsWith('separated prefix\t')).join('\n'));
    const gaps = readFileSync(gapsFile, 'utf8').split('\n');
    const at = gaps.findIndex((line) => line.startsWith('# category'));
    gaps.splice(at + 1, 0, ...separated.map((line) => `yomitan-${line}`));
    writeFileSync(gapsFile, gaps.join('\n'));
}
const count = (t) => t.rules.length;
const sources = {own: 0, yomitan: 0, both: 0};
for (const t of out.transforms) { for (const r of t.rules) { ++sources[r.source ?? t.source]; } }
console.log(`de: ${out.transforms.length} transforms, ${out.transforms.reduce((n, t) => n + count(t), 0)} rules (${sources.own} own, ${sources.both} both, ${sources.yomitan} yomitan); ${rows.length} Yomitan rules in yomitan-provenance.tsv`);
