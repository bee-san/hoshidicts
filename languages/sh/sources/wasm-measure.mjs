// SPDX-License-Identifier: GPL-3.0-or-later
// Section 13 of docs/languages.md in WebAssembly: times hdw_language_load of
// this pack in fresh instances of Hachidori's prebuilt engines (single-thread
// and threaded), reports the live heap it adds (hdw_memory_stats), then
// imports a dictionary into one engine (in-memory storage, entries and index
// paged as Hachidori loads a large dictionary) and times hdw_lookup on texts:
//
//   node languages/sh/sources/wasm-measure.mjs <hachidori checkout> <dictionary.zip> [texts] [instances] [pack dir]
//
// texts defaults to sources/benchmark-words.txt (one text per line, each the
// rest of a sentence from an inflected word); each is looked up in 6 passes
// and the first is dropped, as benchmark-lookup's numbers are read.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pack = dirname(here);
const [root, zip, textsFile = join(here, 'benchmark-words.txt'), n = '10', packDir = pack] = process.argv.slice(2);
if (root === undefined || zip === undefined) {
    console.error('usage: node wasm-measure.mjs <hachidori checkout> <dictionary.zip> [texts] [instances]');
    process.exit(2);
}
const languageJson = readFileSync(join(packDir, 'language.json'), 'utf8');
const transformsJson = readFileSync(join(packDir, 'transforms.json'), 'utf8');
const texts = readFileSync(textsFile, 'utf8').split('\n').filter((l) => l.trim() !== '');
const quantile = (xs, f) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(f * s.length))];
};

for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(root, 'extension', 'vendor', `${variant}.mjs`));
    const loads = [];
    const heaps = [];
    for (let i = 0; i < Number(n); ++i) {
        const M = await create();
        const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
        call('hdw_init_storage', 'number', ['number'], [0]);
        const before = JSON.parse(call('hdw_memory_stats', 'string', [], []));
        const t0 = performance.now();
        const ok = call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
        const t1 = performance.now();
        if (ok !== 1) { throw new Error(`${variant}: hdw_language_load failed: ${call('hdw_last_error', 'string', [], [])}`); }
        const after = JSON.parse(call('hdw_memory_stats', 'string', [], []));
        loads.push(t1 - t0);
        heaps.push(after.liveAllocatedBytes - before.liveAllocatedBytes);
    }
    const M = await create();
    const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
    call('hdw_init_storage', 'number', ['number'], [0]);
    call('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
    M.FS.writeFile('/dictionary.zip', readFileSync(zip));
    try { M.FS.mkdir('/dicts'); } catch { /* the storage init made it */ }
    const report = JSON.parse(call('hdw_import', 'string', ['string', 'string', 'number'], ['/dictionary.zip', '/dicts', 1]));
    if (!report.success) { throw new Error(`${variant}: import failed: ${report.error}`); }
    M.FS.unlink('/dictionary.zip');
    const path = `/dicts/${M.FS.readdir('/dicts').find((d) => d !== '.' && d !== '..' && !d.startsWith('.'))}`;
    if (call('hdw_add_dict', 'number', ['string', 'number', 'number', 'number'], [path, 0, 1, 1]) !== 1) {
        throw new Error(`${variant}: hdw_add_dict failed: ${call('hdw_last_error', 'string', [], [])}`);
    }
    const options = JSON.stringify({language: 'sh'});
    const times = [];
    let found = 0;
    for (let pass = 0; pass < 6; ++pass) {
        for (const text of texts) {
            const t0 = performance.now();
            const reply = call('hdw_lookup', 'string', ['string', 'number', 'number', 'string'], [text, 16, 16, options]);
            const t1 = performance.now();
            if (pass > 0) { times.push(t1 - t0); }
            if (pass === 1 && JSON.parse(reply).results.length > 0) { ++found; }
        }
    }
    const heap = JSON.parse(call('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes;
    console.log(JSON.stringify({
        variant, packLoadMedianMs: +quantile(loads, 0.5).toFixed(2), packLoadMaxMs: +Math.max(...loads).toFixed(2), engines: loads.length,
        packHeapBytes: quantile(heaps, 0.5), dictionary: report.title, terms: report.termCount, lookups: times.length, textsFound: `${found}/${texts.length}`,
        lookupP50Ms: +quantile(times, 0.5).toFixed(3), lookupP95Ms: +quantile(times, 0.95).toFixed(3), heapAfterLookupsBytes: heap,
    }));
}
process.exit(0);
