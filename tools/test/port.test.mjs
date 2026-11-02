// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, describe, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {PROBE_STEMS, classifyRule, literalOf, portDescriptor} from '../port-yomitan-transforms.mjs';
import {copyrightLine, portTests, testRows} from '../port-yomitan-tests.mjs';
import {findTransformTest, loadTextProcessors, loadTransformDescriptor} from '../lib/yomitan.mjs';

const yomitan = fileURLToPath(new URL('./fixtures/yomitan/', import.meta.url));
const portTool = fileURLToPath(new URL('../port-yomitan-transforms.mjs', import.meta.url));
const testsTool = fileURLToPath(new URL('../port-yomitan-tests.mjs', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'hoshidicts-port-test-'));
after(() => rmSync(temp, {recursive: true, force: true}));

const suffix = (inflected, deinflected) => ({
    isInflected: new RegExp(`${inflected}$`),
    deinflect: (text) => text.slice(0, -inflected.length) + deinflected,
    conditionsIn: ['a'],
    conditionsOut: ['b'],
});

describe('classifyRule (section 8.1)', () => {
    test('literal suffixes, prefixes and whole words become pack rules', () => {
        assert.deepEqual(classifyRule(suffix('ies', 'y')), {type: 'suffix', inflected: 'ies', deinflected: 'y', conditionsIn: ['a'], conditionsOut: ['b']});
        assert.deepEqual(classifyRule(suffix('\'s', '')), {type: 'suffix', inflected: '\'s', deinflected: '', conditionsIn: ['a'], conditionsOut: ['b']});
        assert.deepEqual(classifyRule({isInflected: /^going to /, deinflect: (t) => t.slice(9), conditionsIn: [], conditionsOut: []}),
            {type: 'prefix', inflected: 'going to ', deinflected: '', conditionsIn: [], conditionsOut: []});
        assert.deepEqual(classifyRule({isInflected: /^لل/, deinflect: (t) => 'ل' + t.slice(2), conditionsIn: [], conditionsOut: []}),
            {type: 'prefix', inflected: 'لل', deinflected: 'ل', conditionsIn: [], conditionsOut: []});
        assert.deepEqual(classifyRule({isInflected: /^went$/, deinflect: () => 'go', conditionsIn: [], conditionsOut: ['v']}),
            {type: 'wholeWord', inflected: 'went', deinflected: 'go', conditionsIn: [], conditionsOut: ['v']});
        assert.deepEqual(classifyRule({isInflected: /a\/b$/, deinflect: (t) => t.slice(0, -3), conditionsIn: [], conditionsOut: []}),
            {type: 'suffix', inflected: 'a/b', deinflected: '', conditionsIn: [], conditionsOut: []});
    });

    test('dots and .{n} before a suffix become stemMinLength', () => {
        const rule = (source, n) => ({isInflected: new RegExp(source), deinflect: (t) => t.slice(0, -n) + 'o', conditionsIn: [], conditionsOut: []});
        assert.equal(classifyRule(rule('..ами$', 3)).stemMinLength, 2);
        assert.equal(classifyRule(rule('.ам$', 2)).stemMinLength, 1);
        assert.equal(classifyRule(rule('.{3}est$', 3)).stemMinLength, 3);
        assert.equal(classifyRule(rule('.{3}est$', 3)).inflected, 'est');
        assert.equal(classifyRule(rule('ами$', 3)).stemMinLength, undefined);
    });

    test('the type and deinflected fields are never read', () => {
        const misleading = {...suffix('ing', ''), type: 'prefix', deinflected: 'zzz'};
        assert.deepEqual(classifyRule(misleading), {type: 'suffix', inflected: 'ing', deinflected: '', conditionsIn: ['a'], conditionsOut: ['b']});
        // Yiddish-like: a literal source whose function changes the stem.
        const umlaut = {type: 'suffix', deinflected: '', isInflected: /er$/, deinflect: (t) => t.slice(0, -2).replace(/a(?!.*a)/, 'ä'), conditionsIn: [], conditionsOut: []};
        assert.equal(classifyRule(umlaut).type, 'todo');
        const empty = {isInflected: /er$/, deinflect: () => '', conditionsIn: [], conditionsOut: []};
        assert.equal(classifyRule(empty).type, 'todo');
    });

    test('lastIndex is reset for rules with the g flag', () => {
        const regExp = /ed$/g;
        const rule = {isInflected: regExp, deinflect: (t) => (regExp.test(t) ? t.slice(0, -2) : 'broken'), conditionsIn: [], conditionsOut: []};
        regExp.lastIndex = 5;
        assert.deepEqual(classifyRule(rule), {type: 'suffix', inflected: 'ed', deinflected: '', conditionsIn: [], conditionsOut: []});
    });

    test('everything else becomes todo with its source and conditions', () => {
        const cases = [
            /^\w*ed (?:up|on)/,
            /(?<!n)na$/,
            /^ge[a-z]+t$/,
            /ER$/i,
            /$/,
            /^/,
            /^$/,
            /e.d$/,
            /(?:ab)$/,
            /x$/m,
        ];
        for (const isInflected of cases) {
            const result = classifyRule({isInflected, deinflect: (t) => t, conditionsIn: ['v'], conditionsOut: ['n']});
            assert.deepEqual(result, {type: 'todo', isInflected: isInflected.source, conditionsIn: ['v'], conditionsOut: ['n']}, String(isInflected));
        }
        assert.equal(classifyRule({isInflected: /x$/, deinflect: () => { throw new Error('no'); }, conditionsIn: [], conditionsOut: []}).type, 'todo');
        // A whole word whose function depends on the text is not constant.
        assert.equal(classifyRule({isInflected: /^ab$/, deinflect: (t) => t + 'x', conditionsIn: [], conditionsOut: []}).type, 'todo');
    });

    test('probe stems cover the scripts of section 8.1', () => {
        const scripts = [/\p{sc=Latin}/u, /\p{sc=Cyrillic}/u, /\p{sc=Greek}/u, /\p{sc=Arabic}/u, /\p{sc=Hebrew}/u, /\p{sc=Hangul}/u, /\p{sc=Hiragana}|\p{sc=Katakana}/u, /\p{M}/u];
        for (const script of scripts) { assert.ok(PROBE_STEMS.some((s) => script.test(s)), String(script)); }
        assert.ok(PROBE_STEMS.includes(''));
    });

    test('literalOf', () => {
        assert.equal(literalOf('abc'), 'abc');
        assert.equal(literalOf('a\\/b'), 'a/b');
        assert.equal(literalOf('a.b'), null);
        assert.equal(literalOf('a\\.b'), null);
        assert.equal(literalOf('(a)'), null);
    });
});

