// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, describe, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../lib/json.mjs';
import {mergeTransforms} from '../merge-transforms.mjs';

const tool = fileURLToPath(new URL('../merge-transforms.mjs', import.meta.url));
const template = fileURLToPath(new URL('../../languages/_template/', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'hoshidicts-merge-test-'));
after(() => rmSync(temp, {recursive: true, force: true}));

const conditions = {
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['np', 'ns']},
    np: {name: 'Noun, plural', isDictionaryForm: true},
    ns: {name: 'Noun, singular', isDictionaryForm: true},
};
const suffix = (inflected, deinflected, extra = {}) => ({type: 'suffix', inflected, deinflected, conditionsIn: ['np'], conditionsOut: ['ns'], ...extra});

const yomitan = {
    schema: 1,
    conditions: {...conditions, v: {name: 'Verb', isDictionaryForm: true, i18n: [{language: 'xx', name: 'V'}]}},
    wordLists: {particles: ['up', 'on']},
    transforms: [
        {id: 'plural', name: 'plural', description: 'Plural form of a noun', source: 'yomitan', rules: [suffix('s', ''), suffix('es', '')]},
        {id: 'past', name: 'past', description: 'Past tense', source: 'yomitan', rules: [{type: 'suffix', inflected: 'ed', deinflected: '', conditionsIn: [], conditionsOut: ['v']}]},
    ],
};
const own = {
    schema: 1,
    conditions: {...conditions, v: {name: 'Verb', isDictionaryForm: true}, adj: {name: 'Adjective', isDictionaryForm: true}},
    wordLists: {particles: ['on', 'up']},
    transforms: [
        // The same rule as Yomitan's, keys in another order and a source of its own.
        {id: 'plural', name: 'plural', description: 'Plural of a noun', source: 'own',
            rules: [{conditionsOut: ['ns'], conditionsIn: ['np'], deinflected: '', inflected: 's', type: 'suffix', source: 'own'}, suffix('ies', 'y')]},
        {id: 'irregular', name: 'irregular plural', description: 'Irregular plural', source: 'own',
            rules: [{type: 'wholeWord', inflected: 'mice', deinflected: 'mouse', conditionsIn: [], conditionsOut: ['ns']}]},
    ],
};

describe('mergeTransforms (section 14 step 5)', () => {
    test('the union, each rule with its source', () => {
        const {transforms, counts, notes} = mergeTransforms(own, yomitan);
        assert.deepEqual(transforms.transforms.map((t) => [t.id, t.source]), [['plural', 'both'], ['past', 'yomitan'], ['irregular', 'own']]);
        const plural = transforms.transforms[0];
        assert.equal(plural.description, 'Plural of a noun', "own.json's description wins");
        assert.deepEqual(plural.rules, [suffix('s', ''), suffix('es', '', {source: 'yomitan'}), suffix('ies', 'y', {source: 'own'})]);
        assert.deepEqual(transforms.transforms[1].rules, yomitan.transforms[1].rules, 'a Yomitan-only transform keeps its rules as they are');
        assert.deepEqual(transforms.transforms[2].rules, own.transforms[1].rules.map(({source: _s, ...r}) => r));
        assert.deepEqual(counts, {own: 2, yomitan: 2, both: 1});
        assert.deepEqual(notes, ['plural: description is "Plural of a noun" in own.json, "Plural form of a noun" in yomitan.json; own.json\'s is kept']);
        // Conditions: Yomitan's (with i18n) first, then own.json's others.
        assert.deepEqual(Object.keys(transforms.conditions), ['n', 'np', 'ns', 'v', 'adj']);
        assert.deepEqual(transforms.conditions.v.i18n, [{language: 'xx', name: 'V'}]);
        assert.deepEqual(transforms.wordLists, {particles: ['up', 'on']});
    });

    test('either file alone', () => {
        const ownOnly = mergeTransforms(own, null);
        assert.deepEqual(ownOnly.transforms.transforms.map((t) => [t.id, t.source]), [['plural', 'own'], ['irregular', 'own']]);
        assert.ok(ownOnly.transforms.transforms.every((t) => t.rules.every((r) => r.source === undefined)));
        const yomitanOnly = mergeTransforms(null, yomitan);
        assert.deepEqual(yomitanOnly.counts, {own: 0, yomitan: 3, both: 0});
    });

    test('a rule both files have twice pairs once per copy', () => {
        const twice = {...own, transforms: [{...own.transforms[0], rules: [suffix('s', ''), suffix('s', '')]}]};
        const {transforms} = mergeTransforms(twice, yomitan);
        assert.deepEqual(transforms.transforms[0].rules, [suffix('s', ''), suffix('es', '', {source: 'yomitan'}), suffix('s', '', {source: 'own'})]);
    });

    test('refuses conflicts and todo rules', () => {
        const otherCondition = {...own, conditions: {...own.conditions, v: {name: 'Verb', isDictionaryForm: false}}};
        assert.throws(() => mergeTransforms(otherCondition, yomitan), /condition v differs/);
        const otherWords = {...own, wordLists: {particles: ['up']}};
        assert.throws(() => mergeTransforms(otherWords, yomitan), /word list particles differs/);
        const todo = {...yomitan, transforms: [{id: 't', name: 't', source: 'yomitan', rules: [{type: 'todo', isInflected: 'x$', conditionsIn: [], conditionsOut: []}]}]};
        assert.throws(() => mergeTransforms(own, todo), /1 todo rules/);
    });
});

describe('merge-transforms.mjs', () => {
    const languages = join(temp, 'languages');
    const pack = join(languages, 'zz');
    mkdirSync(join(pack, 'sources'), {recursive: true});
    cpSync(template, join(languages, '_template'), {recursive: true});
    cpSync(join(template, 'transforms.json'), join(pack, 'transforms.json'));
    writeFileSync(join(pack, 'sources', 'own.json'), formatTransforms(own));
    writeFileSync(join(pack, 'sources', 'yomitan.json'), formatTransforms(yomitan));
    const run = (...args) => spawnSync(process.execPath, [tool, 'zz', '--languages', languages, ...args], {encoding: 'utf8'});

    test('replaces the template copy, then keeps a file edited by hand unless --force', () => {
        let result = run();
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /3 transforms, 5 rules \(2 own, 2 yomitan, 1 both\)/);
        const written = readFileSync(join(pack, 'transforms.json'), 'utf8');
        assert.equal(written, formatTransforms(mergeTransforms(own, yomitan).transforms));
        assert.equal(run().status, 0, 'writing the same file again is fine');
        writeFileSync(join(pack, 'transforms.json'), written.replace(/^.*"es".*\n/m, ''));
        result = run();
        assert.equal(result.status, 1);
        assert.match(result.stderr, /--force/);
        result = run('--out', join(temp, 'union.json'));
        assert.equal(result.status, 0, result.stderr);
        assert.equal(readFileSync(join(temp, 'union.json'), 'utf8'), written);
        assert.equal(run('--force').status, 0);
        assert.equal(readFileSync(join(pack, 'transforms.json'), 'utf8'), written);
    });

    test('reports a pack without sources', () => {
        const result = spawnSync(process.execPath, [tool, 'qq', '--languages', languages], {encoding: 'utf8'});
        assert.equal(result.status, 1);
        assert.match(result.stderr, /neither/);
    });
});
