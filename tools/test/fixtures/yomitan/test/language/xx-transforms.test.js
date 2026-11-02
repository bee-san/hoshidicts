/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2024-2026  Test Authors
 * Copyright (C) 2020-2022  Older Test Authors
 */

import {LanguageTransformer} from '../../ext/js/language/language-transformer.js';
import {testTransforms} from '../../ext/js/language/xx/xx-transforms.js';
import {testLanguageTransformer} from '../fixtures/language-transformer-test.js';

const tests = [
    {
        category: 'nouns',
        valid: true,
        tests: [
            {term: 'cat', source: 'cats', rule: 'ns', reasons: ['plural']},
            {term: 'city', source: 'cities', rule: 'ns', reasons: ['plural']},
        ],
    },
    {
        category: 'verbs',
        valid: true,
        tests: [
            {term: 'walk', source: 'walked', rule: 'v', reasons: ['past']},
            {term: 'go', source: 'went', rule: 'v', reasons: ['irregular']},
            {term: 'look up', source: 'looked up', rule: 'v_phr', reasons: ['past']},
            {term: 'machen', source: 'gemacht', rule: 'v', reasons: ['ge-t']},
            {term: 'do', source: 'undo', rule: null, reasons: null},
        ],
    },
    {
        category: 'invalid',
        valid: false,
        tests: [
            {term: 'b', source: 'bus', rule: 'ns', reasons: ['plural']},
        ],
    },
];

const languageTransformer = new LanguageTransformer();
languageTransformer.addDescriptor(testTransforms);
testLanguageTransformer(languageTransformer, tests);
