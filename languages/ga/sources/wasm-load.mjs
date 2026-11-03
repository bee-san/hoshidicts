#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Times hdw_language_load of this pack in fresh instances of Hachidori's
// prebuilt WebAssembly engines (single-thread and threaded) and reports the
// live heap it adds (hdw_memory_stats before and after), for README.md
// (Measurements 5; docs/languages.md 13). Not run by any test:
//
//   node languages/ga/sources/wasm-load.mjs <hachidori checkout> [instances]
//
// The pack is read from this checkout's languages/ga/.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [hachidori, n = '10'] = process.argv.slice(2);
if (!hachidori) {
    console.error('usage: node languages/ga/sources/wasm-load.mjs <hachidori checkout> [instances]');
    process.exit(2);
}
const languageJson = readFileSync(join(here, '..', 'language.json'), 'utf8');
const transformsJson = readFileSync(join(here, '..', 'transforms.json'), 'utf8');
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(hachidori, 'extension', 'vendor', `${variant}.mjs`));
    const times = [];
    const heaps = [];
    let keys = '';
    for (let i = 0; i < Number(n); ++i) {
        const M = await create();
        const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
        call('hdw_init_storage', 'number', ['number'], [0]);
        const before = JSON.parse(call('hdw_memory_stats', 'string', [], []));
        const t0 = performance.now();
        const ok = call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
        const t1 = performance.now();
        const after = JSON.parse(call('hdw_memory_stats', 'string', [], []));
        if (ok !== 1) { throw new Error(`${variant}: hdw_language_load failed: ${call('hdw_last_error', 'string', [], [])}`); }
        // mallinfo's in-use bytes, under whichever name the bindings report it.
        const live = (s) => s.liveAllocatedBytes ?? s.allocated ?? s.uordblks;
        if (live(after) === undefined) { throw new Error(`${variant}: hdw_memory_stats has no live-heap field: ${Object.keys(after).join(', ')}`); }
        keys = Object.keys(after).join(', ');
        times.push(t1 - t0);
        heaps.push(live(after) - live(before));
    }
    console.log(JSON.stringify({variant, instances: times.length, loadMedianMs: Number(median(times).toFixed(2)),
        loadMinMs: Number(Math.min(...times).toFixed(2)), loadMaxMs: Number(Math.max(...times).toFixed(2)),
        heapMedianBytes: median(heaps), heapMinBytes: Math.min(...heaps), heapMaxBytes: Math.max(...heaps), memoryStatsKeys: keys}));
}
process.exit(0);
