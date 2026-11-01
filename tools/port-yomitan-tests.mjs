#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Converts Yomitan's transform tests for one language into the corpus format
// of docs/languages.md, section 12.2 (transform ids as reasons, in Yomitan's
// forward order), as tests/generate_deinflection_fixture.mjs does for
// Japanese:
//
//   node tools/port-yomitan-tests.mjs <yomitan checkout> <code> [--out <file>]
//
// It runs test/language/<name>-transforms.test.js with Yomitan's test runner
// replaced, so it reads exactly the cases the test passes to
// testLanguageTransformer, and writes languages/<code>/tests/yomitan.tsv.

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {isMain} from './lib/cli.mjs';
import {DEFAULT_LANGUAGES_DIR} from './lib/pack.mjs';
import {PINNED_REVISION, findTransformTest, loadTransformTests, yomitanRevision} from './lib/yomitan.mjs';

export const TSV_COLUMNS = '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)';

/**
 * The copyright holders a source file's header names, as one line:
 * `Copyright (C) 2023-2026 Yomitan Authors; 2020-2022 Yomichan Authors`.
 * @param {string} text
 * @returns {string | null}
 */
export function copyrightLine(text) {
    const header = text.slice(0, text.indexOf('*/') + 2);
    const holders = [...header.matchAll(/Copyright \(C\)\s+(.+?)\s*$/gm)].map((m) => m[1].replace(/\s+/g, ' '));
    return holders.length === 0 ? null : `Copyright (C) ${holders.join('; ')}`;
}

function checkCell(value, what, category) {
    if (typeof value !== 'string') { throw new Error(`${category}: ${what} is not a string: ${JSON.stringify(value)}`); }
    if (/[\t\n\r]/.test(value)) { throw new Error(`${category}: ${what} ${JSON.stringify(value)} contains a tab or a line break`); }
    return value;
}

/**
 * Rows of the corpus format from Yomitan's test categories.
 * @param {{category: string, valid: boolean, tests: {source: string, term: string, rule?: string | null, reasons?: string[] | null}[]}[]} categories
 * @returns {string[]}
 */
export function testRows(categories) {
    return categories.flatMap(({category, valid, tests}) => tests.map(({source, term, rule, reasons}) => {
        const reasonsCell = reasons === null || reasons === undefined ? '*' : reasons.map((r) => checkCell(r, 'a reason', category)).join('|');
        const ruleCell = rule === null || rule === undefined ? '*' : checkCell(rule, 'rule', category);
        return [checkCell(category, 'category', category), valid ? '1' : '0', checkCell(source, 'source', category), checkCell(term, 'term', category), ruleCell, reasonsCell].join('\t');
    }));
}

/**
 * The text of tests/yomitan.tsv for a language.
 * @param {string} root
 * @param {string} code
 * @returns {Promise<{text: string, rows: number, testFile: string, revision: string | null}>}
 */
export async function portTests(root, code) {
    const testFile = findTransformTest(root, code);
    if (testFile === null) { throw new Error(`Yomitan has no transform test for ${code} in test/language/`); }
    const revision = yomitanRevision(root);
    const categories = await loadTransformTests(root, testFile);
    const rows = testRows(categories);
    const source = readFileSync(join(root, testFile), 'utf8');
    const copyright = copyrightLine(source) ?? 'Copyright (C) Yomitan Authors';
    const header = [
        `# GPL-3.0-or-later; ${copyright}`,
        `# https://github.com/yomidevs/yomitan/blob/${revision ?? PINNED_REVISION}/${testFile}`,
    ];
    if (/testLanguageTransformer\([^)]*,[^)]*,[^)]*\)/.test(source)) {
        header.push('# Yomitan\'s test passes source and term through a preprocess function; the pack\'s processors take its place.');
    }
    header.push(TSV_COLUMNS);
    return {text: [...header, ...rows].join('\n') + '\n', rows: rows.length, testFile, revision};
}

function usage() {
    console.error('usage: node tools/port-yomitan-tests.mjs <yomitan checkout> <code> [--out <file>] [--languages <dir>]');
    return 2;
}

async function main(argv) {
    const positional = [];
    let out = null;
    let languagesDir = DEFAULT_LANGUAGES_DIR;
    for (let i = 0; i < argv.length; ++i) {
        const arg = argv[i];
        if (arg === '--out') {
            out = argv[++i];
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
    const {text, rows, testFile, revision} = await portTests(root, code);
    if (revision !== PINNED_REVISION) {
        console.warn(`warning: ${root} is at ${revision ?? 'an unknown revision'}, not the pinned ${PINNED_REVISION}`);
    }
    const file = resolve(out ?? join(languagesDir, code, 'tests', 'yomitan.tsv'));
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, text);
    console.log(`Wrote ${rows} Yomitan cases from ${testFile} to ${file}`);
    return 0;
}

if (isMain(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
