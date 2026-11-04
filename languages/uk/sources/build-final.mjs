#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/uk/transforms.json, the final rule set (docs/languages.md
// 14 step 5; README, Rule provenance):
//
//   node languages/uk/sources/build-final.mjs [--removals <file>] [--out <file>]
//
// The union tools/merge-transforms.mjs makes of own.json and yomitan.json,
// with the own transforms first (ties go to the own reading, 9.6), every
// Yomitan rule limited to one word (stemCharacters {stem}), and the Yomitan
// rules yomitan-removed.tsv lists left out. An own rule is `both` when
// Yomitan makes the same replacement for an overlapping part of speech; a
// cross product is `both` when all of its pairs are.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? resolve(args[i + 1]) : fallback;
};
const removalsFile = option('--removals', join(here, 'yomitan-removed.tsv'));
const outFile = option('--out', join(here, '..', 'transforms.json'));
const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));

/** The single rules a rule stands for: a cross product's pairs, or itself. */
function expand(rule) {
    if (rule.type !== 'circumfix' || rule.suffixes === undefined) { return [rule]; }
    const {prefixes, suffixes, ...rest} = rule;
    return prefixes.flatMap(([inflectedPrefix, deinflectedPrefix]) => suffixes.map(([inflectedSuffix, deinflectedSuffix]) =>
        ({...rest, inflectedPrefix, deinflectedPrefix, inflectedSuffix, deinflectedSuffix})));
}

/** What a single rule replaces, whatever its type and constraints. */
function replacement(rule) {
    const change = rule.stemChange ? `${rule.stemChange.from.join('|')}>${rule.stemChange.to}` : '';
    switch (rule.type) {
        case 'suffix': return `s ${rule.inflected}>${rule.deinflected} ${change}`;
        case 'prefix': return `p ${rule.inflected}>${rule.deinflected} ${change}`;
        case 'wholeWord': return `s ${rule.inflected}>${rule.deinflected} whole`;
        case 'circumfix':
            if (rule.stemCharacters === '[]') { return `s ${rule.inflectedPrefix}${rule.inflectedSuffix}>${rule.deinflectedPrefix}${rule.deinflectedSuffix} whole`; }
            if (rule.inflectedPrefix === '' && rule.deinflectedPrefix === '') { return `s ${rule.inflectedSuffix}>${rule.deinflectedSuffix} ${change}`; }
            return `c ${rule.inflectedPrefix}>${rule.deinflectedPrefix} ${rule.inflectedSuffix}>${rule.deinflectedSuffix} ${change}`;
        default: return `${rule.type} ${JSON.stringify(rule)}`;
    }
}

// sources/yomitan-removed.tsv: transform, inflected, deinflected (for a
// circumfix, prefix and suffix joined by '…'), the rest of the rule (its
// stem change, minimum, classes and conditions, as detail() writes them),
// recovers, falseCandidates, breaks, reason.
const removals = new Map();
for (const line of readFileSync(removalsFile, 'utf8').split('\n')) {
    if (line === '' || line.startsWith('#')) { continue; }
    const [transform, inflected, deinflected, rule, , , , reason] = line.split('\t');
    if (!reason) { throw new Error(`${removalsFile}: a row without a reason: ${line}`); }
    removals.set(`${transform}\t${inflected}\t${deinflected}\t${rule}`, 0);
}
/** The rest of a rule, as sources/select-removals.py writes it. */
function detail(rule) {
    const parts = [];
    if (rule.stemChange) { parts.push(`change ${rule.stemChange.from.join('|')}>${rule.stemChange.to}`); }
    if (rule.stemMinLength) { parts.push(`min ${rule.stemMinLength}`); }
    if (rule.stemEndsWith !== undefined) { parts.push(`ends ${rule.stemEndsWith}`); }
    if (rule.stemContains !== undefined) { parts.push(`has ${rule.stemContains}`); }
    parts.push(`in ${rule.conditionsIn.join(',')} out ${rule.conditionsOut.join(',')}`);
    return parts.join('; ');
}
const removalKey = (id, rule) => {
    if (rule.type === 'circumfix' && !(rule.stemCharacters === '[]' || (rule.inflectedPrefix === '' && rule.deinflectedPrefix === ''))) {
        return `${id}\t${rule.inflectedPrefix}…${rule.inflectedSuffix}\t${rule.deinflectedPrefix}…${rule.deinflectedSuffix}\t${detail(rule)}`;
    }
    const [, pair] = replacement(rule).split(' ');
    const [inflected, deinflected] = pair.split('>');
    return `${id}\t${inflected}\t${deinflected}\t${detail(rule)}`;
};

