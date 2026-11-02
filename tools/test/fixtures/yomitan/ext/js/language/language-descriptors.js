// SPDX-License-Identifier: GPL-3.0-or-later
// The descriptor map of the miniature checkout.
import {disassemble} from './kx/kx-processors.js';
import {capitalizeFirstLetter, decapitalize} from './text-processors.js';
import {testTransforms} from './xx/xx-transforms.js';

const removeMarks = {
    name: 'Remove marks',
    description: 'é -> e',
    process: (text) => [text, text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')],
};

const firstA = {
    name: 'First a',
    description: 'banana -> bánana',
    process: (text) => [text, text.replace('a', 'á')],
};

const onlyYomitan = {
    name: 'Only in Yomitan',
    description: 'No pack processor pairs with it',
    process: (text) => [text, `${text}!`],
};

export const languageDescriptorMap = new Map([
    ['xx', {iso: 'xx', iso639_3: 'xxx', name: 'Test', exampleText: 'walk', textPreprocessors: {decapitalize, capitalizeFirstLetter, removeMarks, firstA, onlyYomitan}, languageTransforms: testTransforms}],
    ['kx', {iso: 'kx', iso639_3: 'kxx', name: 'Test Hangul', exampleText: '가', textPreprocessors: {disassemble}}],
]);
