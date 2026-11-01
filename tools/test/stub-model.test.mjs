// SPDX-License-Identifier: GPL-3.0-or-later
// The stub CLI's model must follow section 7 closely enough for the tool
// tests (and for trying packs before the engine's CLI exists).
import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {ClassSet} from '../lib/classes.mjs';
import {ModelDeinflector, conditionFlags} from './stub/model.mjs';

const classes = new ClassSet({
    letter: '[a-z\\u00E0-\\u00FF]',
    word: '[{letter}\\u2019\']',
    arabic: '[\\u0620-\\u065F\\u066E-\\u06D3\\u06D5\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF]',
    consonant: '[bcdfghjklmnpqrstvwxyz]',
    vowel: '[aeiou]',
});

const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_phr', 'v_base']},
    v_phr: {name: 'Phrasal', isDictionaryForm: true},
    v_base: {name: 'Base', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
};

function model(rules, extra = {}) {
    return new ModelDeinflector({schema: 1, conditions, wordLists: {particles: ['up', 'on'], guards: ['up', 'on', 'the', 'to']}, transforms: rules.map((r, i) => ({id: r.id ?? `t${i}`, name: r.id ?? `t${i}`, rules: [r.rule], ...(r.optional ? {optional: true} : {})}))}, classes, {wordCharacters: '{word}', ...extra});
}

function texts(m, input) {
    return m.deinflect(input).slice(1).map((r) => `${r.text}:${m.conditionNames(r.conditions).join('|')}:${r.trace.join('<')}`);
}

describe('conditions', () => {
    test('one bit per condition without subConditions, unions for the others', () => {
        const {flags, leaves} = conditionFlags(conditions);
        assert.deepEqual(leaves, ['v_phr', 'v_base', 'n', 'adj']);
        assert.equal(flags.get('v'), 0b11);
        assert.equal(flags.get('adj'), 0b1000);
        assert.throws(() => conditionFlags({a: {subConditions: ['b']}, b: {subConditions: ['a']}}), /cycle/);
        assert.throws(() => conditionFlags(Object.fromEntries(Array.from({length: 33}, (_, i) => [`c${i}`, {}]))), /32/);
    });

    test('a rule applies to conditions 0 or overlapping conditionsIn; empty conditionsIn only to 0', () => {
        const m = model([
            {id: 'a', rule: {type: 'suffix', inflected: 'x', deinflected: '', conditionsIn: [], conditionsOut: ['n']}},
            {id: 'b', rule: {type: 'suffix', inflected: 'y', deinflected: '', conditionsIn: ['n'], conditionsOut: ['adj']}},
            {id: 'c', rule: {type: 'suffix', inflected: 'z', deinflected: '', conditionsIn: ['v'], conditionsOut: []}},
        ]);
        assert.deepEqual(texts(m, 'kyx'), ['ky:n:a', 'k:adj:b<a']);
        assert.deepEqual(texts(m, 'kxy'), ['kx:adj:b']);
        assert.deepEqual(texts(m, 'kzy'), ['kz:adj:b']);
    });
});

