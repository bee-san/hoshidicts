#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/sga/transforms.json, the final rule set (docs/languages.md
// 14 step 5), and sources/yomitan-provenance.tsv:
//
//   node languages/sga/sources/build-final.mjs [--drop <id,...>] [--out <file>]
//
// 1. The union of sources/own.json and sources/yomitan.json, as
//    tools/merge-transforms.mjs makes it (Yomitan's transforms first).
// 2. The Yomitan transforms of DROP (or --drop) are removed: README.md,
//    "Rule provenance", gives the numbers for each.
// 3. Yomitan's replace rules (tryAlternateOrthography) are kept with the
//    conditions of the own spelling rules: conditionsIn the headword
//    conditions (n_dict, adj_dict, v_dict) and conditionsOut ["spelt"],
//    which no rule takes, so a spelling variant is made once, of the text
//    or of the headword form an inflection rule reached. With their empty conditionsOut they were applied to each
//    other's output and to every own rule's, which took the union to
//    hundreds of deinflections per word and, on some texts of the
//    Würzburg glosses, out of memory (README.md, Rule provenance).
// 4. An own rule is marked `both` when a Yomitan rule makes the same
//    deinflection: the same rule type and the same affix replaced by the
//    same text at the same place (a prefix rule's beginning, a suffix rule's
//    ending, a replace rule's occurrences), whatever stem constraints and
//    conditions each adds. A Yomitan rule that an own rule repeats this way
//    is left out of the final set too, since the own rule makes its
//    deinflection: keeping both would only look every such text up twice.
//    sources/yomitan-provenance.tsv lists every Yomitan rule with the own
//    rule that repeats it, or what became of it.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';
import {formatTransforms, parseJson} from '../../../tools/lib/json.mjs';
import {readFileSync} from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
// Yomitan transforms left out for measured harm (README.md, Rule provenance).
const DROP = ['lenited'];
const SPELT_IN = ['n_dict', 'adj_dict', 'v_dict'];
const SPELT_OUT = ['spelt'];

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const drop = new Set(option('--drop', null) === null ? DROP : option('--drop', '').split(',').filter((x) => x !== ''));
const outFile = option('--out', join(here, '..', 'transforms.json'));
const read = (name) => parseJson(readFileSync(join(here, name), 'utf8'), name);
const own = read('own.json');
const yomitan = read('yomitan.json');
const {transforms: union} = mergeTransforms(own, yomitan);

// The deinflection a rule makes, without its constraints and conditions.
const shape = (rule) => {
    switch (rule.type) {
        case 'prefix': case 'suffix': case 'wholeWord':
            return `${rule.type}\u0000${rule.inflected}\u0000${rule.deinflected}`;
        case 'replace':
            return `replace\u0000${rule.inflected}\u0000${rule.deinflected}\u0000${rule.occurrence ?? 'all'}\u0000${rule.notAtStart === true}`;
        default:
            return null;
    }
};
// Own rules by the deinflection they make (stem changes make another one).
const ownByShape = new Map();
for (const transform of own.transforms) {
    transform.rules.forEach((rule, index) => {
        const key = rule.stemChange === undefined ? shape(rule) : null;
        if (key === null) { return; }
        if (!ownByShape.has(key)) { ownByShape.set(key, []); }
        ownByShape.get(key).push({transform: transform.id, index});
    });
}

