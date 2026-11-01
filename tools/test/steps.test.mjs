// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {ClassSet} from '../lib/classes.mjs';
import {formatJson, formatTransforms, inlineJson, parseJson} from '../lib/json.mjs';
import {UnsupportedStepError, applyStep, applyVariant, checkStep, compareCodePoints, processText, stepKind} from '../lib/steps.mjs';

const classes = new ClassSet({
    marks: '[\\u0300-\\u036F]',
    harakat: '[\\u0618-\\u061A\\u064B-\\u0656\\u0670]',
    squares: '[\\u3300-\\u33FF]',
    letter: '[A-Za-z]',
});

describe('steps', () => {
    test('case follows JavaScript, with full case mappings', () => {
        assert.equal(applyStep({case: 'lower'}, 'ΟΔΟΣ', classes), 'οδος');
        assert.equal(applyStep({case: 'lower'}, 'İ', classes), 'i\u0307');
        assert.equal(applyStep({case: 'upper'}, 'straße', classes), 'STRASSE');
        assert.equal(applyStep({case: 'upperFirst'}, 'ßa', classes), 'SSa');
        assert.equal(applyStep({case: 'upperFirst'}, '\u{10428}x', classes), '\u{10400}x');
        assert.equal(applyStep({case: 'lowerFirst'}, 'WALK', classes), 'wALK');
        assert.equal(applyStep({case: 'upperFirst'}, '', classes), '');
    });

    test('normalize, whole or within a class', () => {
        assert.equal(applyStep({normalize: 'NFD'}, 'é', classes), 'e\u0301');
        assert.equal(applyStep({normalize: 'NFKC'}, 'ﻴ', classes), 'ي');
        assert.equal(applyStep({normalize: 'NFKD', within: '{squares}'}, '㌀ﾀ', classes), '\u30A2\u30CF\u309A\u30FC\u30C8ﾀ');
    });

    test('strip removes every member of the class', () => {
        assert.equal(applyStep({strip: '{harakat}'}, 'وَلَدَ', classes), 'ولد');
        assert.equal(applyStep({strip: '[\\u0640]'}, 'لـكن', classes), 'لكن');
    });

    test('map: longest key first, left to right, at all, first, last, start, end', () => {
        const map = {a: '1', aa: '2', b: '3'};
        assert.equal(applyStep({map}, 'aaab', classes), '213');
        assert.equal(applyStep({map, at: 'all'}, 'xaaax', classes), 'x21x');
        assert.equal(applyStep({map, at: 'first'}, 'xbaab', classes), 'x3aab');
        assert.equal(applyStep({map, at: 'last'}, 'baab', classes), 'baa3');
        assert.equal(applyStep({map, at: 'last'}, 'aaa', classes), 'aa1');
        assert.equal(applyStep({map, at: 'start'}, 'aab', classes), '2b');
        assert.equal(applyStep({map, at: 'start'}, 'bab', classes), '3ab');
        assert.equal(applyStep({map, at: 'start'}, 'xab', classes), 'xab');
        assert.equal(applyStep({map, at: 'end'}, 'baa', classes), 'b2');
        assert.equal(applyStep({map: {'\u0627': '\u0623'}, at: 'first'}, 'كاتبا', classes), 'كأتبا');
        assert.equal(applyStep({map: {'\u0649': '\u064A'}, at: 'end'}, 'فى', classes), 'في');
        assert.equal(applyStep({map: {'\u0649': '\u064A'}, at: 'end'}, 'ىف', classes), 'ىف');
    });

    test('pattern: global, repeat, class references', () => {
        assert.equal(applyStep({pattern: '(l|dell|all)[\'\u2019]', replace: '', global: true}, 'l’uomo dell’arte', classes), 'uomo arte');
        assert.equal(applyStep({pattern: 'a', replace: 'b'}, 'aaa', classes), 'baa');
        assert.equal(applyStep({pattern: 'a', replace: 'b', global: true}, 'aaa', classes), 'bbb');
        // Greek removeDoubleAcuteAccents (section 6.2): keep only the first acute accent.
        const greek = [{normalize: 'NFD'}, {pattern: '(\u0301[^\u0301]*)\u0301', replace: '$1', repeat: true}, {normalize: 'NFC'}];
        assert.equal(applyVariant(greek, 'άέή', classes)[0], 'άεη');
        assert.equal(applyStep({pattern: '{letter}+', replace: '<$&>'}, '12ab3', classes), '12<ab>3');
        // repeat stops after 16 applications.
        assert.equal(applyStep({pattern: '^a', replace: '', repeat: true}, 'a'.repeat(20), classes), 'aaaa');
    });

    test('alternatives: key first, first match varying slowest, limit', () => {
        const step = {alternatives: {dj: ['\u0111'], c: ['\u010D', '\u0107']}};
        assert.deepEqual(applyStep(step, 'cdjc', classes), [
            'cdjc', 'cdj\u010D', 'cdj\u0107', 'c\u0111c', 'c\u0111\u010D', 'c\u0111\u0107',
            '\u010Ddjc', '\u010Ddj\u010D', '\u010Ddj\u0107', '\u010D\u0111c', '\u010D\u0111\u010D', '\u010D\u0111\u0107',
            '\u0107djc', '\u0107dj\u010D', '\u0107dj\u0107', '\u0107\u0111c', '\u0107\u0111\u010D', '\u0107\u0111\u0107',
        ]);
        assert.deepEqual(applyStep({...step, limit: 4}, 'cdjc', classes), ['cdjc', 'cdj\u010D', 'cdj\u0107', 'c\u0111c']);
        assert.deepEqual(applyStep(step, 'xyz', classes), ['xyz']);
    });

    test('builtins are not run by the JavaScript tools', () => {
        assert.throws(() => applyStep({builtin: 'ja.nfkc'}, 'x', classes), UnsupportedStepError);
    });

    test('checkStep validates shapes', () => {
        assert.equal(stepKind({strip: '[a]'}), 'strip');
        assert.throws(() => stepKind({strip: '[a]', case: 'lower'}), /exactly one/);
        assert.throws(() => stepKind({}), /none/);
        assert.throws(() => checkStep({case: 'title'}, classes), /case is one of/);
        assert.throws(() => checkStep({normalize: 'NFX'}, classes), /normalize is one of/);
        assert.throws(() => checkStep({strip: '[\\p{Script=Arab}]'}, classes), /script properties/);
        assert.throws(() => checkStep({map: {'': 'x'}}, classes), /may not be empty/);
        assert.throws(() => checkStep({map: {a: 'b'}, at: 'middle'}, classes), /at is one of/);
        assert.throws(() => checkStep({pattern: '(?<=a)', replace: ''}, classes), /lookbehind/);
        assert.throws(() => checkStep({pattern: '(a)', replace: '$2'}, classes), /names a group/);
        assert.throws(() => checkStep({pattern: 'a', replace: '', global: 'yes'}, classes), /boolean/);
        assert.throws(() => checkStep({builtin: 'x'}, classes, {allowBuiltin: false}), /not allowed/);
        assert.throws(() => checkStep({alternatives: {a: ['b']}}, classes, {allowAlternatives: false}), /not allowed/);
        assert.throws(() => checkStep({strip: '[a]', extra: 1}, classes), /no key "extra"/);
        assert.doesNotThrow(() => checkStep({normalize: 'NFKD', within: '{squares}'}, classes));
    });
});

