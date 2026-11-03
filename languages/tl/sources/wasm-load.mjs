#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and heap in Hachidori's WebAssembly engines, for README.md
// (Measurements; docs/languages.md section 13). Not run by any test.
//
//   node languages/tl/sources/wasm-load.mjs <hachidori checkout> [runs]
//
// For each build (single-thread and threaded) it starts `runs` fresh engines
// (default 10) and in each times one hdw_language_load of
// <hachidori>/extension/vendor/languages/tl/ (the copy scripts/sync-languages.mjs
// makes from the hoshidicts submodule), and reads the allocator's live bytes
// (hdw_memory_stats) before and after it, then does the same for a copy of
// the rules without the pattern rules, so the difference is what the
// patterns cost (section 13). Prints one JSON line per build.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';

const [hachidori, runsArg] = process.argv.slice(2);
if (!hachidori) {
    console.error('usage: node wasm-load.mjs <hachidori checkout> [runs]');
    process.exit(2);
}
const runs = Number(runsArg ?? 10);
const vendor = join(hachidori, 'extension', 'vendor');
const languageJson = readFileSync(join(vendor, 'languages', 'tl', 'language.json'), 'utf8');
const transformsJson = readFileSync(join(vendor, 'languages', 'tl', JSON.parse(languageJson).lookup.transforms), 'utf8');
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const parsed = JSON.parse(transformsJson);
const patterns = parsed.transforms.reduce((n, t) => n + t.rules.filter((r) => r.type === 'pattern').length, 0);
const withoutPatterns = JSON.stringify({...parsed, transforms: parsed.transforms
    .map((t) => ({...t, rules: t.rules.filter((r) => r.type !== 'pattern')})).filter((t) => t.rules.length > 0)});

async function measure(create, rules) {
    const times = [];
    const heap = [];
    for (let i = 0; i < runs; ++i) {
        const M = await create();
        const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
        call('hdw_init_storage', 'number', ['number'], [0]);
        const before = JSON.parse(call('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes;
        const started = performance.now();
        if (call('hdw_language_load', 'number', ['string', 'string'], [languageJson, rules]) !== 1) {
            throw new Error(call('hdw_last_error', 'string', [], []));
        }
        times.push(performance.now() - started);
        heap.push(JSON.parse(call('hdw_memory_stats', 'string', [], [])).liveAllocatedBytes - before);
    }
    return {times, heap};
}

for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(vendor, `${variant}.mjs`));
    const full = await measure(create, transformsJson);
    const bare = await measure(create, withoutPatterns);
    console.log(JSON.stringify({variant, runs, loadMsMedian: median(full.times), loadMsMin: Math.min(...full.times), loadMsMax: Math.max(...full.times),
        heapBytesMedian: median(full.heap), patterns, patternHeapBytes: median(full.heap) - median(bare.heap),
        loadMsMedianWithoutPatterns: median(bare.times), transformsJsonBytes: transformsJson.length}));
}
