#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the 27 todo rules of a fresh port of Yomitan's Spanish rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> es --force
//   node languages/es/sources/map-yomitan.mjs <yomitan>
//
// It reads sources/yomitan.json as the port tool wrote it and replaces each
// todo rule in place:
//
// - The 26 stem-change rules `X([a-z]*)(E1|E2|...)$` (X is ie, ue, i or u)
//   whose function is `term.replace(/X/, Y).replace(/(E1|E2|...)$/, D)`
//   become one `suffix` rule per ending: `inflected: E`, `deinflected: D`,
//   `stemChange: {from: [X], to: Y, occurrence: "first", between: "[a-z]",
//   betweenMinLength: 0}` (the [a-z]* between the change and the ending).
// - The -ar rules with a branch for texts that start with jue (jugar:
//   ue → u) and the -er rules with a branch for hue (oler: hue → o) become
//   the branch's rules with `stemStartsWithText` and the other rules with
//   `stemNotStartsWithText`. The jue branch of the imperative and the
//   present subjunctive replaces other endings than it tests
//   (`(a|ue|uen)$`, `(ue|ues|ue|uen)$`), so its rules have those endings;
//   for a jue text with another ending Yomitan returns the text with only
//   ue → u (juegen → jugen), which sources/yomitan-differences.tsv lists.
// - The reflexive rule `\b(me|te|se|nos|os)\s+(\w+)(ar|er|ir)\b` →
//   `$2$3se` becomes one `pattern` rule per pronoun, anchored on the
//   pronoun and a space at the start of the text. Yomitan's rule also
//   matches after other words (ya me levantar → ya levantarse) and after a
//   tab or several spaces; the differences file lists that.
//
// Every mapped rule is checked against Yomitan's own deinflect function on
// probe texts before the file is written.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/es/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'es');
const yomitanTransforms = Object.values(descriptor.transforms);

const STEM_CHANGE = /^(ie|ue|i|u)\(\[a-z\]\*\)\(([a-zó|]+)\)\$$/;
const REFLEXIVE = '\\b(me|te|se|nos|os)\\s+(\\w+)(ar|er|ir)\\b';
const CHANGE = {ie: 'e', ue: 'o', i: 'e', u: 'o'};
const between = {between: '[a-z]', betweenMinLength: 0};
const unique = (list) => [...new Set(list)];

/**
 * The pack rules for one Yomitan stem-change rule.
 * @param {string} from the vowel the rule changes (ie, ue, i, u)
 * @param {string[]} endings the endings its regular expression tests
 * @param {string} deinflected the infinitive ending it writes
 * @param {object} rule the todo rule (conditions)
 * @param {(term: string) => string} deinflect Yomitan's function
 */
function stemChangeRules(from, endings, deinflected, {conditionsIn, conditionsOut}, deinflect) {
    const make = (inflected, change, extra = {}) => ({
        type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...extra,
        stemChange: {from: [change.from], to: change.to, occurrence: 'first', ...between},
    });
    const plain = {from, to: CHANGE[from]};
    // A branch shows when a text that starts with jue or hue deinflects
    // otherwise than the plain change does.
    for (const [prefix, change] of [['jue', {from: 'ue', to: 'u'}], ['hue', {from: 'hue', to: 'o'}]]) {
        if (from !== 'ue') { continue; }
        const probe = `${prefix}g${endings[0]}`;
        if (deinflect(probe) === probe.replace(from, plain.to).slice(0, -endings[0].length) + deinflected) { continue; }
        // The branch's endings: those whose replacement leaves an infinitive.
        const branchEndings = unique([...endings, ...endings.map((e) => `u${e}`)]).filter((e) => {
            const text = `${prefix}g${e}`;
            return deinflect(text) === text.replace(change.from, change.to).slice(0, -e.length) + deinflected;
        }).filter((e) => endings.some((x) => e.endsWith(x)));
        return [
            ...branchEndings.map((e) => make(e, change, {stemStartsWithText: prefix})),
            ...endings.map((e) => make(e, plain, {stemNotStartsWithText: prefix})),
        ];
    }
    return endings.map((e) => make(e, plain));
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
        const match = STEM_CHANGE.exec(rule.isInflected);
        if (match !== null) {
            const [, from, list] = match;
            const endings = unique(list.split('|'));
            // The infinitive ending, read from Yomitan's function.
            const sample = `b${from}c${endings[0]}`;
            const result = original.deinflect(sample);
            const ending = /^b[a-z]c(ar|er|ir)$/.exec(result)?.[1];
            if (ending === undefined || result !== `b${CHANGE[from]}c${ending}`) { throw new Error(`${transform.id}[${r}]: unexpected output ${result} for ${sample}`); }
            const pack = stemChangeRules(from, endings, ending, rule, original.deinflect);
            out.push(...pack);
            made.push({transform: transform.id, original, pack});
            return;
        }
        if (rule.isInflected === REFLEXIVE) {
            for (const pronoun of ['me', 'te', 'se', 'nos', 'os']) {
                out.push({
                    type: 'pattern', anchorPrefix: `${pronoun} `,
                    pattern: `^${pronoun} +([A-Za-z0-9_]+)(ar|er|ir)(?![A-Za-z0-9_])`, replacement: '$1$2se',
                    conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut,
                });
            }
            return;
        }
        throw new Error(`${transform.id}[${r}]: no mapping for ${rule.isInflected}`);
    });
    transform.rules = out;
});
if (mapped !== 27) { throw new Error(`mapped ${mapped} todo rules, expected 27`); }

// Check every stem-change rule against Yomitan's function: for probe texts
// that the pack rule accepts, both give the same text; Yomitan's
// isInflected accepts every text a pack rule accepts.
const accepts = (rule, text) => {
    if (!text.endsWith(rule.inflected)) { return null; }
    const stem = text.slice(0, text.length - rule.inflected.length);
    if (rule.stemStartsWithText !== undefined && !stem.startsWith(rule.stemStartsWithText)) { return null; }
    if (rule.stemNotStartsWithText !== undefined && stem.startsWith(rule.stemNotStartsWithText)) { return null; }
    const {from: [from], to} = rule.stemChange;
    for (let i = stem.indexOf(from); i >= 0; i = stem.indexOf(from, i + 1)) {
        if (/^[a-z]*$/.test(stem.slice(i + from.length))) { return stem.slice(0, i) + to + stem.slice(i + from.length) + rule.deinflected; }
    }
    return null;
};
let checked = 0;
for (const {transform, original, pack} of made) {
    for (const prefix of ['', 'b', 'j', 'h', 'pr', 'jue', 'hue', 'ju', 'cuel']) {
        for (const middle of ['ie', 'ue', 'i', 'u', 'iec', 'uec', 'icg', 'ucl', 'iegu', 'uegu', 'uerd']) {
            for (const rule of pack) {
                const text = prefix + middle + rule.inflected;
                const ours = accepts(rule, text);
                if (ours === null) { continue; }
                original.isInflected.lastIndex = 0;
                if (!original.isInflected.test(text)) { throw new Error(`${transform}: Yomitan does not accept ${text}`); }
                const theirs = original.deinflect(text);
                if (theirs !== ours) { throw new Error(`${transform}: ${text} gives ${theirs} in Yomitan, ${ours} with ${JSON.stringify(rule)}`); }
                ++checked;
            }
        }
    }
}

writeFileSync(file, formatTransforms(port));
const rules = port.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`Mapped ${mapped} todo rules into ${file}: ${port.transforms.length} transforms, ${rules} rules; ${checked} probe texts agree with Yomitan`);
