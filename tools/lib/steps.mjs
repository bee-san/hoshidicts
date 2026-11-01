// SPDX-License-Identifier: GPL-3.0-or-later
// Text steps and processors (docs/languages.md, section 6) in JavaScript, as
// the tools and test stubs need them. The engine is the implementation that
// lookups use; tools/check-classes.mjs records what these give for `case`
// and `pattern` steps so the conformance test can require the engine to
// agree.

import {ClassError, checkReplacement, parsePattern} from './classes.mjs';

/** Step kinds and the keys each may carry. */
export const STEP_KINDS = Object.freeze({
    case: ['case'],
    normalize: ['normalize', 'within'],
    strip: ['strip'],
    map: ['map', 'at'],
    pattern: ['pattern', 'replace', 'global', 'repeat'],
    alternatives: ['alternatives', 'limit'],
    builtin: ['builtin'],
});

const CASES = new Set(['lower', 'upper', 'upperFirst', 'lowerFirst']);
const FORMS = new Set(['NFC', 'NFD', 'NFKC', 'NFKD']);
const MAP_AT = new Set(['all', 'first', 'last', 'start', 'end']);
export const MAX_PATTERN_REPEATS = 16;
export const MAX_VARIANTS = 4096;

/** Raised for a step the JavaScript tools cannot run (builtins). */
export class UnsupportedStepError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedStepError';
    }
}

/**
 * The kind of a step: the one key of STEP_KINDS it carries.
 * @param {object} step
 * @returns {keyof typeof STEP_KINDS}
 */
export function stepKind(step) {
    if (step === null || typeof step !== 'object' || Array.isArray(step)) {
        throw new ClassError('a step must be an object');
    }
    const kinds = Object.keys(STEP_KINDS).filter((kind) => Object.hasOwn(step, kind));
    if (kinds.length !== 1) {
        throw new ClassError(`a step has exactly one of ${Object.keys(STEP_KINDS).join(', ')}; this one has ${kinds.length === 0 ? 'none' : kinds.join(', ')}`);
    }
    return /** @type {keyof typeof STEP_KINDS} */ (kinds[0]);
}

/**
 * Checks a step's shape and its classes and patterns.
 * @param {object} step
 * @param {import('./classes.mjs').ClassSet} classes
 * @param {{allowBuiltin?: boolean, allowAlternatives?: boolean}} [options]
 */
export function checkStep(step, classes, {allowBuiltin = true, allowAlternatives = true} = {}) {
    const kind = stepKind(step);
    for (const key of Object.keys(step)) {
        if (!STEP_KINDS[kind].includes(key)) { throw new ClassError(`a ${kind} step has no key ${JSON.stringify(key)}`); }
    }
    switch (kind) {
        case 'case':
            if (!CASES.has(step.case)) { throw new ClassError(`case is one of ${[...CASES].join(', ')}`); }
            break;
        case 'normalize':
            if (!FORMS.has(step.normalize)) { throw new ClassError(`normalize is one of ${[...FORMS].join(', ')}`); }
            if (step.within !== undefined) { classes.check(step.within); }
            break;
        case 'strip':
            classes.check(step.strip);
            break;
        case 'map':
            if (step.map === null || typeof step.map !== 'object' || Array.isArray(step.map)) { throw new ClassError('map is an object of key: replacement'); }
            for (const [key, value] of Object.entries(step.map)) {
                if (key === '') { throw new ClassError('a map key may not be empty'); }
                if (typeof value !== 'string') { throw new ClassError(`the map value for ${JSON.stringify(key)} must be a string`); }
            }
            if (step.at !== undefined && !MAP_AT.has(step.at)) { throw new ClassError(`at is one of ${[...MAP_AT].join(', ')}`); }
            break;
        case 'pattern': {
            const {groups} = parsePattern(step.pattern);
            classes.patternSource(step.pattern);
            checkReplacement(step.replace, groups);
            for (const key of ['global', 'repeat']) {
                if (step[key] !== undefined && typeof step[key] !== 'boolean') { throw new ClassError(`${key} is a boolean`); }
            }
            break;
        }
        case 'alternatives':
            if (!allowAlternatives) { throw new ClassError('alternatives are not allowed here'); }
            if (step.alternatives === null || typeof step.alternatives !== 'object' || Array.isArray(step.alternatives)) {
                throw new ClassError('alternatives is an object of key: [alternatives]');
            }
            for (const [key, value] of Object.entries(step.alternatives)) {
                if (key === '') { throw new ClassError('an alternatives key may not be empty'); }
                if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
                    throw new ClassError(`the alternatives for ${JSON.stringify(key)} must be an array of strings`);
                }
            }
            if (step.limit !== undefined && !(Number.isInteger(step.limit) && step.limit >= 1)) { throw new ClassError('limit is a positive integer'); }
            break;
        case 'builtin':
            if (!allowBuiltin) { throw new ClassError('builtins are not allowed here'); }
            if (typeof step.builtin !== 'string') { throw new ClassError('builtin names a builtin'); }
            break;
    }
}

