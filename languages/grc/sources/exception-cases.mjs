// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the `exc` rows at the end of tests/cases.tsv: each exception reaches its term with the trace `exceptions`,
// and three negatives (ζά before a form without accents, which no other rule reaches) keep the whole words whole.
//
//   node languages/grc/sources/exception-cases.mjs [build/hoshidicts-cli]

import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {exceptionList} from './own-rules.mjs';
import {NFC, NFD, stripAccents} from './greek.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'tests', 'cases.tsv');
const MARK = '# exceptions: written by sources/exception-cases.mjs from own-rules.mjs (README.md, "Rule provenance"); do not edit below.';
const text = readFileSync(file, 'utf8');
const head = text.includes(MARK) ? text.slice(0, text.indexOf(MARK)) : text.endsWith('\n') ? text : text + '\n';
const list = exceptionList();
const rows = list.map(({form, term}) => `exc\t1\t${form}\t${term}\t*\texceptions`);
const cli = process.argv[2] ?? 'build/hoshidicts-cli';
const languages = join(here, '..', '..');
const run = (args, input) => execFileSync(cli, ['--languages', languages, ...args], {input, encoding: 'utf8', maxBuffer: 1 << 30});
const probes = list.map(({form, term}) => ({text: 'ζά' + stripAccents(NFC(NFD(form).replace(/\u0300/gu, '\u0301'))), term: 'ζά' + term}));
const variants = run(['preprocess', 'grc', '--stdin', '--all-options'], probes.map((p) => p.text).join('\n') + '\n').trim().split('\n')
  .map((l) => JSON.parse(l).variants.map((v) => v.text));
const flat = [...new Set(variants.flat())];
const reached = new Map(run(['deinflect', 'grc', '--stdin', '--all-options'], flat.join('\n') + '\n').trim().split('\n')
  .map((l) => JSON.parse(l)).map((d) => [d.input, new Set(d.results.map((r) => r.text))]));
let probesWritten = 0;
probes.forEach((p, i) => {
  if (probesWritten >= 3 || variants[i].some((v) => reached.get(v)?.has(p.term))) return;
  ++probesWritten;
  rows.push(`exc\t0\t${p.text}\t${p.term}\t*\t*`);
});
writeFileSync(file, head + MARK + '\n' + rows.join('\n') + '\n');
console.log(`${file}: ${rows.length} exception rows`);
