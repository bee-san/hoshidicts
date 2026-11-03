// SPDX-License-Identifier: GPL-3.0-or-later
// The numbers of README.md, Rule provenance: each rule or processor the pack
// removed after its first commit is added back to the final pack, and each one
// it kept is taken out, in a scratch copy; both texts are looked up with the
// copy and with the pack, and judge-real.py judges every first result that
// differs (sources/judgements.tsv). Not run by any test.
//
//   node languages/vi/sources/history.mjs <work dir> <imported wty-vi-en> <hover dir>...
//
// Each hover dir holds hover.txt (make-hovers.py). Needs build/lookup-batch-vi
// (the header of lookup-batch.cpp) and git, for the first commit's rules.

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, cpSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, '..');
const repo = join(pack, '..', '..');
const [work, dictionary, ...hoverDirs] = process.argv.slice(2);
if (!work || !dictionary || hoverDirs.length === 0) throw new Error('usage: history.mjs <work dir> <imported dictionary> <hover dir>...');
const FIRST = '5a12101';  // vi: own rules
const firstOwn = JSON.parse(execFileSync('git', ['-C', repo, 'show', `${FIRST}:languages/vi/sources/own.json`], {encoding: 'utf8'}));
const firstProcessors = JSON.parse(execFileSync('git', ['-C', repo, 'show', `${FIRST}:languages/vi/sources/own-processors.json`], {encoding: 'utf8'}));

const transform = (t, id) => t.transforms.find((x) => x.id === id);
const processor = (l, id) => l.lookup.preprocessors.find((p) => p.id === id);
const variants = {
  'add back: partial reduplication by pattern (first commit)': {transforms: (t) => {
    transform(t, 'partialReduplication').rules = transform(firstOwn, 'partialReduplication').rules;
  }},
  'add back: one word said twice (X X)': {transforms: (t) => {
    for (const rule of transform(t, 'reduplication').rules) rule.pattern = rule.pattern.replace('(?:\\1(', '(?:\\1|\\1(');
  }},
  'add back: a word repeated after a phrase (A B B, with X X; first commit)': {transforms: (t) => {
    t.transforms.push({...transform(firstOwn, 'reduplication'), id: 'firstReduplication'});
  }},
  'add back: capitalize every word': {language: (l) => {
    const words = firstProcessors.find((p) => p.id === 'capitalizeWords');
    const at = l.lookup.preprocessors.findIndex((p) => p.id === 'capitalizeFirstLetter');
    l.lookup.preprocessors.splice(at + 1, 0, {...words, variants: [words.variants[0].filter((s) => s.case !== 'lower')]});
  }},
  'take out: the capitalised variant of hyphensToSpaces': {language: (l) => { processor(l, 'hyphensToSpaces').variants.pop(); }},
  'take out: toneMarks (normalizeDiacritics stays)': {language: (l) => {
    l.lookup.preprocessors = l.lookup.preprocessors.filter((p) => p.id !== 'toneMarks');
  }},
};

const batch = join(repo, 'build', 'lookup-batch-vi');
const run = (languages, hovers, out) => {
  if (!existsSync(out)) execFileSync('sh', ['-c', `"${batch}" "${languages}" vi "${dictionary}" < "${hovers}" > "${out}"`]);
};
mkdirSync(work, {recursive: true});
const finalDir = join(work, 'final');
rmSync(finalDir, {recursive: true, force: true});
mkdirSync(finalDir);
cpSync(pack, join(finalDir, 'vi'), {recursive: true});
for (const hovers of hoverDirs) rmSync(join(work, `${basename(hovers)}-final.jsonl`), {force: true});
for (const [name, variant] of Object.entries(variants)) {
  const dir = join(work, `variant-${Object.keys(variants).indexOf(name)}`);
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(dir);
  cpSync(pack, join(dir, 'vi'), {recursive: true});
  const language = JSON.parse(readFileSync(join(dir, 'vi', 'language.json'), 'utf8'));
  const transforms = JSON.parse(readFileSync(join(dir, 'vi', 'transforms.json'), 'utf8'));
  variant.language?.(language);
  variant.transforms?.(transforms);
  writeFileSync(join(dir, 'vi', 'language.json'), formatJson(language));
  writeFileSync(join(dir, 'vi', 'transforms.json'), formatTransforms(transforms));
  console.log(`== ${name}`);
  for (const hovers of hoverDirs) {
    const text = basename(hovers);
    const base = join(work, `${text}-final.jsonl`);
    run(finalDir, join(hovers, 'hover.txt'), base);
    const out = join(dir, `${text}.jsonl`);
    rmSync(out, {force: true});
    run(dir, join(hovers, 'hover.txt'), out);
    const report = execFileSync('python3', [join(here, 'judge-real.py'), base, out, join(here, 'judgements.tsv'), '1000000', '1'], {encoding: 'utf8'});
    const lines = report.trim().split('\n');
    console.log(`  ${text}: ${lines[0].replace(/^hovers \d+; /, '').replace("Yomitan's processors", 'the pack')}`);
    for (const line of lines.slice(1)) console.log(`    ${line.trim()}`);
  }
}