describe('port-yomitan-transforms', () => {
    test('ports the fixture language: conditions, ids, i18n, order and shapes', async () => {
        const {descriptor} = await loadTransformDescriptor(yomitan, 'xx');
        const {transforms, counts, todos} = portDescriptor(descriptor);
        assert.deepEqual(counts, {suffix: 7, todo: 6, prefix: 1, wholeWord: 1});
        assert.deepEqual(transforms.transforms.map((t) => t.id), ['plural', 'past', 'comparative', 'un-', 'irregular', 'ge-t', 'not-n', 'umlaut', 'empty', 'shout']);
        assert.deepEqual(transforms.conditions.ns, {name: 'Noun singular', isDictionaryForm: true, i18n: [{language: 'xx', name: 'Singular'}]});
        assert.deepEqual(transforms.conditions.v, {name: 'Verb', isDictionaryForm: true, subConditions: ['v_phr']});
        assert.deepEqual(transforms.transforms[0], {
            id: 'plural',
            name: 'plural',
            description: 'Plural form of a noun',
            i18n: [{language: 'xx', name: 'pl.'}],
            source: 'yomitan',
            rules: [
                {type: 'suffix', inflected: 's', deinflected: '', conditionsIn: ['np'], conditionsOut: ['ns']},
                {type: 'suffix', inflected: 'ies', deinflected: 'y', conditionsIn: ['np'], conditionsOut: ['ns']},
            ],
        });
        assert.deepEqual(todos.map((t) => t.source), ['^\\w*ed (?:up|on|off)', '^ge[a-z]+t$', '(?<!n)na$', 'er$', '$', 'ER$']);
        assert.deepEqual(transforms.transforms[1].rules[2], {type: 'suffix', inflected: 'd', deinflected: '', conditionsIn: ['v'], conditionsOut: ['v']});
    });

    test('the command writes sources/yomitan.json and keeps an existing file', () => {
        const languages = join(temp, 'languages');
        let result = spawnSync(process.execPath, [portTool, yomitan, 'xx', '--languages', languages], {encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /10 transforms, 15 rules \(7 suffix, 6 todo, 1 prefix, 1 wholeWord\)/);
        assert.match(result.stdout, /6 todo rules to map by hand/);
        const file = join(languages, 'xx', 'sources', 'yomitan.json');
        const text = readFileSync(file, 'utf8');
        assert.match(text, /\n {8}\{"type": "suffix", "inflected": "s", "deinflected": "", "conditionsIn": \["np"\], "conditionsOut": \["ns"\]\},\n/);
        assert.equal(JSON.parse(text).schema, 1);
        writeFileSync(file, '{"mapped": true}\n');
        result = spawnSync(process.execPath, [portTool, yomitan, 'xx', '--languages', languages], {encoding: 'utf8'});
        assert.equal(result.status, 1);
        assert.match(result.stderr, /exists and may hold hand-mapped rules/);
        assert.equal(readFileSync(file, 'utf8'), '{"mapped": true}\n');
        result = spawnSync(process.execPath, [portTool, yomitan, 'xx', '--languages', languages, '--force'], {encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        assert.equal(readFileSync(file, 'utf8'), text);
        result = spawnSync(process.execPath, [portTool, yomitan, 'zz', '--out', join(temp, 'zz.json')], {encoding: 'utf8'});
        assert.equal(result.status, 1);
        assert.match(result.stderr, /no ext\/js\/language\/zz/);
        assert.ok(!existsSync(join(temp, 'zz.json')));
        assert.equal(spawnSync(process.execPath, [portTool, yomitan], {encoding: 'utf8'}).status, 2);
    });
});

describe('port-yomitan-tests', () => {
    test('converts the test file to the corpus format', async () => {
        assert.equal(findTransformTest(yomitan, 'xx'), 'test/language/xx-transforms.test.js');
        assert.equal(findTransformTest(yomitan, 'kx'), null);
        const {text, rows} = await portTests(yomitan, 'xx');
        assert.equal(rows, 8);
        const lines = text.split('\n');
        assert.equal(lines[0], '# GPL-3.0-or-later; Copyright (C) 2024-2026 Test Authors; 2020-2022 Older Test Authors');
        assert.match(lines[1], /^# https:\/\/github\.com\/yomidevs\/yomitan\/blob\/[0-9a-f]{40}\/test\/language\/xx-transforms\.test\.js$/);
        assert.equal(lines[2], '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)');
        assert.deepEqual(lines.slice(3, -1), [
            'nouns\t1\tcats\tcat\tns\tplural',
            'nouns\t1\tcities\tcity\tns\tplural',
            'verbs\t1\twalked\twalk\tv\tpast',
            'verbs\t1\twent\tgo\tv\tirregular',
            'verbs\t1\tlooked up\tlook up\tv_phr\tpast',
            'verbs\t1\tgemacht\tmachen\tv\tge-t',
            'verbs\t1\tundo\tdo\t*\t*',
            'invalid\t0\tbus\tb\tns\tplural',
        ]);
        assert.equal(lines.at(-1), '');
    });

    test('rows: null rule and reasons are *, no reasons is empty, tabs are refused', () => {
        assert.deepEqual(testRows([{category: 'c', valid: true, tests: [{source: 'a', term: 'b', rule: null, reasons: []}, {source: 'x', term: 'y', reasons: ['p', 'q']}]}]), ['c\t1\ta\tb\t*\t', 'c\t1\tx\ty\t*\tp|q']);
        assert.throws(() => testRows([{category: 'c', valid: true, tests: [{source: 'a\tb', term: 'b', rule: null, reasons: null}]}]), /tab or a line break/);
        assert.equal(copyrightLine('/*\n * Copyright (C) 2023-2026  Yomitan Authors\n */'), 'Copyright (C) 2023-2026 Yomitan Authors');
    });

    test('the command writes tests/yomitan.tsv', () => {
        const out = join(temp, 'yomitan.tsv');
        const result = spawnSync(process.execPath, [testsTool, yomitan, 'xx', '--out', out], {encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Wrote 8 Yomitan cases/);
        assert.equal(readFileSync(out, 'utf8').split('\n').length, 12);
        const missing = spawnSync(process.execPath, [testsTool, yomitan, 'kx', '--out', out], {encoding: 'utf8'});
        assert.notEqual(missing.status, 0);
    });
});

describe('Yomitan loader', () => {
    test('stubs a missing ext/lib bundle and names it when used', async () => {
        const processors = await loadTextProcessors(yomitan, 'kx');
        assert.deepEqual(processors.preprocessors.map((p) => p.id), ['disassemble']);
        assert.throws(() => processors.preprocessors[0].process('가'), /ext\/lib\/hangul-js\.js is not built/);
        const xx = await loadTextProcessors(yomitan, 'xx');
        assert.deepEqual(xx.preprocessors.map((p) => p.id), ['decapitalize', 'capitalizeFirstLetter', 'removeMarks', 'firstA', 'onlyYomitan']);
        assert.deepEqual(xx.preprocessors[0].process('Ab'), ['Ab', 'ab']);
        assert.equal(await loadTextProcessors(yomitan, 'zz'), null);
    });
});
