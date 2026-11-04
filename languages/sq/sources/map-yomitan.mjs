#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the 6 todo rules of a fresh port of Yomitan's Albanian rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> sq --force
//   node languages/sq/sources/map-yomitan.mjs <yomitan>
//
// The six are Yomitan's `conjugationIISuffixInflection(E, '', [], ['v'])`
// aorist rules for consonant stems (hapa, hape, hapi, hapëm, hapët, hapën):
// `isInflected: /.*[^j]E$/` with suffixInflection's deinflect, which removes
// E. Each becomes `{"type": "suffix", "inflected": E, "deinflected": "",
// "stemNotEndsWith": "[j]", "stemMinLength": 1}`: the regular expression
// needs one character before E that is not j, and the stem is the text
// before E.
//
// Every mapped rule is checked against Yomitan's own deinflect function on
// probe texts before the file is written.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/sq/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'sq');

const probes = ['hap', 'lidh', 'prek', 'shkruaj', 'mbaj', 'a', 'ja', 'j', 'punoj', 'shtëpi', 'zë', 'gj', 'aj', 'qesh'];
let mapped = 0;
let checked = 0;
for (const t of port.transforms) {
    const source = descriptor.transforms[t.id];
    t.rules = t.rules.map((rule, index) => {
        if (rule.type !== 'todo') { return rule; }
        const match = /^\.\*\[\^j\](.+)\$$/u.exec(rule.isInflected);
        if (match === null) { throw new Error(`${t.id}: unexpected todo ${rule.isInflected}`); }
        const ending = match[1];
        const yomitanRule = source.rules[index];
        if (String(yomitanRule.isInflected) !== `/${rule.isInflected}/`) {
            throw new Error(`${t.id}: rule ${index} is ${yomitanRule.isInflected}, not /${rule.isInflected}/`);
        }
        const out = {type: 'suffix', inflected: ending, deinflected: '', conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut, stemNotEndsWith: '[j]', stemMinLength: 1};
        // The pack rule applies exactly where Yomitan's does and gives the same text.
        for (const stem of probes) {
            const text = stem + ending;
            yomitanRule.isInflected.lastIndex = 0;
            const theirs = yomitanRule.isInflected.test(text) ? yomitanRule.deinflect(text) : null;
            const last = [...stem].at(-1);
            const ours = stem.length >= 1 && last !== 'j' ? stem : null;
            if (theirs !== ours) { throw new Error(`${t.id}: ${text} gives ${theirs} in Yomitan and ${ours} in the pack rule`); }
            ++checked;
        }
        ++mapped;
        return out;
    });
}
if (mapped !== 6) { throw new Error(`mapped ${mapped} todo rules, expected 6`); }
writeFileSync(file, formatTransforms(port));
const rules = port.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`Mapped ${mapped} todo rules into ${file}: ${port.transforms.length} transforms, ${rules} rules; ${checked} probe texts agree with Yomitan`);
