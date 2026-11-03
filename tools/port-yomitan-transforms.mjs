#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Ports Yomitan's deinflection rules for one language into the pack format
// (docs/languages.md, section 8.1):
//
//   node tools/port-yomitan-transforms.mjs <yomitan checkout> <code> [--out <file>] [--force]
//
// It imports ext/js/language/<code>/*-transforms.js and writes
// languages/<code>/sources/yomitan.json. A rule's `type` and `deinflected`
// fields are never read: each rule is classified by the shape of its
// `isInflected` source and by calling its `deinflect` on probe stems from
// several scripts (resetting `lastIndex` before every call). Literal suffix,
// prefix and whole-word rules become pack rules; everything else becomes a
// `todo` rule for a person to map (section 8.3), which the conformance test
// rejects until it is mapped. An existing file is kept unless --force is
// given, because it holds those hand-written mappings.

import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {isMain} from './lib/cli.mjs';
import {formatTransforms} from './lib/json.mjs';
import {DEFAULT_LANGUAGES_DIR} from './lib/pack.mjs';
import {PINNED_REVISION, loadTransformDescriptor, yomitanRevision} from './lib/yomitan.mjs';

/**
 * Probe stems: Latin, Cyrillic, Greek, Arabic, Hebrew and Yiddish, precomposed
 * Hangul, kana and kanji, Georgian, with combining sequences, of 0 to 8 code
 * points.
 */
export const PROBE_STEMS = Object.freeze([
    '',
    'a',
    'ab',
    'stem',
    'walk',
    'Straße',
    'café',
    'cafe\u0301',
    'na\u0308ive',
    'кот',
    'слово',
    'їжак',
    'λόγος',
    'αγαπ',
    'كتب',
    'مدرس',
    'كَتَب',
    'ספר',
    'האַנט',
    'בוך',
    'שפּיל',
    '한국',
    '먹',
    'たべ',
    'カタカナ',
    '食べ',
    'წერ',
    'abcdefgh',
]);

const METACHARACTERS = new Set('\\^$.|?*+()[]{}');

function codePointLength(text) {
    let n = 0;
    for (const _ of text) { ++n; }
    return n;
}

/**
 * The literal a regular-expression fragment stands for, or null when it has
 * metacharacters. `\/` (which RegExp#source writes for `/`) is a literal.
 * @param {string} fragment
 * @returns {string | null}
 */
export function literalOf(fragment) {
    let out = '';
    for (let i = 0; i < fragment.length; ++i) {
        const c = fragment[i];
        if (c === '\\') {
            if (fragment[i + 1] === '/') {
                out += '/';
                ++i;
                continue;
            }
            return null;
        }
        if (METACHARACTERS.has(c)) { return null; }
        out += c;
    }
    return out;
}

/**
 * Calls a rule's deinflect with lastIndex reset, as Yomitan's g-flag rules need.
 * @returns {string | null} null when it throws or returns something else
 */
function callDeinflect(rule, text) {
    const regExp = rule.isInflected;
    try {
        if (regExp instanceof RegExp) { regExp.lastIndex = 0; }
        const out = rule.deinflect(text);
        if (regExp instanceof RegExp) { regExp.lastIndex = 0; }
        return typeof out === 'string' ? out : null;
    } catch {
        return null;
    }
}

function testInflected(rule, text) {
    const regExp = rule.isInflected;
    regExp.lastIndex = 0;
    const result = regExp.test(text);
    regExp.lastIndex = 0;
    return result;
}

/**
 * Classifies one Yomitan rule (section 8.1).
 * @param {{isInflected: RegExp, deinflect: (text: string) => string, conditionsIn: string[], conditionsOut: string[]}} rule
 * @param {readonly string[]} [probes]
 * @returns {object} a pack rule
 */
export function classifyRule(rule, probes = PROBE_STEMS) {
    const conditionsIn = [...(rule.conditionsIn ?? [])];
    const conditionsOut = [...(rule.conditionsOut ?? [])];
    const regExp = rule.isInflected;
    const todo = {type: 'todo', isInflected: regExp instanceof RegExp ? regExp.source : String(regExp), conditionsIn, conditionsOut};
    if (!(regExp instanceof RegExp) || typeof rule.deinflect !== 'function') { return todo; }
    // Flags other than g (stateful, reset here) and u or d (no effect on a
    // literal) change what the source means.
    if (!/^[dgu]*$/.test(regExp.flags)) { return todo; }
    const {source} = regExp;

    // ^L$: a whole word, when deinflect returns one constant.
    let match = /^\^([\s\S]*)\$$/.exec(source);
    if (match !== null) {
        const literal = literalOf(match[1]);
        if (literal === null || literal === '' || !testInflected(rule, literal)) { return todo; }
        const constant = callDeinflect(rule, literal);
        if (constant === null) { return todo; }
        for (const stem of probes) {
            for (const text of [stem, stem + literal, literal + stem]) {
                if (callDeinflect(rule, text) !== constant) { return todo; }
            }
        }
        return {type: 'wholeWord', inflected: literal, deinflected: constant, conditionsIn, conditionsOut};
    }

    // ^L: a prefix, when deinflect(L + s) is D + s for every probe stem.
    match = /^\^([\s\S]*)$/.exec(source);
    if (match !== null) {
        const literal = literalOf(match[1]);
        if (literal === null || literal === '') { return todo; }
        let deinflected = null;
        for (const stem of probes) {
            if (!testInflected(rule, literal + stem)) { return todo; }
            const out = callDeinflect(rule, literal + stem);
            if (out === null || !out.endsWith(stem)) { return todo; }
            const prefix = out.slice(0, out.length - stem.length);
            if (deinflected === null) {
                deinflected = prefix;
            } else if (prefix !== deinflected) {
                return todo;
            }
        }
        return {type: 'prefix', inflected: literal, deinflected: /** @type {string} */ (deinflected), conditionsIn, conditionsOut};
    }

    // L$ after nothing, n dots or .{n}: a suffix with stemMinLength n, when
    // deinflect(s + L) is s + D for every probe stem of at least n code points.
    match = /^(?:\.\{(\d+)\}|(\.*))([\s\S]*)\$$/.exec(source);
    if (match !== null) {
        const minimum = match[1] !== undefined ? Number(match[1]) : match[2].length;
        const literal = literalOf(match[3]);
        if (literal === null || literal === '') { return todo; }
        let deinflected = null;
        let probed = 0;
        for (const stem of probes) {
            const long = codePointLength(stem) >= minimum;
            if (testInflected(rule, stem + literal) !== long) { return todo; }
            if (!long) { continue; }
            const out = callDeinflect(rule, stem + literal);
            if (out === null || !out.startsWith(stem)) { return todo; }
            const suffix = out.slice(stem.length);
            if (deinflected === null) {
                deinflected = suffix;
            } else if (suffix !== deinflected) {
                return todo;
            }
            ++probed;
        }
        if (probed === 0) { return todo; }
        const result = {type: 'suffix', inflected: literal, deinflected: /** @type {string} */ (deinflected), conditionsIn, conditionsOut};
        if (minimum > 0) { result.stemMinLength = minimum; }
        return result;
    }
    return todo;
}

