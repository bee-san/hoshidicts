// SPDX-License-Identifier: GPL-3.0-or-later
// Character classes (docs/languages.md, section 5) and the pattern dialect
// (section 7.6) of hoshidicts language packs, in JavaScript.
//
// The engine parses the same syntax itself; tools/check-classes.mjs writes
// what this module computes into languages/<code>/tests/classes.json, and the
// conformance test requires the engine to agree. Hosts import this module to
// expand the patterns they copy from packs (Hachidori's
// scripts/sync-languages.mjs):
//
//   import {ClassSet} from './tools/lib/classes.mjs';
//   const classes = new ClassSet(descriptor.classes);  // parses, checks references and cycles
//   classes.source(descriptor.text.pattern);           // a RegExp source for the `u` flag
//   classes.regExp('{word}');                          // the RegExp itself
//   classes.ranges('{letter}');                        // [[first, last], ...] without surrogates
//   classes.patternSource('(l|dell)[\'\u2019]');       // a `pattern` step for a RegExp without `u`
//
// Class syntax: one bracket expression `[...]` or `[^...]`, or one bare
// reference `{name}`. Inside the brackets: literal characters (`\`, `]`, `^`
// and `-` written `\\`, `\]`, `\^` and `\-`; a `{` always starts a
// reference and a `}` must be written \u007D), `\uXXXX` and `\u{X...}` code
// point escapes, ranges, the Unicode general categories `\p{L}`, `\p{Lu}`,
// ... and references `{name}` to other classes of the pack.

const MAJOR_CATEGORIES = ['C', 'L', 'M', 'N', 'P', 'S', 'Z'];
const CATEGORIES = [
    'Cc', 'Cf', 'Cn', 'Co', 'Cs',
    'Ll', 'Lm', 'Lo', 'Lt', 'Lu',
    'Mc', 'Me', 'Mn',
    'Nd', 'Nl', 'No',
    'Pc', 'Pd', 'Pe', 'Pf', 'Pi', 'Po', 'Ps',
    'Sc', 'Sk', 'Sm', 'So',
    'Zl', 'Zp', 'Zs',
];

/** The general categories a class may name with `\p{...}`. */
export const GENERAL_CATEGORIES = Object.freeze([...MAJOR_CATEGORIES, ...CATEGORIES]);
const CATEGORY_SET = new Set(GENERAL_CATEGORIES);

/** Class names, as keys of `classes` and inside `{...}` references. */
export const CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REFERENCE = /^\{([A-Za-z_][A-Za-z0-9_]*)\}/;

const MAX_CODE_POINT = 0x10FFFF;
const SURROGATE_FIRST = 0xD800;
const SURROGATE_LAST = 0xDFFF;

/** A problem in a class or a pattern, with the offending source and offset. */
export class ClassError extends Error {
    /**
     * @param {string} message
     * @param {{source?: string, offset?: number, path?: string}} [details]
     */
    constructor(message, {source, offset, path} = {}) {
        super(ClassError.format(message, source, offset, path));
        this.name = 'ClassError';
        this.reason = message;
        this.source = source;
        this.offset = offset;
        this.path = path;
    }

    /**
     * The same error, located at a JSON path such as `text.pattern`.
     * @param {string} path
     * @returns {ClassError}
     */
    at(path) {
        return new ClassError(this.reason, {source: this.source, offset: this.offset, path: this.path ? `${path}: ${this.path}` : path});
    }

    static format(message, source, offset, path) {
        let text = path ? `${path}: ${message}` : message;
        if (typeof source === 'string') {
            text += ` in ${JSON.stringify(source)}`;
            if (typeof offset === 'number') { text += ` at offset ${offset}`; }
        }
        return text;
    }
}

function isSurrogate(cp) {
    return cp >= SURROGATE_FIRST && cp <= SURROGATE_LAST;
}

function hex(cp, width = 4) {
    return cp.toString(16).toUpperCase().padStart(width, '0');
}

/**
 * A code point as a class atom in a RegExp source with the `u` flag.
 * @param {number} cp
 * @returns {string}
 */
function unicodeEscape(cp) {
    return cp <= 0xFFFF && !isSurrogate(cp) ? `\\u${hex(cp)}` : `\\u{${hex(cp, 1)}}`;
}

/**
 * Reads one code point escape (`\uXXXX` or `\u{X...}`) that starts at `i`
 * (the backslash). Returns the code point and the offset after it.
 */
