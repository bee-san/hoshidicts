// SPDX-License-Identifier: GPL-3.0-or-later
// The WebAssembly numbers of README.md (Measurements 5), with the engines of
// a Hachidori checkout (extension/vendor/hoshidicts{,-threaded}.mjs), Node 22:
//
//   node languages/uk/sources/wasm-measure.mjs <hachidori checkout> <dictionary.zip> [instances]
//
// For each build: hdw_language_load of this pack in fresh engines (median
// time, live heap added), then hdw_lookup of sources/benchmark-words.txt with
// the dictionary imported and added paged (6 passes, the first dropped).

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [root, zip, n = '10'] = process.argv.slice(2);
if (root === undefined || zip === undefined) {
    console.error('usage: node languages/uk/sources/wasm-measure.mjs <hachidori checkout> <dictionary.zip> [instances]');
    process.exit(2);
}
const languageJson = readFileSync(join(here, '..', 'language.json'), 'utf8');
const transformsJson = readFileSync(join(here, '..', 'transforms.json'), 'utf8');
const texts = readFileSync(join(here, 'benchmark-words.txt'), 'utf8').split('\n').filter((line) => line !== '');
const archive = readFileSync(zip);
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const percentile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(root, 'extension', 'vendor', `${variant}.mjs`));
    const times = [];
    const heaps = [];
    let M = null;
    for (let i = 0; i < Number(n); ++i) {
        M = await create();
        M.ccall('hdw_init_storage', 'number', ['number'], [0]);
        const before = JSON.parse(M.ccall('hdw_memory_stats', 'string', [], []));
        const t0 = performance.now();
        const ok = M.ccall('hdw_language_load', 'number', ['string', 'string'], [languageJson, transformsJson]);
        const t1 = performance.now();
        const after = JSON.parse(M.ccall('hdw_memory_stats', 'string', [], []));
        if (ok !== 1) { throw new Error(`${variant}: load failed: ${M.ccall('hdw_last_error', 'string', [], [])}`); }
        times.push(t1 - t0);
        heaps.push(after.liveAllocatedBytes - before.liveAllocatedBytes);
    }
    // Lookups in the last engine.
    M.FS.mkdirTree('/dicts');
    M.FS.writeFile('/tmp/dictionary.zip', archive);
    const report = JSON.parse(M.ccall('hdw_import', 'string', ['string', 'string', 'number'], ['/tmp/dictionary.zip', '/dicts', 0]));
    if (!report.success) { throw new Error(`${variant}: import failed: ${report.error}`); }
    const path = `/dicts/${report.title}`;
    if (M.ccall('hdw_add_dict', 'number', ['string', 'number', 'number', 'number'], [path, 0, 1, 1]) !== 1) {
        throw new Error(`${variant}: hdw_add_dict failed: ${M.ccall('hdw_last_error', 'string', [], [])}`);
    }
    const options = JSON.stringify({language: 'uk'});
    const lookups = [];
    let found = 0;
    for (let pass = 0; pass < 6; ++pass) {
        for (const text of texts) {
            const t0 = performance.now();
            const out = M.ccall('hdw_lookup', 'string', ['string', 'number', 'number', 'string'], [text, 16, 16, options]);
            const t1 = performance.now();
            if (pass > 0) { lookups.push(t1 - t0); }
            if (pass === 0 && out.length > 2) { ++found; }
        }
    }
    console.log(JSON.stringify({
        build: variant, instances: times.length, loadMedianMs: +median(times).toFixed(2), loadMinMs: +Math.min(...times).toFixed(2),
        loadMaxMs: +Math.max(...times).toFixed(2), heapBytes: median(heaps), dictionaryTerms: report.term_count ?? report.termCount,
        texts: texts.length, textsWithResults: found, lookupP50Ms: +median(lookups).toFixed(3), lookupP95Ms: +percentile(lookups, 0.95).toFixed(3),
    }));
}
process.exit(0);
