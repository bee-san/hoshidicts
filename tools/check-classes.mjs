#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes or checks languages/<code>/tests/classes.json (docs/languages.md,
// section 12.1 step 2): what Node computes for every class of a pack, every
// other field that holds a class, and every `pattern` and `case` step on the
// pack's corpus strings. The conformance test computes the same with the
// engine and requires equality.
//
//   node tools/check-classes.mjs <code>... [--write]
//   node tools/check-classes.mjs --all [--write]
//   options: --languages <dir> (default: this checkout's languages/)
//
// Field keys are JSON paths: `text.pattern`, `lookup.preprocessors[0].variants[0][1].strip`,
// and for the transforms file `transforms[2].rules[0].stemCharacters`. A step
// is named by its processor's `id` (preprocessors and postprocessors), or by
// the JSON path of its step list (`lookup.readingNormalizer`,
// `lookup.formOfNormalizer`, `presentation.displayTransforms.<name>`,
// `transforms[2].rules[0].then`);
// `step` counts the steps of a processor across its variants in order.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ClassError, checkReplacement, parsePattern} from './lib/classes.mjs';
import {isMain} from './lib/cli.mjs';
import {formatJson} from './lib/json.mjs';
import {DEFAULT_LANGUAGES_DIR, corpusStrings, listPacks, loadPack} from './lib/pack.mjs';
import {applyStep, checkStep, stepKind} from './lib/steps.mjs';

export const GENERATOR = 'tools/check-classes.mjs';

/** Rule keys that hold a class (section 7.3). */
const RULE_CLASS_KEYS = ['stemCharacters', 'stemContains', 'stemStartsWith', 'stemEndsWith', 'stemNotStartsWith', 'stemNotEndsWith'];

function key(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
}

function located(error, path) {
    if (error instanceof ClassError) { return error.at(path); }
    return new Error(`${path}: ${error.message}`);
}

/**
 * Every step list of a pack, in a fixed order, with the name `steps` uses.
 * @param {any} language
 * @param {any} transforms
 * @returns {{name: string, path: string, lists: {path: string, steps: any[]}[], allowBuiltin: boolean, allowAlternatives: boolean}[]}
 */
export function stepLists(language, transforms) {
    const out = [];
    const lookup = language.lookup ?? {};
    for (const field of ['preprocessors', 'postprocessors']) {
        (lookup[field] ?? []).forEach((processor, i) => {
            const path = `lookup.${field}[${i}]`;
            const variants = Array.isArray(processor?.variants) ? processor.variants : [];
            out.push({
                name: processor?.id,
                path,
                lists: variants.map((steps, j) => ({path: `${path}.variants[${j}]`, steps: Array.isArray(steps) ? steps : []})),
                allowBuiltin: true,
                allowAlternatives: true,
            });
        });
    }
    if (Array.isArray(lookup.readingNormalizer)) {
        out.push({name: 'lookup.readingNormalizer', path: 'lookup.readingNormalizer', lists: [{path: 'lookup.readingNormalizer', steps: lookup.readingNormalizer}], allowBuiltin: true, allowAlternatives: true});
    }
    if (Array.isArray(lookup.formOfNormalizer)) {
        out.push({name: 'lookup.formOfNormalizer', path: 'lookup.formOfNormalizer', lists: [{path: 'lookup.formOfNormalizer', steps: lookup.formOfNormalizer}], allowBuiltin: false, allowAlternatives: false});
    }
    for (const [name, steps] of Object.entries(language.presentation?.displayTransforms ?? {})) {
        const path = `presentation.displayTransforms${key(name)}`;
        out.push({name: path, path, lists: [{path, steps: Array.isArray(steps) ? steps : []}], allowBuiltin: false, allowAlternatives: false});
    }
    (transforms?.transforms ?? []).forEach((transform, i) => {
        (transform?.rules ?? []).forEach((rule, j) => {
            if (Array.isArray(rule?.then)) {
                const path = `transforms[${i}].rules[${j}].then`;
                out.push({name: path, path, lists: [{path, steps: rule.then}], allowBuiltin: false, allowAlternatives: false});
            }
        });
    });
    return out;
}

/**
 * Every field that holds a class, other than the `classes` entries, by JSON path.
 * @param {any} language
 * @param {any} transforms
 * @returns {[string, string][]}
 */
