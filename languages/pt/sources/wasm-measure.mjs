// SPDX-License-Identifier: GPL-3.0-or-later
// The WebAssembly numbers of README.md (Measurements 5). Not run by any test.
// Times hdw_language_load of a pack in fresh instances of Hachidori's
// prebuilt engines (extension/vendor of a bee-san/hachidori checkout), reports
// the live heap growth from hdw_memory_stats, and times hdw_lookup on texts
// with a dictionary imported into the same engine (MEMFS, paged), for the
// single-thread and the threaded build. Node 22:
//
//   node languages/pt/sources/wasm-measure.mjs <hachidori checkout> languages/pt <wty-pt-en.zip> languages/pt/sources/benchmark-words.txt [instances]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const [root, pack, zip, textsFile, n = '10'] = process.argv.slice(2);
const languageJson = readFileSync(join(pack, 'language.json'), 'utf8');
const transformsJson = readFileSync(join(pack, 'transforms.json'), 'utf8');
const texts = readFileSync(textsFile, 'utf8').split('\n').filter((t) => t !== '');
const zipBytes = readFileSync(zip);
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (xs, p) => {
    const s = [...xs].sort((a, b) => a - b);
    const k = (s.length - 1) * p;
    const f = Math.floor(k);
    const c = Math.min(f + 1, s.length - 1);
    return s[f] + (s[c] - s[f]) * (k - f);
};
for (const variant of ['hoshidicts', 'hoshidicts-threaded']) {
    const {default: create} = await import(join(root, 'extension', 'vendor', `${variant}.mjs`));
    const times = [];
    const heaps = [];
    let M;
    for (let i = 0; i < Number(n); ++i) {
        M = await create();
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
    console.log(`${variant}: hdw_language_load median ${median(times).toFixed(1)} ms (min ${sorted[0].toFixed(1)}, max ${sorted.at(-1).toFixed(1)}) over ${times.length} fresh engines; live heap +${median(heaps)} bytes`);
    // Lookups in the last engine: import the dictionary into MEMFS, add it paged, as Hachidori does.
    const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
    M.FS.mkdirTree('/tmp/in');
    M.FS.mkdirTree('/dicts');
    M.FS.writeFile('/tmp/in/dict.zip', zipBytes);
    const report = JSON.parse(call('hdw_import', 'string', ['string', 'string', 'number'], ['/tmp/in/dict.zip', '/dicts', 1]));
    if (!report.success) { throw new Error(`${variant}: import failed: ${report.error}`); }
    M.FS.unlink('/tmp/in/dict.zip');
    const dir = `/dicts/${M.FS.readdir('/dicts').find((d) => d !== '.' && d !== '..' && !d.startsWith('.'))}`;
    if (call('hdw_add_dict', 'number', ['string', 'number', 'number', 'number'], [dir, 0, 1, 1]) !== 1) {
        throw new Error(`${variant}: add failed: ${call('hdw_last_error', 'string', [], [])}`);
    }
    const options = JSON.stringify({language: 'pt'});
    const lookupTimes = [];
    let results = 0;
    for (let pass = 0; pass < 6; ++pass) {
        for (const text of texts) {
            const t0 = performance.now();
            const out = call('hdw_lookup', 'string', ['string', 'number', 'number', 'string'], [text, 16, 16, options]);
            const t1 = performance.now();
            if (pass > 0) { lookupTimes.push(t1 - t0); }
            if (pass === 0) { results += JSON.parse(out).results.length; }
        }
    }
    console.log(`${variant}: hdw_lookup over ${texts.length} texts, 5 timed passes (first dropped): p50 ${pct(lookupTimes, 0.5).toFixed(3)} ms, p95 ${pct(lookupTimes, 0.95).toFixed(3)} ms; ${results} results in pass 1 (${report.termCount} terms imported)`);
}
process.exit(0);