function firstCodePointLength(text) {
    const cp = text.codePointAt(0);
    return cp === undefined ? 0 : cp > 0xFFFF ? 2 : 1;
}

/**
 * Splits text into code point strings.
 * @param {string} text
 * @returns {string[]}
 */
export function codePoints(text) {
    return Array.from(text);
}

function applyCase(mode, text) {
    switch (mode) {
        case 'lower': return text.toLowerCase();
        case 'upper': return text.toUpperCase();
        case 'upperFirst': {
            const n = firstCodePointLength(text);
            return text.slice(0, n).toUpperCase() + text.slice(n);
        }
        case 'lowerFirst': {
            const n = firstCodePointLength(text);
            return text.slice(0, n).toLowerCase() + text.slice(n);
        }
        default: throw new ClassError(`unknown case ${mode}`);
    }
}

function applyNormalize(form, within, text, classes) {
    if (within === undefined) { return text.normalize(form); }
    const inside = classes.matcher(within);
    let result = '';
    let run = '';
    for (const c of text) {
        if (inside(/** @type {number} */ (c.codePointAt(0)))) {
            run += c;
        } else {
            result += run.normalize(form) + c;
            run = '';
        }
    }
    return result + run.normalize(form);
}

function applyStrip(cls, text, classes) {
    const strip = classes.matcher(cls);
    let result = '';
    for (const c of text) {
        if (!strip(/** @type {number} */ (c.codePointAt(0)))) { result += c; }
    }
    return result;
}

/**
 * Non-overlapping matches of the map's keys, scanning left to right, longest
 * key first at each position.
 */
function mapMatches(keys, text) {
    const matches = [];
    let i = 0;
    while (i < text.length) {
        const key = keys.find((k) => text.startsWith(k, i));
        if (key !== undefined) {
            matches.push({index: i, key});
            i += key.length;
        } else {
            i += firstCodePointLength(text.slice(i));
        }
    }
    return matches;
}

function applyMap(map, at = 'all', text) {
    const keys = Object.keys(map).sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
    const replace = ({index, key}) => text.slice(0, index) + map[key] + text.slice(index + key.length);
    switch (at) {
        case 'start': {
            const key = keys.find((k) => text.startsWith(k));
            return key === undefined ? text : map[key] + text.slice(key.length);
        }
        case 'end': {
            const key = keys.find((k) => text.endsWith(k));
            return key === undefined ? text : text.slice(0, text.length - key.length) + map[key];
        }
        case 'first': {
            const [match] = mapMatches(keys, text);
            return match === undefined ? text : replace(match);
        }
        case 'last': {
            const matches = mapMatches(keys, text);
            return matches.length === 0 ? text : replace(matches[matches.length - 1]);
        }
        default: {
            let result = '';
            let last = 0;
            for (const {index, key} of mapMatches(keys, text)) {
                result += text.slice(last, index) + map[key];
                last = index + key.length;
            }
            return result + text.slice(last);
        }
    }
}

function applyPattern(step, text, classes) {
    const regExp = classes.patternRegExp(step.pattern, {global: step.global === true});
    let current = text;
    const times = step.repeat === true ? MAX_PATTERN_REPEATS : 1;
    for (let n = 0; n < times; ++n) {
        regExp.lastIndex = 0;
        const next = current.replace(regExp, step.replace);
        if (next === current) { break; }
        current = next;
    }
    return current;
}

/**
 * Every combination of an alternatives step, in the order of section 6.2:
 * the key first, then its alternatives in order, the first match varying
 * slowest, at most `limit` results.
 */
