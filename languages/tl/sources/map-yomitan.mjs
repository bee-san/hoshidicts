#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the 500 todo rules of a fresh port of Yomitan's Tagalog rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> tl --force
//   node languages/tl/sources/map-yomitan.mjs <yomitan>
//
// It reads sources/yomitan.json as the port tool wrote it and replaces each
// todo rule in place. The constructs are the helpers of Yomitan's
// ext/js/language/tl/tagalog-transforms.js:
//
// - hyphenatedInflection: `/-/`, the first hyphen removed. A `replace` rule
//   with occurrence "first".
// - suffixInflectionWithOtoUSoundChange(S, D): `u([C]+)S$` → `o$1D`. A
//   `suffix` rule S → D with a stem change u → o at the last u that only
//   consonants follow (`between` the consonants of Yomitan's CONSONANTS).
// - prefixInflectionWithRep1(P, D, consonants): `^(P)([cons]*[aeiou])(\2)`
//   → `D$2`. A `pattern` rule `^P([cons]*[aeiou])\1` → `D$1`, anchored on P.
// - sandwichInflection(P, DP, S, DS): `^P\w+S$`, the text between the two
//   kept. A `circumfix` rule with `stemCharacters` `[A-Za-z0-9_]` (what
//   `\w` matches) and `stemMinLength` 1.
// - sandwichInflectionWithOtoUSoundChange(P, DP, S, DS):
//   `^P(\w+)u([C]+)S$` → `DP$1o$2DS`. The same circumfix with the stem
//   change above and `stemMinLength` 3. Yomitan's `(\w+)` also needs a
//   letter before the u, which a stem change cannot ask for, so the port
//   also changes a u that starts a stem of a u and consonants (kaubkan);
//   sources/yomitan-differences.tsv lists it.
//
// The deinflected parts of the sandwich rules are not in their regular
// expressions, so they are read from Yomitan's own deinflect function on a
// probe text. Every mapped rule is then checked against Yomitan's functions
// on probe texts before the file is written.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/tl/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'tl');
const yomitanTransforms = Object.values(descriptor.transforms);

const CONSONANTS = 'bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ';
const CONSONANT_CLASS = `[${CONSONANTS}]`;
const WORD = '[A-Za-z0-9_]';
const escape = (text) => text.replace(/[\\^$.*+?()[\]{}|/-]/g, (c) => `\\${c}`);
const OTO_U = {from: ['u'], to: 'o', occurrence: 'last', between: CONSONANT_CLASS, betweenMinLength: 1};

const HYPHEN = '-';
const SUFFIX_OTO_U = new RegExp(`^u\\(\\[${CONSONANTS}\\]\\+\\)([a-z]+)\\$$`);
const REP1 = new RegExp('^\\^\\(([a-z]+)\\)\\(\\[([A-Za-z]+)\\]\\*\\[aeiou\\]\\)\\(\\\\2\\)$');
const SANDWICH = /^\^([a-z]+)\\w\+([a-z]+)\$$/;
const SANDWICH_OTO_U = new RegExp(`^\\^([a-z]+)\\(\\\\w\\+\\)u\\(\\[${CONSONANTS}\\]\\+\\)([a-z]+)\\$$`);

/** The deinflected prefix and suffix of a sandwich rule, from Yomitan's function. */
function sandwichParts(original, prefix, suffix, middle) {
    const probe = `${prefix}${middle}${suffix}`;
    const out = original.deinflect(probe);
    const at = out.indexOf(middle);
    if (at < 0 || out.indexOf(middle, at + 1) >= 0) { throw new Error(`cannot read the parts of ${original.isInflected} from ${probe} -> ${out}`); }
    return [out.slice(0, at), out.slice(at + middle.length)];
}

let mapped = 0;
const made = [];
port.transforms.forEach((transform, t) => {
    const rules = yomitanTransforms[t].rules;
    if (rules.length !== transform.rules.length) { throw new Error(`${transform.id}: ${rules.length} Yomitan rules, ${transform.rules.length} ported`); }
    transform.rules = transform.rules.map((rule, r) => {
        if (rule.type !== 'todo') { return rule; }
        ++mapped;
        const original = rules[r];
        const io = {conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut};
        const source = rule.isInflected;
        let pack;
        let match;
        if (source === HYPHEN) {
            pack = {type: 'replace', inflected: '-', deinflected: '', occurrence: 'first', ...io};
        } else if ((match = SUFFIX_OTO_U.exec(source)) !== null) {
            const [, inflected] = match;
            const out = original.deinflect(`kXub${inflected}`);
            if (!out.startsWith('kXob')) { throw new Error(`${transform.id}[${r}]: unexpected ${out}`); }
            pack = {type: 'suffix', inflected, deinflected: out.slice(4), ...io, stemChange: OTO_U};
        } else if ((match = REP1.exec(source)) !== null) {
            const [, inflected, consonants] = match;
            const c = consonants[0];
            const probe = `${inflected}${c}u${c}uX`;
            original.isInflected.lastIndex = 0;
            const out = original.deinflect(probe);
            if (!original.isInflected.test(probe) || !out.endsWith(`${c}uX`)) { throw new Error(`${transform.id}[${r}]: unexpected ${out}`); }
            const deinflected = out.slice(0, -3);
            pack = {
                type: 'pattern', anchorPrefix: inflected,
                pattern: `^${escape(inflected)}([${consonants}]*[aeiou])\\1`, replacement: `${deinflected}$1`, ...io,
            };
        } else if ((match = SANDWICH_OTO_U.exec(source)) !== null) {
            const [, prefix, suffix] = match;
            const out = original.deinflect(`${prefix}XYub${suffix}`);
            const at = out.indexOf('XYob');
            if (at < 0) { throw new Error(`${transform.id}[${r}]: unexpected ${out}`); }
            pack = {
                type: 'circumfix', inflectedPrefix: prefix, deinflectedPrefix: out.slice(0, at),
                inflectedSuffix: suffix, deinflectedSuffix: out.slice(at + 4), ...io,
                stemMinLength: 3, stemCharacters: WORD, stemChange: OTO_U,
            };
        } else if ((match = SANDWICH.exec(source)) !== null) {
            const [, prefix, suffix] = match;
            const [deinflectedPrefix, deinflectedSuffix] = sandwichParts(original, prefix, suffix, 'XQZ');
            pack = {
                type: 'circumfix', inflectedPrefix: prefix, deinflectedPrefix, inflectedSuffix: suffix, deinflectedSuffix,
                ...io, stemMinLength: 1, stemCharacters: WORD,
            };
        } else {
            throw new Error(`${transform.id}[${r}]: no mapping for ${source}`);
        }
        made.push({transform: transform.id, original, pack});
        return pack;
    });
});
if (mapped !== 500) { throw new Error(`mapped ${mapped} todo rules, expected 500`); }

