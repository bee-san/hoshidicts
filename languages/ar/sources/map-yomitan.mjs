#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the 6,620 todo rules of a fresh port of Yomitan's Arabic rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> ar --force
//   node languages/ar/sources/map-yomitan.mjs <yomitan>
//
// It reads sources/yomitan.json as the port tool wrote it and replaces each
// todo rule:
//
// - `sandwichInflection` (`^P[arabicLetters]+S$`, from `getImperfectRules`)
//   becomes a `circumfix` with `stemMinLength: 1` and `stemCharacters`
//   Yomitan's `arabicLetters` class, which includes the vowel marks
//   U+064B-U+065F. Its deinflected prefix and suffix are read from Yomitan's
//   own function on a probe text. A `(?<!ن)` before S (`finalStemSegment`)
//   becomes `stemNotEndsWith: "[ن]"`.
// - `conditionalSuffixInflection` (`(?<!X)S$`) becomes a `suffix` with
//   `stemNotEndsWith: "[X]"`, and `conditionalPrefixInflection` (`^P(?!X)`)
//   a `prefix` with `stemNotStartsWith: "[X]"`; both allow an empty stem, as
//   the lookarounds do.
//
// The circumfix rules of one transform with the same conditions, constraint
// and deinflected affixes are then written as cross products
// (getImperfectRules makes every prefix with every suffix). Every mapped rule
// is checked against Yomitan's function on probe texts.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/ar/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'ar');

const LETTERS = '[\\u0620-\\u065F\\u066E-\\u06D3\\u06D5\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF]';
const LETTERS_SOURCE = '[\u0620-\u065F\u066E-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FC\u06FF]';
const LETTER = new RegExp(LETTERS_SOURCE, 'u');
const CONDITIONAL_SUFFIX = /^\(\?<!(.)\)([^()$]+)\$$/u;
const CONDITIONAL_PREFIX = /^\^([^()]+)\(\?!(.)\)$/u;
const PROBE = 'بتك';

/** `^P[arabicLetters]+(?<!X)?S$` as [P, X or undefined, S], or null. */
function sandwich(source) {
    const marker = LETTERS_SOURCE + '+';
    const at = source.indexOf(marker);
    if (!source.startsWith('^') || !source.endsWith('$') || at < 0) { return null; }
    const inflectedPrefix = source.slice(1, at);
    let rest = source.slice(at + marker.length, -1);
    let notEnd;
    const look = /^\(\?<!(.)\)/u.exec(rest);
    if (look !== null) {
        notEnd = look[1];
        rest = rest.slice(look[0].length);
    }
    if (/[[\]()^$\\]/.test(inflectedPrefix + rest)) { return null; }
    return [inflectedPrefix, notEnd, rest];
}

let mapped = 0;
const checks = [];
for (const transform of port.transforms) {
    const yomitanRules = descriptor.transforms[transform.id].rules;
    const out = [];
    transform.rules.forEach((rule, r) => {
        if (rule.type !== 'todo') {
            out.push(rule);
            return;
        }
        ++mapped;
        const original = yomitanRules[r];
        const conditions = {conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut};
        const parts = sandwich(rule.isInflected);
        if (parts !== null) {
            const [inflectedPrefix, notEnd, inflectedSuffix] = parts;
            const result = original.deinflect(inflectedPrefix + PROBE + inflectedSuffix);
            const at = result.indexOf(PROBE);
            if (at < 0) { throw new Error(`${transform.id}[${r}]: unexpected output ${result}`); }
            const pack = {
                type: 'circumfix', inflectedPrefix, deinflectedPrefix: result.slice(0, at),
                inflectedSuffix, deinflectedSuffix: result.slice(at + PROBE.length), ...conditions,
                stemMinLength: 1, stemCharacters: LETTERS,
            };
            if (notEnd !== undefined) { pack.stemNotEndsWith = `[${notEnd}]`; }
            out.push(pack);
            checks.push({id: transform.id, original, pack});
            return;
        }
        let match = CONDITIONAL_SUFFIX.exec(rule.isInflected);
        if (match !== null) {
            const [, notEnd, inflected] = match;
            const result = original.deinflect(PROBE + inflected);
            if (!result.startsWith(PROBE)) { throw new Error(`${transform.id}[${r}]: unexpected output ${result}`); }
            const pack = {type: 'suffix', inflected, deinflected: result.slice(PROBE.length), ...conditions, stemNotEndsWith: `[${notEnd}]`};
            out.push(pack);
            checks.push({id: transform.id, original, pack});
            return;
        }
        match = CONDITIONAL_PREFIX.exec(rule.isInflected);
        if (match !== null) {
            const [, inflected, notStart] = match;
            const result = original.deinflect(inflected + PROBE);
            if (!result.endsWith(PROBE)) { throw new Error(`${transform.id}[${r}]: unexpected output ${result}`); }
            const pack = {type: 'prefix', inflected, deinflected: result.slice(0, -PROBE.length), ...conditions, stemNotStartsWith: `[${notStart}]`};
            out.push(pack);
            checks.push({id: transform.id, original, pack});
            return;
        }
        throw new Error(`${transform.id}[${r}]: no mapping for ${rule.isInflected}`);
    });
    transform.rules = compress(out);
}
if (mapped !== 6620) { throw new Error(`mapped ${mapped} todo rules, expected 6,620`); }

