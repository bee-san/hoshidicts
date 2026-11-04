#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ga/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5): the rules of sources/own.json, with `source: "both"` on
// each own rule that makes the same deinflection as a rule of
// sources/yomitan.json. Run from the repository root:
//
//   node languages/ga/sources/build-final.mjs [--out <file>]
//
// Yomitan's Irish file has seven eclipsis rules (mb → b, gc → c, nd → d,
// bhf → f, ng → g, bp → p, dt → t) for nouns. The own eclipsis transform has
// the same seven prefixes for every part of speech, so a "same deinflection"
// here is a prefix rule with the same inflected and deinflected text. Every
// Yomitan rule is then left out: each repeats an own rule's deinflection and
// adds no reading (README, Rule provenance).

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : join(here, '..', 'transforms.json');
const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));

const key = (rule) => `${rule.type}\t${rule.inflected}\t${rule.deinflected}`;
const yomitanRules = new Map();
for (const t of yomitan.transforms) {
    for (const rule of t.rules) { yomitanRules.set(key(rule), t.id); }
}

let both = 0;
let ownCount = 0;
const matched = new Set();
const transforms = own.transforms.map((t) => {
    const rules = t.rules.map((rule) => {
        const {source: _source, ...rest} = rule;
        if (rule.type === 'prefix' && yomitanRules.get(key(rule)) === t.id) {
            matched.add(key(rule));
            both++;
            return {...rest, source: 'both'};
        }
        ownCount += rule.suffixes ? rule.suffixes.length * rule.prefixes.length : 1;
        return rest;
    });
    const hasBoth = rules.some((r) => r.source === 'both');
    if (!hasBoth) { return {...t, source: 'own', rules}; }
    // A transform both files have is `both`; its rules only own.json has say so.
    return {...t, source: 'both', rules: rules.map((r) => (r.source === 'both' ? (({source: _s, ...rest}) => rest)(r) : {...r, source: 'own'}))};
});
const unmatched = [...yomitanRules.keys()].filter((k) => !matched.has(k));
if (unmatched.length > 0) { throw new Error(`Yomitan rules without an own rule of the same deinflection: ${unmatched.join(', ')}`); }

writeFileSync(out, formatTransforms({schema: 1, conditions: own.conditions, ...(own.wordLists ? {wordLists: own.wordLists} : {}), transforms}));
console.log(`ga: ${transforms.length} transforms; rules (cross products expanded): ${ownCount} own, ${both} both, 0 yomitan; ${yomitanRules.size} Yomitan rules left out, each the deinflection of a both rule; in ${out}`);
