// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, describe, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {checkYomitan, explain, readDifferences, ruleInputs, runCli, stemLetters} from '../check-yomitan.mjs';
import {loadPack, readJson} from '../lib/pack.mjs';

const yomitan = fileURLToPath(new URL('./fixtures/yomitan/', import.meta.url));
const languages = fileURLToPath(new URL('./fixtures/languages/', import.meta.url));
const stub = fileURLToPath(new URL('./stub/hoshidicts-cli.mjs', import.meta.url));
const tool = fileURLToPath(new URL('../check-yomitan.mjs', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'hoshidicts-check-yomitan-test-'));
after(() => rmSync(temp, {recursive: true, force: true}));

function copyFixture() {
    const dir = mkdtempSync(join(temp, 'languages-'));
    cpSync(join(languages, 'xx'), join(dir, 'xx'), {recursive: true});
    return dir;
}

function run(args, env = {}) {
    return spawnSync(process.execPath, [tool, yomitan, ...args], {encoding: 'utf8', env: {...process.env, ...env}});
}

describe('the stub CLI prints the format of section 10.3', () => {
    test('deinflect and preprocess, one JSON object per line', () => {
        const [walked] = runCli(stub, ['--languages', languages, 'deinflect', 'xx', '--stdin'], ['walked']);
        assert.equal(walked.input, 'walked');
        assert.deepEqual(walked.results[0], {text: 'walked', conditions: [], trace: []});
        assert.ok(walked.results.some((r) => r.text === 'walk' && r.trace.join() === 'past' && r.conditions.join() === 'v_phr'));
        const [variants] = runCli(stub, ['--languages', languages, 'preprocess', 'xx', '--stdin'], ['Walked']);
        assert.deepEqual(variants.variants.slice(0, 2), [{text: 'WALKED', steps: 1}, {text: 'Walked', steps: 0}]);
        assert.throws(() => runCli(stub, ['--languages', languages, 'deinflect', 'zz', '--stdin'], ['a']), /no pack zz/);
    });

    test('eval-language reads a corpus whose first line is # options: default with the pack\'s defaults (12.2)', () => {
        // The od conformance fixture: an optional accent processor (estan ->
        // están) and an optional transform (walketh -> walk).
        const conformance = fileURLToPath(new URL('../../tests/fixtures/conformance/', import.meta.url));
        const corpus = '# category\tvalid\tsource\tterm\trule\treasons\npresent\t1\testan\testar\tv\tpresent\naccents\t1\testan\testán\t*\t*\narchaic\t1\twalketh\twalk\tv\tarchaic\n';
        const dir = mkdtempSync(join(temp, 'options-'));
        const write = (name, text) => {
            writeFileSync(join(dir, name), text);
            return join(dir, name);
        };
        const evalLanguage = (file) => spawnSync(process.execPath, [stub, '--languages', conformance, 'eval-language', 'od', file], {encoding: 'utf8'});
        assert.deepEqual(JSON.parse(evalLanguage(write('all.tsv', corpus)).stdout), {rows: 3, recall: 1, negativesPassed: null});
        assert.deepEqual(JSON.parse(evalLanguage(write('default.tsv', `# options: default\n${corpus}`)).stdout), {options: 'default', rows: 3, recall: 1 / 3, negativesPassed: null});
        for (const [name, text, line] of [['misplaced.tsv', `${corpus}# options: default\n`, 5], ['misspelt.tsv', `# Options: default\n${corpus}`, 1]]) {
            const result = evalLanguage(write(name, text));
            assert.equal(result.status, 1, name);
            assert.ok(result.stderr.includes(`${name}:${line}: an options line is "# options: default", and only on the first line`), result.stderr);
        }
    });
});

