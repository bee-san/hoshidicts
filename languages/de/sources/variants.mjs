#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the rule-set variants that README.md (Rule provenance) measures
// against transforms.json. Not run by any test.
//
//   node languages/de/sources/variants.mjs <out dir>
//
// Into <out dir>:
// - final.json: transforms.json;
// - own.json: sources/own.json;
// - final-plus-separated-prefix.json, final-plus-zu-infinitive.json: the
//   final rules followed by that Yomitan transform (its id prefixed with
//   `yomitan ` so that it does not clash with the own transform of the same
//   name), as `sources/build-final.mjs` would write them if it kept it;
// - final-minus-<id>.json for each of the five Yomitan transforms the final
//   rules keep.
// Measure them with `sources/measure.mjs diff` (and the other modes) against
// final.json.

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [outArgument] = process.argv.slice(2);
if (outArgument === undefined) {
    console.error('usage: node languages/de/sources/variants.mjs <out dir>');
    process.exit(2);
}
const out = resolve(outArgument);
mkdirSync(out, {recursive: true});
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const final = read(join(here, '..', 'transforms.json'));
const yomitan = read(join(here, 'yomitan.json'));
const slug = (id) => id.replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
const write = (name, value) => {
    writeFileSync(join(out, name), formatTransforms(value));
    console.log(join(out, name));
};
write('final.json', final);
write('own.json', read(join(here, 'own.json')));
for (const id of ['separated prefix', 'zu-infinitive']) {
    const added = yomitan.transforms.find((t) => t.id === id);
    write(`final-plus-${slug(id)}.json`, {...final, transforms: [...final.transforms, {...added, id: `yomitan ${id}`, source: 'yomitan'}]});
}
for (const t of final.transforms.filter((x) => x.source === 'yomitan')) {
    write(`final-minus-${slug(t.id)}.json`, {...final, transforms: final.transforms.filter((x) => x.id !== t.id)});
}