/** Writes the circumfix rules that form cross products as one rule each. */
function compress(rules) {
    const out = [];
    const groups = new Map();
    for (const rule of rules) {
        if (rule.type !== 'circumfix') {
            out.push(rule);
            continue;
        }
        const key = JSON.stringify([rule.conditionsIn, rule.conditionsOut, rule.stemNotEndsWith ?? null, rule.deinflectedPrefix, rule.deinflectedSuffix]);
        if (!groups.has(key)) {
            const group = {rules: []};
            groups.set(key, group);
            out.push(group);
        }
        groups.get(key).rules.push(rule);
    }
    return out.flatMap((item) => {
        if (item.rules === undefined) { return [item]; }
        const first = item.rules[0];
        const shared = {conditionsIn: first.conditionsIn, conditionsOut: first.conditionsOut, stemMinLength: 1, stemCharacters: LETTERS};
        if (first.stemNotEndsWith !== undefined) { shared.stemNotEndsWith = first.stemNotEndsWith; }
        // Rows of the inflected prefixes that take the same suffixes.
        const byPrefix = new Map();
        for (const r of item.rules) {
            if (!byPrefix.has(r.inflectedPrefix)) { byPrefix.set(r.inflectedPrefix, []); }
            byPrefix.get(r.inflectedPrefix).push(r.inflectedSuffix);
        }
        const rows = new Map();
        for (const [p, suffixes] of byPrefix) {
            const key = JSON.stringify(suffixes);
            if (!rows.has(key)) { rows.set(key, {prefixes: [], suffixes}); }
            rows.get(key).prefixes.push(p);
        }
        return [...rows.values()].map(({prefixes, suffixes}) => ({
            type: 'circumfix',
            prefixes: prefixes.map((p) => [p, first.deinflectedPrefix]),
            suffixes: suffixes.map((s) => [s, first.deinflectedSuffix]),
            ...shared,
        }));
    });
}

// Check every mapped rule against Yomitan's function: Yomitan's regular
// expression and the pack rule must accept the same probe texts and give the
// same output.
const stems = ['', 'ب', 'بت', 'كتب', 'ن', 'كن', 'ت', 'كت', 'ي', 'كي', 'ل', 'لك', 'ك\u064Eت', 'abc', 'كa'];
function packApplies(pack, text) {
    if (pack.type === 'circumfix') {
        if (text.length < pack.inflectedPrefix.length + pack.inflectedSuffix.length) { return null; }
        if (!text.startsWith(pack.inflectedPrefix) || !text.endsWith(pack.inflectedSuffix)) { return null; }
        const stem = text.slice(pack.inflectedPrefix.length, text.length - pack.inflectedSuffix.length);
        if (stem.length < 1 || ![...stem].every((c) => LETTER.test(c))) { return null; }
        if (pack.stemNotEndsWith && pack.stemNotEndsWith.includes(stem.at(-1))) { return null; }
        return pack.deinflectedPrefix + stem + pack.deinflectedSuffix;
    }
    if (pack.type === 'suffix') {
        if (!text.endsWith(pack.inflected)) { return null; }
        const stem = text.slice(0, text.length - pack.inflected.length);
        if (stem.length > 0 && pack.stemNotEndsWith.includes(stem.at(-1))) { return null; }
        return stem + pack.deinflected;
    }
    if (!text.startsWith(pack.inflected)) { return null; }
    const stem = text.slice(pack.inflected.length);
    if (stem.length > 0 && pack.stemNotStartsWith.includes(stem[0])) { return null; }
    return pack.deinflected + stem;
}
let probes = 0;
for (const {id, original, pack} of checks) {
    const affix = pack.type === 'circumfix' ? [pack.inflectedPrefix, pack.inflectedSuffix] : pack.type === 'suffix' ? ['', pack.inflected] : [pack.inflected, ''];
    for (const stem of stems) {
        const text = affix[0] + stem + affix[1];
        original.isInflected.lastIndex = 0;
        const theirs = original.isInflected.test(text) ? original.deinflect(text) : null;
        const ours = packApplies(pack, text);
        ++probes;
        if (theirs !== ours) { throw new Error(`${id}: ${text} gives ${theirs} in Yomitan and ${ours} in the pack rule`); }
    }
}

writeFileSync(file, formatTransforms(port));
const count = port.transforms.reduce((n, t) => n + t.rules.length, 0);
const expanded = port.transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + (r.prefixes ? r.prefixes.length * r.suffixes.length : 1), 0), 0);
console.log(`mapped ${mapped} todo rules (${probes} probes agree with Yomitan); sources/yomitan.json has ${count} JSON rules, ${expanded} expanded`);
