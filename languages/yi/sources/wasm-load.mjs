// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and heap in Hachidori's WebAssembly engines (docs/languages.md
// 13). Not run by any test.
//
//   node languages/yi/sources/wasm-load.mjs <hachidori checkout> [runs] [pack dir]
//
// For the single-thread (hoshidicts) and threaded (hoshidicts-threaded) builds
// in the checkout's extension/vendor/, `runs` fresh engines each load the copy
// of this pack in extension/vendor/languages/yi (node scripts/sync-languages.mjs)
// (or the pack in [pack dir]) with hdw_language_load. Prints the median and maximum load time and the live
// heap (hdw_memory_stats) after the load minus before.

import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';

const [checkout, runsArg, packArg] = process.argv.slice(2);
if (!checkout) { throw new Error('usage: wasm-load.mjs <hachidori checkout> [runs]'); }
const runs = Number(runsArg ?? 10);
const root = resolve(checkout);
const pack = packArg ? resolve(packArg) : join(root, 'extension', 'vendor', 'languages', 'yi');
const languageJson = readFileSync(join(pack, 'language.json'), 'utf8');
const transformsJson = readFileSync(join(pack, 'transforms.json'), 'utf8');
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(root, 'extension', 'vendor', `${variant}.mjs`));
    const times = [];
    const heaps = [];
    for (let i = 0; i < runs; ++i) {
        const M = await create();
        const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
        call('hdw_init_storage', 'number', ['number'], [0]);
        const live = () => JSON.parse(call('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes;
        const before = live();
        const started = performance.now();
        if (call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]) !== 1) {
            throw new Error(call('hdw_last_error', 'string', [], []));
        }
        times.push(performance.now() - started);
        heaps.push(live() - before);
    }
    console.log(JSON.stringify({variant, runs, loadMsMedian: Number(median(times).toFixed(2)),
        loadMsMax: Number(Math.max(...times).toFixed(2)), heapBytesMedian: median(heaps)}));
}
