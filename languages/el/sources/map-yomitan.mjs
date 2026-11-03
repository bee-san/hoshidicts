#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the one todo rule of a fresh port of Yomitan's Modern Greek rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> el --force
//   node languages/el/sources/map-yomitan.mjs <yomitan>
//
// Yomitan's `ξανα-` transform (ext/js/language/el/modern-greek-transforms.js
// at d3c54c1) has five literal prefix rules, which the port tool converts,
// and one rule of type `other`:
//
//   isInflected: /^ξανα/,
//   deinflect: (term) => term.replace(/^ξανα/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
//
// It becomes a `prefix` rule with the same affix and `then` steps that strip
// every combining mark of U+0300-U+036F, as section 8.3 gives it:
// `[{"normalize": "NFD"}, {"strip": "[\\u0300-\\u036F]"}, {"normalize": "NFC"}]`.
// Yomitan returns the stripped text in NFD; once the marks are gone, NFD and
// NFC differ only for characters a Greek text does not contain, and the
// differential check (tools/check-yomitan.mjs) compares the two.
//
// The mapped rule is checked against Yomitan's own deinflect function on
// probe texts before the file is written.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/el/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'el');

const STRIP_ACCENTS = [{normalize: 'NFD'}, {strip: '[\\u0300-\\u036F]'}, {normalize: 'NFC'}];

/** What the pack rule gives for a text, or null when it does not apply. */
function packRule(text) {
    if (!text.startsWith('ξανα')) { return null; }
    return text.slice('ξανα'.length).normalize('NFD').replace(/[\u0300-\u036F]/gu, '').normalize('NFC');
}

const probes = ['ξαναπάς', 'ξαναλές', 'ξαναφάς', 'ξαναδεί', 'ξαναρώτησε', 'ξαναΐδρυσε', 'ξανα', 'ξανάπα', 'ξαναῤῥίπτω', 'αξανα'];
let mapped = 0;
for (const transform of port.transforms) {
    const theirs = descriptor.transforms[transform.id];
    transform.rules = transform.rules.map((rule, index) => {
        if (rule.type !== 'todo') { return rule; }
        const original = theirs.rules[index];
        if (rule.isInflected !== '^ξανα' || String(original.isInflected) !== '/^ξανα/') {
            throw new Error(`unexpected todo rule ${transform.id}[${index}]: ${rule.isInflected}`);
        }
        for (const probe of probes) {
            original.isInflected.lastIndex = 0;
            const applies = original.isInflected.test(probe);
            const expected = applies ? original.deinflect(probe).normalize('NFC') : null;
            const actual = packRule(probe);
            if (expected !== actual) { throw new Error(`${transform.id}[${index}] on ${probe}: Yomitan ${expected}, pack ${actual}`); }
        }
        mapped += 1;
        return {type: 'prefix', inflected: 'ξανα', deinflected: '', conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut, then: STRIP_ACCENTS};
    });
}
if (mapped !== 1) { throw new Error(`expected one todo rule, mapped ${mapped}`); }
writeFileSync(file, formatTransforms(port));
console.log(`sources/yomitan.json: mapped ${mapped} todo rule`);
