#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes transforms.json, the final rule set (docs/languages.md 14 step 5), sources/yomitan-provenance.tsv and
// tests/yomitan.tsv:   node languages/grc/sources/build-final.mjs
//
// The final set is the union of sources/own.json and sources/yomitan.json less every Yomitan rule an own rule
// repeats (the same ending replaced by the same text, on a text without conditions, with a part of speech in
// common, in the own transform of the same form, CATEGORY; the own rule is marked `source: "both"`) and the
// Yomitan rules of LEFT_OUT. A repeated rule in KEEP stays: it reaches texts the own rule's stem minimum leaves
// out. Yomitan's other rules stay, `source: "yomitan"`, after the own transforms.
//
// tests/yomitan.tsv (as tools/port-yomitan-tests.mjs or this script wrote it) gets the reasons `*` (the own
// transforms' ids are not Yomitan's); a row is a negative when every Yomitan rule that makes it is left out with
// `rows: 'negative'`.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJson} from '../../../tools/lib/json.mjs';
import {mergeTransforms} from '../../../tools/merge-transforms.mjs';
import {format} from './own-rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => parseJson(readFileSync(join(here, name), 'utf8'), name);
const own = read('own.json');
const yomitan = read('yomitan.json');

// The union must merge (conditions agree).
const union = mergeTransforms(own, yomitan).transforms;
const unionRules = union.transforms.reduce((n, t) => n + t.rules.length, 0);

const CATEGORY = {
  '2nd person singular present active indicative': /^ind-act-2sg$/,
  '3rd person singular present active indicative': /^ind-act-3sg$/,
  '1st person plural present active indicative': /^ind-act-1pl$/,
  '2nd person plural present active indicative': /^ind-act-2pl$/,
  '3rd person plural present active indicative': /^ind-act-3pl$/,
  '2nd person singular present middle indicative': /^ind-mid-2sg$/,
  '3rd person singular present middle indicative': /^ind-mid-3sg$/,
  '1st person plural present middle indicative': /^ind-mid-1pl$/,
  '2nd person plural present middle indicative': /^ind-mid-2pl$/,
  '3rd person plural present middle indicative': /^ind-mid-3pl$/,
  'genitive singular': /^gen-sg$/,
  'dative singular': /^dat-sg$/,
  'accusative singular': /^acc-sg$/,
  'vocative singular': /^voc-sg$/,
  'nominative plural': /^(nom-pl|na-pl)$/,
  'genitive plural': /^gen-pl$/,
  'dative plural': /^dat-pl$/,
  'accusative plural': /^(acc-pl|na-pl)$/,
  'vocative plural': /^(nom-pl|na-pl)$/,
  'accusative singular masculine': /^acc-sg$/,
  'nominalization': /^$/,
};

// Yomitan rules removed for measured harm (README.md, "Rule provenance"). `rows` says what their rows of
// tests/yomitan.tsv become: negatives, or positives that another rule of the final set reads.
const LEFT_OUT = {
  'nominalization ος→εω': {reason: 'a derivation: reads -ος nouns and adjectives as -έω verbs (φίλος → φιλέω, καλός → καλέω, οἶκος → οἰκέω)', rows: 'negative'},
  'dative singular ω→ον': {reason: 'recovers no row of any test file; in real text it makes 15 first results wrong (μόρῳ → μόρον, κεφαλαίῳ → κεφάλαιον, δημοσίῳ → δημόσιον) and 2 right (μαντηίῳ → μαντεῖον, φαρμάκῳ → φάρμακον); its row of tests/yomitan.tsv is the own dual', rows: 'positive'},
  'dative singular ω→ος': {reason: 'recovers no row of any test file; in real text it makes 2 first results wrong (μάθω → μάθος, ἥλω → ἧλος), changes 1 wrong one (σθένω) and makes none right; its row of tests/yomitan.tsv is the own dual', rows: 'positive'},
  'dative singular α→ας': {reason: 'recovers no row of any test file and adds a false candidate on tests/cases.tsv; its row of tests/yomitan.tsv is the own vocative', rows: 'positive'},
};
// Yomitan rules kept although an own rule makes the same deinflection, for a measured gain: the own rule's stem
// minimum leaves out a one-letter stem (ᾦων → ᾦον).
const KEEP = new Set(['genitive plural ων→ον']);

