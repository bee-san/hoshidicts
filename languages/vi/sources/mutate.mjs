// SPDX-License-Identifier: GPL-3.0-or-later
// The check of docs/languages.md section 14 step 7: each constraint, exclusion
// and processor of the pack is removed in turn from a scratch copy, the copy's
// tests/classes.json is written again and language-conformance-test runs on
// it; every mutation must make a test fail. Not run by any test.
//
//   node languages/vi/sources/mutate.mjs <scratch dir>

import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, formatTransforms} from '../../../tools/lib/json.mjs';
import {levelled} from './build-own.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, '..');
const repo = join(pack, '..', '..');
const scratch = process.argv[2];
if (!scratch) throw new Error('usage: mutate.mjs <scratch dir>');

const processors = (language) => language.lookup.preprocessors;
const byId = (language, id) => processors(language).find((p) => p.id === id);
const dropProcessor = (id) => ({language: (l) => { l.lookup.preprocessors = processors(l).filter((p) => p.id !== id); }});
const addBase = (base) => ({
  transforms: (t) => {
    const rules = t.transforms.find((x) => x.id === 'partialReduplication').rules;
    for (const form of levelled(base)) rules.push({type: 'wholeWord', inflected: `${form} ${base}`, deinflected: base, conditionsIn: [], conditionsOut: []});
  },
});

const mutations = {
  'toneMarks: no qu exclusion': {language: (l) => {
    for (const variant of byId(l, 'toneMarks').variants) {
      for (const step of variant) for (const key of Object.keys(step.map)) if (/^[qQ]/.test(key)) delete step.map[key];
    }
  }},
  'toneMarks: anywhere, not only at a syllable end': {language: (l) => {
    for (const variant of byId(l, 'toneMarks').variants) {
      const all = variant[0].map;
      for (const key of Object.keys(all)) if (!/^[qQ]/.test(key)) { all[key.trimEnd()] = all[key].trimEnd(); delete all[key]; }
    }
  }},
  'alternateIY: no h-cluster exclusion': {language: (l) => {
    for (const variant of byId(l, 'alternateIY').variants) {
      const end = variant[2].map;
      for (const key of Object.keys(end)) if (end[key] === key) delete end[key];
    }
  }},
  'alternateIY: also after ch': {language: (l) => {
    const [all, start, end] = byId(l, 'alternateIY').variants[0].map((step) => step.map);
    for (const [a, b] of [['chi', 'chy'], ['chị', 'chỵ']]) {
      all[` ${a} `] = ` ${b} `;
      start[`${a} `] = `${b} `;
      end[a] = b;
    }
  }},
  'hyphensToSpaces: no capitalised variant': {language: (l) => { byId(l, 'hyphensToSpaces').variants.pop(); }},
  'capitalizeWords back': {language: (l) => {
    const map = {};
    for (const c of 'abcdđghiklmnopqrstuvxyàáảãạăâêôơư') map[' ' + c] = ' ' + c.toUpperCase();
    processors(l).push({id: 'capitalizeWords', variants: [[{case: 'upperFirst'}, {map}]]});
  }},
  'partial reduplication of tối': addBase('tối'),
  'partial reduplication of lạ': addBase('lạ'),
  'partial reduplication of đủ': addBase('đủ'),
  'partial reduplication of chó (a noun)': addBase('chó'),
  'whole reduplication of one word (X X)': {transforms: (t) => {
    for (const rule of t.transforms.find((x) => x.id === 'reduplication').rules) rule.pattern = rule.pattern.replace('(?:\\1(', '(?:\\1|\\1(');
  }},
  'four-syllable reduplication: part of the onset': {transforms: (t) => {
    for (const rule of t.transforms.find((x) => x.id === 'reduplication').rules) rule.pattern = rule.pattern.replace(/\\3\[\^ [^\]]*\]\[\^ \]\*/, '\\3[^ ]+');
  }},
  ...Object.fromEntries(['normalizeUnicode', 'replaceEth', 'decapitalize', 'decapitalizeFirstLetter', 'hyphensToSpaces', 'toneMarks',
    'normalizeDiacritics', 'alternateIY', 'capitalizeFirstLetter'].map((id) => [`without ${id}`, dropProcessor(id)])),
};

const cli = join(repo, 'build', 'language-conformance-test');
let survived = 0;
for (const [name, mutation] of Object.entries(mutations)) {
  const dir = join(scratch, 'languages');
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(dir, {recursive: true});
  cpSync(pack, join(dir, 'vi'), {recursive: true});
  const languageFile = join(dir, 'vi', 'language.json');
  const transformsFile = join(dir, 'vi', 'transforms.json');
  const language = JSON.parse(readFileSync(languageFile, 'utf8'));
  const transforms = JSON.parse(readFileSync(transformsFile, 'utf8'));
  const before = JSON.stringify([language, transforms]);
  mutation.language?.(language);
  mutation.transforms?.(transforms);
  if (JSON.stringify([language, transforms]) === before) throw new Error(`${name}: the mutation changed nothing`);
  writeFileSync(languageFile, formatJson(language));
  writeFileSync(transformsFile, formatTransforms(transforms));
  execFileSync(process.execPath, [join(repo, 'tools', 'check-classes.mjs'), 'vi', '--write', '--languages', dir], {stdio: 'ignore'});
  const run = spawnSync(cli, [join(dir, 'vi')], {encoding: 'utf8'});
  const failures = (run.stdout + run.stderr).split('\n').filter((line) => line.startsWith('FAIL'));
  if (failures.length === 0) ++survived;
  console.log(`${failures.length ? 'killed  ' : 'SURVIVED'} ${name}${failures.length ? `: ${failures.length} failing rows, e.g. ${failures[0].replace(/^FAIL vi: /, '')}` : ''}`);
}
console.log(`${Object.keys(mutations).length} mutations, ${survived} survived`);
process.exitCode = survived ? 1 : 0;
