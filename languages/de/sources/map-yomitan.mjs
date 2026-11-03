#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the 70 todo rules of a fresh port of Yomitan's German rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> de --force
//   node languages/de/sources/map-yomitan.mjs <yomitan>
//
// It reads sources/yomitan.json as the port tool wrote it and replaces each
// todo rule in place:
//
// - The two regular participle rules `^ge([L]+)t$` → `$1n`, `$1en` (L is
//   Yomitan's germanLetters, a-zA-ZäöüßÄÖÜẞ) become `circumfix` rules: ge-
//   and -t replaced by "" and the rule's ending, the stem one or more
//   letters of L.
// - The two participle rules of separable verbs `^(ab|an|…)ge([L]+)t$` →
//   `$1$2n`, `$1$2en` become one cross-product `circumfix` each, over the
//   66 prefixes followed by ge-. No text matches two of them: a prefix that
//   starts with another one does not continue with ge (auseinander,
//   dabei, daran, herab, …).
// - The 66 separated-prefix rules `^([L]+) .+ P$` → `$1 P` become `pattern`
//   rules anchored on " P" at the end of the text, with the same regular
//   expression.
//
// Every mapped rule is checked against Yomitan's own deinflect function on
// probe texts before the file is written.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/de/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'de');
const yomitanTransforms = Object.values(descriptor.transforms);

const LETTERS = 'a-zA-ZäöüßÄÖÜẞ';
// The same letters as a class and in a pattern, with escapes for the
// letters outside ASCII.
const ESCAPED = 'a-zA-Z\\u00E4\\u00F6\\u00FC\\u00DF\\u00C4\\u00D6\\u00DC\\u1E9E';
const CLASS = `[${ESCAPED}]`;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BASIC = `^ge([${LETTERS}]+)t$`;
const SEPARABLE = /^\^\(([a-zäöü|]+)\)ge\(\[a-zA-ZäöüßÄÖÜẞ\]\+\)t\$$/u;
const SEPARATED = /^\^\(\[a-zA-ZäöüßÄÖÜẞ\]\+\) \.\+ ([a-zäöü]+)\$$/u;

/** The ending Yomitan's participle function writes for the stem "mach". */
function ending(original, text, stem) {
    const result = original.deinflect(text);
    if (!result.startsWith(stem)) { throw new Error(`unexpected output ${result} for ${text}`); }
    return result.slice(stem.length);
}

let mapped = 0;
const made = [];
port.transforms.forEach((transform, t) => {
    const rules = yomitanTransforms[t].rules;
    const out = [];
    transform.rules.forEach((rule, r) => {
        if (rule.type !== 'todo') {
            out.push(rule);
            return;
        }
        ++mapped;
        const original = rules[r];
        const {conditionsIn, conditionsOut} = rule;
        let pack;
        if (rule.isInflected === BASIC) {
            const end = ending(original, 'gemacht', 'mach');
            pack = {type: 'circumfix', inflectedPrefix: 'ge', deinflectedPrefix: '', inflectedSuffix: 't', deinflectedSuffix: end,
                conditionsIn, conditionsOut, stemMinLength: 1, stemCharacters: CLASS};
        } else if (SEPARABLE.test(rule.isInflected)) {
            const prefixes = SEPARABLE.exec(rule.isInflected)[1].split('|');
            const end = ending(original, 'abgemacht', 'abmach');
            pack = {type: 'circumfix', prefixes: prefixes.map((p) => [`${p}ge`, p]), suffixes: [['t', end]],
                conditionsIn, conditionsOut, stemMinLength: 1, stemCharacters: CLASS};
        } else if (SEPARATED.test(rule.isInflected)) {
            const particle = SEPARATED.exec(rule.isInflected)[1];
            const probe = original.deinflect(`räum den Tisch ${particle}`);
            if (probe !== `räum ${particle}`) { throw new Error(`${transform.id}[${r}]: unexpected output ${probe}`); }
            pack = {type: 'pattern', pattern: `^([${ESCAPED}]+) .+ ${escapeRegex(particle)}$`, replacement: `$1 ${particle}`,
                anchorSuffix: ` ${particle}`, conditionsIn, conditionsOut};
        } else {
            throw new Error(`${transform.id}[${r}]: no mapping for ${rule.isInflected}`);
        }
        out.push(pack);
        made.push({transform: transform.id, original, pack});
    });
    transform.rules = out;
});
if (mapped !== 70) { throw new Error(`mapped ${mapped} todo rules, expected 70`); }

// What a mapped rule gives for a text, or null when it does not apply.
const LETTER = new RegExp(`^[${LETTERS}]+$`, 'u');
function apply(rule, text) {
    if (rule.type === 'pattern') {
        if (!text.endsWith(rule.anchorSuffix)) { return null; }
        const pattern = new RegExp(rule.pattern.replace(/\\u([0-9A-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16))));
        return pattern.test(text) ? text.replace(pattern, rule.replacement) : null;
    }
    const pairs = rule.prefixes ?? [[rule.inflectedPrefix, rule.deinflectedPrefix]];
    const suffixes = rule.suffixes ?? [[rule.inflectedSuffix, rule.deinflectedSuffix]];
    const outs = [];
    for (const [ip, dp] of pairs) {
        for (const [is, ds] of suffixes) {
            if (!text.startsWith(ip) || !text.endsWith(is) || text.length < ip.length + is.length + 1) { continue; }
            const stem = text.slice(ip.length, text.length - is.length);
            if (LETTER.test(stem)) { outs.push(dp + stem + ds); }
        }
    }
    if (outs.length > 1) { throw new Error(`${text} matches ${outs.length} parts of one cross product`); }
    return outs[0] ?? null;
}
const probes = new Set();
for (const stem of ['mach', 'stell', 'Haus', 'äß', 'ßẞ', 'e', 'ge', 'gt', 'tt']) {
    for (const prefix of ['', 'ge', 'abge', 'ange', 'auseinanderge', 'darge', 'darange', 'dazwischenge', 'gegenüberge', 'hinterherge', 'zurückge', 'ab', 'aus']) {
        probes.add(`${prefix}${stem}t`);
        probes.add(`${prefix}${stem}`);
    }
}
for (const verb of ['räum', 'Kommt', 'ging', 'x']) {
    for (const middle of [' den Tisch', ' a', ' 1 2', '', ' ab']) {
        for (const particle of ['ab', 'an', 'auf', 'auseinander', 'dar', 'daran', 'zurück', 'xyz']) {
            probes.add(`${verb}${middle} ${particle}`);
            probes.add(`${verb}${middle} ${particle}.`);
        }
    }
}
let checked = 0;
for (const {transform, original, pack} of made) {
    for (const text of probes) {
        if (original.isInflected.global) { original.isInflected.lastIndex = 0; }
        const theirs = original.isInflected.test(text) ? original.deinflect(text) : null;
        const ours = apply(pack, text);
        if (theirs !== ours) { throw new Error(`${transform}: ${text} gives ${theirs} in Yomitan, ${ours} with ${JSON.stringify(pack).slice(0, 120)}`); }
        ++checked;
    }
}

writeFileSync(file, formatTransforms(port));
const rules = port.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`Mapped ${mapped} todo rules into ${file}: ${port.transforms.length} transforms, ${rules} rules; ${checked} probe texts agree with Yomitan`);
