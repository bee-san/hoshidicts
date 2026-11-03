// SPDX-License-Identifier: GPL-3.0-or-later
// The WebAssembly numbers of README.md (Measurements 5). Not run by any test.
//
//   node languages/grc/sources/wasm.mjs <hachidori checkout> <imported wty-grc-en> [runs]
//
// For Hachidori's prebuilt single-thread and threaded engines (extension/vendor/), in `runs` fresh engines
// (default 10): hdw_language_load of this pack's language.json and transforms.json, and the live heap it adds
// (hdw_memory_stats). In the last engine the imported dictionary is added, paged, and every text of
// sources/benchmark-words.txt is looked up with hdw_lookup (16 results, scan length 16, default options) in
// 6 passes, the first dropped.

import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [hachidori, dictionary, runsArg] = process.argv.slice(2);
const language = readFileSync(join(here, '..', 'language.json'), 'utf8');
const transforms = readFileSync(join(here, '..', 'transforms.json'), 'utf8');
const words = readFileSync(join(here, 'benchmark-words.txt'), 'utf8').split('\n').filter(Boolean);
const runs = Number(runsArg ?? 10);
const q = (a, f) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(f * a.length))];

for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
  const {default: create} = await import(join(resolve(hachidori), 'extension', 'vendor', `${variant}.mjs`));
  const loads = [];
  const heaps = [];
  let M = null;
  for (let i = 0; i < runs; ++i) {
    M = await create();
    const live = () => JSON.parse(M.ccall('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes;
    const before = live();
    const t = performance.now();
    if (M.ccall('hdw_language_load', 'number', ['string', 'string'], [language, transforms]) !== 1) throw new Error(M.ccall('hdw_last_error', 'string', [], []));
    loads.push(performance.now() - t);
    heaps.push(live() - before);
  }
  M.FS.mkdirTree('/dicts/grc');
  for (const f of readdirSync(dictionary)) M.FS.writeFile(`/dicts/grc/${f}`, readFileSync(join(dictionary, f)));
  if (!M.ccall('hdw_add_dict', 'number', ['string', 'number', 'number', 'number'], ['/dicts/grc', 0, 1, 1])) throw new Error(M.ccall('hdw_last_error', 'string', [], []));
  const times = [];
  for (let pass = 0; pass < 6; ++pass) {
    for (const w of words) {
      const t = performance.now();
      M.ccall('hdw_lookup', 'string', ['string', 'number', 'number', 'string'], [w, 16, 16, JSON.stringify({language: 'grc'})]);
      if (pass > 0) times.push(performance.now() - t);
    }
  }
  console.log(`${variant}: hdw_language_load median ${q(loads, 0.5).toFixed(1)} ms (min ${q(loads, 0).toFixed(1)}, max ${q(loads, 1).toFixed(1)}) over ${runs} engines, ` +
    `heap +${q(heaps, 0.5)} bytes; hdw_lookup p50 ${q(times, 0.5).toFixed(3)} ms, p95 ${q(times, 0.95).toFixed(3)} ms (${times.length} lookups)`);
}