describe('rule types', () => {
    test('suffix stem constraints', () => {
        const rule = (extra) => model([{rule: {type: 'suffix', inflected: 'ed', deinflected: '', conditionsIn: [], conditionsOut: ['v'], ...extra}}]);
        assert.deepEqual(texts(rule({stemMinLength: 2}), 'red'), []);
        assert.deepEqual(texts(rule({stemMinLength: 2}), 'aired'), ['air:v_phr|v_base:t0']);
        assert.deepEqual(texts(rule({stemCharacters: '{consonant}'}), 'saled'), []);
        assert.deepEqual(texts(rule({stemCharacters: '{consonant}'}), 'ssed'), ['ss:v_phr|v_base:t0']);
        assert.deepEqual(texts(rule({stemContains: '{vowel}'}), 'stred'), []);
        assert.deepEqual(texts(rule({stemStartsWith: '{vowel}'}), 'aired').length, 1);
        assert.deepEqual(texts(rule({stemStartsWith: '{vowel}'}), 'bed').length, 0);
        assert.deepEqual(texts(rule({stemEndsWith: '{vowel}'}), 'ired').length, 0);
        assert.deepEqual(texts(rule({stemNotEndsWith: '[n]'}), 'ned').length, 0);
        assert.deepEqual(texts(rule({stemNotEndsWith: '[n]'}), 'ed').length, 1);
        assert.deepEqual(texts(rule({stemNotStartsWith: '[n]'}), 'nod').length, 0);
        assert.deepEqual(texts(rule({stemStartsWithText: 'ju'}), 'juged').length, 1);
        assert.deepEqual(texts(rule({stemNotStartsWithText: 'ju'}), 'juged').length, 0);
    });

    test('stemChange with occurrence and between', () => {
        const m = model([{rule: {type: 'suffix', inflected: 'o', deinflected: 'ar', conditionsIn: [], conditionsOut: ['v'], stemChange: {from: ['ie'], to: 'e', occurrence: 'first'}}}]);
        assert.deepEqual(texts(m, 'pienso'), ['pensar:v_phr|v_base:t0']);
        assert.deepEqual(texts(m, 'hablo'), []);
        const last = model([{rule: {type: 'suffix', inflected: 'er', deinflected: '', conditionsIn: [], conditionsOut: ['n'], stemChange: {from: ['ä'], to: 'a', occurrence: 'last'}}}]);
        assert.deepEqual(texts(last, 'häusäler'), ['häusal:n:t0']);
        const between = model([{rule: {type: 'suffix', inflected: 'a', deinflected: '', conditionsIn: [], conditionsOut: ['n'], stemChange: {from: ['o', 'e'], to: 'i', occurrence: 'last', between: '{consonant}', betweenMinLength: 1}}}]);
        assert.deepEqual(texts(between, 'kotla'), ['kitl:n:t0']);
        assert.deepEqual(texts(between, 'koa'), []);
    });

    test('prefix, wholeWord and then steps', () => {
        const m = model([
            {id: 'un', rule: {type: 'prefix', inflected: 'un', deinflected: '', conditionsIn: [], conditionsOut: ['adj']}},
            {id: 'went', rule: {type: 'wholeWord', inflected: 'went', deinflected: 'go', conditionsIn: [], conditionsOut: ['v']}},
            {id: 'xana', rule: {type: 'prefix', inflected: 'xana', deinflected: '', conditionsIn: [], conditionsOut: ['v'], then: [{normalize: 'NFD'}, {strip: '[\\u0300-\\u036F]'}, {normalize: 'NFC'}]}},
        ]);
        assert.deepEqual(texts(m, 'unkind'), ['kind:adj:un']);
        assert.deepEqual(texts(m, 'went'), ['go:v_phr|v_base:went']);
        assert.deepEqual(texts(m, 'awent'), []);
        assert.deepEqual(texts(m, 'xanagráfo'), ['grafo:v_phr|v_base:xana']);
    });

    test('circumfix, single and cross-product, with stem constraints', () => {
        const single = model([{rule: {type: 'circumfix', inflectedPrefix: 'ge', deinflectedPrefix: '', inflectedSuffix: 't', deinflectedSuffix: 'en', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 1}}]);
        assert.deepEqual(texts(single, 'gemacht'), ['machen:v_phr|v_base:t0']);
        assert.deepEqual(texts(single, 'get'), []);
        const cross = model([{rule: {type: 'circumfix', prefixes: [['\u064A', ''], ['\u0648\u064A', '']], suffixes: [['\u0648\u0646', ''], ['\u0648\u0647', '']], conditionsIn: [], conditionsOut: ['v'], stemCharacters: '{arabic}', stemMinLength: 1}}]);
        assert.deepEqual(texts(cross, 'ويكتبون'), ['كتب:v_phr|v_base:t0']);
        assert.deepEqual(texts(cross, 'يكتبوه'), ['كتب:v_phr|v_base:t0']);
        assert.deepEqual(texts(cross, 'يون'), []);
        assert.deepEqual(texts(cross, 'يabون'), []);
    });

    test('replace: occurrence and notAtStart', () => {
        const rule = (extra) => model([{rule: {type: 'replace', inflected: 'h', deinflected: '', conditionsIn: [], conditionsOut: [], occurrence: 'all', ...extra}}]);
        assert.deepEqual(texts(rule({}), 'chath'), ['cat::t0']);
        assert.deepEqual(texts(rule({occurrence: 'first'}), 'chath'), ['cath::t0', 'cat::t0<t0']);
        assert.deepEqual(texts(rule({occurrence: 'last'}), 'chath'), ['chat::t0', 'cat::t0<t0']);
        assert.deepEqual(texts(rule({notAtStart: true}), 'hath'), ['hat::t0']);
        assert.deepEqual(texts(rule({notAtStart: true}), 'ha'), []);
    });

    test('phrasal matches whole words of the list and keeps the rest', () => {
        const m = model([{id: 'past', rule: {type: 'phrasal', inflected: 'ed', deinflected: '', followedBy: 'particles', conditionsIn: [], conditionsOut: ['v_phr']}}]);
        assert.deepEqual(texts(m, 'looked up'), ['look up:v_phr:past']);
        assert.deepEqual(texts(m, 'looked up to'), ['look up to:v_phr:past']);
        assert.deepEqual(texts(m, 'looked uptown'), []);
        assert.deepEqual(texts(m, 'looked'), []);
        assert.deepEqual(texts(m, 'looked  up'), []);
    });

    test('interposedObject removes the runs between the verb and the particle', () => {
        const m = model([{id: 'io', rule: {type: 'interposedObject', particles: 'particles', guardWords: 'guards', conditionsIn: [], conditionsOut: ['v_phr']}}]);
        assert.deepEqual(texts(m, 'put it on'), ['put on:v_phr:io']);
        assert.deepEqual(texts(m, 'put mary’s coat on'), ['put on:v_phr:io']);
        assert.deepEqual(texts(m, 'put the coat on'), []);
        assert.deepEqual(texts(m, 'put it on the table'), ['put on the table:v_phr:io']);
        assert.deepEqual(texts(m, 'put on'), []);
        assert.deepEqual(texts(m, 'put it upon'), []);
    });

    test('pattern rules need their anchor', () => {
        const m = model([{rule: {type: 'pattern', pattern: '^({letter}+) .+ ab$', replacement: '$1 ab', anchorSuffix: ' ab', conditionsIn: [], conditionsOut: ['v']}}]);
        assert.deepEqual(texts(m, 'fahre morgen ab'), ['fahre ab:v_phr|v_base:t0']);
        assert.deepEqual(texts(m, 'fahre morgen an'), []);
    });
});