describe('processText', () => {
    const decapitalize = {id: 'decapitalize', variants: [[{case: 'lower'}]]};
    const capitalize = {id: 'capitalizeFirstLetter', variants: [[{case: 'upperFirst'}]]};

    test('applies processors in order, keeping inputs, counting steps, sorting by code point', () => {
        assert.deepEqual(processText([decapitalize, capitalize], 'wALK', classes), [
            {text: 'WALK', steps: 1},
            {text: 'Walk', steps: 2},
            {text: 'wALK', steps: 0},
            {text: 'walk', steps: 1},
        ]);
    });

    test('a text seen twice keeps its smallest steps; unchanged outputs keep their steps', () => {
        assert.deepEqual(processText([decapitalize, capitalize], 'Walk', classes), [
            {text: 'Walk', steps: 0},
            {text: 'walk', steps: 1},
        ]);
    });

    test('keepInput: false replaces each variant but keeps unchanged text', () => {
        const strip = {id: 'strip', keepInput: false, variants: [[{strip: '{marks}'}]]};
        assert.deepEqual(processText([strip], 'e\u0301', classes), [{text: 'e', steps: 1}]);
        assert.deepEqual(processText([strip], 'e', classes), [{text: 'e', steps: 0}]);
    });

    test('optional processors run only when enabled, and the variant limit holds', () => {
        const optional = {id: 'shout', optional: true, variants: [[{case: 'upper'}]]};
        assert.deepEqual(processText([optional], 'a', classes), [{text: 'a', steps: 0}]);
        assert.deepEqual(processText([optional], 'a', classes, {enabled: ['shout']}), [{text: 'A', steps: 1}, {text: 'a', steps: 0}]);
        const many = {id: 'alt', variants: [[{alternatives: {a: ['b', 'c', 'd']}}]]};
        assert.equal(processText([many], 'aaaaaaa', classes, {limit: 100}).length, 100);
    });

    test('compareCodePoints orders astral code points after U+FFFF', () => {
        assert.ok(compareCodePoints('\u{10000}', '\uFFFF') > 0);
        assert.ok('\u{10000}' < '\uFFFF');
        assert.ok(compareCodePoints('ab', 'abc') < 0);
        assert.equal(compareCodePoints('x', 'x'), 0);
    });
});

describe('json', () => {
    test('formats with two spaces, scalar arrays and chosen elements on one line', () => {
        const value = {a: [1, 2], b: {c: 'd', e: []}, f: [[1, 2], [3, 4]], g: {}};
        assert.equal(formatJson(value), '{\n  "a": [1, 2],\n  "b": {\n    "c": "d",\n    "e": []\n  },\n  "f": [\n    [1, 2],\n    [3, 4]\n  ],\n  "g": {}\n}\n');
        assert.equal(inlineJson({type: 'suffix', list: ['a', 'b'], skip: undefined}), '{"type": "suffix", "list": ["a", "b"]}');
    });

    test('formatTransforms puts each rule on one line', () => {
        const text = formatTransforms({transforms: [{id: 'x', rules: [{type: 'suffix', inflected: 'é'}]}]});
        assert.match(text, /\n {8}\{"type": "suffix", "inflected": "é"\}\n/);
        assert.deepEqual(JSON.parse(text), {transforms: [{id: 'x', rules: [{type: 'suffix', inflected: 'é'}]}]});
    });

    test('parseJson names the file and refuses a byte-order mark', () => {
        assert.throws(() => parseJson('\uFEFF{}', 'x.json'), /byte-order mark/);
        assert.throws(() => parseJson('{', 'x.json'), /^Error: x\.json:/);
    });
});