const leaves = (conditions, name) => {
  const c = conditions[name];
  return c.subConditions === undefined ? [name] : c.subConditions.flatMap((s) => leaves(conditions, s));
};
const leafSet = (names) => new Set(names.flatMap((n) => leaves(union.conditions, n)));
const overlaps = (a, b) => [...leafSet(a)].some((x) => leafSet(b).has(x));

/** The [inflected, deinflected] pairs of an own suffix rule or suffix-only cross product. */
const pairsOf = (r) => (r.type === 'suffix' ? [[r.inflected, r.deinflected]]
  : r.type === 'circumfix' && r.prefixes.length === 1 && r.prefixes[0][0] === '' && r.prefixes[0][1] === '' ? r.suffixes : []);

const both = new Set(); // `${transform index}/${rule index}/${pair index}`
const names = new Set(); // LEFT_OUT and KEEP entries that name a rule
const kept = new Map(); // Yomitan transform id -> its kept rules
const rows = [];
let matched = 0;
const leftOut = [];
for (const t of yomitan.transforms) {
  const category = CATEGORY[t.id];
  if (category === undefined) throw new Error(`no own category for Yomitan's ${t.id}`);
  t.rules.forEach((y, i) => {
    const found = new Set();
    own.transforms.forEach((o, ti) => {
      if (!category.test(o.id)) return;
      o.rules.forEach((r, ri) => {
        if (r.conditionsIn.length !== 0 || !overlaps(y.conditionsOut, r.conditionsOut) || r.then) return;
        pairsOf(r).forEach(([inf, def], pi) => {
          if (inf === y.inflected && def === y.deinflected) {
            found.add(o.id);
            both.add(`${ti}/${ri}/${pi}`);
          }
        });
      });
    });
    const name = `${t.id} ${y.inflected}→${y.deinflected}`;
    if ((LEFT_OUT[name] || KEEP.has(name)) && !names.has(name)) names.add(name);
    let fate;
    if (found.size > 0) {
      ++matched;
      fate = [...found].join(' ');
      if (KEEP.has(name)) {
        fate += ' (kept)';
        if (!kept.has(t.id)) kept.set(t.id, {...t, rules: []});
        kept.get(t.id).rules.push(y);
      }
    } else if (LEFT_OUT[name]) {
      fate = 'left out';
      leftOut.push({transform: t.id, rule: y, ...LEFT_OUT[name]});
    } else {
      fate = 'kept';
      if (!kept.has(t.id)) kept.set(t.id, {...t, rules: []});
      kept.get(t.id).rules.push(y);
    }
    rows.push([t.id, String(i), `${y.inflected} → ${y.deinflected} (${y.conditionsOut.join(' ')})`, fate]);
  });
}

// Own transforms in order; a pair a Yomitan rule repeats becomes a rule of its own marked `both`.
let bothRules = 0;
const transforms = own.transforms.map((t, ti) => {
  const rules = [];
  t.rules.forEach((r, ri) => {
    const pairs = pairsOf(r);
    const marked = pairs.map((_, pi) => both.has(`${ti}/${ri}/${pi}`));
    if (!marked.some(Boolean)) {
      rules.push(r);
      return;
    }
    if (r.type === 'suffix') {
      rules.push({...r, source: 'both'});
      ++bothRules;
      return;
    }
    const {type: _type, prefixes: _prefixes, suffixes: _suffixes, ...shape} = r;
    const rest = pairs.filter((_, pi) => !marked[pi]);
    pairs.forEach(([inflected, deinflected], pi) => {
      if (!marked[pi]) return;
      rules.push({type: 'suffix', inflected, deinflected, ...shape, source: 'both'});
      ++bothRules;
    });
    if (rest.length > 0) rules.push({...r, suffixes: rest});
  });
  const allBoth = rules.every((r) => r.source === 'both');
  return {...t, source: allBoth ? 'both' : 'own', rules: allBoth ? rules.map(({source: _s, ...x}) => x) : rules};
});
for (const t of kept.values()) transforms.push({...t, source: 'yomitan'});

