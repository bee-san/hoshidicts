#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and heap of README.md (Measurements, performance). Not run by
// any test. In fresh instances of Hachidori's prebuilt WebAssembly engines
// (extension/vendor/hoshidicts.mjs, single-thread, and
// hoshidicts-threaded.mjs), times hdw_language_load of this pack and reports
// the growth of the live heap it causes (hdw_memory_stats).
//
//   node languages/de/sources/wasm-load.mjs <hachidori checkout> [instances] [pack dir]

import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const [hachidori, instances = '10', packDir = join(dirname(fileURLToPath(import.meta.url)), '..')] = process.argv.slice(2);
if (hachidori === undefined) {
    console.error('usage: node languages/de/sources/wasm-load.mjs <hachidori checkout> [instances] [pack dir]');
    process.exit(2);
}
const languageJson = readFileSync(join(packDir, 'language.json'), 'utf8');
const transformsJson = readFileSync(join(packDir, 'transforms.json'), 'utf8');
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(resolve(hachidori, 'extension', 'vendor', `${variant}.mjs`));
    const times = [];
    const heaps = [];
    let keys = null;
    for (let i = 0; i < Number(instances); ++i) {
        const engine = await create();
        const call = (name, ret, types, args) => engine.ccall(name, ret, types, args);
        call('hdw_init_storage', 'number', ['number'], [0]);
        const before = JSON.parse(call('hdw_memory_stats', 'string', [], []));
        const started = performance.now();
        const ok = call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
        const ms = performance.now() - started;
        const after = JSON.parse(call('hdw_memory_stats', 'string', [], []));
        if (ok !== 1) { throw new Error(`${variant}: hdw_language_load failed: ${call('hdw_last_error', 'string', [], [])}`); }
        keys ??= Object.keys(after);
        const live = (stats) => stats.liveAllocatedBytes ?? stats.uordblks;
        if (live(after) === undefined) { throw new Error(`${variant}: hdw_memory_stats has no live-heap field (${keys.join(', ')})`); }
        times.push(ms);
        heaps.push(live(after) - live(before));
    }
    console.log(`${variant}: hdw_language_load median ${median(times).toFixed(1)} ms (min ${Math.min(...times).toFixed(1)}, max ${Math.max(...times).toFixed(1)}) over ${times.length} fresh engines; live heap +${median(heaps)} bytes (min ${Math.min(...heaps)}, max ${Math.max(...heaps)}); hdw_memory_stats fields ${keys.join(', ')}`);
}
process.exit(0);
