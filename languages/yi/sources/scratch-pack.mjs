#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes a copy of this pack into <dir>/yi with the processors named, for
// tools/check-yomitan.mjs and the measurements (hoshidicts-cli --languages
// <dir>). Processors are picked by id from language.json and from
// sources/yomitan-processors.json (Yomitan's four, ported); the copy's other
// files are this pack's.
//
//   node languages/yi/sources/scratch-pack.mjs <dir> --pre <id,...> --post <id,...> [--transforms <file>]
//
// `--pre yomitan --post yomitan` takes Yomitan's own lists. `--transforms`
// copies a rule file over the copy's transforms.json.

import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson} from '../../../tools/lib/json.mjs';

const pack = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dir = args[0];
const option = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
};
if (dir === undefined || dir.startsWith('-')) {
    console.error('usage: node languages/yi/sources/scratch-pack.mjs <dir> --pre <id,...> --post <id,...> [--transforms <file>]');
    process.exit(2);
}
const language = JSON.parse(readFileSync(join(pack, 'language.json'), 'utf8'));
const yomitan = JSON.parse(readFileSync(join(pack, 'sources', 'yomitan-processors.json'), 'utf8'));
const known = new Map([...language.lookup.preprocessors, ...language.lookup.postprocessors,
    ...yomitan.preprocessors, ...yomitan.postprocessors].map((p) => [p.id, p]));
const pick = (list, fallback, yomitanList) => {
    if (list === undefined) { return fallback; }
    if (list === 'yomitan') { return yomitanList; }
    if (list === '') { return []; }
    return list.split(',').map((id) => {
        const p = known.get(id);
        if (p === undefined) { throw new Error(`no processor ${id}`); }
        return p;
    });
};
language.lookup.preprocessors = pick(option('--pre'), language.lookup.preprocessors, yomitan.preprocessors);
language.lookup.postprocessors = pick(option('--post'), language.lookup.postprocessors, yomitan.postprocessors);

const out = join(dir, 'yi');
rmSync(out, {recursive: true, force: true});
mkdirSync(dir, {recursive: true});
cpSync(pack, out, {recursive: true});
writeFileSync(join(out, 'language.json'), formatJson(language));
const transforms = option('--transforms');
if (transforms !== undefined) { cpSync(transforms, join(out, 'transforms.json')); }
console.log(`${out}: preprocessors ${language.lookup.preprocessors.map((p) => p.id).join(', ') || 'none'}; postprocessors ${language.lookup.postprocessors.map((p) => p.id).join(', ') || 'none'}`);
