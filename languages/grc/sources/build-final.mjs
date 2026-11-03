#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/grc/transforms.json, the final rule set (docs/languages.md,
// section 14 step 5), and sources/yomitan-provenance.tsv:
//
//   node languages/grc/sources/build-final.mjs
//
// The final set is the union of sources/own.json and sources/yomitan.json
// (tools/merge-transforms.mjs) less:
//
// - every Yomitan rule an own rule repeats: the own rule, which makes the
//   same deinflection, is marked `source: "both"`, and the trace names the
//   form more exactly (ind-act-2sg, gen-sg). Two rules make the same
//   deinflection when they replace the same ending with the same text, both
//   on a text without conditions, with a part of speech in common, in
//   transforms of the same form (CATEGORY);
// - the Yomitan rules of LEFT_OUT, for the measurements of README.md.
//
// Yomitan's other rules stay, `source: "yomitan"`, in their transforms after
// the own ones. They read the text without diacritics (λυεις, ανθρωπω), which
// the own rules leave to the dictionary's form-of rows.
//
// sources/yomitan-provenance.tsv lists every Yomitan rule with the own
// transforms that make its deinflection, `kept` or `left out`.
//
// It also rewrites tests/yomitan.tsv (Yomitan's test, as
// tools/port-yomitan-tests.mjs writes it): the reasons column becomes `*`
// (the final rules reach most lemmas through own transforms, whose ids are not
// Yomitan's), and a row whose only rule is left out becomes a negative.

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

// Yomitan rules removed for measured harm (README.md, "Rule provenance").
const LEFT_OUT = {
  'nominalization ος→εω': 'a derivation: reads -ος nouns and adjectives as -έω verbs (φίλος → φιλέω, καλός → καλέω, οἶκος → οἰκέω)',
};

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
    let fate;
    if (found.size > 0) {
      ++matched;
      fate = [...found].join(' ');
    } else if (LEFT_OUT[name]) {
      fate = 'left out';
      leftOut.push({transform: t.id, rule: y, reason: LEFT_OUT[name]});
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
  '# Every rule of sources/yomitan.json (Yomitan d3c54c1, GPL-3.0-or-later, Copyright (C) 2025-2026 Yomitan Authors) and what transforms.json',
  '# does with it, written by sources/build-final.mjs: the own transforms whose rule makes the same deinflection (marked source "both"), "kept"',
  '# (source "yomitan") or "left out" (README.md, "Rule provenance").',
  '# transform\trule\tdeinflection\tin transforms.json',
];
writeFileSync(join(here, 'yomitan-provenance.tsv'), [...header, ...rows.map((r) => r.join('\t'))].join('\n') + '\n');

// tests/yomitan.tsv
const testFile = join(here, '..', 'tests', 'yomitan.tsv');
const NOTE = [
  '# Converted by tools/port-yomitan-tests.mjs; sources/build-final.mjs then sets the reasons column to * (any trace): the final rules reach',
  '# these lemmas through this pack\'s own transforms, whose ids are not Yomitan\'s. A row whose rule the final set leaves out is a negative',
  `# (valid 0): ${leftOut.map((x) => `${x.transform} ${x.rule.inflected} → ${x.rule.deinflected}`).join(', ') || 'none'} (README.md, "Rule provenance").`,
];
const leftOutIds = new Set(leftOut.map((x) => x.transform));
const test = readFileSync(testFile, 'utf8').split('\n').filter((line) => !line.startsWith('# Converted by tools/port-yomitan-tests.mjs') &&
  !line.startsWith('# these lemmas through') && !line.startsWith('# (valid 0)'));
let negatives = 0;
writeFileSync(testFile, test.flatMap((line) => {
  if (line.startsWith('# category')) return [...NOTE, line];
  if (line === '' || line.startsWith('#')) return [line];
  const cells = line.split('\t');
  const reasons = cells[5].split('|');
  if (reasons.length === 1 && leftOutIds.has(reasons[0])) {
    cells[1] = '0';
    ++negatives;
  }
  cells[5] = '*';
  return [cells.join('\t')];
}).join('\n'));

const count = (source) => transforms.reduce((n, t) => n + t.rules.filter((r) => (r.source ?? t.source) === source)
  .reduce((m, r) => m + (r.type === 'circumfix' ? r.prefixes.length * r.suffixes.length : 1), 0), 0);
console.log(`grc: union ${union.transforms.length} transforms, ${unionRules} rule rows; final ${transforms.length} transforms: ` +
  `${count('own')} own, ${count('both')} both, ${count('yomitan')} yomitan rules; ${matched} of ${rows.length} Yomitan rules repeat an own rule, ` +
  `${rows.filter((r) => r[3] === 'kept').length} kept, ${leftOut.length} left out; yomitan.tsv: ${negatives} rows made negatives`);
