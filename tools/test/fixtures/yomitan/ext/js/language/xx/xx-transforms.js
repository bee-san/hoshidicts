// SPDX-License-Identifier: GPL-3.0-or-later
// A made-up language for the tool tests: one rule of every shape the port
// tool classifies (docs/languages.md, section 8.1).

import {prefixInflection, suffixInflection, wholeWordInflection} from '../language-transforms.js';

const conditions = {
    v: {
        name: 'Verb',
        isDictionaryForm: true,
        subConditions: ['v_phr'],
    },
    v_phr: {
        name: 'Phrasal verb',
        isDictionaryForm: true,
    },
    n: {
        name: 'Noun',
        isDictionaryForm: true,
        subConditions: ['np', 'ns'],
    },
    np: {
        name: 'Noun plural',
        isDictionaryForm: true,
    },
    ns: {
        name: 'Noun singular',
        isDictionaryForm: true,
        i18n: [{language: 'xx', name: 'Singular'}],
    },
    adj: {
        name: 'Adjective',
        isDictionaryForm: true,
    },
};

export const testTransforms = {
    language: 'xx',
    conditions,
    transforms: {
        'plural': {
            name: 'plural',
            description: 'Plural form of a noun',
            i18n: [{language: 'xx', name: 'pl.'}],
            rules: [
                suffixInflection('s', '', ['np'], ['ns']),
                suffixInflection('ies', 'y', ['np'], ['ns']),
            ],
        },
        'past': {
            name: 'past',
            description: 'Past tense',
            rules: [
                suffixInflection('ed', '', ['v'], ['v']),
                // A misleading type: the shape decides.
                {type: 'prefix', isInflected: /ing$/, deinflect: (text) => text.slice(0, -3), conditionsIn: ['v'], conditionsOut: ['v']},
                // A g flag: test() is stateful unless lastIndex is reset.
                {type: 'suffix', isInflected: /d$/g, deinflect: (text) => text.slice(0, -1), conditionsIn: ['v'], conditionsOut: ['v']},
                // A phrasal verb, as English writes them.
                {
                    type: 'other',
                    isInflected: /^\w*ed (?:up|on|off)/,
                    deinflect: (text) => text.replace(/ed(?= (?:up|on|off))/, ''),
                    conditionsIn: ['v'],
                    conditionsOut: ['v_phr'],
                },
            ],
        },
        'comparative': {
            name: 'comparative',
            description: 'Comparative',
            rules: [
                {type: 'suffix', isInflected: /..er$/, deinflected: '', deinflect: (text) => text.slice(0, -2), conditionsIn: ['adj'], conditionsOut: ['adj']},
                {type: 'suffix', isInflected: /.{3}est$/, deinflected: '', deinflect: (text) => text.slice(0, -3), conditionsIn: ['adj'], conditionsOut: ['adj']},
            ],
        },
        'un-': {
            name: 'un-',
            description: 'Negative',
            rules: [prefixInflection('un', '', ['adj', 'v'], ['adj', 'v'])],
        },
        'irregular': {
            name: 'irregular',
            description: 'Irregular past',
            rules: [wholeWordInflection('went', 'go', ['v'], ['v'])],
        },
        'ge-t': {
            name: 'ge-t',
            description: 'Participle',
            rules: [{type: 'other', isInflected: /^ge[a-z]+t$/, deinflect: (text) => text.slice(2, -1) + 'en', conditionsIn: [], conditionsOut: ['v']}],
        },
        'not-n': {
            name: 'not-n',
            description: 'Suffix after anything but n',
            rules: [{type: 'suffix', isInflected: /(?<!n)na$/, deinflect: (text) => text.slice(0, -2), conditionsIn: [], conditionsOut: ['n']}],
        },
        'umlaut': {
            name: 'umlaut',
            description: 'Plural with an umlaut',
            rules: [{
                type: 'suffix',
                isInflected: /er$/,
                deinflected: '',
                deinflect: (text) => {
                    const stem = text.slice(0, -2);
                    const i = stem.lastIndexOf('ä');
                    return i < 0 ? '' : stem.slice(0, i) + 'a' + stem.slice(i + 1);
                },
                conditionsIn: ['np'],
                conditionsOut: ['ns'],
            }],
        },
        'empty': {
            name: 'empty',
            description: 'An empty affix, as Korean has one',
            rules: [suffixInflection('', 'x', [], ['adj'])],
        },
        'shout': {
            name: 'shout',
            description: 'Case-insensitive',
            rules: [{type: 'suffix', isInflected: /ER$/i, deinflect: (text) => text.slice(0, -2), conditionsIn: ['adj'], conditionsOut: ['adj']}],
        },
    },
};
