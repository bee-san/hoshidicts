#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Merges a pack's sources/own.json and sources/yomitan.json into its
// transforms.json (docs/languages.md, section 14 step 5) and marks where each
// rule comes from: `own` (only own.json has it), `yomitan` (only yomitan.json)
// or `both` (the same rule in both):
//
//   node tools/merge-transforms.mjs <code> [--languages <dir>] [--out <file>] [--force]
//
// - Transforms: Yomitan's in its order, then those only own.json has, in its
//   order. A transform both files have (by id) has Yomitan's rules, then
//   own.json's other rules, and takes its name, description and `optional`
//   from own.json (a difference is printed).
// - Rules are the same when they are equal apart from `source`; key order
//   does not matter. The `source` fields of the two files are not read.
// - Sources: a transform only one file has gets that file's source, one both
//   have gets `both`; a rule whose source differs from its transform's says
//   so itself.
// - Conditions and word lists are the union, Yomitan's first. A condition both
//   files define with another name, isDictionaryForm or subConditions, a word
//   list both define with other words, and a `todo` rule left in yomitan.json
//   are errors.
// Either file may be missing. An existing transforms.json is replaced only
// when it is the template's copy or --force is given, because step 5 removes
// rules from it by hand; --out writes elsewhere (for eval-language).

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {isMain} from './lib/cli.mjs';
import {formatTransforms, parseJson} from './lib/json.mjs';
import {DEFAULT_LANGUAGES_DIR} from './lib/pack.mjs';