// What a mapped rule gives for a text, or null where it does not apply.
const VOWEL_RE = /[aeiou]/;
function changeStem(stem) {
    for (let i = stem.length - 1; i >= 0; --i) {
        if (stem[i] === 'u') {
            const rest = stem.slice(i + 1);
            return rest.length >= 1 && [...rest].every((c) => CONSONANTS.includes(c)) ? stem.slice(0, i) + 'o' + rest : null;
        }
        if (!CONSONANTS.includes(stem[i])) { return null; }
    }
    return null;
}
function apply(rule, text) {
    switch (rule.type) {
        case 'replace': {
            const i = text.indexOf(rule.inflected);
            return i < 0 ? null : text.slice(0, i) + rule.deinflected + text.slice(i + rule.inflected.length);
        }
        case 'suffix': {
            if (!text.endsWith(rule.inflected)) { return null; }
            const stem = changeStem(text.slice(0, text.length - rule.inflected.length));
            return stem === null ? null : stem + rule.deinflected;
        }
        case 'pattern': {
            if (!text.startsWith(rule.anchorPrefix)) { return null; }
            const re = new RegExp(rule.pattern);
            return re.test(text) ? text.replace(re, rule.replacement) : null;
        }
        case 'circumfix': {
            const p = rule.inflectedPrefix;
            const s = rule.inflectedSuffix;
            if (text.length < p.length + s.length + rule.stemMinLength || !text.startsWith(p) || !text.endsWith(s)) { return null; }
            let stem = text.slice(p.length, text.length - s.length);
            if (![...stem].every((c) => /[A-Za-z0-9_]/.test(c))) { return null; }
            if (rule.stemChange !== undefined) {
                stem = changeStem(stem);
                if (stem === null) { return null; }
            }
            return rule.deinflectedPrefix + stem + rule.deinflectedSuffix;
        }
    }
    throw new Error(`unexpected rule type ${rule.type}`);
}

// Probe texts: each rule's affixes around stems with and without a u before
// consonants, uppercase consonants, a hyphen and a space.
const MIDDLES = ['a', 'b', 'kain', 'bili', 'sulat', 'inom', 'utos', 'xubk', 'aub', 'tubg', 'Bub', 'ab-c', 'a b', 'bab', 'kaka', 'dad', 'ubos', 'bubulong', 'AbubK', '9u_b'];
let checked = 0;
let differences = 0;
for (const {transform, original, pack} of made) {
    const texts = new Set();
    const p = pack.inflectedPrefix ?? pack.anchorPrefix ?? '';
    const s = pack.inflectedSuffix ?? pack.inflected ?? '';
    for (const m of MIDDLES) {
        texts.add(p + m + s);
        texts.add(p + m + m + s);
        texts.add(m + s);
        texts.add(p + m);
    }
    for (const text of texts) {
        original.isInflected.lastIndex = 0;
        const theirs = original.isInflected.test(text) ? original.deinflect(text) : null;
        const ours = apply(pack, text);
        if (theirs === ours) {
            ++checked;
            continue;
        }
        // The one known difference: a u that starts the stem of a sandwich
        // with the u -> o change.
        const stem = pack.type === 'circumfix' ? text.slice(p.length, text.length - s.length) : '';
        if (pack.type === 'circumfix' && pack.stemChange !== undefined && theirs === null && stem.startsWith('u') && ![...stem.slice(1)].some((c) => VOWEL_RE.test(c))) {
            ++differences;
            continue;
        }
        throw new Error(`${transform}: ${text} gives ${theirs} in Yomitan, ${ours} with ${JSON.stringify(pack)}`);
    }
}

writeFileSync(file, formatTransforms(port));
const total = port.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`Mapped ${mapped} todo rules into ${file}: ${port.transforms.length} transforms, ${total} rules; ${checked} probe texts agree with Yomitan, ${differences} are the listed u-at-the-start difference`);