export function classFields(language, transforms) {
    /** @type {[string, string][]} */
    const out = [];
    const text = language.text ?? {};
    for (const field of ['pattern', 'wordCharacters', 'wordInternal']) {
        if (typeof text[field] === 'string') { out.push([`text.${field}`, text[field]]); }
    }
    const view = language.capabilities?.characterView;
    if (view !== null && typeof view === 'object' && typeof view.pattern === 'string') {
        out.push(['capabilities.characterView.pattern', view.pattern]);
    }
    for (const {lists} of stepLists(language, null)) {
        for (const {path, steps} of lists) {
            steps.forEach((step, k) => {
                if (typeof step?.strip === 'string') { out.push([`${path}[${k}].strip`, step.strip]); }
                if (typeof step?.normalize === 'string' && typeof step.within === 'string') { out.push([`${path}[${k}].within`, step.within]); }
            });
        }
    }
    (transforms?.transforms ?? []).forEach((transform, i) => {
        (transform?.rules ?? []).forEach((rule, j) => {
            const path = `transforms[${i}].rules[${j}]`;
            for (const field of RULE_CLASS_KEYS) {
                if (typeof rule?.[field] === 'string') { out.push([`${path}.${field}`, rule[field]]); }
            }
            if (typeof rule?.stemChange?.between === 'string') { out.push([`${path}.stemChange.between`, rule.stemChange.between]); }
            (Array.isArray(rule?.then) ? rule.then : []).forEach((step, k) => {
                if (typeof step?.strip === 'string') { out.push([`${path}.then[${k}].strip`, step.strip]); }
                if (typeof step?.normalize === 'string' && typeof step.within === 'string') { out.push([`${path}.then[${k}].within`, step.within]); }
            });
        });
    });
    return out;
}

/**
 * Checks every `pattern` rule of a transforms file against the dialect.
 * @param {any} transforms
 * @param {import('./lib/classes.mjs').ClassSet} classes
 */
function checkPatternRules(transforms, classes) {
    (transforms?.transforms ?? []).forEach((transform, i) => {
        (transform?.rules ?? []).forEach((rule, j) => {
            if (rule?.type !== 'pattern') { return; }
            const path = `transforms[${i}].rules[${j}]`;
            try {
                const {groups} = parsePattern(rule.pattern);
                classes.patternSource(rule.pattern);
                checkReplacement(rule.replacement, groups);
            } catch (error) {
                throw located(error, path);
            }
        });
    });
}

/**
 * What tests/classes.json must hold for a pack.
 * @param {ReturnType<typeof loadPack>} pack
 * @returns {object}
 */
export function computeExpectations(pack) {
    const {language, transforms, classes} = pack;
    const result = {
        generator: GENERATOR,
        unicode: process.versions.unicode,
        classes: {},
        fields: {},
        steps: [],
    };
    for (const name of classes.names) {
        result.classes[name] = classes.ranges(`{${name}}`);
    }
    for (const [path, source] of classFields(language, transforms)) {
        try {
            result.fields[path] = classes.ranges(source);
        } catch (error) {
            throw located(error, path);
        }
    }
    checkPatternRules(transforms, classes);
    const inputs = corpusStrings(pack);
    const ids = new Set();
    for (const {name, path, lists, allowBuiltin, allowAlternatives} of stepLists(language, transforms)) {
        if (path.startsWith('lookup.p')) {
            if (typeof name !== 'string' || name === '') { throw new Error(`${path}: a processor needs an id`); }
            if (ids.has(name)) { throw new Error(`${path}: the processor id ${name} is used twice (pre- and postprocessor ids must be unique)`); }
            ids.add(name);
        }
        let index = 0;
        for (const {path: listPath, steps} of lists) {
            steps.forEach((step, k) => {
                const stepPath = `${listPath}[${k}]`;
                let kind;
                try {
                    checkStep(step, classes, {allowBuiltin, allowAlternatives});
                    kind = stepKind(step);
                } catch (error) {
                    throw located(error, stepPath);
                }
                if (kind === 'case' || kind === 'pattern') {
                    let cases;
                    try {
                        cases = inputs.map((input) => [input, /** @type {string} */ (applyStep(step, input, classes))]);
                    } catch (error) {
                        throw located(error, stepPath);
                    }
                    result.steps.push({processor: name, step: index, cases});
                }
                ++index;
            });
        }
    }
    return result;
}