function readCodePointEscape(source, i, {allowBraces}) {
    if (source[i + 2] === '{') {
        if (!allowBraces) { throw new ClassError('\\u{...} is not in the pattern dialect; write \\uXXXX (classes in patterns stop at U+FFFF)', {source, offset: i}); }
        const end = source.indexOf('}', i + 3);
        const digits = end < 0 ? '' : source.slice(i + 3, end);
        if (!/^[0-9A-Fa-f]{1,6}$/.test(digits)) { throw new ClassError('\\u{...} needs 1 to 6 hexadecimal digits', {source, offset: i}); }
        const cp = Number.parseInt(digits, 16);
        if (cp > MAX_CODE_POINT) { throw new ClassError('code point above U+10FFFF', {source, offset: i}); }
        if (isSurrogate(cp)) { throw new ClassError('surrogate code points are not characters', {source, offset: i}); }
        return {cp, next: end + 1};
    }
    const digits = source.slice(i + 2, i + 6);
    if (!/^[0-9A-Fa-f]{4}$/.test(digits)) { throw new ClassError('\\u needs four hexadecimal digits', {source, offset: i}); }
    const cp = Number.parseInt(digits, 16);
    if (isSurrogate(cp)) {
        throw new ClassError(`\\u${digits} is a surrogate; write a character above U+FFFF as ${allowBraces ? '\\u{...}' : 'a literal outside classes'}`, {source, offset: i});
    }
    return {cp, next: i + 6};
}

/**
 * Parses one class field: a bracket expression or a bare reference.
 * @param {string} source
 * @returns {{type: 'ref', name: string} | {type: 'set', negated: boolean, items: ClassItem[]}}
 *
 * @typedef {{kind: 'char', cp: number, raw: string} | {kind: 'range', from: number, to: number, raw: string} |
 *           {kind: 'category', name: string, raw: string} | {kind: 'ref', name: string, raw: string}} ClassItem
 */
export function parseClass(source) {
    if (typeof source !== 'string') {
        throw new ClassError(`a class must be a string, not ${source === null ? 'null' : typeof source}`);
    }
    if (source.startsWith('{')) {
        const match = REFERENCE.exec(source);
        if (match === null || match[0].length !== source.length) {
            throw new ClassError('a bare reference is {name}, with a name of letters, digits and _', {source, offset: 0});
        }
        return {type: 'ref', name: match[1]};
    }
    if (!source.startsWith('[')) {
        throw new ClassError('a class is one bracket expression [...] or one reference {name}', {source, offset: 0});
    }
    let i = 1;
    let negated = false;
    if (source[i] === '^') {
        negated = true;
        ++i;
    }
    /** @type {ClassItem[]} */
    const items = [];

    // Reads a character atom or a category at i; returns null at the closing bracket.
    const readAtom = () => {
        if (i >= source.length) { throw new ClassError('the class is not closed with ]', {source, offset: i}); }
        const start = i;
        const cp = /** @type {number} */ (source.codePointAt(i));
        const c = String.fromCodePoint(cp);
        if (c === ']') { return null; }
        if (c === '\\') {
            const e = source[i + 1];
            if (e === undefined) { throw new ClassError('the class ends with a lone backslash', {source, offset: i}); }
            if (e === '\\' || e === ']' || e === '^' || e === '-') {
                i += 2;
                return {kind: 'char', cp: e.codePointAt(0), raw: source.slice(start, i)};
            }
            if (e === 'u') {
                const {cp: value, next} = readCodePointEscape(source, i, {allowBraces: true});
                i = next;
                return {kind: 'char', cp: value, raw: source.slice(start, i)};
            }
            if (e === 'p') {
                const end = source.indexOf('}', i + 3);
                if (source[i + 2] !== '{' || end < 0) { throw new ClassError('\\p needs a category in braces, such as \\p{L}', {source, offset: i}); }
                const name = source.slice(i + 3, end);
                if (/[=:]/.test(name) || /^(?:Script|sc|scx|Script_Extensions)$/i.test(name)) {
                    throw new ClassError(`script properties such as \\p{${name}} are not accepted; write the ranges (section 5)`, {source, offset: i});
                }
                if (!CATEGORY_SET.has(name)) {
                    throw new ClassError(`\\p{${name}} is not a general category; use one of ${GENERAL_CATEGORIES.join(', ')}`, {source, offset: i});
                }
                i = end + 1;
                return {kind: 'category', name, raw: source.slice(start, i)};
            }
            if (e === 'P') { throw new ClassError('\\P{...} is not accepted; negate the whole class with [^...]', {source, offset: i}); }
            throw new ClassError(`\\${e} is not accepted in a class; only \\\\ \\] \\^ \\- \\uXXXX \\u{...} and \\p{...} are`, {source, offset: i});
        }
        if (isSurrogate(cp)) { throw new ClassError('a lone surrogate is not a character', {source, offset: i}); }
        if (c === '-') { throw new ClassError('a - that is not between two characters must be written \\-', {source, offset: i}); }
        if (c === '^') { throw new ClassError('a ^ that does not negate the class must be written \\^', {source, offset: i}); }
        if (c === '}') { throw new ClassError('a literal } must be written \\u007D', {source, offset: i}); }
        i += c.length;
        return {kind: 'char', cp, raw: c};
    };

    for (;;) {
        if (i >= source.length) { throw new ClassError('the class is not closed with ]', {source, offset: i}); }
        if (source[i] === '{') {
            const match = REFERENCE.exec(source.slice(i));
            if (match === null) {
                throw new ClassError('a { starts a reference {name}; write a literal { as \\u007B', {source, offset: i});
            }
            items.push({kind: 'ref', name: match[1], raw: match[0]});
            i += match[0].length;
            continue;
        }
        const start = i;
        const atom = readAtom();
        if (atom === null) {
            ++i;
            break;
        }
        if (source[i] === '-' && atom.kind === 'char') {
            if (source[i + 1] === ']' || i + 1 >= source.length) {
                throw new ClassError('a - that is not between two characters must be written \\-', {source, offset: i});
            }
            if (source[i + 1] === '{') {
                throw new ClassError('a range cannot end with a reference', {source, offset: i + 1});
            }
            ++i;
            const end = readAtom();
            if (end === null || end.kind !== 'char') {
                throw new ClassError('a range needs a character at both ends', {source, offset: start});
            }
            if (end.cp < atom.cp) {
                throw new ClassError(`the range ${atom.raw}-${end.raw} is out of order`, {source, offset: start});
            }
            items.push({kind: 'range', from: atom.cp, to: end.cp, raw: source.slice(start, i)});
            continue;
        }
        if (source[i] === '-' && atom.kind === 'category') {
            throw new ClassError('a category cannot start a range', {source, offset: start});
        }
        items.push(atom);
    }
    if (i !== source.length) {
        throw new ClassError('a class is one bracket expression; text follows the closing ]', {source, offset: i});
    }
    return {type: 'set', negated, items};
}

