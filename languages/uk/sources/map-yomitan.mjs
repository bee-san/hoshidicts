#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the 64 todo rules of a fresh port of Yomitan's Ukrainian rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> uk --force
//   node languages/uk/sources/map-yomitan.mjs <yomitan>
//
// Each todo rule is paired with the Yomitan rule it came from (same
// transform, same isInflected source, in order), and the replacement Yomitan
// makes is read by calling that rule's own deinflect on a probe text:
//
// - `[ое]([C]+)E$` → `і$1D` (the о/е → і alternation, 29 rules): a `suffix`
//   E → D with `stemChange` о/е → і at the last о or е that only consonants
//   follow.
// - `([C])([C])E$` → `$1V$2D` (the fleeting vowel, 26 rules): the vowel goes
//   back between the last two consonants. As a `suffix`, that is one rule per
//   last consonant X, XE → VXD, with `stemEndsWith` a consonant, written as
//   one cross-product circumfix with an empty prefix.
// - `.[ое]Xі$` → `іY` (palatalised velars with the alternation, 6 rules):
//   literal suffixes оXі → іY and еXі → іY with `stemMinLength` 1.
// - `[V].*[C]$` → text + D (a zero ending after a closed syllable, 3 rules):
//   a `suffix` with an empty ending, `stemContains` a vowel and
//   `stemEndsWith` a consonant.
//
// Then, in every transform, the suffix rules and whole words that differ
// only in their two affixes are written as one cross-product circumfix with
// an empty prefix (section 7.3; a whole word's stem is empty, stemCharacters
// []): the same rules in fewer bytes, which keeps sources/ and tests/ under
// 1 MB (section 3). The differential check probes a cross product's pairs
// with stems of one and three letters, on both sides of Yomitan's minimum
// stem of two.
//
// C is Yomitan's consonant list бвгґджзклмнпрстфхцчшщ (the pack's
// {consonant}) and V its vowel list (the pack's {vowel}). None of these rules
// gets a constraint Yomitan does not have, so the differential check
// (tools/check-yomitan.mjs) compares them as Yomitan wrote them.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/uk/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'uk');

const CONSONANTS = 'бвгґджзклмнпрстфхцчшщ';
const VOWELS = 'аеєиіїоуюя';
const C = `[${CONSONANTS}]`;
const ALTERNATING = new RegExp(`^\\[ое\\]\\(\\[${CONSONANTS}\\]\\+\\)([^\\\\^$.*+?()[\\]{}|]+)\\$$`, 'u');
const FLEETING = new RegExp(`^\\(\\[${CONSONANTS}\\]\\)\\(\\[${CONSONANTS}\\]\\)([^\\\\^$.*+?()[\\]{}|]+)\\$$`, 'u');
const PALATAL = /^\.\[ое\]([зцс])(і)\$$/u;
const ZERO = new RegExp(`^\\[${VOWELS}\\]\\.\\*\\[${CONSONANTS}\\]\\$$`, 'u');

function call(rule, text) {
    if (rule.isInflected.global) { rule.isInflected.lastIndex = 0; }
    if (!rule.isInflected.test(text)) { throw new Error(`${rule.isInflected.source} does not match the probe ${text}`); }
    if (rule.isInflected.global) { rule.isInflected.lastIndex = 0; }
    return rule.deinflect(text);
}

function after(output, prefix, source) {
    if (!output.startsWith(prefix)) { throw new Error(`${source}: ${output} does not start with ${prefix}`); }
    return output.slice(prefix.length);
}

