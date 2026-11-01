#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the todo rules of a fresh port of Yomitan's Arabic rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> ar --out /tmp/ar-port.json
//   node languages/ar/sources/map-yomitan.mjs <yomitan> /tmp/ar-port.json
//
// - conditionalPrefixInflection `^P(?!X)` becomes a prefix with
//   stemNotStartsWith [X]; conditionalSuffixInflection `(?<!X)S$` a suffix
//   with stemNotEndsWith [X] (50 rules).
// - sandwichInflection `^P[arabicLetters]+S$` (optionally `(?<!X)` before
//   S) becomes a circumfix with stemCharacters {letter} (Yomitan's
//   arabicLetters), stemMinLength 1 and stemNotEndsWith [X]; the 6,570 such
//   rules are written as cross-product rows, one per set of prefixes that
//   share their suffixes within a transform.
// The deinflected parts are read by calling each Yomitan rule. The script
// checks that the rows expand to exactly the rules they replace.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root, portFile] = process.argv.slice(2);
if (root === undefined || portFile === undefined) {
    console.error('usage: node languages/ar/sources/map-yomitan.mjs <yomitan checkout> <fresh port.json>');
    process.exit(2);
}
const LETTERS = '[\u0620-\u065F\u066E-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FC\u06FF]';
const STEM = 'كتب';
const escape = (cp) => `[\\u${cp.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}]`;

const port = JSON.parse(readFileSync(portFile, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'ar');
const yomitanTransforms = Object.values(descriptor.transforms);

function parts(rule, text) {
    const out = rule.deinflect(text);
    const at = out.indexOf(STEM);
    if (at < 0 || out.indexOf(STEM, at + 1) >= 0) { throw new Error(`cannot read the deinflected parts of ${rule.isInflected.source} from ${out}`); }
    return [out.slice(0, at), out.slice(at + STEM.length)];
}

let conditional = 0;
let sandwiches = 0;
let rows = 0;
port.transforms.forEach((transform, t) => {
    const yomitanRules = yomitanTransforms[t].rules;
    const kept = [];
    const groups = new Map();
    transform.rules.forEach((rule, r) => {
        if (rule.type !== 'todo') {
            kept.push(rule);
            return;
        }
        const source = rule.isInflected;
        const {conditionsIn, conditionsOut} = rule;
        let m = /^\^([^\\[(]+)\(\?!(.)\)$/u.exec(source);
        if (m !== null) {
            const [dP] = parts(yomitanRules[r], m[1] + STEM);
            kept.push({type: 'prefix', inflected: m[1], deinflected: dP, conditionsIn, conditionsOut, stemNotStartsWith: escape(m[2])});
            ++conditional;
            return;
        }
        m = /^\(\?<!(.)\)([^\\[(]+)\$$/u.exec(source);
        if (m !== null) {
            const [, dS] = parts(yomitanRules[r], STEM + m[2]);
            kept.push({type: 'suffix', inflected: m[2], deinflected: dS, conditionsIn, conditionsOut, stemNotEndsWith: escape(m[1])});
            ++conditional;
            return;
        }
        m = /^\^([^\\[(]+)(\[[^\]]+\])\+(?:\(\?<!(.)\))?([^\\[(]+)\$$/u.exec(source);
        if (m === null || m[2] !== LETTERS) { throw new Error(`${transform.id}[${r}]: no mapping for ${source}`); }
        const [, p, , not, s] = m;
        const [dP, dS] = parts(yomitanRules[r], p + STEM + s);
        const key = JSON.stringify([conditionsIn, conditionsOut, not ?? null]);
        if (!groups.has(key)) { groups.set(key, {conditionsIn, conditionsOut, not, prefixes: new Map()}); }
        const prefix = JSON.stringify([p, dP]);
        const group = groups.get(key);
        if (!group.prefixes.has(prefix)) { group.prefixes.set(prefix, []); }
        group.prefixes.get(prefix).push([s, dS]);
        ++sandwiches;
    });
    const expected = transform.rules.filter((rule) => rule.type === 'todo').length - kept.filter((rule) => rule.stemNotStartsWith || rule.stemNotEndsWith).length;
    let expanded = 0;
    for (const {conditionsIn, conditionsOut, not, prefixes} of groups.values()) {
        const bySuffixes = new Map();
        for (const [prefix, suffixes] of prefixes) {
            const signature = JSON.stringify(suffixes);
            if (!bySuffixes.has(signature)) { bySuffixes.set(signature, {prefixes: [], suffixes}); }
            bySuffixes.get(signature).prefixes.push(JSON.parse(prefix));
        }
        for (const {prefixes: ps, suffixes} of bySuffixes.values()) {
            const row = {type: 'circumfix', prefixes: ps, suffixes, conditionsIn, conditionsOut, stemCharacters: '{letter}', stemMinLength: 1};
            if (not !== undefined) { row.stemNotEndsWith = escape(not); }
            kept.push(row);
            expanded += ps.length * suffixes.length;
            ++rows;
        }
    }
    if (expanded !== expected) { throw new Error(`${transform.id}: the rows expand to ${expanded} rules, not ${expected}`); }
    transform.rules = kept;
});

const out = {schema: port.schema, conditions: port.conditions, transforms: port.transforms};
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
writeFileSync(file, formatTransforms(out));
console.log(`Mapped ${conditional} conditional affixes and ${sandwiches} sandwich rules (as ${rows} cross-product rows) into ${file}`);