/**
 * The names a class field refers to.
 * @param {string} source
 * @returns {string[]}
 */
export function classReferences(source) {
    const ast = parseClass(source);
    if (ast.type === 'ref') { return [ast.name]; }
    return ast.items.filter((item) => item.kind === 'ref').map((item) => item.name);
}

const rangeCache = new Map();

/**
 * The code points a RegExp source with the `u` flag accepts, as sorted,
 * merged [first, last] ranges. The source must match exactly one code point
 * (a bracket expression).
 * @param {string} source
 * @param {{surrogates?: boolean}} [options] include lone surrogates (default: not)
 * @returns {number[][]}
 */
export function rangesOfSource(source, {surrogates = false} = {}) {
    const key = `${surrogates ? 's' : 'n'}${source}`;
    const cached = rangeCache.get(key);
    if (cached !== undefined) { return cached.map((r) => [...r]); }
    const regExp = new RegExp(`^(?:${source})$`, 'u');
    /** @type {number[][]} */
    const ranges = [];
    let first = -1;
    for (let cp = 0; cp <= MAX_CODE_POINT; ++cp) {
        if (!surrogates && cp === SURROGATE_FIRST) {
            if (first >= 0) {
                ranges.push([first, SURROGATE_FIRST - 1]);
                first = -1;
            }
            cp = SURROGATE_LAST;
            continue;
        }
        if (regExp.test(String.fromCodePoint(cp))) {
            if (first < 0) { first = cp; }
        } else if (first >= 0) {
            ranges.push([first, cp - 1]);
            first = -1;
        }
    }
    if (first >= 0) { ranges.push([first, MAX_CODE_POINT]); }
    rangeCache.set(key, ranges);
    return ranges.map((r) => [...r]);
}

/**
 * Ranges as the items of a bracket expression for a RegExp with the `u` flag.
 * @param {number[][]} ranges
 * @returns {string}
 */
export function rangesToItems(ranges) {
    return ranges.map(([first, last]) => (first === last ? unicodeEscape(first) : `${unicodeEscape(first)}-${unicodeEscape(last)}`)).join('');
}

/**
 * Ranges as the items of a bracket expression in the pattern dialect (no `u`
 * flag): every member must be at most U+FFFF.
 * @param {number[][]} ranges
 * @returns {string}
 */
