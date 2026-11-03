// SPDX-License-Identifier: GPL-3.0-or-later
// Assembles the Vietnamese pack from its sources:
//   - language.json's lookup.preprocessors from sources/own-processors.json;
//   - transforms.json as the union of sources/own.json and
//     sources/yomitan.json (tools/merge-transforms.mjs; Yomitan has no
//     Vietnamese transforms, so the union is the own rules).
//
//   node languages/vi/sources/build-own.mjs && node languages/vi/sources/build-pack.mjs

import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, '..');
const repo = join(pack, '..', '..');

const processors = JSON.parse(readFileSync(join(here, 'own-processors.json'), 'utf8'));
const language = JSON.parse(readFileSync(join(pack, 'language.json'), 'utf8'));
language.lookup.preprocessors = processors;
writeFileSync(join(pack, 'language.json'), formatJson(language));

execFileSync(process.execPath, [join(repo, 'tools', 'merge-transforms.mjs'), 'vi', '--force'], {stdio: 'inherit'});
