// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and heap in Node (docs/languages.md 13; README.md,
// Measurements). Not run by any test. For Hachidori's single-thread and
// threaded WebAssembly builds (extension/vendor/hoshidicts*.mjs of a
// bee-san/hachidori feat/multi-language checkout), ten fresh engines each:
// hdw_language_load of this pack, timed, and the live heap of
// hdw_memory_stats before and after.
//
//   node languages/eo/sources/pack-load.mjs <hachidori checkout> languages/eo
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const [hachidori, packDir] = process.argv.slice(2);
const languageJson = readFileSync(join(packDir, "language.json"), "utf8");
const transformsJson = readFileSync(join(packDir, "transforms.json"), "utf8");
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

for (const variant of ["hoshidicts", "hoshidicts-threaded"]) {
  const { default: create } = await import(join(hachidori, "extension", "vendor", `${variant}.mjs`));
  const times = [];
  const growth = [];
  let stats = null;
  for (let i = 0; i < 10; ++i) {
    const M = await create();
    const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
    call("hdw_init_storage", "number", ["number"], [0]);
    const before = JSON.parse(call("hdw_memory_stats", "string", [], []));
    const started = performance.now();
    const ok = call("hdw_language_load", "number", ["string", "string"], [languageJson, transformsJson]);
    const ms = performance.now() - started;
    if (!ok) throw new Error(call("hdw_last_error", "string", [], []));
    const after = JSON.parse(call("hdw_memory_stats", "string", [], []));
    times.push(ms);
    stats = { before, after };
    const key = Object.keys(after).find((k) => /uordblks|inuse|allocated|live/i.test(k));
    if (key) growth.push(after[key] - before[key]);
  }
  console.log(JSON.stringify({ variant, loadMsMedian: median(times), loadMs: times.map((t) => +t.toFixed(2)), heapGrowthBytes: growth, statsKeys: Object.keys(stats.after), lastStats: stats }));
}
