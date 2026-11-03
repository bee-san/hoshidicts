#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the `todo` rules that tools/port-yomitan-transforms.mjs leaves in
// sources/yomitan.json (docs/languages.md, sections 8.1 and 8.3):
//
//   node tools/port-yomitan-transforms.mjs <yomitan> en --force
//   node languages/en/sources/map-yomitan.mjs <yomitan>
//
// Yomitan's English file has two kinds of non-literal rule:
// - 38 phrasal-verb rules from createPhrasalVerbInflection(inflected,
//   deinflected): `^\w*<inflected> (?:<78 words>)`. Each becomes a `phrasal`
//   rule with the same ending, followedBy the 78-word list.
// - The interposed-object rule `^\w* (?:(?!\b(<78 words>)\b).)+ (?:<57 particles>)`.
//   It becomes an `interposedObject` rule with the 57 particles and the 78
//   words as guard words.
// The lists and each rule's deinflected ending are read from Yomitan's code
// (the regular expressions and, for the ending, the rule's own deinflect on a
// probe), not typed in. The checkout is only read.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const [yomitanDir] = process.argv.slice(2);
if (!yomitanDir) {
    console.error('usage: node languages/en/sources/map-yomitan.mjs <yomitan checkout>');
    process.exit(2);
}
const {englishTransforms} = await import(pathToFileURL(resolve(yomitanDir, 'ext/js/language/en/english-transforms.js')).href);
const file = join(dirname(fileURLToPath(import.meta.url)), 'yomitan.json');
const ported = JSON.parse(readFileSync(file, 'utf8'));

const phrasalSource = /^\^\\w\*([a-z']+) \(\?:([a-z|]+)\)$/;
const interposedSource = /^\^\\w\* \(\?:\(\?!\\b\(([a-z|]+)\)\\b\)\.\)\+ \(\?:([a-z|]+)\)$/;

let phrasalWords = null;
let particles = null;
const sameList = (a, b) => a.length === b.length && a.every((w, i) => w === b[i]);
let mapped = 0;
for (const transform of ported.transforms) {
    const theirs = englishTransforms.transforms[transform.id];
    if (theirs === undefined) { throw new Error(`Yomitan has no transform ${transform.id}`); }
    if (theirs.rules.length !== transform.rules.length) { throw new Error(`${transform.id}: rule counts differ`); }
    transform.rules = transform.rules.map((rule, i) => {
        if (rule.type !== 'todo') { return rule; }
        const original = theirs.rules[i];
        const source = original.isInflected.source;
        if (source !== rule.isInflected) { throw new Error(`${transform.id}[${i}]: the todo is not Yomitan's rule ${i}`); }
        let match = phrasalSource.exec(source);
        if (match !== null) {
            const [, inflected, list] = match;
            const words = list.split('|');
            if (phrasalWords === null) { phrasalWords = words; }
            if (!sameList(words, phrasalWords)) { throw new Error(`${transform.id}[${i}]: another word list`); }
            // The ending's replacement, from the rule itself.
            const probe = `xyz${inflected} ${words[0]}`;
            const out = original.deinflect(probe);
            if (!out.startsWith('xyz') || !out.endsWith(` ${words[0]}`)) { throw new Error(`${transform.id}[${i}]: unexpected deinflect(${probe}) = ${out}`); }
            const deinflected = out.slice(3, out.length - words[0].length - 1);
            ++mapped;
            return {type: 'phrasal', inflected, deinflected, followedBy: 'phrasalVerbWords', conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut};
        }
        match = interposedSource.exec(source);
        if (match !== null) {
            const [, guards, list] = match;
            const words = guards.split('|');
            if (phrasalWords === null) { phrasalWords = words; }
            if (!sameList(words, phrasalWords)) { throw new Error(`${transform.id}[${i}]: another guard list`); }
            particles = list.split('|');
            const out = original.deinflect('put xyz on');
            if (out !== 'put on') { throw new Error(`${transform.id}[${i}]: unexpected deinflect = ${out}`); }
            ++mapped;
            return {type: 'interposedObject', particles: 'phrasalVerbParticles', guardWords: 'phrasalVerbWords', conditionsIn: rule.conditionsIn, conditionsOut: rule.conditionsOut};
        }
        throw new Error(`${transform.id}[${i}]: no mapping for ${source}`);
    });
}
if (phrasalWords === null || particles === null) { throw new Error('no word lists found'); }
const out = {schema: ported.schema, conditions: ported.conditions, wordLists: {phrasalVerbWords: phrasalWords, phrasalVerbParticles: particles}, transforms: ported.transforms};
writeFileSync(file, formatTransforms(out));
console.log(`${file}: mapped ${mapped} todo rules; phrasalVerbWords ${phrasalWords.length} words, phrasalVerbParticles ${particles.length}`);
