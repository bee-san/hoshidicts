// SPDX-License-Identifier: GPL-3.0-or-later
// hdw_language_load of this pack in Hachidori's WebAssembly runtimes
// (README.md, Measurements 5). Not run by any test.
//
//   node languages/sga/sources/wasm-load.mjs <Hachidori checkout> [engines]
//
// The checkout's extension/vendor/ holds the runtimes and, from
// scripts/sync-languages.mjs, this pack. For each runtime it creates
// <engines> fresh engines (default 10), times the first and a second load
// and reads the live heap before and after the first (hdw_memory_stats).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
const [checkout, enginesArg] = process.argv.slice(2);
const ENGINES = Number(enginesArg ?? 10);
const packDir = join(checkout, "extension", "vendor", "languages", "sga");
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
    growth.push(after.liveAllocatedBytes - before.liveAllocatedBytes);
  }
  console.log(`${variant}: first load median ${median(first).toFixed(1)} ms (range ${Math.min(...first).toFixed(1)}-${Math.max(...first).toFixed(1)}), second ${median(second).toFixed(1)} ms; live bytes +${median(growth)} over ${ENGINES} engines`);
}