export function rangesToPatternItems(ranges) {
    return ranges.map(([first, last]) => {
        if (last > 0xFFFF) { throw new ClassError('a class in a pattern may only have members up to U+FFFF'); }
        return first === last ? `\\u${hex(first)}` : `\\u${hex(first)}-\\u${hex(last)}`;
    }).join('');
}

/**
 * Merges and sorts [first, last] ranges.
 * @param {number[][]} ranges
 * @returns {number[][]}
 */
export function mergeRanges(ranges) {
    const sorted = ranges.map((r) => [...r]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    /** @type {number[][]} */
    const merged = [];
    for (const [first, last] of sorted) {
        const previous = merged[merged.length - 1];
        if (previous !== undefined && first <= previous[1] + 1) {
            previous[1] = Math.max(previous[1], last);
        } else {
            merged.push([first, last]);
        }
    }
    return merged;
}

/**
 * The character classes of one pack. The constructor parses every class,
 * checks that references name defined classes and do not form cycles, and
 * checks that JavaScript accepts every expansion.
 */
export class ClassSet {
    /** @type {Map<string, ReturnType<typeof parseClass>>} */
    #definitions = new Map();
    /** @type {Map<string, {negated: boolean, inner: string, source: string}>} */
    #expansions = new Map();

    /**
     * @param {Record<string, string> | null | undefined} definitions a pack's `classes` object
     */
    constructor(definitions = {}) {
        if (definitions === null || definitions === undefined) { definitions = {}; }
        if (typeof definitions !== 'object' || Array.isArray(definitions)) {
            throw new ClassError('classes must be an object of name: class');
        }
        for (const [name, source] of Object.entries(definitions)) {
            if (!CLASS_NAME.test(name)) {
                throw new ClassError(`the class name ${JSON.stringify(name)} must be letters, digits and _, starting with a letter or _`, {path: 'classes'});
            }
            try {
                this.#definitions.set(name, parseClass(source));
            } catch (error) {
                throw error instanceof ClassError ? error.at(`classes.${name}`) : error;
            }
        }
        for (const name of this.#definitions.keys()) {
            this.#expandName(name, []);
        }
    }

    /** @returns {string[]} the class names in definition order */
    get names() {
        return [...this.#definitions.keys()];
    }

    /**
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
        return this.#definitions.has(name);
    }

    #expandName(name, stack) {
        const done = this.#expansions.get(name);
        if (done !== undefined) { return done; }
        if (stack.includes(name)) {
            throw new ClassError(`class references form a cycle: ${[...stack.slice(stack.indexOf(name)), name].join(' -> ')}`, {path: `classes.${stack[0]}`});
        }
        const definition = this.#definitions.get(name);
        if (definition === undefined) {
            const from = stack[stack.length - 1];
            throw new ClassError(`{${name}} names no class of this pack`, {path: from === undefined ? undefined : `classes.${from}`});
        }
        const expansion = this.#expandAst(definition, [...stack, name]);
        try {
            new RegExp(expansion.source, 'u');
        } catch (error) {
            throw new ClassError(`JavaScript rejects the expansion ${JSON.stringify(expansion.source)}: ${error.message}`, {path: `classes.${name}`});
        }
        this.#expansions.set(name, expansion);
        return expansion;
    }

    #expandAst(ast, stack) {
        if (ast.type === 'ref') { return this.#expandName(ast.name, stack); }
        let inner = '';
        for (const item of ast.items) {
            if (item.kind !== 'ref') {
                inner += item.raw;
                continue;
            }
            const target = this.#expandName(item.name, stack);
            // A negated class cannot be written inside another bracket
            // expression without the `v` flag; its members are listed instead.
            inner += target.negated ? rangesToItems(rangesOfSource(target.source, {surrogates: true})) : target.inner;
        }
        return {negated: ast.negated, inner, source: `[${ast.negated ? '^' : ''}${inner}]`};
    }

    #expandField(source) {
        const expansion = this.#expandAst(parseClass(source), []);
        try {
            new RegExp(expansion.source, 'u');
        } catch (error) {
            throw new ClassError(`JavaScript rejects the expansion ${JSON.stringify(expansion.source)}: ${error.message}`, {source});
        }
        return expansion;
    }

    /**
     * Checks a class field (a bracket expression or a bare reference).
     * @param {string} source
     */
    check(source) {
        this.#expandField(source);
    }

    /**
     * A class field with every reference expanded: a RegExp source for the
     * `u` flag that matches one code point.
     * @param {string} source a bracket expression or a bare reference
     * @returns {string}
     */
    source(source) {
        return this.#expandField(source).source;
    }

    /**
     * @param {string} source a class field
     * @param {string} [flags] flags besides `u`
     * @returns {RegExp}
     */
    regExp(source, flags = '') {
        return new RegExp(this.source(source), flags.includes('u') ? flags : `${flags}u`);
    }

    /**
     * Sorted, merged code point ranges of a class field over all of Unicode
     * without surrogates.
     * @param {string} source
     * @returns {number[][]}
     */
    ranges(source) {
        return rangesOfSource(this.source(source));
    }

    /**
     * A predicate for one code point.
     * @param {string} source a class field
     * @returns {(cp: number) => boolean}
     */
    matcher(source) {
        const regExp = new RegExp(`^${this.source(source)}$`, 'u');
        return (cp) => regExp.test(String.fromCodePoint(cp));
    }

    /**
     * Every class, expanded, by name.
     * @returns {Record<string, string>}
     */
    expandedClasses() {
        return Object.fromEntries(this.names.map((name) => [name, this.#expandName(name, []).source]));
    }

    /**
     * Checks a pattern of the dialect of section 7.6 and expands its `{name}`
     * references to explicit ranges.
     * @param {string} pattern
     * @param {{global?: boolean}} [options] global: the pattern replaces every match
     * @returns {string} a RegExp source for a RegExp without the `u` flag
     */
    patternSource(pattern, {global = false} = {}) {
        const {references} = parsePattern(pattern, {global});
        let result = '';
        let last = 0;
        for (const {name, start, end, inClass} of references) {
            if (!this.has(name)) { throw new ClassError(`{${name}} names no class of this pack`, {source: pattern, offset: start}); }
            let items;
            try {
                items = rangesToPatternItems(this.ranges(`{${name}}`));
            } catch (error) {
                throw new ClassError(`{${name}} has members above U+FFFF, which a pattern cannot reference`, {source: pattern, offset: start});
            }
            result += pattern.slice(last, start) + (inClass ? items : `[${items}]`);
            last = end;
        }
        return result + pattern.slice(last);
    }

    /**
     * @param {string} pattern a pattern of the dialect of section 7.6
     * @param {{global?: boolean}} [options]
     * @returns {RegExp}
     */
    patternRegExp(pattern, {global = false} = {}) {
        return new RegExp(this.patternSource(pattern, {global}), global ? 'g' : '');
    }

    /**
     * A copy of a step list (section 6.2) with its classes and patterns
     * expanded: `strip` and `within` become sources for the `u` flag,
     * `pattern` a source for a RegExp without it. Hosts use it for the
     * display transforms they copy.
     * @param {object[]} steps
     * @returns {object[]}
     */
    expandSteps(steps) {
        return steps.map((step) => {
            const out = {...step};
            if (typeof step.strip === 'string') { out.strip = this.source(step.strip); }
            if (typeof step.within === 'string') { out.within = this.source(step.within); }
            if (typeof step.pattern === 'string') { out.pattern = this.patternSource(step.pattern); }
            return out;
        });
    }
}

const PATTERN_SYNTAX = '^$\\.*+?()[]{}|/';

/**
 * Parses a pattern of the dialect of section 7.6 and throws a ClassError for
 * anything outside it, including the constructs std::regex and JavaScript
 * read differently: a global pattern that can match the empty text, a
 * back-reference to a group that may not take part in the match, a
 * capturing group inside a repeated group, a quantifier on a group that
 * can match the empty text, and `^`, a capturing group or a back-reference
 * inside a lookahead. Returns the number of capturing groups, the
 * positions of the `{name}` references and whether the pattern can match the
 * empty text.
 * @param {string} pattern
 * @param {{global?: boolean}} [options] global: the pattern replaces every match
 * @returns {{groups: number, references: {name: string, start: number, end: number, inClass: boolean}[], nullable: boolean}}
 */
export function parsePattern(pattern, {global = false} = {}) {
    if (typeof pattern !== 'string') { throw new ClassError('a pattern must be a string'); }
    let i = 0;
    let groups = 0;
    /** @type {Set<number>} */
    const closedGroups = new Set();
    /** @type {{name: string, start: number, end: number, inClass: boolean}[]} */
    const references = [];
    // Frames are the alternatives and the groups and lookaheads that enclose
    // a position. A frame that has closed is optional when what it holds may
    // not take part in a match that goes on past it: an alternative of a
    // disjunction with more than one, a group repeated at least zero times,
    // a negative lookahead. (A lookahead may hold no capturing group or
    // back-reference, so its frame decides nothing today; it stays so that
    // this analysis does not depend on that rule.)
    let nextFrame = 0;
    /** @type {number[]} the open frames, outermost first */
    const frames = [];
    /** @type {boolean[]} by frame */
    const optionalFrame = [];
    /** @type {number[][]} by group: the frames that held it when it opened, then its own */
    const groupFrames = [];
    /** @type {boolean[]} by group: whether it can match the empty text */
    const groupNullable = [];
    /** How many lookaheads enclose the position. */
    let lookaheads = 0;
    const fail = (message, offset = i) => {
        throw new ClassError(message, {source: pattern, offset});
    };
    const startsWith = (text) => pattern.startsWith(text, i);

    const quantifierAt = (at) => {
        const c = pattern[at];
        if (c === '*' || c === '+' || c === '?') { return 1; }
        if (c === '{') {
            const match = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(at));
            if (match !== null) { return match[0].length; }
        }
        return 0;
    };

    /** @returns {{min: number} | null} the quantifier at i, or null when there is none */
    const parseQuantifier = (canRepeat) => {
        const length = quantifierAt(i);
        if (length === 0) { return null; }
        if (!canRepeat) { fail('nothing to repeat: assertions and lookaheads take no quantifier'); }
        let min = pattern[i] === '+' ? 1 : 0;
        if (pattern[i] === '{') {
            const match = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
            min = Number(match[1]);
            const max = match[3] === undefined || match[3] === '' ? Infinity : Number(match[3]);
            if (min > 65535 || (max !== Infinity && max > 65535)) { fail('a quantifier above 65535 is not in the pattern dialect'); }
            if (match[2] !== undefined && match[3] !== '' && max < min) { fail('the quantifier {m,n} needs m <= n'); }
        }
        i += length;
        if (pattern[i] === '?') { ++i; }
        if (quantifierAt(i) !== 0) { fail('nothing to repeat'); }
        return {min};
    };
    const repeatsZero = (quantifier) => quantifier !== null && quantifier.min === 0;

    const parseClassInPattern = () => {
        const start = i;
        ++i;
        if (pattern[i] === '^') { ++i; }
        let count = 0;
        const readAtom = () => {
            const at = i;
            const c = pattern[i];
            if (c === undefined) { fail('the class is not closed with ]', start); }
            if (c === ']') { return null; }
            if (c === '[') {
                if (/^\[[:.=]/.test(pattern.slice(i))) { fail('POSIX brackets such as [[:alpha:]] are not in the pattern dialect'); }
                fail('a [ inside a class must be written \\[');
            }
            if (c === '\\') {
                const e = pattern[i + 1];
                if (e === undefined) { fail('the pattern ends with a lone backslash'); }
                if (e === '\\' || e === ']' || e === '^' || e === '-' || e === '[') {
                    i += 2;
                    return e.charCodeAt(0);
                }
                if (e === 'u') {
                    const {cp, next} = readCodePointEscape(pattern, i, {allowBraces: false});
                    i = next;
                    return cp;
                }
                if (e === 'p' || e === 'P') { fail('\\p{...} is not in the pattern dialect; reference a class with {name}'); }
                if ('sSwWbBdD'.includes(e)) { fail(`\\${e} is not in the pattern dialect; write the characters as a class`); }
                fail(`\\${e} is not in the pattern dialect`);
            }
            const cp = /** @type {number} */ (pattern.codePointAt(i));
            if (cp > 0xFFFF) { fail('classes in a pattern may only contain code points up to U+FFFF', at); }
            if (isSurrogate(cp)) { fail('a lone surrogate is not a character', at); }
            if (c === '-') { fail('a - that is not between two characters must be written \\-'); }
            if (c === '^') { fail('a ^ that does not negate the class must be written \\^'); }
            ++i;
            return cp;
        };
        for (;;) {
            if (pattern[i] === '{') {
                const match = REFERENCE.exec(pattern.slice(i));
                if (match === null) { fail('a { inside a class starts a reference {name}; write a literal { as \\u007B'); }
                references.push({name: match[1], start: i, end: i + match[0].length, inClass: true});
                i += match[0].length;
                ++count;
                continue;
            }
            const itemStart = i;
            const first = readAtom();
            if (first === null) {
                ++i;
                break;
            }
            ++count;
            if (pattern[i] === '-') {
                if (pattern[i + 1] === ']' || pattern[i + 1] === undefined) { fail('a - that is not between two characters must be written \\-'); }
                if (pattern[i + 1] === '{') { fail('a range cannot end with a reference', i + 1); }
                ++i;
                const last = readAtom();
                if (last === null) { fail('a range needs a character at both ends', itemStart); }
                if (last < first) { fail('the range is out of order', itemStart); }
            }
        }
        if (count === 0) { fail('an empty class [] or [^] is not in the pattern dialect', start); }
    };

    const parseEscape = () => {
        const e = pattern[i + 1];
        if (e === undefined) { fail('the pattern ends with a lone backslash'); }
        if (e >= '1' && e <= '9') {
            if (pattern[i + 2] >= '0' && pattern[i + 2] <= '9') { fail('only back-references \\1 to \\9 are in the dialect'); }
            const group = Number(e);
            if (!closedGroups.has(group)) { fail(`the back-reference \\${e} must follow the end of group ${e}`); }
            // libc++ compiles a lookahead as a regex of its own, whose groups
            // it numbers from 1: \N there names another group, or none.
            if (lookaheads > 0) { fail('a back-reference inside a lookahead is not in the pattern dialect: std::regex in libc++ numbers the groups of a lookahead on their own'); }
            // The frames that hold the group but not this position have
            // closed; if one is optional the group may not take part, and
            // JavaScript matches the empty text where std::regex fails.
            const holding = groupFrames[group];
            let shared = 0;
            while (shared < frames.length && shared < holding.length && frames[shared] === holding[shared]) { ++shared; }
            if (holding.slice(shared).some((frame) => optionalFrame[frame])) {
                fail(`the back-reference \\${e} names group ${e}, which may not take part in the match (an optional group, another alternative or a negative lookahead)`);
            }
            i += 2;
            return;
        }
        if (e === 'u') {
            if (pattern[i + 2] === '{') { fail('\\u{...} is not in the pattern dialect'); }
            const digits = pattern.slice(i + 2, i + 6);
            if (!/^[0-9A-Fa-f]{4}$/.test(digits)) { fail('\\u needs four hexadecimal digits'); }
            i += 6;
            return;
        }
        if (e === 'p' || e === 'P') { fail('\\p{...} is not in the pattern dialect; reference a class with {name}'); }
        if ('sSwWbBdD'.includes(e)) { fail(`\\${e} is not in the pattern dialect; write the characters as a class`); }
        if (e === 'k') { fail('named back-references are not in the pattern dialect'); }
        if (PATTERN_SYNTAX.includes(e)) {
            i += 2;
            return;
        }
        fail(`\\${e} is not in the pattern dialect`);
    };

    /** @returns {boolean} whether the disjunction can match the empty text */
    const parseDisjunction = () => {
        let nullable = false;
        for (let index = 0; ; ++index) {
            const frame = nextFrame++;
            frames.push(frame);
            nullable = parseAlternative() || nullable;
            frames.pop();
            const more = pattern[i] === '|';
            optionalFrame[frame] = more || index > 0;
            if (!more) { return nullable; }
            ++i;
        }
    };

    /** @returns {boolean} whether the alternative can match the empty text */
    const parseAlternative = () => {
        let nullable = true;
        while (i < pattern.length && pattern[i] !== '|' && pattern[i] !== ')') {
            nullable = parseTerm() && nullable;
        }
        return nullable;
    };

    /** @returns {boolean} whether the term can match the empty text */
    const parseTerm = () => {
        const c = pattern[i];
        if (c === '^' || c === '$') {
            // libstdc++ runs a lookahead as a search of its own, whose start
            // `^` takes for the start of the text.
            if (c === '^' && lookaheads > 0) { fail('a ^ inside a lookahead is not in the pattern dialect: std::regex in libstdc++ reads it as the start of the lookahead'); }
            ++i;
            parseQuantifier(false);
            return true;
        }
        if (c === '(') {
            if (startsWith('(?=') || startsWith('(?!')) {
                const frame = nextFrame++;
                optionalFrame[frame] = startsWith('(?!');
                i += 3;
                frames.push(frame);
                ++lookaheads;
                parseDisjunction();
                --lookaheads;
                frames.pop();
                if (pattern[i] !== ')') { fail('the lookahead is not closed with )'); }
                ++i;
                parseQuantifier(false);
                return true;
            }
            if (startsWith('(?<=') || startsWith('(?<!')) { fail('lookbehind is not in the pattern dialect; use a stem constraint'); }
            if (startsWith('(?<')) { fail('named groups are not in the pattern dialect'); }
            if (startsWith('(?') && !startsWith('(?:')) { fail('only (?:...), (?=...) and (?!...) groups are in the pattern dialect'); }
            const capturing = !startsWith('(?:');
            // libstdc++ copies the captures of a lookahead into the match and
            // keeps them when the match then fails on that path; JavaScript
            // clears them.
            if (capturing && lookaheads > 0) { fail('a capturing group inside a lookahead is not in the pattern dialect: std::regex in libstdc++ keeps captures made inside a lookahead where JavaScript clears them; write (?:...)'); }
            i += capturing ? 1 : 3;
            const frame = nextFrame++;
            const group = capturing ? ++groups : 0;
            if (capturing) { groupFrames[group] = [...frames, frame]; }
            const before = groups;
            frames.push(frame);
            const nullable = parseDisjunction();
            frames.pop();
            if (pattern[i] !== ')') { fail('the group is not closed with )'); }
            ++i;
            if (capturing) {
                closedGroups.add(group);
                groupNullable[group] = nullable;
            }
            const at = i;
            const quantifier = parseQuantifier(true);
            optionalFrame[frame] = repeatsZero(quantifier);
            if (quantifier !== null && nullable) { fail('a quantifier may not repeat a group that can match the empty text', at); }
            if (quantifier !== null && groups > before) {
                fail('a capturing group may not be inside a repeated group: JavaScript clears its capture on every repetition, std::regex keeps it', at);
            }
            return nullable || repeatsZero(quantifier);
        }
        if (c === '[') {
            parseClassInPattern();
            return repeatsZero(parseQuantifier(true));
        }
        if (c === '.') {
            ++i;
            return repeatsZero(parseQuantifier(true));
        }
        if (c === '\\') {
            const group = pattern[i + 1] >= '1' && pattern[i + 1] <= '9' ? Number(pattern[i + 1]) : 0;
            parseEscape();
            const at = i;
            const quantifier = parseQuantifier(true);
            const nullable = group > 0 && groupNullable[group];
            if (quantifier !== null && nullable) { fail('a quantifier may not repeat a back-reference to a group that can match the empty text', at); }
            return nullable || repeatsZero(quantifier);
        }
        if (c === '{') {
            const match = REFERENCE.exec(pattern.slice(i));
            if (match !== null) {
                references.push({name: match[1], start: i, end: i + match[0].length, inClass: false});
                i += match[0].length;
                return repeatsZero(parseQuantifier(true));
            }
            if (quantifierAt(i) !== 0) { fail('nothing to repeat'); }
            fail('a { starts a reference {name} or a quantifier; write a literal { as \\{');
        }
        if (c === '*' || c === '+' || c === '?') { fail('nothing to repeat'); }
        if (c === ']' || c === '}') { fail(`a literal ${c} must be written \\${c}`); }
        const cp = /** @type {number} */ (pattern.codePointAt(i));
        if (isSurrogate(cp)) { fail('a lone surrogate is not a character'); }
        i += cp > 0xFFFF ? 2 : 1;
        // An astral literal is two UTF-16 units: a quantifier would repeat only the second.
        if (cp > 0xFFFF && quantifierAt(i) !== 0) { fail('a quantifier after a character above U+FFFF repeats only half of it; use (?:...)'); }
        return repeatsZero(parseQuantifier(true));
    };

    const nullable = parseDisjunction();
    if (i < pattern.length) {
        fail(pattern[i] === ')' ? 'unmatched )' : 'unexpected character');
    }
    if (global && nullable) {
        fail('a global pattern may not match the empty text: std::regex and JavaScript go on differently after an empty match', 0);
    }
    // JavaScript must accept the pattern too (references stand in as one letter).
    let probe = pattern;
    for (const {start, end, inClass} of [...references].reverse()) {
        probe = probe.slice(0, start) + (inClass ? 'a' : '[a]') + probe.slice(end);
    }
    try {
        new RegExp(probe, '');
    } catch (error) {
        fail(`JavaScript rejects the pattern: ${error.message}`, 0);
    }
    return {groups, references, nullable};
}

/**
 * Checks the replacement of a `pattern` step or rule: `$1`-`$9` (for groups
 * the pattern has) and `$&` are the only `$` sequences in the dialect.
 * @param {string} replacement
 * @param {number} groups
 */
export function checkReplacement(replacement, groups) {
    if (typeof replacement !== 'string') { throw new ClassError('a replacement must be a string'); }
    for (let i = 0; i < replacement.length; ++i) {
        if (replacement[i] !== '$') { continue; }
        const next = replacement[i + 1];
        if (next === '&') {
            ++i;
            continue;
        }
        if (next >= '1' && next <= '9') {
            if (replacement[i + 2] >= '0' && replacement[i + 2] <= '9') {
                throw new ClassError('only $1 to $9 are in the dialect; a digit may not follow them', {source: replacement, offset: i});
            }
            if (Number(next) > groups) {
                throw new ClassError(`$${next} names a group the pattern does not have (it has ${groups})`, {source: replacement, offset: i});
            }
            ++i;
            continue;
        }
        throw new ClassError('a $ in a replacement must start $1-$9 or $&', {source: replacement, offset: i});
    }
}
