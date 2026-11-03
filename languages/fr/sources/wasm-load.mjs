// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and heap in Hachidori's prebuilt WebAssembly engines
// (README.md, Measurements; docs/languages.md 13). Not run by any test.
//   node wasm-load.mjs <hachidori checkout> <pack dir> [engines]
// For each engine (single-thread and threaded) it starts [engines] (10)
// fresh instances, times hdw_language_load of the pack and reads the live
// heap (liveAllocatedBytes of hdw_memory_stats, mallinfo uordblks) before
// and after.
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [hachidori, pack, n = '10'] = process.argv.slice(2);
const languageJson = readFileSync(join(pack, 'language.json'), 'utf8');
const transformsJson = readFileSync(join(pack, 'transforms.json'), 'utf8');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(pathToFileURL(resolve(hachidori, 'extension', 'vendor', `${variant}.mjs`)).href);
    const times = [];
    const heaps = [];
    for (let i = 0; i < Number(n); ++i) {
        const M = await create();
        const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
        call('hdw_init_storage', 'number', ['number'], [0]);
        const live = () => JSON.parse(call('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes;
        const before = live();
        const t0 = performance.now();
        const ok = call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
        const t1 = performance.now();
        if (ok !== 1) { throw new Error(`${variant}: ${call('hdw_last_error', 'string', [], [])}`); }
        times.push(t1 - t0);
        heaps.push(live() - before);
    }
    console.log(JSON.stringify({engine: variant, engines: times.length, loadMsMedian: median(times), loadMsMin: Math.min(...times),
        loadMsMax: Math.max(...times), heapBytesMedian: median(heaps)}));
}
process.exit(0);