const conditions = {...own.conditions};
for (const [k, v] of Object.entries(yomitan.conditions)) if (!(k in conditions)) conditions[k] = v;
writeFileSync(join(here, '..', 'transforms.json'), format({schema: 1, conditions, transforms}));

const header = [
  '# Yomitan d3c54c1\'s rules (GPL-3.0-or-later, (C) 2025-2026 Yomitan Authors) in transforms.json, by build-final.mjs: the own transforms',
  '# that repeat each (source "both"), "kept" or "left out" (README.md, "Rule provenance").',
  '# transform\trule\tdeinflection\tin transforms.json',
];
writeFileSync(join(here, 'yomitan-provenance.tsv'), [...header, ...rows.map((r) => r.join('\t'))].join('\n') + '\n');

// tests/yomitan.tsv
const testFile = join(here, '..', 'tests', 'yomitan.tsv');
const NOTE = [
  '# Converted by tools/port-yomitan-tests.mjs; sources/build-final.mjs then sets the reasons column to * (any trace): the final rules reach',
  '# these lemmas through this pack\'s own transforms, whose ids are not Yomitan\'s. A row whose rule the final set leaves out is a negative',
  `# (valid 0): ${leftOut.filter((x) => x.rows === 'negative').map((x) => `${x.transform} ${x.rule.inflected} → ${x.rule.deinflected}`).join(', ') || 'none'} (README.md, "Rule provenance").`,
];
/** The Yomitan rules that make a row's deinflection, in the transform its reasons name (any transform for *). */
const rulesOf = (source, term, reasons) => yomitan.transforms.filter((t) => reasons === '*' || reasons === t.id)
  .flatMap((t) => t.rules.filter((y) => source.endsWith(y.inflected) && source.slice(0, source.length - y.inflected.length) + y.deinflected === term)
    .map((y) => `${t.id} ${y.inflected}→${y.deinflected}`));
const test = readFileSync(testFile, 'utf8').split('\n').filter((line) => !line.startsWith('# Converted by tools/port-yomitan-tests.mjs') &&
  !line.startsWith('# these lemmas through') && !line.startsWith('# (valid 0)'));
let negatives = 0;
writeFileSync(testFile, test.flatMap((line) => {
  if (line.startsWith('# category')) return [...NOTE, line];
  if (line === '' || line.startsWith('#')) return [line];
  const cells = line.split('\t');
  const made = rulesOf(cells[2], cells[3], cells[5]);
  if (made.length > 0 && made.every((name) => LEFT_OUT[name]?.rows === 'negative')) {
    cells[1] = '0';
    ++negatives;
  }
  cells[5] = '*';
  return [cells.join('\t')];
}).join('\n'));

for (const name of [...Object.keys(LEFT_OUT), ...KEEP]) if (!names.has(name)) throw new Error(`no Yomitan rule ${name}`);
const count = (source) => transforms.reduce((n, t) => n + t.rules.filter((r) => (r.source ?? t.source) === source)
  .reduce((m, r) => m + (r.type === 'circumfix' ? r.prefixes.length * r.suffixes.length : 1), 0), 0);
console.log(`grc: union ${union.transforms.length} transforms, ${unionRules} rule rows; final ${transforms.length} transforms: ` +
  `${count('own')} own, ${count('both')} both, ${count('yomitan')} yomitan rules; ${matched} of ${rows.length} Yomitan rules repeat an own rule, ` +
  `${rows.filter((r) => r[3].endsWith('kept') || r[3].endsWith('(kept)')).length} kept, ${leftOut.length} left out; yomitan.tsv: ${negatives} rows made negatives`);
