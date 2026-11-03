#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The aii pack's load time and heap in Hachidori's WebAssembly (README.md,
// Measurements, item 5). Not run by any test.
//
//   node languages/aii/sources/wasm-load.mjs <hachidori checkout> [engines]
//
// For each variant (hoshidicts.mjs, the single-thread build, and
// hoshidicts-threaded.mjs), `engines` fresh modules each load the pack from
// <checkout>/extension/vendor/languages/aii/ (scripts/sync-languages.mjs
// writes it) twice with hdw_language_load; prints the first and second load
// times (median over the engines) and the growth of the allocator's live
// bytes over the first load (hdw_memory_stats).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const [checkout, enginesArg] = process.argv.slice(2);
if (!checkout) throw new Error("usage: node wasm-load.mjs <hachidori checkout> [engines]");
const ENGINES = Number(enginesArg ?? 10);
const packDir = join(checkout, "extension", "vendor", "languages", "aii");
const languageJson = readFileSync(join(packDir, "language.json"), "utf8");
const transformsJson = readFileSync(join(packDir, "transforms.json"), "utf8");
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

for (const variant of ["hoshidicts", "hoshidicts-threaded"]) {
  const { default: create } = await import(join(checkout, "extension", "vendor", `${variant}.mjs`));
  const first = [], second = [], growth = [];
  for (let i = 0; i < ENGINES; ++i) {
    const M = await create();
    const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
    call("hdw_init_storage", "number", ["number"], [0]);
    const stats = () => JSON.parse(call("hdw_memory_stats", "string", [], []));
    const before = stats();
    let t = performance.now();
    if (call("hdw_language_load", "number", ["string", "string"], [languageJson, transformsJson]) !== 1) {
      throw new Error(call("hdw_last_error", "string", [], []));
    }
    first.push(performance.now() - t);
    const after = stats();
    t = performance.now();
    call("hdw_language_load", "number", ["string", "string"], [languageJson, transformsJson]);
    second.push(performance.now() - t);
    const live = s => s.liveAllocatedBytes;
    growth.push(live(after) - live(before));
  }
  console.log(`${variant}: first load median ${median(first).toFixed(1)} ms (range ${Math.min(...first).toFixed(1)}-${Math.max(...first).toFixed(1)}), `
    + `second ${median(second).toFixed(1)} ms; live bytes +${median(growth)} over ${ENGINES} engines`);
}