describe('check-yomitan', () => {
    test('the fixture pack passes, with its listed differences', async () => {
        const {ok, lines} = await checkYomitan(yomitan, 'xx', {cli: stub, languagesDir: languages});
        assert.ok(ok, lines.join('\n'));
        assert.match(lines[0], /^xx: rules: \d+ inputs, \d+ Yomitan results, \d+ listed differences, 0 unexplained \(lastIndex reset on 1 rules\)$/);
        assert.match(lines[1], /^xx: processors: decapitalize \(\d+ inputs\), capitalizeFirstLetter \(\d+ inputs\), removeMarks \(\d+ inputs\), firstA \(\d+ inputs\), onlyYomitan \(unpaired\); 1 listed differences, 0 unexplained$/);
        assert.equal(lines.length, 2, lines.join('\n'));
    });

    test('a result the engine drops is reported and fails the check', () => {
        const result = run(['xx', '--languages', languages, '--cli', stub], {HOSHIDICTS_STUB_BREAK: 'walked'});
        assert.equal(result.status, 1);
        assert.match(result.stderr, /1 unexplained/);
        assert.match(result.stderr, /yomitan only: "walked" -> "walke" \[v_phr\] via past/);
    });

    test('without the differences file every deliberate difference fails, and processors too', () => {
        const dir = copyFixture();
        rmSync(join(dir, 'xx', 'sources', 'yomitan-differences.tsv'));
        const result = run(['xx', '--languages', dir, '--cli', stub, '--show', '1000']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /yomitan only: "\w+" -> "x" \[adj\] via empty/);
        assert.match(result.stderr, /pack only: "\w*Er" -> "\w*" \[adj\] via shout/);
        assert.match(result.stderr, /Yomitan's onlyYomitan has no pack processor with that id/);
    });

    test('a processor that differs from Yomitan is caught', () => {
        const dir = copyFixture();
        const file = join(dir, 'xx', 'language.json');
        const language = readJson(file);
        language.lookup.preprocessors[3].variants[0][0].at = 'all';
        writeFileSync(file, JSON.stringify(language));
        const result = run(['xx', '--languages', dir, '--cli', stub]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /pack only processor firstA: "banana" -> "bánáná"/);
        assert.match(result.stderr, /yomitan only processor firstA: "banana" -> "bánana"/);
    });

    test('todo rules must be mapped first', () => {
        const dir = copyFixture();
        const file = join(dir, 'xx', 'sources', 'yomitan.json');
        const ported = readJson(file);
        ported.transforms[0].rules.push({type: 'todo', isInflected: 'x$', conditionsIn: [], conditionsOut: []});
        writeFileSync(file, JSON.stringify(ported));
        const result = run(['xx', '--languages', dir, '--cli', stub]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /still has 1 todo rules/);
    });

    test('a missing CLI and usage errors are reported', () => {
        let result = run(['xx', '--languages', languages, '--cli', join(temp, 'no-such-cli')]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /does not exist; build hoshidicts-cli/);
        result = spawnSync(process.execPath, [tool], {encoding: 'utf8'});
        assert.equal(result.status, 2);
    });

    test('unused difference rows are reported as notes', () => {
        const dir = copyFixture();
        const file = join(dir, 'xx', 'sources', 'yomitan-differences.tsv');
        writeFileSync(file, readFileSync(file, 'utf8') + 'rule\t*\tpack\tnever\t*\t*\tA row that matches nothing.\n');
        const result = run(['xx', '--languages', dir, '--cli', stub]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /yomitan-differences\.tsv:\d+ explains nothing in this run/);
    });
});

describe('differences file', () => {
    test('rows need a kind, a side and a reason; regular expressions must compile', () => {
        const file = join(temp, 'differences.tsv');
        writeFileSync(file, 'rule\t*\tboth\t*\t*\t*\treason\n');
        assert.throws(() => readDifferences(file), /side is yomitan, pack or \*/);
        writeFileSync(file, 'rules\t*\t*\t*\t*\t*\treason\n');
        assert.throws(() => readDifferences(file), /kind is rule or processor/);
        writeFileSync(file, 'rule\t*\t*\t*\t*\t*\t \n');
        assert.throws(() => readDifferences(file), /needs a reason/);
        writeFileSync(file, 'rule\t*\t*\t/(/\t*\t*\treason\n');
        assert.throws(() => readDifferences(file), /Invalid regular expression/);
        writeFileSync(file, 'rule\t*\t*\t*\t*\treason\n');
        assert.throws(() => readDifferences(file), /6 columns, expected 7/);
        assert.deepEqual(readDifferences(join(temp, 'missing.tsv')), []);
    });

    test('explain matches kind, id (a transform in the trace), side, input, text and conditions', () => {
        const rows = [
            {kind: 'rule', id: 'past', side: 'yomitan', input: '/ up\\w/', text: '*', conditions: 'v_phr', reason: 'r', used: 0},
            {kind: 'processor', id: 'firstA', side: '*', input: '*', text: '', conditions: '*', reason: 'r', used: 0},
        ];
        const item = {kind: 'rule', side: 'yomitan', input: 'looked upx', text: 'look upx', conditions: 'v_phr', traces: [['past']]};
        assert.equal(explain(rows, item), rows[0]);
        assert.equal(rows[0].used, 1);
        assert.equal(explain(rows, {...item, side: 'pack'}), null);
        assert.equal(explain(rows, {...item, traces: [['ing']]}), null);
        assert.equal(explain(rows, {...item, conditions: 'v_phr|n'}), null);
        assert.equal(explain(rows, {...item, input: 'looked up'}), null);
        assert.equal(explain(rows, {kind: 'processor', id: 'firstA', side: 'pack', input: 'a', text: '', conditions: '*'}), rows[1]);
        assert.equal(explain(rows, {kind: 'processor', id: 'firstA', side: 'pack', input: 'a', text: 'b', conditions: '*'}), null);
    });
});

describe('inputs', () => {
    test('come from every rule type, the test sources with their prefixes and the corpus', () => {
        const pack = loadPack('xx', {languagesDir: languages});
        const ported = readJson(join(languages, 'xx', 'sources', 'yomitan.json'));
        const letters = stemLetters(pack, ['cats', 'walked']);
        assert.equal(letters.length, 8);
        assert.ok(letters.every((c) => /^[A-Za-z\u00C0-\u024F]$/u.test(c)));
        const inputs = ruleInputs(pack, ported, ['looked up'], ['tallér']);
        const has = (text) => inputs.includes(text);
        assert.ok(has('s') && has('ies') && has('went') && has('un'));
        assert.ok(inputs.some((t) => /^ge.+t$/.test(t)), 'circumfix parts');
        assert.ok(has('get'), 'circumfix with an empty stem');
        assert.ok(inputs.some((t) => /ä.er$/.test(t)), 'stemChange.from');
        assert.ok(inputs.some((t) => / up$/.test(t)) && inputs.some((t) => / off\S$/.test(t)), 'word lists');
        assert.ok(has('l') && has('looked') && has('looked u') && has('looked up'), 'prefixes of test sources');
        assert.ok(has('tallér'), 'corpus words');
        assert.equal(new Set(inputs).size, inputs.length);
        assert.ok(inputs.every((t) => t !== '' && !t.includes('\n')));
    });
});
