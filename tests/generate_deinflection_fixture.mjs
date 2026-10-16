// SPDX-License-Identifier: GPL-3.0-or-later
// Run with a Yomitan checkout at e7334a96106a6c74e6fa75bd33a5ea1219d92712:
// node tests/generate_deinflection_fixture.mjs /path/to/yomitan
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

const revision = 'e7334a96106a6c74e6fa75bd33a5ea1219d92712';
const source = readFileSync(resolve(process.argv[2], 'test/language/japanese-transforms.test.js'), 'utf8');
// The upstream fixture is a static array. Strip its imports and test runner.
const fixtureSource = source.replace(/^import .*;$/gm, '').split('const languageTransformer')[0];
const categories = runInNewContext(fixtureSource + '\n tests;');
const rows = categories.flatMap(({category, valid, tests}) => tests.map(({source, term, rule, reasons}) =>
    [category, valid ? '1' : '0', source, term, rule ?? '*', reasons === null ? '*' : reasons.join('|')].join('\t')));
const header = '# GPL-3.0-or-later; Copyright (C) 2023-2026 Yomitan Authors; 2020-2022 Yomichan Authors\n' +
    '# https://github.com/yomidevs/yomitan/blob/' + revision + '/test/language/japanese-transforms.test.js\n' +
    '# category\tvalid\tsource\tterm\trule\treasons (forward order, | separated; * means any)\n';
writeFileSync(fileURLToPath(new URL('fixtures/yomitan-deinflections.tsv', import.meta.url)), header + rows.join('\n') + '\n');
console.log('Wrote ' + rows.length + ' Yomitan cases at ' + revision);