/**
 * The text of tests/classes.json.
 * @param {object} expectations
 * @returns {string}
 */
export function formatExpectations(expectations) {
    return formatJson(expectations);
}

function describeDifference(expected, actual) {
    let parsed;
    try {
        parsed = JSON.parse(actual);
    } catch {
        return 'it is not valid JSON';
    }
    const want = JSON.parse(expected);
    const differ = [];
    for (const field of ['generator', 'unicode']) {
        if (parsed[field] !== want[field]) { differ.push(`${field} is ${JSON.stringify(parsed[field])}, Node gives ${JSON.stringify(want[field])}`); }
    }
    for (const field of ['classes', 'fields']) {
        const names = new Set([...Object.keys(parsed[field] ?? {}), ...Object.keys(want[field] ?? {})]);
        for (const name of names) {
            if (JSON.stringify(parsed[field]?.[name]) !== JSON.stringify(want[field]?.[name])) { differ.push(`${field}[${JSON.stringify(name)}] differs`); }
        }
    }
    if (JSON.stringify(parsed.steps) !== JSON.stringify(want.steps)) { differ.push('steps differ'); }
    return differ.length === 0 ? 'only its formatting differs' : differ.slice(0, 10).join('; ');
}

/**
 * Checks or writes one pack's tests/classes.json.
 * @param {string} code
 * @param {{write?: boolean, languagesDir?: string}} [options]
 * @returns {{ok: boolean, message: string, file: string}}
 */
export function checkClasses(code, {write = false, languagesDir = DEFAULT_LANGUAGES_DIR} = {}) {
    const pack = loadPack(code, {languagesDir});
    const text = formatExpectations(computeExpectations(pack));
    const file = join(pack.dir, 'tests', 'classes.json');
    const summary = (() => {
        const parsed = JSON.parse(text);
        return `${Object.keys(parsed.classes).length} classes, ${Object.keys(parsed.fields).length} fields, ${parsed.steps.length} steps`;
    })();
    if (write) {
        mkdirSync(join(pack.dir, 'tests'), {recursive: true});
        const previous = existsSync(file) ? readFileSync(file, 'utf8') : null;
        writeFileSync(file, text);
        return {ok: true, file, message: `${code}: ${previous === text ? 'unchanged' : 'wrote'} ${file} (${summary})`};
    }
    if (!existsSync(file)) {
        return {ok: false, file, message: `${code}: ${file} is missing; run node tools/check-classes.mjs ${code} --write and commit it`};
    }
    const actual = readFileSync(file, 'utf8');
    if (actual !== text) {
        return {ok: false, file, message: `${code}: ${file} is not what Node ${process.version} (Unicode ${process.versions.unicode}) computes: ${describeDifference(text, actual)}; run node tools/check-classes.mjs ${code} --write`};
    }
    return {ok: true, file, message: `${code}: ${file} matches (${summary})`};
}

function main(argv) {
    const codes = [];
    let write = false;
    let all = false;
    let languagesDir = DEFAULT_LANGUAGES_DIR;
    for (let i = 0; i < argv.length; ++i) {
        const arg = argv[i];
        if (arg === '--write') {
            write = true;
        } else if (arg === '--all') {
            all = true;
        } else if (arg === '--languages') {
            languagesDir = argv[++i];
            if (languagesDir === undefined) { return usage(); }
        } else if (arg.startsWith('-')) {
            return usage();
        } else {
            codes.push(arg);
        }
    }
    if (all) { codes.push(...listPacks(languagesDir).filter((code) => !codes.includes(code))); }
    if (codes.length === 0) { return usage(); }
    let failed = 0;
    for (const code of codes) {
        try {
            const {ok, message} = checkClasses(code, {write, languagesDir});
            (ok ? console.log : console.error)(message);
            if (!ok) { ++failed; }
        } catch (error) {
            console.error(`${code}: ${error.message}`);
            ++failed;
        }
    }
    return failed === 0 ? 0 : 1;
}

function usage() {
    console.error('usage: node tools/check-classes.mjs <code>... | --all [--write] [--languages <dir>]');
    return 2;
}

if (isMain(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