function applyAlternatives(step, text) {
    const source = text.normalize('NFC');
    const keys = Object.keys(step.alternatives).sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
    /** @type {string[][]} */
    const pieces = [];
    let literal = '';
    let i = 0;
    while (i < source.length) {
        const key = keys.find((k) => source.startsWith(k, i));
        if (key === undefined) {
            const n = firstCodePointLength(source.slice(i));
            literal += source.slice(i, i + n);
            i += n;
            continue;
        }
        if (literal !== '') {
            pieces.push([literal]);
            literal = '';
        }
        pieces.push([key, ...step.alternatives[key]]);
        i += key.length;
    }
    if (literal !== '') { pieces.push([literal]); }
    const limit = step.limit ?? MAX_VARIANTS;
    /** @type {string[]} */
    const results = [];
    const walk = (index, prefix) => {
        if (results.length >= limit) { return; }
        if (index === pieces.length) {
            results.push(prefix);
            return;
        }
        for (const choice of pieces[index]) {
            walk(index + 1, prefix + choice);
            if (results.length >= limit) { return; }
        }
    };
    walk(0, '');
    return results;
}

/**
 * Applies one step. Returns a string, or an array for `alternatives`.
 * @param {object} step
 * @param {string} text
 * @param {import('./classes.mjs').ClassSet} classes
 * @returns {string | string[]}
 */
export function applyStep(step, text, classes) {
    switch (stepKind(step)) {
        case 'case': return applyCase(step.case, text);
        case 'normalize': return applyNormalize(step.normalize, step.within, text, classes);
        case 'strip': return applyStrip(step.strip, text, classes);
        case 'map': return applyMap(step.map, step.at, text);
        case 'pattern': return applyPattern(step, text, classes);
        case 'alternatives': return applyAlternatives(step, text);
        case 'builtin': throw new UnsupportedStepError(`the JavaScript tools have no builtin ${step.builtin}`);
    }
    throw new ClassError('unknown step');
}

/**
 * Applies a variant (a list of steps) and returns its outputs.
 * @param {object[]} steps
 * @param {string} text
 * @param {import('./classes.mjs').ClassSet} classes
 * @returns {string[]}
 */
export function applyVariant(steps, text, classes) {
    let texts = [text];
    for (const step of steps) {
        const next = [];
        for (const t of texts) {
            const out = applyStep(step, t, classes);
            if (Array.isArray(out)) { next.push(...out); } else { next.push(out); }
        }
        texts = next;
    }
    return texts;
}

/**
 * Compares strings by code points (not UTF-16 units).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareCodePoints(a, b) {
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        const x = /** @type {number} */ (a.codePointAt(i));
        const y = /** @type {number} */ (b.codePointAt(j));
        if (x !== y) { return x - y; }
        i += x > 0xFFFF ? 2 : 1;
        j += y > 0xFFFF ? 2 : 1;
    }
    return (a.length - i) - (b.length - j);
}

/**
 * The variants of section 6.1: the processors applied in order, each to every
 * variant the previous ones produced.
 * @param {object[]} processors a pack's `lookup.preprocessors` or `postprocessors`
 * @param {string} text
 * @param {import('./classes.mjs').ClassSet} classes
 * @param {{enabled?: Iterable<string>, limit?: number}} [options] ids of optional processors to run
 * @returns {{text: string, steps: number}[]}
 */
export function processText(processors, text, classes, {enabled = [], limit = MAX_VARIANTS} = {}) {
    const on = new Set(enabled);
    /** @type {Map<string, number>} */
    let variants = new Map([[text, 0]]);
    for (const processor of processors) {
        if (processor.optional === true && !on.has(processor.id)) { continue; }
        const keepInput = processor.keepInput !== false;
        /** @type {Map<string, number>} */
        const next = new Map();
        const add = (t, steps) => {
            const previous = next.get(t);
            if (previous === undefined) {
                if (next.size < limit) { next.set(t, steps); }
            } else if (steps < previous) {
                next.set(t, steps);
            }
        };
        for (const [variant, steps] of variants) {
            if (keepInput) { add(variant, steps); }
            for (const steps2 of processor.variants) {
                for (const output of applyVariant(steps2, variant, classes)) {
                    add(output, output === variant ? steps : steps + 1);
                }
            }
        }
        variants = new Map([...next].sort((a, b) => compareCodePoints(a[0], b[0])));
    }
    return [...variants].map(([t, steps]) => ({text: t, steps}));
}
