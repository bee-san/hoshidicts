// SPDX-License-Identifier: GPL-3.0-or-later
// JSON as pack files write it (docs/languages.md, section 3): two-space
// indentation, short arrays of scalars on one line, and chosen elements (each
// rule of a `rules` array, each range pair) on one line each.

/**
 * One value on one line: `{"a": 1, "b": [2, 3]}`.
 * @param {unknown} value
 * @returns {string}
 */
export function inlineJson(value) {
    if (Array.isArray(value)) { return `[${value.map(inlineJson).join(', ')}]`; }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value).filter(([, v]) => v !== undefined);
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inlineJson(v)}`).join(', ')}}`;
    }
    return JSON.stringify(value);
}

function isScalar(value) {
    return value === null || typeof value !== 'object';
}

/**
 * Formats a value. `inline(path, value)` may return true to put an array or
 * object on one line; arrays whose elements are all scalars, and empty arrays
 * and objects, are always on one line.
 * @param {unknown} value
 * @param {{inline?: (path: (string | number)[], value: unknown) => boolean}} [options]
 * @returns {string} the text, ending with a newline
 */
export function formatJson(value, {inline = () => false} = {}) {
    const write = (v, path, indent) => {
        if (isScalar(v)) { return JSON.stringify(v); }
        if (Array.isArray(v)) {
            if (v.length === 0 || v.every(isScalar) || inline(path, v)) { return inlineJson(v); }
            const inner = indent + '  ';
            return `[\n${v.map((e, i) => inner + write(e, [...path, i], inner)).join(',\n')}\n${indent}]`;
        }
        const entries = Object.entries(v).filter(([, e]) => e !== undefined);
        if (entries.length === 0 || inline(path, v)) { return inlineJson(v); }
        const inner = indent + '  ';
        return `{\n${entries.map(([k, e]) => `${inner}${JSON.stringify(k)}: ${write(e, [...path, k], inner)}`).join(',\n')}\n${indent}}`;
    };
    return write(value, [], '') + '\n';
}

/**
 * The formatting of transforms.json and sources/*.json: each rule on one line.
 * @param {unknown} value
 * @returns {string}
 */
export function formatTransforms(value) {
    return formatJson(value, {inline: (path) => path.length >= 2 && path[path.length - 2] === 'rules'});
}

/**
 * Parses JSON from a pack file, naming the file in errors.
 * @param {string} text
 * @param {string} file
 * @returns {any}
 */
export function parseJson(text, file) {
    if (text.charCodeAt(0) === 0xFEFF) { throw new Error(`${file}: pack files are UTF-8 without a byte-order mark`); }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`${file}: ${error.message}`);
    }
}
