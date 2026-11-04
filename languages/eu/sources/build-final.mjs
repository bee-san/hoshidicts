#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/eu/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5), and sources/yomitan-provenance.tsv. Run from the
// repository root after sources/build-own.mjs:
//
//   node languages/eu/sources/build-final.mjs
//
// The final set is the union of sources/own.json and sources/yomitan.json
// (tools/merge-transforms.mjs) with every Yomitan rule left out: the README
// (Rule provenance) gives the numbers. An own rule that makes the deinflection
// of a Yomitan rule is marked `both`: a suffix rule that replaces the same
// ending by the same text once their common start is set aside (Yomitan's
// `ita` -> `i` is the own `ta` -> ``), with a part of speech in common.
// yomitan-provenance.tsv lists, for each Yomitan rule, the own transforms that
// make its deinflection (`outer>inner` for two own rules in a row), or `-`.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = dirname(here);
const own = JSON.parse(readFileSync(join(here, 'own.json'), 'utf8'));
const yomitan = JSON.parse(readFileSync(join(here, 'yomitan.json'), 'utf8'));

// The own conditions that stand for a part of speech of Yomitan's file.
const PARTS = new Set(['n', 'adj', 'adv', 'v']);

function shape(rule) {
    let i = 0;
    while (i < rule.inflected.length && i < rule.deinflected.length && rule.inflected[i] === rule.deinflected[i]) { ++i; }
    return `${rule.inflected.slice(i)}\u0000${rule.deinflected.slice(i)}`;
}

const bySuffix = new Map();
for (const t of own.transforms) {
    for (const [index, rule] of t.rules.entries()) {
        if (rule.type !== 'suffix') { continue; }
        const key = shape(rule);
        if (!bySuffix.has(key)) { bySuffix.set(key, []); }
        bySuffix.get(key).push({transform: t.id, index, rule});
    }
}

const both = new Set();
const provenance = [];
for (const t of yomitan.transforms) {
    for (const [index, rule] of t.rules.entries()) {
        const parts = new Set(rule.conditionsOut.filter((c) => PARTS.has(c)));
        const matches = (bySuffix.get(shape(rule)) ?? []).filter((m) => m.rule.conditionsOut.some((c) => parts.has(c)));
        for (const m of matches) { both.add(`${m.transform}\u0000${m.index}`); }
        let ids = [...new Set(matches.map((m) => m.transform))];
        if (ids.length === 0) {
            // Two own rules in a row: the outer ending removed first, then
            // the inner one (arengan: -gan, then the genitive -aren; tzea:
            // the article -a, then the verbal noun -tze).
            for (let cut = 1; cut < rule.inflected.length && ids.length === 0; ++cut) {
                const outer = bySuffix.get(shape({inflected: rule.inflected.slice(cut), deinflected: ''})) ?? [];
                const inner = bySuffix.get(shape({inflected: rule.inflected.slice(0, cut), deinflected: rule.deinflected})) ?? [];
                for (const o of outer) {
                    for (const i of inner) {
                        const fed = o.rule.conditionsOut.some((c) => i.rule.conditionsIn.length === 0 || i.rule.conditionsIn.includes(c));
                        if (fed && i.rule.conditionsOut.some((c) => parts.has(c))) { ids.push(`${o.transform}>${i.transform}`); }
                    }
                }
            }
            ids = [...new Set(ids)];
        }
        provenance.push([t.id, index, rule.inflected, rule.deinflected, rule.conditionsOut.join(','), ids.length > 0 ? ids.join(',') : '-']);
    }
}

const {transforms: union} = mergeTransforms(own, yomitan);
union.transforms = union.transforms.filter((t) => t.source !== 'yomitan');
let counts = {own: 0, both: 0};
for (const t of union.transforms) {
    const marked = t.rules.map((rule, index) => both.has(`${t.id}\u0000${index}`));
    if (marked.every(Boolean)) {
        t.source = 'both';
        for (const rule of t.rules) { delete rule.source; }
    } else {
        t.rules = t.rules.map((rule, index) => (marked[index] ? {...rule, source: 'both'} : rule));
    }
    for (const m of marked) { counts[m ? 'both' : 'own'] += 1; }
}
writeFileSync(join(pack, 'transforms.json'), formatTransforms(union));
writeFileSync(join(here, 'yomitan-provenance.tsv'), [
    '# Yomitan rule (ext/js/language/eu/basque-transforms.js at d3c54c1)<TAB>rule<TAB>inflected<TAB>deinflected<TAB>conditionsOut<TAB>own transforms that make its deinflection (- if none)',
    ...provenance.map((row) => row.join('\t')),
].join('\n') + '\n');
const mapped = provenance.filter((row) => row[5] !== '-').length;
const chains = provenance.filter((row) => row[5].includes('>')).length;
console.log(`transforms.json: ${union.transforms.length} transforms, ${counts.own + counts.both} rules (${counts.own} own, ${counts.both} both, 0 yomitan); `
    + `${mapped} of ${provenance.length} Yomitan rules have own rules that make their deinflection (${chains} of them in two steps)`);