describe('search', () => {
    test('suffix rules longest first, then prefixes, then the rest in file order', () => {
        const m = model([
            {id: 's', rule: {type: 'suffix', inflected: 's', deinflected: '', conditionsIn: [], conditionsOut: []}},
            {id: 'es', rule: {type: 'suffix', inflected: 'es', deinflected: '', conditionsIn: [], conditionsOut: []}},
            {id: 'p', rule: {type: 'prefix', inflected: 'x', deinflected: '', conditionsIn: [], conditionsOut: []}},
        ]);
        assert.deepEqual(m.deinflect('xes').map((r) => r.text), ['xes', 'x', '', 'xe', 'e', 'es', '', 'e']);
    });

    test('a rule is not applied twice to the same text in one trace', () => {
        const m = model([
            {id: 'a', rule: {type: 'suffix', inflected: 'a', deinflected: 'b', conditionsIn: [], conditionsOut: []}},
            {id: 'b', rule: {type: 'suffix', inflected: 'b', deinflected: 'a', conditionsIn: [], conditionsOut: []}},
        ]);
        assert.deepEqual(m.deinflect('a').map((r) => `${r.text}:${r.trace.join('<')}`), ['a:', 'b:a', 'a:b<a']);
    });

    test('optional transforms run only when enabled; todo rules are refused', () => {
        const rules = [{id: 'opt', optional: true, rule: {type: 'suffix', inflected: 'q', deinflected: '', conditionsIn: [], conditionsOut: []}}];
        assert.deepEqual(texts(model(rules), 'aq'), []);
        assert.deepEqual(texts(model(rules, {enabled: ['opt']}), 'aq'), ['a::opt']);
        assert.throws(() => model([{rule: {type: 'todo', isInflected: 'x$', conditionsIn: [], conditionsOut: []}}]), /todo/);
        assert.throws(() => model([{rule: {type: 'wat', conditionsIn: [], conditionsOut: []}}]), /unknown rule type/);
        assert.throws(() => model([{rule: {type: 'suffix', inflected: 'a', deinflected: '', conditionsIn: ['zz'], conditionsOut: []}}]), /not declared/);
    });
});
