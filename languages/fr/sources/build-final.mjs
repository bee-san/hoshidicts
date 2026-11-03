#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/fr/transforms.json, the final rule set (docs/languages.md
// 14 step 5), from sources/own.json, sources/yomitan.json and the decisions
// of sources/yomitan-provenance.tsv. Run from the repository root:
//
//   node languages/fr/sources/build-final.mjs
//
// - The own transforms come first, in their order. An own rule is marked
//   `both` when a Yomitan rule of the same tense or form replaces the same
//   ending with the same text (Yomitan's `present indicative` against the
//   own `present-*`, `Preterite` against `simple-past-*`, `plural` against
//   `plural`, …), whatever the stem constraints and persons; a stem change
//   is not the same rule. A cross-product row whose pairs differ in that is
//   split into runs, so the rules keep their order.
// - Then the Yomitan rules that the TSV keeps, each in a transform with
//   Yomitan's id, name and description, source `yomitan`, after every own
//   transform, so that the own readings come first on ties. A kept rule of a
//   transform both files have (plural) joins the own transform, marked
//   `yomitan`.
// - Every other Yomitan rule is left out: the TSV lists the 442 that add a
//   reading the own rules lack on the measured words, and drops those that
//   add as many false readings as right ones; the other 2,230 add none
//   (README.md, Rule provenance).

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));

// Yomitan's transforms and the own tense or form each corresponds to.
const TENSE = {
    'present indicative': 'present', 'imperfect indicative': 'imperfect', future: 'future', 'imperative present': 'imperative',
    Conditional: 'conditional', Preterite: 'simple-past', plural: 'plural', 'present participle': 'present-participle',
    'present subjunctive': 'subjunctive',
};
const OWN_TENSES = ['imperfect-subjunctive', 'simple-past', 'present-participle', 'past-participle', 'present', 'imperfect', 'future',
    'conditional', 'subjunctive', 'imperative', 'plural'];
const tenseOf = (id) => OWN_TENSES.find((t) => id === t || id.startsWith(`${t}-`));

const yomitanPairs = new Set();
for (const t of yomitan.transforms) {
    for (const r of t.rules) {
        if (r.type !== 'suffix') { throw new Error(`${t.id}: a Yomitan rule of type ${r.type}`); }
        yomitanPairs.add(`${TENSE[t.id]}\u0000${r.inflected}\u0000${r.deinflected}`);
    }
}
const isBoth = (tense, rule, inflected, deinflected) =>
    tense !== undefined && rule.stemChange === undefined && yomitanPairs.has(`${tense}\u0000${inflected}\u0000${deinflected}`);

const counts = {own: 0, both: 0, yomitan: 0};
const transforms = [];
for (const t of own.transforms) {
    const tense = tenseOf(t.id);
    const rules = [];
    for (const rule of t.rules) {
        const {source: _source, ...plain} = rule;
        if (rule.type === 'suffix') {
            const source = isBoth(tense, rule, rule.inflected, rule.deinflected) ? 'both' : 'own';
            ++counts[source];
            rules.push(source === 'own' ? plain : {...plain, source});
        } else if (rule.type === 'circumfix' && rule.prefixes?.length === 1 && rule.prefixes[0][0] === '' && rule.prefixes[0][1] === '') {
            // Split into runs of one source, keeping the order of the pairs.
            let run = null;
            for (const pair of rule.suffixes) {
                const source = isBoth(tense, rule, pair[0], pair[1]) ? 'both' : 'own';
                ++counts[source];
                if (run === null || run.source !== source) {
                    run = {source, suffixes: []};
                    rules.push(run);
                }
                run.suffixes.push(pair);
            }
            for (let i = 0; i < rules.length; ++i) {
                if (rules[i].suffixes !== undefined && rules[i].type === undefined) {
                    const {source, suffixes} = rules[i];
                    rules[i] = source === 'own' ? {...plain, suffixes} : {...plain, suffixes, source};
                }
            }
        } else {
            const expanded = rule.type === 'circumfix' && rule.prefixes ? rule.prefixes.length * rule.suffixes.length : 1;
            counts.own += expanded;
            rules.push(plain);
        }
    }
    transforms.push({...t, source: 'own', rules});
}
// A transform whose every rule is `both` says so itself.
for (const t of transforms) {
    if (t.rules.length > 0 && t.rules.every((r) => r.source === 'both')) {
        t.source = 'both';
        t.rules = t.rules.map(({source: _s, ...r}) => r);
    }
}

// The kept Yomitan rules.
const keep = new Map();
for (const line of readFileSync(join(here, 'yomitan-provenance.tsv'), 'utf8').split('\n')) {
    if (line === '' || line.startsWith('#')) { continue; }
    const [id, index, inflected, deinflected, , , decision] = line.split('\t');
    const t = yomitan.transforms.find((x) => x.id === id);
    const rule = t?.rules[Number(index)];
    if (rule === undefined || rule.inflected !== inflected || rule.deinflected !== deinflected) {
        throw new Error(`yomitan-provenance.tsv: ${id}[${index}] ${inflected} → ${deinflected} is not that Yomitan rule`);
    }
    if (!['keep', 'drop', 'drop-first', 'drop-negative'].includes(decision)) { throw new Error(`yomitan-provenance.tsv: ${id}[${index}]: decision ${decision}`); }
    if (decision === 'keep') { keep.set(`${id}\u0000${index}`, rule); }
}
for (const t of yomitan.transforms) {
    const rules = t.rules.filter((_, i) => keep.has(`${t.id}\u0000${i}`)).map(({source: _s, ...r}) => r);
    if (rules.length === 0) { continue; }
    counts.yomitan += rules.length;
    const mine = transforms.find((x) => x.id === t.id);
    if (mine !== undefined) {
        mine.rules.push(...rules.map((r) => ({...r, source: 'yomitan'})));
        continue;
    }
    const {rules: _r, ...header} = t;
    transforms.push({...header, source: 'yomitan', rules});
}

const conditions = {...own.conditions};
for (const [key, condition] of Object.entries(yomitan.conditions)) {
    if (!(key in conditions)) {
        conditions[key] = condition;
    } else if (JSON.stringify(conditions[key]) !== JSON.stringify(condition)) {
        throw new Error(`the condition ${key} differs between own.json and yomitan.json`);
    }
}
const out = {schema: 1, conditions};
if (own.wordLists !== undefined) { out.wordLists = own.wordLists; }
out.transforms = transforms;
writeFileSync(join(here, '..', 'transforms.json'), formatTransforms(out));
console.log(`fr: ${transforms.length} transforms, ${counts.own + counts.both + counts.yomitan} rules (${counts.own} own, ${counts.both} both, ${counts.yomitan} yomitan) in transforms.json`);
