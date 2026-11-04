// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, describe, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {checkClasses, classFields, computeExpectations, stepLists} from '../check-classes.mjs';
import {loadPack} from '../lib/pack.mjs';

const fixtures = fileURLToPath(new URL('./fixtures/languages/', import.meta.url));
const tool = fileURLToPath(new URL('../check-classes.mjs', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'hoshidicts-check-classes-test-'));
after(() => rmSync(temp, {recursive: true, force: true}));

function copyFixture() {
    const dir = mkdtempSync(join(temp, 'languages-'));
    cpSync(join(fixtures, 'xx'), join(dir, 'xx'), {recursive: true});
    return dir;
}

function run(args) {
    return spawnSync(process.execPath, [tool, ...args], {encoding: 'utf8'});
}

describe('check-classes', () => {
    test('the committed fixture expectations are what Node computes', () => {
        const result = checkClasses('xx', {languagesDir: fixtures});
        assert.ok(result.ok, result.message);
    });

    test('expectations have the shape of section 12.1 step 2', () => {
        const expectations = computeExpectations(loadPack('xx', {languagesDir: fixtures}));
        assert.deepEqual(Object.keys(expectations), ['generator', 'unicode', 'classes', 'fields', 'steps']);
        assert.equal(expectations.generator, 'tools/check-classes.mjs');
        assert.equal(expectations.unicode, process.versions.unicode);
        assert.deepEqual(Object.keys(expectations.classes), ['letter', 'word', 'marks', 'notLetter']);
        assert.deepEqual(expectations.classes.letter, [[65, 90], [97, 122], [192, 591]]);
        assert.deepEqual(expectations.fields['text.pattern'], expectations.classes.letter);
        assert.deepEqual(expectations.fields['text.wordCharacters'], expectations.classes.word);
        assert.deepEqual(expectations.classes.notLetter.at(-1), [0xE000, 0x10FFFF]);
        assert.deepEqual(Object.keys(expectations.fields), [
            'text.pattern',
            'text.wordCharacters',
            'lookup.preprocessors[2].variants[0][1].strip',
            'presentation.displayTransforms.stripMarks[1].strip',
            'transforms[5].rules[0].stemCharacters',
            'transforms[6].rules[0].stemNotEndsWith',
            'transforms[9].rules[0].stemEndsWith',
            'transforms[9].rules[0].then[1].strip',
        ]);
        assert.deepEqual(expectations.steps.map((s) => [s.processor, s.step]), [
            ['decapitalize', 0],
            ['capitalizeFirstLetter', 0],
            ['dropApostrophe', 0],
            ['dropApostrophe', 1],
            ['presentation.displayTransforms.shout', 0],
            ['transforms[9].rules[0].then', 0],
        ]);
        const decapitalize = expectations.steps[0];
        assert.deepEqual(decapitalize.cases.find(([input]) => input === 'Cities'), ['Cities', 'cities']);
        // Inputs: TSV sources, text.tsv inputs, then the host.sample texts.
        const inputs = decapitalize.cases.map(([input]) => input);
        assert.deepEqual(inputs, ['cats', 'Cities', 'walked', 'looked up', 'walketh', 'tallér', 'bus', 'Walked', 'café', 'banana', 'walking', 'She walked home.', 'walk']);
        const apostrophe = expectations.steps[2];
        assert.ok(apostrophe.cases.every(([input, output]) => output === input));
    });

    test('the inputs include tests/cases.tsv and tests/defaults.tsv, in the order of section 12.1', () => {
        const dir = copyFixture();
        const header = '# category\tvalid\tsource\tterm\trule\treasons\n';
        writeFileSync(join(dir, 'xx', 'tests', 'cases.tsv'), `${header}nouns\t1\tZqcases\tzqcase\tns\tplural\n`);
        writeFileSync(join(dir, 'xx', 'tests', 'defaults.tsv'), `# options: default\n${header}nouns\t1\tZqdefaults\tzqdefault\tns\tplural\n`);
        const inputs = computeExpectations(loadPack('xx', {languagesDir: dir})).steps[0].cases.map(([input]) => input);
        assert.deepEqual(inputs.slice(6, 9), ['bus', 'Zqcases', 'Zqdefaults']);
    });

    test('stepLists and classFields walk every step list', () => {
        const pack = loadPack('xx', {languagesDir: fixtures});
        assert.deepEqual(stepLists(pack.language, null).map((s) => s.name), ['decapitalize', 'capitalizeFirstLetter', 'removeMarks', 'firstA', 'dropApostrophe', 'presentation.displayTransforms.stripMarks', 'presentation.displayTransforms.shout']);
        assert.deepEqual(classFields({text: {pattern: '[a]', wordCharacters: '[b]', wordInternal: null}, capabilities: {characterView: {pattern: '[c]'}}}, null), [
            ['text.pattern', '[a]'], ['text.wordCharacters', '[b]'], ['capabilities.characterView.pattern', '[c]'],
        ]);
    });

    test('lookup.formOfNormalizer is recorded after readingNormalizer, without builtins or alternatives', () => {
        const dir = copyFixture();
        const file = join(dir, 'xx', 'language.json');
        const language = JSON.parse(readFileSync(file, 'utf8'));
        language.lookup.readingNormalizer = [{strip: '[\\u0301]'}];
        language.lookup.formOfNormalizer = [{normalize: 'NFD'}, {strip: '[\\u0300\\u030F]'}, {case: 'lower'}, {pattern: '([aeiou])\\u0301', replace: '$1', global: true}, {normalize: 'NFC'}];
        writeFileSync(file, JSON.stringify(language));
        const pack = loadPack('xx', {languagesDir: dir});
        assert.deepEqual(stepLists(pack.language, null).map((s) => s.name).slice(4, 7), ['dropApostrophe', 'lookup.readingNormalizer', 'lookup.formOfNormalizer']);
        const expectations = computeExpectations(pack);
        assert.deepEqual(Object.keys(expectations.fields).slice(2, 6), [
            'lookup.preprocessors[2].variants[0][1].strip',
            'lookup.readingNormalizer[0].strip',
            'lookup.formOfNormalizer[1].strip',
            'presentation.displayTransforms.stripMarks[1].strip',
        ]);
        assert.deepEqual(expectations.fields['lookup.formOfNormalizer[1].strip'], [[0x300, 0x300], [0x30F, 0x30F]]);
        assert.deepEqual(expectations.steps.map((s) => [s.processor, s.step]).slice(4, 6), [['lookup.formOfNormalizer', 2], ['lookup.formOfNormalizer', 3]]);
        const pattern = expectations.steps[5];
        assert.deepEqual(pattern.cases.find(([input]) => input === 'café'), ['café', 'café']);
        for (const [bad, reason] of [[{builtin: 'kana.toHiragana'}, /lookup\.formOfNormalizer\[0\]: builtins are not allowed here/],
            [{alternatives: {a: ['b']}}, /lookup\.formOfNormalizer\[0\]: alternatives are not allowed here/]]) {
            language.lookup.formOfNormalizer = [bad];
            writeFileSync(file, JSON.stringify(language));
            const result = run(['--languages', dir, 'xx', '--write']);
            assert.equal(result.status, 1);
            assert.match(result.stderr, reason);
        }
    });

    test('--write writes the file and a check then passes; a changed file fails', () => {
        const dir = copyFixture();
        const file = join(dir, 'xx', 'tests', 'classes.json');
        rmSync(file);
        let result = run(['--languages', dir, 'xx']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /is missing; run node tools\/check-classes\.mjs xx --write/);
        result = run(['--languages', dir, 'xx', '--write']);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /wrote .*4 classes, 8 fields, 6 steps/);
        assert.equal(readFileSync(file, 'utf8'), readFileSync(join(fixtures, 'xx', 'tests', 'classes.json'), 'utf8'));
        result = run(['--languages', dir, '--all']);
        assert.equal(result.status, 0, result.stderr);
        const changed = JSON.parse(readFileSync(file, 'utf8'));
        changed.classes.letter[0][1] = 91;
        writeFileSync(file, JSON.stringify(changed, null, 2) + '\n');
        result = run(['--languages', dir, 'xx']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /classes\["letter"\] differs/);
        writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(join(fixtures, 'xx', 'tests', 'classes.json'), 'utf8'))) + '\n');
        result = run(['--languages', dir, 'xx']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /only its formatting differs/);
    });

    test('a class or a pattern outside the syntax fails with its JSON path', () => {
        const dir = copyFixture();
        const file = join(dir, 'xx', 'language.json');
        const language = JSON.parse(readFileSync(file, 'utf8'));
        language.lookup.preprocessors[4].variants[0][0].pattern = '(?<=a)s$';
        writeFileSync(file, JSON.stringify(language));
        let result = run(['--languages', dir, 'xx', '--write']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /lookup\.preprocessors\[4\]\.variants\[0\]\[0\]: lookbehind/);
        language.lookup.preprocessors[4].variants[0][0].pattern = 'x';
        language.classes.letter = '[\\p{Script=Latin}]';
        writeFileSync(file, JSON.stringify(language));
        result = run(['--languages', dir, 'xx', '--write']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /classes\.letter: script properties/);
        language.classes.letter = '[A-Z{word}]';
        writeFileSync(file, JSON.stringify(language));
        result = run(['--languages', dir, 'xx', '--write']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /cycle/);
    });

    test('pattern rules in the transforms are checked against the dialect', () => {
        const dir = copyFixture();
        const file = join(dir, 'xx', 'transforms.json');
        const transforms = JSON.parse(readFileSync(file, 'utf8'));
        transforms.transforms[9].rules[1].pattern = '^(\\w+)\u2019$';
        writeFileSync(file, JSON.stringify(transforms));
        const result = run(['--languages', dir, 'xx', '--write']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /transforms\[9\]\.rules\[1\]: \\w is not in the pattern dialect/);
    });

    test('usage errors exit with 2', () => {
        assert.equal(run([]).status, 2);
        assert.equal(run(['--bogus']).status, 2);
    });
});
