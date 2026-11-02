#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/es/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5), and sources/yomitan-provenance.tsv:
//
//   node languages/es/sources/build-final.mjs
//
// The final set is the union of sources/own.json and sources/yomitan.json
// (tools/merge-transforms.mjs) with every Yomitan rule removed, because on
// the measurements of README.md each one either repeats a deinflection an
// own rule makes or only adds false candidates. What remains is
// sources/own.json, in its order, where every own rule that makes the same
// deinflection as a Yomitan rule is marked `source: "both"`.
//
// Two rules make the same deinflection when they replace the same ending
// with the same text and the same stem change (from, to) and give a
// compatible part of speech, in transforms of the same tense, mood or form
// (Yomitan's `present indicative` and the own `present-yo` ... `present-vos`,
// for example). A Yomitan rule that attaches an ending to the infinitive
// (future `é` → ``) makes the deinflections of the own rules for the three
// conjugations (`aré` → `ar`, `eré` → `er`, `iré` → `ir`). Yomitan's jugar
// rules (ue → u where the text starts with jue) are the own jue → ju change;
// its five pronominal patterns are the own pronominal rules.
//
// sources/yomitan-provenance.tsv lists every Yomitan rule with the own rules
// that make its deinflection, or `-` when none does.
//
// It also sets the reasons column of tests/yomitan.tsv (Yomitan's Spanish
// test, as tools/port-yomitan-tests.mjs writes it) to `*`: the final rules
// reach those lemmas through own transforms, whose ids are not Yomitan's.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms, parseJson} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => parseJson(readFileSync(join(here, name), 'utf8'), name);
const own = read('own.json');
const yomitan = read('yomitan.json');

// The union is computed to check that the two files merge (conditions and
// word lists agree); the final set keeps none of its Yomitan rules.
const union = mergeTransforms(own, yomitan).transforms;
const unionRules = union.transforms.reduce((n, t) => n + t.rules.length, 0);

// Own transforms that correspond to each Yomitan transform.
const CATEGORY = {
    'present indicative': /^present-/,
    'preterite': /^preterite-/,
    'imperfect': /^imperfect-/,
    'progressive': /^gerund$/,
    'imperative': /^imperative-/,
    'conditional': /^conditional-/,
    'future': /^future-/,
    'present subjunctive': /^subjunctive-(yo-el|tu|nosotros|vosotros|ellos|vos)$/,
    'imperfect subjunctive': /^subjunctive-(ra|se)-/,
    'participle': /^participle$/,
    'reflexive': /^clitic-se$/,
    'pronoun substitution': /^clitic-(me|te|nos)$/,
    'pronominal': /^pronominal$/,
    'plural': /^plural$/,
    'feminine adjective': /^feminine$/,
};

const leaves = (conditions, name) => {
    const c = conditions[name];
    return c.subConditions === undefined ? [name] : c.subConditions.flatMap((s) => leaves(conditions, s));
};
const leafSet = (names) => new Set(names.flatMap((n) => leaves(union.conditions, n)));
const overlaps = (a, b) => [...leafSet(a)].some((x) => leafSet(b).has(x));

/** The stem change a rule makes, as from>to, with Yomitan's jugar branch as the own jue → ju. */
function change(rule) {
    const c = rule.stemChange;
    if (c === undefined) { return ''; }
    if (rule.stemStartsWithText === 'jue' && c.from[0] === 'ue' && c.to === 'u') { return 'jue>ju'; }
    return `${c.from[0]}>${c.to}`;
}

function sameDeinflection(y, o) {
    if (!overlaps(y.conditionsOut, o.conditionsOut)) { return false; }
    if (y.type === 'pattern') { return o.type === 'circumfix'; }
    if (!['suffix', 'wholeWord'].includes(y.type) || !['suffix', 'wholeWord'].includes(o.type)) { return false; }
    if (change(y) !== change(o)) { return false; }
    if (y.inflected === o.inflected && y.deinflected === o.deinflected) { return true; }
    // An ending attached to the infinitive.
    return y.deinflected === '' && ['ar', 'er', 'ir'].some((c) => o.inflected === c + y.inflected && o.deinflected === c);
}

const both = new Set();
const rows = [];
let matched = 0;
for (const transform of yomitan.transforms) {
    const category = CATEGORY[transform.id];
    if (category === undefined) { throw new Error(`no own category for Yomitan's ${transform.id}`); }
    transform.rules.forEach((y, i) => {
        const found = new Set();
        for (const t of own.transforms) {
            if (!category.test(t.id)) { continue; }
            t.rules.forEach((o, j) => {
                if (sameDeinflection(y, o)) {
                    found.add(t.id);
                    both.add(`${t.id}\u0000${j}`);
                }
            });
        }
        if (found.size > 0) { ++matched; }
        const what = y.type === 'pattern' ? y.pattern : `${y.inflected} → ${y.deinflected}${change(y) ? ` (${change(y).replace('>', ' → ')})` : ''}`;
        rows.push([transform.id, String(i), what, found.size > 0 ? [...found].join(' ') : '-']);
    });
}

const out = {schema: 1, conditions: own.conditions, transforms: own.transforms.map((t) => {
    const marks = t.rules.map((_, j) => both.has(`${t.id}\u0000${j}`));
    const allBoth = marks.every(Boolean);
    const {source: _source, ...header} = t;
    const rules = t.rules.map((r, j) => {
        const {source: _s, ...rest} = r;
        return marks[j] && !allBoth ? {...rest, source: 'both'} : rest;
    });
    const {rules: _r, ...fields} = header;
    return {...fields, source: allBoth ? 'both' : 'own', rules};
})};
writeFileSync(join(here, '..', 'transforms.json'), formatTransforms(out));

const header = [
    '# Every rule of sources/yomitan.json (Yomitan d3c54c1, GPL-3.0-or-later, Copyright (C) 2024-2026 Yomitan Authors) and the own rules of',
    '# transforms.json that make the same deinflection (marked source "both"), written by sources/build-final.mjs. "-": no own rule makes it;',
    '# README.md, "Rule provenance", says why those rules are not in transforms.json.',
    '# transform\trule\tdeinflection\town transforms with that deinflection',
];
writeFileSync(join(here, 'yomitan-provenance.tsv'), [...header, ...rows.map((r) => r.join('\t'))].join('\n') + '\n');

const testFile = join(here, '..', 'tests', 'yomitan.tsv');
const NOTE = [
    '# Converted by tools/port-yomitan-tests.mjs; the reasons column is then set to * (any trace) by sources/build-final.mjs: the final rules reach',
    '# these lemmas through this pack\'s own transforms, whose ids are not Yomitan\'s. With Yomitan\'s traces the rows pass against sources/yomitan.json (README.md).',
];
const test = readFileSync(testFile, 'utf8').split('\n').filter((line) => !line.startsWith('# Converted by tools/port-yomitan-tests.mjs') && !line.startsWith('# these lemmas through'));
writeFileSync(testFile, test.flatMap((line) => {
    if (line.startsWith('# category')) { return [...NOTE, line]; }
    if (line === '' || line.startsWith('#')) { return [line]; }
    const cells = line.split('\t');
    cells[5] = '*';
    return [cells.join('\t')];
}).join('\n'));

const ownRules = own.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`es: union ${union.transforms.length} transforms, ${unionRules} rules; final ${out.transforms.length} transforms, ${ownRules} rules: ${ownRules - both.size} own, ${both.size} both, 0 yomitan; ${matched} of ${rows.length} Yomitan rules have an own rule with the same deinflection`);
