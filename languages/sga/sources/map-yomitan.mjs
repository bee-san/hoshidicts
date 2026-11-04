#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the 27 todo rules of a fresh port of Yomitan's Old Irish rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> sga --force
//   node languages/sga/sources/map-yomitan.mjs <yomitan>
//
// Every todo rule comes from Yomitan's tryAlternateOrthography(notBeginning,
// original, alternate): a regular expression `original` with the g flag,
// preceded by `(?<!^)` when notBeginning is true, and a deinflect function
// that replaces every match with `alternate`. Each becomes a `replace` rule
// with `occurrence: "all"`, and `notAtStart` when the source starts with
// `(?<!^)`. The alternate is read from Yomitan's function. Each mapped rule
// is then checked against that function on probe texts: wherever Yomitan's
// isInflected accepts a text, both must give the same output. The one way
// they can differ is a text that starts with an overlapping run of the
// original (aaa with (?<!^)aa: Yomitan matches at the second letter, the
// pack rule skips the first match and then finds none); the probes list
// such texts, and the script reports them.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node languages/sga/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
const port = JSON.parse(readFileSync(file, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'sga');
const yomitanTransforms = Object.values(descriptor.transforms);

const LITERAL = /^(\(\?<!\^\))?([^\\^$.*+?()[\]{}|]+)$/;

/** The engine's replace rule (src/languages/transforms.cpp), in JavaScript. */
function packReplace(rule, text) {
    const found = [];
    for (let i = text.indexOf(rule.inflected); i >= 0; i = text.indexOf(rule.inflected, i + rule.inflected.length)) {
        if (!(rule.notAtStart && i === 0)) { found.push(i); }
    }
    if (found.length === 0) { return null; }
    let out = '';
    let last = 0;
    for (const index of found) {
        out += text.slice(last, index) + rule.deinflected;
        last = index + rule.inflected.length;
    }
    return out + text.slice(last);
}

let mapped = 0;
const made = [];
port.transforms.forEach((transform, t) => {
    const original = yomitanTransforms[t];
    if (original.name !== transform.name) { throw new Error(`transform ${t}: ${original.name} is not ${transform.name}`); }
    transform.rules = transform.rules.map((rule, r) => {
        if (rule.type !== 'todo') { return rule; }
        ++mapped;
        const match = LITERAL.exec(rule.isInflected);
        if (match === null) { throw new Error(`${transform.id}[${r}]: no mapping for ${rule.isInflected}`); }
        const notAtStart = match[1] !== undefined;
        const literal = match[2];
        const source = original.rules[r];
        // The alternate spelling, read from Yomitan's function.
        const probe = notAtStart ? `b${literal}` : literal;
        source.isInflected.lastIndex = 0;
        const result = source.deinflect(probe);
        const alternate = notAtStart ? result.slice(1) : result;
        if (notAtStart && !result.startsWith('b')) { throw new Error(`${transform.id}[${r}]: unexpected output ${result} for ${probe}`); }
        const pack = {type: 'replace', inflected: literal, deinflected: alternate, occurrence: 'all'};
        if (notAtStart) { pack.notAtStart = true; }
        pack.conditionsIn = rule.conditionsIn;
        pack.conditionsOut = rule.conditionsOut;
        made.push({transform: transform.id, source, pack});
        return pack;
    });
});
if (mapped !== 27) { throw new Error(`mapped ${mapped} todo rules, expected 27`); }

// Probe texts: each original spelling at the start, inside and at the end of
// short stems, twice, and in overlapping runs.
const stems = ['', 'a', 'b', 'fer', 'cenn', 'áe', 'ṡ'];
const probes = new Set();
for (const {pack} of made) {
    const x = pack.inflected;
    for (const s of stems) {
        for (const u of stems) {
            probes.add(`${s}${x}${u}`);
            probes.add(`${s}${x}${u}${x}`);
            probes.add(`${s}${x}${x}${u}`);
        }
    }
    probes.add(x + x.slice(-1));
    probes.add(x[0] + x);
}
const differ = [];
let compared = 0;
for (const {transform, source, pack} of made) {
    for (const text of probes) {
        source.isInflected.lastIndex = 0;
        const accepted = source.isInflected.test(text);
        source.isInflected.lastIndex = 0;
        const theirs = accepted ? source.deinflect(text) : null;
        source.isInflected.lastIndex = 0;
        const ours = packReplace(pack, text);
        ++compared;
        if (theirs === ours) { continue; }
        // The expected difference: the text starts with an overlapping run
        // of the original spelling (aaa, ccc).
        const x = pack.inflected;
        if (pack.notAtStart && text.startsWith(x) && text.slice(1).startsWith(x)) {
            differ.push(`${transform}: ${text} → Yomitan ${theirs}, pack ${ours}`);
            continue;
        }
        throw new Error(`${transform}: ${text} → Yomitan ${theirs}, pack ${ours}: an unexpected difference`);
    }
}

writeFileSync(file, formatTransforms(port));
console.log(`${file}: ${mapped} todo rules mapped; ${compared} probe comparisons, ${differ.length} differences, all on texts that start with an overlapping run of the replaced spelling (aaa, ccc)`);