/** The pack rules for one Yomitan rule, or null when its source has no known shape. */
function mapRule(rule, conditionsIn, conditionsOut) {
    const source = rule.isInflected.source;
    const base = {conditionsIn, conditionsOut};
    let m = ALTERNATING.exec(source);
    if (m) {
        const ending = m[1];
        const deinflected = after(call(rule, 'стол' + ending), 'стіл', source);
        return [{type: 'suffix', inflected: ending, deinflected, ...base,
            stemChange: {from: ['о', 'е'], to: 'і', occurrence: 'last', between: '{consonant}'}}];
    }
    m = FLEETING.exec(source);
    if (m) {
        const ending = m[1];
        const output = call(rule, 'дн' + ending);
        const vowel = output[1];
        if (output[0] !== 'д' || output[2] !== 'н' || !'ео'.includes(vowel)) { throw new Error(`${source}: unexpected ${output}`); }
        const deinflected = output.slice(3);
        return [{type: 'circumfix', prefixes: [['', '']], suffixes: [...CONSONANTS].map((x) => [x + ending, vowel + x + deinflected]),
            ...base, stemMinLength: 1, stemEndsWith: '{consonant}'}];
    }
    m = PALATAL.exec(source);
    if (m) {
        const [, soft, ending] = m;
        const rules = [];
        for (const vowel of ['о', 'е']) {
            const output = call(rule, 'р' + vowel + soft + ending);
            rules.push({type: 'suffix', inflected: vowel + soft + ending, deinflected: after(output, 'р', source), ...base, stemMinLength: 1});
        }
        return rules;
    }
    if (ZERO.test(source)) {
        const deinflected = after(call(rule, 'книг'), 'книг', source);
        return [{type: 'suffix', inflected: '', deinflected, ...base, stemContains: '{vowel}', stemEndsWith: '{consonant}'}];
    }
    return null;
}

let mapped = 0;
for (const transform of port.transforms) {
    const theirs = descriptor.transforms[transform.id];
    if (!theirs) { throw new Error(`Yomitan has no transform ${transform.id}`); }
    let next = 0;
    const rules = [];
    for (const rule of transform.rules) {
        if (rule.type !== 'todo') { rules.push(rule); continue; }
        while (next < theirs.rules.length && theirs.rules[next].isInflected.source !== rule.isInflected) { ++next; }
        if (next === theirs.rules.length) { throw new Error(`${transform.id}: no Yomitan rule ${rule.isInflected}`); }
        const pack = mapRule(theirs.rules[next], rule.conditionsIn, rule.conditionsOut);
        if (pack === null) { throw new Error(`${transform.id}: unmapped ${rule.isInflected}`); }
        rules.push(...pack);
        ++next;
        ++mapped;
    }
    transform.rules = rules;
}
if (mapped !== 64) { throw new Error(`mapped ${mapped} todo rules, expected 64`); }

function compact(rules) {
    const groups = new Map();
    const out = [];
    for (const rule of rules) {
        if (rule.type === 'wholeWord') {
            // A whole word is the empty-prefix cross product whose stem is
            // empty (stemCharacters []): the same rule, one pair in a list.
            const {type: _type, inflected, deinflected, ...rest} = rule;
            const key = JSON.stringify(['wholeWord', Object.keys(rest).sort().map((k) => [k, rest[k]])]);
            if (!groups.has(key)) {
                const group = {type: 'circumfix', prefixes: [['', '']], suffixes: [], ...rest, stemCharacters: '[]'};
                groups.set(key, group);
                out.push(group);
            }
            groups.get(key).suffixes.push([inflected, deinflected]);
            continue;
        }
        if (rule.type !== 'suffix' || rule.inflected === '') { out.push(rule); continue; }
        const {type: _type, inflected, deinflected, ...rest} = rule;
        const key = JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
        if (!groups.has(key)) {
            const group = {type: 'circumfix', prefixes: [['', '']], suffixes: [], ...rest};
            groups.set(key, group);
            out.push(group);
        }
        groups.get(key).suffixes.push([inflected, deinflected]);
    }
    return out.map((rule) => {
        if (rule.type === 'circumfix' && rule.stemCharacters === '[]' && rule.suffixes?.length === 1 && rule.prefixes?.length === 1 && rule.prefixes[0][0] === '') {
            const {type: _t, prefixes: _p, suffixes: [[inflected, deinflected]], stemCharacters: _s, ...rest} = rule;
            return {type: 'wholeWord', inflected, deinflected, ...rest};
        }
        if (rule.type !== 'circumfix' || rule.suffixes === undefined || rule.suffixes.length > 1 || rule.prefixes[0][0] !== '') { return rule; }
        const {type: _type, prefixes: _prefixes, suffixes: [[inflected, deinflected]], ...rest} = rule;
        return {type: 'suffix', inflected, deinflected, ...rest};
    });
}
for (const transform of port.transforms) { transform.rules = compact(transform.rules); }

writeFileSync(file, formatTransforms(port));
console.error(`${file}: mapped ${mapped} todo rules`);
