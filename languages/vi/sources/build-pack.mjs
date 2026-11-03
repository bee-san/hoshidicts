// SPDX-License-Identifier: GPL-3.0-or-later
// Assembles the Vietnamese pack from its sources, or a scratch copy of it with
// another rule set for measurement (docs/languages.md 14 step 5):
//
//   node languages/vi/sources/build-own.mjs
//   node languages/vi/sources/build-pack.mjs [--set own|yomitan|union|final] [--out <languages dir>]
//
// Sets:
//   own      sources/own-processors.json and sources/own.json;
//   yomitan  sources/yomitan-processors.json (Yomitan's capitalization
//            processors and normalizeDiacritics) and no rules: Yomitan has no
//            Vietnamese transforms;
//   union    the own processors with Yomitan's normalizeDiacritics after
//            toneMarks (decapitalize and capitalizeFirstLetter are in both),
//            and the own rules;
//   final    the set this pack ships (the default).
// --drop <id,...> leaves processors out of a scratch copy.
// Without --out the pack itself (languages/vi) is written; with --out a copy
// of the pack (language.json, transforms.json, README.md, tests/) is written
// to <dir>/vi, for `hoshidicts-cli --languages <dir>`.

import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, '..');
const repo = join(pack, '..', '..');

const read = (file) => JSON.parse(readFileSync(join(here, file), 'utf8'));

function processorSet(set) {
  const own = read('own-processors.json');
  const yomitan = read('yomitan-processors.json');
  const byId = (list, id) => list.find((p) => p.id === id);
  switch (set) {
    case 'own':
      return own;
    case 'yomitan':
      return yomitan;
    case 'union':
    case 'final': {
      const out = [];
      for (const p of own) {
        out.push(p);
        if (p.id === 'toneMarks') out.push(byId(yomitan, 'normalizeDiacritics'));
      }
      return out;
    }
    default:
      throw new Error(`unknown set ${set}`);
  }
}

function rulesFor(set, outFile) {
  if (set === 'yomitan') {
    writeFileSync(outFile, formatTransforms({schema: 1, conditions: {}, transforms: []}));
    return;
  }
  execFileSync(process.execPath, [join(repo, 'tools', 'merge-transforms.mjs'), 'vi', '--force', '--out', outFile], {stdio: 'inherit'});
}

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const set = option('--set', 'final');
const outDir = option('--out', null);
// --drop id,id: leave these processors out of the set (measurements only).
const drop = new Set((option('--drop', '') ?? '').split(',').filter(Boolean));
if (drop.size > 0 && outDir === null) throw new Error('--drop is for scratch copies; give --out');

const language = JSON.parse(readFileSync(join(pack, 'language.json'), 'utf8'));
language.lookup.preprocessors = processorSet(set).filter((p) => !drop.has(p.id));

if (outDir === null) {
  if (set !== 'final') throw new Error('only --set final writes the pack itself; give --out for the others');
  writeFileSync(join(pack, 'language.json'), formatJson(language));
  rulesFor(set, join(pack, 'transforms.json'));
} else {
  const target = join(resolve(outDir), 'vi');
  rmSync(target, {recursive: true, force: true});
  mkdirSync(target, {recursive: true});
  writeFileSync(join(target, 'language.json'), formatJson(language));
  rulesFor(set, join(target, 'transforms.json'));
  for (const extra of ['README.md', 'tests']) {
    if (existsSync(join(pack, extra))) cpSync(join(pack, extra), join(target, extra), {recursive: true});
  }
}
