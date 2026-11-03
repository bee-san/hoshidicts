#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ko/transforms.json, the final Korean rule set
// (docs/languages.md, section 14 step 5): the union of sources/own.json and
// sources/yomitan.json as tools/merge-transforms.mjs makes it, without the
// Yomitan rules listed in sources/removed-rules.tsv and, when that file says
// so, without the Yomitan rules that copy a stem-constrained own rule without
// its constraint (both chosen by sources/select-rules.mjs; README.md gives the
// measurements).
//
//   node languages/ko/sources/final-rules.mjs [--out <file>]

import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function canonical(value) {
    if (Array.isArray(value)) { return `[${value.map(canonical).join(',')}]`; }
    if (value !== null && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

/** A rule's identity: its JSON without `source`, keys sorted. */
export function ruleKey(rule) {
    const {source: _source, ...rest} = rule;
    return canonical(rest);
}

/**
 * The rules of sources/removed-rules.tsv: [{transform, rule}]. Each row names a
 * suffix rule of sources/yomitan.json (every ported Korean rule is one) by
 * transform id, inflected, deinflected, conditionsIn and conditionsOut, the
 * conditions joined with commas in the file's order.
 */
export function readRemoved(file = join(here, 'removed-rules.tsv')) {
    if (!existsSync(file)) { return []; }
    const list = (cell) => (cell === '' ? [] : cell.split(','));
    return readFileSync(file, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#')).map((line) => {
        const [transform, inflected, deinflected, conditionsIn, conditionsOut] = line.split('\t');
        return {transform, rule: {type: 'suffix', inflected, deinflected, conditionsIn: list(conditionsIn), conditionsOut: list(conditionsOut)}};
    });
}

/** A copy of a transforms file without the listed rules; each must match a rule. */
export function removeRules(file, removed) {
    const out = structuredClone(file);
    const byTransform = new Map();
    for (const {transform, rule} of removed) {
        const keys = byTransform.get(transform) ?? new Set();
        keys.add(ruleKey(rule));
        byTransform.set(transform, keys);
    }
    for (const [id, keys] of byTransform) {
        const transform = out.transforms.find((t) => t.id === id);
        if (transform === undefined) { throw new Error(`removed-rules.tsv names no transform ${id} of yomitan.json`); }
        const found = new Set();
        transform.rules = transform.rules.filter((rule) => {
            const key = ruleKey(rule);
            if (!keys.has(key)) { return true; }
            found.add(key);
            return false;
        });
        for (const key of keys) {
            if (!found.has(key)) { throw new Error(`removed-rules.tsv: ${id} has no rule ${key} in yomitan.json`); }
        }
    }
    out.transforms = out.transforms.filter((t) => t.rules.length > 0);
    return out;
}

/** A rule's type, affixes and input conditions. */
function copyKey(rule) {
    return [rule.type, rule.inflected, rule.deinflected, rule.conditionsIn.join(',')].join('\t');
}

/**
 * A test for the rules that constrain nothing and equal a rule of `own` (type,
 * affixes and input conditions) that gives every output condition they give:
 * all they add are readings at stems the own rule refuses (바라야 -> 바르다 by
 * Yomitan's ㅡ-dropping, 바라야지 -> 발다 by its ㅗ contraction, 나요 -> 다 with an
 * empty stem), or nothing when the own rule constrains nothing either.
 */
export function copiesOf(own) {
    const outputs = new Map();
    for (const r of own.transforms.flatMap((t) => t.rules)) {
        const list = outputs.get(copyKey(r)) ?? [];
        list.push(new Set(r.conditionsOut));
        outputs.set(copyKey(r), list);
    }
    return (rule) => rule.stemEndsWith === undefined && rule.stemNotEndsWith === undefined && rule.stemMinLength === undefined
        && (outputs.get(copyKey(rule)) ?? []).some((out) => rule.conditionsOut.every((c) => out.has(c)));
}

/** The line of sources/removed-rules.tsv that leaves the copies out too. */
export const COPIES_LINE = '# copies: left out too, by sources/final-rules.mjs: every Yomitan rule that equals a stem-constrained own rule but for the constraint';

/** sources/yomitan.json without the removed rules and, if the file says so, the copies. */
export function finalYomitan(own, yomitan, file = join(here, 'removed-rules.tsv')) {
    const out = removeRules(yomitan, readRemoved(file));
    if (existsSync(file) && readFileSync(file, 'utf8').split('\n').some((line) => line.startsWith(COPIES_LINE))) {
        const isCopy = copiesOf(own);
        for (const t of out.transforms) { t.rules = t.rules.filter((r) => !isCopy(r)); }
        out.transforms = out.transforms.filter((t) => t.rules.length > 0);
    }
    return out;
}

export function finalTransforms() {
    const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
    return mergeTransforms(own, finalYomitan(own, JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'))));
}

function main(argv) {
    const i = argv.indexOf('--out');
    const out = i >= 0 ? resolve(argv[i + 1]) : join(here, '..', 'transforms.json');
    const {transforms, counts} = finalTransforms();
    writeFileSync(out, formatTransforms(transforms));
    const rules = counts.own + counts.yomitan + counts.both;
    console.log(`${out}: ${transforms.transforms.length} transforms, ${rules} rules (${counts.own} own, ${counts.yomitan} yomitan, ${counts.both} both)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { main(process.argv.slice(2)); }
