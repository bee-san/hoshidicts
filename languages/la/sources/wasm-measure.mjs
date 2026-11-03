// SPDX-License-Identifier: GPL-3.0-or-later
// README.md, Measurements 5: the pack in Hachidori's prebuilt WebAssembly
// engines (extension/vendor of a Hachidori checkout), single-thread and
// threaded, in Node. Adapted from the load script of the Spanish pack's audit.
// - load: hdw_language_load timed in each of <engines> fresh instances, and the
//   live heap it adds (hdw_memory_stats);
// - lookup: one imported dictionary written to MEMFS and added mapped, each
//   text looked up with hdw_lookup as a host with profiles calls it (16 results,
//   scan length 16, {"language", "dictionaries"}), <passes> passes, the first
//   dropped.
//
//   node --max-old-space-size=8192 languages/la/sources/wasm-measure.mjs <hachidori dir> languages/la \
//     <imported dictionary dir> languages/la/sources/benchmark-words.txt [engines=10] [passes=6]
import {readFileSync, readdirSync} from 'node:fs';
import {basename, join} from 'node:path';
import {loadavg} from 'node:os';

const [root, pack, dictDir, textsFile, engines = '10', passes = '6'] = process.argv.slice(2);
const files = ['language.json', 'transforms.json'].map((name) => readFileSync(join(pack, name), 'utf8'));
const code = JSON.parse(files[0]).code;
const texts = readFileSync(textsFile, 'utf8').split('\n').filter(Boolean);
const at = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const sort = (xs) => [...xs].sort((a, b) => a - b);
for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(root, 'extension', 'vendor', `${variant}.mjs`));
    const start = async () => {
        const M = await create();
        const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
        call('hdw_init_storage', 'number', ['number'], [0]);
        const before = JSON.parse(call('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes;
        const t0 = performance.now();
        const ok = call('hdw_language_load', 'number', ['string', 'string'], files);
        const ms = performance.now() - t0;
        if (ok !== 1) { throw new Error(`${variant}: ${call('hdw_last_error', 'string', [], [])}`); }
        return {M, call, ms, heap: JSON.parse(call('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes - before};
    };
    const times = [];
    const heaps = [];
    let engine;
    for (let i = 0; i < Number(engines); ++i) {
        engine = await start();
        times.push(engine.ms);
        heaps.push(engine.heap);
    }
    const {M, call} = engine;
    const path = `/dicts/${basename(dictDir)}`;
    M.FS.mkdirTree(path);
    for (const name of readdirSync(dictDir)) { M.FS.writeFile(`${path}/${name}`, readFileSync(join(dictDir, name))); }
    if (call('hdw_add_dict', 'number', ['string', 'number', 'number'], [path, 0, 0]) !== 1) {
        throw new Error(call('hdw_last_error', 'string', [], []));
    }
    const options = JSON.stringify({frequencyDictionary: '', frequencyOrder: 'auto', primaryReading: '', metadataOnlyTerms: false,
                                    language: code, dictionaries: [path]});
    const samples = [];
    let results = 0;
    for (let pass = 0; pass < Number(passes); ++pass) {
        for (const text of texts) {
            const t0 = performance.now();
            const json = call('hdw_lookup', 'string', ['string', 'number', 'number', 'string'], [text, 16, 16, options]);
            if (pass > 0) { samples.push(performance.now() - t0); results += JSON.parse(json).results.length; }
        }
    }
    const loadTimes = sort(times);
    const lookups = sort(samples);
    console.log(JSON.stringify({variant, engines: Number(engines), loadMedianMs: +at(loadTimes, 0.5).toFixed(1), loadMaxMs: +loadTimes.at(-1).toFixed(1),
                                heapBytes: at(sort(heaps), 0.5), texts: texts.length, passes: Number(passes) - 1, results,
                                p50Ms: +at(lookups, 0.5).toFixed(3), p95Ms: +at(lookups, 0.95).toFixed(3), load: +loadavg()[0].toFixed(1)}));
}
process.exit(0);
