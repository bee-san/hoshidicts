#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ka/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5):
//
//   node languages/ka/sources/build-final.mjs
//
// The final set is the union of sources/own.json and sources/yomitan.json
// (tools/merge-transforms.mjs) with Yomitan's 16 rules removed. Each one
// strips a case ending to the bare stem (სახლში → სახლ) or restores a stem
// ending (ნ → ნი, გ → გა), recovers no row of the corpus, of gaps.tsv or of
// the 130 forms sources/yomitan-ablation.mjs builds from their endings (the
// own rules reach all of them), and adds false candidates and wrong first
// results: on the forms built from their endings, false candidates 0.36 →
// 0.51 per row and first rank 92.3% → 85.4%; on the two books of README.md,
// 534 first results change, nearly all to bare stems (რომელმაც → რომელ,
// მოისმა → მ, მესმის → მე). README.md, Rule provenance, has the numbers. No
// own rule makes the same deinflection as a Yomitan rule, so no rule is
// `both`, and what remains is sources/own.json with its conditions, which
// already have Yomitan's definitions where both files define a condition.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms, parseJson} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => parseJson(readFileSync(join(here, name), 'utf8'), name);
const {transforms: union} = mergeTransforms(read('own.json'), read('yomitan.json'));
let removed = 0;
for (const t of union.transforms) {
    const kept = t.rules.filter((rule) => (rule.source ?? t.source) !== 'yomitan');
    removed += t.rules.length - kept.length;
    t.rules = kept;
}
union.transforms = union.transforms.filter((t) => t.rules.length > 0);
// Yomitan's conditions that no remaining rule uses stay: np and ns are
// subconditions of n, adv is the part of speech of adverbs.
writeFileSync(join(here, '..', 'transforms.json'), formatTransforms(union));
console.log(`transforms.json: ${union.transforms.length} transforms, ${union.transforms.reduce((n, t) => n + t.rules.length, 0)} rules; ${removed} Yomitan rules removed`);
