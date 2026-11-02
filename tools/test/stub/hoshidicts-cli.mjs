#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// A stand-in for the engine's hoshidicts-cli (docs/languages.md, section
// 10.3) that the tool tests run while the C++ CLI is not built. It prints the
// contract's one-JSON-object-per-line format from the JavaScript model in
// model.mjs:
//
//   stub-cli [--languages <dir>] deinflect <code> (<text> | --stdin) [--transforms <file>] [--options <id,...> | --all-options]
//   stub-cli [--languages <dir>] preprocess <code> (<text> | --stdin) [--options <id,...> | --all-options]
//   stub-cli [--languages <dir>] eval-language <code> <file.tsv> [--transforms <file>]
//
// eval-language here reports only `recall` and `negativesPassed`, without a
// dictionary. Set HOSHIDICTS_STUB_BREAK=<text> to make deinflect drop the
// last result for that input (the tests use it to see a difference caught).

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {DEFAULT_LANGUAGES_DIR, loadPack, readDeinflectionTsv} from '../../lib/pack.mjs';
import {processText} from '../../lib/steps.mjs';
import {ModelDeinflector} from './model.mjs';

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

function parse(argv) {
    const options = {languagesDir: DEFAULT_LANGUAGES_DIR, transforms: undefined, stdin: false, positional: [], enabled: [], allOptions: false};
    for (let i = 0; i < argv.length; ++i) {
        const arg = argv[i];
        if (arg === '--languages') {
            options.languagesDir = argv[++i];
        } else if (arg === '--transforms') {
            options.transforms = argv[++i];
        } else if (arg === '--options') {
            options.enabled = (argv[++i] ?? '').split(',').filter((id) => id !== '');
        } else if (arg === '--all-options') {
            options.allOptions = true;
        } else if (arg === '--stdin') {
            options.stdin = true;
        } else {
            options.positional.push(arg);
        }
    }
    return options;
}

function inputs(options, rest) {
    if (options.stdin) {
        const text = readFileSync(0, 'utf8');
        const lines = text.split('\n');
        if (lines[lines.length - 1] === '') { lines.pop(); }
        return lines;
    }
    if (rest.length !== 1) { fail('expected one text or --stdin'); }
    return rest;
}

function deinflector(pack, enabled = []) {
    if (pack.transforms === null) { return null; }
    return new ModelDeinflector(pack.transforms, pack.classes, {wordCharacters: pack.language.text?.wordCharacters ?? null, enabled});
}

// The optional transforms or preprocessors --options names, or every one with --all-options.
function enabledIds(options, ids) {
    return options.allOptions ? ids : options.enabled;
}

function main() {
    const options = parse(process.argv.slice(2));
    const [command, code, ...rest] = options.positional;
    if (command === undefined || code === undefined) { fail('usage: stub-cli [--languages <dir>] deinflect|preprocess|eval-language <code> ...'); }
    let pack;
    try {
        pack = loadPack(code, {languagesDir: options.languagesDir, transformsFile: options.transforms === undefined ? undefined : resolve(options.transforms)});
    } catch (error) {
        fail(error.message);
    }
    const out = [];
    if (command === 'deinflect') {
        const model = deinflector(pack, enabledIds(options, (pack.transforms?.transforms ?? []).map((t) => t.id)));
        const broken = process.env.HOSHIDICTS_STUB_BREAK;
        for (const input of inputs(options, rest)) {
            const results = model === null ? [{text: input, conditions: 0, trace: []}] : model.deinflect(input);
            if (broken === input) { results.pop(); }
            out.push(JSON.stringify({input, results: results.map((r) => ({text: r.text, conditions: model === null ? [] : model.conditionNames(r.conditions), trace: r.trace}))}));
        }
    } else if (command === 'preprocess') {
        for (const input of inputs(options, rest)) {
            const preprocessors = pack.language.lookup?.preprocessors ?? [];
            const variants = processText(preprocessors, input, pack.classes, {enabled: enabledIds(options, preprocessors.map((p) => p.id))});
            out.push(JSON.stringify({input, variants}));
        }
    } else if (command === 'eval-language') {
        if (rest.length !== 1) { fail('eval-language needs a corpus file'); }
        // Every optional processor and transform, as the engine's eval-language.
        const model = deinflector(pack, (pack.transforms?.transforms ?? []).map((t) => t.id));
        const {rows} = readDeinflectionTsv(rest[0]);
        let positives = 0;
        let found = 0;
        let negatives = 0;
        let passed = 0;
        for (const row of rows) {
            const wanted = row.rule === null ? 0 : model.conditionsOf(row.rule);
            let has = false;
            const preprocessors = pack.language.lookup?.preprocessors ?? [];
            for (const {text} of processText(preprocessors, row.source, pack.classes, {enabled: preprocessors.map((p) => p.id)})) {
                for (const result of model.deinflect(text)) {
                    if (result.text !== row.term) { continue; }
                    if (row.rule !== null && result.conditions !== 0 && (result.conditions & wanted) === 0) { continue; }
                    if (row.reasons !== null && result.trace.join('|') !== row.reasons.join('|')) { continue; }
                    has = true;
                }
            }
            if (row.valid) {
                ++positives;
                if (has) { ++found; }
            } else {
                ++negatives;
                if (!has) { ++passed; }
            }
        }
        out.push(JSON.stringify({rows: rows.length, recall: positives === 0 ? null : found / positives, negativesPassed: negatives === 0 ? null : passed / negatives}));
    } else {
        fail(`unknown command ${command}`);
    }
    process.stdout.write(out.length === 0 ? '' : `${out.join('\n')}\n`);
}

main();
