// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and heap in Hachidori's prebuilt WebAssembly engines, for the
// performance numbers of README.md (docs/languages.md 13). Not run by any
// test.
//
//   node languages/it/sources/wasm-load.mjs <hachidori checkout> [pack dir] [instances]
//
// For the single-thread (hoshidicts) and threaded (hoshidicts-threaded)
// builds of <hachidori checkout>/extension/vendor, makes [instances] fresh
// engines (default 10), times hdw_language_load of the pack (default: this
// directory's pack) in each, and reports the median and range and the median
// growth of the live heap (hdw_memory_stats' liveAllocatedBytes).
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [root, pack = resolve(here, '..'), count = '10'] = process.argv.slice(2);
if (root === undefined) {
    console.error('usage: node wasm-load.mjs <hachidori checkout> [pack dir] [instances]');
    process.exit(2);
}
const languageJson = readFileSync(join(pack, 'language.json'), 'utf8');
const transformsJson = readFileSync(join(pack, JSON.parse(languageJson).lookup.transforms), 'utf8');
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(resolve(root), 'extension', 'vendor', `${variant}.mjs`));
    const times = [];
    const heaps = [];
    for (let i = 0; i < Number(count); ++i) {
        const M = await create();
        const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
        call('hdw_init_storage', 'number', ['number'], [0]);
        const before = JSON.parse(call('hdw_memory_stats', 'string', [], []));
        const t0 = performance.now();
        const ok = call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
        const t1 = performance.now();
        const after = JSON.parse(call('hdw_memory_stats', 'string', [], []));
        if (ok !== 1) { throw new Error(`${variant}: load failed: ${call('hdw_last_error', 'string', [], [])}`); }
        times.push(t1 - t0);
        heaps.push(after.liveAllocatedBytes - before.liveAllocatedBytes);
    }
    const sorted = [...times].sort((a, b) => a - b);
    console.log(`${variant}: hdw_language_load median ${median(times).toFixed(1)} ms (min ${sorted[0].toFixed(1)}, max ${sorted.at(-1).toFixed(1)}) ` +
        `over ${times.length} fresh engines; live heap +${median(heaps)} bytes`);
}
process.exit(0);
