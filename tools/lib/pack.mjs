// SPDX-License-Identifier: GPL-3.0-or-later
// Reading language packs (docs/languages.md, sections 3 and 12.2) for the
// Node tools.

import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ClassSet} from './classes.mjs';
import {parseJson} from './json.mjs';

/** The repository root (the directory above tools/). */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** The packs of this checkout. */
export const DEFAULT_LANGUAGES_DIR = join(REPO_ROOT, 'languages');

/** The deinflection TSVs of a pack's tests/ directory (section 12.2). */
export const DEINFLECTION_TSVS = ['yomitan.tsv', 'corpus.tsv', 'cases.tsv', 'gaps.tsv'];

/**
 * Pack codes in a languages directory: subdirectories with a language.json
 * whose name does not start with `_`, sorted.
 * @param {string} languagesDir
 * @returns {string[]}
 */
export function listPacks(languagesDir = DEFAULT_LANGUAGES_DIR) {
    return readdirSync(languagesDir)
        .filter((name) => !name.startsWith('_') && statSync(join(languagesDir, name)).isDirectory() && existsSync(join(languagesDir, name, 'language.json')))
        .sort();
}

/**
 * @param {string} file
 * @returns {any}
 */
export function readJson(file) {
    return parseJson(readFileSync(file, 'utf8'), file);
}

/**
 * Loads a pack's language.json and transforms (if it names any).
 * @param {string} code
 * @param {{languagesDir?: string, transformsFile?: string}} [options] transformsFile overrides lookup.transforms
 */
export function loadPack(code, {languagesDir = DEFAULT_LANGUAGES_DIR, transformsFile} = {}) {
    const dir = resolve(languagesDir, code);
    const languageFile = join(dir, 'language.json');
    if (!existsSync(languageFile)) { throw new Error(`no pack ${code}: ${languageFile} does not exist`); }
    const language = readJson(languageFile);
    if (language.code !== code) { throw new Error(`${languageFile}: code is ${JSON.stringify(language.code)}, not the directory name ${code}`); }
    let transforms = null;
    let transformsPath = null;
    const named = transformsFile ?? (typeof language.lookup?.transforms === 'string' ? join(dir, language.lookup.transforms) : null);
    if (named !== null) {
        transformsPath = resolve(named);
        transforms = readJson(transformsPath);
    }
    let classes;
    try {
        classes = new ClassSet(language.classes ?? {});
    } catch (error) {
        throw new Error(`${languageFile}: ${error.message}`);
    }
    return {code, dir, languageFile, language, transforms, transformsPath, classes};
}

/**
 * Reads a TSV of section 12.2: `#` lines are comments, every other line a row.
 * @param {string} file
 * @param {number} columns
 * @returns {{comments: string[], rows: {line: number, cells: string[]}[]}}
 */
export function readTsv(file, columns) {
    const text = readFileSync(file, 'utf8');
    if (text.charCodeAt(0) === 0xFEFF) { throw new Error(`${file}: pack files are UTF-8 without a byte-order mark`); }
    const comments = [];
    const rows = [];
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') { lines.pop(); }
    lines.forEach((line, index) => {
        if (line.endsWith('\r')) { throw new Error(`${file}:${index + 1}: lines end with LF, not CRLF`); }
        if (line.startsWith('#')) {
            comments.push(line);
            return;
        }
        if (line === '') { return; }
        const cells = line.split('\t');
        if (cells.length !== columns) { throw new Error(`${file}:${index + 1}: ${cells.length} columns, expected ${columns}`); }
        rows.push({line: index + 1, cells});
    });
    return {comments, rows};
}

/**
 * Reads a deinflection TSV (yomitan.tsv, corpus.tsv, cases.tsv, gaps.tsv).
 * `rule` and `reasons` are null for `*`; reasons is [] for no transform.
 * @param {string} file
 */
export function readDeinflectionTsv(file) {
    const {comments, rows} = readTsv(file, 6);
    return {
        comments,
        rows: rows.map(({line, cells: [category, valid, source, term, rule, reasons]}) => {
            if (valid !== '0' && valid !== '1') { throw new Error(`${file}:${line}: valid is 0 or 1`); }
            return {
                line,
                category,
                valid: valid === '1',
                source,
                term,
                rule: rule === '*' ? null : rule,
                reasons: reasons === '*' ? null : reasons === '' ? [] : reasons.split('|'),
            };
        }),
    };
}

/**
 * Reads tests/text.tsv: category, valid, input, variant.
 * @param {string} file
 */
export function readTextTsv(file) {
    return readTsv(file, 4).rows.map(({line, cells: [category, valid, input, variant]}) => ({line, category, valid: valid === '1', input, variant}));
}

/**
 * Reads tests/lookup.tsv: category, valid, text, expression, matched.
 * @param {string} file
 */
export function readLookupTsv(file) {
    return readTsv(file, 5).rows.map(({line, cells: [category, valid, text, expression, matched]}) => ({line, category, valid: valid === '1', text, expression, matched}));
}

/**
 * The texts of a descriptor's host.sample block, in a fixed order.
 * @param {any} language
 * @returns {string[]}
 */
export function sampleTexts(language) {
    const sample = language?.host?.sample ?? {};
    const texts = [
        sample.warmup,
        sample.practice?.text,
        sample.practice?.lookup,
        sample.entry?.expression,
        sample.entry?.reading,
        sample.entry?.matched,
    ];
    if (sample.character !== null && typeof sample.character === 'object') {
        for (const value of Object.values(sample.character)) {
            if (typeof value === 'string') { texts.push(value); }
        }
    }
    return texts.filter((t) => typeof t === 'string' && t !== '');
}

/**
 * The pack's corpus strings: the sources of every deinflection TSV, the inputs
 * of text.tsv, the texts of lookup.tsv and the host.sample texts, without
 * repeats, in that order.
 * @param {{dir: string, language: any}} pack
 * @returns {string[]}
 */
export function corpusStrings(pack) {
    const seen = new Set();
    const out = [];
    const add = (t) => {
        if (typeof t === 'string' && t !== '' && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    };
    for (const name of DEINFLECTION_TSVS) {
        const file = join(pack.dir, 'tests', name);
        if (existsSync(file)) {
            for (const row of readDeinflectionTsv(file).rows) { add(row.source); }
        }
    }
    const textFile = join(pack.dir, 'tests', 'text.tsv');
    if (existsSync(textFile)) {
        for (const row of readTextTsv(textFile)) { add(row.input); }
    }
    const lookupFile = join(pack.dir, 'tests', 'lookup.tsv');
    if (existsSync(lookupFile)) {
        for (const row of readLookupTsv(lookupFile)) { add(row.text); }
    }
    for (const t of sampleTexts(pack.language)) { add(t); }
    return out;
}
