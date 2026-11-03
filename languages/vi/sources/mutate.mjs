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
import {PARTIAL_BASES, levelled} from './build-own.mjs';

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
  'toneMarks: ọa made oà': {language: (l) => {
    const all = byId(l, 'toneMarks').variants[0][0].map;
    all['ọa '] = 'oà ';
  }},
  'toneMarks: final ỏe made oé': {language: (l) => {
    const end = byId(l, 'toneMarks').variants[0][1].map;
    end['ỏe'] = 'oé';
  }},
  'toneMarks: no key Ủy ': {language: (l) => { delete byId(l, 'toneMarks').variants[0][0].map['Ủy ']; }},
  'alternateIY: no key " ky "': {language: (l) => { delete byId(l, 'alternateIY').variants[1][0].map[' ky ']; }},
  // Equivalent: decapitalizeFirstLetter, alternateIY and capitalizeFirstLetter
  // make the same variant (Mĩ và → mĩ và → mỹ và → Mỹ và) in three steps.
  'alternateIY: no start key Mĩ ': {equivalent: true, language: (l) => { delete byId(l, 'alternateIY').variants[0][1].map['Mĩ ']; }},
  'hyphensToSpaces: no key -v': {language: (l) => { delete byId(l, 'hyphensToSpaces').variants[1][0].map['-v']; }},
  'hyphensToSpaces: no key -ấ': {language: (l) => { delete byId(l, 'hyphensToSpaces').variants[1][0].map['-ấ']; }},
  'hyphens inside words (wordInternal)': {language: (l) => { l.text.wordInternal = '[\\-]'; }},
  'character resolution': {language: (l) => { l.lookup.searchResolution = 'character'; }},
  'four-syllable reduplication: a sắc -a syllable': {transforms: (t) => {
    for (const rule of t.transforms.find((x) => x.id === 'reduplication').rules) rule.pattern = rule.pattern.replace('[aà]', '[aàá]');
  }},
  'four-syllable reduplication: và accepted': {transforms: (t) => {
    for (const rule of t.transforms.find((x) => x.id === 'reduplication').rules) rule.pattern = rule.pattern.replace('(?!và )', '');
  }},
  'partial reduplication of khác keeps the final c': {transforms: (t) => {
    const rule = t.transforms.find((x) => x.id === 'partialReduplication').rules.find((r) => r.deinflected === 'khác');
    rule.inflected = 'khac khác';
  }},
  'partial reduplication of sáng': addBase('sáng'),
  'se sẽ read as sẽ': {transforms: (t) => {
    for (const rule of t.transforms.find((x) => x.id === 'partialReduplication').rules) if (rule.deinflected === 'khẽ' && rule.inflected.endsWith(' sẽ')) rule.deinflected = 'sẽ';
  }},
  ...Object.fromEntries(PARTIAL_BASES.map((entry) => {
    const base = Array.isArray(entry) ? entry[0] : entry;
    return [`partial reduplication without ${base}`, {transforms: (t) => {
      const transform = t.transforms.find((x) => x.id === 'partialReduplication');
      transform.rules = transform.rules.filter((r) => !r.inflected.endsWith(' ' + base));
    }}];
  })),
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
  if (failures.length === 0 && !mutation.equivalent) ++survived;
  const verdict = failures.length ? 'killed  ' : mutation.equivalent ? 'equivalent' : 'SURVIVED';
  console.log(`${verdict} ${name}${failures.length ? `: ${failures.length} failing rows, e.g. ${failures[0].replace(/^FAIL vi: /, '')}` : ''}`);
}
const equivalent = Object.values(mutations).filter((m) => m.equivalent).length;
console.log(`${Object.keys(mutations).length} mutations (${equivalent} equivalent), ${survived} survived`);
process.exitCode = survived ? 1 : 0;
