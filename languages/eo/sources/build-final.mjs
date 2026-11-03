#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/eo/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5):
//
//   node languages/eo/sources/build-final.mjs [--out <file>]
//
// The final set is sources/own.json, in its order, followed by the Yomitan
// transforms in KEPT (with the stem constraints KEPT adds). Every other
// Yomitan rule is left out for the reason REMOVED gives; README.md (Rule
// provenance) has the measurements behind each.
//
// An own rule is marked `source: "both"` when a Yomitan rule makes the same
// deinflection: a suffix (or whole-word) rule replaces an ending P + I with
// P + D where Yomitan's replaces I with D (own `on` → `o` and Yomitan's `n` →
// ``), or a prefix rule removes the prefix Yomitan's removes, and the parts of
// speech they give are compatible (equal, overlapping or one of them empty).
// A transform takes the source its rules share, and `own` otherwise, with
// its `both` rules marked.
//
// It also sets the reasons column of tests/yomitan.tsv (Yomitan's Esperanto
// test, as tools/port-yomitan-tests.mjs writes it) to `*`: the final rules
// reach those lemmas mostly through own transforms, whose ids are not
// Yomitan's. README.md reports the file with Yomitan's reasons against
// sources/yomitan.json.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms, parseJson} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => parseJson(readFileSync(join(here, name), 'utf8'), name);
const own = read('own.json');
const yomitan = read('yomitan.json');

// The union is computed to check that the two files merge (conditions agree).
mergeTransforms(own, yomitan);

// Yomitan transforms kept: [id, constraints added to its rules, reason].
export const KEPT = [
    ['-ujo (adjective)', {}, 'fridujo → frida: no own rule takes -ujo to an adjective'],
    ['-ujo (verb)', {}, 'lavujo → lavi: no own rule takes -ujo to a verb'],
    // The own prefix rules take verbs (and kun- nouns); Yomitan's take any
    // word. Each needs a stem of two letters, or a frequent word gives a
    // letter of the alphabet, which the dictionary lists without a part of
    // speech: ekstera → a, ĵuso → o, eki → i, elo → o, dise → e, fora → a,
    // kune → e, mise → e.
    ['ekster-', {stemMinLength: 2}, 'eksterlando → lando'],
    ['ĵus-', {stemMinLength: 2}, 'ĵusvekita → vekita'],
    ['ek-', {stemMinLength: 2}, 'ekspiro → spiro, eksono → sono'],
    ['el-', {stemMinLength: 2}, 'eldiro → diro'],
    // dis- and for- need three: disko → ko, forko → ko, formi → mi, forto
    // → to, forĝi → ĝi (measure-derivation.py).
    ['dis-', {stemMinLength: 3}, 'dissendo → sendo'],
    ['for-', {stemMinLength: 3}, 'foriro → iro'],
    ['kun-', {stemMinLength: 2}, 'kunulo → ulo'],
    ['mis-', {stemMinLength: 2}, 'misuzo → uzo'],
];

// Yomitan transforms left out, with the reason.
export const REMOVED = {
    'accusative': '`n` → `` with no stem minimum: En → the letter E first at 98 places of Marta, kun → ku, jen → je; own rules remove -n',
    'plural': '`j` → `` with no stem minimum: Aj → the letter A, kaj → ka, hoj → ho; own rules remove -j',
    'diminutive': 'the own -et- rule makes it, with a stem minimum',
    'directional': 'the own accusative -en rule makes it, with a stem minimum',
    'locational': '`e` → `o` with no stem minimum: Ne → No → nordo first at 47 places of Marta, le → lo; the own adverb rule makes it',
    'adjectival': '`a` → `o` on by default: Marta → marto (March) first at 451 places of Marta; the own optional otherWordClass rule makes it',
    'adverbial (adj -> adv)': 'the own adverb rule makes it, with a stem minimum',
    'adverbial (v -> adv)': 'the own adverb rule makes it, with a stem minimum',
    '-ejo (noun)': 'the own -ej- rule makes it',
    '-ejo (verb)': 'the own -ej- rule makes it',
    '-ujo (noun)': 'the own -uj- rule makes it',
    '-ebla': 'the own -ebl- rule makes it',
    '-ado': 'the own -ad- rule makes it',
    'mal-': 'the own mal- rule makes it for every ending, with a stem minimum',
};

