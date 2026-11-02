// SPDX-License-Identifier: GPL-3.0-or-later
// Checks against a real Yomitan checkout at the pinned revision, when
// YOMITAN_DIR names one (CI does not need it):
//
//   YOMITAN_DIR=/path/to/yomitan node --test tools/test/
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {portDescriptor} from '../port-yomitan-transforms.mjs';
import {portTests} from '../port-yomitan-tests.mjs';
import {PINNED_REVISION, loadTransformDescriptor, yomitanRevision} from '../lib/yomitan.mjs';

const root = process.env.YOMITAN_DIR;
const skip = root === undefined || root === '' ? 'YOMITAN_DIR is not set' : yomitanRevision(root) !== PINNED_REVISION ? `YOMITAN_DIR is not at ${PINNED_REVISION}` : false;

// Literal and other rules per language: the census of docs/languages.md,
// sections 8.3 and 14.1 (10,946 literal and 7,415 other rules in all).
const CENSUS = {
    ar: [537, 6620], de: [74, 70], el: [5, 1], en: [98, 39], eo: [24, 0], es: [518, 27], eu: [75, 0], fr: [2672, 0],
    ga: [7, 0], grc: [55, 0], ja: [928, 0], ka: [16, 0], ko: [2681, 1], la: [8, 0], sga: [43, 27], sq: [88, 6],
    tl: [135, 500], uk: [2959, 64], yi: [23, 60],
};

describe('a real Yomitan checkout', {skip}, () => {
    test('the port classifies exactly the census of the contract', async () => {
        let literal = 0;
        let other = 0;
        for (const [code, [wantLiteral, wantOther]] of Object.entries(CENSUS)) {
            const {descriptor} = await loadTransformDescriptor(root, code);
            const {counts} = portDescriptor(descriptor);
            const todo = counts.todo ?? 0;
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            assert.deepEqual([total - todo, todo], [wantLiteral, wantOther], code);
            literal += total - todo;
            other += todo;
        }
        assert.deepEqual([literal, other], [10946, 7415]);
    });

    test('the Japanese tests convert to the rows of languages/ja/tests/yomitan.tsv (moved from tests/fixtures/)', async () => {
        const {text} = await portTests(root, 'ja');
        const fixture = readFileSync(fileURLToPath(new URL('../../languages/ja/tests/yomitan.tsv', import.meta.url)), 'utf8');
        assert.deepEqual(text.split('\n').slice(2), fixture.split('\n').slice(2));
    });
});
