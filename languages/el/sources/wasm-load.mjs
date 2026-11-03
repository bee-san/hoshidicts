// SPDX-License-Identifier: GPL-3.0-or-later
// Times hdw_language_load of this pack in fresh instances of Hachidori's
// prebuilt WebAssembly engines (single-thread and threaded) and reports the
// live heap growth from hdw_memory_stats (docs/languages.md 13). Not run by
// any test.
//
//   node languages/el/sources/wasm-load.mjs <hachidori checkout> [instances]
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const pack = join(dirname(fileURLToPath(import.meta.url)), '..');
const [hachidori, n = '10'] = process.argv.slice(2);
const languageJson = readFileSync(join(pack, 'language.json'), 'utf8');
const transformsJson = readFileSync(join(pack, 'transforms.json'), 'utf8');
const median = (xs) => (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);
for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(hachidori, 'extension', 'vendor', `${variant}.mjs`));
    const times = [];
    const heaps = [];
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
        times.push(t1 - t0);
        const live = (s) => s.liveAllocatedBytes;
        heaps.push(live(after) - live(before));
        if (i === 0) { console.log(`${variant}: memory stats ${Object.keys(after).join(',')}; languages ${call('hdw_languages', 'string', [], [])}`); }
    }
    times.sort((a, b) => a - b);
    heaps.sort((a, b) => a - b);
    console.log(`${variant}: hdw_language_load median ${median(times).toFixed(1)} ms (min ${times[0].toFixed(1)}, max ${times.at(-1).toFixed(1)}) over ${times.length} fresh engines; live heap +${median(heaps)} bytes (min ${heaps[0]}, max ${heaps.at(-1)})`);
}
process.exit(0);