// A prefix rule X → Y of Yomitan is also repeated by an own prefix rule
// P → Q when X = P + c and Y = Q + c for one letter c that the own rule's
// stemStartsWith accepts (Yomitan's ha → a is the own h → '' before a
// vowel).
const language = parseJson(readFileSync(join(here, '..', 'language.json'), 'utf8'), 'language.json');
const classRegExp = (pattern) => new RegExp(`^${pattern.replace(/\{(\w+)\}/g, (_, name) => language.classes[name].slice(1, -1))}`, 'u');
const ownPrefixes = own.transforms.flatMap((t) => t.rules.map((rule, index) => ({transform: t.id, index, rule})).filter((x) => x.rule.type === 'prefix'));
const prefixRepeats = (rule) => {
    if (rule.type !== 'prefix') { return []; }
    const x = [...rule.inflected];
    const y = [...rule.deinflected];
    if (x.length === 0 || y.length === 0 || x[x.length - 1] !== y[y.length - 1]) { return []; }
    const c = x[x.length - 1];
    const p = x.slice(0, -1).join('');
    const q = y.slice(0, -1).join('');
    return ownPrefixes.filter(({rule: own}) => own.inflected === p && own.deinflected === q && own.stemStartsWith !== undefined && classRegExp(own.stemStartsWith).test(c));
};

const provenance = [];
const repeated = new Set(); // own rules a Yomitan rule repeats: `${id}\u0000${index}`
for (const transform of yomitan.transforms) {
    transform.rules.forEach((rule, index) => {
        const matches = [...(ownByShape.get(shape(rule)) ?? []), ...prefixRepeats(rule)];
        for (const m of matches) { repeated.add(`${m.transform}\u0000${m.index}`); }
        const fate = drop.has(transform.id) ? 'left out (measured harm)'
            : matches.length > 0 ? `made by own ${matches.map((m) => `${m.transform}[${m.index}]`).join(', ')}`
                : 'kept';
        provenance.push([transform.id, String(index), rule.type, rule.inflected ?? '', rule.deinflected ?? '', fate]);
    });
}

// The final set: own transforms with `both` where Yomitan repeats a rule,
// and the Yomitan rules kept.
const keptYomitan = new Set(provenance.filter((row) => row[5] === 'kept').map((row) => `${row[0]}\u0000${row[1]}`));
const transforms = [];
const counts = {own: 0, yomitan: 0, both: 0};
for (const transform of union.transforms) {
    if (transform.source === 'yomitan') {
        const original = yomitan.transforms.find((t) => t.id === transform.id);
        const rules = original.rules.filter((_, index) => keptYomitan.has(`${transform.id}\u0000${index}`))
            .map((rule) => (rule.type === 'replace' ? {...rule, conditionsIn: SPELT_IN, conditionsOut: SPELT_OUT} : rule));
        if (rules.length === 0) { continue; }
        counts.yomitan += rules.length;
        transforms.push({...transform, rules});
        continue;
    }
    const original = own.transforms.find((t) => t.id === transform.id);
    const sources = original.rules.map((_, index) => (repeated.has(`${transform.id}\u0000${index}`) ? 'both' : 'own'));
    const allBoth = sources.every((s) => s === 'both');
    const transformSource = allBoth ? 'both' : 'own';
    const rules = original.rules.map((rule, index) => {
        const {source: _source, ...rest} = rule;
        ++counts[sources[index]];
        return sources[index] === transformSource ? rest : {...rest, source: sources[index]};
    });
    transforms.push({...transform, source: transformSource, rules});
}
// Yomitan's transforms first, as the merge tool orders them.
const out = {schema: 1, conditions: union.conditions};
if (union.wordLists !== undefined) { out.wordLists = union.wordLists; }
out.transforms = transforms;
writeFileSync(outFile, formatTransforms(out));
if (option('--out', null) === null) {
    const header = [
        '# Every rule of Yomitan\'s Old Irish transforms (sources/yomitan.json, from ext/js/language/sga/old-irish-transforms.js at d3c54c1) and what the final transforms.json does with it; written by sources/build-final.mjs.',
        '# transform\trule\ttype\tinflected\tdeinflected\tin the final set',
    ];
    writeFileSync(join(here, 'yomitan-provenance.tsv'), [...header, ...provenance.map((row) => row.join('\t'))].join('\n') + '\n');
}
const ruleCount = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`${outFile}: ${transforms.length} transforms, ${ruleCount} rules (${counts.own} own, ${counts.both} both, ${counts.yomitan} yomitan); dropped Yomitan transforms: ${[...drop].join(', ') || 'none'}`);