/** JSON text of a value with object keys sorted, so key order does not matter. */
function canonical(value) {
    if (Array.isArray(value)) { return `[${value.map(canonical).join(',')}]`; }
    if (value !== null && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function withoutSource(rule) {
    const {source: _source, ...rest} = rule;
    return rest;
}

function conditionShape(condition) {
    return canonical({name: condition?.name, isDictionaryForm: condition?.isDictionaryForm, subConditions: condition?.subConditions ?? null});
}

/**
 * The union of two transform files with each rule's source.
 * @param {any} own sources/own.json, or null
 * @param {any} yomitan sources/yomitan.json, or null
 * @returns {{transforms: object, counts: {own: number, yomitan: number, both: number}, notes: string[]}}
 */
export function mergeTransforms(own, yomitan) {
    const files = {own: own ?? {transforms: []}, yomitan: yomitan ?? {transforms: []}};
    const notes = [];
    for (const [name, file] of Object.entries(files)) {
        if (!Array.isArray(file.transforms)) { throw new Error(`sources/${name}.json has no transforms array`); }
    }
    const todos = files.yomitan.transforms.flatMap((t) => (t.rules ?? []).filter((r) => r?.type === 'todo').map(() => t.id));
    if (todos.length > 0) {
        throw new Error(`sources/yomitan.json still has ${todos.length} todo rules (in ${[...new Set(todos)].slice(0, 5).join(', ')}); map them first (section 8.3)`);
    }

    // Conditions: Yomitan's, then own.json's others.
    const conditions = {};
    for (const [name, file] of [['yomitan', files.yomitan], ['own', files.own]]) {
        for (const [key, condition] of Object.entries(file.conditions ?? {})) {
            if (!(key in conditions)) {
                conditions[key] = condition;
            } else if (conditionShape(conditions[key]) !== conditionShape(condition)) {
                throw new Error(`the condition ${key} differs between sources/yomitan.json and sources/${name}.json`);
            }
        }
    }
    // Word lists: the union; one both define must list the same words.
    const wordLists = {};
    for (const [name, file] of [['yomitan', files.yomitan], ['own', files.own]]) {
        for (const [key, words] of Object.entries(file.wordLists ?? {})) {
            if (!(key in wordLists)) {
                wordLists[key] = words;
            } else if (canonical([...wordLists[key]].sort()) !== canonical([...words].sort())) {
                throw new Error(`the word list ${key} differs between sources/yomitan.json and sources/${name}.json`);
            }
        }
    }

    const counts = {own: 0, yomitan: 0, both: 0};
    const ownById = new Map(files.own.transforms.map((t) => [t.id, t]));
    const yomitanIds = new Set(files.yomitan.transforms.map((t) => t.id));
    const header = (transform, source) => {
        const out = {id: transform.id, name: transform.name};
        if (transform.description !== undefined) { out.description = transform.description; }
        out.source = source;
        if (transform.optional !== undefined) { out.optional = transform.optional; }
        if (transform.i18n !== undefined) { out.i18n = transform.i18n; }
        return out;
    };
    const tagged = (rule, source, transformSource) => {
        ++counts[source];
        const out = withoutSource(rule);
        if (source !== transformSource) { out.source = source; }
        return out;
    };

    const transforms = [];
    for (const theirs of files.yomitan.transforms) {
        const mine = ownById.get(theirs.id);
        if (mine === undefined) {
            transforms.push({...header(theirs, 'yomitan'), rules: (theirs.rules ?? []).map((r) => tagged(r, 'yomitan', 'yomitan'))});
            continue;
        }
        for (const field of ['name', 'description', 'optional']) {
            if (mine[field] !== undefined && canonical(mine[field]) !== canonical(theirs[field] ?? null)) {
                notes.push(`${theirs.id}: ${field} is ${JSON.stringify(mine[field])} in own.json, ${JSON.stringify(theirs[field])} in yomitan.json; own.json's is kept`);
            }
        }
        // Each of own.json's rules pairs with at most one equal Yomitan rule.
        const unpaired = new Map();
        for (const rule of mine.rules ?? []) {
            const key = canonical(withoutSource(rule));
            unpaired.set(key, (unpaired.get(key) ?? 0) + 1);
        }
        const rules = (theirs.rules ?? []).map((rule) => {
            const key = canonical(withoutSource(rule));
            const left = unpaired.get(key) ?? 0;
            if (left > 0) {
                unpaired.set(key, left - 1);
                return tagged(rule, 'both', 'both');
            }
            return tagged(rule, 'yomitan', 'both');
        });
        for (const rule of mine.rules ?? []) {
            const key = canonical(withoutSource(rule));
            const left = unpaired.get(key) ?? 0;
            if (left > 0) {
                unpaired.set(key, left - 1);
                rules.push(tagged(rule, 'own', 'both'));
            }
        }
        transforms.push({...header({...theirs, ...mine, i18n: mine.i18n ?? theirs.i18n}, 'both'), rules});
    }
    for (const mine of files.own.transforms) {
        if (yomitanIds.has(mine.id)) { continue; }
        transforms.push({...header(mine, 'own'), rules: (mine.rules ?? []).map((r) => tagged(r, 'own', 'own'))});
    }

    const out = {schema: 1, conditions};
    if (Object.keys(wordLists).length > 0) { out.wordLists = wordLists; }
    out.transforms = transforms;
    return {transforms: out, counts, notes};
}

function readSource(file) {
    return existsSync(file) ? parseJson(readFileSync(file, 'utf8'), file) : null;
}

function usage() {
    console.error('usage: node tools/merge-transforms.mjs <code> [--languages <dir>] [--out <file>] [--force]');
    return 2;
}

/**
 * @param {string[]} argv
 * @returns {number} the exit status
 */
export function main(argv) {
    const positional = [];
    let languagesDir = DEFAULT_LANGUAGES_DIR;
    let out = null;
    let force = false;
    for (let i = 0; i < argv.length; ++i) {
        const arg = argv[i];
        if (arg === '--languages') {
            languagesDir = argv[++i];
        } else if (arg === '--out') {
            out = argv[++i];
        } else if (arg === '--force') {
            force = true;
        } else if (arg.startsWith('-')) {
            return usage();
        } else {
            positional.push(arg);
        }
    }
    if (positional.length !== 1 || languagesDir === undefined || out === undefined) { return usage(); }
    const [code] = positional;
    const dir = resolve(languagesDir, code);
    const ownFile = join(dir, 'sources', 'own.json');
    const yomitanFile = join(dir, 'sources', 'yomitan.json');
    let merged;
    try {
        const own = readSource(ownFile);
        const yomitan = readSource(yomitanFile);
        if (own === null && yomitan === null) {
            console.error(`${code}: neither ${ownFile} nor ${yomitanFile} exists`);
            return 1;
        }
        merged = mergeTransforms(own, yomitan);
    } catch (error) {
        console.error(`${code}: ${error.message}`);
        return 1;
    }
    const text = formatTransforms(merged.transforms);
    const file = resolve(out ?? join(dir, 'transforms.json'));
    if (existsSync(file) && !force) {
        const existing = readFileSync(file, 'utf8');
        const template = join(resolve(languagesDir), '_template', 'transforms.json');
        const replaceable = existing === text || (existsSync(template) && existing === readFileSync(template, 'utf8'));
        if (!replaceable) {
            console.error(`${file} exists and is not the template's; it may hold the rules step 5 removed. Pass --force to replace it or --out to write elsewhere`);
            return 1;
        }
    }
    for (const note of merged.notes) { console.warn(`${code}: note: ${note}`); }
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, text);
    const {own, yomitan, both} = merged.counts;
    console.log(`${code}: ${merged.transforms.transforms.length} transforms, ${own + yomitan + both} rules (${own} own, ${yomitan} yomitan, ${both} both) in ${file}`);
    return 0;
}

if (isMain(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
