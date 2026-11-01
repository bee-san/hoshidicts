#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Maps the todo rules of a fresh port of Yomitan's English rules
// (docs/languages.md, section 8.3) and writes sources/yomitan.json:
//
//   node tools/port-yomitan-transforms.mjs <yomitan> en --out /tmp/en-port.json
//   node languages/en/sources/map-yomitan.mjs <yomitan> /tmp/en-port.json
//
// Yomitan's 38 phrasal-verb rules (createPhrasalVerbInflection,
// `^\w*<suffix> (?:<78 words>)`) become `phrasal` rules with the same
// suffix, followed by the 78-word list; its interposed-object rule becomes
// one `interposedObject` rule with the particle list and the 78 words as
// guard words. Each mapped rule's deinflected suffix is read by calling the
// Yomitan rule, and every todo must be mapped.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {loadTransformDescriptor} from '../../../tools/lib/yomitan.mjs';

const [root, portFile] = process.argv.slice(2);
if (root === undefined || portFile === undefined) {
    console.error('usage: node languages/en/sources/map-yomitan.mjs <yomitan checkout> <fresh port.json>');
    process.exit(2);
}

const port = JSON.parse(readFileSync(portFile, 'utf8'));
const {descriptor} = await loadTransformDescriptor(root, 'en');
const yomitanTransforms = Object.values(descriptor.transforms);

const PHRASAL = /^\^\\w\*([a-z']+) \(\?:([a-z|]+)\)$/;
const INTERPOSED = /^\^\\w\* \(\?:\(\?!\\b\(([a-z|]+)\)\\b\)\.\)\+ \(\?:([a-z|]+)\)$/;

let words = null;
let particles = null;
const sameList = (list, previous, what) => {
    if (previous !== null && previous.join('|') !== list.join('|')) { throw new Error(`the ${what} lists differ between rules`); }
    return list;
};

let mapped = 0;
port.transforms.forEach((transform, t) => {
    const rules = yomitanTransforms[t].rules;
    transform.rules = transform.rules.map((rule, r) => {
        if (rule.type !== 'todo') { return rule; }
        const {conditionsIn, conditionsOut} = rule;
        let match = PHRASAL.exec(rule.isInflected);
        if (match !== null) {
            const [, inflected, list] = match;
            words = sameList(list.split('|'), words, 'phrasal');
            const output = rules[r].deinflect(`stem${inflected} up`);
            if (!output.startsWith('stem') || !output.endsWith(' up')) { throw new Error(`${transform.id}[${r}]: unexpected output ${output}`); }
            ++mapped;
            return {type: 'phrasal', inflected, deinflected: output.slice(4, -3), followedBy: 'phrasalWords', conditionsIn, conditionsOut};
        }
        match = INTERPOSED.exec(rule.isInflected);
        if (match !== null) {
            words = sameList(match[1].split('|'), words, 'phrasal');
            particles = sameList(match[2].split('|'), particles, 'particle');
            ++mapped;
            return {type: 'interposedObject', particles: 'particles', guardWords: 'phrasalWords', conditionsIn, conditionsOut};
        }
        throw new Error(`${transform.id}[${r}]: no mapping for ${rule.isInflected}`);
    });
});

const out = {schema: port.schema, conditions: port.conditions, wordLists: {particles, phrasalWords: words}, transforms: port.transforms};
const file = fileURLToPath(new URL('./yomitan.json', import.meta.url));
writeFileSync(file, formatTransforms(out));
console.log(`Mapped ${mapped} todo rules (${particles.length} particles, ${words.length} phrasal words) into ${file}`);
