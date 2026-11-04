#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the 60 todo rules of a fresh port of Yomitan's Yiddish rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> yi --force
//   node languages/yi/sources/map-yomitan.mjs <yomitan>
//
// The todo rules are Yomitan's `umlautMutationSuffixInflection` rules (in
// `umlaut_plural` and `diminutive_and_umlaut`): for a text ending in the
// suffix, the last letter of the stem that is one of Yomitan's vowel letters
// (ע װ א אַ ױ ו ײ יִ ײַ י אָ, the presentation forms included) must be the
// mutation's `new` letter, which is replaced by its `orig` letter, and the
// suffix is removed. Otherwise the rule returns '' (a Yomitan defect the
// engine does not reproduce; section 7.4 drops empty outputs). Each becomes a
// `suffix` rule with `stemChange: {from: [new], to: orig, occurrence: "last",
// between: <not a vowel letter>, betweenMinLength: 0}`.
//
// The mutation of each rule is read from Yomitan's own deinflect function by
// probing it with every vowel letter, and every mapped rule is checked
// against that function on probe texts before the file is written.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/yi/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'yi');

// Yomitan's vowel letters, in the order of its regular expression.
const VOWELS = ['\u05E2', '\u05F0', '\u05D0', '\uFB2E', '\u05F1', '\u05D5', '\u05F2', '\uFB1D', '\uFB1F', '\u05D9', '\uFB2F'];
const hex = (c) => '\\u' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const NOT_VOWEL = `[^${VOWELS.map(hex).join('')}]`;
const SUFFIX = /^([\u05D0-\u05EA]+)\$$/;

/** The mutation of an umlaut rule: the one vowel for which it returns a text. */
function mutation(rule, suffix) {
    const found = [];
    for (const vowel of VOWELS) {
        const result = rule.deinflect('ק' + vowel + 'ד' + suffix);
        if (result !== '') { found.push({from: vowel, to: [...result][1]}); }
    }
    if (found.length !== 1) { throw new Error(`expected one mutation for ${suffix}, found ${found.length}`); }
    return found[0];
}

/** The pack rule's deinflection, as section 7.3 defines it, for the probe check. */
function packDeinflect(rule, text) {
    if (!text.endsWith(rule.inflected)) { return null; }
    const stem = text.slice(0, text.length - rule.inflected.length);
    const {from: [from], to} = rule.stemChange;
    for (let i = stem.length - 1; i >= 0; --i) {
        if (VOWELS.includes(stem[i])) {
            return stem[i] === from ? stem.slice(0, i) + to + stem.slice(i + 1) + rule.deinflected : null;
        }
    }
    return null;
}

const probeStems = [];
for (const a of ['', 'ש', 'ט' + '\u05B7']) {
    for (const v of VOWELS) {
        for (const b of ['', 'נ', 'רק', 'ן']) {
            for (const w of ['', ...VOWELS.slice(0, 3)]) { probeStems.push(a + v + b + w); }
        }
    }
}

let mapped = 0;
let checked = 0;
for (const transform of port.transforms) {
    const theirs = descriptor.transforms[transform.id];
    transform.rules = transform.rules.map((rule, index) => {
        if (rule.type !== 'todo') { return rule; }
        const original = theirs.rules[index];
        const suffix = SUFFIX.exec(rule.isInflected)?.[1];
        if (suffix === undefined || original.deinflected !== '') { throw new Error(`${transform.id}[${index}]: unexpected rule ${rule.isInflected}`); }
        const {from, to} = mutation(original, suffix);
        const out = {type: 'suffix', inflected: suffix, deinflected: '', conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut,
            stemChange: {from: [from], to, occurrence: 'last', between: NOT_VOWEL, betweenMinLength: 0}};
        for (const stem of probeStems) {
            const text = stem + suffix;
            const yomitan = original.isInflected.test(text) ? original.deinflect(text) : null;
            const pack = packDeinflect(out, text);
            if ((yomitan === '' ? null : yomitan) !== pack) {
                throw new Error(`${transform.id}[${index}] on ${text}: Yomitan ${yomitan}, pack ${pack}`);
            }
            ++checked;
        }
        ++mapped;
        return out;
    });
}
writeFileSync(file, formatTransforms(port));
const rules = port.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`Mapped ${mapped} todo rules into ${file}: ${port.transforms.length} transforms, ${rules} rules; ${checked} probe texts agree with Yomitan`);
