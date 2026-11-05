// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and live heap in Hachidori's WebAssembly engines (docs/languages.md
// 13): for each variant, fresh engines load language.json + transforms.json with
// hdw_language_load; prints the median load time over N engines and the heap
// growth hdw_memory_stats reports. Not run by any test.
//
//   node languages/ru/sources/wasm-load.mjs <hachidori checkout> <pack dir> [engines=10]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const [hachidori, packDir, count = "10"] = process.argv.slice(2);
const languageJson = readFileSync(join(packDir, "language.json"), "utf8");
const transformsName = JSON.parse(languageJson).lookup?.transforms;
const transformsJson = transformsName ? readFileSync(join(packDir, transformsName), "utf8") : "";
const out = {};
for (const variant of ["hoshidicts", "hoshidicts-threaded"]) {
  const { default: create } = await import(join(hachidori, "extension", "vendor", `${variant}.mjs`));
  const times = [];
  const heaps = [];
  let error = null;
  for (let i = 0; i < Number(count); i += 1) {
    const M = await create();
    const call = (name, ret, types, args) => M.ccall(name, ret, types, args);
    call("hdw_init_storage", "number", ["number"], [0]);
    const stats = () => JSON.parse(call("hdw_memory_stats", "string", [], []));
    const before = stats();
    const start = performance.now();
    const ok = call("hdw_language_load", "number", ["string", "string"], [languageJson, transformsJson]);
    times.push(performance.now() - start);
    if (ok !== 1) { error = call("hdw_last_error", "string", [], []); break; }
    const after = stats();
    heaps.push(after.liveAllocatedBytes - before.liveAllocatedBytes);
  }
  times.sort((a, b) => a - b);
  out[variant] = error ? { error } : { engines: times.length, medianMs: times[Math.floor(times.length / 2)], heapBytes: heaps.sort((a, b) => a - b)[Math.floor(heaps.length / 2)] };
}
console.log(JSON.stringify(out));
