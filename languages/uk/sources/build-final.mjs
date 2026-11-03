#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/uk/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5):
//
//   node languages/uk/sources/build-final.mjs [--removals <file>] [--out <file>]
//
// It is the union tools/merge-transforms.mjs makes of sources/own.json and
// sources/yomitan.json, with two changes:
//
// - The own transforms come first, then Yomitan's, so that where an own rule
//   and a Yomitan rule reach different terms that every ranking key ties
//   (їм: вони, the pronoun, and їсти, to eat), the lookup shows the own
//   transform's term first (section 9.6, discovery order).
// - Yomitan's rules have no stem constraint, so they also apply to a text
//   of several words (на столі → на стіл, ім'я і → ім'я): a lookup tries
//   the scanned text's longer prefixes first (section 9.2) and such a
//   reading claims more of the text than the word. Every Yomitan rule whose
//   stem is otherwise free takes stemCharacters {stemChar}, as the own rules
//   do, so it reads one word.
// - The Yomitan rules listed in sources/yomitan-removed.tsv are left out.
//   Each row names a rule by its transform id and its two affixes and gives
//   the numbers that justify it: the rows only it recovers, the false
//   candidates only it adds and the negatives it breaks, from
//   `eval-language --per-rule` on every form of the kaikki tables, the cases
//   and Yomitan's own test (README, Rule provenance).
//
// An own rule is marked `both` when Yomitan has a rule of the same kind that
// makes the same replacement (the same inflected and deinflected affixes and
// stem change) for an overlapping part of speech: the two were written
// independently and agree, though the own rule usually has stem constraints
// Yomitan's lacks. Cross products are compared pair by pair.

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
// circumfix, prefix and suffix joined by '…'), recovers, falseCandidates,
// breaks, reason.
const removals = new Map();
for (const line of readFileSync(removalsFile, 'utf8').split('\n')) {
    if (line === '' || line.startsWith('#')) { continue; }
    const [transform, inflected, deinflected, , , , reason] = line.split('\t');
    if (!reason) { throw new Error(`${removalsFile}: a row without a reason: ${line}`); }
    removals.set(`${transform}\t${inflected}\t${deinflected}`, 0);
}
const removalKey = (id, rule) => {
    if (rule.type === 'circumfix' && !(rule.stemCharacters === '[]' || (rule.inflectedPrefix === '' && rule.deinflectedPrefix === ''))) {
        return `${id}\t${rule.inflectedPrefix}…${rule.inflectedSuffix}\t${rule.deinflectedPrefix}…${rule.deinflectedSuffix}`;
    }
    const [, pair] = replacement(rule).split(' ');
    const [inflected, deinflected] = pair.split('>');
    return `${id}\t${inflected}\t${deinflected}`;
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
let ownRules = 0;
let removed = 0;
let kept = 0;
for (const transform of union.transforms) {
    if (ownIds.has(transform.id)) {
        // An own cross product is `both` only when every pair is; otherwise
        // its pairs that Yomitan also makes are split off and marked.
        const rules = [];
        for (const rule of transform.rules) {
            const singles = expand(rule);
            ownRules += singles.length;
            const agrees = (single) => [...(yomitanMakes.get(replacement(single)) ?? [])].some((c) => single.conditionsOut.includes(c));
            const matched = singles.filter(agrees);
            const {source: _source, ...plain} = rule;
            if (matched.length === 0) {
                rules.push(plain);
            } else if (matched.length === singles.length) {
                rules.push({...plain, source: 'both'});
                both += singles.length;
            } else if (rule.type === 'circumfix' && rule.suffixes !== undefined && rule.prefixes.length === 1) {
                // The pairs only this pack has and the pairs Yomitan also makes go
                // into separate rules, as few as possible. Rules that match at
                // one place apply in file order, which decides ties between
                // their terms (section 9.6), so two pairs with the same
                // inflected ending keep their order: a pair joins the first
                // rule of its kind that comes no earlier than every rule
                // holding its ending.
                const groups = [];
                rule.suffixes.forEach((pair, i) => {
                    const shared = agrees(singles[i]);
                    const last = groups.reduce((m, g, gi) => (g.endings.has(pair[0]) ? gi : m), -1);
                    let group = groups.find((g, gi) => gi >= last && g.shared === shared);
                    if (!group) {
                        group = {shared, endings: new Set(), rule: {...plain, suffixes: [], ...(shared ? {source: 'both'} : {})}};
                        groups.push(group);
                    }
                    group.endings.add(pair[0]);
                    group.rule.suffixes.push(pair);
                    if (shared) { ++both; }
                });
                rules.push(...groups.map((g) => g.rule));
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
            if (['suffix', 'prefix', 'circumfix'].includes(plain.type) && plain.stemCharacters === undefined) { plain.stemCharacters = '{stemChar}'; }
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
console.error(`${outFile}: ${out.transforms.length} transforms; ${count('own')} own, ${count('both')} both, ${count('yomitan')} yomitan rules; ${removed} Yomitan rules left out (${kept} kept)`);
