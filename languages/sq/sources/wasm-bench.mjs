#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly measurements of the pack for README.md (docs/languages.md 13).
// Not run by any test. With a Hachidori checkout whose extension/vendor/ has
// the prebuilt engines:
//
//   node languages/sq/sources/wasm-bench.mjs <hachidori dir> <variant> <runs> <dictionary.zip> <texts file>
//
// <variant> is hoshidicts (single-thread) or hoshidicts-threaded. Each of
// <runs> fresh engines loads this checkout's languages/sq/language.json and
// transforms.json with hdw_language_load; the time of that call and the
// allocator's live bytes before and after it (hdw_memory_stats, mallinfo)
// are recorded. The last engine then imports the dictionary into its
// in-memory file system, adds it as a term dictionary with paged entries and
// index (as Hachidori adds dictionaries), and looks up every line of <texts
// file> with hdw_lookup ({"language": "sq"}, 16 results, scan length 16) in 6
// passes, the first dropped. Prints one JSON line.

import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const [hachidori, variant, runsText, dictionary, textsFile] = process.argv.slice(2);
if (textsFile === undefined) {
    console.error('usage: node wasm-bench.mjs <hachidori dir> <variant> <runs> <dictionary.zip> <texts file>');
    process.exit(2);
}
const pack = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const languageJson = readFileSync(join(pack, 'language.json'), 'utf8');
const transformsJson = readFileSync(join(pack, 'transforms.json'), 'utf8');
const {default: create} = await import(pathToFileURL(join(hachidori, 'extension', 'vendor', `${variant}.mjs`)).href);

const quantile = (values, f) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
};
const loads = [];
const heap = [];
let M = null;
for (let i = 0; i < Number(runsText); ++i) {
    M = await create();
    const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
    call('hdw_init_storage', 'number', ['number'], [0]);
    const before = JSON.parse(call('hdw_memory_stats', 'string', [], []));
    const t0 = performance.now();
    const ok = call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
    const t1 = performance.now();
    if (ok !== 1) { throw new Error(call('hdw_last_error', 'string', [], [])); }
    const after = JSON.parse(call('hdw_memory_stats', 'string', [], []));
    loads.push(t1 - t0);
    const live = (s) => s.liveAllocatedBytes;
    heap.push(live(after) - live(before));
}
const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
M.FS.mkdir('/work');
M.FS.writeFile('/work/dictionary.zip', readFileSync(dictionary));
const report = JSON.parse(call('hdw_import', 'string', ['string', 'string', 'number'], ['/work/dictionary.zip', '/dicts', 0]));
if (!report.success) { throw new Error(`import failed: ${report.error}`); }
const path = `/dicts/${report.title}`;
if (call('hdw_add_dict', 'number', ['string', 'number', 'number', 'number'], [path, 0, 1, 1]) !== 1) {
    throw new Error(call('hdw_last_error', 'string', [], []));
}
const texts = readFileSync(textsFile, 'utf8').split('\n').filter(Boolean);
const options = JSON.stringify({language: 'sq'});
const times = [];
for (let pass = 0; pass < 6; ++pass) {
    for (const text of texts) {
        const t0 = performance.now();
        call('hdw_lookup', 'string', ['string', 'number', 'number', 'string'], [text, 16, 16, options]);
        const t1 = performance.now();
        if (pass > 0) { times.push(t1 - t0); }
    }
}
console.log(JSON.stringify({
    variant,
    loadMs: {median: quantile(loads, 0.5), min: Math.min(...loads), max: Math.max(...loads), runs: loads.length},
    heapBytesAfterLoad: {median: quantile(heap, 0.5), values: heap},
    lookupMs: {p50: quantile(times, 0.5), p95: quantile(times, 0.95), lookups: times.length},
    memoryStats: JSON.parse(call('hdw_memory_stats', 'string', [], [])),
}));
process.exit(0);