// Yomitan's rules without the removed ones, written back as cross products
// of the rules that differ only in their affixes (sources/yomitan.json keeps
// its rules with a minimum stem of two single, for the differential check).
function compact(rules) {
    const groups = new Map();
    const out = [];
    for (const rule of rules) {
        let pair = null;
        let rest = null;
        if (rule.type === 'wholeWord') {
            pair = [rule.inflected, rule.deinflected];
            const {type: _t, inflected: _i, deinflected: _d, ...others} = rule;
            rest = {...others, stemCharacters: '[]'};
        } else if (rule.type === 'suffix' && rule.inflected !== '') {
            pair = [rule.inflected, rule.deinflected];
            const {type: _t, inflected: _i, deinflected: _d, ...others} = rule;
            rest = others;
        } else if (rule.type === 'circumfix' && rule.inflectedPrefix === '' && rule.deinflectedPrefix === '' && rule.inflectedSuffix !== '') {
            pair = [rule.inflectedSuffix, rule.deinflectedSuffix];
            const {type: _t, inflectedPrefix: _a, deinflectedPrefix: _b, inflectedSuffix: _c, deinflectedSuffix: _d, ...others} = rule;
            rest = others;
        }
        if (pair === null) { out.push(rule); continue; }
        const key = JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
        if (!groups.has(key)) {
            const group = {type: 'circumfix', prefixes: [['', '']], suffixes: [], ...rest};
            groups.set(key, group);
            out.push(group);
        }
        groups.get(key).suffixes.push(pair);
    }
    return out.map((rule) => {
        if (rule.type !== 'circumfix' || rule.suffixes === undefined || rule.suffixes.length !== 1 || rule.prefixes.length !== 1
            || rule.prefixes[0][0] !== '' || rule.prefixes[0][1] !== '') { return rule; }
        const {type: _t, prefixes: _p, suffixes: [[inflected, deinflected]], ...rest} = rule;
        if (rest.stemCharacters === '[]') {
            const {stemCharacters: _s, ...others} = rest;
            return {type: 'wholeWord', inflected, deinflected, ...others};
        }
        return {type: 'suffix', inflected, deinflected, ...rest};
    });
}

const {transforms: union} = mergeTransforms(own, yomitan);
const yomitanIds = new Set(yomitan.transforms.map((t) => t.id));
const ownIds = new Set(own.transforms.map((t) => t.id));
for (const id of yomitanIds) { if (ownIds.has(id)) { throw new Error(`the transform ${id} is in both files`); } }

// Yomitan's replacements by part of speech, for the `both` marks.
const yomitanMakes = new Map();
for (const transform of yomitan.transforms) {
    for (const rule of transform.rules.flatMap(expand)) {
        const key = replacement(rule);
        if (!yomitanMakes.has(key)) { yomitanMakes.set(key, new Set()); }
        for (const c of rule.conditionsOut) { yomitanMakes.get(key).add(c); }
    }
}
const ownTransforms = [];
const yomitanTransforms = [];
let both = 0;
let sharedPairs = 0;
let ownRules = 0;
let removed = 0;
let kept = 0;
for (const transform of union.transforms) {
    if (ownIds.has(transform.id)) {
        // An own rule is `both` when Yomitan makes the same replacement for an
        // overlapping part of speech; a cross product is `both` when every one
        // of its pairs is, and `own` otherwise (its shared pairs are counted,
        // not split off, so the rules keep the order build-own.mjs gives them).
        const rules = [];
        for (const rule of transform.rules) {
            const singles = expand(rule);
            ownRules += singles.length;
            const agrees = (single) => [...(yomitanMakes.get(replacement(single)) ?? [])].some((c) => single.conditionsOut.includes(c));
            const shared = singles.filter(agrees).length;
            sharedPairs += shared;
            const {source: _source, ...plain} = rule;
            if (shared === singles.length) {
                rules.push({...plain, source: 'both'});
                both += shared;
            } else {
                rules.push(plain);
            }
        }
        ownTransforms.push({...transform, source: 'own', rules});
    } else {
        const rules = [];
        for (const rule of transform.rules.flatMap(expand)) {
            const key = removalKey(transform.id, rule);
            if (removals.has(key)) {
                removals.set(key, removals.get(key) + 1);
                ++removed;
                continue;
            }
            const {source: _source, ...plain} = rule;
            if (['suffix', 'prefix', 'circumfix'].includes(plain.type) && plain.stemCharacters === undefined) { plain.stemCharacters = '{stem}'; }
            rules.push(plain);
            ++kept;
        }
        if (rules.length > 0) { yomitanTransforms.push({...transform, source: 'yomitan', rules: compact(rules)}); }
    }
}
const unused = [...removals].filter(([, n]) => n === 0).map(([key]) => key);
if (unused.length > 0) { throw new Error(`${removalsFile} names rules Yomitan's file does not have:\n${unused.join('\n')}`); }
const out = {...union, transforms: [...ownTransforms, ...yomitanTransforms]};
writeFileSync(outFile, formatTransforms(out));
const count = (source) => out.transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + ((r.source ?? t.source) === source ? expand(r).length : 0), 0), 0);
console.error(`${outFile}: ${out.transforms.length} transforms; ${count('own')} own, ${count('both')} both, ${count('yomitan')} yomitan rules; ${sharedPairs} own rules make a replacement Yomitan makes; ${removed} Yomitan rules left out (${kept} kept)`);
