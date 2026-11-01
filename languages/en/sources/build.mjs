#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds sources/own.json from the two tables beside it and transforms.json
// from sources/yomitan.json plus sources/own.json:
//
//   node languages/en/sources/build.mjs
//
// own.json holds only what Yomitan's English rules lack: irregular verbs,
// irregular and classical plurals, irregular comparison, present forms of
// be and have, and the typographic apostrophe (U+2019) in Yomitan's
// apostrophe rules. A verb form that Yomitan's rules already map to the
// same base, or that equals the base, is left out.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const rows = (name) => readFileSync(here(name), 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#')).map((line) => line.split('\t'));

const yomitan = JSON.parse(readFileSync(here('./yomitan.json'), 'utf8'));
const yomitanRules = yomitan.transforms.flatMap((t) => t.rules).filter((r) => r.type === 'suffix' || r.type === 'wholeWord');
const yomitanMaps = (form, base) => yomitanRules.some((r) => (r.type === 'wholeWord' ? form === r.inflected && base === r.deinflected : form.endsWith(r.inflected) && form.slice(0, form.length - r.inflected.length) + r.deinflected === base));

const META = {
    'irregular past': ['past', 'Simple past tense of an irregular verb'],
    'irregular past participle': ['past participle', 'Past participle of an irregular verb'],
    'irregular plural': ['plural', 'Irregular or classical plural form of a noun'],
    'irregular comparative': ['comparative', 'Irregular comparative form of an adjective'],
    'irregular superlative': ['superlative', 'Irregular superlative form of an adjective'],
    'comparative -ey': ['comparative', 'Comparative form of an adjective ending in -ey'],
    'superlative -ey': ['superlative', 'Superlative form of an adjective ending in -ey'],
    'irregular present': ['present', 'Present tense of be, and has for have'],
    'possessive typographic': ['possessive', 'Possessive form of a noun, written with \u2019'],
    'archaic typographic': ['archaic', 'Archaic form of a word, written with \u2019'],
    'dropped g typographic': ['dropped g', 'Dropped g in -ing form of a verb, written with \u2019'],
};

/** @type {Map<string, object[]>} */
const transforms = new Map([['irregular past', []], ['irregular past participle', []]]);
let skipped = 0;
for (const [base, past, participle] of rows('./irregular-verbs.tsv')) {
    for (const [id, forms] of [['irregular past', past], ['irregular past participle', participle]]) {
        for (const form of forms.split('|')) {
            if (form === base || yomitanMaps(form, base)) {
                ++skipped;
                continue;
            }
            transforms.get(id).push({type: 'wholeWord', inflected: form, deinflected: base, conditionsIn: ['v'], conditionsOut: ['v']});
        }
    }
}
for (const [id, type, inflected, deinflected, conditionsIn, conditionsOut] of rows('./own-rules.tsv')) {
    if (!transforms.has(id)) { transforms.set(id, []); }
    transforms.get(id).push({type, inflected, deinflected, conditionsIn: conditionsIn.split('|'), conditionsOut: conditionsOut.split('|')});
}

const own = {
    schema: 1,
    conditions: yomitan.conditions,
    transforms: [...transforms].map(([id, rules]) => {
        if (META[id] === undefined) { throw new Error(`no name for ${id}`); }
        return {id, name: META[id][0], description: META[id][1], source: 'own', rules};
    }),
};
writeFileSync(here('./own.json'), formatTransforms(own));

const ids = new Set(yomitan.transforms.map((t) => t.id));
for (const t of own.transforms) {
    if (ids.has(t.id)) { throw new Error(`transform id ${t.id} is in both files`); }
}
const final = {schema: 1, conditions: yomitan.conditions, wordLists: yomitan.wordLists, transforms: [...yomitan.transforms, ...own.transforms]};
writeFileSync(here('../transforms.json'), formatTransforms(final));
const count = (file) => file.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`own.json: ${own.transforms.length} transforms, ${count(own)} rules (${skipped} verb forms left out); transforms.json: ${final.transforms.length} transforms, ${count(final)} rules`);