function copyCondition(condition) {
    const out = {name: condition.name, isDictionaryForm: condition.isDictionaryForm};
    if (condition.subConditions !== undefined) { out.subConditions = [...condition.subConditions]; }
    if (condition.i18n !== undefined) { out.i18n = structuredClone(condition.i18n); }
    return out;
}

/**
 * The pack form of a Yomitan transform descriptor.
 * @param {any} descriptor
 * @param {{probes?: readonly string[]}} [options]
 * @returns {{transforms: object, counts: Record<string, number>, todos: {transform: string, index: number, source: string}[]}}
 */
export function portDescriptor(descriptor, {probes = PROBE_STEMS} = {}) {
    const conditions = {};
    for (const [name, condition] of Object.entries(descriptor.conditions)) {
        conditions[name] = copyCondition(condition);
    }
    /** @type {Record<string, number>} */
    const counts = {};
    const todos = [];
    const transforms = [];
    for (const [id, transform] of Object.entries(descriptor.transforms)) {
        const rules = transform.rules.map((rule, index) => {
            const ported = classifyRule(rule, probes);
            counts[ported.type] = (counts[ported.type] ?? 0) + 1;
            if (ported.type === 'todo') { todos.push({transform: id, index, source: ported.isInflected}); }
            return ported;
        });
        const out = {id, name: transform.name, description: transform.description};
        if (transform.i18n !== undefined) { out.i18n = structuredClone(transform.i18n); }
        out.source = 'yomitan';
        out.rules = rules;
        transforms.push(out);
    }
    return {transforms: {schema: 1, conditions, transforms}, counts, todos};
}

function usage() {
    console.error('usage: node tools/port-yomitan-transforms.mjs <yomitan checkout> <code> [--out <file>] [--force] [--languages <dir>]');
    return 2;
}

async function main(argv) {
    const positional = [];
    let out = null;
    let force = false;
    let languagesDir = DEFAULT_LANGUAGES_DIR;
    for (let i = 0; i < argv.length; ++i) {
        const arg = argv[i];
        if (arg === '--out') {
            out = argv[++i];
        } else if (arg === '--force') {
            force = true;
        } else if (arg === '--languages') {
            languagesDir = argv[++i];
        } else if (arg.startsWith('-')) {
            return usage();
        } else {
            positional.push(arg);
        }
    }
    if (positional.length !== 2 || out === undefined || languagesDir === undefined) { return usage(); }
    const [root, code] = positional;
    const revision = yomitanRevision(root);
    if (revision !== PINNED_REVISION) {
        console.warn(`warning: ${root} is at ${revision ?? 'an unknown revision'}, not the pinned ${PINNED_REVISION}`);
    }
    const found = await loadTransformDescriptor(root, code);
    if (found === null) {
        console.error(`Yomitan has no ext/js/language/${code}/*-transforms.js`);
        return 1;
    }
    const file = resolve(out ?? join(languagesDir, code, 'sources', 'yomitan.json'));
    if (existsSync(file) && !force) {
        console.error(`${file} exists and may hold hand-mapped rules; pass --force to replace it or --out to write elsewhere`);
        return 1;
    }
    const {transforms, counts, todos} = portDescriptor(found.descriptor);
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, formatTransforms(transforms));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`Ported ${found.file} at ${revision ?? 'unknown revision'}: ${transforms.transforms.length} transforms, ${total} rules ` +
        `(${Object.entries(counts).map(([type, n]) => `${n} ${type}`).join(', ')}) to ${file}`);
    if (todos.length > 0) {
        const shapes = new Map();
        for (const {transform, source} of todos) {
            const key = `${transform}: ${source}`;
            shapes.set(key, (shapes.get(key) ?? 0) + 1);
        }
        console.log(`${todos.length} todo rules to map by hand (section 8.3); the first sources:`);
        for (const [key, n] of [...shapes].slice(0, 20)) { console.log(`  ${key}${n > 1 ? ` (x${n})` : ''}`); }
    }
    return 0;
}

if (isMain(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
