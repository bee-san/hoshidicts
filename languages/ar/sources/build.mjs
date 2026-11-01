#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds sources/own.json and transforms.json (sources/yomitan.json plus
// sources/own.json):
//
//   node languages/ar/sources/build.mjs
//
// own.json holds verb rules Yomitan's Arabic lacks, applied after its
// affix rules have reached a verb stem:
// - doubled verbs (فعل مضعف): before a consonant-initial ending the doubled
//   last radical is written twice (مددت, استحققن, يستحققن); collapsing a
//   final doubled letter reaches the dictionary form (مد, استحق);
// - final-weak verbs: the stem keeps ي or و where the dictionary form ends
//   in ى or ا (رميت -> رمي -> رمى, دعوت -> دعو -> دعا, ينسيا -> نسي -> نسى).

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const yomitan = JSON.parse(readFileSync(here('./yomitan.json'), 'utf8'));

// The consonants a doubled verb's last radical can be (no alef, no ى, no ة).
const CONSONANTS = [...'ءبتثجحخدذرزسشصضطظعغفقكلمنهوي'];
const verb = {conditionsIn: ['v'], conditionsOut: ['v']};
const own = {
    schema: 1,
    conditions: yomitan.conditions,
    transforms: [
        {
            id: 'VDoubled',
            name: 'doubled verb',
            description: 'Doubled (geminate) verb whose last radical is written twice before a consonant-initial ending',
            source: 'own',
            rules: CONSONANTS.map((c) => ({type: 'suffix', inflected: c + c, deinflected: c, ...verb, stemMinLength: 1})),
        },
        {
            id: 'VFinalWeak',
            name: 'final-weak verb',
            description: 'Final-weak verb whose stem ends in ي or و where the dictionary form ends in ى or ا',
            source: 'own',
            rules: [
                {type: 'suffix', inflected: '\u064A', deinflected: '\u0649', ...verb, stemMinLength: 2},
                {type: 'suffix', inflected: '\u0648', deinflected: '\u0627', ...verb, stemMinLength: 2},
            ],
        },
    ],
};
writeFileSync(here('./own.json'), formatTransforms(own));

const ids = new Set(yomitan.transforms.map((t) => t.id));
for (const t of own.transforms) {
    if (ids.has(t.id)) { throw new Error(`transform id ${t.id} is in both files`); }
}
const final = {schema: 1, conditions: yomitan.conditions, transforms: [...yomitan.transforms, ...own.transforms]};
writeFileSync(here('../transforms.json'), formatTransforms(final));
const count = (file) => file.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`own.json: ${own.transforms.length} transforms, ${count(own)} rules; transforms.json: ${final.transforms.length} transforms, ${count(final)} rule rows`);