function overlaps(a, b) {
    return a.length === 0 || b.length === 0 || a.some((c) => b.includes(c));
}

/** Does Yomitan's rule `y` make the deinflection of own rule `o`? */
export function sameDeinflection(o, y) {
    if (!overlaps(o.conditionsOut, y.conditionsOut)) { return false; }
    if (y.type === 'suffix' && (o.type === 'suffix' || o.type === 'wholeWord')) {
        if (!o.inflected.endsWith(y.inflected)) { return false; }
        const p = o.inflected.slice(0, o.inflected.length - y.inflected.length);
        return o.deinflected === p + y.deinflected;
    }
    if (y.type === 'prefix' && o.type === 'circumfix') {
        return o.inflectedPrefix === y.inflected && o.deinflectedPrefix === y.deinflected && o.inflectedSuffix === o.deinflectedSuffix;
    }
    return false;
}

const yomitanRules = yomitan.transforms.flatMap((t) => t.rules.map((rule) => ({transform: t.id, rule})));
const transforms = [];
const counts = {own: 0, both: 0, yomitan: 0};
for (const t of own.transforms) {
    const rules = t.rules.map((rule) => {
        const {source: _source, ...plain} = rule;
        const matches = yomitanRules.filter((y) => sameDeinflection(plain, y.rule));
        return {plain, source: matches.length > 0 ? 'both' : 'own'};
    });
    const sources = new Set(rules.map((r) => r.source));
    const transformSource = sources.size === 1 ? [...sources][0] : 'own';
    const out = {id: t.id, name: t.name, description: t.description, source: transformSource};
    if (t.optional !== undefined) { out.optional = t.optional; }
    out.rules = rules.map(({plain, source}) => {
        ++counts[source];
        return source === transformSource ? plain : {...plain, source};
    });
    transforms.push(out);
}
const ownIds = new Set(own.transforms.map((t) => t.id));
const kept = new Map(KEPT.map(([id, constraints]) => [id, constraints]));
for (const t of yomitan.transforms) {
    if (kept.has(t.id)) {
        if (ownIds.has(t.id)) { throw new Error(`KEPT ${t.id} is also an own transform id`); }
        const constraints = kept.get(t.id);
        const {source: _source, ...header} = t;
        transforms.push({...header, source: 'yomitan', rules: t.rules.map((rule) => {
            ++counts.yomitan;
            const {source: _s, ...plain} = rule;
            return {...plain, ...constraints};
        })});
    } else if (!(t.id in REMOVED)) {
        throw new Error(`Yomitan transform ${t.id} is neither in KEPT nor in REMOVED`);
    }
}
for (const id of [...kept.keys(), ...Object.keys(REMOVED)]) {
    if (!yomitan.transforms.some((t) => t.id === id)) { throw new Error(`${id} is not a Yomitan transform`); }
}

const yomitanTests = join(here, '..', 'tests', 'yomitan.tsv');
const lines = readFileSync(yomitanTests, 'utf8').split('\n').map((line) => {
    if (line.startsWith('#') || line === '') { return line; }
    const cells = line.split('\t');
    cells[5] = '*';
    return cells.join('\t');
});
writeFileSync(yomitanTests, lines.join('\n'));

const out = {schema: 1, conditions: own.conditions, transforms};
const args = process.argv.slice(2);
const file = args[0] === '--out' ? resolve(args[1]) : join(here, '..', 'transforms.json');
writeFileSync(file, formatTransforms(out));
console.log(`eo: ${transforms.length} transforms, ${counts.own + counts.both + counts.yomitan} rules ` +
    `(${counts.own} own, ${counts.both} both, ${counts.yomitan} yomitan) in ${file}`);
