#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and heap in Hachidori's WebAssembly engine (docs/languages.md
// 13): each run creates a fresh engine module, loads the pack with
// hdw_language_load and reads the allocator's live bytes (hdw_memory_stats,
// mallinfo) before and after. Not run by any test.
//
//   node languages/zh/sources/wasm-load.mjs <hachidori checkout> [runs] [variant]
//
// variant: hoshidicts-threaded (default) or hoshidicts (single-thread), the
// builds in <checkout>/extension/vendor/. The pack is read from
// <checkout>/extension/vendor/languages/zh/, which node
// scripts/sync-languages.mjs copies from the checkout's third_party/hoshidicts.

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';

const [checkout, runsArgument = '10', variant = 'hoshidicts-threaded'] = process.argv.slice(2);
if (checkout === undefined) {
    console.error('usage: node languages/zh/sources/wasm-load.mjs <hachidori checkout> [runs] [variant]');
    process.exit(2);
}
const packDir = join(checkout, 'extension', 'vendor', 'languages', 'zh');
const languageJson = readFileSync(join(packDir, 'language.json'), 'utf8');
const transformsName = JSON.parse(languageJson).lookup?.transforms;
const transformsJson = transformsName ? readFileSync(join(packDir, transformsName), 'utf8') : '';
const {default: create} = await import(pathToFileURL(join(checkout, 'extension', 'vendor', `${variant}.mjs`)).href);

const times = [];
const heaps = [];
for (let i = 0; i < Number(runsArgument); ++i) {
    const M = await create();
    const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
    call('hdw_init_storage', 'number', ['number'], [0]);
    const before = JSON.parse(call('hdw_memory_stats', 'string', [], []));
    const started = performance.now();
    const ok = call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
    const elapsed = performance.now() - started;
    if (ok !== 1) { throw new Error(call('hdw_last_error', 'string', [], [])); }
    const after = JSON.parse(call('hdw_memory_stats', 'string', [], []));
    const live = (s) => s.liveAllocatedBytes;
    times.push(elapsed);
    heaps.push(live(after) - live(before));
}
const sorted = [...times].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(JSON.stringify({variant, runs: times.length, loadMsMedian: Number(median.toFixed(2)),
    loadMsMin: Number(sorted[0].toFixed(2)), loadMsMax: Number(sorted.at(-1).toFixed(2)), heapBytes: heaps[0],
    languageBytes: languageJson.length, transformsBytes: transformsJson.length}));
